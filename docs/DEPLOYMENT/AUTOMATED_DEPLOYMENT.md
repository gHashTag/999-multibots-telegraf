# 🚀 Automated Production Deployment System

## Overview

This document describes the complete automated deployment system for the 999-agents-telegraf multi-bot platform. The system ensures that every push to the `production` branch automatically rebuilds the Docker container, redeploys to the production server, and properly configures webhooks.

## 🎯 Problem Solved

**Issue**: Manual deployment process where webhooks weren't automatically set up after container recreation, leading to silent bots.

**Solution**: Complete CI/CD pipeline with automatic webhook registration, health checks, and rollback capabilities.

## 🏗️ Architecture

### 1. GitHub Actions Workflow
**File**: `.github/workflows/production-deploy.yml`

- **Trigger**: Push to `production` branch
- **Process**: Build → Test → Docker Build → Deploy → Verify
- **Features**: 
  - Automatic Docker image building and registry push
  - SSH deployment to production server
  - Webhook verification
  - Health checks

### 2. Production Deployment Script
**File**: `scripts/deploy-production.sh`

- **Purpose**: Server-side deployment automation
- **Features**:
  - Pre-deployment validation
  - Automatic backup creation
  - Container recreation with correct environment
  - Webhook setup verification
  - Rollback on failure

### 3. Webhook Management System
**Files**: 
- `src/utils/webhook-manager.ts` - Enhanced webhook setup with retry logic
- `src/utils/production-startup.ts` - Production startup orchestration

**Features**:
- Automatic protocol detection (HTTP/HTTPS)
- Retry logic with exponential backoff
- Health checks and validation
- Concurrent webhook setup with rate limiting

### 4. CLI Tools
**Files**:
- `src/utils/webhook-setup-cli.ts` - Manual webhook setup
- `src/utils/webhook-verify-cli.ts` - Webhook verification and testing

## 🔧 Setup Instructions

### 1. Environment Configuration

Ensure the following environment variables are set on the production server:

```bash
# Production environment
NODE_ENV=production
WEBHOOK_DOMAIN=https://999-agents.site
WEBHOOK_PATH=/webhook

# Bot tokens
BOT_TOKEN_1=your_token_here
BOT_TOKEN_2=your_token_here
# ... up to BOT_TOKEN_10

# Disable test mode
TEST_BOT_NAME=
```

### 2. GitHub Secrets Setup

Add these secrets to your GitHub repository:

```
SSH_PRIVATE_KEY    # SSH private key for server access
GITHUB_TOKEN       # Automatically provided by GitHub
```

### 3. Production Server Setup

```bash
# On production server (185.161.67.53)
cd /root/999-agents-vibecoder

# Ensure .env file exists with correct configuration
nano .env

# Make deployment script executable
chmod +x scripts/deploy-production.sh
```

## 🚀 Deployment Process

### Automatic Deployment (Recommended)

1. **Push to production branch**:
   ```bash
   git checkout production
   git merge main  # or your feature branch
   git push origin production
   ```

2. **GitHub Actions automatically**:
   - Builds and tests the code
   - Creates Docker image
   - Deploys to production server
   - Sets up webhooks
   - Verifies deployment

### Manual Deployment (If needed)

1. **Using deployment script**:
   ```bash
   # On production server
   ./scripts/deploy-production.sh
   ```

2. **Using npm scripts**:
   ```bash
   npm run deploy:production
   ```

3. **Manual webhook setup**:
   ```bash
   npm run webhook:setup
   npm run webhook:verify
   ```

## 🔍 Monitoring and Verification

### Health Check Commands

```bash
# Check container status
docker ps | grep 999-multibots

# View recent logs
docker logs 999-multibots --tail 50

# Check webhook status
npm run webhook:verify

# Test specific webhook URL
npm run webhook:verify test https://your-domain.tld/webhook
```

### Log Analysis

The system provides comprehensive logging:

```bash
# Application logs
docker logs 999-multibots --tail 100

# Webhook setup logs
docker logs 999-multibots | grep "webhook"

# Bot initialization logs
docker logs 999-multibots | grep "инициализирован"
```

## 🛠️ Troubleshooting

### Common Issues

1. **Webhooks not set**:
   ```bash
   # Manual webhook setup
   npm run webhook:setup
   ```

2. **Container not starting**:
   ```bash
   # Check environment variables
   docker exec 999-multibots printenv | grep -E "(NODE_ENV|WEBHOOK|BOT_TOKEN)"
   
   # Restart with deployment script
   ./scripts/deploy-production.sh
   ```

3. **API server unreachable**:
   ```bash
   # Check if domain is accessible
   curl -I ${WEBHOOK_DOMAIN}
   
   # Check nginx configuration
   docker logs bot-proxy
   ```

### Rollback Process

If deployment fails, the system automatically attempts rollback:

```bash
# Manual rollback to previous backup
BACKUP_DIR="/opt/backups/YYYYMMDD_HHMMSS"
cp $BACKUP_DIR/.env ./
docker restart 999-multibots
```

## 📊 Performance Features

### Concurrent Operations
- Webhook setup happens in parallel with controlled concurrency (3 bots at a time)
- Rate limiting prevents Telegram API throttling
- Automatic retry with exponential backoff

### Resource Management
- Automatic cleanup of old backups (keeps last 5)
- Container resource monitoring
- Memory and CPU usage tracking

### Error Handling
- Comprehensive error logging
- Security event tracking
- Graceful degradation on partial failures

## 🔒 Security Considerations

### SSH Access
- Uses SSH key authentication
- Temporary SSH key storage in CI/CD
- Automatic cleanup after deployment

### Environment Variables
- Secure handling of bot tokens
- Environment validation before deployment
- Masked logging of sensitive data

### Webhook Security
- HTTPS/HTTP protocol auto-detection
- Webhook URL validation
- Security event logging for failed setups

## 📝 Configuration Files

### GitHub Actions Workflow
```yaml
# .github/workflows/production-deploy.yml
# Automatic deployment on production branch push
```

### Deployment Script
```bash
# scripts/deploy-production.sh
# Server-side deployment automation
```

### Package Scripts
```json
{
  "scripts": {
    "deploy:production": "deployment script",
    "webhook:setup": "manual webhook setup",
    "webhook:verify": "webhook verification"
  }
}
```

## 🎯 Next Steps

1. **Monitor first automated deployment**
2. **Set up alerts for deployment failures**
3. **Configure automated backups**
4. **Implement advanced health monitoring**

## 📞 Support

For issues with the automated deployment system:

1. Check GitHub Actions logs
2. Review production server logs
3. Use webhook verification tools
4. Check this documentation for troubleshooting steps

---

**Last Updated**: August 30, 2025  
**Status**: Production Ready  
**Version**: 1.0.0