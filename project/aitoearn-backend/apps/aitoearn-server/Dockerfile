FROM node:24-bookworm-slim AS deps

RUN npm install -g pnpm@10.33.0

WORKDIR /app

COPY deps/ ./

RUN pnpm install --prod

FROM node:24-bookworm-slim AS production

ARG APP_NAME

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ffmpeg \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pm2

WORKDIR /app

COPY assets/ ./
COPY --from=deps /app/ ./

COPY apps/ ./apps/
COPY libs/ ./libs/

ENV NODE_ENV=production
ENV APP_NAME=$APP_NAME

CMD ["sh", "-c", "exec pm2-runtime start apps/${APP_NAME}/src/main.js --name ${APP_NAME} -- -c config.yaml"]
