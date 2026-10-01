"""
Russian ears for voice mode: GigaAM v3 (Sber, MIT) behind one HTTP door.

WHY A SEPARATE SERVICE, measured 2026-10-02 inside the `whisper` pod
(48 CPU, the same six synthesized phrases, model already in memory):

    whisper large-v3-turbo, language=ru   2.1-3.0 s per phrase
    Parakeet TDT 0.6b v3 (onnx)           0.9-1.9 s, Russian unusable
    GigaAM v3 e2e-ctc (onnx-asr 0.12.0)   0.05-0.10 s, punctuated, correct

GigaAM does not pad every call to a 30 s window the way whisper does, so a
4 s phrase costs what 4 s of audio costs. It knows only Russian; English
stays with whisper, and so does anything this service fails on (the render
falls back on any error, see render/src/voice/voice.ts `hear`).

It cannot live inside speaches: speaches lists only its own model families,
and that container is capped at 1000 processes+threads (pids.max). Every
ONNX model takes a thread pool sized to the 48 visible cores and there is no
knob for it there -- whisper, four Piper voices, Kokoro and Silero already
hold ~470; loading Parakeet beside them reached 986 and Python could no
longer start a thread. Here the pool is ours: GIGAAM_THREADS (default 8).

    POST /hear    raw audio bytes (webm/ogg/mp4/wav), Bearer $GIGAAM_KEY
                  -> {"text": "...", "ms": 87}
    GET  /health  -> {"ok": true, "model": "gigaam-v3-e2e-ctc"}

The audio is decoded by ffmpeg into 16 kHz mono; nothing is written to the
log but sizes and times -- never the words.
"""

import hmac
import json
import os
import socket
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import onnx_asr
import onnxruntime as rt

MODEL = os.environ.get("GIGAAM_MODEL", "gigaam-v3-e2e-ctc")
KEY = os.environ.get("GIGAAM_KEY", "")
PORT = int(os.environ.get("PORT", "8080"))
THREADS = int(os.environ.get("GIGAAM_THREADS", "8"))
RATE = 16000
# GigaAM's CTC head is trained on short utterances; past ~25 s it needs a
# long-form VAD pass. A voice-mode phrase is far shorter, and anything longer
# gets 413 so the render hands it to whisper.
MAX_SECONDS = float(os.environ.get("GIGAAM_MAX_SECONDS", "24"))
MAX_BYTES = 8 * 1024 * 1024
# Two phrases at once keep 16 cores busy; a third waits rather than slowing
# all three down.
BUSY = threading.BoundedSemaphore(int(os.environ.get("GIGAAM_PARALLEL", "2")))

so = rt.SessionOptions()
so.intra_op_num_threads = THREADS
so.inter_op_num_threads = 1
model = onnx_asr.load_model(MODEL, sess_options=so)


def decode(audio: bytes) -> np.ndarray:
    # A temp file, not a pipe: Safari's mp4 keeps its index at the end and
    # ffmpeg cannot seek a pipe to read it.
    with tempfile.NamedTemporaryFile(suffix=".audio") as f:
        f.write(audio)
        f.flush()
        out = subprocess.run(
            ["ffmpeg", "-nostdin", "-v", "error", "-i", f.name,
             "-ac", "1", "-ar", str(RATE), "-f", "s16le", "-"],
            capture_output=True, timeout=20, check=True,
        ).stdout
    return np.frombuffer(out[: len(out) // 2 * 2], dtype="<i2").astype(np.float32) / 32768


class Handler(BaseHTTPRequestHandler):
    def reply(self, status: int, body: dict) -> None:
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        if self.path == "/health":
            return self.reply(200, {"ok": True, "model": MODEL})
        self.reply(404, {"error": "not found"})

    def do_POST(self) -> None:
        if self.path != "/hear":
            return self.reply(404, {"error": "not found"})
        given = self.headers.get("authorization", "")
        if not KEY or not hmac.compare_digest(given.encode(), f"Bearer {KEY}".encode()):
            return self.reply(401, {"error": "unauthorized"})
        size = int(self.headers.get("content-length") or 0)
        if size <= 0 or size > MAX_BYTES:
            return self.reply(413, {"error": "bad size"})
        audio = self.rfile.read(size)
        t0 = time.time()
        try:
            samples = decode(audio)
        except Exception:
            return self.reply(422, {"error": "cannot decode audio"})
        if not len(samples):
            return self.reply(422, {"error": "no audio"})
        if len(samples) > MAX_SECONDS * RATE:
            return self.reply(413, {"error": "too long"})
        with BUSY:
            text = model.recognize(samples, sample_rate=RATE)
        ms = int((time.time() - t0) * 1000)
        self.reply(200, {"text": str(text or "").strip(), "ms": ms})

    def log_message(self, fmt: str, *args) -> None:
        # The default logs the request line only -- no body, no words.
        print("%s %s" % (self.address_string(), fmt % args), flush=True)


class Server(ThreadingHTTPServer):
    # Railway's private network (gigaam.railway.internal) is IPv6; the
    # healthcheck may come over IPv4. "::" with V6ONLY off takes both.
    address_family = socket.AF_INET6
    daemon_threads = True

    def server_bind(self) -> None:
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


if __name__ == "__main__":
    print(f"gigaam {MODEL} threads={THREADS} on :{PORT}", flush=True)
    Server(("::", PORT), Handler).serve_forever()
