# Keep this Bun version the same as "packageManager" in package.json. post-create.sh checks it.
FROM oven/bun:1.4.0 AS bun

FROM mcr.microsoft.com/devcontainers/base:2.2.1-trixie

# The official Bun binary. bunx is the same program under a second name.
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx
