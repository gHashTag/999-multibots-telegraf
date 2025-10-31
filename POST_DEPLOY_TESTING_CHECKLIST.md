# ✅ POST-DEPLOY TESTING CHECKLIST

## 🧪 Complete Testing After Final Deployment

### 1. 🔧 Infrastructure Tests
```bash
# Check container
docker ps | grep 999-multibots

# Check logs
docker logs 999-multibots --tail 50

# Check memory
docker stats 999-multibots --no-stream
```

### 2. 🌐 API Endpoint Tests
```bash
# Health check
curl http://localhost:3000/api/health

# Inngest endpoint
curl http://localhost:3000/api/inngest

# Test voice-avatar API
curl -X POST http://localhost:3000/api/generate/voice-avatar \
  -H "Content-Type: application/json" \
  -d '{"text":"test","voice_id":"test","telegram_id":"test"}'

# Test neuro-photo API
curl -X POST http://localhost:3000/api/generate/neuro-photo-sync \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test","telegram_id":"test","bot_name":"test"}'

# Test competitor API
curl http://localhost:3000/api/competitor-subscriptions?user_telegram_id=test&bot_name=test
```

### 3. 🤖 Bot Function Tests
Test each bot port:
- [ ] Port 2999 - Start command
- [ ] Port 3000 - Main bot
- [ ] Port 3001 - Test bot 1
- [ ] Port 3002 - Test bot 2
- [ ] ... (test ports 3003-3010)

### 4. 🎨 AI Generation Tests
- [ ] Text-to-Image generation
- [ ] Neuro Photo generation
- [ ] Voice Avatar generation
- [ ] Lip Sync generation
- [ ] Video generation

### 5. 📊 Monitoring Tests
- [ ] Competitor monitoring
- [ ] Error monitoring
- [ ] Log monitoring
- [ ] Usage tracking

### 6. 🎓 Training Tests
- [ ] Model training via Replicate
- [ ] Webhook callbacks
- [ ] Training completion

### 7. 💳 Payment Tests
- [ ] Robokassa payment flow
- [ ] Payment success webhooks
- [ ] Balance updates

### 8. ⚡ Inngest Function Tests
Trigger each Inngest function:
- [ ] content/analyze-competitor-reels
- [ ] content/extract-top-content
- [ ] content/find-competitors
- [ ] content/generate-content-scripts
- [ ] content/generate-detailed-script
- [ ] content/generate-scenario-clips
- [ ] instagram/scraper-v2
- [ ] instagram/scraper-v2-simple
- [ ] monitoring/critical-error
- [ ] monitoring/log-monitor
- [ ] training/model-v2
- [ ] training/morph-images
- [ ] generation/neuro-image
- [ ] payments/process
- [ ] broadcast/message
- [ ] render/main
- [ ] render/avatar-video
- [ ] render/riddle

### 9. 🔍 Isolation Verification
```bash
# Check for any calls to 999-agents.site (should be 0)
docker logs 999-multibots 2>&1 | grep "999-agents.site" | wc -l

# Check SERVER_API_URL usage (should be minimal)
docker logs 999-multibots 2>&1 | grep "SERVER_API_URL" | wc -l
```

### 10. 📈 Performance Tests
- [ ] Response times under 5 seconds
- [ ] Memory usage stable
- [ ] No memory leaks
- [ ] Stable under load

---

## ✅ Success Criteria

### Must Pass:
- [ ] All 12 bot ports responding
- [ ] API endpoints returning 200/404 (not errors)
- [ ] Inngest functions registered and working
- [ ] No calls to 999-agents.site
- [ ] No critical errors in logs
- [ ] All AI generation functions working
- [ ] Payment flow working
- [ ] Model training working

### Nice to Have:
- [ ] Fast response times
- [ ] Clean logs (no warnings)
- [ ] Low memory usage

---

## 🚨 If Issues Found

### Check logs:
```bash
# All logs
docker logs 999-multibots 2>&1 | tail -100

# Only errors
docker logs 999-multibots 2>&1 | grep -i "error" | tail -20

# Inngest-specific
docker logs 999-multibots 2>&1 | grep -i "inngest" | tail -20
```

### If container crashes:
```bash
# Check last run
docker logs 999-multibots --tail 200

# Restart
docker restart 999-multibots
```

### If API not responding:
```bash
# Check port
netstat -tulpn | grep 3000

# Check process
ps aux | grep node
```

---

## 📊 Expected Results

### ✅ Isolation Achieved:
- Zero calls to 999-agents.site from bot-farm
- All functions work locally
- Only external AI services (Kie.ai, Replicate, ElevenLabs) called
- Bot-farm fully independent

### 📈 Performance:
- Bot responses: <2 seconds
- AI generation: <30 seconds
- Memory usage: <2GB
- CPU usage: <50%

---

**Testing duration**: 2-4 hours
**Priority**: Critical - test all features before announcing completion