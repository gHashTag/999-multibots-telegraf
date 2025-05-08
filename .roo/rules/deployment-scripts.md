---
description: Скрипт развертывания 
globs: 
alwaysApply: false
---
# 🚀 Deployment Scripts Guide

## Main Deployment Scripts
- [deploy-server.sh](mdc:scripts/deploy-server.sh) - Main production deployment script
- [deploy-test.sh](mdc:scripts/deploy-test.sh) - Test environment deployment
- [deploy.sh](mdc:scripts/deploy.sh) - Local deployment helper

## Usage Guidelines

### Production Deployment
```bash
# Make executable and run with auto-confirm
chmod +x scripts/deploy-server.sh && ./scripts/deploy-server.sh -y
```

### Test Deployment
```bash
chmod +x scripts/deploy-test.sh && ./scripts/deploy-test.sh
```

### Local Deployment
```bash
chmod +x scripts/deploy.sh && ./scripts/deploy.sh
```

## Important Parameters
- `-y` : Auto-confirm all prompts
- `-k` : Specify SSH key path
- `-s` : Specify server address
- `-p` : Specify project path
- `-b` : Specify branch name
- `-r` : Force container restart
- `-n` : Skip container restart
