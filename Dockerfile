FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.25.0 --activate
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile=false
COPY . .
RUN pnpm build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@10.25.0 --activate
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile=false
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY scripts ./scripts
RUN mkdir -p storage/journal storage/archives
EXPOSE 8787
# node:22-alpine ships wget via busybox; -q silences progress, -O- writes to stdout
# so the check exits 0 only when /api/health returns a 2xx body. Orchestrators
# (Docker, Compose, Kubernetes via readinessProbe equivalents) use this to gate
# routing traffic to a still-warming container (DEVOPS-05).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1
CMD ["node", "dist/server/index.js"]
