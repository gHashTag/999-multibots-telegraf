// Vercel Serverless Function for AI Script Generation using xAI Grok
// Automatically deployed to: /api/generate-script

const XAI_API_URL = 'https://api.x.ai/v1/chat/completions'
const XAI_API_KEY = process.env.XAI_API_KEY

// Падаем на старте, а не на третьем вызове с невнятным 401 от api.x.ai.
if (!XAI_API_KEY) {
  console.error(
    'XAI_API_KEY не задан. Взять: railway variables --kv | grep XAI_API_KEY ' +
      '(сервис vibee, apps/vibee-editor/railway.toml), либо выпустить новый ключ на https://console.x.ai/. ' +
      'Задать: railway variables --set XAI_API_KEY=<значение>'
  )
  process.exit(1)
}

export default async function handler(req, res) {
  // CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(404).json({ error: 'Not Found' })
  }

  try {
    const { topic, niche, style, duration, language } = req.body

    if (!topic || topic.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'topic is required',
      })
    }

    const lang = language || 'English'
    const dur = duration || '30 seconds'
    const styl = style || 'engaging and informative'
    const nich = niche ? ` in the ${niche} niche` : ''

    const systemPrompt = `You are a professional video script writer. Generate scripts for short-form videos.
Return ONLY valid JSON in this exact format:
{
  "voiceover": "spoken text for narration",
  "cover_prompt": "detailed image generation prompt for the thumbnail/cover",
  "broll_prompts": ["prompt1", "prompt2", "prompt3"],
  "captions": ["caption1", "caption2"]
}`

    const userPrompt = `Create a ${dur} ${styl} video script about: ${topic}${nich}
Language: ${lang}

The script should be:
- Concise and engaging
- Suitable for short-form video (TikTok, Reels, YouTube Shorts)
- Include visual descriptions for b-roll
- Include catchy captions for text overlays

Return ONLY the JSON, no additional text.`

    const response = await fetch(XAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-beta',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('xAI API error:', errorText)
      return res.status(500).json({
        success: false,
        error: 'Failed to generate script',
      })
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      return res.status(500).json({
        success: false,
        error: 'No response from AI',
      })
    }

    // Parse JSON from LLM response
    let jsonContent = content.trim()
    if (jsonContent.startsWith('```json')) jsonContent = jsonContent.slice(7)
    else if (jsonContent.startsWith('```')) jsonContent = jsonContent.slice(3)
    if (jsonContent.endsWith('```')) jsonContent = jsonContent.slice(0, -3)
    jsonContent = jsonContent.trim()

    let scriptData
    try {
      scriptData = JSON.parse(jsonContent)
    } catch {
      const jsonMatch = jsonContent.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        scriptData = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Failed to parse JSON')
      }
    }

    res.setHeader('Access-Control-Allow-Origin', '*')
    return res.json({
      success: true,
      voiceover: scriptData.voiceover || '',
      cover_prompt: scriptData.cover_prompt || '',
      broll_prompts: scriptData.broll_prompts || [],
      captions: scriptData.captions || [],
    })
  } catch (error) {
    console.error('Handler error:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    })
  }
}
