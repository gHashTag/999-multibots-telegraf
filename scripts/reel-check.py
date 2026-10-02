#!/usr/bin/env python3
"""tri reel-check -- look at a rendered reel the way the owner does.

Two questions, each answered by measurement, never by the plan:

  1. FACE. In every shot, is the face centred in the window it is shown in,
     and is the top of the head inside that window? A split shows the face in
     the lower half; a centre crop of a 9:16 lipsync there put the top of the
     head on the seam (reel 2, 2026-10-02). Thresholds come from
     split-reel.t27 v3: FACE_OFF_CENTER_MAX_PCT and HEADROOM_MIN_PCT.

  2. CAPTIONS. Does each caption appear when its word is said? The reel's own
     audio is cross-correlated with the voice file to find any offset, then
     every caption is matched in order to the whisper word of the same text.

Usage:
  tri reel-check REEL.mp4|URL [--body body.json] [--words whisper.json]
                 [--voice voice.mp3|URL] [--sheet out.jpg] [--json]

  --body    the /render/template request body (props.segments, props.captions);
            without it every second is checked as a full-screen shot
  --words   whisper verbose_json of the voice (word timestamps)
  --voice   the voice the captions were timed against
  --sheet   write a contact sheet: one frame per shot with the face box

Exit: 0 every check passed, 1 a defect was found, 2 something could not be
measured (missing tool, no frames, no face anywhere). "Not measured" is never
reported as a pass.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import unicodedata
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = os.path.join(
    ROOT, "apps/vibee-editor/render/src/spec/split-reel.t27"
)

FPS = 30
AUDIO_OFFSET_MAX_MS = 80  # lip-sync tolerance for audio against the voice file


def spec_const(name, default):
    """Read a u32 constant from the vendored spec, so thresholds have one home."""
    try:
        with open(SPEC, encoding="utf-8") as f:
            m = re.search(rf"pub const {name} : u32 = (\d+);", f.read())
        return int(m.group(1)) if m else default
    except OSError:
        return default


OFF_CENTER_MAX = spec_const("FACE_OFF_CENTER_MAX_PCT", 10)
HEADROOM_MIN = spec_const("HEADROOM_MIN_PCT", 3)
SPLIT_PCT = spec_const("SPLIT_PCT", 50)
CAPTION_DRIFT_MAX_MS = spec_const("CAPTION_DRIFT_MAX_MS", 150)
ONSET_FRAME_MS = spec_const("ONSET_FRAME_MS", 10)
SPEECH_BELOW_LOUD_DB = spec_const("SPEECH_BELOW_LOUD_DB", 30)
CAPTION_ON_SILENCE_MAX_MS = spec_const("CAPTION_ON_SILENCE_MAX_MS", 150)


def fetch(src, tmp, name):
    if not src or not re.match(r"^https?://", src):
        return src
    out = os.path.join(tmp, name)
    urllib.request.urlretrieve(src, out)
    return out


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------- face ----


def cascade():
    import cv2

    path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
    c = cv2.CascadeClassifier(path)
    if c.empty():
        raise RuntimeError(f"no face model at {path}")
    return c


def biggest_face(c, img):
    import cv2

    h, w = img.shape[:2]
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = c.detectMultiScale(g, 1.1, 6, minSize=(max(24, w // 10),) * 2)
    if len(faces) == 0:
        return None
    return max(faces, key=lambda r: r[2] * r[3])


def has_seam(frame):
    """A split is two pictures: the rows either side of the seam disagree far
    more than neighbouring rows anywhere else do."""
    import numpy as np

    g = frame.mean(axis=2).astype(np.float32)
    d = np.abs(np.diff(g, axis=0)).mean(axis=1)
    seam = int(g.shape[0] * SPLIT_PCT / 100)
    at = d[seam - 3 : seam + 2].max()
    return bool(at > 6 * max(1.0, float(np.median(d))))


def shots_from(body, duration):
    if body:
        segs = body.get("props", body).get("segments") or []
        if segs:
            return [
                {
                    "type": s.get("type", "fullscreen"),
                    "start": s["startFrame"] / FPS,
                    "end": (s["startFrame"] + s["durationFrames"]) / FPS,
                }
                for s in segs
            ]
    shots, t = [], 0.0
    while t < duration:
        shots.append({"type": "fullscreen", "start": t, "end": min(duration, t + 1)})
        t += 1
    return shots


def check_faces(video, body, sheet):
    import cv2

    cap = cv2.VideoCapture(video)
    if not cap.isOpened():
        return None, [f"cannot open {video}"]
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or FPS
    duration = n / fps if n else 0
    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    c = cascade()
    rows, thumbs, unmeasured = [], [], []
    planned = bool(body and body.get("props", body).get("segments"))
    for i, shot in enumerate(shots_from(body, duration)):
        if not planned:
            # No plan: the picture says whether this second is a split.
            cap.set(cv2.CAP_PROP_POS_FRAMES, int((shot["start"] + shot["end"]) / 2 * fps))
            ok, frame = cap.read()
            if ok and has_seam(frame):
                shot["type"] = "split"
        top = int(H * SPLIT_PCT / 100) if shot["type"] == "split" else 0
        win_h = H - top
        span = shot["end"] - shot["start"]
        found = []
        for k in (0.2, 0.5, 0.8):
            t = shot["start"] + span * k
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
            ok, frame = cap.read()
            if not ok:
                continue
            win = frame[top:H, 0:W]
            f = biggest_face(c, win)
            if f is None:
                continue
            x, y, bw, bh = (int(v) for v in f)
            found.append((t, x, y, bw, bh, win))
        if not found:
            rows.append({"shot": i + 1, **shot, "face": None, "defects": ["no face"]})
            unmeasured.append(i + 1)
            continue
        # The worst frame of the shot speaks for it.
        worst = None
        for t, x, y, bw, bh, win in found:
            cx = (x + bw / 2) / W * 100
            cy = (y + bh / 2) / win_h * 100
            # A Haar box runs from the brow to the chin; the skull is about half
            # a box higher.
            headroom = (y - 0.5 * bh) / win_h * 100
            off = max(abs(cx - 50), abs(cy - 50))
            score = max(off - OFF_CENTER_MAX, HEADROOM_MIN - headroom)
            if worst is None or score > worst["score"]:
                worst = {
                    "t": round(t, 2),
                    "cx": round(cx, 1),
                    "cy": round(cy, 1),
                    "headroom": round(headroom, 1),
                    "score": score,
                    "box": (x, y, bw, bh),
                    "win": win,
                }
        defects = []
        if abs(worst["cx"] - 50) > OFF_CENTER_MAX:
            defects.append(f"face {worst['cx'] - 50:+.0f}% across")
        # A 9:16 lipsync on a 9:16 screen cannot be re-aimed by the crop, so a
        # full-screen shot is judged across and by headroom only.
        if shot["type"] == "split" and abs(worst["cy"] - 50) > OFF_CENTER_MAX:
            defects.append(f"face {worst['cy'] - 50:+.0f}% down")
        if worst["headroom"] < HEADROOM_MIN:
            defects.append(f"head cut ({worst['headroom']:.0f}% headroom)")
        thumbs.append((i + 1, shot["type"], worst))
        rows.append(
            {
                "shot": i + 1,
                **shot,
                "face": {k: worst[k] for k in ("t", "cx", "cy", "headroom")},
                "defects": defects,
            }
        )
    cap.release()
    if sheet and thumbs:
        write_sheet(sheet, thumbs)
    return {"width": W, "height": H, "duration": round(duration, 2), "shots": rows}, (
        [f"shot {s}: no face found" for s in unmeasured]
    )


def write_sheet(path, thumbs):
    import cv2
    import numpy as np

    tiles = []
    for n, kind, w in thumbs:
        img = w["win"].copy()
        x, y, bw, bh = w["box"]
        cv2.rectangle(img, (x, y), (x + bw, y + bh), (0, 255, 255), 4)
        hh, ww = img.shape[:2]
        cv2.line(img, (ww // 2, 0), (ww // 2, hh), (255, 0, 255), 2)
        cv2.line(img, (0, hh // 2), (ww, hh // 2), (255, 0, 255), 2)
        scale = 360 / ww
        img = cv2.resize(img, (360, int(hh * scale)))
        canvas = np.zeros((680, 360, 3), dtype=np.uint8)
        canvas[: min(680, img.shape[0]), :] = img[:680]
        cv2.putText(canvas, f"{n} {kind} t={w['t']}", (8, 30), 0, 0.8, (255, 255, 255), 2)
        tiles.append(canvas)
    cv2.imwrite(path, np.hstack(tiles))


# ------------------------------------------------------------ captions ----


def pcm(path, seconds=12):
    """Mono 8 kHz float samples of a file's audio, through ffmpeg."""
    import numpy as np

    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-t", str(seconds), "-ac", "1",
         "-ar", "8000", "-f", "f32le", "-"],
        capture_output=True,
        check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32)


def audio_offset_ms(reel, voice):
    """How much later the voice plays in the reel than in the voice file."""
    import numpy as np

    a, b = pcm(reel), pcm(voice)
    if len(a) < 800 or len(b) < 800:
        return None
    n = 1 << int(np.ceil(np.log2(len(a) + len(b))))
    env = lambda s: np.abs(s) - np.abs(s).mean()  # noqa: E731
    xc = np.fft.irfft(np.fft.rfft(env(a), n) * np.conj(np.fft.rfft(env(b), n)), n)
    lag = int(np.argmax(xc))
    if lag > n // 2:
        lag -= n
    return round(lag / 8000 * 1000)


def speech_frames(reel):
    """Which ONSET_FRAME_MS frames of the reel's sound are speech (spec v4)."""
    import numpy as np

    x = pcm(reel, seconds=600)
    per = 8000 * ONSET_FRAME_MS // 1000
    n = len(x) // per
    if n == 0:
        return None
    rms = np.sqrt((x[: n * per].reshape(n, per) ** 2).mean(1))
    db = 20 * np.log10(rms * 32768 + 1)
    return db >= np.percentile(db, 95) - SPEECH_BELOW_LOUD_DB


def first_speech_ms(speech, start_ms, end_ms):
    """Where a word is heard: its first speech frame, else whisper's start."""
    f = ONSET_FRAME_MS
    for j in range(max(0, start_ms // f), min(len(speech), -(-end_ms // f))):
        if speech[j]:
            return max(start_ms, j * f)
    return start_ms


def check_silence(speech, captions):
    """How long each caption waits on silence before the reel's own sound speaks.

    Needs no transcription, so it cannot agree with the captions by building
    them: the sound is the witness (split-reel.t27 v4).
    """
    if speech is None:
        return None
    n = len(speech)
    out = []
    for cap in captions:
        if not str(cap.get("text", "")).strip():
            continue
        i = max(0, int(cap["startMs"]) // ONSET_FRAME_MS)
        end = min(n, max(i + 1, int(cap.get("endMs", cap["startMs"])) // ONSET_FRAME_MS))
        k = next((j for j in range(i, end) if speech[j]), None)
        wait = (end - i) * ONSET_FRAME_MS if k is None else (k - i) * ONSET_FRAME_MS
        out.append({"text": cap["text"], "caption_ms": cap["startMs"], "silent_ms": wait})
    return out


def norm(word):
    w = unicodedata.normalize("NFKC", word).lower().replace("ё", "е")
    return re.sub(r"[^\w]", "", w)


def check_captions(captions, words, offset_ms, speech=None):
    """Pair each caption with the whisper word of the same text, in order.

    Whisper gives a word that follows a pause the pause as well, so when the
    reel's sound is at hand a word is said where its sound starts -- the same
    rule the planner places captions by (split-reel.t27 v4).
    """
    off = offset_ms or 0
    spoken = []
    for w in words:
        start, end = round(w["start"] * 1000) + off, round(w["end"] * 1000) + off
        ms = first_speech_ms(speech, start, end) if speech is not None else start
        spoken.append({"w": norm(w["word"]), "ms": ms})
    pairs, j = [], 0
    for cap in captions:
        text = norm(cap.get("text", ""))
        if not text:
            continue
        k = next((i for i in range(j, min(j + 4, len(spoken))) if spoken[i]["w"] == text), None)
        if k is None:
            pairs.append({"text": cap["text"], "caption_ms": cap["startMs"], "said_ms": None})
            continue
        j = k + 1
        pairs.append(
            {
                "text": cap["text"],
                "caption_ms": cap["startMs"],
                "said_ms": spoken[k]["ms"],
                "drift_ms": cap["startMs"] - spoken[k]["ms"],
            }
        )
    return pairs


# ---------------------------------------------------------------- main ----


def main():
    ap = argparse.ArgumentParser(prog="tri reel-check", description=__doc__.split("\n")[0])
    ap.add_argument("reel")
    ap.add_argument("--body")
    ap.add_argument("--words")
    ap.add_argument("--voice")
    ap.add_argument("--sheet")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    try:
        import cv2  # noqa: F401
        import numpy  # noqa: F401
    except ImportError as e:
        print(f"reel-check: not measured -- {e} (pip install opencv-python numpy)")
        return 2

    tmp = tempfile.mkdtemp(prefix="reel-check-")
    reel = fetch(a.reel, tmp, "reel.mp4")
    body = load_json(a.body) if a.body else None
    report, unmeasured = {"reel": a.reel}, []
    defects = 0

    faces, missing = check_faces(reel, body, a.sheet)
    if faces is None:
        print("reel-check: not measured --", *missing)
        return 2
    report["faces"] = faces
    unmeasured += missing

    captions = (body or {}).get("props", body or {}).get("captions") or []
    speech = speech_frames(reel) if captions else None
    if captions:
        report["silence"] = check_silence(speech, captions)
        if report["silence"] is None:
            unmeasured.append("captions on silence: the reel has no sound")
    if a.words and captions:
        offset = None
        if a.voice:
            offset = audio_offset_ms(reel, fetch(a.voice, tmp, "voice"))
            report["audio_offset_ms"] = offset
        report["captions"] = check_captions(
            captions, load_json(a.words)["words"], offset, speech
        )
    elif captions:
        unmeasured.append("captions: no --words to time them against")

    if a.json:
        print(json.dumps(report, ensure_ascii=False, indent=1, default=str))

    print(f"reel {faces['width']}x{faces['height']}, {faces['duration']} s, "
          f"{len(faces['shots'])} shots (thresholds: off-centre {OFF_CENTER_MAX}%, "
          f"headroom {HEADROOM_MIN}%)")
    for r in faces["shots"]:
        f = r["face"]
        where = (f"centre {f['cx']:.0f}%,{f['cy']:.0f}%  headroom {f['headroom']:.0f}%"
                 if f else "-")
        mark = "FAIL" if r["defects"] else "ok  "
        defects += bool(r["defects"])
        print(f"  {mark} shot {r['shot']} {r['type']:<10} {r['start']:5.2f}-{r['end']:5.2f}s  "
              f"{where}  {'; '.join(r['defects'])}")

    if "audio_offset_ms" in report:
        off = report["audio_offset_ms"]
        bad = off is None or abs(off) > AUDIO_OFFSET_MAX_MS
        defects += bool(off is not None and bad)
        print(f"  {'FAIL' if bad else 'ok  '} audio vs voice file: "
              f"{'not measured' if off is None else f'{off:+d} ms'}")
        if off is None:
            unmeasured.append("audio offset")
    if report.get("silence"):
        quiet = [p for p in report["silence"] if p["silent_ms"] > CAPTION_ON_SILENCE_MAX_MS]
        defects += bool(quiet)
        print(f"  {'FAIL' if quiet else 'ok  '} captions on silence: {len(quiet)}/"
              f"{len(report['silence'])} wait more than {CAPTION_ON_SILENCE_MAX_MS} ms for the sound")
        for p in quiet[:8]:
            print(f"         {p['text']!r}: caption {p['caption_ms']} ms, "
                  f"{p['silent_ms']} ms before the sound")
    if "captions" in report:
        pairs = report["captions"]
        timed = [p for p in pairs if p.get("drift_ms") is not None]
        late = [p for p in timed if abs(p["drift_ms"]) > CAPTION_DRIFT_MAX_MS]
        worst = max(timed, key=lambda p: abs(p["drift_ms"]), default=None)
        defects += bool(late)
        print(f"  {'FAIL' if late else 'ok  '} captions: {len(timed)}/{len(pairs)} matched to words, "
              f"{len(late)} off by more than {CAPTION_DRIFT_MAX_MS} ms"
              + (f", worst {worst['text']!r} {worst['drift_ms']:+d} ms" if worst else ""))
        for p in late[:8]:
            print(f"         {p['text']!r}: caption {p['caption_ms']} ms, said {p['said_ms']} ms "
                  f"({p['drift_ms']:+d})")
        if len(timed) < len(pairs):
            unmeasured.append(f"{len(pairs) - len(timed)} captions not matched to a word")

    if a.sheet:
        print(f"  sheet: {a.sheet}")
    for u in unmeasured:
        print(f"  not measured: {u}")
    if defects:
        return 1
    return 2 if unmeasured else 0


if __name__ == "__main__":
    sys.exit(main())
