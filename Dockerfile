# AMMA webhook server (Fastify, run through tsx).
# Build from the repo root:  docker build -f Dockerfile.server -t amma-server .
FROM node:24-slim

ENV NODE_ENV=production \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    npm_config_update_notifier=false

# pnpm at the version named in package.json ("packageManager"), and tsx at the version in pnpm-lock.yaml.
# tsx is a dev dependency of the workspace root, so it is installed on its own here instead of
# pulling in the root's test tooling (vitest, playwright, typescript).
RUN corepack enable && npm install -g tsx@4.23.15 && npm cache clean --force

WORKDIR /app

# Manifests first, so the dependency layer is reused when only source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY packages/channel-text/package.json packages/channel-text/
COPY packages/engine/package.json packages/engine/
COPY packages/matcher/package.json packages/matcher/
COPY packages/pack-tools/package.json packages/pack-tools/
COPY packages/schema/package.json packages/schema/

# Only the server and the workspace packages it depends on, without dev dependencies.
RUN pnpm install --frozen-lockfile --prod --filter "@amma/server..." \
 && pnpm store prune && rm -rf /root/.cache /root/.local/share/pnpm

# Source of the server and of the packages it imports (the packages export their .ts files directly).
COPY tsconfig.base.json ./
COPY apps/server/src apps/server/src
COPY packages/channel-text/src packages/channel-text/src
COPY packages/engine/src packages/engine/src
COPY packages/matcher/src packages/matcher/src
COPY packages/pack-tools/src packages/pack-tools/src
COPY packages/schema/src packages/schema/src

# Content and language packs. Nothing else from the repo goes in.
COPY packs/content packs/content
COPY packs/lang packs/lang

# The SQLite file lives on a volume, owned by the unprivileged user.
RUN mkdir -p /data && chown node:node /data
VOLUME /data

ENV CONTENT_PACK=/app/packs/content/in-mch \
    LANGUAGE_PACKS=/app/packs/lang/en,/app/packs/lang/hi,/app/packs/lang/mr,/app/packs/lang/fr,/app/packs/lang/sw,/app/packs/lang/ha,/app/packs/lang/wo \
    DATABASE_FILE=/data/amma.sqlite \
    PORT=8080

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/apps/server
CMD ["tsx", "src/main.ts"]
