#!/bin/bash
# Docker startup script for AI SVG Asset Builder
# Usage: ./docker-start.sh [dev|prod|down|clean|logs]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  AI SVG Asset Builder - Docker Setup${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

check_env() {
    if [ ! -f ".env" ]; then
        echo -e "${YELLOW}⚠️  .env file not found!${NC}"
        echo "Creating from .env.docker..."
        cp .env.docker .env
        echo -e "${YELLOW}Please edit .env and set your OPENAI_API_KEY before continuing.${NC}"
        echo ""
        exit 1
    fi
    
    if grep -q "OPENAI_API_KEY=sk-your-api-key-here" .env; then
        echo -e "${RED}❌ OPENAI_API_KEY is not set in .env file!${NC}"
        echo "Please edit .env and set your OpenAI API key."
        echo ""
        exit 1
    fi
}

start_prod() {
    print_header
    check_env
    echo -e "${GREEN}🚀 Starting production environment...${NC}"
    echo ""
    
    docker-compose --env-file .env up -d
    
    echo ""
    echo -e "${GREEN}✅ Services started!${NC}"
    echo ""
    echo "📱 Frontend: http://localhost"
    echo "🔌 API:      http://localhost:4000"
    echo "🗄️  Database: localhost:5432"
    echo ""
    echo "Useful commands:"
    echo "  View logs:    docker-compose logs -f"
    echo "  Stop:         docker-compose down"
    echo "  Clean:        docker-compose down -v"
    echo ""
}

start_dev() {
    print_header
    check_env
    echo -e "${GREEN}🚀 Starting development environment...${NC}"
    echo ""
    
    docker-compose -f docker-compose.dev.yml --env-file .env up -d
    
    echo ""
    echo -e "${GREEN}✅ Development services started!${NC}"
    echo ""
    echo "📱 Frontend: http://localhost:5173"
    echo "🔌 API:      http://localhost:4000"
    echo "🗄️  Database: localhost:5432"
    echo ""
    echo "Useful commands:"
    echo "  View logs:    docker-compose -f docker-compose.dev.yml logs -f"
    echo "  Stop:         docker-compose -f docker-compose.dev.yml down"
    echo "  Clean:        docker-compose -f docker-compose.dev.yml down -v"
    echo ""
}

stop_services() {
    print_header
    echo -e "${YELLOW}🛑 Stopping services...${NC}"
    echo ""
    
    docker-compose --env-file .env down
    docker-compose -f docker-compose.dev.yml --env-file .env down 2>/dev/null || true
    
    echo ""
    echo -e "${GREEN}✅ Services stopped!${NC}"
    echo ""
}

clean_all() {
    print_header
    echo -e "${YELLOW}🧹 Cleaning up all Docker resources...${NC}"
    echo ""
    
    docker-compose --env-file .env down -v
    docker-compose -f docker-compose.dev.yml --env-file .env down -v 2>/dev/null || true
    docker system prune -f
    
    echo ""
    echo -e "${GREEN}✅ Cleanup complete!${NC}"
    echo ""
}

view_logs() {
    print_header
    echo -e "${BLUE}📋 Viewing logs...${NC}"
    echo ""
    
    docker-compose --env-file .env logs -f
}

show_status() {
    print_header
    echo -e "${BLUE}📊 Container Status${NC}"
    echo ""
    
    docker-compose --env-file .env ps
    
    echo ""
    echo -e "${BLUE}📊 Container Health${NC}"
    echo ""
    
    docker-compose --env-file .env ps | grep -E "Name|svg-builder" || echo "No containers running"
}

show_help() {
    print_header
    echo "Usage: ./docker-start.sh [command]"
    echo ""
    echo "Commands:"
    echo "  up, start    Start production environment"
    echo "  dev          Start development environment (with hot reload)"
    echo "  down, stop   Stop all services"
    echo "  clean        Stop services and remove volumes"
    echo "  logs         View service logs"
    echo "  status       Show container status"
    echo "  help         Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./docker-start.sh up"
    echo "  ./docker-start.sh dev"
    echo "  ./docker-start.sh logs"
    echo ""
}

# Main
case "${1:-help}" in
    up|start|prod)
        start_prod
        ;;
    dev|development)
        start_dev
        ;;
    down|stop)
        stop_services
        ;;
    clean|cleanup)
        clean_all
        ;;
    logs)
        view_logs
        ;;
    status|ps)
        show_status
        ;;
    help|*)
        show_help
        ;;
esac
