---
name: error-recovery-debugging
description: Comprehensive error recovery and debugging strategies for production Telegram bot. Covers error patterns, diagnostic approaches, rollback procedures, and automated recovery. Use when encountering errors, debugging issues, or need to recover from failures quickly.
---

# 🚑 Error Recovery & Debugging - Система Восстановления

**Философия**: Ошибки неизбежны. Быстрое восстановление критично.

## 🎯 Core Principles

### Principle 1: Fail-Fast, Recover-Fast
```
Detect → Diagnose → Decide → Act → Verify
```

### Principle 2: User Communication
```
NEVER silent failures
ALWAYS inform user what happened
ALWAYS provide next steps
```

### Principle 3: System Safety
```
Production >>> Feature
Rollback >>> Fix forward
Data integrity >>> Speed
```

## 🔍 Error Detection Layers

### Layer 1: Proactive Monitoring
```bash
Automated:
  - /autonomous-monitor  - 24/7 error detection
  - js-error-fixer      - Auto-fix common errors
  - server-health-checker - Regular health checks

Manual:
  - /check              - On-demand diagnostics
  - /logs               - View production logs
```

### Layer 2: User Reports
```
Patterns that trigger investigation:
  - "Not working"       → /user-check + /check
  - "Error"             → Log analysis
  - Telegram ID (8-12 digits) → Auto-trigger telegram-user-manager
  - "Slow"              → Performance analysis
```

### Layer 3: System Metrics
```
Critical Metrics:
  - Container CPU/Memory usage
  - Error rate in logs
  - Database connection pool
  - API response times
  - Balance operations
```

## 🐛 Common Error Categories

### Category 1: Telegram Bot Errors

#### Error: "Cannot read property 'text' of undefined"
```typescript
Cause: Accessing message.text without checking message type

Fix Pattern:
  // ❌ WRONG
  const text = ctx.message.text

  // ✅ CORRECT
  if (!ctx.message || !('text' in ctx.message)) {
    await ctx.reply('Send a text message')
    return
  }
  const text = ctx.message.text

Prevention:
  - Always check message type first
  - Use telegram-scenes-ULTIMATE patterns
  - Type guards for all user inputs
```

#### Error: "400: Bad Request: query is too old"
```typescript
Cause: Calling answerCbQuery() twice or too late

Fix Pattern:
  // ✅ CORRECT
  myScene.action('button', async (ctx) => {
    await ctx.answerCbQuery()  // First line, only once!
    // Rest of logic
  })

Prevention:
  - ALWAYS answerCbQuery() as first line in action handler
  - NEVER call it twice
  - Use telegram-scenes-ULTIMATE Rule #1
```

#### Error: "Cannot set property of undefined"
```typescript
Cause: Session not initialized

Fix Pattern:
  // ✅ CORRECT - Initialize in step 1
  async (ctx) => {
    ctx.session.wizardData = {
      step: 1,
      // all fields
    }
  }

Prevention:
  - Always initialize session in wizard step 1
  - Use telegram-scenes-ULTIMATE Rule #3
```

### Category 2: Database Errors

#### Error: "Connection pool exhausted"
```typescript
Cause: Too many concurrent DB operations

Fix Pattern:
  1. Check connection pool size in Supabase
  2. Implement connection pooling limits
  3. Add retry logic with exponential backoff

Recovery:
  - Restart application
  - Check for connection leaks
  - Monitor pool usage

Prevention:
  - Always close connections
  - Use connection pooling
  - Implement query timeouts
```

#### Error: "User not found"
```typescript
Cause: User not in database

Fix Pattern:
  const user = await getUserByTelegramId(telegramId)
  if (!user) {
    // Option 1: Create user automatically
    await createUser(telegramId)

    // Option 2: Ask user to /start bot first
    await ctx.reply('Use /start to begin')
    return
  }

Prevention:
  - Always check user existence
  - Auto-create users when possible
  - Graceful error messages
```

### Category 3: AI Provider Errors

#### Error: "Rate limit exceeded"
```typescript
Cause: Too many API requests

Fix Pattern:
  // Implement retry with backoff
  const retryWithBackoff = async (fn, maxRetries = 3) => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn()
      } catch (error) {
        if (error.status === 429 && i < maxRetries - 1) {
          const delay = Math.pow(2, i) * 1000
          await sleep(delay)
          continue
        }
        throw error
      }
    }
  }

Prevention:
  - Implement rate limiting
  - Use failover providers
  - Queue requests when needed
```

#### Error: "Model prediction failed"
```typescript
Cause: Various - bad input, model error, timeout

Fix Pattern:
  try {
    const result = await provider.generate(params)
    return result
  } catch (error) {
    logger.error('Generation failed', { error, params })

    // Refund user if balance deducted
    if (balanceDeducted) {
      await updateUserBalance(telegramId, +COST)
      logger.info('Balance refunded', { telegramId, amount: COST })
    }

    // Inform user
    await ctx.reply(
      isRu
        ? '❌ Ошибка генерации. Баланс восстановлен.'
        : '❌ Generation failed. Balance refunded.'
    )
  }

Prevention:
  - Validate inputs before API call
  - Implement timeouts
  - Always refund on failure
```

### Category 4: Payment Errors

#### Error: "Balance deduction failed"
```typescript
Cause: Race condition, insufficient balance, DB error

Fix Pattern:
  // Use atomic transaction
  const { data, error } = await supabase.rpc('deduct_balance', {
    p_telegram_id: telegramId,
    p_amount: cost
  })

  if (error || !data) {
    await ctx.reply('❌ Balance update failed. Try again.')
    return
  }

Prevention:
  - Use database transactions
  - Implement idempotency keys
  - Check balance BEFORE operation
  - Validate balance AFTER deduction
```

#### Error: "Payment webhook not received"
```typescript
Cause: Network issues, provider downtime

Recovery Process:
  1. Check payment provider dashboard
  2. Verify webhook endpoint is accessible
  3. Check webhook logs
  4. Manual verification if needed:
     - Confirm payment in provider
     - Manually credit user
     - Log for audit

Prevention:
  - Implement webhook retry
  - Monitor webhook health
  - Have manual override process
```

### Category 5: Deployment Errors

#### Error: "Docker build failed"
```bash
Cause: Build errors, dependency issues

Diagnostic Process:
  1. Check build logs:
     docker logs 999-multibots

  2. Common causes:
     - TypeScript errors → npm run typecheck
     - Missing dependencies → npm install
     - Out of disk space → df -h

  3. Recovery:
     - Fix issues
     - Rebuild: docker build --no-cache
     - Test: docker run locally first

Prevention:
  - Always typecheck before deploy
  - Test build locally
  - Clean build cache periodically
```

#### Error: "Container crash loop"
```bash
Cause: Runtime error on startup

Diagnostic Process:
  1. View logs:
     docker logs 999-multibots --tail 100

  2. Check for:
     - Missing environment variables
     - Database connection issues
     - Port conflicts
     - Infisical connection failure

  3. Recovery:
     - Fix configuration
     - Restart container
     - Rollback if needed

Prevention:
  - Validate configuration before start
  - Test startup process
  - Implement health checks
```

## 🔄 Recovery Workflows

### Workflow 1: User Reports Issue
```yaml
Triggered by: User message mentioning problem

Step 1: Gather Context
  - Run: /user-check [telegram_id]
  - Check: Balance, subscription, recent activity
  - Verify: User exists, account valid

Step 2: System Diagnostics
  - Run: /check
  - Review: Server health, recent errors
  - Identify: Any system-wide issues

Step 3: Log Analysis
  - Run: /logs
  - Search: User's telegram_id in logs
  - Find: Specific error messages

Step 4: Diagnosis
  - Match: Error to known patterns (this skill)
  - Identify: Root cause
  - Plan: Recovery steps

Step 5: Fix
  - Apply: Appropriate fix pattern
  - Test: In staging if possible
  - Deploy: If code change needed

Step 6: Validation
  - Verify: Issue resolved
  - Check: User can proceed
  - Monitor: For recurrence

Step 7: Follow-up
  - Update: User on resolution
  - Document: In error recovery log
  - Prevent: Add to automated checks
```

### Workflow 2: Production Error Detected
```yaml
Triggered by: /check showing errors OR autonomous-monitor alert

Step 1: Assess Severity
  Critical:
    - Service down
    - Multiple users affected
    - Data corruption risk
    → Immediate action

  High:
    - Feature broken
    - Some users affected
    - Workaround available
    → Fix within hour

  Medium:
    - Minor issue
    - Few users affected
    - No data risk
    → Fix within day

Step 2: Immediate Mitigation
  If Critical:
    1. Stop the bleeding:
       - Disable problematic feature if possible
       - Rollback to last good version
       - Notify users

    2. Stabilize:
       - Verify core functions work
       - Monitor error rate
       - Prepare for fix

Step 3: Root Cause Analysis
  - Review: Recent changes (git log)
  - Analyze: Error logs and stack traces
  - Identify: Exact cause
  - Consult: Relevant Skills for context

Step 4: Fix Development
  - Plan: Fix approach
  - Test: Locally first
  - Review: With code-reviewer agent
  - Prepare: Rollback plan

Step 5: Deployment
  - Deploy: Using /deploy
  - Monitor: Closely for 30 minutes
  - Verify: Error rate decreased
  - Confirm: Users can use features

Step 6: Post-Mortem
  - Document: What happened, why, how fixed
  - Update: This skill with new pattern
  - Improve: Monitoring/prevention
  - Share: Learnings with team
```

### Workflow 3: Rollback Procedure
```yaml
Triggered by: Deployment causes critical issues

Step 1: Decision to Rollback
  Rollback if:
    - Critical functionality broken
    - Error rate > 10%
    - Data integrity at risk
    - No quick fix available

Step 2: Execute Rollback
  On Server (188.137.250.69):
    1. SSH to server
    2. cd /root/999-agents-telegraf
    3. git log --oneline -10  # Find last good commit
    4. git checkout <last-good-commit>
    5. npm install
    6. npm run build
    7. docker stop 999-multibots
    8. docker rm 999-multibots
    9. docker build --no-cache -t 999-multibots .
    10. docker run -d --name 999-multibots --restart=always \
        -p 3001:3001 \
        -v /root/999-agents-telegraf/.env:/app/.env:ro \
        999-multibots

Step 3: Verification
  - Run: /check
  - Verify: System healthy
  - Test: Core functionality
  - Monitor: For 15 minutes

Step 4: Communication
  - Notify: Users about temporary rollback
  - Explain: Fix is being worked on
  - Timeline: When fix expected

Step 5: Fix Forward
  - Analyze: What went wrong
  - Fix: In development environment
  - Test: Thoroughly
  - Deploy: When confident

Step 6: Documentation
  - Log: Rollback in deployment history
  - Update: Deployment procedures
  - Improve: Pre-deployment checks
```

## 🔧 Diagnostic Tools & Commands

### Quick Diagnostics
```bash
# Health check
/check

# User-specific
/user-check [telegram_id]

# View logs
/logs

# Container status
ssh root@188.137.250.69 'docker ps | grep 999-multibots'

# Resource usage
ssh root@188.137.250.69 'docker stats 999-multibots --no-stream'
```

### Deep Diagnostics
```bash
# Full log analysis
ssh root@188.137.250.69 'docker logs 999-multibots --tail 500 | grep ERROR'

# Database connection test
ssh root@188.137.250.69 'cd /root/999-agents-telegraf && npm run db:test'

# Environment check
ssh root@188.137.250.69 'cd /root/999-agents-telegraf && node -e "console.log(process.env.NODE_ENV)"'

# Infisical status
ssh root@188.137.250.69 'cd /root/999-agents-telegraf && npm run secrets:test'
```

### Performance Diagnostics
```bash
# API response times
ssh root@188.137.250.69 'docker logs 999-multibots --tail 1000 | grep "duration"'

# Memory leaks
ssh root@188.137.250.69 'docker stats 999-multibots'

# Database query performance
Check Supabase dashboard → Logs → Slow queries
```

## 📊 Error Pattern Library

### Pattern: Session Lost
```typescript
Symptom: User loses progress in wizard

Cause:
  - Session timeout
  - Redis connection lost (if used)
  - Server restart

Recovery:
  - Apologize to user
  - Offer to restart from beginning
  - Consider implementing session persistence

Prevention:
  - Increase session timeout
  - Implement session persistence
  - Save critical data to DB during wizard
```

### Pattern: Balance Desync
```typescript
Symptom: User balance different than expected

Cause:
  - Race condition
  - Failed transaction
  - Manual adjustment needed

Recovery:
  1. Check payment history:
     SELECT * FROM payments WHERE telegram_id = 'XXX'

  2. Check asset generation:
     SELECT * FROM assets WHERE telegram_id = 'XXX'

  3. Calculate expected balance:
     initial + payments - usage

  4. If mismatch:
     - Investigate transactions
     - Correct balance manually
     - Log adjustment

Prevention:
  - Use database transactions
  - Implement idempotency
  - Audit balance changes
```

### Pattern: Infinite Loading
```typescript
Symptom: Button shows loading forever

Cause:
  - Missing answerCbQuery()
  - Exception before answerCbQuery()
  - Long operation without feedback

Recovery:
  - User must reload bot /start
  - Fix code to always answer query

Prevention:
  - ALWAYS answerCbQuery() as FIRST line
  - Use try-finally to ensure it's called
  - Send progress updates for long operations
```

## 🎯 Prevention Strategies

### Strategy 1: Comprehensive Testing
```yaml
Before ANY deployment:
  - Unit tests: Core logic
  - Integration tests: API interactions
  - E2E tests: User flows
  - Manual testing: Critical paths
  - Load testing: If touching performance
```

### Strategy 2: Gradual Rollout
```yaml
For major changes:
  1. Deploy to staging first
  2. Test with team members
  3. Deploy to production
  4. Monitor closely for 1 hour
  5. If issues, rollback immediately
```

### Strategy 3: Defensive Programming
```typescript
// Always validate inputs
const validateInput = (input: unknown): input is ValidType => {
  return schema.safeParse(input).success
}

// Always handle errors
try {
  await operation()
} catch (error) {
  logger.error('Operation failed', { error })
  // Inform user
  // Cleanup resources
  // Maybe retry
}

// Always provide feedback
await ctx.reply('⏳ Processing...')
// ... long operation ...
await ctx.editMessageText('✅ Done!')
```

### Strategy 4: Monitoring & Alerting
```yaml
Automated Monitoring:
  - /autonomous-monitor ON
  - js-error-fixer active
  - Regular /check via cron
  - Alert on error rate spike

Manual Monitoring:
  - Check logs after deploy
  - Monitor user reports
  - Review metrics daily
```

## 🎭 Using with Master Orchestrator

```yaml
Orchestrator asks: "How to handle this error?"
Error Recovery answers:
  - Error category: [Type]
  - Known pattern: [Yes/No]
  - Fix pattern: [Steps]
  - Recovery workflow: [Which one]
  - Prevention: [How to avoid]

Orchestrator asks: "Should we rollback?"
Error Recovery provides:
  - Severity assessment
  - Rollback criteria met: [Yes/No]
  - Alternative solutions
  - Risk analysis
  - Recommendation
```

## 📚 Related Skills & Agents

### Skills
```
- master-orchestrator        - Coordination
- project-knowledge-base     - File locations
- telegram-scenes-ULTIMATE   - Scene error patterns
- production-deployment      - Deployment procedures
```

### Agents
```
- server-health-checker      - /check
- js-error-fixer             - Auto-fix JS errors
- autonomous-error-fixer     - 24/7 monitoring
- deployment-manager         - /deploy
- telegram-user-manager      - User issues
```

---

**Created**: 2025-01-11
**Version**: 1.0
**Status**: Production-ready ✅
**Updates**: Add new error patterns as discovered
