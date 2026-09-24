# The indexer image. Build it from the repository root:
#   docker build -f apps/indexer/Dockerfile -t opentrail-indexer .
# Keep the Bun version the same as "packageManager" in package.json; a test checks it.

FROM oven/bun:1.4.0-slim AS build
WORKDIR /app
# .dockerignore lets in only package manifests, sources and migrations.
COPY . .
# Production dependencies of the indexer and the packages it uses, nothing else.
RUN bun install --frozen-lockfile --production --filter @repo/indexer

# The final image has no shell and no package manager, and doesn't run as root.
FROM oven/bun:1.4.0-distroless
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/indexer ./apps/indexer
ENV NODE_ENV=production DO_NOT_TRACK=1
USER 65532:65532
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT ?? 3002) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["apps/indexer/src/index.ts"]
