// Simple Node.js server for script generation - запуск на VPS/Render/Railway
const http = require('http')

const XAI_API_KEY = process.env.XAI_API_KEY
const PORT = process.env.PORT || 3001
const SAFE_BETA_LOCKED = true
const SAFE_BETA_DENIAL = Object.freeze({ error: 'SAFE_BETA_PAID_DISABLED' })

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.writeHead(204).end()

  // Immutable release lock: no environment value or request payload can reach
  // parsing or the paid provider call in SAFE BETA.
  if (SAFE_BETA_LOCKED) {
    res.writeHead(423, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify(SAFE_BETA_DENIAL))
  }

  // Только POST /api/ai/generate-script
  if (req.method !== 'POST' || req.url !== '/api/ai/generate-script') {
    return res.writeHead(404).end('Not Found')
  }

  try {
    let body = ''
    req.on('data', chunk => (body += chunk))
    req.on('end', async () => {
      try {
        const { topic, niche, style, duration, language } = JSON.parse(body)

        if (!topic?.trim()) {
          return res
            .writeHead(400)
            .end(JSON.stringify({ success: false, error: 'topic required' }))
        }

        const lang = language || 'English'
        const dur = duration || '30 seconds'
        const styl = style || 'engaging'
        const nich = niche ? ` in ${niche}` : ''

        // Call xAI
        const xaiReq = http.request(
          'https://api.x.ai',
          {
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${XAI_API_KEY}`,
              Host: 'api.x.ai',
            },
          },
          xaiRes => {
            let data = ''
            xaiRes.on('data', chunk => (data += chunk))
            xaiRes.on('end', () => {
              try {
                const d = JSON.parse(data)
                let c = d.choices?.[0]?.message?.content || '{}'
                c = c.replace(/```json?/g, '').trim()
                const m = c.match(/\{[\s\S]*\}/)
                const s = m ? JSON.parse(m[0]) : {}

                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(
                  JSON.stringify({
                    success: true,
                    voiceover: s.voiceover || '',
                    cover_prompt: s.cover_prompt || '',
                    broll_prompts: s.broll_prompts || [],
                    captions: s.captions || [],
                  })
                )
              } catch (e) {
                res
                  .writeHead(500)
                  .end(JSON.stringify({ success: false, error: e.message }))
              }
            })
          }
        )

        xaiReq.on('error', err => {
          res
            .writeHead(500)
            .end(JSON.stringify({ success: false, error: err.message }))
        })

        xaiReq.write(
          JSON.stringify({
            model: 'grok-beta',
            messages: [
              {
                role: 'system',
                content:
                  'Return JSON: {voiceover, cover_prompt, broll_prompts[], captions[]}',
              },
              {
                role: 'user',
                content: `${dur} ${styl} video about ${topic}${nich}. Language: ${lang}. Return ONLY JSON.`,
              },
            ],
            temperature: 0.7,
            max_tokens: 2000,
          })
        )
        xaiReq.end()
      } catch (e) {
        res
          .writeHead(500)
          .end(JSON.stringify({ success: false, error: e.message }))
      }
    })
  } catch (e) {
    res.writeHead(500).end(JSON.stringify({ success: false, error: e.message }))
  }
})

server.listen(PORT, () =>
  console.log(
    `Script server running on port ${PORT}; SAFE BETA paid operations disabled`
  )
)
