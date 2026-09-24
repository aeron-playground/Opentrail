#!/usr/bin/env bash
# Runs once, right after the dev container is created (postCreateCommand in devcontainer.json).
set -euo pipefail

# The Dockerfile copies a fixed Bun version. If it drifts from package.json, the lockfile and CI
# disagree with this container, so stop early with a clear message.
expected="$(bun -p 'require("./package.json").packageManager.replace("bun@", "")')"
actual="$(bun --version)"
if [ "$actual" != "$expected" ]; then
  echo "This container has Bun $actual, but package.json asks for Bun $expected." >&2
  echo "Change the Bun image in .devcontainer/Dockerfile, then rebuild the container." >&2
  exit 1
fi

# Also installs the git hooks.
bun install --frozen-lockfile

# The example settings fit this container, where Postgres answers on localhost.
# Files that already exist are kept.
for dir in packages/db apps/api; do
  if [ ! -f "$dir/.env" ]; then
    cp "$dir/.env.example" "$dir/.env"
  fi
done

bun run db:migrate
