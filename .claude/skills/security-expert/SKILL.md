---
name: security-expert
description: Security best practices for Telegram bots with payment integration. Covers API key management, authentication, SQL injection prevention, XSS, webhook security, rate limiting, and OWASP Top 10. CRITICAL for projects handling payments and user data. Use for security audits, vulnerability detection, and secure coding practices.
---

# 🔐 Security Expert - Хранитель Безопасности

**Sanskrit Wisdom**: 🕉️ *"रक्षणं सर्वधर्मेषु"* (Rakshanam Sarva Dharmeshu) - "Защита превыше всех обязанностей"

**Философия**: "Security is not a feature. Security is a foundation. One vulnerability = total compromise."

## 🎯 Core Knowledge

Этот Skill обеспечивает безопасность через:
- 🔐 API key management (Infisical patterns)
- 🛡️ Authentication & Authorization
- 💉 SQL injection prevention
- 🚫 XSS prevention
- 🔒 Webhook signature verification
- ⚡ Rate limiting patterns
- 🔍 OWASP Top 10 coverage
- 📊 Security audit checklists

**CRITICAL Importance**: Проект обрабатывает **платежи** и **персональные данные пользователей**!

---

## 🔐 API Key Management

### Principle 1: NEVER Store Keys in Code

```typescript
// ❌ КРИТИЧЕСКАЯ ОШИБКА - ключ в коде
const HEYGEN_API_KEY = 'hey_abc123xyz456';

export async function generateAvatar() {
  const response = await fetch('https://api.heygen.com/v1/generate', {
    headers: {
      'X-Api-Key': HEYGEN_API_KEY  // ❌ Exposed in git!
    }
  });
}

// ✅ ПРАВИЛЬНО - ключ из Infisical/env
import { getSecret } from '@/core/infisical/client';

export async function generateAvatar() {
  const apiKey = await getSecret('HEYGEN_API_KEY');

  const response = await fetch('https://api.heygen.com/v1/generate', {
    headers: {
      'X-Api-Key': apiKey
    }
  });
}
```

### Principle 2: Only 5 Variables in .env

**Правило из проекта**: `.env` содержит ТОЛЬКО:
```bash
# .env (ONLY these 5 variables)
INFISICAL_CLIENT_ID=xxx
INFISICAL_CLIENT_SECRET=xxx
INFISICAL_PROJECT_ID=xxx
INFISICAL_ENVIRONMENT=production
BOT_TOKEN=xxx (deprecated, use Infisical)
```

**Все остальные секреты** → Infisical Cloud (50+ secrets)

### Principle 3: Different Keys for Different Environments

```typescript
// ❌ BAD - one API key for dev and prod
const apiKey = await getSecret('HEYGEN_API_KEY');

// ✅ GOOD - environment-specific keys
const environment = process.env.NODE_ENV || 'development';
const apiKey = await getSecret(
  environment === 'production'
    ? 'HEYGEN_API_KEY_PROD'
    : 'HEYGEN_API_KEY_DEV'
);
```

### Audit Checklist: API Keys

```bash
#!/bin/bash
# scripts/audit-api-keys.sh

echo "🔍 Auditing API keys..."

# 1. Check for hardcoded keys in code
echo "Checking for hardcoded API keys..."
HARDCODED=$(grep -r "api_key\|apiKey\|API_KEY" src/ | \
  grep -v "getSecret\|process.env" | \
  grep -E "=\s*['\"][a-zA-Z0-9]{20,}")

if [ -n "$HARDCODED" ]; then
  echo "❌ CRITICAL: Hardcoded API keys found!"
  echo "$HARDCODED"
  exit 1
fi

# 2. Check .env file size (should only have 5 vars)
ENV_COUNT=$(grep -v "^#" .env | grep -v "^$" | wc -l | tr -d ' ')
if [ "$ENV_COUNT" -gt 5 ]; then
  echo "❌ WARNING: .env has more than 5 variables ($ENV_COUNT)"
  echo "Move secrets to Infisical!"
fi

# 3. Check for keys in git history
echo "Checking git history for leaked keys..."
LEAKED=$(git log -p | grep -E "(api_key|apiKey|API_KEY|password|secret)" | \
  grep -E "=\s*['\"][a-zA-Z0-9]{20,}" | head -5)

if [ -n "$LEAKED" ]; then
  echo "⚠️  WARNING: Potential keys in git history"
  echo "Consider using git-filter-branch or BFG Repo-Cleaner"
fi

echo "✅ API key audit complete"
```

---

## 🛡️ Authentication & Authorization

### Pattern 1: Telegram User Authentication

```typescript
// ✅ GOOD - verify Telegram user authenticity
import { verifyTelegramWebAppData } from '@/helpers/telegram-auth';

export async function handleWebhook(req: Request): Promise<Response> {
  const initData = req.headers.get('X-Telegram-Init-Data');

  // Verify signature
  const isValid = verifyTelegramWebAppData(
    initData,
    process.env.BOT_TOKEN
  );

  if (!isValid) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Extract user data
  const userData = parseTelegramInitData(initData);
  const user = await getUserByTelegramId(userData.user.id);

  // ... proceed with authenticated user ...
}

// Implementation of verification
export function verifyTelegramWebAppData(
  initData: string,
  botToken: string
): boolean {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');

  // Create data-check-string
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  // Calculate expected hash
  const secretKey = createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const expectedHash = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  return hash === expectedHash;
}
```

### Pattern 2: Role-Based Access Control (RBAC)

```typescript
// src/middleware/authorization.ts

export enum UserRole {
  USER = 'user',
  PREMIUM = 'premium',
  ADMIN = 'admin'
}

export interface AuthorizedContext extends Context {
  user: {
    id: string;
    telegramId: string;
    role: UserRole;
    permissions: string[];
  };
}

// Middleware для проверки роли
export function requireRole(allowedRoles: UserRole[]) {
  return async (ctx: Context, next: () => Promise<void>) => {
    const user = await getUserByTelegramId(ctx.from.id);

    if (!user) {
      await ctx.reply('❌ Пользователь не найден');
      return;
    }

    if (!allowedRoles.includes(user.role as UserRole)) {
      await ctx.reply('❌ Недостаточно прав');
      return;
    }

    // Attach user to context
    (ctx as AuthorizedContext).user = user;
    await next();
  };
}

// Usage
bot.command('admin', requireRole([UserRole.ADMIN]), async (ctx) => {
  // Only admins can access
  await ctx.reply('Admin panel...');
});
```

### Pattern 3: Admin-Only Commands

```typescript
// ✅ EXISTING in project - src/middleware/adminOnly.ts
import { Context } from 'telegraf';

const ADMIN_IDS = [144022504]; // Your Telegram ID

export function adminOnly() {
  return async (ctx: Context, next: () => Promise<void>) => {
    if (!ctx.from) {
      return;
    }

    if (!ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.reply('❌ Только для администраторов');
      return;
    }

    await next();
  };
}

// Usage
bot.command('debug', adminOnly(), async (ctx) => {
  // Only you can access
  const stats = await getDatabaseStats();
  await ctx.reply(`Debug info:\n${JSON.stringify(stats, null, 2)}`);
});
```

---

## 💉 SQL Injection Prevention

### Pattern 1: Use Parameterized Queries (Supabase)

```typescript
// ❌ SQL INJECTION VULNERABILITY!
async function getUserByEmail(email: string) {
  // Direct string interpolation = DANGER!
  const { data } = await supabase.rpc('get_user', {
    query: `SELECT * FROM users WHERE email = '${email}'`
  });
  return data;
}

// Attacker input: email = "' OR '1'='1"
// Result: SELECT * FROM users WHERE email = '' OR '1'='1'
// → Returns ALL users!

// ✅ SAFE - parameterized query
async function getUserByEmail(email: string) {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)  // ✅ Supabase escapes automatically
    .single();

  return data;
}
```

### Pattern 2: Validate Input

```typescript
// ✅ Input validation before DB query
async function getUserByEmail(email: string) {
  // 1. Validate format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error('Invalid email format');
  }

  // 2. Sanitize (remove dangerous characters)
  const sanitizedEmail = email
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '');  // Remove quotes

  // 3. Query with validated input
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('email', sanitizedEmail)
    .single();

  return data;
}
```

### Pattern 3: Use ORM/Query Builder (Supabase)

```typescript
// ✅ Supabase query builder is safe by default
const { data, error } = await supabase
  .from('users')
  .select('id, email, balance')
  .eq('telegram_id', telegramId)
  .gte('balance', minBalance)
  .order('created_at', { ascending: false })
  .limit(10);

// All parameters are automatically escaped
// No SQL injection possible
```

---

## 🚫 XSS Prevention

### Pattern 1: Sanitize User Input (Telegram Messages)

```typescript
import DOMPurify from 'isomorphic-dompurify';

// ❌ DANGEROUS - direct use of user input
async function sendCustomMessage(ctx: Context, userText: string) {
  await ctx.replyWithHTML(
    `<b>Your message:</b> ${userText}`  // ❌ XSS if userText contains <script>
  );
}

// ✅ SAFE - sanitize HTML
async function sendCustomMessage(ctx: Context, userText: string) {
  // Remove all HTML tags
  const sanitized = DOMPurify.sanitize(userText, {
    ALLOWED_TAGS: [],  // No HTML allowed
    ALLOWED_ATTR: []
  });

  await ctx.replyWithHTML(
    `<b>Your message:</b> ${sanitized}`
  );
}

// Alternative: Use Markdown instead of HTML
async function sendCustomMessage(ctx: Context, userText: string) {
  // Telegram MarkdownV2 escaping
  const escaped = userText
    .replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');

  await ctx.reply(
    `*Your message:* ${escaped}`,
    { parse_mode: 'MarkdownV2' }
  );
}
```

### Pattern 2: Validate URLs

```typescript
// ❌ DANGEROUS - user-provided URL without validation
async function sendLinkToUser(ctx: Context, url: string) {
  await ctx.reply(
    `Check this link: ${url}`,  // ❌ Could be javascript:alert(1)
    {
      reply_markup: {
        inline_keyboard: [[
          { text: 'Open', url }  // ❌ Dangerous!
        ]]
      }
    }
  );
}

// ✅ SAFE - validate URL scheme
async function sendLinkToUser(ctx: Context, url: string) {
  try {
    const parsed = new URL(url);

    // Only allow safe schemes
    const allowedSchemes = ['http:', 'https:'];
    if (!allowedSchemes.includes(parsed.protocol)) {
      throw new Error('Invalid URL scheme');
    }

    // Optional: whitelist domains
    const allowedDomains = ['heygen.com', 'fal.ai', 'replicate.com'];
    if (!allowedDomains.some(d => parsed.hostname.endsWith(d))) {
      throw new Error('Domain not whitelisted');
    }

    await ctx.reply(
      `Check this link: ${url}`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: 'Open', url }
          ]]
        }
      }
    );
  } catch (error) {
    await ctx.reply('❌ Invalid URL');
  }
}
```

---

## 🔒 Webhook Security

### Pattern 1: Verify Robokassa Signature

```typescript
// src/webhooks/robokassa-webhook.ts

import crypto from 'crypto';

export async function handleRobokassaWebhook(req: Request): Promise<Response> {
  const params = await req.json();

  // 1. Extract signature
  const receivedSignature = params.SignatureValue;

  // 2. Calculate expected signature
  const password2 = await getSecret('ROBOKASSA_PASSWORD_2');

  const signatureString = [
    params.OutSum,
    params.InvId,
    password2,
    params.Shp_user_id
  ].join(':');

  const expectedSignature = crypto
    .createHash('md5')
    .update(signatureString)
    .digest('hex')
    .toUpperCase();

  // 3. Verify signature
  if (receivedSignature !== expectedSignature) {
    console.error('❌ Invalid Robokassa signature');
    return new Response('Invalid signature', { status: 403 });
  }

  // 4. Process payment
  const userId = params.Shp_user_id;
  const amount = parseFloat(params.OutSum);

  await processSuccessfulPayment(userId, amount);

  return new Response(`OK${params.InvId}`, { status: 200 });
}
```

### Pattern 2: Verify Telegram Webhook Signature

```typescript
// Telegram sends X-Telegram-Bot-Api-Secret-Token header
export async function handleTelegramWebhook(req: Request): Promise<Response> {
  const secretToken = await getSecret('TELEGRAM_WEBHOOK_SECRET');
  const receivedToken = req.headers.get('X-Telegram-Bot-Api-Secret-Token');

  // Verify secret token
  if (receivedToken !== secretToken) {
    console.error('❌ Invalid Telegram webhook token');
    return new Response('Forbidden', { status: 403 });
  }

  // Process update
  const update = await req.json();
  await bot.handleUpdate(update);

  return new Response('OK', { status: 200 });
}
```

### Pattern 3: Idempotency for Webhooks

```typescript
// Prevent duplicate webhook processing
const processedWebhooks = new Set<string>();

export async function handleWebhook(req: Request): Promise<Response> {
  const webhookId = req.headers.get('X-Webhook-Id') ||
                    crypto.randomUUID();

  // Check if already processed
  if (processedWebhooks.has(webhookId)) {
    console.log(`⚠️  Duplicate webhook ignored: ${webhookId}`);
    return new Response('Already processed', { status: 200 });
  }

  // Process webhook
  await processPayment(req);

  // Mark as processed (with TTL)
  processedWebhooks.add(webhookId);
  setTimeout(() => {
    processedWebhooks.delete(webhookId);
  }, 24 * 60 * 60 * 1000);  // 24 hours

  return new Response('OK', { status: 200 });
}
```

---

## ⚡ Rate Limiting

### Pattern 1: Express Rate Limiting (Existing in Project)

```typescript
// ✅ EXISTING - from project analysis
import rateLimit from 'express-rate-limit';

// Fixed trust proxy setting (was vulnerability)
app.set('trust proxy', 1);  // ✅ Trust only first proxy (nginx)

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,  // Max 100 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,

  // Get real IP from X-Forwarded-For (nginx)
  keyGenerator: (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
           req.ip ||
           'unknown';
  },

  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

app.use('/api/', limiter);
```

### Pattern 2: Per-User Rate Limiting (Telegram)

```typescript
// Rate limit per Telegram user
const userRateLimits = new Map<number, {
  count: number;
  resetAt: number;
}>();

export function rateLimitPerUser(maxRequests: number, windowMs: number) {
  return async (ctx: Context, next: () => Promise<void>) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const now = Date.now();
    const userLimit = userRateLimits.get(userId);

    // Reset if window expired
    if (!userLimit || now > userLimit.resetAt) {
      userRateLimits.set(userId, {
        count: 1,
        resetAt: now + windowMs
      });
      await next();
      return;
    }

    // Check limit
    if (userLimit.count >= maxRequests) {
      const resetIn = Math.ceil((userLimit.resetAt - now) / 1000);
      await ctx.reply(
        `⏳ Слишком много запросов. Попробуйте через ${resetIn} сек.`
      );
      return;
    }

    // Increment count
    userLimit.count++;
    await next();
  };
}

// Usage
bot.command('generate',
  rateLimitPerUser(5, 60 * 1000),  // 5 requests per minute
  async (ctx) => {
    // ... generation logic ...
  }
);
```

### Pattern 3: Cost-Based Rate Limiting

```typescript
// Rate limit based on operation cost (AI generations are expensive)
interface UserCostTracker {
  totalCost: number;
  resetAt: number;
}

const userCosts = new Map<number, UserCostTracker>();

export function rateLimitByCost(maxCost: number, windowMs: number) {
  return async (ctx: Context, cost: number, next: () => Promise<void>) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const now = Date.now();
    const tracker = userCosts.get(userId);

    if (!tracker || now > tracker.resetAt) {
      userCosts.set(userId, {
        totalCost: cost,
        resetAt: now + windowMs
      });
      await next();
      return;
    }

    if (tracker.totalCost + cost > maxCost) {
      await ctx.reply(
        `⚠️ Превышен лимит операций.\n` +
        `Лимит: ${maxCost} credits\n` +
        `Использовано: ${tracker.totalCost}\n` +
        `Сброс через: ${Math.ceil((tracker.resetAt - now) / 60000)} мин`
      );
      return;
    }

    tracker.totalCost += cost;
    await next();
  };
}

// Usage
async function generateHeyGenAvatar(ctx: Context) {
  const HEYGEN_COST = 50;  // credits

  await rateLimitByCost(200, 60 * 60 * 1000)(  // 200 credits per hour
    ctx,
    HEYGEN_COST,
    async () => {
      // ... generation logic ...
    }
  );
}
```

---

## 🔍 OWASP Top 10 Coverage

### 1. A01:2021 - Broken Access Control ✅

**Covered by**:
- Role-based access control (RBAC)
- Admin-only middleware
- Telegram user verification

### 2. A02:2021 - Cryptographic Failures ✅

**Covered by**:
- Infisical for secrets management
- HTTPS only (nginx configuration)
- Webhook signature verification

### 3. A03:2021 - Injection ✅

**Covered by**:
- Parameterized queries (Supabase)
- Input validation
- HTML sanitization

### 4. A04:2021 - Insecure Design ⚠️

**Need to check**:
- Threat modeling
- Secure design patterns
- Defense in depth

### 5. A05:2021 - Security Misconfiguration ✅

**Covered by**:
- Environment-specific configs
- Secure defaults
- Error handling (no sensitive info in errors)

### 6. A06:2021 - Vulnerable Components ⚠️

**Need to check**:
- `npm audit` regularly
- Dependency updates
- Known CVEs in dependencies

### 7. A07:2021 - Auth Failures ✅

**Covered by**:
- Telegram authentication
- Session management
- Password hashing (if implemented)

### 8. A08:2021 - Data Integrity Failures ✅

**Covered by**:
- Webhook signature verification
- Idempotency keys
- Atomic database transactions

### 9. A09:2021 - Logging Failures ⚠️

**Need to implement**:
- Security event logging
- Log monitoring
- Alerting on suspicious activity

### 10. A10:2021 - SSRF ⚠️

**Need to check**:
- URL validation (implemented above)
- Whitelist external domains
- Network segmentation

---

## 🚨 Security Audit Checklist

### Pre-Deployment Security Audit

```bash
#!/bin/bash
# scripts/security-audit.sh

echo "🔒 Running Security Audit..."
echo "=============================="

EXIT_CODE=0

# 1. Check for secrets in code
echo ""
echo "1️⃣ Checking for hardcoded secrets..."
if grep -r "api_key\|apiKey\|password\|secret" src/ | \
   grep -v "getSecret\|process.env" | \
   grep -E "=\s*['\"][a-zA-Z0-9]{20,}"; then
  echo "❌ CRITICAL: Hardcoded secrets found!"
  EXIT_CODE=1
else
  echo "✅ No hardcoded secrets"
fi

# 2. Check .env file
echo ""
echo "2️⃣ Checking .env file..."
ENV_COUNT=$(grep -v "^#" .env | grep -v "^$" | wc -l | tr -d ' ')
if [ "$ENV_COUNT" -gt 5 ]; then
  echo "⚠️  WARNING: .env has $ENV_COUNT variables (should be ≤5)"
  EXIT_CODE=1
else
  echo "✅ .env file compliant"
fi

# 3. Check dependencies
echo ""
echo "3️⃣ Checking dependencies for vulnerabilities..."
npm audit --audit-level=high
if [ $? -ne 0 ]; then
  echo "❌ CRITICAL: High/Critical vulnerabilities found"
  EXIT_CODE=1
else
  echo "✅ No critical vulnerabilities"
fi

# 4. Check for SQL injection patterns
echo ""
echo "4️⃣ Checking for potential SQL injection..."
if grep -r "\.rpc\|raw\|query.*\$\{" src/ | grep -v "// safe"; then
  echo "⚠️  WARNING: Potential SQL injection patterns found"
  echo "Review these usages manually"
fi

# 5. Check trust proxy setting
echo ""
echo "5️⃣ Checking trust proxy configuration..."
if grep -r "trust proxy.*true" src/; then
  echo "❌ CRITICAL: Insecure trust proxy setting!"
  EXIT_CODE=1
else
  echo "✅ Trust proxy configured securely"
fi

# 6. Check for console.log with sensitive data
echo ""
echo "6️⃣ Checking for sensitive data in logs..."
if grep -r "console\.log.*password\|console\.log.*api_key" src/; then
  echo "⚠️  WARNING: Potential sensitive data in logs"
fi

# 7. Check webhook signature verification
echo ""
echo "7️⃣ Checking webhook signature verification..."
WEBHOOKS=$(find src/webhooks -name "*.ts" 2>/dev/null)
if [ -n "$WEBHOOKS" ]; then
  for file in $WEBHOOKS; do
    if ! grep -q "signature\|SignatureValue\|verify" "$file"; then
      echo "⚠️  WARNING: $file might be missing signature verification"
    fi
  done
else
  echo "✅ No webhooks found"
fi

echo ""
echo "=============================="
if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Security audit PASSED"
else
  echo "❌ Security audit FAILED"
  echo "Fix critical issues before deploying!"
fi

exit $EXIT_CODE
```

---

## 🎯 Integration with Other Skills

### With infisical-secrets

```yaml
infisical-secrets:
  - Manages 50+ secrets in cloud
  - Only 5 variables in .env rule

security-expert:
  - Enforces secrets usage patterns
  - Audits for hardcoded keys
  - Validates secret access

Together: Complete secrets security
```

### With payment-billing-expert

```yaml
payment-billing-expert:
  - Payment processing logic
  - Transaction handling

security-expert:
  - Webhook signature verification
  - Idempotency enforcement
  - SQL injection prevention

Together: Secure payment processing
```

### With code-reviewer

```yaml
code-reviewer:
  - General code quality
  - Best practices enforcement

security-expert:
  - Security-specific checks
  - Vulnerability detection
  - OWASP compliance

Together: Secure and quality code
```

---

## 🕉️ Sanskrit Wisdom for Security

### On Vigilance
*"सदा सावधानम्"* (Sada Savadhanam)
"Всегда будь бдителен"

→ Security требует постоянной vigilance

### On Defense
*"रक्षणं परमं धर्मः"* (Rakshanam Paramam Dharmah)
"Защита - высший долг"

→ Защита данных пользователей - твой долг

### On Prevention
*"प्रतिरोधः उत्तमः चिकित्सा"* (Pratirodha Uttamah Chikitsa)
"Предотвращение - лучшее лечение"

→ Предотврати уязвимости до их эксплуатации

---

**Created**: 2025-01-11
**Version**: 1.0
**Status**: Production-ready ✅
**Priority**: 🔴 CRITICAL
**Philosophy**: "Security is not a feature. Security is a foundation."
**Integration**: Works with infisical-secrets, payment-billing-expert, code-reviewer
