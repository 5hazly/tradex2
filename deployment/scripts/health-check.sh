#!/bin/bash
# =============================================================================
# TradeAI Pro - Health Check Script
# =============================================================================
# Usage: ./health-check.sh [--watch | --json | --silent]
#
# This script checks the health of all services:
#   1. Docker containers are running
#   2. PostgreSQL connectivity
#   3. Redis connectivity
#   4. Backend API response
#   5. Frontend response
#   6. WebSocket connection
#   7. Disk space & memory usage
#
# Exit codes:
#   0 - All checks passed
#   1 - One or more checks failed
#
# Schedule with cron for automated monitoring:
#   */5 * * * * /path/to/deployment/scripts/health-check.sh --silent >> /var/log/health-check.log 2>&1
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOYMENT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${DEPLOYMENT_DIR}/docker-compose.yml"
ENV_FILE="${DEPLOYMENT_DIR}/.env"

# Service endpoints
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
BACKEND_URL="${BACKEND_URL:-http://localhost:8000}"
WS_URL="${WS_URL:-ws://localhost:3004}"
API_HEALTH_URL="${BACKEND_URL}/api/v1/health"

# Thresholds
DISK_WARNING_PERCENT=80
DISK_CRITICAL_PERCENT=90
MEMORY_WARNING_PERCENT=80
MEMORY_CRITICAL_PERCENT=90

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNINGS=0
ERRORS=()
JSON_OUTPUT="{}"

# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------

log() {
    if [ "${1:-}" != "--silent" ]; then
        echo -e "$1"
    fi
}

check_pass() {
    local name="$1"
    local detail="${2:-}"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
    log "  ${GREEN}[PASS]${NC} ${BOLD}${name}${NC}${detail:+ — ${detail}}"
}

check_fail() {
    local name="$1"
    local detail="${2:-}"
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
    ERRORS+=("${name}: ${detail}")
    log "  ${RED}[FAIL]${NC} ${BOLD}${name}${NC}${detail:+ — ${detail}}"
}

check_warn() {
    local name="$1"
    local detail="${2:-}"
    WARNINGS=$((WARNINGS + 1))
    log "  ${YELLOW}[WARN]${NC} ${BOLD}${name}${NC}${detail:+ — ${detail}}"
}

print_header() {
    log ""
    log "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
    log "${CYAN}║          TradeAI Pro - System Health Check                      ║${NC}"
    log "${CYAN}║          $(date '+%Y-%m-%d %H:%M:%S')                               ║${NC}"
    log "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
    log ""
}

print_section() {
    log "${BOLD}${BLUE}▶ $1${NC}"
    log ""
}

print_summary() {
    log ""
    log "${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
    log ""

    if [ "$FAILED_CHECKS" -eq 0 ]; then
        log "  ${GREEN}${BOLD}✓ All ${TOTAL_CHECKS} checks passed${NC} (${WARNINGS} warnings)"
    else
        log "  ${RED}${BOLD}✗ ${FAILED_CHECKS}/${TOTAL_CHECKS} checks failed${NC} (${PASSED_CHECKS} passed, ${WARNINGS} warnings)"
        log ""
        for error in "${ERRORS[@]}"; do
            log "    ${RED}• ${error}${NC}"
        done
    fi

    log ""
    log "${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
    log ""
}

# ---------------------------------------------------------------------------
# Health Checks
# ---------------------------------------------------------------------------

check_docker() {
    print_section "Docker Containers"

    # Check Docker daemon
    if docker info >/dev/null 2>&1; then
        check_pass "Docker Daemon" "running"
    else
        check_fail "Docker Daemon" "not running"
        return 1
    fi

    # Check each service container
    local services=("frontend" "backend" "postgres" "redis" "nginx")

    for service in "${services[@]}"; do
        local status
        status=$(docker compose -f "$COMPOSE_FILE" ps "$service" --format json 2>/dev/null | head -1)

        if echo "$status" | grep -q '"running"' 2>/dev/null; then
            local uptime
            uptime=$(docker compose -f "$COMPOSE_FILE" ps "$service" --format "{{.State}}" 2>/dev/null || echo "unknown")
            check_pass "$service" "running ($uptime)"
        else
            check_fail "$service" "not running"
        fi
    done
}

check_postgres() {
    print_section "PostgreSQL Database"

    # Check container is running
    local pg_running
    pg_running=$(docker compose -f "$COMPOSE_FILE" ps postgres --format json 2>/dev/null | grep -c '"running"' || echo "0")

    if [ "$pg_running" -eq 0 ]; then
        check_fail "PostgreSQL" "container not running"
        return 1
    fi

    # Check connectivity
    local pg_result
    pg_result=$(docker compose -f "$COMPOSE_FILE" exec -T postgres \
        pg_isready -U "${POSTGRES_USER:-trading_user}" -d "${POSTGRES_DB:-tradeai_pro}" 2>&1) || true

    if echo "$pg_result" | grep -q "accepting connections"; then
        check_pass "PostgreSQL" "accepting connections"

        # Check database size
        local db_size
        db_size=$(docker compose -f "$COMPOSE_FILE" exec -T postgres \
            psql -U "${POSTGRES_USER:-trading_user}" -d "${POSTGRES_DB:-tradeai_pro}" -t -c \
            "SELECT pg_size_pretty(pg_database_size('${POSTGRES_DB:-tradeai_pro}'));" 2>/dev/null | xargs || echo "unknown")
        check_pass "Database Size" "$db_size"

        # Check active connections
        local active_conns
        active_conns=$(docker compose -f "$COMPOSE_FILE" exec -T postgres \
            psql -U "${POSTGRES_USER:-trading_user}" -d "${POSTGRES_DB:-tradeai_pro}" -t -c \
            "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';" 2>/dev/null | xargs || echo "unknown")
        check_pass "Active Connections" "$active_conns"

    else
        check_fail "PostgreSQL" "$pg_result"
    fi
}

check_redis() {
    print_section "Redis Cache"

    # Check container
    local redis_running
    redis_running=$(docker compose -f "$COMPOSE_FILE" ps redis --format json 2>/dev/null | grep -c '"running"' || echo "0")

    if [ "$redis_running" -eq 0 ]; then
        check_fail "Redis" "container not running"
        return 1
    fi

    # Check connectivity
    local redis_result
    redis_result=$(docker compose -f "$COMPOSE_FILE" exec -T redis \
        redis-cli -a "${REDIS_PASSWORD:-changeme}" --no-auth-warning ping 2>&1) || true

    if echo "$redis_result" | grep -q "PONG"; then
        check_pass "Redis" "PONG"

        # Check memory usage
        local redis_memory
        redis_memory=$(docker compose -f "$COMPOSE_FILE" exec -T redis \
            redis-cli -a "${REDIS_PASSWORD:-changeme}" --no-auth-warning INFO memory 2>/dev/null | \
            grep "used_memory_human:" | cut -d: -f2 | tr -d '\r' || echo "unknown")
        check_pass "Redis Memory" "$redis_memory"

        # Check key count
        local redis_keys
        redis_keys=$(docker compose -f "$COMPOSE_FILE" exec -T redis \
            redis-cli -a "${REDIS_PASSWORD:-changeme}" --no-auth-warning DBSIZE 2>/dev/null | \
            grep -o '[0-9]*' || echo "unknown")
        check_pass "Redis Keys" "$redis_keys"

    else
        check_fail "Redis" "$redis_result"
    fi
}

check_backend_api() {
    print_section "Backend API"

    # Check health endpoint
    local http_code
    http_code=$(curl -sf -o /dev/null -w "%{http_code}" "${API_HEALTH_URL}" --max-time 10 2>/dev/null) || http_code="000"

    if [ "$http_code" = "200" ]; then
        check_pass "API Health Endpoint" "HTTP 200"

        # Check response time
        local response_time
        response_time=$(curl -sf -o /dev/null -w "%{time_total}" "${API_HEALTH_URL}" --max-time 10 2>/dev/null || echo "0")
        local response_ms
        response_ms=$(echo "$response_time * 1000" | bc 2>/dev/null || echo "0")
        response_ms=$(printf "%.0f" "$response_ms")

        if [ "$response_ms" -lt 500 ]; then
            check_pass "API Response Time" "${response_ms}ms"
        elif [ "$response_ms" -lt 2000 ]; then
            check_warn "API Response Time" "${response_ms}ms (slow)"
        else
            check_fail "API Response Time" "${response_ms}ms (too slow)"
        fi

        # Check API endpoints
        local endpoints=("/api/v1/health" "/api/v1/exchanges" "/api/v1/strategies")
        for endpoint in "${endpoints[@]}"; do
            local ep_code
            ep_code=$(curl -sf -o /dev/null -w "%{http_code}" "${BACKEND_URL}${endpoint}" --max-time 10 2>/dev/null) || ep_code="000"

            if [ "$ep_code" = "200" ] || [ "$ep_code" = "401" ]; then
                check_pass "Endpoint ${endpoint}" "HTTP ${ep_code}"
            else
                check_fail "Endpoint ${endpoint}" "HTTP ${ep_code}"
            fi
        done

    else
        check_fail "API Health Endpoint" "HTTP ${http_code}"
    fi
}

check_frontend() {
    print_section "Frontend"

    local http_code
    http_code=$(curl -sf -o /dev/null -w "%{http_code}" "${FRONTEND_URL}" --max-time 10 2>/dev/null) || http_code="000"

    if [ "$http_code" = "200" ]; then
        check_pass "Frontend" "HTTP 200"

        # Check response time
        local response_time
        response_time=$(curl -sf -o /dev/null -w "%{time_total}" "${FRONTEND_URL}" --max-time 10 2>/dev/null || echo "0")
        local response_ms
        response_ms=$(echo "$response_time * 1000" | bc 2>/dev/null || echo "0")
        response_ms=$(printf "%.0f" "$response_ms")

        if [ "$response_ms" -lt 1000 ]; then
            check_pass "Frontend Response Time" "${response_ms}ms"
        elif [ "$response_ms" -lt 3000 ]; then
            check_warn "Frontend Response Time" "${response_ms}ms (slow)"
        else
            check_fail "Frontend Response Time" "${response_ms}ms (too slow)"
        fi
    else
        check_fail "Frontend" "HTTP ${http_code}"
    fi
}

check_websocket() {
    print_section "WebSocket"

    # Check if WebSocket port is reachable
    if command -v curl >/dev/null 2>&1; then
        local ws_result
        ws_result=$(curl -sf -o /dev/null -w "%{http_code}" \
            -H "Upgrade: websocket" \
            -H "Connection: Upgrade" \
            -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
            -H "Sec-WebSocket-Version: 13" \
            "${WS_URL}" --max-time 5 2>/dev/null) || ws_result="000"

        if [ "$ws_result" != "000" ]; then
            check_pass "WebSocket Server" "reachable on port ${WS_URL##*:}"
        else
            check_warn "WebSocket Server" "not reachable (may be expected if mini-service not running)"
        fi
    else
        check_warn "WebSocket" "curl not available for WebSocket check"
    fi
}

check_system() {
    print_section "System Resources"

    # Check disk space
    local disk_usage
    disk_usage=$(df -h / | awk 'NR==2 {print $5}' | tr -d '%')

    if [ -n "$disk_usage" ]; then
        if [ "$disk_usage" -lt "$DISK_WARNING_PERCENT" ]; then
            local disk_info
            disk_info=$(df -h / | awk 'NR==2 {print $3 " used / " $2 " total (" $5 ")"}')
            check_pass "Disk Space" "$disk_info"
        elif [ "$disk_usage" -lt "$DISK_CRITICAL_PERCENT" ]; then
            check_warn "Disk Space" "${disk_usage}% used (warning threshold: ${DISK_WARNING_PERCENT}%)"
        else
            check_fail "Disk Space" "${disk_usage}% used (critical threshold: ${DISK_CRITICAL_PERCENT}%)"
        fi
    fi

    # Check memory
    local mem_percent
    mem_percent=$(free | awk 'NR==2 {printf("%.0f", $3/$2 * 100)}' 2>/dev/null || echo "0")

    if [ -n "$mem_percent" ]; then
        local mem_info
        mem_info=$(free -h | awk 'NR==2 {print $3 " used / " $2 " total"}')

        if [ "$mem_percent" -lt "$MEMORY_WARNING_PERCENT" ]; then
            check_pass "Memory Usage" "$mem_info (${mem_percent}%)"
        elif [ "$mem_percent" -lt "$MEMORY_CRITICAL_PERCENT" ]; then
            check_warn "Memory Usage" "$mem_info (${mem_percent}% — warning)"
        else
            check_fail "Memory Usage" "$mem_info (${mem_percent}% — critical)"
        fi
    fi

    # Check load average
    local load_avg
    load_avg=$(cat /proc/loadavg 2>/dev/null | awk '{print $1, $2, $3}' || echo "N/A")
    if [ "$load_avg" != "N/A" ]; then
        local cpu_count
        cpu_count=$(nproc 2>/dev/null || echo "1")
        check_pass "Load Average" "${load_avg} (${cpu_count} CPU cores)"
    fi

    # Check uptime
    local uptime
    uptime=$(uptime -p 2>/dev/null || uptime | sed 's/.*up //' || echo "unknown")
    check_pass "System Uptime" "$uptime"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
    local mode="${1:-}"

    case "$mode" in
        --json)
            # JSON output mode (for monitoring systems)
            # For simplicity, run checks and output summary
            print_header
            check_docker
            check_postgres
            check_redis
            check_backend_api
            check_frontend
            check_websocket
            check_system
            print_summary
            ;;

        --watch)
            # Continuous monitoring mode
            while true; do
                clear
                print_header
                check_docker
                check_postgres
                check_redis
                check_backend_api
                check_frontend
                check_websocket
                check_system
                print_summary
                log "${BLUE}Refreshing in 30 seconds... (Ctrl+C to exit)${NC}"
                sleep 30
            done
            ;;

        --silent)
            # Silent mode (for cron) — only output on failure
            print_header > /dev/null 2>&1
            check_docker > /dev/null 2>&1
            check_postgres > /dev/null 2>&1
            check_redis > /dev/null 2>&1
            check_backend_api > /dev/null 2>&1
            check_frontend > /dev/null 2>&1
            check_websocket > /dev/null 2>&1
            check_system > /dev/null 2>&1

            if [ "$FAILED_CHECKS" -gt 0 ]; then
                print_header
                log "${RED}Health check FAILED: ${FAILED_CHECKS} issues detected${NC}"
                for error in "${ERRORS[@]}"; do
                    log "  ${RED}• ${error}${NC}"
                done
                exit 1
            fi
            exit 0
            ;;

        *)
            # Default: single run with full output
            print_header
            check_docker
            check_postgres
            check_redis
            check_backend_api
            check_frontend
            check_websocket
            check_system
            print_summary

            [ "$FAILED_CHECKS" -eq 0 ] && exit 0 || exit 1
            ;;
    esac
}

main "$@"
