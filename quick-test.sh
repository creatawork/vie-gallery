#!/bin/bash
# VIE Gallery - Quick Start & Test
# One command to start everything and run tests

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

show_banner() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                                        ║${NC}"
    echo -e "${BLUE}║       VIE Gallery Test Suite          ║${NC}"
    echo -e "${BLUE}║     Quick Start & Full Test            ║${NC}"
    echo -e "${BLUE}║                                        ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
    echo ""
}

show_menu() {
    echo "Please choose an option:"
    echo ""
    echo "  1) Start all services (Docker + Frontend)"
    echo "  2) Run API test suite (curl)"
    echo "  3) Run browser MCP test guide"
    echo "  4) Stop all services"
    echo "  5) View service status"
    echo "  6) Open test documentation"
    echo "  0) Exit"
    echo ""
}

start_services() {
    echo -e "${BLUE}📦 Starting Docker services...${NC}"

    cd infra
    docker-compose up -d

    echo ""
    echo -e "${YELLOW}⏳ Waiting for services to be healthy...${NC}"
    sleep 5

    # Check service health
    echo -n "  MySQL... "
    docker-compose exec -T mysql mysqladmin ping -h localhost -uroot -proot_local --silent && echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}"

    echo -n "  Redis... "
    docker-compose exec -T redis redis-cli ping > /dev/null && echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}"

    echo -n "  MinIO... "
    curl -s -f http://localhost:9000/minio/health/live > /dev/null && echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}"

    echo -n "  API...   "
    sleep 10
    curl -s -f http://localhost:8080/actuator/health > /dev/null && echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}"

    cd ..

    echo ""
    echo -e "${BLUE}🎨 Starting Frontend services...${NC}"
    echo ""

    # Start admin UI in background
    echo "  Starting Admin UI..."
    cd apps/gallery-admin
    npm install --silent > /dev/null 2>&1 || true
    npm run dev > /tmp/vie-admin.log 2>&1 &
    ADMIN_PID=$!
    echo "    PID: $ADMIN_PID"
    echo "    URL: http://localhost:5173"
    cd ../..

    # Start viewer UI in background
    echo "  Starting Viewer UI..."
    cd apps/gallery-viewer
    npm install --silent > /dev/null 2>&1 || true
    npm run dev > /tmp/vie-viewer.log 2>&1 &
    VIEWER_PID=$!
    echo "    PID: $VIEWER_PID"
    echo "    URL: http://localhost:5174"
    cd ../..

    # Save PIDs for later
    echo "$ADMIN_PID" > /tmp/vie-admin.pid
    echo "$VIEWER_PID" > /tmp/vie-viewer.pid

    echo ""
    echo -e "${YELLOW}⏳ Waiting for frontend to start...${NC}"
    sleep 5

    echo ""
    echo -e "${GREEN}✅ All services started!${NC}"
    echo ""
    show_service_urls
}

stop_services() {
    echo -e "${YELLOW}🛑 Stopping services...${NC}"

    # Stop frontend
    if [ -f /tmp/vie-admin.pid ]; then
        ADMIN_PID=$(cat /tmp/vie-admin.pid)
        kill $ADMIN_PID 2>/dev/null && echo "  Stopped Admin UI (PID: $ADMIN_PID)" || true
        rm /tmp/vie-admin.pid
    fi

    if [ -f /tmp/vie-viewer.pid ]; then
        VIEWER_PID=$(cat /tmp/vie-viewer.pid)
        kill $VIEWER_PID 2>/dev/null && echo "  Stopped Viewer UI (PID: $VIEWER_PID)" || true
        rm /tmp/vie-viewer.pid
    fi

    # Stop Docker
    cd infra
    docker-compose down
    cd ..

    echo -e "${GREEN}✅ All services stopped${NC}"
}

show_service_status() {
    echo -e "${BLUE}📊 Service Status${NC}"
    echo "================="
    echo ""

    echo "Backend Services:"
    cd infra
    docker-compose ps
    cd ..

    echo ""
    echo "Frontend Services:"
    if [ -f /tmp/vie-admin.pid ] && kill -0 $(cat /tmp/vie-admin.pid) 2>/dev/null; then
        echo -e "  Admin UI:  ${GREEN}Running${NC} (PID: $(cat /tmp/vie-admin.pid))"
    else
        echo -e "  Admin UI:  ${RED}Not running${NC}"
    fi

    if [ -f /tmp/vie-viewer.pid ] && kill -0 $(cat /tmp/vie-viewer.pid) 2>/dev/null; then
        echo -e "  Viewer UI: ${GREEN}Running${NC} (PID: $(cat /tmp/vie-viewer.pid))"
    else
        echo -e "  Viewer UI: ${RED}Not running${NC}"
    fi

    echo ""
    show_service_urls
}

show_service_urls() {
    echo -e "${BLUE}🔗 Service URLs:${NC}"
    echo "  📱 Admin UI:     http://localhost:5173"
    echo "  🖼️  Viewer UI:    http://localhost:5174"
    echo "  🔌 API:          http://localhost:8080"
    echo "  🗄️  MySQL:        localhost:3306"
    echo "  💾 Redis:        localhost:6379"
    echo "  📦 MinIO:        http://localhost:9000"
    echo "  🎛️  MinIO Console: http://localhost:9001"
    echo ""
}

run_api_tests() {
    echo -e "${BLUE}🧪 Running API Test Suite${NC}"
    echo "=========================="
    echo ""

    if [ ! -f test-mcp-flow.sh ]; then
        echo -e "${RED}Error: test-mcp-flow.sh not found${NC}"
        return 1
    fi

    chmod +x test-mcp-flow.sh
    bash test-mcp-flow.sh
}

run_browser_tests() {
    echo -e "${BLUE}🌐 Browser MCP Test Guide${NC}"
    echo "========================="
    echo ""

    if [ ! -f test-browser-mcp.sh ]; then
        echo -e "${RED}Error: test-browser-mcp.sh not found${NC}"
        return 1
    fi

    chmod +x test-browser-mcp.sh
    bash test-browser-mcp.sh
}

open_docs() {
    echo -e "${BLUE}📖 Opening test documentation...${NC}"

    if [ -f docs/mcp-test-guide.md ]; then
        if command -v xdg-open &> /dev/null; then
            xdg-open docs/mcp-test-guide.md
        elif command -v open &> /dev/null; then
            open docs/mcp-test-guide.md
        else
            echo ""
            cat docs/mcp-test-guide.md
        fi
    else
        echo -e "${RED}Error: docs/mcp-test-guide.md not found${NC}"
    fi
}

# Main script
show_banner

# If no arguments, show interactive menu
if [ $# -eq 0 ]; then
    while true; do
        show_menu
        read -p "Enter your choice: " choice
        echo ""

        case $choice in
            1)
                start_services
                ;;
            2)
                run_api_tests
                ;;
            3)
                run_browser_tests
                ;;
            4)
                stop_services
                ;;
            5)
                show_service_status
                ;;
            6)
                open_docs
                ;;
            0)
                echo "Goodbye!"
                exit 0
                ;;
            *)
                echo -e "${RED}Invalid option${NC}"
                ;;
        esac

        echo ""
        read -p "Press Enter to continue..."
        clear
        show_banner
    done
else
    # Handle command line arguments
    case $1 in
        start|up)
            start_services
            ;;
        stop|down)
            stop_services
            ;;
        test|test-api)
            run_api_tests
            ;;
        test-browser)
            run_browser_tests
            ;;
        status)
            show_service_status
            ;;
        docs)
            open_docs
            ;;
        *)
            echo "Usage: $0 {start|stop|test|test-browser|status|docs}"
            echo ""
            echo "Or run without arguments for interactive menu"
            exit 1
            ;;
    esac
fi
