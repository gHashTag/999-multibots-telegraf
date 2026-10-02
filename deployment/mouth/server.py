"""
The mouth of voice mode: Kokoro-82M (English) and Piper (Russian) behind one
HTTP door, each with its own small thread pool.

WHY A SEPARATE SERVICE, measured 2026-10-02 inside the `whisper` pod (48 CPU,
the very model files speaches serves, already in memory, x3):

                                  short phrase (2 s)   sentence (5-7 s)
    Kokoro fp32, 48 threads       1.3-1.5 s            2.5-2.8 s   <- speaches
    Kokoro fp32,  8 threads       0.32-0.37 s          0.67-0.75 s
    Kokoro int8,  8 threads       1.5 s                3.5-3.9 s   (slower)
    Piper ru,    48 threads       0.39-0.41 s          0.44-0.49 s <- speaches
    Piper ru,     8 threads       0.11-0.18 s          0.13 s

speaches gives every ONNX session a pool sized to the 48 visible cores and has
no knob for it; a pool that size on a shared box spends its time waiting for
its own threads. English sounded ~2 s after each sentence was asked for --
the longest wait left in English voice mode after Parakeet (#3261).

The models and package versions are the ones speaches runs, so a voice sounds
the same whichever door spoke it; the render falls back to speaches on any
failure here (render/src/voice/voice.ts `speak`).

    POST /speak   {"input": "...", "lang": "ru"|"en", "voice": "irina"}
                  Bearer $MOUTH_KEY -> audio/mpeg
    GET  /health  -> {"ok": true, "voices": {...}}

Nothing is logged but sizes and times -- never the words.
"""

import glob
import hmac
import json
import os
import socket
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import onnxruntime as rt
from kokoro_onnx import Kokoro
from piper import PiperVoice
from piper.config import SynthesisConfig

KEY = os.environ.get("MOUTH_KEY", "")
PORT = int(os.environ.get("PORT", "8080"))
THREADS = int(os.environ.get("MOUTH_THREADS", "8"))
MAX_CHARS = 600
HUB = os.path.join(os.environ.get("HF_HOME", "/models"), "hub")
PIPER_RU = ("irina", "dmitri", "denis", "ruslan")
KOKORO_EN = ("af_heart", "af_bella", "am_michael", "bf_emma", "bm_george")
# Two sentences at once keep 16 cores busy; a third waits rather than slowing
# all three down.
BUSY = threading.BoundedSemaphore(int(os.environ.get("MOUTH_PARALLEL", "2")))


def snapshot(repo: str) -> str:
    return glob.glob(f"{HUB}/models--{repo.replace('/', '--')}/snapshots/*/")[0]


def session(path: str) -> rt.InferenceSession:
    so = rt.SessionOptions()
    so.intra_op_num_threads = THREADS
    so.inter_op_num_threads = 1
    return rt.InferenceSession(path, so, providers=["CPUExecutionProvider"])


k_dir = snapshot("speaches-ai/Kokoro-82M-v1.0-ONNX")
kokoro = Kokoro.from_session(session(k_dir + "model.onnx"), k_dir + "voices.bin")
piper: dict = {}
for name in PIPER_RU:
    p_dir = snapshot(f"speaches-ai/piper-ru_RU-{name}-medium")
    v = PiperVoice.load(p_dir + "model.onnx", config_path=p_dir + "config.json")
    v.session = session(p_dir + "model.onnx")
    piper[name] = v


def synthesize(lang: str, voice: str, text: str) -> tuple:
    """-> (float32 samples, sample rate)"""
    if lang == "en":
        voice = voice if voice in KOKORO_EN else KOKORO_EN[0]
        # Kokoro's b* voices are British; speaches maps them the same way.
        samples, rate = kokoro.create(
            text, voice=voice, lang="en-gb" if voice.startswith("b") else "en-us"
        )
        return np.asarray(samples, dtype=np.float32), rate
    v = piper[voice if voice in piper else PIPER_RU[0]]
    chunks = [c.audio_float_array for c in v.synthesize(text, SynthesisConfig(length_scale=1.0))]
    return np.concatenate(chunks).astype(np.float32), v.config.sample_rate


def mp3(samples: np.ndarray, rate: int) -> bytes:
    return subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "error", "-f", "f32le", "-ar", str(rate),
         "-ac", "1", "-i", "-", "-f", "mp3", "-codec:a", "libmp3lame", "-b:a", "48k", "-"],
        input=samples.tobytes(), capture_output=True, timeout=20, check=True,
    ).stdout


class Handler(BaseHTTPRequestHandler):
    def reply(self, status: int, body: dict) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        if self.path == "/health":
            return self.reply(200, {"ok": True, "threads": THREADS,
                                    "voices": {"ru": PIPER_RU, "en": KOKORO_EN}})
        self.reply(404, {"error": "not found"})

    def do_POST(self) -> None:
        if self.path != "/speak":
            return self.reply(404, {"error": "not found"})
        given = self.headers.get("authorization", "")
        if not KEY or not hmac.compare_digest(given.encode(), f"Bearer {KEY}".encode()):
            return self.reply(401, {"error": "unauthorized"})
        size = int(self.headers.get("content-length") or 0)
        if size <= 0 or size > 16 * 1024:
            return self.reply(413, {"error": "bad size"})
        try:
            body = json.loads(self.rfile.read(size))
            text = str(body.get("input") or "").strip()
            lang = "en" if body.get("lang") == "en" else "ru"
            voice = str(body.get("voice") or "")
        except Exception:
            return self.reply(400, {"error": "bad json"})
        if not text or len(text) > MAX_CHARS:
            return self.reply(413, {"error": "bad text"})
        t0 = time.time()
        try:
            with BUSY:
                samples, rate = synthesize(lang, voice, text)
            audio = mp3(samples, rate)
        except Exception as e:
            print("speak failed: %s" % type(e).__name__, flush=True)
            return self.reply(500, {"error": "cannot speak"})
        if not audio:
            return self.reply(500, {"error": "no audio"})
        self.send_response(200)
        self.send_header("content-type", "audio/mpeg")
        self.send_header("content-length", str(len(audio)))
        self.send_header("x-mouth-ms", str(int((time.time() - t0) * 1000)))
        self.end_headers()
        self.wfile.write(audio)

    def log_message(self, fmt: str, *args) -> None:
        # The default logs the request line only -- no body, no words.
        print("%s %s" % (self.address_string(), fmt % args), flush=True)


class Server(ThreadingHTTPServer):
    # Railway's private network (<service>.railway.internal) is IPv6; the
    # healthcheck may come over IPv4. "::" with V6ONLY off takes both.
    address_family = socket.AF_INET6
    daemon_threads = True

    def server_bind(self) -> None:
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


if __name__ == "__main__":
    # Warm every voice once: the first sentence of the day must not pay for
    # graph optimisation.
    for lang, name in [("en", KOKORO_EN[0])] + [("ru", n) for n in PIPER_RU]:
        synthesize(lang, name, "ok" if lang == "en" else "да")  # cyrillic-ok: a warm-up word
    print(f"mouth threads={THREADS} on :{PORT}", flush=True)
    Server(("::", PORT), Handler).serve_forever()
