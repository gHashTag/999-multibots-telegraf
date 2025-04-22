---
description: Update Script Guide 
globs: 
alwaysApply: false
---
# 🔄 Update Scripts Guide

## Available Update Scripts
- [update-agent.sh](mdc:scripts/update-agent.sh) - Update AI agent configuration
- [update-docker.sh](mdc:scripts/update-docker.sh) - Update Docker configuration
- [update-host.sh](mdc:scripts/update-host.sh) - Update host system configuration
- [update-ssh.sh](mdc:scripts/update-ssh.sh) - Update SSH configuration
- [update-ssh-local.sh](mdc:scripts/update-ssh-local.sh) - Update local SSH settings

## Quick Commands

### Update All
```bash
for script in scripts/update-*.sh; do
  chmod +x "$script" && ./"$script"
done
```

### Update Docker Configuration
```bash
chmod +x scripts/update-docker.sh && ./scripts/update-docker.sh
```

### Update SSH Settings
```bash
# For production
chmod +x scripts/update-ssh.sh && ./scripts/update-ssh.sh

# For local development
chmod +x scripts/update-ssh-local.sh && ./scripts/update-ssh-local.sh
```

## Common Parameters
- `-f` : Force update
- `-y` : Auto-confirm all prompts
- `-v` : Verbose output
- `-d` : Debug mode
