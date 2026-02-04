# 🚀 Fly.io Deployment Guide for 999-multibots-telegraf

## 📋 Prerequisites

1. Install Fly.io CLI:
```bash
brew install flyctl
# or
curl -L https://fly.io/install.sh | sh
```

2. Authenticate:
```bash
flyctl auth login
```

## 🏗️ Project Structure

### Current Configuration
- **fly.toml**: Fly.io app configuration (created)
- **Dockerfile**: Multi-stage build with esbuild (already exists)
- **Scripts**: deploy-fly.sh (created)

### Bot Farm Details (from commit 121574b41)
- Originally deployed to VPS servers (212.86.115.30, 188.137.250.69)
- Docker-based deployment with nginx reverse proxy
- Multiple bots on ports 2999-3011

## 🚀 Deployment Steps

### 1. First-time Setup
```bash
# Create app on Fly.io
flyctl apps create 999-multibots-telegraf --org personal --region ams

# Set secrets (update with real values)
flyctl secrets set --app 999-multibots-telegraf \
  TELEGRAM_BOT_TOKEN_1=xxx \
  TELEGRAM_BOT_TOKEN_2=xxx \
  SUPABASE_URL=xxx \
  SUPABASE_SERVICE_KEY=xxx \
  INNGEST_EVENT_KEY=xxx \
  INNGEST_SIGNING_KEY=xxx
```

### 2. Deploy
```bash
# Using script
./scripts/deploy/deploy-fly.sh

# Or manually
flyctl deploy --remote-only
```

### 3. Monitor
```bash
# Check status
flyctl status --app 999-multibots-telegraf

# View logs
flyctl logs --app 999-multibots-telegraf

# Open in browser
flyctl open --app 999-multibots-telegraf
```

## 🔧 Configuration Files

### fly.toml (current)
```toml
app = "999-multibots-telegraf"
primary_region = "ams"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "3001"
  API_PORT = "3001"

[http_service]
  internal_port = 3001
  force_https = true
  auto_stop_machines = "suspend"
  auto_start_machines = true
  min_machines_running = 1
  processes = ["app"]
  protocol = "tcp"

[[vm]]
  memory = "2gb"
  cpu_kind = "shared"
  cpus = 2
```

### Dockerfile (already optimized for Fly.io)
- Multi-stage build with esbuild
- Port 3001 exposed
- Non-root user
- ffmpeg for video processing

## 📊 Migration from VPS to Fly.io

### Key Differences

| VPS (Old) | Fly.io (New) |
|-----------|--------------|
| Multiple ports 2999-3011 | Single app, port 3001 |
| SSH access | `flyctl ssh console` |
| Manual nginx config | Automatic HTTPS |
| rsync deployment | `flyctl deploy` |
| Custom health checks | Fly.io health checks |

### Migration Checklist

- [ ] Set all environment variables in Fly.io secrets
- [ ] Update webhooks to point to `https://999-multibots-telegraf.fly.dev`
- [ ] Configure Supabase RLS for Fly.io IP ranges
- [ ] Update Inngest webhook URL
- [ ] Test all bot commands
- [ ] Verify video processing works (ffmpeg installed)

## 🐛 Troubleshooting

### Token Issues
Current tokens are expired. To get new tokens:
```bash
# Interactive login
flyctl auth login

# Or generate new token at: https://fly.io/user/personal_access_tokens
```

### Build Errors
```bash
# Check Docker build locally
docker build -t test .

# Deploy with verbose output
flyctl deploy --remote-only --verbose
```

### Memory Issues
Increase VM size in fly.toml:
```toml
[[vm]]
  memory = "4gb"
  cpu_kind = "shared"
  cpus = 2
```

### Port Conflicts
Ensure only port 3001 is used in fly.toml:
```toml
[http_service]
  internal_port = 3001
```

## 📚 Resources

- Fly.io Docs: https://fly.io/docs/
- flyctl Reference: https://fly.io/docs/flyctl/
- Deploying with Docker: https://fly.io/docs/apps/dockerfile/

## 🎯 Next Steps

1. ✅ fly.toml created
2. ✅ deploy-fly.sh script created
3. ⏳ Get new Fly.io token
4. ⏳ Set secrets in Fly.io
5. ⏳ Deploy first version
6. ⏳ Test all bots
7. ⏳ Configure webhooks
8. ⏳ Monitor and scale

---

**Status**: Ready for deployment after authentication
**Last Updated**: 2025-01-29
