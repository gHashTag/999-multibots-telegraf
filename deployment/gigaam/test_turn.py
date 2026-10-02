"""
Is turn.py's numpy log-mel the one Smart Turn was trained on?

Run it where transformers is installed (it is NOT in the image -- turn.py
exists so the image does not need it):

    python test_turn.py [model.onnx] [phrase.wav ...]

1. `features` against transformers' WhisperFeatureExtractor(chunk_length=8),
   set up the way pipecat's own inference.py sets it up, on noise, a tone,
   silence, a short phrase (front padding) and a long one (truncation).
2. With a model and wav files (16 kHz mono): the probability that each
   phrase is a finished turn, and how long it took.
"""

import sys
import time
import wave

import numpy as np

from turn import RATE, SECONDS, Turn, features


def reference(samples: np.ndarray) -> np.ndarray:
    from transformers import WhisperFeatureExtractor

    fe = WhisperFeatureExtractor(chunk_length=SECONDS)
    n = SECONDS * RATE
    s = samples[-n:] if len(samples) >= n else np.pad(samples, (n - len(samples), 0))
    out = fe(
        s,
        sampling_rate=RATE,
        return_tensors="np",
        padding="max_length",
        max_length=n,
        truncation=True,
        do_normalize=True,
    )
    return out.input_features.astype(np.float32)


def check_features() -> None:
    rng = np.random.default_rng(27)
    t = np.arange(3 * RATE) / RATE
    cases = {
        "noise 8 s": rng.normal(0, 0.1, SECONDS * RATE).astype(np.float32),
        "tone 3 s": (0.3 * np.sin(2 * np.pi * 220 * t)).astype(np.float32),
        "silence 1 s": np.zeros(RATE, dtype=np.float32),
        "noise 0.7 s": rng.normal(0, 0.2, int(0.7 * RATE)).astype(np.float32),
        "noise 11 s": rng.normal(0, 0.05, 11 * RATE).astype(np.float32),
    }
    worst = 0.0
    for name, s in cases.items():
        ours, theirs = features(s), reference(s)
        assert ours.shape == theirs.shape == (1, 80, 800), (name, ours.shape, theirs.shape)
        diff = float(np.abs(ours - theirs).max())
        worst = max(worst, diff)
        print(f"  {name:12s} max |diff| {diff:.2e}")
    assert worst < 1e-4, worst
    print(f"features match WhisperFeatureExtractor (worst {worst:.2e})")


def read_wav(path: str) -> np.ndarray:
    with wave.open(path) as w:
        assert w.getframerate() == RATE and w.getnchannels() == 1, path
        return np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32768


if __name__ == "__main__":
    check_features()
    if len(sys.argv) > 2:
        turn = Turn(sys.argv[1])
        turn.done(np.zeros(RATE, dtype=np.float32))  # warm
        for path in sys.argv[2:]:
            s = read_wav(path)
            t0 = time.time()
            p = turn.done(s)
            print(f"  {path.rsplit('/', 1)[-1]:16s} {len(s) / RATE:4.1f} s  done {p:.3f}  {int((time.time() - t0) * 1000)} ms")
