# GLM-4.7 Integration Guide

## API Key Addition to Infisical

The GLM-4.7 API key needs to be added to Infisical cloud.

### Via Infisical Dashboard

1. Go to: https://app.infisical.com/
2. Select project: `999-multibots-telegraf` (ID: fd763fa3-35d5-4045-93bd-1795c5f00fc3)
3. Select environment: `prod`
4. Click "Add Secret"
5. Enter:
   - Name: `GLM_API_KEY`
   - Value: `fcbb5dadc5ea462284f5475a04daa174.Ei5KkZb0WQMwasmd`
6. Click "Save"

### Via Infisical CLI (if installed)

```bash
# Set secret for production
infisical secrets set --env=prod --secret-name=GLM_API_KEY --secret-value="fcbb5dadc5ea462284f5475a04daa174.Ei5KkZb0WQMwasmd"

# Verify
infisical secrets list --env=prod | grep GLM_API_KEY
```

## Fallback Chain Order

The AI chat fallback chain is now:

1. **Grok (grok-2-latest)** - Primary (xAI)
   - Status: Out of credits (429 error)
   
2. **GLM-4.7 (glm-4)** - Fallback 1 (Zhipu AI) ⭐ NEW
   - Status: Should work
   
3. **DeepSeek (deepseek-chat)** - Fallback 2
   - Status: No balance (402 error)
   
4. **OpenAI (gpt-4o-mini)** - Fallback 3
   - Status: Should work

## Provider Details

### GLM-4.7 (Zhipu AI)

- **Provider**: Zhipu AI (智谱)
- **Base URL**: https://open.bigmodel.cn/api/paas/v4
- **Model**: glm-4
- **Documentation**: https://open.bigmodel.cn/

### Code Implementation

Files created/modified:

- `src/core/openai/glm-provider.ts` - New GLM provider
- `src/core/openai/requests.ts` - Updated fallback chain
- `src/core/openai/index.ts` - Exported GLM provider
- `src/index.ts` - Added GLM_API_KEY to Infisical load list
- `scripts/infisical/check-infisical-keys.ts` - Added GLM check

## Testing

After adding the key to Infisical, restart the bot:

```bash
# Check if key is loaded
npm run test:infisical

# Restart bot
npm run dev
```

## Troubleshooting

### Issue: GLM_API_KEY not found in logs

**Solution**: Add key to Infisical following the instructions above.

### Issue: GLM API returns 401 Unauthorized

**Solution**: Check API key format. Zhipu AI keys should be in format: `id.secret`

### Issue: GLM fallback not triggered

**Solution**: Check `src/core/openai/requests.ts` logs for fallback chain execution.
