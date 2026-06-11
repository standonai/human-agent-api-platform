# Build stage
FROM node:20-alpine AS builder

WORKDIR /repo

COPY . .
RUN npm ci && npm run build

# Runtime stage
FROM node:20-alpine

WORKDIR /repo

COPY package.json package-lock.json ./
COPY packages/agent-errors/package.json packages/agent-errors/package.json
COPY packages/agent-dry-run/package.json packages/agent-dry-run/package.json
COPY packages/agent-metrics/package.json packages/agent-metrics/package.json
COPY apps/reference/package.json apps/reference/package.json
RUN npm ci --omit=dev --ignore-scripts && npm rebuild better-sqlite3 && npm cache clean --force

COPY --from=builder /repo/packages/agent-errors/dist packages/agent-errors/dist
COPY --from=builder /repo/packages/agent-errors/spectral.yaml packages/agent-errors/spectral.yaml
COPY --from=builder /repo/packages/agent-dry-run/dist packages/agent-dry-run/dist
COPY --from=builder /repo/packages/agent-metrics/dist packages/agent-metrics/dist
COPY --from=builder /repo/apps/reference/dist apps/reference/dist
COPY apps/reference/public apps/reference/public
COPY apps/reference/specs apps/reference/specs

RUN adduser -D -u 1001 appuser && mkdir -p apps/reference/data && chown -R appuser /repo/apps/reference/data
USER 1001

WORKDIR /repo/apps/reference

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "dist/server.js"]
