# ═══════════════════════════════════════════════════════════
# PipeFX Cloud-API — Multi-Stage Docker Build
# Deploy on Railway via: railway up
# ═══════════════════════════════════════════════════════════

# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm nx build @pipefx/cloud-api --configuration=production

# Stage 2: Runtime
FROM node:20-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy built output and workspace module deps
COPY --from=builder /app/apps/cloud-api/dist ./dist
COPY --from=builder /app/apps/cloud-api/package.json ./package.json
COPY --from=builder /app/packages/providers/dist ./node_modules/@pipefx/providers/dist
COPY --from=builder /app/packages/providers/package.json ./node_modules/@pipefx/providers/package.json
COPY --from=builder /app/packages/usage/dist ./node_modules/@pipefx/usage/dist
COPY --from=builder /app/packages/usage/package.json ./node_modules/@pipefx/usage/package.json

# Install production deps only
RUN pnpm install --prod --ignore-scripts

EXPOSE 3002
ENV PORT=3002
CMD ["node", "dist/main.js"]
