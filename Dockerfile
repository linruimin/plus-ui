# 构建上下文 = 本目录（见 /www/wwwroot/ruoyi-plus/compose.json 里 frontend.build.context = ./frontend）。
# 依赖层单独缓存：只改源码时无需重新安装依赖，构建时间大幅下降。
FROM node:22-alpine AS build
WORKDIR /app
ENV NODE_OPTIONS="--max-old-space-size=1536"
RUN npm install -g pnpm@10.34.5
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --no-frozen-lockfile
COPY . .
RUN pnpm build:prod

FROM nginx:stable-alpine
COPY --from=build /app/dist /usr/share/nginx/html
# nginx.conf 与本文件同目录，一并纳入仓库管理（2026-10-05 起）。
COPY nginx.conf /etc/nginx/conf.d/default.conf
