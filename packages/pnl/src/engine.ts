import { mulDiv, parseDecimal, pow10 } from "./math";

// Average-cost profit and loss (ADR 0010). Quantities are raw token units; money is micro-USDC.

export type Position = {
  /** How many raw token units the ledger says the wallet holds. */
  quantity: bigint;
  /** What the tokens still held cost, fees included. */
  costBasis: bigint;
  /** Profit or loss already taken by selling. */
  realized: bigint;
};

export const EMPTY_POSITION: Position = { quantity: 0n, costBasis: 0n, realized: 0n };

/** Thrown when a sell or an outgoing transfer is larger than the position. */
export class InsufficientQuantityError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = "InsufficientQuantityError";
  }
}

function requirePositive(value: bigint, what: string) {
  if (value <= 0n) {
    throw new RangeError(`${what} must be greater than zero.`);
  }
}

function requireNotNegative(value: bigint, what: string) {
  if (value < 0n) {
    throw new RangeError(`${what} can't be negative.`);
  }
}

function requireHeld(position: Position, quantity: bigint) {
  if (quantity > position.quantity) {
    throw new InsufficientQuantityError(
      `The position holds ${position.quantity} units, fewer than the ${quantity} requested.`,
    );
  }
}

/** Buying adds the tokens and everything paid for them, fee included. */
export function applyBuy(
  position: Position,
  { quantity, cost }: { quantity: bigint; cost: bigint },
): Position {
  requirePositive(quantity, "The quantity");
  requireNotNegative(cost, "The cost");
  return {
    ...position,
    quantity: position.quantity + quantity,
    costBasis: position.costBasis + cost,
  };
}

/** Selling realizes what it brought in, after the fee, minus the average cost of what was sold. */
export function applySell(
  position: Position,
  { quantity, proceeds }: { quantity: bigint; proceeds: bigint },
): Position {
  requirePositive(quantity, "The quantity");
  requireNotNegative(proceeds, "The proceeds");
  requireHeld(position, quantity);
  const costOfSold = mulDiv(position.costBasis, quantity, position.quantity);
  return {
    quantity: position.quantity - quantity,
    costBasis: position.costBasis - costOfSold,
    realized: position.realized + proceeds - costOfSold,
  };
}

/** Tokens that arrive count at their value on arrival, so arriving is never a gain or a loss. */
export function applyTransferIn(
  position: Position,
  { quantity, value }: { quantity: bigint; value: bigint },
): Position {
  requirePositive(quantity, "The quantity");
  requireNotNegative(value, "The value");
  return {
    ...position,
    quantity: position.quantity + quantity,
    costBasis: position.costBasis + value,
  };
}

/** Tokens that leave take their share of the cost with them, and realize nothing. */
export function applyTransferOut(position: Position, { quantity }: { quantity: bigint }): Position {
  requirePositive(quantity, "The quantity");
  requireHeld(position, quantity);
  const costOut = mulDiv(position.costBasis, quantity, position.quantity);
  return {
    ...position,
    quantity: position.quantity - quantity,
    costBasis: position.costBasis - costOut,
  };
}

/**
 * What a quantity is worth in micro-USDC at a price in dollars per whole token, given as a
 * decimal string ("0.0000123"). Rounded half up to the nearest micro-USDC.
 */
export function marketValue(quantity: bigint, decimals: number, price: string): bigint {
  requireNotNegative(quantity, "The quantity");
  const { digits, scale } = parseDecimal(price);
  return mulDiv(quantity, digits * 1_000_000n, pow10(decimals + scale));
}

/** The profit or loss on the tokens still held, at the given price. Negative is a loss. */
export function unrealized(position: Position, decimals: number, price: string): bigint {
  return marketValue(position.quantity, decimals, price) - position.costBasis;
}

/** Where an event sits on the chain: by slot, then by position in the block, then signature. */
export type ChainOrder = { slot: number; indexInBlock?: number; signature: string };

export type LedgerEvent = ChainOrder &
  (
    | { kind: "buy"; quantity: bigint; cost: bigint }
    | { kind: "sell"; quantity: bigint; proceeds: bigint }
    | { kind: "transfer_in"; quantity: bigint; value: bigint }
    | { kind: "transfer_out"; quantity: bigint }
  );

export function compareChainOrder(a: ChainOrder, b: ChainOrder): number {
  if (a.slot !== b.slot) {
    return a.slot - b.slot;
  }
  if (
    a.indexInBlock !== undefined &&
    b.indexInBlock !== undefined &&
    a.indexInBlock !== b.indexInBlock
  ) {
    return a.indexInBlock - b.indexInBlock;
  }
  if (a.signature === b.signature) {
    return 0;
  }
  return a.signature < b.signature ? -1 : 1;
}

export function applyEvent(position: Position, event: LedgerEvent): Position {
  switch (event.kind) {
    case "buy":
      return applyBuy(position, event);
    case "sell":
      return applySell(position, event);
    case "transfer_in":
      return applyTransferIn(position, event);
    case "transfer_out":
      return applyTransferOut(position, event);
  }
}

/** Builds a position from scratch: events are applied in chain order, whatever order they came in. */
export function replay(events: readonly LedgerEvent[]): Position {
  return [...events].sort(compareChainOrder).reduce(applyEvent, EMPTY_POSITION);
}
