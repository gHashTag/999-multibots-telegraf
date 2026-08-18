# 🚀 Простая инструкция деплоя

## Вариант: Cloudflare Worker (через Dashboard)

### 1. Открой Cloudflare Dashboard
https://dash.cloudflare.com/

### 2. Перейди в Workers & Pages
→ Create → Create Worker → Название: `script-worker`

### 3. Скопируй этот код в редактор:

```javascript
const XAI_API_KEY = 'xai-0qMDhIcMj8FLmmNyLAQxd3FXylOfTRU9rbbgEOwTLMWUk0aX1ci2MZnLSltX7agjZpYmIQ620LCQejpt';

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Not Found', { status: 404 });
    }

    try {
      const { topic, niche, style, duration, language } = await request.json();

      if (!topic?.trim()) {
        return Response.json({ success: false, error: 'topic required' }, { status: 400 });
      }

      const lang = language || 'English';
      const dur = duration || '30 seconds';
      const styl = style || 'engaging';
      const nich = niche ? ` in ${niche}` : '';

      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'grok-beta',
          messages: [
            { role: 'system', content: 'Generate video script as JSON: {voiceover, cover_prompt, broll_prompts[], captions[]}' },
            { role: 'user', content: `Create ${dur} ${styl} video about: ${topic}${nich}. Language: ${lang}. Return ONLY JSON.` }
          ],
          temperature: 0.7,
          max_tokens: 2000,
        }),
      });

      const data = await response.json();
      let content = data.choices?.[0]?.message?.content || '{}';

      // Remove markdown
      content = content.replace(/```json?/g, '').trim();

      // Parse JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const scriptData = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

      return Response.json({
        success: true,
        voiceover: scriptData.voiceover || '',
        cover_prompt: scriptData.cover_prompt || '',
        broll_prompts: scriptData.broll_prompts || [],
        captions: scriptData.captions || []
      }, {
        headers: { 'Access-Control-Allow-Origin': '*' }
      });

    } catch (error) {
      return Response.json({ success: false, error: error.message }, { status: 500 });
    }
  }
};
```

### 4. Нажми Deploy

### 5. Получи URL (вида `https://script-worker.имя-аккаунта.workers.dev`)

### 6. Обнови фронтенд - замени URL в `src/atoms/script.ts`:

```typescript
const SCRIPT_WORKER_URL = 'https://script-worker.твой-аккаунт.workers.dev';
```

---

## Готово! ✅

После деплоя скрипт генерация будет работать на странице https://vibee-player-app.fly.dev/generate/script
