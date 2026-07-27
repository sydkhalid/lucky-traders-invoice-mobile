FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8095
ENV SYNC_DATA_DIR=/data/sync-data
ENV SYNC_STORAGE=postgres
ENV SYNC_REQUIRE_POSTGRES=true

COPY server-package.json ./package.json
RUN npm install --omit=dev --package-lock=false
COPY sync-server.js ./
COPY sync-data/sync-db.json ./sync-data/sync-db.json
COPY sync-data/files ./sync-data/files

EXPOSE 8095

CMD ["node", "sync-server.js"]
