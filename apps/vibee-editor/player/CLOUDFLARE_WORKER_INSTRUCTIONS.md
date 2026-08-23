# 🚀 Простая инструкция деплоя

## Вариант: Cloudflare Worker (через Dashboard)

### 1. Открой Cloudflare Dashboard

https://dash.cloudflare.com/

### 2. Перейди в Workers & Pages

→ Create → Create Worker → Название: `script-worker`

### 3. Заведи секрет `XAI_API_KEY` (НЕ вставляй ключ в код воркера)

Dashboard → Worker `script-worker` → Settings → Variables and Secrets →
Add → тип **Secret**, имя `XAI_API_KEY`, значение — настоящий ключ.

Либо из терминала:

```bash
wrangler secret put XAI_API_KEY   # значение вводится интерактивно, в репозиторий не попадает
```

**Где взять настоящее значение:** `railway variables --kv | grep XAI_API_KEY`
(сервис vibee, `apps/vibee-editor/railway.toml`), либо выпустить новый ключ на
https://console.x.ai/ → API Keys.

Плейсхолдер для локальной проверки — `XAI_API_KEY=<xai-...-ваш-ключ>`; ключ
вида `xai-...`, длина 84 символа. Хардкод ключа в теле воркера недопустим:
он уезжает в деплой-артефакт Cloudflare открытым текстом и виден всем, у кого
есть доступ к аккаунту.

### 4. Скопируй этот код в редактор:

````javascript
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      })
    }

    if (request.method !== 'POST') {
      return new Response('Not Found', { status: 404 })
    }

    // Ключ приходит из секрета воркера (шаг 3), а не из литерала в коде.
    // В workerd нет process.exit - честно отказываем на первом же вызове,
    // вместо пустого Bearer и невнятного 401 от api.x.ai.
    const XAI_API_KEY = env?.XAI_API_KEY
    if (!XAI_API_KEY) {
      console.error(
        'XAI_API_KEY не задан. Задать: wrangler secret put XAI_API_KEY. Значение: railway variables --kv | grep XAI_API_KEY'
      )
      return Response.json(
        {
          success: false,
          error: 'XAI_API_KEY is not configured on the worker',
        },
        { status: 500 }
      )
    }

    try {
      const { topic, niche, style, duration, language } = await request.json()

      if (!topic?.trim()) {
        return Response.json(
          { success: false, error: 'topic required' },
          { status: 400 }
        )
      }

      const lang = language || 'English'
      const dur = duration || '30 seconds'
      const styl = style || 'engaging'
      const nich = niche ? ` in ${niche}` : ''

      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'grok-beta',
          messages: [
            {
              role: 'system',
              content:
                'Generate video script as JSON: {voiceover, cover_prompt, broll_prompts[], captions[]}',
            },
            {
              role: 'user',
              content: `Create ${dur} ${styl} video about: ${topic}${nich}. Language: ${lang}. Return ONLY JSON.`,
            },
          ],
          temperature: 0.7,
          max_tokens: 2000,
        }),
      })

      const data = await response.json()
      let content = data.choices?.[0]?.message?.content || '{}'

      // Remove markdown
      content = content.replace(/```json?/g, '').trim()

      // Parse JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      const scriptData = jsonMatch ? JSON.parse(jsonMatch[0]) : {}

      return Response.json(
        {
          success: true,
          voiceover: scriptData.voiceover || '',
          cover_prompt: scriptData.cover_prompt || '',
          broll_prompts: scriptData.broll_prompts || [],
          captions: scriptData.captions || [],
        },
        {
          headers: { 'Access-Control-Allow-Origin': '*' },
        }
      )
    } catch (error) {
      return Response.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }
  },
}
````

### 5. Нажми Deploy

### 6. Получи URL (вида `https://script-worker.имя-аккаунта.workers.dev`)

### 7. Обнови фронтенд - замени URL в `src/atoms/script.ts`:

```typescript
const SCRIPT_WORKER_URL = 'https://script-worker.твой-аккаунт.workers.dev'
```

---

## Готово! ✅

После деплоя скрипт генерация будет работать на странице https://vibee-player-app.fly.dev/generate/script
