# Contributing to Opentrail

Thanks for helping. This page explains how to set up the repo, how we name things, and what a
pull request needs before it can merge.

By taking part, you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).
Found a security problem? Don't open an issue. Follow [SECURITY.md](SECURITY.md) instead.
Have a question or an early idea? Start a thread in
[Discussions](https://github.com/aeron-playground/Opentrail/discussions).

## Before you start

- For anything bigger than a small fix, open an issue first so we can agree on the approach.
- Keep one change per pull request. Small pull requests (under about 400 changed lines) get
  reviewed faster.

## Set up

You need [Bun](https://bun.sh) 1.4 or newer, git, and [Docker](https://docs.docker.com/get-docker/)
for the local database.

```bash
git clone https://github.com/aeron-playground/Opentrail.git
cd Opentrail
bun install                                        # also installs the git hooks
bun run db:up                                      # start Postgres in Docker
cp packages/db/.env.example packages/db/.env
bun run db:migrate
bun run check                                      # lint, typecheck and tests
```

| Command               | What it does                                 |
| --------------------- | -------------------------------------------- |
| `bun run dev`         | Start every app in development mode          |
| `bun run build`       | Build every app and package                  |
| `bun run check`       | Lint, typecheck and test, as CI does         |
| `bun run lint:fix`    | Fix lint and formatting problems             |
| `bun run db:up`       | Start the local database                     |
| `bun run db:down`     | Stop it (your data stays)                    |
| `bun run db:generate` | Create a migration after a schema change     |
| `bun run db:migrate`  | Apply migrations to your local database      |

Tests use a separate database, `app_test`, and wipe it on every run. They refuse to touch any
database whose name doesn't end in `_test`.

## Branches

Never commit to `main`. Create a branch named `<type>/<scope>-<short-name>`, for example
`feat/api-swap-quote` or `fix/web-deposit-qr`.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org): `type(scope): summary`.
The summary is lowercase and imperative, and the whole line is at most 72 characters.

```text
feat(api): add swap quote endpoint
fix(web): show the right balance after a deposit
```

| Types | `feat` `fix` `perf` `refactor` `test` `docs` `chore` `ci` `build` `revert` |
| --- | --- |
| **Scopes** | `web` `api` `indexer` `docs` `db` `shared` `solana` `pnl` `format` `api-client` `ci` `deps` `repo` `release` |

A git hook checks every commit message. CI checks the pull request title the same way, because
we squash-merge and the title becomes the commit on `main`.

## Sign off your commits (DCO)

Every commit needs a `Signed-off-by` line with your name and the same email as the commit author:

```text
Signed-off-by: Ada Lovelace <ada@example.com>
```

It means you agree to the [Developer Certificate of Origin](https://developercertificate.org):
you wrote the change, or you have the right to submit it under this project's license.
Git adds the line for you:

```bash
git commit -s -m "fix(web): show the right balance after a deposit"
```

Forgot? Add a sign-off to every commit on your branch, then update the pull request:

```bash
git rebase --signoff origin/main
git push --force-with-lease
```

The `dco` check in CI fails when any commit in a pull request isn't signed off.

## Pull requests

1. Run `bun run check` and fix everything. Don't skip or silence tests or lint rules.
2. Fill in the pull request template and link the issue (`Closes #12`).
3. UI changes need screenshots: light and dark theme, phone and desktop.
4. Update docs when you change something users or developers see.

These checks must pass before a pull request can merge: `lint`, `typecheck`, `test`, `build`,
`dco`, `dependency-review` and `pr-title`.

Labels are added for you: `area:*` from the folders you change, and the type from your branch
prefix (`feat/` → `feature`, `fix/` → `bug`, `docs/` → `docs`, `chore/`, `refactor/`, `test/` → `chore`).

## Releases

Releases are automatic. A bot keeps one release pull request open with the next version and the
changelog, both built from the commit messages on `main`. Merging it tags the version and
publishes a [GitHub Release](https://github.com/aeron-playground/Opentrail/releases).

- Don't edit `CHANGELOG.md` or version numbers by hand.
- Until the public launch, versions stay on `0.0.x` and are marked as pre-releases.
- `feat` and `fix` commits appear in the changelog, so write their summaries for users.

## Ground rules

### Money and safety

- Never use a JavaScript `number` for token amounts or money. Use `bigint`: raw token units, and
  micro-USDC for USD (1 USD = `1_000_000n`). In JSON, these values are strings.
- Never write code that asks for, stores or logs a private key or seed phrase.
- The server gets a user's wallet address from the auth provider, never from the request.
- Validate every input and every response from an outside service with zod.
- Read environment variables only in each app's `env.ts`. Anything that starts with `VITE_`
  ships to browsers, so never put a secret there.
- Never log tokens, keys, full transaction bytes, emails or IP addresses.
- Changes to fee, transaction, signing or submission code need tests and a clear explanation in
  the pull request.

### Code

- TypeScript strict mode, ESM, named exports. No `any`: use `unknown` and zod.
- File and folder names in kebab-case. React components in PascalCase.
- Comments explain *why*, not *what*.
- `/v1` of the API is a public contract: only additive changes.

### Database

- The schema lives in `packages/db/src/schema/`. After a change, run `bun run db:generate` and
  commit the new migration. CI fails when a schema change has no migration.
- Never edit a migration after it is merged. Write a new one.
- Migrations must be backward-compatible: add first, move data, remove in a later pull request.
- Each table has one app that writes to it, noted at the top of its schema file.

### Tests

- Tests sit next to the code as `*.test.ts` and run with `bun test`.
- A bug fix needs a test that fails without the fix.
- Tests never call real networks or paid APIs.

## License

Opentrail is licensed under [AGPL-3.0](LICENSE). By contributing, you agree that your
contributions are licensed under the same terms.
