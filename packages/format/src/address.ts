/** A wallet address or signature, shortened for lists: the first 4 and last 4 characters. */
export function shortAddress(address: string): string {
  return address.length <= 10 ? address : `${address.slice(0, 4)}…${address.slice(-4)}`;
}
