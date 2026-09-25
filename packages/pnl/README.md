# @repo/pnl

Average-cost profit and loss with exact `bigint` math. MIT-licensed, unlike the rest of the
repository (AGPL-3.0-only), so it can be used anywhere.

Quantities are raw token units, and money is micro-USDC (1 USD = `1_000_000n`). Prices are decimal
strings, like `"0.0000123"`. No JavaScript `number` ever holds an amount.

```ts
import { applyBuy, applySell, EMPTY_POSITION, unrealized } from "@repo/pnl";

let position = applyBuy(EMPTY_POSITION, { quantity: 10_000_000n, cost: 5_000_000n });
position = applySell(position, { quantity: 5_000_000n, proceeds: 4_000_000n });
position.realized; // 1_500_000n: $1.50
unrealized(position, 6, "0.70"); // 1_000_000n: $1.00
```

- A buy adds the tokens and everything paid for them, fees included.
- A sale realizes its proceeds minus the average cost of what was sold.
- Tokens that arrive count at their value on arrival; tokens that leave take their share of the cost.
- Selling or sending more than the position holds throws `InsufficientQuantityError`.
- `replay(events)` rebuilds a position in chain order, whatever order the events arrived in.

The method is explained on the docs site under "How it works → How PnL is calculated".
