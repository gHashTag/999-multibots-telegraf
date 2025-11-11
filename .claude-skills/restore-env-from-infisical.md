# 🔐 SKILL: Restore .env from Infisical

## Trigger

When the user mentions:
- "пустые API ключи"
- "api_key is empty"
- "env восстановить"
- ".env сломался"
- "HEYGEN_* не загружается"
- "секреты не работают"

## Problem

API keys (HEYGEN_*, ELEVENLABS_*) are empty in requests because `.env` file is corrupted or missing on production server.

## Solution

### Step 1: Quick Diagnosis

```bash
# Check if .env exists and has keys
ssh prod999 "grep -E 'HEYGEN|ELEVENLABS' /root/bot-farm/.env | wc -l"

# Expected: 6 lines
# If 0 or less → .env is corrupted
```

### Step 2: Auto-Restore with Script

```bash
# Use the restore script
./scripts/restore-env-from-infisical.sh --prod
```

### Step 3: Manual Restore (if script unavailable)

```bash
# Export from Infisical (remove quotes)
infisical export \
  --projectId=fd763fa3-35d5-4045-93bd-1795c5f00fc3 \
  --env=prod \
  --path=/ \
  --format=dotenv \
  | sed "s/'//g" > /tmp/prod.env

# Add Infisical credentials back (they don't export themselves)
cat >> /tmp/prod.env <<'EOF'

INFISICAL_CLIENT_ID=88fcf0cd-cce9-4844-bad2-8e19b4bad3ed
INFISICAL_CLIENT_SECRET=b377e7a60b669ea2317f339dc6cb79ce49d588a7bbed92433bb2a73dedff3314
INFISICAL_PROJECT_ID=fd763fa3-35d5-4045-93bd-1795c5f00fc3
EOF

# Upload to production
cat /tmp/prod.env | ssh prod999 "cat > /root/bot-farm/.env"

# Verify upload
ssh prod999 "wc -l /root/bot-farm/.env && grep 'HEYGEN_HAIM_API_KEY' /root/bot-farm/.env"
```

### Step 4: Restart Docker Container

```bash
# Restart to load new env vars
ssh prod999 "cd /root/bot-farm && docker compose restart app"

# Wait for startup
sleep 15

# Verify keys loaded in container
ssh prod999 "docker exec 999-multibots printenv | grep -E 'HEYGEN|ELEVENLABS' | sort"

# Expected output:
# ELEVENLABS_API_KEY=737d2f8b...
# ELEVENLABS_HAIM_API_KEY=737d2f8b...
# ELEVENLABS_VOICE_COCOAGE=2b2e1f15...
# ELEVENLABS_VOICE_HAIM=dc9cd149...
# HEYGEN_COCOAGE_API_KEY=sk_V2_hgu_kZgKPoImFA5_...
# HEYGEN_HAIM_API_KEY=sk_V2_hgu_kBLbUbWT3dT_i0Nz...
```

### Step 5: Verification

```bash
# Check bot logs for successful startup
ssh prod999 "docker logs --tail 50 999-multibots 2>&1 | grep -E '(✅|успешно|зарегистрирован)'"

# Should show: "✅ Все боты успешно запущены"
```

## Critical Files

- **Script**: `/scripts/restore-env-from-infisical.sh`
- **Docs**: `/docs/INFISICAL_ENV_MANAGEMENT.md`
- **Config**: `/docs/AVATAR_API_KEYS.md`
- **Production .env**: `/root/bot-farm/.env` (on 212.86.115.30)

## Expected API Keys

```
HEYGEN_COCOAGE_API_KEY=sk_V2_hgu_kZgKPoImFA5_7wlQLLXqKLr2mag1hIM9caNiPtAYmjkj
HEYGEN_HAIM_API_KEY=sk_V2_hgu_kBLbUbWT3dT_i0NzHVIT9R8GNZR3xu8Ccw8RT6gIBNPJ
ELEVENLABS_API_KEY=737d2f8b185450984e1525893f0327f48736fe9e9d850d52cb63834337ca7dc4
ELEVENLABS_HAIM_API_KEY=737d2f8b185450984e1525893f0327f48736fe9e9d850d52cb63834337ca7dc4
ELEVENLABS_VOICE_COCOAGE=2b2e1f15157b454487f1250ffe586d7a
ELEVENLABS_VOICE_HAIM=dc9cd149b0d741d6934a1d95e3f3ef00
```

## Common Issues

### Issue 1: "INFISICAL_CLIENT_ID variable is not set"

**Cause**: Infisical credentials not in docker-compose.yml

**Fix**:
```yaml
# Add to docker-compose.yml → services.app.environment
- INFISICAL_CLIENT_ID=${INFISICAL_CLIENT_ID}
- INFISICAL_CLIENT_SECRET=${INFISICAL_CLIENT_SECRET}
- INFISICAL_PROJECT_ID=${INFISICAL_PROJECT_ID}
```

### Issue 2: Infisical export has quotes

**Cause**: Default format includes quotes, Docker Compose doesn't understand them

**Fix**: Use `sed "s/'//g"` to remove quotes

### Issue 3: Infisical credentials missing from export

**Cause**: Infisical CLI doesn't export its own credentials

**Fix**: Manually append them after export (script does this automatically)

## Automation

Add to `.github/workflows/deploy.yml`:

```yaml
- name: Restore .env from Infisical
  run: |
    ./scripts/restore-env-from-infisical.sh --prod
    scp .env prod999:/root/bot-farm/.env
```

## Verification Checklist

- [ ] `.env` file exists on server
- [ ] `.env` has 70+ lines
- [ ] All 6 avatar keys present
- [ ] No quotes around values
- [ ] Docker container restarted
- [ ] Keys loaded in container env
- [ ] Bots started successfully
- [ ] No "api_key is empty" errors in logs

## Time to Fix

- **With script**: 2-3 minutes
- **Manual**: 5-7 minutes
- **Includes restart**: +2 minutes

## Last Verified

- **Date**: 2025-11-12
- **Server**: 212.86.115.30 (prod999)
- **Keys**: 6 avatar API keys
- **Bots**: 10 production bots running

---

**IMPORTANT**: Always create backup before modifying .env:
```bash
ssh prod999 "cp /root/bot-farm/.env /root/bot-farm/.env.backup.$(date +%Y%m%d_%H%M%S)"
```
