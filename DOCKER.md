# Docker Setup for AI SVG Asset Builder

This document provides comprehensive instructions for running the AI SVG Asset Builder using Docker and Docker Compose.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- OpenRouter API Key (get one at https://openrouter.ai/keys)

## Quick Start (Recommended)

We provide a convenient startup script that handles everything:

```bash
# 1. Copy environment file
cp .env.docker .env

# 2. Edit .env and set your OpenRouter API key
# OPENAI_API_KEY=sk-your-actual-api-key

# 3. Start everything
./docker-start.sh up
```

That's it! The application will be available at:
- **Frontend**: http://localhost
- **API**: http://localhost:4000
- **API Health Check**: http://localhost:4000/health

## Manual Setup

If you prefer to run Docker commands manually:

### 1. Environment Configuration

```bash
# Copy the example environment file
cp .env.docker .env

# Edit .env and set your OpenRouter API key
nano .env  # or use your preferred editor
```

Minimum required configuration:
```env
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=google/gemini-3.1-flash-lite
```

### 2. Start Services

#### Production Mode

```bash
# Start all services in detached mode
docker-compose up -d

# Or use the startup script
./docker-start.sh up
```

Services started:
- PostgreSQL database on port 5432
- API backend on port 4000
- Web frontend on port 80

#### Development Mode (with Hot Reload)

```bash
# Start in development mode with source code mounting
docker-compose -f docker-compose.dev.yml up -d

# Or use the startup script
./docker-start.sh dev
```

Services started:
- PostgreSQL database on port 5432
- API backend on port 4000 (with hot reload via tsx)
- Web frontend on port 5173 (with Vite HMR)

### 3. Verify Services

```bash
# Check container status
docker-compose ps

# Or use the startup script
./docker-start.sh status
```

### 4. View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f postgres
docker-compose logs -f web

# Or use the startup script
./docker-start.sh logs
```

### 5. Stop Services

```bash
# Stop all services
docker-compose down

# Or use the startup script
./docker-start.sh down
```

## Docker Startup Script Commands

```bash
./docker-start.sh up       # Start production environment
./docker-start.sh dev      # Start development environment
./docker-start.sh down     # Stop all services
./docker-start.sh clean    # Stop and remove volumes
./docker-start.sh logs     # View service logs
./docker-start.sh status   # Show container status
./docker-start.sh help     # Show help
```

## Database Management

### Access PostgreSQL

```bash
# Access database via Docker
docker-compose exec postgres psql -U svgbuilder -d svg_asset_builder

# Or connect from host (if PostgreSQL port is exposed)
psql postgresql://svgbuilder:svgbuilder_password@localhost:5432/svg_asset_builder
```

### Run Migrations Manually

```bash
# Apply pending migrations
docker-compose exec api npx prisma migrate deploy --schema=prisma/schema.prisma

# Generate Prisma client
docker-compose exec api npx prisma generate --schema=prisma/schema.prisma
```

### Reset Database

```bash
# Stop and remove volume (WARNING: This deletes all data!)
docker-compose down -v
docker-compose up -d
```

## Troubleshooting

### Port Conflicts

If you see errors like "port is already allocated":

```bash
# Check what's using the port
lsof -i :5432  # PostgreSQL
lsof -i :4000  # API
lsof -i :80    # Web

# Change ports in .env
POSTGRES_PORT=5433
API_PORT=4001

# Restart with new ports
docker-compose up -d
```

### Container Won't Start

```bash
# Check logs for errors
docker-compose logs <service-name>

# Common issues:
# 1. OPENAI_API_KEY not set (use OpenRouter API key)
# 2. PostgreSQL not ready (check health status)
# 3. Port conflicts
```

### Rebuild Containers

After code changes or dependency updates:

```bash
# Rebuild and restart
docker-compose up -d --build

# Or force rebuild without cache
docker-compose build --no-cache
docker-compose up -d
```

### Clean Everything

```bash
# Remove containers, volumes, and images
./docker-start.sh clean

# Or manually:
docker-compose down -v
docker system prune -f
```

### Permission Issues (Linux/Mac)

```bash
# Fix storage permissions
sudo chown -R $USER:$USER storage/
docker-compose exec api chown -R node:node /app/storage
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenRouter API Key (required) | - |
| `OPENAI_BASE_URL` | LLM API Base URL | https://openrouter.ai/api/v1 |
| `OPENAI_MODEL` | LLM Model | google/gemini-3.1-flash-lite |
| `POSTGRES_USER` | PostgreSQL username | svgbuilder |
| `POSTGRES_PASSWORD` | PostgreSQL password | svgbuilder_password |
| `POSTGRES_DB` | PostgreSQL database name | svg_asset_builder |
| `POSTGRES_PORT` | PostgreSQL port (host) | 5432 |
| `DATABASE_URL` | Database connection string | Auto-generated |
| `API_PORT` | API server port (host) | 4000 |
| `API_HOST` | API bind host | 0.0.0.0 |
| `STORAGE_DRIVER` | Storage driver (local/s3) | local |
| `LOCAL_STORAGE_DIR` | Local storage path | /app/storage |
| `VITE_API_BASE_URL` | Frontend API URL | http://localhost:4000 |

### Docker Compose Files

- **docker-compose.yml**: Production setup with optimized builds
- **docker-compose.dev.yml**: Development setup with hot reload and volume mounting

### Persistent Data

The following data persists across container restarts:

- **PostgreSQL data**: Stored in Docker volume `postgres_data`
- **API storage**: Stored in Docker volume `api_storage` (SVGs, PNGs, ZIPs)

## Architecture

```
┌─────────────────────────────────────┐
│         Docker Network              │
│   (svg-builder-network)             │
│                                     │
│  ┌──────────────┐  ┌─────────────┐ │
│  │     Web      │  │     API     │ │
│  │   (Nginx)    │──│  (Fastify)  │ │
│  │   Port: 80   │  │  Port: 4000 │ │
│  └──────────────┘  └──────┬──────┘ │
│                           │        │
│                    ┌──────┴──────┐ │
│                    │  PostgreSQL │ │
│                    │   Port:     │ │
│                    │   5432      │ │
│                    └─────────────┘ │
└─────────────────────────────────────┘
```

## Services

### PostgreSQL
- **Image**: postgres:16-alpine
- **Database**: svg_asset_builder
- **User**: svgbuilder
- **Volume**: postgres_data
- **Health Check**: pg_isready

### API
- **Build Context**: Root directory
- **Dockerfile**: apps/api/Dockerfile
- **Port**: 4000
- **Dependencies**: PostgreSQL
- **Features**:
  - Automatic database migrations on startup
  - Health checks via /health endpoint
  - Persistent storage for generated assets
  - Retry logic for database connections

### Web
- **Build Context**: Root directory
- **Dockerfile**: apps/web/Dockerfile
- **Port**: 80
- **Dependencies**: API
- **Features**:
  - Nginx serving optimized static files
  - API proxy configuration
  - Gzip compression
  - Client-side routing support

## Development Workflow

### Making Code Changes

For development with hot reload:

```bash
# Start in dev mode
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f api

# Make code changes - they will be reflected immediately
# API: http://localhost:4000
# Web: http://localhost:5173
```

### Adding Dependencies

```bash
# Add to shared package
docker-compose -f docker-compose.dev.yml exec web pnpm add <package> --filter=@svg-builder/shared

# Add to API
docker-compose -f docker-compose.dev.yml exec api pnpm add <package> --filter=api

# Add to Web
docker-compose -f docker-compose.dev.yml exec web pnpm add <package> --filter=web

# Restart services
docker-compose -f docker-compose.dev.yml restart
```

### Database Schema Changes

```bash
# Create a new migration
docker-compose -f docker-compose.dev.yml exec api npx prisma migrate dev --schema=prisma/schema.prisma --name your_migration_name

# Generate client
docker-compose -f docker-compose.dev.yml exec api npx prisma generate --schema=prisma/schema.prisma
```

## Production Deployment

### Pre-deployment Checklist

- [ ] Set strong PostgreSQL password
  - [ ] Set production OpenRouter API key
- [ ] Configure proper `VITE_API_BASE_URL` with domain
- [ ] Use reverse proxy (nginx, traefik) with SSL
- [ ] Set up log aggregation
- [ ] Configure backups for PostgreSQL volume
- [ ] Set resource limits in docker-compose.yml

### Example Production .env

```env
OPENAI_API_KEY=sk-your-production-key
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=google/gemini-3.1-flash-lite
POSTGRES_USER=svgbuilder
POSTGRES_PASSWORD=your-secure-random-password
POSTGRES_DB=svg_asset_builder
DATABASE_URL=postgresql://svgbuilder:your-secure-password@postgres:5432/svg_asset_builder
STORAGE_DRIVER=local
API_PORT=4000
API_HOST=0.0.0.0
VITE_API_BASE_URL=https://your-domain.com/api
```

### SSL with Traefik

```yaml
# Example docker-compose override for Traefik
version: "3.8"

services:
  web:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.web.rule=Host(`your-domain.com`)"
      - "traefik.http.routers.web.tls.certresolver=letsencrypt"
      - "traefik.http.services.web.loadbalancer.server.port=80"

  api:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.rule=Host(`api.your-domain.com`)"
      - "traefik.http.routers.api.tls.certresolver=letsencrypt"
      - "traefik.http.services.api.loadbalancer.server.port=4000"
```

## Useful Commands

```bash
# Enter a running container
docker-compose exec api sh
docker-compose exec postgres sh
docker-compose exec web sh

# Run database backup
docker-compose exec postgres pg_dump -U svgbuilder svg_asset_builder > backup.sql

# Restore database
cat backup.sql | docker-compose exec -T postgres psql -U svgbuilder -d svg_asset_builder

# View container stats
docker stats

# Inspect a container
docker-compose exec api env

# Restart a single service
docker-compose restart api
```

## Support

For issues or questions:
1. Check the logs: `docker-compose logs -f`
2. Verify environment: `docker-compose exec api env`
3. Test database connection: `docker-compose exec postgres pg_isready`
4. Check service health: `docker-compose ps`
