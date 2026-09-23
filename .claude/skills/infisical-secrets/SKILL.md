---
name: infisical-secrets
description: Infisical cloud-first secret management, .env configuration rules, and secure credential handling
---

# Infisical Secrets Management Skill

Critical knowledge about Infisical-based secret management in this project.

## Core Principle: Cloud-First Secrets

**ALL secrets are stored in Infisical cloud, NOT in .env files!**

This is a fundamental architectural decision to prevent:

- ❌ Secret leaks in git history
- ❌ Accidental commits of credentials
- ❌ Manual secret synchronization errors
- ❌ Unauthorized access to production secrets

## .env File Rules

### ONLY 5 Variables Allowed in .env

The `.env` file should **ONLY** contain:

```bash
# Infisical Cloud Configuration
INFISICAL_CLIENT_ID=...
INFISICAL_CLIENT_SECRET=...
INFISICAL_PROJECT_ID=...
INFISICAL_ENVIRONMENT=dev    # or prod
NODE_ENV=development         # or production
```

### What AI Agents Must NEVER Do

**CRITICAL WARNING** in `.env` file:

```
⚠️ ⚠️ ⚠️  WARNING FOR AI AGENTS AND AUTOMATION  ⚠️ ⚠️ ⚠️

DO NOT ADD ANY OTHER VARIABLES TO THIS FILE!
DO NOT "FIX" OR "COMPLETE" THIS FILE!
```

**Common AI Agent Mistakes to Avoid:**

1. ❌ Adding missing secrets to .env when code fails
2. ❌ "Completing" .env with BOT_TOKEN, API keys, etc.
3. ❌ "Fixing" .env to include all environment variables
4. ❌ Creating .env.example with all secrets

**Why This Happens:**

- AI sees `process.env.BOT_TOKEN` in code
- AI notices BOT_TOKEN not in .env
- AI "helpfully" adds it → **WRONG!**

**Correct Behavior:**

- Verify Infisical loads secrets correctly
- Check Infisical project configuration
- Ensure NODE_ENV matches Infisical environment

## How Infisical Works

### 1. Startup Process

```typescript
// src/core/infisical/index.ts - initInfisical()
const client = new InfisicalSDK({
  siteUrl: process.env.INFISICAL_SITE_URL || 'https://app.infisical.com',
})

// Service token wins when present, Universal Auth is the fallback
if (process.env.INFISICAL_SERVICE_TOKEN) {
  client.auth().accessToken(process.env.INFISICAL_SERVICE_TOKEN)
} else {
  await client.auth().universalAuth.login({
    clientId: process.env.INFISICAL_CLIENT_ID!,
    clientSecret: process.env.INFISICAL_CLIENT_SECRET!,
  })
}

const result = await client.secrets().listSecrets({
  projectId: process.env.INFISICAL_PROJECT_ID!,
  environment: process.env.INFISICAL_ENVIRONMENT || 'dev',
  secretPath: '/',
})

// Secrets go into an in-memory cache AND into process.env
for (const secret of result.secrets) {
  process.env[secret.secretKey] = secret.secretValue
}
```

Call sites read secrets through the module's helpers - `getSecret`,
`getSecretOrDefault`, `getSecrets`, `getSecretsStats`, `isInfisicalReady`.

### 2. Secret Access

After Infisical initialization, secrets are available normally:

```typescript
// ✅ Correct usage
const botToken = process.env.BOT_TOKEN
const openaiKey = process.env.OPENAI_API_KEY
const supabaseUrl = process.env.SUPABASE_URL
```

**Important:** Secrets only available AFTER Infisical loads!

## Secrets Stored in Infisical

### Bot Tokens

```
BOT_TOKEN_TEST_1
BOT_TOKEN_TEST_2
BOT_TOKEN_PROD
```

### API Keys

```
OPENAI_API_KEY
ANTHROPIC_API_KEY
CLAUDE_API_KEY
REPLICATE_API_TOKEN
FAL_KEY
ELEVENLABS_API_KEY
HEYGEN_API_KEY
```

### Database & Storage

```
SUPABASE_URL
SUPABASE_SERVICE_KEY
SUPABASE_ANON_KEY
DATABASE_URL
```

### Payment Services

```
YOOKASSA_SHOP_ID
YOOKASSA_SECRET_KEY
STRIPE_API_KEY
```

### External Services

```
TELEGRAM_WEBHOOK_URL
GITHUB_TOKEN
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
```

### New Keys (Recently Added)

```
RENDER_INNGEST_EVENT_KEY
RENDER_INNGEST_SIGNING_KEY
```

## Environment Management

### Development Environment

```bash
INFISICAL_ENVIRONMENT=dev
NODE_ENV=development
```

Loads test credentials:

- BOT_TOKEN_TEST_1, BOT_TOKEN_TEST_2
- Development API keys
- Test database connections

### Production Environment

```bash
INFISICAL_ENVIRONMENT=prod
NODE_ENV=production
```

Loads production credentials:

- BOT_TOKEN_PROD
- Production API keys
- Production database URLs

## Adding New Secrets

### Process for Adding Secrets

1. **Add to Infisical Dashboard**
   - Go to Infisical web console
   - Select project
   - Add secret to correct environment (dev/prod)

2. **Use in Code**

   ```typescript
   // Just use it - no .env changes needed!
   const myNewSecret = process.env.MY_NEW_SECRET
   ```

3. **Document in This Skill**
   - Add to secrets list above
   - Note which environment needs it

### Common Patterns

```typescript
// ✅ Good: Check if loaded
if (!process.env.REQUIRED_KEY) {
  console.error('REQUIRED_KEY not loaded from Infisical')
  throw new Error('Missing required secret')
}

// ✅ Good: Provide default for optional secrets
const timeout = parseInt(process.env.TIMEOUT || '30000')

// ❌ Bad: Hardcode secrets
const apiKey = 'sk-abc123...' // NEVER!

// ❌ Bad: Read from .env file
import fs from 'fs'
const envContent = fs.readFileSync('.env', 'utf-8') // NO!
```

## Troubleshooting

### Problem: "Secret not found"

**Check:**

1. Is secret in Infisical dashboard?
2. Is it in correct environment (dev/prod)?
3. Does INFISICAL_ENVIRONMENT match?
4. Did Infisical client initialize successfully?

**Debug:**

```typescript
console.log('Environment:', process.env.INFISICAL_ENVIRONMENT)
console.log(
  'Secrets loaded:',
  Object.keys(process.env).filter(k => !k.startsWith('INFISICAL_')).length
)
```

### Problem: "Infisical connection failed"

**Check:**

1. INFISICAL_CLIENT_ID correct?
2. INFISICAL_CLIENT_SECRET correct?
3. INFISICAL_PROJECT_ID correct?
4. Network connectivity to Infisical API?

**Solution:**

```bash
# Verify credentials in .env
cat .env

# Test Infisical connection (logs in, lists what actually loaded)
npx tsx scripts/infisical/test-infisical.ts

# Same login, but checks the AI-generation keys specifically
npm run test:infisical   # -> scripts/infisical/check-infisical-keys.ts
```

`src/core/infisical/index.ts` is a library module, not a script - running the
file directly does nothing. Use the scripts above; both import `initInfisical`
from it.

### Problem: Production using test credentials

**Check:**

1. Is INFISICAL_ENVIRONMENT=prod on production?
2. Is NODE_ENV=production set?
3. Did deployment script sync .env correctly?

**Fix:**

```bash
# Check production .env
ssh root@188.137.250.69 "cat /root/bot-farm/.env"

# Should show:
# INFISICAL_ENVIRONMENT=prod
# NODE_ENV=production
```

## Security Best Practices

### 1. Never Log Secrets

```typescript
// ❌ Bad
console.log('API Key:', process.env.OPENAI_API_KEY)

// ✅ Good
console.log('API Key loaded:', !!process.env.OPENAI_API_KEY)
```

### 2. Never Commit Secrets

- .env file is in .gitignore
- Never bypass .gitignore for .env
- Never put secrets in code comments

### 3. Rotate Secrets Regularly

- Update in Infisical dashboard
- Restart application to load new secrets
- No code changes needed!

### 4. Use Environment-Specific Secrets

- Different API keys for dev/prod
- Different database URLs
- Different bot tokens

## File Locations

### Configuration Files

```
.env                              # Only Infisical credentials
src/config/index.ts               # Loads .env (Infisical-first, tolerates empty)
src/core/infisical/index.ts       # Infisical initialization + secret accessors
src/utils/env-validator.ts        # Environment validation (zod, production)
scripts/infisical/                # Connection and key-presence check scripts
```

### Documentation

```
.env (header comments)            # AI Agent warnings
CLAUDECODE_RULES.md              # Project rules
.claude/skills/infisical-secrets/ # This skill
```

## Integration with Deployment

### Local Development

```bash
# .env file with dev environment
INFISICAL_ENVIRONMENT=dev
NODE_ENV=development

# Run locally
bun run dev
```

### Production Deployment

```bash
# scripts/deploy.sh syncs .env to production
npm run deploy

# Production .env should have:
INFISICAL_ENVIRONMENT=prod
NODE_ENV=production
```

### Docker Container

Infisical loads secrets on container startup:

1. Container starts
2. Infisical client initializes
3. Secrets loaded from cloud
4. Application starts with all secrets available

## Migration from .env to Infisical

**This project has already migrated!**

Old pattern (deprecated):

```bash
# .env file (50+ variables) ❌
BOT_TOKEN=123456:ABC...
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://...
# ... 47 more secrets
```

New pattern (current):

```bash
# .env file (5 variables only) ✅
INFISICAL_CLIENT_ID=...
INFISICAL_CLIENT_SECRET=...
INFISICAL_PROJECT_ID=...
INFISICAL_ENVIRONMENT=dev
NODE_ENV=development
```

## AI Agent Guidelines

When working with this codebase:

1. **NEVER modify .env** beyond the 5 allowed variables
2. **NEVER suggest** adding secrets to .env
3. **ALWAYS check** if secret exists in Infisical
4. **VERIFY** Infisical initialization succeeds
5. **DOCUMENT** new secrets in Infisical dashboard
6. **TEST** locally before deploying
7. **RESPECT** the cloud-first architecture

## Quick Reference

```typescript
// ✅ How to use secrets
const secret = process.env.SECRET_NAME

// ❌ How NOT to use secrets
// - Never in .env file
// - Never hardcoded in code
// - Never in git commits
// - Never logged to console

// ✅ How to add secrets
// 1. Add to Infisical dashboard
// 2. Use in code
// 3. Done!

// ❌ How NOT to add secrets
// 1. Add to .env file ← WRONG!
// 2. Commit to git ← WRONG!
// 3. Hardcode in code ← WRONG!
```

This is a **critical architectural pattern** that must be preserved and respected by all developers and AI agents.
