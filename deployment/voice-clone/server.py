"""
A person's own voice, made from a sample of it: Chatterbox Multilingual
(Resemble AI, MIT, 23 languages incl. Russian) behind one HTTP door.

WHY OUR OWN SERVICE (owner, 2026-10-03): the owner's reels must speak his
GENERATED voice, and Kie is the one provider -- but Kie has no speech
cloning (skill kie-only). Chatterbox clones zero-shot from ~10 s of speech:
no training run, no provider bill, the sample never leaves our pod.

    POST /speak   {"input": "...", "lang": "ru", "ref_b64": "<any audio>",
                   "exaggeration": 0.5, "cfg_weight": 0.5, "temperature": 0.8}
                  Bearer $VOICE_CLONE_KEY -> audio/wav (24 kHz mono)
                  X-Seconds: audio length, X-Took: synthesis time
    GET  /health  -> {"ok": true, "model": ..., "threads": ...}

The sample is cut to REF_MAX_SEC and turned into conditionals once per
distinct sample (cached by hash). Text is spoken sentence by sentence and
joined with a short gap: one long generate drifts and repeats on CPU.

Every output carries Resemble's Perth watermark (built into the model), so a
generated voice is always distinguishable from a recording.

Nothing is logged but sizes and times -- never the words, never the sample.
"""

import base64
import hashlib
import hmac
import io
import json
import os
import re
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import torch

THREADS = int(os.environ.get("VOICE_CLONE_THREADS", "8"))
torch.set_num_threads(THREADS)

from chatterbox.mtl_tts import ChatterboxMultilingualTTS, SUPPORTED_LANGUAGES  # noqa: E402

KEY = os.environ.get("VOICE_CLONE_KEY", "")
PORT = int(os.environ.get("PORT", "8080"))
MAX_CHARS = 600
MAX_REF_BYTES = 8 * 1024 * 1024
REF_MAX_SEC = 15
GAP_SEC = 0.18
# One synthesis at a time: the model holds the active voice as state.
BUSY = threading.Lock()

t0 = time.time()
model = ChatterboxMultilingualTTS.from_pretrained(device="cpu")
print(f"voice-clone: model loaded in {time.time() - t0:.1f}s, {THREADS} threads", flush=True)
active_ref = None  # hash of the sample the model's conditionals came from


def sample_to_wav(raw: bytes) -> str:
    """Any audio -> mono 24 kHz wav, at most REF_MAX_SEC, loudness-normalised."""
    out = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", "pipe:0", "-t", str(REF_MAX_SEC),
         "-ac", "1", "-ar", "24000", "-af", "loudnorm=I=-18:TP=-2", out],
        input=raw, check=True, timeout=60,
    )
    return out


def sentences(text: str) -> list:
    parts = re.split(r"(?<=[.!?…])\s+", text.strip())
    return [p for p in (s.strip() for s in parts) if p]


def speak(body: dict) -> tuple:
    global active_ref
    text = str(body.get("input") or "").strip()
    lang = str(body.get("lang") or "ru").lower()
    if not text or len(text) > MAX_CHARS:
        raise ValueError(f"input must be 1..{MAX_CHARS} characters")
    if lang not in SUPPORTED_LANGUAGES:
        raise ValueError(f"lang {lang!r} is not supported")
    ref_b64 = body.get("ref_b64")
    if not ref_b64:
        raise ValueError("ref_b64 (the voice sample) is required")
    raw = base64.b64decode(ref_b64)
    if len(raw) > MAX_REF_BYTES:
        raise ValueError("the voice sample is larger than 8 MB")
    exaggeration = float(body.get("exaggeration", 0.5))
    cfg_weight = float(body.get("cfg_weight", 0.5))
    temperature = float(body.get("temperature", 0.8))
    ref_hash = hashlib.sha256(raw).hexdigest() + f":{exaggeration}"
    with BUSY:
        if ref_hash != active_ref:
            path = sample_to_wav(raw)
            try:
                model.prepare_conditionals(path, exaggeration=exaggeration)
            finally:
                os.unlink(path)
            active_ref = ref_hash
        gap = np.zeros(int(model.sr * GAP_SEC), dtype=np.float32)
        pieces = []
        for s in sentences(text):
            wav = model.generate(
                s, language_id=lang, exaggeration=exaggeration,
                cfg_weight=cfg_weight, temperature=temperature,
            )
            if pieces:
                pieces.append(gap)
            pieces.append(wav.squeeze(0).numpy().astype(np.float32))
    audio = np.concatenate(pieces)
    pcm = (np.clip(audio, -1.0, 1.0) * 32767).astype("<i2").tobytes()
    buf = io.BytesIO()
    import wave
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(model.sr)
        w.writeframes(pcm)
    return buf.getvalue(), len(audio) / model.sr


class Door(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def reply(self, code: int, body: bytes, ctype: str, extra: dict = None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def fail(self, code: int, msg: str):
        self.reply(code, json.dumps({"error": msg}).encode(), "application/json")

    def do_GET(self):
        if self.path == "/health":
            self.reply(200, json.dumps({
                "ok": True, "model": "chatterbox-multilingual",
                "threads": THREADS, "busy": BUSY.locked(),
            }).encode(), "application/json")
        else:
            self.fail(404, "not found")

    def do_POST(self):
        if self.path != "/speak":
            return self.fail(404, "not found")
        auth = self.headers.get("Authorization", "")
        if not KEY or not hmac.compare_digest(auth, f"Bearer {KEY}"):
            return self.fail(401, "unauthorized")
        try:
            n = int(self.headers.get("Content-Length", "0"))
            if n <= 0 or n > MAX_REF_BYTES * 2:
                return self.fail(413, "body size")
            body = json.loads(self.rfile.read(n))
            started = time.time()
            wav, seconds = speak(body)
            took = time.time() - started
            print(f"voice-clone: {seconds:.1f}s of audio in {took:.1f}s", flush=True)
            self.reply(200, wav, "audio/wav", {
                "X-Seconds": f"{seconds:.2f}", "X-Took": f"{took:.1f}",
            })
        except (ValueError, KeyError, json.JSONDecodeError) as e:
            self.fail(400, str(e))
        except subprocess.CalledProcessError:
            self.fail(400, "the voice sample is not audio ffmpeg can read")
        except Exception as e:  # noqa: BLE001
            print(f"voice-clone: failed {type(e).__name__}", flush=True)
            self.fail(500, type(e).__name__)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), Door).serve_forever()
