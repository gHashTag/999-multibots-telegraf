---
name: 'Restore .env from Infisical'
description: 'Automatically diagnose and restore corrupted .env files from Infisical Cloud when API keys are empty or missing in production'
---

# Restore .env from Infisical

## When to Use This Skill

Automatically activate when detecting:

- User mentions "пустые API ключи", "api_key is empty", "env восстановить"
- Empty API keys in production logs or requests
- HEYGEN*\*, ELEVENLABS*\* environment variables missing
- Секреты не работают / secrets not working

## Quick Diagnosis

```bash
# Check if .env is corrupted on production
ssh prod999 "grep -E 'HEYGEN|ELEVENLABS' /root/bot-farm/.env | wc -l"

# Expected: 6 lines (6 avatar API keys)
# If 0 or less → .env is corrupted, proceed with restoration
```

## Automatic Restoration (Preferred)

```bash
# Use the restoration script
./scripts/infisical/restore-env-from-infisical.sh --prod

# Script automatically:
# 1. Exports all secrets from Infisical Cloud
# 2. Removes quotes (Docker Compose compatibility)
# 3. Adds back INFISICAL_* credentials
# 4. Creates timestamped backup
# 5. Validates critical keys
```

## Manual Restoration (Fallback)

If script is unavailable or fails:

```bash
# Step 1: Export from Infisical (remove quotes)
infisical export \
  --projectId=fd763fa3-35d5-4045-93bd-1795c5f00fc3 \
  --env=prod \
  --path=/ \
  --format=dotenv \
  | sed "s/'//g" > /tmp/prod.env

# Step 2: Add Infisical credentials back
#
# The machine identity is NOT stored in this file — it unlocks ALL 50+ project
# secrets. Take the real values from:
#   railway variables --kv | grep INFISICAL_
#   or Infisical Dashboard -> https://app.infisical.com -> project "999"
#      -> Access Control -> Machine Identities -> Client ID / Client Secret
#
# Export them into the shell first; the checks below abort loudly if unset,
# so a half-filled .env never reaches production.
: "${INFISICAL_CLIENT_ID:?INFISICAL_CLIENT_ID is not set. Get it: railway variables --kv | grep INFISICAL_CLIENT_ID}"
: "${INFISICAL_CLIENT_SECRET:?INFISICAL_CLIENT_SECRET is not set. Get it: railway variables --kv | grep INFISICAL_CLIENT_SECRET}"
: "${INFISICAL_PROJECT_ID:?INFISICAL_PROJECT_ID is not set. Get it: railway variables --kv | grep INFISICAL_PROJECT_ID}"

cat >> /tmp/prod.env <<EOF

INFISICAL_CLIENT_ID=${INFISICAL_CLIENT_ID}
INFISICAL_CLIENT_SECRET=${INFISICAL_CLIENT_SECRET}
INFISICAL_PROJECT_ID=${INFISICAL_PROJECT_ID}
EOF

# Step 3: Upload to production
cat /tmp/prod.env | ssh prod999 "cat > /root/bot-farm/.env"

# Step 4: Restart Docker container
ssh prod999 "cd /root/bot-farm && docker compose restart app"

# Wait for startup
sleep 15

# Step 5: Verify keys loaded
ssh prod999 "docker exec 999-multibots printenv | grep -E 'HEYGEN|ELEVENLABS' | sort"
```

## Expected API Keys

After restoration, verify these 6 keys are present:

```
HEYGEN_COCOAGE_API_KEY=sk_V2_hgu_kZgKPoImFA5_7wlQLLXqKLr2mag1hIM9caNiPtAYmjkj
HEYGEN_HAIM_API_KEY=sk_V2_hgu_kBLbUbWT3dT_i0NzHVIT9R8GNZR3xu8Ccw8RT6gIBNPJ
ELEVENLABS_API_KEY=737d2f8b185450984e1525893f0327f48736fe9e9d850d52cb63834337ca7dc4
ELEVENLABS_HAIM_API_KEY=737d2f8b185450984e1525893f0327f48736fe9e9d850d52cb63834337ca7dc4
ELEVENLABS_VOICE_COCOAGE=2b2e1f15157b454487f1250ffe586d7a
ELEVENLABS_VOICE_HAIM=dc9cd149b0d741d6934a1d95e3f3ef00
```

## Common Issues & Fixes

### Issue 1: Quotes in .env

**Problem**: Docker Compose doesn't understand single quotes

```bash
# ❌ Wrong
HEYGEN_API_KEY='sk_V2_hgu_...'

# ✅ Correct
HEYGEN_API_KEY=sk_V2_hgu_...

# Fix with sed
sed "s/'//g" .env > .env.fixed
```

### Issue 2: Infisical credentials missing from docker-compose.yml

**Problem**: Environment variables not declared
**Fix**: Add to docker-compose.yml → services.app.environment:

```yaml
- INFISICAL_CLIENT_ID=${INFISICAL_CLIENT_ID}
- INFISICAL_CLIENT_SECRET=${INFISICAL_CLIENT_SECRET}
- INFISICAL_PROJECT_ID=${INFISICAL_PROJECT_ID}
```

### Issue 3: Infisical doesn't export its own credentials

**Problem**: After export, INFISICAL\_\* vars are missing
**Fix**: Always append them manually (script does this automatically)

## Performance Metrics

- **Automatic restoration**: 2-3 minutes
- **Manual restoration**: 5-7 minutes
- **Container restart**: +2 minutes
- **Total downtime**: 4-9 minutes

## Verification Checklist

After restoration, verify:

- [ ] `.env` file exists on production server
- [ ] `.env` has 70+ lines
- [ ] All 6 avatar keys present
- [ ] No quotes around values
- [ ] Docker container restarted successfully
- [ ] Keys loaded in container environment
- [ ] All bots started without errors
- [ ] No "api_key is empty" errors in logs

## Related Resources

- **Script**: `scripts/infisical/restore-env-from-infisical.sh`
- **Documentation**: `docs/INFISICAL_ENV_MANAGEMENT.md`
- **API Keys Mapping**: `docs/AVATAR_API_KEYS.md`
- **Production Server**: 212.86.115.30 (ssh alias: prod999)

## Safety Notes

**Always create backup before modifying .env:**

```bash
ssh prod999 "cp /root/bot-farm/.env /root/bot-farm/.env.backup.$(date +%Y%m%d_%H%M%S)"
```

**Never commit .env to git:**

- .env is in .gitignore
- Only .env.example should be in repository
- All real secrets live in Infisical Cloud

## Success Indicators

After successful restoration:

```bash
# Check bot logs
ssh prod999 "docker logs --tail 30 999-multibots | grep '✅'"

# Should show:
✅ Все боты успешно запущены
✅ [MULTI-BOT] Зарегистрирован бот: ...
```

## Troubleshooting

If restoration fails, check:

1. Infisical credentials are correct
2. Network access to Infisical Cloud
3. Docker Compose syntax is valid
4. Sufficient disk space on server
5. No file permission issues

**For urgent issues, contact DevOps team immediately.**
