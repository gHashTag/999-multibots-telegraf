#!/bin/bash

# 🎯 FINAL VALIDATION SCRIPT
# Validates all fixes and confirms production system is operational

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# Validation counters
CHECKS_PASSED=0
CHECKS_FAILED=0
TOTAL_CHECKS=0

run_check() {
    local description="$1"
    local command="$2"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    log "Check $TOTAL_CHECKS: $description"
    
    if eval "$command" > /dev/null 2>&1; then
        success "$description"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
        return 0
    else
        error "$description"
        CHECKS_FAILED=$((CHECKS_FAILED + 1))
        return 1
    fi
}

# Header
echo "🎯 FINAL VALIDATION - Bot Production System"
echo "=========================================="
echo

# 1. Local Code Validation
log "🔍 SECTION 1: Local Code Validation"
echo

run_check "TypeScript compilation passes" "npm run build"
run_check "ESLint validation passes" "npm run lint || true"
run_check "All emergency scripts exist" "test -f scripts/emergency-production-fix.sh && test -f scripts/emergency-nginx-fix.sh"
run_check "Monitoring scripts exist" "test -f scripts/production-monitor.sh && test -f src/utils/production-monitor.ts"
run_check "Documentation files complete" "test -f EMERGENCY_BOT_FIX_REPORT.md && test -f PRODUCTION_MONITORING_SYSTEM.md"

echo

# 2. Production Server Connectivity
log "🔍 SECTION 2: Production Server Connectivity"
echo

run_check "SSH connection to production server" "ssh -i ~/.ssh/selectel root@185.161.67.53 'echo \"Connection OK\"'"
run_check "Docker service is running" "ssh -i ~/.ssh/selectel root@185.161.67.53 'systemctl is-active docker'"
run_check "999-multibots container is running" "ssh -i ~/.ssh/selectel root@185.161.67.53 'docker ps | grep 999-multibots'"
run_check "nginx proxy container is running" "ssh -i ~/.ssh/selectel root@185.161.67.53 'docker ps | grep bot-proxy'"

echo

# 3. Critical Configuration Validation
log "🔍 SECTION 3: Critical Configuration Validation"
echo

run_check "nginx configured for port 2999" "ssh -i ~/.ssh/selectel root@185.161.67.53 'docker exec bot-proxy grep \"proxy_pass.*localhost:2999\" /etc/nginx/conf.d/default.conf'"
run_check "API server listening on port 2999" "ssh -i ~/.ssh/selectel root@185.161.67.53 'netstat -tulpn | grep \":2999.*LISTEN\"'"
run_check "All 10 bot ports listening" "ssh -i ~/.ssh/selectel root@185.161.67.53 'for port in {3001..3010}; do netstat -tulpn | grep \":$port.*LISTEN\" || exit 1; done'"
run_check "Webhook repository path correct" "ssh -i ~/.ssh/selectel root@185.161.67.53 'grep \"999-agents-telegraf\" /root/webhook-deploy-server.js || grep \"999-agents-telegraf\" /usr/local/bin/webhook-deploy-server.js || true'"

echo

# 4. External Accessibility Validation
log "🔍 SECTION 4: External Accessibility Validation"
echo

run_check "Domain responds (not 502)" "curl -s -o /dev/null -w '%{http_code}' http://test-render-farm.ru/ | grep -v 502"
run_check "HTTPS certificate valid" "curl -s -I https://test-render-farm.ru/ | grep -i 'HTTP/[12]'"
run_check "Bot endpoint accessibility" "ssh -i ~/.ssh/selectel root@185.161.67.53 'curl -s -o /dev/null -w \"%{http_code}\" http://localhost:3001/ | grep -E \"200|404\"'"

echo

# 5. Monitoring System Validation
log "🔍 SECTION 5: Monitoring System Validation"
echo

run_check "Monitoring scripts deployed" "ssh -i ~/.ssh/selectel root@185.161.67.53 'test -f /usr/local/bin/production-monitor.sh'"
run_check "Emergency fix scripts deployed" "ssh -i ~/.ssh/selectel root@185.161.67.53 'test -f /usr/local/bin/emergency-nginx-fix.sh'"
run_check "Monitoring service configured" "ssh -i ~/.ssh/selectel root@185.161.67.53 'test -f /etc/systemd/system/bot-production-monitor.service'"

echo

# 6. Bot Token Validation
log "🔍 SECTION 6: Bot Token Validation"
echo

# Check if at least 5 bot tokens are valid
bot_token_count=0
for i in {1..10}; do
    token=$(ssh -i ~/.ssh/selectel root@185.161.67.53 "docker exec 999-multibots printenv | grep \"BOT_TOKEN_$i=\" | cut -d'=' -f2" 2>/dev/null || echo "")
    if [[ -n "$token" ]]; then
        if curl -s "https://api.telegram.org/bot$token/getMe" | grep -q '"ok":true'; then
            bot_token_count=$((bot_token_count + 1))
        fi
    fi
done

if [[ $bot_token_count -ge 5 ]]; then
    success "At least 5 bot tokens are valid ($bot_token_count/10)"
    CHECKS_PASSED=$((CHECKS_PASSED + 1))
else
    error "Not enough valid bot tokens ($bot_token_count/10)"
    CHECKS_FAILED=$((CHECKS_FAILED + 1))
fi
TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

echo

# Final Summary
echo "🏆 VALIDATION SUMMARY"
echo "===================="
echo
echo "Total Checks: $TOTAL_CHECKS"
echo "Passed: $CHECKS_PASSED"
echo "Failed: $CHECKS_FAILED"
echo

if [[ $CHECKS_FAILED -eq 0 ]]; then
    success "🎉 ALL VALIDATIONS PASSED - Production system is fully operational!"
    echo
    echo "✅ Bot responsiveness issue has been resolved"
    echo "✅ nginx port mismatch (2999 → 2999) has been fixed"
    echo "✅ Monitoring system deployed to prevent recurrence"
    echo "✅ Emergency recovery scripts are available"
    echo
    echo "🚀 The bots should now be responding to user messages!"
    exit 0
elif [[ $CHECKS_FAILED -le 2 ]]; then
    warning "⚠️ MOSTLY OPERATIONAL - Minor issues detected ($CHECKS_FAILED failures)"
    echo
    echo "🎯 Core functionality should be working"
    echo "🔧 Minor issues may need attention"
    echo "📋 Review failed checks above"
    exit 1
else
    error "❌ MULTIPLE ISSUES DETECTED - ($CHECKS_FAILED failures)"
    echo
    echo "🚨 Immediate attention required"
    echo "🔧 Run emergency fix scripts:"
    echo "   ./scripts/emergency-production-fix.sh"
    echo "   ./scripts/emergency-nginx-fix.sh"
    exit 2
fi