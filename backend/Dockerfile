FROM node:20-slim

ENV NODE_ENV=production
WORKDIR /usr/src/app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# Cloud Run listens on $PORT (default 8080)
EXPOSE 8080
ENV PORT=8080

CMD ["node", "index.js"]

