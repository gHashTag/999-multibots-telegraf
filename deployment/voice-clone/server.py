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
    GET  /health  -> {"ok": true, "model": ..., "revision": ..., "threads": ...,
                      "busy": ..., "key_set": ...}

A malformed body is a 400 with {"error": ...}, never a 500. An empty
VOICE_CLONE_KEY refuses every /speak; /health stays open for Railway.

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
import math
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import torch



def thread_count() -> int:
    """VOICE_CLONE_THREADS clamped to [1, cpu_count]: a typo must not ask
    torch for 0 threads, nor for more threads than the pod has cores."""
    cores = os.cpu_count() or 1
    try:
        wanted = int(os.environ.get("VOICE_CLONE_THREADS", "8"))
    except ValueError:
        wanted = 8
    return max(1, min(wanted, cores))


THREADS = thread_count()
torch.set_num_threads(THREADS)

from chatterbox.mtl_tts import (  # noqa: E402
    REPO_ID, SUPPORTED_LANGUAGES, ChatterboxMultilingualTTS,
)
from huggingface_hub import snapshot_download  # noqa: E402

# The weights are pinned to one commit of the Hugging Face repo: "main" can
# move under us, and a rebuilt image would then speak with other weights than
# the ones that were reviewed. ChatterboxMultilingualTTS.from_pretrained
# hard-codes revision="main" (chatterbox-tts 0.1.7), so we download the pinned
# snapshot ourselves and hand the directory to from_local. MODEL_FILES is the
# allow-list from_pretrained uses in that version.
MODEL_REVISION = "5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18"
MODEL_FILES = [
    "ve.pt", "t3_mtl23ls_v2.safetensors", "s3gen.pt",
    "grapheme_mtl_merged_expanded_v1.json", "conds.pt", "Cangjie5_TC.json",
]

KEY = os.environ.get("VOICE_CLONE_KEY", "")
PORT = int(os.environ.get("PORT", "8080"))
MAX_CHARS = 600
MAX_REF_BYTES = 8 * 1024 * 1024
REF_MAX_SEC = 15
GAP_SEC = 0.18
# One synthesis at a time: the model holds the active voice as state.
BUSY = threading.Lock()



def load_model() -> ChatterboxMultilingualTTS:
    """The pinned weights: from the image's cache at run time
    (HF_HUB_OFFLINE=1), from the Hub when the Dockerfile bakes them."""
    ckpt_dir = snapshot_download(
        repo_id=REPO_ID, repo_type="model", revision=MODEL_REVISION,
        allow_patterns=MODEL_FILES, token=os.getenv("HF_TOKEN"),
    )
    return ChatterboxMultilingualTTS.from_local(ckpt_dir, "cpu")


model = None  # loaded in __main__, so the Dockerfile can bake it with --fetch
active_ref = None  # hash of the sample the model's conditionals came from


def sample_to_wav(raw: bytes, out: str):
    """Any audio -> mono 24 kHz wav at `out`, at most REF_MAX_SEC,
    loudness-normalised."""
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", "pipe:0", "-t", str(REF_MAX_SEC),
         "-ac", "1", "-ar", "24000", "-af", "loudnorm=I=-18:TP=-2", out],
        input=raw, check=True, timeout=60,
    )


def sentences(text: str) -> list:
    parts = re.split(r"(?<=[.!?…])\s+", text.strip())
    return [p for p in (s.strip() for s in parts) if p]


class BadRequest(ValueError):
    """A refusal with a message written for the caller."""


def text_field(body: dict, name: str, default: str = "") -> str:
    value = body.get(name)
    if value is None:
        return default
    if not isinstance(value, str):
        raise BadRequest(f"{name} must be a string")
    return value


def number_field(body: dict, name: str, default: float) -> float:
    value = body.get(name)
    if value is None:
        return default
    # bool is an int in Python; true/false is a caller mistake, not a number.
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise BadRequest(f"{name} must be a number")
    value = float(value)
    if not math.isfinite(value):
        raise BadRequest(f"{name} must be finite")
    return value


def parse(body) -> dict:
    """The decoded JSON body -> checked arguments for speak(). Every refusal
    here is a BadRequest, so the door answers 400 and never 500."""
    if not isinstance(body, dict):
        raise BadRequest("the body must be a JSON object")
    text = text_field(body, "input").strip()
    lang = text_field(body, "lang", "ru").lower() or "ru"
    if not text or len(text) > MAX_CHARS:
        raise BadRequest(f"input must be 1..{MAX_CHARS} characters")
    if lang not in SUPPORTED_LANGUAGES:
        raise BadRequest(f"lang {lang[:16]!r} is not supported")
    ref_b64 = text_field(body, "ref_b64")
    try:
        raw = base64.b64decode(ref_b64, validate=True)
    except ValueError:  # binascii.Error
        raise BadRequest("ref_b64 is not valid base64") from None
    if not raw:
        raise BadRequest("ref_b64 (the voice sample) is required")
    if len(raw) > MAX_REF_BYTES:
        raise BadRequest("the voice sample is larger than 8 MB")
    return {
        "text": text, "lang": lang, "raw": raw,
        "exaggeration": number_field(body, "exaggeration", 0.5),
        "cfg_weight": number_field(body, "cfg_weight", 0.5),
        "temperature": number_field(body, "temperature", 0.8),
    }


def speak(req: dict) -> tuple:
    global active_ref
    text, lang, raw = req["text"], req["lang"], req["raw"]
    exaggeration = req["exaggeration"]
    cfg_weight, temperature = req["cfg_weight"], req["temperature"]
    ref_hash = hashlib.sha256(raw).hexdigest() + f":{exaggeration}"
    with BUSY:
        if ref_hash != active_ref:
            # The name is reserved before ffmpeg runs and removed whatever
            # ffmpeg or the model does: a failing sample never leaks a file.
            fd, path = tempfile.mkstemp(suffix=".wav")
            os.close(fd)
            try:
                sample_to_wav(raw, path)
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
                "revision": MODEL_REVISION, "threads": THREADS,
                "busy": BUSY.locked(), "key_set": bool(KEY),
            }).encode(), "application/json")
        else:
            self.fail(404, "not found")

    def do_POST(self):
        if self.path != "/speak":
            return self.fail(404, "not found")
        # No key configured means no door at all, not an open one. Bytes on
        # both sides: compare_digest on str raises TypeError on non-ASCII.
        auth = self.headers.get("Authorization", "")
        if not KEY or not hmac.compare_digest(
            auth.encode(), f"Bearer {KEY}".encode()
        ):
            return self.fail(401, "unauthorized")
        try:
            n = int(self.headers.get("Content-Length", "0"))
            if n <= 0 or n > MAX_REF_BYTES * 2:
                return self.fail(413, "body size")
            req = parse(json.loads(self.rfile.read(n)))
        except BadRequest as e:
            return self.fail(400, str(e))
        except (TypeError, ValueError, KeyError) as e:
            # JSONDecodeError, UnicodeDecodeError and a bad Content-Length
            # all land here; the name of the error is enough for the caller.
            return self.fail(400, f"malformed request ({type(e).__name__})")
        try:
            started = time.time()
            wav, seconds = speak(req)
            took = time.time() - started
            print(f"voice-clone: {seconds:.1f}s of audio in {took:.1f}s", flush=True)
            self.reply(200, wav, "audio/wav", {
                "X-Seconds": f"{seconds:.2f}", "X-Took": f"{took:.1f}",
            })
        except subprocess.CalledProcessError:
            self.fail(400, "the voice sample is not audio ffmpeg can read")
        except Exception as e:  # noqa: BLE001
            print(f"voice-clone: failed {type(e).__name__}", flush=True)
            self.fail(500, type(e).__name__)


if __name__ == "__main__":
    t0 = time.time()
    model = load_model()
    print(f"voice-clone: model {MODEL_REVISION[:12]} loaded in "
          f"{time.time() - t0:.1f}s, {THREADS} threads", flush=True)
    if "--fetch" in sys.argv:
        # Dockerfile build step: the pinned weights are now in HF_HOME and
        # proven to load on CPU. Nothing to serve.
        sys.exit(0)
    if not KEY:
        print("voice-clone: VOICE_CLONE_KEY is empty, /speak refuses every "
              "request", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Door).serve_forever()
