#!/bin/bash
# 🚀 Fly.io Deployment Script for 999-multibots-telegraf

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

APP_NAME="999-multibots-telegraf"
REGION="ams"

# 1. Check authentication
log_info "1. Checking Fly.io authentication..."
if ! flyctl auth whoami >/dev/null 2>&1; then
    log_error "❌ Not authenticated! Please run: flyctl auth login"
    exit 1
fi
log_success "✅ Authenticated"

# 2. Check if app exists
log_info "2. Checking if app exists..."
if flyctl status --app $APP_NAME >/dev/null 2>&1; then
    log_success "✅ App $APP_NAME exists"
else
    log_warning "⚠️  App doesn't exist, creating..."
    flyctl apps create $APP_NAME --org personal --region $REGION
    log_success "✅ App created"
fi

# 3. Type check (optional - can be skipped)
log_info "3. TypeScript check..."
npm run typecheck || log_warning "⚠️  TypeScript errors found, continuing anyway..."

# 4. Deploy
log_info "4. Deploying to Fly.io..."
flyctl deploy --remote-only

log_success "🎉 Deployment completed!"
log_info "App URL: https://$APP_NAME.fly.dev"
log_info "Status: flyctl status --app $APP_NAME"
log_info "Logs: flyctl logs --app $APP_NAME"
