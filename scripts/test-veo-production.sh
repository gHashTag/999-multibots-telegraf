#!/bin/bash

echo "Testing Veo 3 generation on production..."
echo "==========================================="

# Test direct API call to production server
echo -e "\n1. Testing Veo 3 Fast generation via production API..."

curl -X POST https://ai-server-production-production-8e2d.up.railway.app/api/v1/veo/generate \
  -H "Content-Type: application/json" \
  -H "x-secret-key: ${SECRET_API_KEY}" \
  -d '{
    "model": "veo3_fast",
    "prompt": "A serene sunset over mountains",
    "aspectRatio": "9:16",
    "telegram_id": "144022504",
    "username": "test_user",
    "is_ru": false,
    "bot_name": "test_bot"
  }' \
  --max-time 10 \
  -w "\nHTTP Status: %{http_code}\n" || echo "Server unavailable - Plan B would activate"

echo -e "\n==========================================="
echo "Test complete. Check Docker logs for Plan A/B activity:"
echo "ssh -i ~/.ssh/selectel root@185.161.67.53 'docker logs f5a64091f270 --tail 50 | grep -E \"PLAN|Veo|KieAi\"'"