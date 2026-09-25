# CEO Summit Platform — production image.
# Same image serves both the Next.js app and the standalone Socket.io
# server (server/socket-server.ts) — docker-compose.prod.yml just runs a
# different `command:` against each. Debian slim (not Alpine): Prisma's
# query engine and `sharp` are both far less fragile against glibc than
# musl, and the extra image size doesn't matter at this project's scale.
FROM node:20-bookworm-slim AS base
WORKDIR /app
# openssl: required at runtime by Prisma's query engine on Debian.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* vars are inlined into the browser bundle at `next build` time,
# but .env is excluded from the Docker build context (.dockerignore) — so it
# must come in as a build ARG instead, or the client falls back to the
# hardcoded localhost default from lib/socket-client.ts in every deployment.
ARG NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
# /demande-acces reads Referential rows via Prisma and is deliberately built
# as ISR (see app/demande-acces/page.tsx), so `next build` prerenders it once
# at image-build time — it needs a reachable, migrated Postgres right here,
# not just this connection string. The caller must build with `--network`
# pointed at a compose network where that Postgres is already up.
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
# 25 septembre 2026 (audit MVP) — le runner tournait en root : toute RCE
# dans l'app (ou une dépendance) donnait root dans le conteneur. On passe
# sur l'utilisateur `node` (uid 1000) fourni par l'image officielle. /app
# lui appartient entièrement : `next start` réécrit .next/ (ISR de
# /demande-acces, cache fetch) et lib/r2.ts écrit dans .local-storage/ —
# lequel est un bind mount (docker-compose.prod.yml) dont le dossier hôte
# doit lui aussi appartenir à l'uid 1000, voir DEPLOY.md §6/§10.
# DATABASE_URL (ARG/ENV du stage builder ci-dessus) n'arrive pas jusqu'ici :
# ce stage repart de `base`, pas de `builder`, et seul /app est copié.
COPY --from=builder --chown=node:node /app ./
RUN mkdir -p /app/.local-storage && chown node:node /app /app/.local-storage
USER node
EXPOSE 3000 3001
CMD ["npm", "run", "start"]
