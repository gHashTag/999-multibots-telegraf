// 🎬 AI Media Server - xAI Grok Imagine + Cartesia
import http from 'http';
import https from 'https';

const PORT = 3001;
const XAI_KEY = process.env.XAI_API_KEY || '';
const CARTESIA_KEY = process.env.CARTESIA_API_KEY || '';

// In-memory storage for pending video requests
const pendingVideos = new Map();

// ==================== HELPERS ====================
function jsonResponse(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ==================== xAI IMAGE GENERATION ====================
function handleImageGen(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const { prompt, aspect_ratio = '16:9', n = 1, image_format = 'url', image_url } = JSON.parse(body);
      if (!prompt?.trim()) return jsonResponse(res, { success: false, error: 'prompt required' }, 400);

      console.log(`🖼️  Image: ${prompt.substring(0, 35)}...`);

      https.request({
        hostname: 'api.x.ai',
        path: '/v1/images/generations',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${XAI_KEY}` }
      }, (imgRes) => {
        let data = '';
        imgRes.on('data', chunk => data += chunk);
        imgRes.on('end', () => {
          if (imgRes.statusCode !== 200) return jsonResponse(res, { success: false, error: data }, imgRes.statusCode);
          const result = JSON.parse(data);
          jsonResponse(res, { success: true, url: result.url, image: result.image });
        });
      }).on('error', err => jsonResponse(res, { success: false, error: err.message }, 500))
        .end(JSON.stringify({ model: 'grok-imagine-image', prompt, n, aspect_ratio, image_format, ...(image_url && { image_url }) }));
    } catch (e) {
      jsonResponse(res, { success: false, error: e.message }, 500);
    }
  });
}

// ==================== xAI VIDEO GENERATION ====================
function handleVideoStart(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const { prompt, duration = 5, aspect_ratio = '16:9', resolution = '720p', image_url, video_url } = JSON.parse(body);
      if (!prompt?.trim()) return jsonResponse(res, { success: false, error: 'prompt required' }, 400);

      console.log(`🎥 Video start: ${prompt.substring(0, 35)}...`);

      https.request({
        hostname: 'api.x.ai',
        path: '/v1/videos/generations',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${XAI_KEY}` }
      }, (vidRes) => {
        let data = '';
        vidRes.on('data', chunk => data += chunk);
        vidRes.on('end', () => {
          if (vidRes.statusCode !== 200) return jsonResponse(res, { success: false, error: data }, vidRes.statusCode);
          const { request_id } = JSON.parse(data);
          pendingVideos.set(request_id, { prompt, started: Date.now() });
          jsonResponse(res, { success: true, request_id });
        });
      }).on('error', err => jsonResponse(res, { success: false, error: err.message }, 500))
        .end(JSON.stringify({ model: 'grok-imagine-video', prompt, duration, aspect_ratio, resolution, ...(image_url && { image_url }), ...(video_url && { video_url }) }));
    } catch (e) {
      jsonResponse(res, { success: false, error: e.message }, 500);
    }
  });
}

function handleVideoPoll(req, res) {
  const requestId = req.url.split('/').pop();
  if (!requestId) return jsonResponse(res, { success: false, error: 'request_id required' }, 400);

  console.log(`🎥 Video poll: ${requestId}`);

  https.request({
    hostname: 'api.x.ai',
    path: `/v1/videos/${requestId}`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${XAI_KEY}` }
  }, (vidRes) => {
    let data = '';
    vidRes.on('data', chunk => data += chunk);
    vidRes.on('end', () => {
      if (vidRes.statusCode !== 200) return jsonResponse(res, { success: false, error: data }, vidRes.statusCode);
      const result = JSON.parse(data);

      if (result.status === 'done') {
        pendingVideos.delete(requestId);
        console.log(`✅ Video ready: ${result.video?.url}`);
      } else if (result.status === 'expired') {
        pendingVideos.delete(requestId);
      }

      jsonResponse(res, { success: true, ...result });
    });
  }).on('error', err => jsonResponse(res, { success: false, error: err.message }, 500)).end();
}

// ==================== xAI SCRIPT GENERATION ====================
function handleScriptGen(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const { topic, niche, style = 'engaging', duration = '30s', language = 'English' } = JSON.parse(body);
      if (!topic?.trim()) return jsonResponse(res, { success: false, error: 'topic required' }, 400);

      console.log(`📜 Script: ${topic}`);

      https.request({
        hostname: 'api.x.ai',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${XAI_KEY}` }
      }, (aiRes) => {
        let data = '';
        aiRes.on('data', chunk => data += chunk);
        aiRes.on('end', () => {
          if (aiRes.statusCode !== 200) return jsonResponse(res, { success: false, error: 'API error' }, 500);
          const d = JSON.parse(data);
          const content = d.choices?.[0]?.message?.content || '{}';
          const match = content.replace(/```json?/g, '').trim().match(/\{[\s\S]*\}/);
          const script = match ? JSON.parse(match[0]) : {};
          console.log(`✅ Script OK`);
          jsonResponse(res, {
            success: true,
            voiceover: script.voiceover || '',
            cover_prompt: script.cover_prompt || '',
            broll_prompts: script.broll_prompts || [],
            captions: script.captions || []
          });
        });
      }).on('error', err => jsonResponse(res, { success: false, error: err.message }, 500))
        .end(JSON.stringify({
          messages: [
            { role: 'system', content: 'Return ONLY JSON: {voiceover, cover_prompt, broll_prompts[], captions[]}' },
            { role: 'user', content: `Create ${duration} ${style} video script about: ${topic}${niche ? ` in ${niche}` : ''}. Language: ${language}.` }
          ],
          temperature: 0.7,
          max_tokens: 2000
        }));
    } catch (e) {
      jsonResponse(res, { success: false, error: e.message }, 500);
    }
  });
}

// ==================== CARTESIA TTS ====================
function handleTTS(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const { text, voice_id = '694f9389-aac1-45b6-b726-9d9369183238' } = JSON.parse(body);
      if (!text) return jsonResponse(res, { success: false, error: 'text required' }, 400);

      console.log(`🔊 TTS: ${text.substring(0, 30)}...`);

      https.request({
        hostname: 'api.cartesia.ai',
        path: '/tts/bytes',
        method: 'POST',
        headers: { 'Cartesia-Version': '2025-04-16', 'X-API-Key': CARTESIA_KEY, 'Content-Type': 'application/json' }
      }, (ttsRes) => {
        const chunks = [];
        ttsRes.on('data', chunk => chunks.push(chunk));
        ttsRes.on('end', () => {
          const audio = Buffer.concat(chunks);
          if (ttsRes.statusCode !== 200) return jsonResponse(res, { success: false, error: audio.toString() }, ttsRes.statusCode);
          console.log(`✅ TTS: ${audio.length} bytes`);
          jsonResponse(res, { success: true, audio: audio.toString('base64'), format: 'wav' });
        });
      }).on('error', err => jsonResponse(res, { success: false, error: err.message }, 500))
        .end(JSON.stringify({ transcript: text, model_id: 'sonic-3', voice: { mode: 'id', id: voice_id }, output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: 44100 } }));
    } catch (e) {
      jsonResponse(res, { success: false, error: e.message }, 500);
    }
  });
}

// ==================== CARTESIA STT ====================
function handleSTT(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const { audio } = JSON.parse(body);
      if (!audio) return jsonResponse(res, { success: false, error: 'audio required' }, 400);

      https.request({
        hostname: 'api.cartesia.ai',
        path: '/stt',
        method: 'POST',
        headers: { 'Cartesia-Version': '2025-04-16', 'X-API-Key': CARTESIA_KEY, 'Content-Type': 'application/json' }
      }, (sttRes) => {
        let data = '';
        sttRes.on('data', chunk => data += chunk);
        sttRes.on('end', () => {
          console.log(`🎤 STT: ${sttRes.statusCode}`);
          res.writeHead(sttRes.statusCode, { 'Content-Type': 'application/json' });
          res.end(data);
        });
      }).on('error', err => jsonResponse(res, { success: false, error: err.message }, 500))
        .end(JSON.stringify({ audio, format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: 16000 } }));
    } catch (e) {
      jsonResponse(res, { success: false, error: e.message }, 500);
    }
  });
}

// ==================== ROUTER ====================
const server = http.createServer((req, res) => {
  corsHeaders(res);
  if (req.method === 'OPTIONS') return res.writeHead(204).end();

  const path = req.url;
  const method = req.method;

  // xAI Grok Imagine
  if (method === 'POST' && path === '/api/generate/image') return handleImageGen(req, res);
  if (method === 'POST' && path === '/api/generate/video') return handleVideoStart(req, res);
  if (method === 'GET' && path.startsWith('/api/generate/video/')) return handleVideoPoll(req, res);
  if (method === 'POST' && path === '/api/ai/generate-script') return handleScriptGen(req, res);

  // Cartesia
  if (method === 'POST' && path === '/api/generate/audio') return handleTTS(req, res);
  if (method === 'POST' && path === '/api/stt/transcribe') return handleSTT(req, res);

  // Health check
  if (method === 'GET' && path === '/health') return jsonResponse(res, { status: 'ok', services: { xai: !!XAI_KEY, cartesia: !!CARTESIA_KEY } });

  jsonResponse(res, { error: 'Not Found' }, 404);
});

// ==================== START ====================
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║          🎬 AI Media Server - xAI + Cartesia                 ║
╠══════════════════════════════════════════════════════════════╣
║  📜 Script   │  xAI Grok (chat completions)                  ║
║  🖼️  Image   │  xAI grok-imagine-image                       ║
║  🎥 Video    │  xAI grok-imagine-video (async)               ║
║  🔊 TTS      │  Cartesia Sonic-3                              ║
║  🎤 STT      │  Cartesia STT                                  ║
╚══════════════════════════════════════════════════════════════╝

📍 http://localhost:${PORT}

Endpoints:
  POST /api/generate/image        - Generate image (xAI)
  POST /api/generate/video        - Start video generation
  GET  /api/generate/video/:id    - Poll video status
  POST /api/ai/generate-script    - Generate script (xAI)
  POST /api/generate/audio        - Text-to-Speech (Cartesia)
  POST /api/stt/transcribe        - Speech-to-Text (Cartesia)
  GET  /health                     - Health check

⚠️  Set environment variables:
  export XAI_API_KEY=your_key
  export CARTESIA_API_KEY=your_key
`);
});
