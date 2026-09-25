# @repo/format

Formats money, token amounts, prices, percentages, times and addresses the same way everywhere.
MIT-licensed, unlike the rest of the repository (AGPL-3.0-only), so it can be used anywhere.

Inputs are exact: money is micro-USDC as `bigint` (1 USD = `1_000_000n`), token amounts are raw
units with their decimals, and prices are decimal strings. `Intl.NumberFormat` receives exact
decimal strings, so no digit is lost on the way to the screen. Every function takes the reader's
locale.

```ts
import { formatPnl, formatPrice, formatTokenAmount, formatUsd } from "@repo/format";

formatUsd(12_345_670_000n); // "$12,345.67"
formatUsd(1_200_000_000_000n); // "$1.2M" (compact from $100K)
formatPnl(42_100_000n, 1_315_630_000n); // "+$42.10 (+3.2%)"
formatTokenAmount(123_450_000n, 5, { symbol: "BONK" }); // "1,234.5 BONK"
formatPrice("0.0000123"); // "$0.0₄123"
```

| Function | Rule | Example |
| --- | --- | --- |
| `formatUsd` | 2 decimals and separators; compact from $100K; `signed` adds + to gains | `$12,345.67`, `$1.2M`, `+$42.10` |
| `formatPnl` | Signed money and its percent of the cost | `+$42.10 (+3.2%)` |
| `formatPercent` | A ratio as a signed percent with 2 decimals | `+4.21%`, `−0.87%` |
| `formatPrice` | $1 and up: 2 decimals; below: 4 significant digits; 4+ zeros are counted | `$142.35`, `$0.4521`, `$0.0₄123` |
| `formatTokenAmount` | Up to 6 significant digits, whole units kept | `1,234.5 BONK` |
| `formatTokenAmountExact` | Every digit, for a tooltip | `1,234.56789 BONK` |
| `formatRelativeTime` | Feed times | `now`, `2m`, `3h`, `Sep 12` |
| `formatExactTime` | Date and time, for a tooltip | `Sep 12, 2026, 2:03 PM` |
| `shortAddress` | First 4 and last 4 characters | `7xKX…gAsU` |

Negative numbers use the real minus sign (−), not a hyphen.
