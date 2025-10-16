# Video API Testing Best Practices - Quick Reference

## Date: 2025-10-16
## For: Other agents working on video generation features

---

## CRITICAL FINDINGS

### 1. USE WEBHOOKS, NOT POLLING
- Webhooks reduce API overhead by 70-90%
- Must respond within 3 seconds
- Implement idempotency (handle duplicates)
- Verify HMAC signatures for security
- ~20% of webhooks fail without proper implementation

### 2. COST OPTIMIZATION SAVES 85-90%
- Mock APIs during development: $0 cost
- Use "Fast" tier for testing: $0.30/video
- Only use "Quality" tier for final validation: $2.00/video
- Monthly cost: $200-300 (vs $2000+ unoptimized)

### 3. RETRY LOGIC PATTERN
```typescript
// Industry standard retry pattern
maxRetries: 3
delays: [1s, 2s, 4s] // Exponential backoff
retryable: [429, 500, 503, 505]
non-retryable: [400, 401, 402, 404]
```

### 4. TIMEOUT VALUES (2025)
- API request: 20-60 seconds
- Video generation (fast): 2 minutes
- Video generation (quality): 5 minutes
- Webhook response: 3 seconds MAX

### 5. TESTING PHASES
1. Development: 100% mocked ($0)
2. Staging: Limited real API ($5/deployment)
3. Pre-production: Full validation ($10-20/release)
4. Production: Smoke tests ($50-100/month)

### 6. KEY METRICS TO TRACK
- Success rate: Target 95%+
- Webhook success: Target 98%+
- P95 latency: < 5 minutes
- Error rate: < 5%
- Cost per video

### 7. KIE.AI SPECIFICS
- Most affordable provider (25% of Google pricing)
- Veo 3 Fast: $0.30/8s
- Veo 3 Quality: $2.00/8s (1080P)
- Sora 2: $0.15/10s
- Always enable `enableFallback: true`
- Use `callBackUrl` for webhooks

### 8. ERROR HANDLING ESSENTIALS
- Pre-validate prompts (save API costs)
- Categorize errors (retryable vs non-retryable)
- Handle content policy violations gracefully
- Implement fallback models
- Log everything with structured format

### 9. SECURITY REQUIREMENTS
- HTTPS only (no HTTP)
- HMAC-SHA256 signature verification
- Environment variables for API keys
- IP allowlisting when possible
- Unique secrets per integration

### 10. COMMON PITFALLS TO AVOID
- ❌ Polling every 1 second
- ❌ Testing with production quality in dev
- ❌ Missing webhook idempotency
- ❌ No timeout protection
- ❌ Hard-coding API keys
- ❌ Skipping content policy pre-validation
- ❌ No cost monitoring

---

## QUICK START IMPLEMENTATION

1. **Set up mock API** (Mockoon/Apidog)
2. **Implement webhook receiver** with:
   - < 3s response time
   - HMAC verification
   - Idempotency tracking
3. **Add retry logic** (3 attempts, exponential backoff)
4. **Configure timeouts** (60s initial, 300s generation)
5. **Pre-validate prompts** before API calls
6. **Enable fallback** (`enableFallback: true`)
7. **Track metrics** (success rate, cost, latency)
8. **Set up monitoring** (Datadog/Grafana)

---

## CONFIGURATION TEMPLATE

```typescript
const videoAPIConfig = {
  // Provider
  provider: 'kie.ai',
  apiKey: process.env.KIE_AI_API_KEY,
  
  // Webhook
  callBackUrl: 'https://your-domain.com/webhook/video',
  webhookSecret: process.env.WEBHOOK_SECRET,
  
  // Quality/Cost
  quality: process.env.NODE_ENV === 'production' ? 'quality' : 'fast',
  enableFallback: true,
  
  // Timeouts
  requestTimeout: 60000,      // 60s
  generationTimeout: 300000,  // 5min
  webhookTimeout: 3000,       // 3s
  
  // Retry
  maxRetries: 3,
  retryDelay: 1000,           // Base delay (1s, 2s, 4s)
  
  // Monitoring
  trackMetrics: true,
  logLevel: 'info'
}
```

---

## TESTING CHECKLIST

**Development Phase:**
- [ ] Mock API set up (Mockoon/Apidog)
- [ ] Unit tests with 100% mocked responses
- [ ] Integration tests with mocked API
- [ ] Error scenario testing (all status codes)
- [ ] Cost: $0

**Staging Phase:**
- [ ] Real API with test credentials
- [ ] Fast tier only ($0.30/video)
- [ ] 5-second videos for speed
- [ ] 10-20 critical path tests
- [ ] Webhook delivery validation
- [ ] Cost: $3-6 per deployment

**Production Phase:**
- [ ] Smoke tests every 15 minutes
- [ ] Metrics dashboard (Datadog/Grafana)
- [ ] Alerts configured (error rate, cost spikes)
- [ ] Cost monitoring enabled
- [ ] Structured logging
- [ ] Cost: $50-100/month

---

## FILES CREATED

1. `/docs/research/video-api-testing-best-practices-2025.md`
   - Complete research report (15,000+ words)
   - All findings, patterns, and code examples

2. `/docs/research/FINDINGS_SUMMARY.md` (this file)
   - Quick reference for other agents
   - Key takeaways and action items

---

## NEXT STEPS FOR IMPLEMENTATION AGENTS

1. **tdd-test-engineer**: Use mock patterns from research
2. **telegram-scene-builder**: Implement webhook receiver
3. **code-reviewer**: Verify retry logic and error handling
4. **anti-duplication-guardian**: Check for existing webhook code

---

**Research Status:** ✅ COMPLETE
**Implementation Ready:** YES
**Cost Savings Potential:** 85-90%
**Expected ROI:** $1700+/month savings
