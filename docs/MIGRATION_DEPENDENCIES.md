# 📦 DEPENDENCY ANALYSIS: ai-server vs telegraf

## Current Dependencies Comparison

### ✅ ALREADY EXIST in telegraf (No Action Needed)

| Package | ai-server | telegraf | Notes |
|---------|-----------|----------|-------|
| `inngest` | 3.37.0 | 2.7.2 | ⚠️ **UPGRADE REQUIRED** to 3.37.0 |
| `@supabase/supabase-js` | 2.47.10 | 2.39.3 | ⚠️ Minor upgrade recommended |
| `telegraf` | 4.16.3 | 4.16.3 | ✅ Same version |
| `openai` | 4.77.0 | 4.24.7 | ⚠️ Update recommended |
| `replicate` | 0.32.0 | 0.25.2 | ⚠️ Update recommended |
| `axios` | 1.7.9 | 1.8.2 | ✅ Compatible |
| `dotenv` | 16.0.1 | 16.3.1 | ✅ Compatible |
| `elevenlabs` | 0.16.1 | 0.16.1 | ✅ Same version |
| `zod` | 3.25.76 | 3.23.8 | ⚠️ Update recommended |
| `express` | 4.18.1 | 5.1.0 | ⚠️ Major version diff |
| `bcrypt` | 5.0.1 | 5.1.1 | ✅ Compatible |
| `uuid` | 11.0.3 | 9.0.1 | ⚠️ Update recommended |
| `winston` | 3.8.1 | 3.11.0 | ✅ Compatible |
| `cors` | 2.8.5 | 2.8.5 | ✅ Same version |
| `multer` | 1.4.5-lts.1 | 2.0.1 | ⚠️ Version diff |
| `md5` | 2.3.0 | 2.3.0 | ✅ Same version |
| `jest-mock` | 29.7.0 | 29.7.0 | ✅ Same version |

---

## 🚨 MISSING DEPENDENCIES (Must Add to telegraf)

### Critical for Render Functions

```json
{
  "dependencies": {
    "ssh2": "^1.17.0",
    "@aws-sdk/client-s3": "^3.913.0",
    "@aws-sdk/s3-request-presigner": "^3.913.0",
    "archiver": "^7.0.1",
    "adm-zip": "^0.5.16"
  }
}
```

**Usage**:
- `ssh2`: SSH connections to render server (212.86.115.30)
- `@aws-sdk/client-s3`: S3 uploads for rendered videos
- `@aws-sdk/s3-request-presigner`: Generate presigned URLs
- `archiver`: Create ZIP archives for assets
- `adm-zip`: Extract ZIP files (ALREADY EXISTS in telegraf ✅)

### Optional (for local rendering)

```json
{
  "dependencies": {
    "fluent-ffmpeg": "^2.1.3"
  }
}
```

**Usage**: Local video processing (if needed as fallback)

---

## 🔄 UPGRADE RECOMMENDATIONS

### HIGH PRIORITY (Breaking Changes Possible)

```bash
npm install inngest@^3.37.0    # Major upgrade from 2.7.2
npm install express@^4.18.1     # Downgrade from 5.1.0 (for compatibility)
```

**Why**: Inngest 3.x has API changes that match ai-server implementation.

### MEDIUM PRIORITY (Feature Updates)

```bash
npm install openai@^4.77.0
npm install replicate@^0.32.0
npm install zod@^3.25.76
npm install uuid@^11.0.3
```

### LOW PRIORITY (Minor Updates)

```bash
npm install @supabase/supabase-js@^2.47.10
```

---

## 📋 FULL package.json MERGE

### Add to telegraf package.json

```json
{
  "dependencies": {
    "ssh2": "^1.17.0",
    "@aws-sdk/client-s3": "^3.913.0",
    "@aws-sdk/s3-request-presigner": "^3.913.0",
    "archiver": "^7.0.1",
    "inngest": "^3.37.0",
    "openai": "^4.77.0",
    "replicate": "^0.32.0",
    "zod": "^3.25.76",
    "uuid": "^11.0.3",
    "express": "^4.18.1",
    "@supabase/supabase-js": "^2.47.10",
    "multer": "1.4.5-lts.1"
  }
}
```

---

## 🔧 DevDependencies

### ai-server has (telegraf missing)

```json
{
  "devDependencies": {
    "@inngest/test": "^0.1.6",
    "@swc/cli": "^0.1.57",
    "@swc/core": "^1.2.220",
    "pm2": "^5.2.0"
  }
}
```

**Note**: These are NOT required for telegraf (uses bun, not SWC/PM2).

---

## 🌍 ENVIRONMENT VARIABLES

### ai-server .env (to add to telegraf)

```bash
# Render Server (SSH)
RENDER_SERVER_HOST=212.86.115.30
RENDER_SERVER_USER=root
RENDER_SERVER_SSH_KEY_PATH=/root/.ssh/zomro  # Prod: /root/.ssh/zomro, Local: ~/.ssh/zomro
RENDER_SERVER_PROJECT_PATH=/root/remotion-render

# AWS S3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
AWS_S3_BUCKET=

# Inngest (Production)
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# API Keys (merge with existing)
OPENAI_API_KEY=
REPLICATE_API_TOKEN=
HEDRA_API_KEY=
HEYGEN_API_KEY=
RUNWAY_API_KEY=
ELEVENLABS_API_KEY=
FAL_KEY=

# Nexrender (if used)
NEXRENDER_SERVER_HOST=http://localhost:4001
NEXRENDER_SECRET=myapisecret
```

---

## 🎯 INSTALLATION COMMANDS

### Step 1: Install NEW dependencies

```bash
cd /Users/playra/999-agents-telegraf

# Critical dependencies
npm install ssh2@^1.17.0 \
  @aws-sdk/client-s3@^3.913.0 \
  @aws-sdk/s3-request-presigner@^3.913.0 \
  archiver@^7.0.1

# Optional: fluent-ffmpeg for local rendering
# npm install fluent-ffmpeg@^2.1.3
```

### Step 2: Upgrade EXISTING dependencies

```bash
# HIGH PRIORITY
npm install inngest@^3.37.0

# MEDIUM PRIORITY
npm install openai@^4.77.0 \
  replicate@^0.32.0 \
  zod@^3.25.76 \
  uuid@^11.0.3

# LOW PRIORITY
npm install @supabase/supabase-js@^2.47.10
```

### Step 3: Fix express version (downgrade from 5.x to 4.x)

```bash
npm install express@^4.18.1 --save-exact
```

### Step 4: Verify installations

```bash
npm list inngest ssh2 @aws-sdk/client-s3 archiver
```

---

## ⚠️ POTENTIAL CONFLICTS

### 1. Express 4.x vs 5.x

**Issue**: telegraf has `express@5.1.0`, ai-server uses `express@4.18.1`

**Solution**: Downgrade to 4.x for compatibility with ai-server code:
```bash
npm install express@^4.18.1 --save-exact
```

**Impact**: Express 5.x breaking changes may require code updates. Safer to use 4.x.

### 2. Inngest 2.x → 3.x

**Issue**: Major version upgrade with API changes

**Migration Notes**:
- Event names may need updates
- Function signatures changed
- Middleware API different
- Test thoroughly after upgrade

**Example changes**:
```typescript
// Inngest 2.x (OLD - telegraf current)
export const myFunction = inngest.createFunction(
  { name: "My Function" },
  { event: "my/event" },
  async ({ event, step }) => { /* ... */ }
)

// Inngest 3.x (NEW - ai-server)
export const myFunction = inngest.createFunction(
  { id: "my-function", name: "My Function" },
  { event: "my/event" },
  async ({ event, step }) => { /* ... */ }
)
```

### 3. Multer versions

**Issue**: telegraf has `multer@2.0.1`, ai-server uses `multer@1.4.5-lts.1`

**Solution**: Keep telegraf version (2.x is newer and LTS)

---

## 🧪 TESTING CHECKLIST

After installing dependencies:

```bash
# 1. Build project
npm run build

# 2. Check for TypeScript errors
npm run typecheck

# 3. Run existing tests
npm run test

# 4. Test Inngest functions
npm run dev:inngest  # If script exists

# 5. Test SSH connection to render server
node -e "const SSH2 = require('ssh2'); console.log('SSH2 OK');"

# 6. Test AWS SDK
node -e "const { S3Client } = require('@aws-sdk/client-s3'); console.log('AWS SDK OK');"
```

---

## 📊 DEPENDENCY SIZE IMPACT

| Package | Size (gzipped) | Impact |
|---------|----------------|--------|
| `ssh2` | ~90KB | Medium |
| `@aws-sdk/client-s3` | ~250KB | High |
| `@aws-sdk/s3-request-presigner` | ~10KB | Low |
| `archiver` | ~50KB | Medium |
| **TOTAL NEW** | **~400KB** | **Medium** |

**Note**: Total bundle size increase ~400KB (acceptable for server-side app).

---

## 🚀 INSTALLATION SCRIPT

Create `scripts/install-migration-deps.sh`:

```bash
#!/bin/bash

echo "📦 Installing migration dependencies..."

# Critical dependencies
npm install ssh2@^1.17.0 \
  @aws-sdk/client-s3@^3.913.0 \
  @aws-sdk/s3-request-presigner@^3.913.0 \
  archiver@^7.0.1

# Upgrade inngest
npm install inngest@^3.37.0

# Upgrade other packages
npm install openai@^4.77.0 \
  replicate@^0.32.0 \
  zod@^3.25.76 \
  uuid@^11.0.3 \
  @supabase/supabase-js@^2.47.10

# Downgrade express to 4.x
npm install express@^4.18.1 --save-exact

echo "✅ Dependencies installed!"
echo ""
echo "Next steps:"
echo "  1. npm run build"
echo "  2. npm run typecheck"
echo "  3. npm run test"
```

Run with:
```bash
chmod +x scripts/install-migration-deps.sh
./scripts/install-migration-deps.sh
```

---

## 🔍 VERIFICATION

After installation, verify with:

```bash
# Check installed versions
npm list inngest ssh2 @aws-sdk/client-s3 archiver express

# Expected output:
# inngest@3.37.0
# ssh2@1.17.0
# @aws-sdk/client-s3@3.913.0
# express@4.18.1
```

---

## 📚 REFERENCES

- **Inngest 3.x Migration Guide**: https://www.inngest.com/docs/migration/v3
- **AWS SDK v3 Docs**: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/
- **SSH2 Documentation**: https://github.com/mscdex/ssh2

---

**Document Version**: 1.0
**Last Updated**: 2025-10-30
**Status**: Ready for Implementation
