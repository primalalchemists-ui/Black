# To use this Dockerfile, you have to set `output: 'standalone'` in your next.config.mjs file.
# From https://github.com/vercel/next.js/blob/canary/examples/with-docker/Dockerfile

FROM node:22.17.0-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
COPY scripts/ ./scripts/
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile; \
  else echo "Lockfile not found." && exit 1; \
  fi


# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# DATABASE_URL musi być dostępny jako build arg w Railway (Settings → Variables)
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
# ENV NEXT_TELEMETRY_DISABLED 1

RUN \
  if [ -f yarn.lock ]; then yarn run build; \
  elif [ -f package-lock.json ]; then npm run build; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm run build; \
  else echo "Lockfile not found." && exit 1; \
  fi

# USUNIĘTO: uruchamianie migracji w trakcie budowania obrazu.
#
# Poprzednio było tu `pnpm run migrate:deploy || true`. Dwa problemy:
#   1. Sieć prywatna Railway nie jest dostępna na etapie builda, więc
#      połączenie z bazą i tak nie mogło się udać.
#   2. `|| true` połykało każdy błąd — build wyglądał na udany niezależnie
#      od tego, czy migracje przeszły.
# Efekt: migracje w praktyce nie wykonywały się tą drogą wcale.
#
# Migracje uruchamia teraz komenda Pre-deploy na Railway (patrz niżej:
# migrate.mjs). Pre-deploy startuje po zbudowaniu obrazu, ma sieć prywatną
# i zmienne runtime, a niezerowy kod wyjścia zatrzymuje wdrożenie.

# Spakuj runner migracji do JEDNEGO samowystarczalnego pliku.
#
# Jest to konieczne, bo finalny obraz zawiera tylko output standalone:
# sprawdzone w zbudowanym obrazie — /app/node_modules ma 6 pakietów
# (@aws-sdk, graphql, next, react, sharp, typescript), bez `payload`,
# bez `@payloadcms/*`, bez `pg` i bez katalogu .bin. CLI Payloada nie da się
# tam uruchomić, a `src/migrations/*.ts` nie jest śledzone przez tracing Next,
# bo payload.config.ts tych plików nie importuje.
#
# sharp zostaje zewnętrzny — jest obecny w obrazie runtime.
# Banner z createRequire: bundel jest ESM, a część zależności używa require().
RUN corepack enable pnpm && pnpm exec esbuild scripts/run-migrations.ts \
      --bundle \
      --platform=node \
      --format=esm \
      --target=node22 \
      --outfile=migrate.mjs \
      --tsconfig=tsconfig.json \
      --external:sharp \
      --external:pg-native \
      --banner:js="import{createRequire as __createRequire}from'module';const require=__createRequire(import.meta.url);" \
      --log-level=warning

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
# Uncomment the following line in case you want to disable telemetry during runtime.
# ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Remove this line if you do not have this folder
COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Runner migracji dla komendy Pre-deploy na Railway:
#   node migrate.mjs
# Samowystarczalny — nie wymaga CLI Payloada, node_modules ani TypeScriptu.
COPY --from=builder --chown=nextjs:nodejs /app/migrate.mjs ./migrate.mjs

USER nextjs

EXPOSE 3000

ENV PORT 3000

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/next-config-js/output
CMD HOSTNAME="0.0.0.0" node server.js
