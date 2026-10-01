---
name: 'voice-mode'
description: 'The voice mode in the app chat (orb, talk to the agent hands-free): where the code is, how barge-in / pause / resume work, the measured numbers, the open weak spots with status, and how a loop cycle picks up where the last one stopped. Use when touching player/src/lib/voice, components/Voice, render /api/voice/*, the whisper or speaches services, or when someone says the voice does not answer, speaks the wrong language, reads markup aloud, or cannot be interrupted.'
---

# Voice mode

A person opens the orb in the chat and talks; the agent answers aloud in the
same conversation. Everything is ours and free: GigaAM v3 (its own `gigaam`
service) for Russian ears, whisper (speaches) on Railway for English and as
the fallback, speaches TTS (Kokoro for en, Piper voices for ru) for the mouth.

## When to use this skill

- Editing `apps/vibee-editor/player/src/lib/voice/*` or `components/Voice/*`.
- Editing the render routes `/api/voice/{status,warm,transcribe,speak}`
  (`render/render-server.ts`, `render/src/voice/voice.ts`).
- Editing `deployment/gigaam/*` (the Russian ears) or the `whisper` service.
- A report: "it does not answer", "it speaks English to me", "it reads
  brackets aloud", "I cannot interrupt it", "it stops when I cough".
- A loop cycle on the voice: start with **Loop handoff** below.

## Quick diagnosis

```bash
./tri loop     # tri виток: in-flight work, this branch's PR, last deploys
./tri voice    # tri голос: status, warm, speak ru/en, hear them back, times
./tri gigaam   # Russian ears: newest deploy, does the render route ru to it
```

`tri voice` needs a person's key in `$AGENT_KEY` (render `AGENT_KEYS`, first
entry, up to `:`). Without one it exits 2, NOT MEASURED -- not green.
`tri voice --runs N` (default 3) hears each phrase N times and prints the
**median** with `[min..max]`, split by the render's `Server-Timing` header
into `upload + <engine> + road`, where the engine comes from the header's
`desc` (`gigaam`, `whisper`, or `gigaam/whisper` when some runs fell back --
that mix means GigaAM is failing). SLOW (exit 2) when the median is >= 3 s.

## Map

```
player/src/lib/voice/session.ts        the state machine: mic, VAD, barge-in, queue, playback
player/src/lib/voice/replyFollower.ts  turns a streaming answer into whole sentences, strips [[card]]
player/src/lib/voice/sentences.ts      sentence cutting
player/src/lib/voice/spokenLang.ts     which language a phrase / sentence is in
player/src/lib/voice/chatVoice.ts      binds a session to one chat thread (send, stop, answering)
player/src/lib/voice/voiceApi.ts       the four HTTP calls
player/src/components/Voice/*          orb (five visual modes from the logo), overlay
render/src/voice/voice.ts              speakable(), pickVoice(), warm(), hear(), speak()
deployment/gigaam/server.py            Russian ears: POST /hear, GET /health (GigaAM v3, onnx-asr)
UI strings                             player/src/atoms/language.ts, keys voice.*
```

## How talking over the agent works (cycle 1, 2026-10-02)

1. Loud for **500 ms** while it speaks (`BARGE_IN_MS`), and not within the
   first **150 ms** of a sentence (`ONSET_DEAF_MS`, the echo canceller's
   onset): the session **pauses**, it does not stop. The queue and the
   server's answer are kept; the interrupted sentence stays at the head.
2. The utterance is transcribed. Noise, a backchannel (`isBackchannel`:
   "угу", "mm-hmm", "okay"...) or an echo of the sentence being said
   (`isEcho`, >= 60% of the heard words) -> **resume** from the cut sentence.
3. Real words -> `ask()`: the old answer is stopped on the server and the
   words become the new question.
4. The orb (`interrupt()`) stops a paused answer too.

Other guarantees, each pinned by a test in `session.test.ts`:

- `[[card: ...]]` markers are never spoken; when the answer finishes, the
  cards are named once: "You can choose: A, B." (`voice.options`).
- Playback has a watchdog: `duration + 1.5 s`. A suspended AudioContext (call,
  lock screen) never fires `onended`; without the watchdog the session stayed
  "speaking" for ever.
- The mic asks `echoCancellation: 'all'` (Chrome 141+ cancels Web Audio
  output too) and falls back to `true`.
- A short earcon (660 -> 990 Hz) when the phrase is taken, so silence while
  whisper works is not mistaken for "it did not hear me".

## Measured numbers (2026-10-02)

| step                          | ru                          | en                          |
| ----------------------------- | --------------------------- | --------------------------- |
| warm (already loaded)         | 487 ms                      |                             |
| speak one sentence            | 1209 ms                     | 2115 ms                     |
| hear a 4 s phrase, from here  | median 3649 [3335..7910] x5 | median 3371 [2819..5499] x5 |
| whisper alone, inside its pod | median ~2.3 s [1.8..2.8]    |                             |
| hear, after #3248, x5         | median 2605 [2134..3453]    | median 2616 [2176..4305]    |
| -- of which upload            | 232 ms                      | 20 ms                       |
| -- of which whisper           | 1819 ms                     | 2067 ms                     |
| -- of which the road          | 554 ms                      | 529 ms                      |

What the pod measurements showed (cycle 2, inside the whisper pod):

- The turbo model's encoder over a padded 30 s window is the cost. Beam size
  changes nothing; threads 8 -> 16 -> 24 give 3.1 -> 2.85 -> 2.45 s.
- Naming the language (`language=ru`) halves it: 1.7-2.1 s vs ~4 s on
  auto-detect. `hear()` already passes it.
- So of the ~3.6 s a person waits, ~2.3 s is whisper and the rest is upload
  and the road between the browser, render and whisper -- with a long tail
  (one run 7.9 s). `Server-Timing` now says which leg each run lost.
- The next real gain is a model that does not pad to 30 s: GigaAM (Russian
  CTC) as its own service. 24 threads would buy ~10% and steal CPU from TTS.

Server-Timing settles it: whisper is ~70% of the wait, the road ~0.55 s,
upload 0.2 s. The drop from 3649 to 2605 ms between the two rows is NOT a
fix -- #3248 did not touch hearing; it is the same night-time variance the
max column shows. Faster hearing means a faster model, nothing else.

**One sample lies.** Cycle 1 recorded "ru 4.6 s" from a single run and blamed
whisper; the pod says whisper is half of that. Medians of >= 3 runs only, and
re-measure after any whisper model or CPU change.

## Russian ears: GigaAM (cycle 3, 2026-10-02)

Same six phrases, inside the whisper pod, model in memory:

| engine                                | per phrase  | Russian                      |
| ------------------------------------- | ----------- | ---------------------------- |
| whisper large-v3-turbo, `language=ru` | 2.1-3.0 s   | good                         |
| Parakeet TDT 0.6b v3 (onnx)           | 0.9-1.9 s   | unusable ("Люпсинка")        |
| GigaAM v3 e2e-ctc (onnx-asr 0.12.0)   | 0.05-0.10 s | correct, punctuated, numbers |
| GigaAM v3 ctc                         | same        | lowercase, no punctuation    |

As a service (`POST /hear`, ffmpeg decode of webm/opus included): 140-210 ms.
GigaAM knows only Russian -- English stays on whisper.

Routing (`hear()` in `voice.ts`), each rule pinned by a test in
`voice.test.ts`, all eight mutants killed:

- `lang=ru` and `VOICE_HEAR_RU_URL` + `VOICE_HEAR_RU_KEY` set -> GigaAM, 4 s
  timeout. A refusal, a non-2xx, a body without `text`, a timeout -> whisper.
- An EMPTY text from GigaAM is trusted (silence); whisper invents sentences
  out of silence, so asking it again would be worse, not safer.
- No `lang` (every 6th phrase, `RELEARN_EVERY`) or `en` -> whisper. That is
  how the player keeps re-learning the person's language, so routing by the
  hint never locks a person into Russian.

**The whisper pod is full: never load another model into it.** Its container
has `pids.max = 1000`; every ONNX model takes a thread pool sized to the 48
visible cores and speaches has no knob for it (`OMP_NUM_THREADS` is ignored).
Whisper + 4 Piper + Kokoro + Silero hold ~470; Parakeet beside them reached
986 and Python could not start a thread (numpy/OpenBLAS errors, a segfault).
A new model gets its own service, like `gigaam` (`GIGAAM_THREADS`, default 8).

`gigaam` is NOT wired to GitHub: `./tri gigaam deploy` from a clean tree after
the PR merges. A merge alone ships the render, not the ears.

## Competitors (researched 2026-10-02)

- LiveKit Agents: barge-in after ~0.5 s of speech; on a "false interruption"
  (no transcript within ~2 s) the agent resumes. Our step 1-2 copies this.
- Hume EVI: ~800 ms before speech interrupts. Vapi: `numWords` before stop,
  plus an ignore list of acknowledgements. ElevenLabs: a soft-timeout filler
  phrase after ~3 s of thinking.
- Silero VAD in the browser: `@ricky0123/vad-web` (MIT/ISC, ~2 MB model).
  Pipecat Smart Turn v3: 8 MB ONNX end-of-turn model, CPU, knows Russian.
- Latency trick everyone uses (LiveKit, Pipecat, Vapi): send the first
  clause to TTS, not the first sentence. Ours since cycle 2: the first comma,
  semicolon or colon after 24 chars, followed by a space, when both halves
  stand alone (`firstClause` in `sentences.ts`). Only the first piece.

## Weak spots, with status

| #   | weak spot                                          | status                       |
| --- | -------------------------------------------------- | ---------------------------- |
| 1   | card markup read aloud                             | FIXED cycle 1                |
| 2   | any sound killed the answer (280 ms, no resume)    | FIXED cycle 1 (pause/resume) |
| 3   | its own voice through the speaker interrupted it   | FIXED cycle 1 (onset + echo) |
| 4   | stuck "speaking" on a suspended AudioContext       | FIXED cycle 1 (watchdog)     |
| 5   | silence after the phrase looked like "not heard"   | FIXED cycle 1 (earcon)       |
| 6   | Russian hearing ~3.6 s median (whisper ~2.3 s)     | FIXED cycle 3 (GigaAM, #PR)  |
| 7   | energy VAD: a fan or street noise counts as speech | OPEN -- Silero vad-web       |
| 8   | turn end is a fixed pause; slow speakers get cut   | OPEN -- Smart Turn v3        |
| 9   | nothing said while the agent thinks for long       | OPEN -- filler after ~3 s    |
| 10  | first sound waits for a whole first sentence       | FIXED cycle 2 (first clause) |
| 11  | voice picker only for the app language             | OPEN                         |
| 12  | product words misheard by every engine ("рилс")    | OPEN -- hotword fix-up       |

Move a row to FIXED only with the PR number and a test that kills the mutation.

## Loop handoff (so a new cycle does not break the last)

1. `./tri loop`. Exit 1 means work in flight: a dirty tree, a gate or push
   running in THIS tree, an open PR on this branch, or a FAILED deploy. Finish
   that first; never start a second branch over a dirty tree.
2. A FAILED player deploy on main blocks every later player merge (the
   deploy runs the whole vitest suite). Fix it in the same PR if nobody else
   is on it -- cycle 1 found #3242's bare `<img>` this way.
3. Take the top OPEN row above. One row per PR is fine; mutation-test it.
4. After merge: `./tri loop` until player SUCCESS, then `./tri voice`. If
   the PR touched `deployment/gigaam`, also `./tri gigaam deploy`.
5. Update the tables here in the same PR.

## Common issues

- **Tests stub `speechSynthesis`, not audio.** `synthesize` throws in the
  test session, so the device voice path is what gets exercised; the test
  controls when a sentence "ends". Keep that pattern for new tests.
- **`createOscillator` is missing in test contexts.** `cue()` is in
  try/catch on purpose.
- **Typing a fake analyser**: give `getFloatTimeDomainData` the base class's
  signature, or tsconfig.app.json fails (vitest alone does not).
- **The key helper hung for ever** when infisical was logged out (interactive
  login) and passed an update banner on as the key. Fixed in `_mcp_key`:
  `timeout 15`, `</dev/null`, and a shape check.

## Related

- `.claude/skills/tri/SKILL.md` -- the CLI itself.
- `.claude/skills/phone-shot/SKILL.md` -- look at the orb on a real phone width.
- `.claude/skills/three-options-at-the-end/SKILL.md` -- how a cycle report ends.
