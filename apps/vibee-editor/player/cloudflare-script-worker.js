// Cloudflare Worker for AI Script Generation using xAI Grok
// Deploy: wrangler deploy
// Endpoint: https://script-worker.vibee-vibee.workers.dev/api/ai/generate-script

const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';

export default {
  async fetch(request, env, ctx) {
    // CORS handling
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    const url = new URL(request.url);

    // Only handle POST to /api/ai/generate-script
    if (request.method !== 'POST' || url.pathname !== '/api/ai/generate-script') {
      return new Response('Not Found', { status: 404 });
    }

    try {
      const body = await request.json();
      const { topic, niche, style, duration, language } = body;

      if (!topic || topic.trim() === '') {
        return jsonResponse({
          success: false,
          error: 'topic is required'
        }, 400);
      }

      // Build prompt
      const lang = language || 'English';
      const dur = duration || '30 seconds';
      const styl = style || 'engaging and informative';
      const nich = niche ? ` in the ${niche} niche` : '';

      const systemPrompt = `You are a professional video script writer. Generate scripts for short-form videos.
Return ONLY valid JSON in this exact format:
{
  "voiceover": "spoken text for narration",
  "cover_prompt": "detailed image generation prompt for the thumbnail/cover",
  "broll_prompts": ["prompt1", "prompt2", "prompt3"],
  "captions": ["caption1", "caption2"]
}`;

      const userPrompt = `Create a ${dur} ${styl} video script about: ${topic}${nich}
Language: ${lang}

The script should be:
- Concise and engaging
- Suitable for short-form video (TikTok, Reels, YouTube Shorts)
- Include visual descriptions for b-roll
- Include catchy captions for text overlays

Return ONLY the JSON, no additional text.`;

      // Call xAI API
      const response = await fetch(XAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'grok-beta',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('xAI API error:', errorText);
        return jsonResponse({
          success: false,
          error: 'Failed to generate script'
        }, 500);
      }

      const data = await response.json();

      // Extract content from response
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        return jsonResponse({
          success: false,
          error: 'No response from AI'
        }, 500);
      }

      // Parse JSON from LLM response (may have markdown code blocks)
      let jsonContent = content.trim();

      // Remove markdown code blocks if present
      if (jsonContent.startsWith('```json')) {
        jsonContent = jsonContent.slice(7);
      } else if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.slice(3);
      }

      if (jsonContent.endsWith('```')) {
        jsonContent = jsonContent.slice(0, -3);
      }
      jsonContent = jsonContent.trim();

      let scriptData;
      try {
        scriptData = JSON.parse(jsonContent);
      } catch (e) {
        // Try to extract JSON from response
        const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          scriptData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Failed to parse JSON');
        }
      }

      // Return success response
      return jsonResponse({
        success: true,
        voiceover: scriptData.voiceover || '',
        cover_prompt: scriptData.cover_prompt || '',
        broll_prompts: scriptData.broll_prompts || [],
        captions: scriptData.captions || []
      });

    } catch (error) {
      console.error('Worker error:', error);
      return jsonResponse({
        success: false,
        error: error.message || 'Internal server error'
      }, 500);
    }
  },
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
