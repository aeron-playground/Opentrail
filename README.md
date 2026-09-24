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

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/aeron-playground/Opentrail?quickstart=1)

The quickest start: open the repository in GitHub Codespaces with the button above, or in VS Code
with **Dev Containers: Reopen in Container**. Bun, Postgres and the settings are ready, so you can
run `bun run check` and `bun run dev` right away.

On your own machine, you need [Bun](https://bun.sh) 1.4 or newer and
[Docker](https://docs.docker.com/get-docker/).

```bash
bun install
bun run db:up                                  # start Postgres in Docker
cp packages/db/.env.example packages/db/.env
cp apps/api/.env.example apps/api/.env
cp apps/indexer/.env.example apps/indexer/.env
bun run db:migrate
bun run check                                  # lint, typecheck and tests
bun run dev                                    # API on port 3001, indexer on 3002
```

| Command            | What it does                         |
| ------------------ | ------------------------------------ |
| `bun run dev`      | Start every app in development mode  |
| `bun run build`    | Build every app and package          |
| `bun run check`    | Lint, typecheck and test, as CI does |
| `bun run lint:fix` | Fix lint and formatting problems     |
| `bun run openapi`  | Update the API contract and types    |

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before you open a pull request. Every commit must be
signed off (`git commit -s`). Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).
Questions and ideas are welcome in [Discussions](https://github.com/aeron-playground/Opentrail/discussions).
You can follow the work on the [project board](https://github.com/orgs/aeron-playground/projects/1).

## Security

Found a vulnerability? Report it privately, as described in [SECURITY.md](SECURITY.md).
Opentrail never asks for your private key or seed phrase.

## License

[AGPL-3.0](LICENSE). If you run a changed version of Opentrail as a service, you must share
your changes under the same license.
