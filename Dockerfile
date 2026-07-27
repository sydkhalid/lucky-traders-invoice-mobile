FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8095
ENV SYNC_DATA_DIR=/data/sync-data
ENV SYNC_STORAGE=postgres

COPY server-package.json ./package.json
RUN npm install --omit=dev --package-lock=false
COPY sync-server.js ./

EXPOSE 8095

CMD ["node", "sync-server.js"]
