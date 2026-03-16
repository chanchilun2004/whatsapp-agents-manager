FROM node:20-slim

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY server/ ./server/
COPY client/ ./client/

RUN mkdir -p /data

ENV PORT=3000
ENV APP_DB_PATH=/data/app.db

EXPOSE 3000

CMD ["node", "server/index.js"]
