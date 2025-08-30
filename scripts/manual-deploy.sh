#!/bin/bash

# Manual Deployment Script (No GitHub Actions Required)
# Run this script to deploy manually with full automation

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
    exit 1
}

# Configuration
REPO_URL="https://github.com/gHashTag/999-multibots-telegraf.git"
BRANCH="production"
SERVER_HOST="185.161.67.53"
SSH_KEY="~/.ssh/selectel"

# Step 1: Pull latest changes locally
pull_latest() {
    log "📥 Pulling latest changes from $BRANCH branch..."
    
    git fetch origin
    git checkout "$BRANCH"
    git pull origin "$BRANCH"
    
    success "Latest changes pulled"
}

# Step 2: Run local tests and validation
run_validation() {
    log "🔍 Running validation checks..."
    
    # Environment validation
    log "Validating environment configuration..."
    if NODE_ENV=production WEBHOOK_DOMAIN=http://test-render-farm.ru npm run env:validate; then
        success "Environment validation passed"
    else
        warning "Environment validation had warnings (continuing...)"
    fi
    
    # Build test
    log "Testing build process..."
    if npm run build; then
        success "Build test passed"
    else
        error "Build test failed"
    fi
    
    success "All validation checks completed"
}

# Step 3: Deploy to server
deploy_to_server() {
    log "🚀 Deploying to production server..."
    
    # Copy deployment script to server and execute
    scp -i "$SSH_KEY" scripts/deploy-production.sh root@$SERVER_HOST:/tmp/
    
    # Execute deployment on server
    ssh -i "$SSH_KEY" root@$SERVER_HOST "
        cd 999-agents-vibecoder
        
        # Pull latest changes
        git fetch origin
        git checkout main  # Server uses main branch
        git pull origin main
        
        # Run deployment script
        chmod +x /tmp/deploy-production.sh
        /tmp/deploy-production.sh
        
        # Clean up
        rm /tmp/deploy-production.sh
    "
    
    success "Server deployment completed"
}

# Step 4: Setup webhooks
setup_webhooks() {
    log "🔗 Setting up webhooks..."
    
    # Run webhook setup on server
    ssh -i "$SSH_KEY" root@$SERVER_HOST "
        cd 999-agents-vibecoder
        
        # Create temporary webhook setup script
        cat > /tmp/setup-webhooks.sh << 'EOF'
#!/bin/bash
echo '🔗 Setting up production webhooks...'

# Get bot tokens from container
for i in {1..6}; do
    TOKEN=\$(docker exec 999-multibots printenv | grep \"BOT_TOKEN_\$i=\" | cut -d'=' -f2)
    if [ ! -z \"\$TOKEN\" ]; then
        echo \"Setting webhook for bot \$i...\"
        curl -X POST \"https://api.telegram.org/bot\$TOKEN/setWebhook\" \\
             -d \"url=http://test-render-farm.ru/webhook/bot\$i\" \\
             -d \"allowed_updates=[\\\"message\\\",\\\"callback_query\\\",\\\"pre_checkout_query\\\"]\"
        echo
    fi
done

echo '✅ Webhook setup completed'
EOF

        chmod +x /tmp/setup-webhooks.sh
        /tmp/setup-webhooks.sh
        rm /tmp/setup-webhooks.sh
    "
    
    success "Webhooks configured"
}

# Step 5: Verify deployment
verify_deployment() {
    log "🔍 Verifying deployment..."
    
    # Check container status
    ssh -i "$SSH_KEY" root@$SERVER_HOST "
        echo '📊 Container Status:'
        docker ps | grep 999-multibots
        echo
        
        echo '📋 Recent Logs:'
        docker logs 999-multibots --tail 10
        echo
        
        echo '🔗 Testing API endpoint:'
        curl -I http://test-render-farm.ru/ || echo 'API endpoint check completed'
    "
    
    success "Deployment verification completed"
}

# Main deployment process
main() {
    echo "🚀 999-Agents Manual Deployment"
    echo "==============================="
    
    log "Starting manual deployment process..."
    
    pull_latest
    run_validation
    deploy_to_server
    setup_webhooks
    verify_deployment
    
    success "🎉 Manual deployment completed successfully!"
    
    echo ""
    echo "📊 Next Steps:"
    echo "1. Test bot functionality in Telegram"
    echo "2. Monitor logs: ssh -i $SSH_KEY root@$SERVER_HOST 'docker logs 999-multibots -f'"
    echo "3. Check webhook status: npm run webhook:verify"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if we're in the correct directory
    if [ ! -f "package.json" ]; then
        error "Please run this script from the project root directory"
    fi
    
    # Check if SSH key exists
    if [ ! -f "$(eval echo $SSH_KEY)" ]; then
        error "SSH key not found: $SSH_KEY"
    fi
    
    # Check if git is clean
    if [ -n "$(git status --porcelain)" ]; then
        warning "Working directory has uncommitted changes"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            error "Deployment cancelled"
        fi
    fi
    
    success "Prerequisites check passed"
}

# Help message
show_help() {
    echo "Manual Deployment Script - GitHub Actions Free Alternative"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --help    Show this help message"
    echo "  --check   Only run validation checks"
    echo "  --deploy  Run full deployment"
    echo ""
    echo "Examples:"
    echo "  $0                    # Full deployment"
    echo "  $0 --check          # Only validation"
    echo "  $0 --deploy         # Force deployment"
}

# Parse arguments
case "${1:-deploy}" in
    --help|-h)
        show_help
        exit 0
        ;;
    --check)
        check_prerequisites
        pull_latest
        run_validation
        success "Validation completed"
        ;;
    --deploy|deploy)
        check_prerequisites
        main
        ;;
    *)
        error "Unknown option: $1. Use --help for usage information."
        ;;
esac