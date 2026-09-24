# The API image. Build it from the repository root:
#   docker build -f apps/api/Dockerfile -t opentrail-api .
# Keep the Bun version the same as "packageManager" in package.json; a test checks it.

FROM oven/bun:1.4.0-slim AS build
WORKDIR /app
# .dockerignore lets in only package manifests, sources and migrations.
COPY . .
# Production dependencies of the API and the packages it uses, nothing else.
RUN bun install --frozen-lockfile --production --filter @repo/api

# The final image has no shell and no package manager, and doesn't run as root.
FROM oven/bun:1.4.0-distroless
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api
ENV NODE_ENV=production DO_NOT_TRACK=1
USER 65532:65532
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT ?? 3001) + '/v1/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# The entrypoint is bun, so other scripts run the same way, for example the migrations:
#   docker run --rm -e DATABASE_URL=... <image> packages/db/src/migrate.ts
CMD ["apps/api/src/index.ts"]
