# Dockerfile for API Backend
# Multi-stage build for production optimization

# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@9.0.0

# Copy workspace configuration files
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/svg-core/package.json packages/svg-core/
COPY packages/ai-core/package.json packages/ai-core/
COPY apps/api/package.json apps/api/
COPY prisma/schema.prisma prisma/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@9.0.0

# Copy all source files
COPY . .

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/svg-core/node_modules ./packages/svg-core/node_modules
COPY --from=deps /app/packages/ai-core/node_modules ./packages/ai-core/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules

# Build shared packages first (in dependency order)
RUN pnpm --filter=@svg-builder/shared build
RUN pnpm --filter=@svg-builder/svg-core build
RUN pnpm --filter=@svg-builder/ai-core build

# Build API application
RUN pnpm --filter=api build

# Stage 3: Runner (Production)
FROM node:20-alpine AS runner
WORKDIR /app

# Install pnpm and prisma CLI globally
RUN npm install -g pnpm@9.0.0 prisma@5.14.0

# Install wget for healthcheck
RUN apk add --no-cache wget

ENV NODE_ENV=production
ENV API_PORT=4000
ENV API_HOST=0.0.0.0

# Copy package files
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/prisma ./prisma

# Copy built packages
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

COPY --from=builder /app/packages/svg-core/package.json ./packages/svg-core/
COPY --from=builder /app/packages/svg-core/dist ./packages/svg-core/dist

COPY --from=builder /app/packages/ai-core/package.json ./packages/ai-core/
COPY --from=builder /app/packages/ai-core/dist ./packages/ai-core/dist

# Copy API application
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Copy production node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/packages/svg-core/node_modules ./packages/svg-core/node_modules
COPY --from=builder /app/packages/ai-core/node_modules ./packages/ai-core/node_modules

# Create storage directory
RUN mkdir -p /app/storage

# Expose API port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:4000/health || exit 1

# Use entrypoint script
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]

# Start the server
CMD ["node", "apps/api/dist/server.js"]
