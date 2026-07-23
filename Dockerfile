FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8095
ENV SYNC_DATA_DIR=/data/sync-data

COPY sync-server.js ./

EXPOSE 8095

CMD ["node", "sync-server.js"]
