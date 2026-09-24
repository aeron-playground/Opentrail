# Opentrail

Follow real trades, in the open.

Opentrail is an open-source social trading app on Solana. You sign in with email or a social
account, get a wallet whose keys we never hold, add USDC, and buy and sell a short list of
well-known tokens. You can follow other traders and see their trades as they happen.

> [!WARNING]
> Opentrail is in early development. Nothing here is ready to use with real funds.

## Repository layout

This is a monorepo managed with Bun workspaces and Turborepo.

| Path          | What lives there                                                     |
| ------------- | -------------------------------------------------------------------- |
| `apps/`       | The web app, the API, the indexer and the docs site                  |
| `packages/`   | Shared code: database schema, types, Solana helpers, math, formatting |

The apps and most packages are still being set up.

## Local development

You need [Bun](https://bun.sh) 1.4 or newer.

```bash
bun install
bun run check   # lint, typecheck and tests
```

| Command            | What it does                         |
| ------------------ | ------------------------------------ |
| `bun run dev`      | Start every app in development mode  |
| `bun run build`    | Build every app and package          |
| `bun run check`    | Lint, typecheck and test, as CI does |
| `bun run lint:fix` | Fix lint and formatting problems     |

## License

[AGPL-3.0](LICENSE). If you run a changed version of Opentrail as a service, you must share
your changes under the same license.
