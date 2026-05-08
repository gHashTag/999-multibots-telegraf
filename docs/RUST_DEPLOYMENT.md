# Rust Deployment Guide

## Railway GitHub Integration Setup

### 1. Add Railway Token to GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions → New repository secret

**Name:** `RAILWAY_TOKEN`
**Value:** `09deae9d-9730-4dcd-8d63-940aff8d3898`

### 2. Configure Railway Service

Open your Railway service:
https://railway.com/project/49a92e6d-1722-4f0b-8361-64b5b8577e37/service/51666b9a-5337-47c9-a3e8-cbf292d2a47c

Settings:
- **Root Directory:** `/rust`
- **Dockerfile Path:** `Dockerfile.rust`
- **Docker Context:** `.`

### 3. Trigger Deployment

Any push to `main` branch that modifies:
- `rust/**` (any Rust files)
- `Dockerfile.rust`
- `railway.toml`

Will trigger automatic deployment via GitHub Actions.

### Manual Deployment

```bash
# Via Railway CLI (after linking)
railway up --service 51666b9a-5337-47c9-a3e8-cbf292d2a47c

# Or trigger via GitHub Actions manually:
# Go to Actions → Deploy to Railway → Run workflow
```

### Files Created

| File | Purpose |
|------|---------|
| `railway.toml` | Railway deployment config (Docker-based) |
| `.railwayignore` | Exclude unnecessary files from upload |
| `.github/workflows/railway-deploy.yml` | GitHub Actions workflow |

### Health Check

After deployment, check:
```
https://[railway-generated-url].railway.app/health/simple
```

Expected response: `{"status":"ok"}`
