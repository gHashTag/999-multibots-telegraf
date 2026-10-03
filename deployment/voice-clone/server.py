"""
A person's own voice, made from a sample of it: Qwen3-TTS Base (Alibaba,
Apache-2.0, 10 languages incl. Russian) behind one HTTP door.

WHY OUR OWN SERVICE (owner, 2026-10-03): the owner's reels must speak his
GENERATED voice, and Kie is the one provider -- but Kie has no speech
cloning (skill kie-only). Qwen3-TTS clones zero-shot from a few seconds of
speech: no training run, no provider bill, the sample never leaves our pod.

WHY QWEN3-TTS AND NOT CHATTERBOX (owner, 2026-10-03): Chatterbox
Multilingual, which stood here first, mangled his words. In the audition the
owner chose Qwen3-TTS 1.7B Base, and whisper read it back word for word.

    POST /speak   {"input": "...", "lang": "ru", "ref_b64": "<any audio>",
                   "ref_text": "<optional: what the sample says>",
                   "temperature": 0.9}
                  Bearer $VOICE_CLONE_KEY -> audio/wav (24 kHz mono)
                  X-Seconds: audio length, X-Took: synthesis time,
                  X-Clone-Mode: "icl" (sample + its words) or "xvector"
    GET  /health  -> {"ok": true, "model": ..., "revision": ..., "threads": ...,
                      "busy": ..., "key_set": ..., "dtype": ...,
                      "transcriber": ...}

HOW THE SAMPLE IS USED. Qwen clones best in "ICL" mode, where it hears the
sample AND knows its words. The words come from, in order: the caller's
`ref_text`; else our own whisper service (WHISPER_BASE_URL/WHISPER_API_KEY,
the same one the render uses), asked once per distinct sample; else nothing,
and Qwen falls back to "x-vector" mode (the speaker embedding alone). The
mode used is named in X-Clone-Mode, so a degraded clone is never silent.
With `ref_text` the sample must be at most REF_MAX_SEC long (the words must
describe exactly what Qwen hears); without it the sample is cut to that.

`exaggeration` and `cfg_weight` were Chatterbox knobs. They are still
accepted (and type-checked) so an old caller is not refused, and ignored.

While a synthesis runs, /speak answers at once 503 {"error": "busy",
"retry_after": 15} with Retry-After: 15 -- it never queues a second request.

A malformed body is a 400 with {"error": ...}, never a 500. An empty
VOICE_CLONE_KEY refuses every /speak; /health stays open for Railway.

VOICE_CLONE_MODEL picks the weights: "1.7B" (default, the owner's choice) or
"0.6B" (the lighter sibling, half the memory). The Dockerfile bakes the
chosen one at build time; both revisions are pinned below.

MEASURED on Railway CPU, 8 threads, float32 (2026-10-03, the owner's sample,
Russian): 1.7B took 2.9x-8.9x real time depending on the host the pod lands
on (a 3.4 s line in 12-31 s, a 12-14 s line in 41-114 s); 0.6B took
5.6x-6.1x on its host -- not reliably faster. Every output read back word for
word by whisper. The render waits 300 s (voice-clone-speak.ts), so a line of
up to ~30 s fits even on a slow host.

Unlike Chatterbox, Qwen3-TTS embeds no watermark in its output.

Nothing is logged but sizes, times and the mode -- never the words, never
the sample, never its transcript.
"""

import base64
import hashlib
import hmac
import io
import json
import math
import os
import subprocess
import sys
import threading
import time
import urllib.request
import uuid
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np


def thread_count() -> int:
    """VOICE_CLONE_THREADS clamped to [1, cpu_count]: a typo must not ask
    torch for 0 threads, nor for more threads than the pod has cores."""
    cores = os.cpu_count() or 1
    try:
        wanted = int(os.environ.get("VOICE_CLONE_THREADS", "8"))
    except ValueError:
        wanted = 8
    return max(1, min(wanted, cores))


# The weights are pinned to one commit of each Hugging Face repo: "main" can
# move under us, and a rebuilt image would then speak with other weights than
# the ones that were reviewed and measured. Each repo carries its own speech
# tokenizer (speech_tokenizer/), so one snapshot is the whole model.
MODELS = {
    "1.7B": ("Qwen/Qwen3-TTS-12Hz-1.7B-Base",
             "fd4b254389122332181a7c3db7f27e918eec64e3"),
    "0.6B": ("Qwen/Qwen3-TTS-12Hz-0.6B-Base",
             "5d83992436eae1d760afd27aff78a71d676296fc"),
}
MODEL_SIZE = os.environ.get("VOICE_CLONE_MODEL", "1.7B").strip() or "1.7B"
DTYPE_NAME = os.environ.get("VOICE_CLONE_DTYPE", "float32").strip() or "float32"

# Our language codes -> the names Qwen3-TTS knows (its config's
# codec_language_id). Anything else is a 400, not a guess.
LANGS = {
    "ru": "russian", "en": "english", "zh": "chinese", "de": "german",
    "fr": "french", "es": "spanish", "it": "italian", "pt": "portuguese",
    "ja": "japanese", "ko": "korean",
}

KEY = os.environ.get("VOICE_CLONE_KEY", "")
PORT = int(os.environ.get("PORT", "8080"))
MAX_CHARS = 600
MAX_REF_TEXT_CHARS = 1000
MAX_REF_BYTES = 8 * 1024 * 1024
REF_MAX_SEC = 15
# A sample is decoded at most this far; longer is cut (no ref_text) or
# refused (with ref_text). Bounds ffmpeg's work on a hostile file.
REF_DECODE_SEC = 60
SR = 24000
# Codec frames per second of audio (the "12Hz" in the model name), and the
# cap on frames per input character: a runaway generation stops instead of
# talking for minutes. ~15 Russian characters per second of speech is ~1
# frame per character; 4 leaves room for slow speech and pauses.
FRAMES_PER_CHAR = 4
MIN_NEW_TOKENS_CAP = 60
# One synthesis at a time: CPU is the bottleneck, and two at once would only
# make both late. Taken WITHOUT waiting (do_POST): a second /speak is
# answered 503 at once instead of queueing behind the first, where it could
# outlive the client's timeout. /health reports the same lock as "busy".
BUSY = threading.Lock()
# What a busy answer asks the caller to wait, in seconds (Retry-After).
BUSY_RETRY_AFTER_SEC = 15

WHISPER_BASE_URL = os.environ.get("WHISPER_BASE_URL", "").strip().rstrip("/")
WHISPER_API_KEY = os.environ.get("WHISPER_API_KEY", "").strip()
WHISPER_MODEL = os.environ.get(
    "WHISPER_MODEL", "deepdml/faster-whisper-large-v3-turbo-ct2").strip()
WHISPER_TIMEOUT_SEC = 60


def model_repo() -> tuple:
    if MODEL_SIZE not in MODELS:
        raise SystemExit(f"voice-clone: VOICE_CLONE_MODEL must be one of "
                         f"{sorted(MODELS)}, not {MODEL_SIZE[:16]!r}")
    return MODELS[MODEL_SIZE]


def load_model():
    """The pinned weights: from the image's cache at run time
    (HF_HUB_OFFLINE=1), from the Hub when the Dockerfile bakes them."""
    import torch
    from huggingface_hub import snapshot_download
    from qwen_tts import Qwen3TTSModel

    torch.set_num_threads(thread_count())
    repo, revision = model_repo()
    ckpt_dir = snapshot_download(
        repo_id=repo, repo_type="model", revision=revision,
        token=os.getenv("HF_TOKEN"),
    )
    if DTYPE_NAME not in ("float32", "bfloat16"):
        raise SystemExit("voice-clone: VOICE_CLONE_DTYPE must be float32 or "
                         "bfloat16")
    return Qwen3TTSModel.from_pretrained(
        ckpt_dir, device_map="cpu", dtype=getattr(torch, DTYPE_NAME),
        attn_implementation="sdpa",
    )


model = None  # loaded in __main__, so the Dockerfile can bake it with --fetch
# The last sample's voice prompt, keyed by the sample's hash and its words:
# turning a sample into a prompt costs seconds, and a reel speaks many lines
# in one voice.
prompt_cache = {"key": None, "prompt": None, "mode": None}
# Whisper's reading of each distinct sample (hash -> words). Small: one entry
# per voice, and a reel uses one voice.
transcripts = {}
TRANSCRIPTS_MAX = 32


class BadRequest(ValueError):
    """A refusal with a message written for the caller."""


def sample_to_pcm(raw: bytes) -> np.ndarray:
    """Any audio -> mono 24 kHz float32 at most REF_DECODE_SEC long,
    loudness-normalised. CalledProcessError when ffmpeg cannot read it."""
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", "pipe:0", "-t", str(REF_DECODE_SEC),
         "-ac", "1", "-ar", str(SR), "-af", "loudnorm=I=-18:TP=-2",
         "-f", "s16le", "pipe:1"],
        input=raw, check=True, timeout=60, capture_output=True,
    ).stdout
    return np.frombuffer(out, dtype="<i2").astype(np.float32) / 32768.0


def pcm_to_wav(audio: np.ndarray, sr: int = SR) -> bytes:
    pcm = (np.clip(audio, -1.0, 1.0) * 32767).astype("<i2").tobytes()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm)
    return buf.getvalue()


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
    if lang not in LANGS:
        raise BadRequest(f"lang {lang[:16]!r} is not supported")
    ref_text = text_field(body, "ref_text").strip()
    if len(ref_text) > MAX_REF_TEXT_CHARS:
        raise BadRequest(f"ref_text must be at most {MAX_REF_TEXT_CHARS} "
                         "characters")
    ref_b64 = text_field(body, "ref_b64")
    try:
        raw = base64.b64decode(ref_b64, validate=True)
    except ValueError:  # binascii.Error
        raise BadRequest("ref_b64 is not valid base64") from None
    if not raw:
        raise BadRequest("ref_b64 (the voice sample) is required")
    if len(raw) > MAX_REF_BYTES:
        raise BadRequest("the voice sample is larger than 8 MB")
    temperature = number_field(body, "temperature", 0.9)
    if not 0.05 <= temperature <= 2.0:
        raise BadRequest("temperature must be within 0.05..2")
    # Chatterbox's knobs: checked, so garbage is still a 400, then ignored.
    number_field(body, "exaggeration", 0.5)
    number_field(body, "cfg_weight", 0.5)
    return {
        "text": text, "lang": lang, "raw": raw, "ref_text": ref_text,
        "temperature": temperature,
    }


def max_new_tokens(text: str) -> int:
    return max(MIN_NEW_TOKENS_CAP, FRAMES_PER_CHAR * len(text))


def transcribe(audio: np.ndarray, lang: str) -> str:
    """The sample's words from our whisper service, or "" when it is not
    configured or does not answer. Never raises: no words means x-vector
    mode, not a failed synthesis."""
    if not (WHISPER_BASE_URL and WHISPER_API_KEY):
        return ""
    boundary = uuid.uuid4().hex
    parts = []
    for name, value in (("model", WHISPER_MODEL), ("language", lang),
                        ("response_format", "json")):
        parts.append(
            f"--{boundary}\r\nContent-Disposition: form-data; "
            f"name=\"{name}\"\r\n\r\n{value}\r\n".encode())
    parts.append(
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; "
        f"filename=\"ref.wav\"\r\nContent-Type: audio/wav\r\n\r\n".encode()
        + pcm_to_wav(audio) + b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    req = urllib.request.Request(
        f"{WHISPER_BASE_URL}/audio/transcriptions", data=b"".join(parts),
        method="POST", headers={
            "Authorization": f"Bearer {WHISPER_API_KEY}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        })
    try:
        with urllib.request.urlopen(req, timeout=WHISPER_TIMEOUT_SEC) as r:
            words = json.loads(r.read()).get("text", "")
    except Exception as e:  # noqa: BLE001
        print(f"voice-clone: whisper failed {type(e).__name__}", flush=True)
        return ""
    return words.strip() if isinstance(words, str) else ""


def voice_prompt(raw: bytes, ref_text: str, lang: str) -> tuple:
    """(prompt, mode) for this sample, built once per sample and words."""
    sample_hash = hashlib.sha256(raw).hexdigest()
    key = (sample_hash, ref_text or None)
    if prompt_cache["key"] == key:
        return prompt_cache["prompt"], prompt_cache["mode"]
    audio = sample_to_pcm(raw)
    if not audio.size:
        raise BadRequest("the voice sample has no audio")
    if ref_text:
        if audio.size > SR * (REF_MAX_SEC + 0.5):
            raise BadRequest(
                f"with ref_text the sample must be at most {REF_MAX_SEC} s "
                "(the words must describe all of it)")
        words = ref_text
    else:
        audio = audio[: SR * REF_MAX_SEC]
        words = transcripts.get(sample_hash)
        if words is None:
            words = transcribe(audio, lang)
            if words:  # a whisper blink is retried next time, not kept
                if len(transcripts) >= TRANSCRIPTS_MAX:
                    transcripts.pop(next(iter(transcripts)))
                transcripts[sample_hash] = words
    mode = "icl" if words else "xvector"
    prompt = model.create_voice_clone_prompt(
        ref_audio=(audio, SR), ref_text=words or None,
        x_vector_only_mode=not words,
    )
    prompt_cache.update(key=key, prompt=prompt, mode=mode)
    return prompt, mode


def speak(req: dict) -> tuple:
    """One synthesis -> (wav bytes, seconds, mode). The caller holds BUSY
    (do_POST takes it without waiting); threading.Lock is not re-entrant,
    so speak never takes it."""
    prompt, mode = voice_prompt(req["raw"], req["ref_text"], req["lang"])
    wavs, sr = model.generate_voice_clone(
        text=req["text"], language=LANGS[req["lang"]],
        voice_clone_prompt=prompt, temperature=req["temperature"],
        max_new_tokens=max_new_tokens(req["text"]),
    )
    audio = np.asarray(wavs[0], dtype=np.float32).reshape(-1)
    if sr != SR:  # the contract is 24 kHz; the 12 Hz codec decodes to it
        import librosa
        audio = librosa.resample(audio, orig_sr=sr, target_sr=SR)
    return pcm_to_wav(audio), len(audio) / SR, mode


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
            repo, revision = model_repo()
            self.reply(200, json.dumps({
                "ok": True, "model": repo, "revision": revision,
                "dtype": DTYPE_NAME, "threads": thread_count(),
                "busy": BUSY.locked(), "key_set": bool(KEY),
                "transcriber": bool(WHISPER_BASE_URL and WHISPER_API_KEY),
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
        # BUSY AT ONCE, NOT IN A QUEUE. The body is read and checked first
        # (so the caller is not cut off mid-upload), then the lock is tried
        # without waiting: while a synthesis runs, the answer is 503 with
        # Retry-After right now, and the caller backs off on its own clock.
        if not BUSY.acquire(blocking=False):
            return self.reply(
                503,
                json.dumps({
                    "error": "busy", "retry_after": BUSY_RETRY_AFTER_SEC,
                }).encode(),
                "application/json",
                {"Retry-After": str(BUSY_RETRY_AFTER_SEC)},
            )
        try:
            started = time.time()
            try:
                wav, seconds, mode = speak(req)
            finally:
                # Released before the reply is written: a slow reader must
                # not keep the model locked.
                BUSY.release()
            took = time.time() - started
            print(f"voice-clone: {seconds:.1f}s of audio in {took:.1f}s "
                  f"({mode})", flush=True)
            self.reply(200, wav, "audio/wav", {
                "X-Seconds": f"{seconds:.2f}", "X-Took": f"{took:.1f}",
                "X-Clone-Mode": mode,
            })
        except BadRequest as e:
            self.fail(400, str(e))
        except subprocess.CalledProcessError:
            self.fail(400, "the voice sample is not audio ffmpeg can read")
        except Exception as e:  # noqa: BLE001
            print(f"voice-clone: failed {type(e).__name__}", flush=True)
            self.fail(500, type(e).__name__)


if __name__ == "__main__":
    t0 = time.time()
    model = load_model()
    repo, revision = model_repo()
    print(f"voice-clone: {repo} @{revision[:12]} ({DTYPE_NAME}) loaded in "
          f"{time.time() - t0:.1f}s, {thread_count()} threads", flush=True)
    if "--fetch" in sys.argv:
        # Dockerfile build step: the pinned weights are now in HF_HOME and
        # proven to load on CPU. Nothing to serve.
        sys.exit(0)
    if not KEY:
        print("voice-clone: VOICE_CLONE_KEY is empty, /speak refuses every "
              "request", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Door).serve_forever()
