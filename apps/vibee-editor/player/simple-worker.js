// Simple Script Generation Worker - копировать в Cloudflare Dashboard
const KEY = "xai-0qMDhIcMj8FLmmNyLAQxd3FXylOfTRU9rbbgEOwTLMWUk0aX1ci2MZnLSltX7agjZpYmIQ620LCQejpt";

export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return new Response('Not Found', { status: 404 });

    try {
      const { topic, niche, style, duration, language } = await request.json();
      if (!topic?.trim()) return Response.json({ success: false, error: 'topic required' }, { status: 400, headers: cors });

      const lang = language || 'English';
      const dur = duration || '30 seconds';
      const styl = style || 'engaging';
      const nich = niche ? ` in ${niche}` : '';

      const r = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
        body: JSON.stringify({
          model: 'grok-beta',
          messages: [
            { role: 'system', content: 'Return JSON: {voiceover, cover_prompt, broll_prompts[], captions[]}' },
            { role: 'user', content: `${dur} ${styl} video about ${topic}${nich}. Language: ${lang}. Return ONLY JSON.` }
          ],
          temperature: 0.7,
          max_tokens: 2000,
        }),
      });

      const d = await r.json();
      let c = d.choices?.[0]?.message?.content || '{}';
      c = c.replace(/```json?/g, '').trim();
      const m = c.match(/\{[\s\S]*\}/);
      const s = m ? JSON.parse(m[0]) : {};

      return Response.json({
        success: true,
        voiceover: s.voiceover || '',
        cover_prompt: s.cover_prompt || '',
        broll_prompts: s.broll_prompts || [],
        captions: s.captions || []
      }, { headers: cors });
    } catch (e) {
      return Response.json({ success: false, error: e.message }, { status: 500, headers: cors });
    }
  }
};
