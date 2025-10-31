#!/bin/bash

# JavaScript Error Check Script - Production Log Monitor
# Focused only on JavaScript runtime errors in production logs

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

# Configuration
SERVER_HOST="185.161.67.53"
SSH_KEY="~/.ssh/selectel"
CONTAINER_NAME="999-multibots"
LOG_LINES=200

# JavaScript error patterns to detect
JS_ERROR_PATTERNS=(
    "TypeError:"
    "ReferenceError:"
    "SyntaxError:"
    "RangeError:"
    "EvalError:"
    "URIError:"
    "Error:"
    "Cannot find module"
    "MODULE_NOT_FOUND"
    "ENOENT:"
    "ECONNREFUSED"
    "UnhandledPromiseRejectionWarning"
    "DeprecationWarning"
    "node:internal"
    "at Object\."
    "at Module\."
    "at require"
    "at async"
    "throw new"
)

# Critical error patterns that need immediate attention
CRITICAL_PATTERNS=(
    "Error: Cannot find module"
    "MODULE_NOT_FOUND"
    "TypeError: Cannot"
    "ReferenceError:"
    "SyntaxError:"
    "UnhandledPromiseRejectionWarning"
    "ENOENT:"
    "throw new Error"
)

# Check if production container is running
check_container_status() {
    log "🔍 Checking production container status..."

    CONTAINER_STATUS=$(ssh -i "$SSH_KEY" root@$SERVER_HOST "docker ps --filter 'name=$CONTAINER_NAME' --format 'table {{.Names}}\t{{.Status}}' | grep $CONTAINER_NAME" || echo "")

    if [[ -z "$CONTAINER_STATUS" ]]; then
        error "Container $CONTAINER_NAME is not running on production server!"
        return 1
    fi

    success "Container is running: $CONTAINER_STATUS"
}

# Extract JavaScript errors from logs
analyze_js_errors() {
    log "🔍 Analyzing JavaScript errors in production logs..."

    # Get recent logs and filter for JavaScript errors
    TEMP_LOG_FILE="/tmp/js-errors-$(date +%s).log"

    ssh -i "$SSH_KEY" root@$SERVER_HOST "docker logs $CONTAINER_NAME --tail $LOG_LINES 2>&1" > "$TEMP_LOG_FILE"

    local found_errors=false
    local critical_errors=false
    local error_count=0
    local critical_count=0

    echo ""
    echo "🐛 JavaScript Errors Found:"
    echo "=========================="

    # Check for critical errors first
    for pattern in "${CRITICAL_PATTERNS[@]}"; do
        if grep -q "$pattern" "$TEMP_LOG_FILE"; then
            critical_errors=true
            local matches=$(grep -n "$pattern" "$TEMP_LOG_FILE" | head -5)
            if [[ ! -z "$matches" ]]; then
                echo -e "${RED}🚨 CRITICAL: $pattern${NC}"
                echo "$matches" | while read line; do
                    echo "   $line"
                done
                critical_count=$((critical_count + 1))
                echo ""
            fi
        fi
    done

    # Check for all JavaScript errors
    for pattern in "${JS_ERROR_PATTERNS[@]}"; do
        if grep -q "$pattern" "$TEMP_LOG_FILE"; then
            found_errors=true
            local matches=$(grep -n "$pattern" "$TEMP_LOG_FILE" | head -3)
            if [[ ! -z "$matches" ]]; then
                echo -e "${YELLOW}⚠️  $pattern${NC}"
                echo "$matches" | while read line; do
                    echo "   $line"
                done
                error_count=$((error_count + 1))
                echo ""
            fi
        fi
    done

    # Clean up
    rm -f "$TEMP_LOG_FILE"

    # Summary
    echo "📊 Error Summary:"
    echo "================"
    echo "Total JS Error Types: $error_count"
    echo "Critical Errors: $critical_count"

    if [[ "$critical_errors" == true ]]; then
        error "Critical JavaScript errors detected in production!"
        return 1
    elif [[ "$found_errors" == true ]]; then
        warning "JavaScript errors found but not critical"
        return 0
    else
        success "No JavaScript errors detected in recent logs"
        return 0
    fi
}

# Get recent error context
get_error_context() {
    log "📋 Getting error context for debugging..."

    ssh -i "$SSH_KEY" root@$SERVER_HOST "
        echo '📊 Container Resource Usage:'
        docker stats $CONTAINER_NAME --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}'
        echo ''

        echo '🔗 Last 10 Log Entries:'
        docker logs $CONTAINER_NAME --tail 10 --timestamps
        echo ''

        echo '⚡ Container Uptime:'
        docker inspect $CONTAINER_NAME --format '{{.State.StartedAt}}'
    "
}

# Auto-fix common JavaScript errors
auto_fix_errors() {
    log "🔧 Attempting automatic fixes for common JavaScript errors..."

    local fixes_applied=false

    # Check if it's a module resolution issue
    if ssh -i "$SSH_KEY" root@$SERVER_HOST "docker logs $CONTAINER_NAME --tail 50 2>&1 | grep -q 'Cannot find module'"; then
        warning "Module resolution errors detected. This may require code fixes."
        fixes_applied=true
    fi

    # Check for import path issues (common after TypeScript compilation)
    if ssh -i "$SSH_KEY" root@$SERVER_HOST "docker logs $CONTAINER_NAME --tail 50 2>&1 | grep -q '@/'"; then
        warning "Path alias issues detected. May need to rebuild with tsc-alias."
        echo "🔧 Suggested fix: npm run build:alias"
        fixes_applied=true
    fi

    # Check for environment issues
    if ssh -i "$SSH_KEY" root@$SERVER_HOST "docker logs $CONTAINER_NAME --tail 50 2>&1 | grep -q 'undefined'"; then
        warning "Undefined variable errors detected. Check environment variables."
        fixes_applied=true
    fi

    if [[ "$fixes_applied" == false ]]; then
        success "No auto-fixable errors detected"
    fi
}

# Show suggested actions based on error types
suggest_actions() {
    log "💡 Suggested Actions:"
    echo "==================="
    echo "1. For module errors: npm run build && rebuild Docker"
    echo "2. For TypeScript errors: npm run typecheck"
    echo "3. For path alias errors: npm run build:alias"
    echo "4. For critical errors: Immediate manual investigation required"
    echo "5. Full rebuild command: docker stop 999-multibots && docker rm 999-multibots && docker build --no-cache -t 999-multibots . && docker run -d --name 999-multibots --restart=always -p 3001:3001 -v /root/999-agents-telegraf/.env:/app/.env:ro 999-multibots"
    echo ""
}

# Main function
main() {
    echo "🔍 JavaScript Error Monitor for Production"
    echo "========================================="

    if check_container_status; then
        if analyze_js_errors; then
            get_error_context
            auto_fix_errors
            suggest_actions
            success "JavaScript error check completed"
        else
            get_error_context
            auto_fix_errors
            suggest_actions
            error "Critical JavaScript errors require immediate attention!"
            exit 1
        fi
    else
        error "Cannot proceed: Production container is not running"
        exit 1
    fi
}

# Quick check mode (only errors, no context)
quick_check() {
    if check_container_status; then
        analyze_js_errors
    fi
}

# Help message
show_help() {
    echo "JavaScript Error Check Script - Production Log Monitor"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --help       Show this help message"
    echo "  --quick      Quick error check only"
    echo "  --full       Full analysis with context (default)"
    echo "  --fix        Check and suggest fixes"
    echo ""
    echo "Examples:"
    echo "  $0                    # Full analysis"
    echo "  $0 --quick          # Quick check only"
    echo "  $0 --fix            # Check with auto-fix suggestions"
}

# Parse arguments
case "${1:-full}" in
    --help|-h)
        show_help
        exit 0
        ;;
    --quick)
        quick_check
        ;;
    --fix)
        main
        auto_fix_errors
        ;;
    --full|full)
        main
        ;;
    *)
        error "Unknown option: $1. Use --help for usage information."
        exit 1
        ;;
esac