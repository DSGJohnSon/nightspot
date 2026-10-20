# NightSpot : un seul processus Node (API, temps réel Socket.IO, front buildé).
# Les données (catalogue, captures, historique) vivent dans un volume monté sur /data.
FROM node:24-bookworm-slim

# ffmpeg + yt-dlp pour l'admin (analyse des clips, captures). yt-dlp a besoin d'un moteur JavaScript
# pour YouTube : on lui indique Node, déjà présent (seul Deno est activé par défaut).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL -o /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
 && chmod a+rx /usr/local/bin/yt-dlp \
 && printf -- '--js-runtimes node\n' > /etc/yt-dlp.conf

RUN npm install -g pnpm@11.5.0

WORKDIR /app

# Dépendances d'abord : cette couche reste en cache tant que les package.json ne changent pas.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3001
EXPOSE 3001

CMD ["pnpm", "start"]
