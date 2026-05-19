# Dockerfile for Web Frontend
# Multi-stage build for production

# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@9.0.0

# Copy workspace configuration files
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/

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
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

# Build shared packages first
RUN pnpm --filter=@svg-builder/shared build

# Build web application for production
RUN pnpm --filter=web build

# Stage 3: Runner (Nginx for serving static files)
FROM nginx:alpine AS runner

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy built files to nginx html directory
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Copy nginx configuration
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Remove default nginx configuration
RUN rm /etc/nginx/conf.d/default.conf 2>/dev/null || true
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
