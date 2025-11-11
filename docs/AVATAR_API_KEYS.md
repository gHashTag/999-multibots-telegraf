# Avatar API Keys Configuration

## 📋 Overview

This document describes all API keys and voice IDs for avatar-based services (HeyGen, ElevenLabs) stored in Infisical.

## 🔐 Infisical Environment: `prod`

All keys are stored in Infisical cloud under:
- **Project ID**: `fd763fa3-35d5-4045-93bd-1795c5f00fc3`
- **Environment**: `prod`
- **Path**: `/`

## 🎭 HeyGen API Keys

HeyGen is used for avatar video generation with lip-sync.

### API Keys

| Variable Name | Avatar | Description |
|--------------|---------|-------------|
| `HEYGEN_COCOAGE_API_KEY` | Cocoage | HeyGen API key for Cocoage avatar |
| `HEYGEN_HAIM_API_KEY` | Haim | HeyGen API key for Haim avatar |

### Usage Example

```typescript
import { getSecret } from '@/core/infisical'

const heygenKey = await getSecret('HEYGEN_COCOAGE_API_KEY')
// or
const heygenKey = await getSecret('HEYGEN_HAIM_API_KEY')

// Use with HeyGen API
const response = await fetch('https://api.heygen.com/v1/video.generate', {
  headers: {
    'x-api-key': heygenKey
  },
  body: JSON.stringify({
    // ... request body
  })
})
```

## 🎤 ElevenLabs API Keys

ElevenLabs is used for voice synthesis and audio generation.

### API Key

| Variable Name | Description |
|--------------|-------------|
| `ELEVENLABS_API_KEY` | Main API key for all ElevenLabs requests |

### Voice IDs

| Variable Name | Avatar | Voice ID | Description |
|--------------|---------|----------|-------------|
| `ELEVENLABS_VOICE_COCOAGE` | Cocoage | `2b2e1f15157b454487f1250ffe586d7a` | Voice profile for Cocoage avatar |
| `ELEVENLABS_VOICE_HAIM` | Haim | `dc9cd149b0d741d6934a1d95e3f3ef00` | Voice profile for Haim avatar |

### Usage Example

```typescript
import { getSecret } from '@/core/infisical'

// Get API key and voice ID
const apiKey = await getSecret('ELEVENLABS_API_KEY')
const voiceId = await getSecret('ELEVENLABS_VOICE_COCOAGE') // or ELEVENLABS_VOICE_HAIM

// Generate audio with ElevenLabs
const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
  method: 'POST',
  headers: {
    'xi-api-key': apiKey,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    text: "Hello, this is Cocoage speaking!",
    model_id: "eleven_multilingual_v2",
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75
    }
  })
})
```

## 📝 Avatar Mapping

| Avatar Name | HeyGen Key | ElevenLabs Voice ID |
|------------|-----------|-------------------|
| Cocoage | `HEYGEN_COCOAGE_API_KEY` | `ELEVENLABS_VOICE_COCOAGE` |
| Haim | `HEYGEN_HAIM_API_KEY` | `ELEVENLABS_VOICE_HAIM` |

## 🔄 Key Rotation

When rotating keys:

1. **Update in Infisical first**:
   ```bash
   infisical secrets set HEYGEN_COCOAGE_API_KEY='new_key_here' \
     --projectId=fd763fa3-35d5-4045-93bd-1795c5f00fc3 \
     --env=prod \
     --path=/
   ```

2. **Restart application** to load new keys:
   ```bash
   ssh prod999 "cd /root/bot-farm && docker compose restart"
   ```

3. **No code changes needed** - keys are loaded dynamically from Infisical

## ✅ Verification

Check all avatar keys are loaded:

```bash
# List all secrets containing "HEYGEN" or "ELEVENLABS"
infisical secrets list \
  --projectId=fd763fa3-35d5-4045-93bd-1795c5f00fc3 \
  --env=prod \
  --path=/ | grep -E "(HEYGEN|ELEVENLABS)"
```

## 🚨 Security Notes

1. **Never commit these keys to Git**
2. **Only store in Infisical** (cloud secret manager)
3. **Use environment-based access** (prod keys only in production)
4. **Rotate keys quarterly** or immediately if compromised
5. **Monitor API usage** for each key to detect anomalies

## 📚 Related Documentation

- [Infisical Setup Guide](../src/core/infisical/README.md)
- [HeyGen API Docs](https://docs.heygen.com/)
- [ElevenLabs API Docs](https://elevenlabs.io/docs/)
- [Avatar Configuration](./AVATAR_CONFIG.md)

---

**Last Updated**: 2025-11-12
**Maintained by**: DevOps Team
