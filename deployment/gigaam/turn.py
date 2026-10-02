"""
Has the person finished speaking? Asked of the sound, not of the words.

Smart Turn v3.2 (pipecat-ai, BSD-2): a Whisper-tiny encoder with a linear
head, 8 MB int8 ONNX, trained on 23 languages. Its own CPU benchmark gives
Russian 93.5 % accuracy, 4.4 % false "finished", English 94.3 %. It hears
what words cannot: a voice that rises or hangs on a vowel is still going,
even when the last word is a noun.

The voice-mode player sends the phrase recorded so far 300 ms into a pause
(the eager hearing, player session.ts); the same bytes are transcribed and
judged here, so the answer costs no second upload. The player combines it
with the words (turnEnd.ts): audio that says "not finished" holds the turn
up to HANGING_TURN_MS, as a trailing "and" already does.

The input is the last 8 s of 16 kHz mono, zero-padded AT THE FRONT, made
zero-mean/unit-variance, then Whisper's 80-bin log-mel (n_fft 400, hop 160).
Pipecat computes that with transformers' WhisperFeatureExtractor; the same
arithmetic is written out below in numpy, so the image does not carry
transformers for one function. `features` was checked against
WhisperFeatureExtractor(chunk_length=8) to 1e-4 (test_turn.py).
"""

import numpy as np

RATE = 16000
SECONDS = 8
N_FFT = 400
HOP = 160
MELS = 80


def _hz_to_mel(f: np.ndarray) -> np.ndarray:
    # Slaney: linear below 1 kHz, logarithmic above.
    f = np.asarray(f, dtype=np.float64)
    mel = 3.0 * f / 200.0
    log = f >= 1000.0
    mel = np.where(log, 15.0 + np.log(np.maximum(f, 1e-10) / 1000.0) * (27.0 / np.log(6.4)), mel)
    return mel


def _mel_to_hz(m: np.ndarray) -> np.ndarray:
    m = np.asarray(m, dtype=np.float64)
    f = 200.0 * m / 3.0
    return np.where(m >= 15.0, 1000.0 * np.exp(np.log(6.4) / 27.0 * (m - 15.0)), f)


def mel_filters() -> np.ndarray:
    """(201, 80) triangular filters, Slaney scale and Slaney area norm."""
    fft_freqs = np.linspace(0, RATE // 2, 1 + N_FFT // 2)
    mel_pts = np.linspace(_hz_to_mel(0.0), _hz_to_mel(8000.0), MELS + 2)
    hz_pts = _mel_to_hz(mel_pts)
    diff = np.diff(hz_pts)
    slopes = hz_pts[None, :] - fft_freqs[:, None]
    down = -slopes[:, :-2] / diff[:-1]
    up = slopes[:, 2:] / diff[1:]
    bank = np.maximum(0.0, np.minimum(down, up))
    return bank * (2.0 / (hz_pts[2:] - hz_pts[:-2]))[None, :]


_FILTERS = mel_filters()
_WINDOW = np.hanning(N_FFT + 1)[:-1]  # periodic Hann


def last_seconds(samples: np.ndarray) -> np.ndarray:
    """The last 8 s; a shorter phrase is padded with silence in FRONT."""
    n = SECONDS * RATE
    s = np.asarray(samples, dtype=np.float32)
    return s[-n:] if len(s) >= n else np.pad(s, (n - len(s), 0))


def features(samples: np.ndarray) -> np.ndarray:
    """(1, 80, 800) float32, what the model's `input_features` takes."""
    x = last_seconds(samples).astype(np.float64)
    x = (x - x.mean()) / np.sqrt(x.var() + 1e-7)
    x = np.pad(x, (N_FFT // 2, N_FFT // 2), mode="reflect")
    frames = 1 + (len(x) - N_FFT) // HOP
    idx = np.arange(N_FFT)[None, :] + HOP * np.arange(frames)[:, None]
    spec = np.abs(np.fft.rfft(x[idx] * _WINDOW, axis=1)) ** 2  # (frames, 201)
    mel = np.log10(np.maximum(spec @ _FILTERS, 1e-10)).T[:, :-1]  # (80, 800)
    mel = np.maximum(mel, mel.max() - 8.0)
    return ((mel + 4.0) / 4.0)[None].astype(np.float32)


class Turn:
    """One loaded model; `done(samples)` is the probability the turn is over."""

    def __init__(self, path: str, threads: int = 2) -> None:
        import onnxruntime as rt

        so = rt.SessionOptions()
        so.intra_op_num_threads = threads
        so.inter_op_num_threads = 1
        so.execution_mode = rt.ExecutionMode.ORT_SEQUENTIAL
        self.session = rt.InferenceSession(path, sess_options=so, providers=["CPUExecutionProvider"])

    def done(self, samples: np.ndarray) -> float:
        out = self.session.run(None, {"input_features": features(samples)})
        return float(np.asarray(out[0]).reshape(-1)[0])
