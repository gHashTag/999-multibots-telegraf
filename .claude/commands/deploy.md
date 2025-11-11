---
name: deploy
description: Deploy code changes to production server with Docker rebuild
---

## 🚀 ЕДИНЫЙ СКРИПТ ДЕПЛОЯ

**ИСПОЛЬЗУЙТЕ ТОЛЬКО:**
```bash
./deploy.sh deploy
```

## What the script does automatically:

1. ✅ **Backs up .env** - Preserves bot tokens before git pull
2. ✅ **Updates code** - git pull from production branch
3. ✅ **Restores .env** - Tokens never get lost
4. ✅ **Rebuilds Docker** - With --no-cache flag
5. ✅ **Restarts containers** - With nginx reverse proxy
6. ✅ **Creates snapshot** - For easy rollback
7. ✅ **Verifies status** - Shows deployment result

## Other useful commands:

```bash
./deploy.sh status      # Check deployment status
./deploy.sh logs 50     # View last 50 log lines
./deploy.sh list        # List available snapshots
./deploy.sh rollback <snapshot>  # Rollback if needed
./deploy.sh help        # Show all commands
```

## ❌ DO NOT USE:

- ~~docker-compose up/down~~
- ~~docker build~~
- ~~git pull on server manually~~
- ~~Any manual deployment steps~~

## 🔒 Token Protection

The `.env` file is **NO LONGER in git**:
- Automatically backed up before each deployment
- Automatically restored after git operations
- Tokens are preserved across all deployments

## Server Details

- **Server:** 188.137.250.69
- **Path:** /root/bot-farm
- **Container:** 999-multibots
- **SSH Key:** ~/.ssh/zomro

Use this command after committing changes to production branch.
