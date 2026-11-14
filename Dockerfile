ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build \
 && pnpm exec esbuild scripts/migrate.ts --bundle --platform=node --format=esm \
      --target=node24 --outfile=dist/migrate.mjs

FROM node:${NODE_VERSION} AS runtime
# tzdata: due dates are calendar days in Swedish time.
RUN apk add --no-cache tzdata
WORKDIR /app
ARG GIT_SHA=development
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=Europe/Stockholm \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    GIT_SHA=${GIT_SHA}
LABEL org.opencontainers.image.revision=${GIT_SHA} \
      org.opencontainers.image.source=https://github.com/rmstdope/hemmafix

# App files stay root-owned so the server process cannot rewrite its own code;
# only Next's cache directory is writable.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/dist/migrate.mjs ./migrate.mjs
RUN mkdir -p .next/cache && chown node:node .next/cache

USER node
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6 \
  CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1
CMD ["sh", "-c", "node migrate.mjs && exec node server.js"]
