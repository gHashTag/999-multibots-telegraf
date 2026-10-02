---
name: 'voice-mode'
description: 'The voice mode in the app chat (orb, talk to the agent hands-free): where the code is, how barge-in / pause / resume work, the measured numbers, the open weak spots with status, and how a loop cycle picks up where the last one stopped. Use when touching player/src/lib/voice, components/Voice, render /api/voice/*, the whisper, speaches, gigaam, parakeet or mouth services, or when someone says the voice does not answer, speaks the wrong language, reads markup aloud, cannot be interrupted, or hears a fan or noise as speech.'
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
./tri ears     # tri уши: gigaam (ru) + parakeet (en) + mouth deploys, render routing
./tri turn     # tri ход: does a phrase end the turn (850 ms) or hang (2500 ms); --live
./tri turn --audio done-*.wav cut-*.wav   # the ears' voice verdict on REAL recordings
./tri turn --record   # record those phrases yourself (mic), then the same verdict
./tri words    # tri слова: product words heard as said (reels, lipsync...); exit 1 = XX
```

`tri voice` needs a person's key in `$AGENT_KEY` (render `AGENT_KEYS`, first
entry, up to `:`). Without one it exits 2, NOT MEASURED -- not green.
`tri voice --runs N` (default 3) hears each phrase N times and prints the
**median** with `[min..max]`, split by the render's `Server-Timing` header
into `upload + <engine> + road`, where the engine comes from the header's
`desc` (`gigaam`, `parakeet`, `whisper`, or `gigaam/whisper` when some runs fell back --
that mix means GigaAM is failing). SLOW (exit 2) when the median is >= 3 s.
Speaking prints the engine the same way (`via mouth`, `via speaches`) plus
its own time; `ANOMALY` (exit 1) when the render is configured for the
mouth but speaches answered -- the mouth is down and every sentence is
paying for the fallback.

## Map

```
player/src/lib/voice/session.ts        the state machine: mic, tick, barge-in, queue, playback
player/src/lib/voice/vad.ts            the gate: noise floor, steady room, turn clock (pure)
player/scripts/vad-bench.ts            that gate over WAV files (`tri vad`)
player/src/lib/voice/turnEnd.ts        hangs(): the pause's words say the turn goes on (pure)
player/scripts/turn-bench.ts           hangs() over a battery or phrases (`tri turn`)
session.ts armFiller/fillerSound       the wait said out loud; phrases are voice.filler.* (`tri filler`)
player/src/lib/voice/replyFollower.ts  turns a streaming answer into whole sentences, strips [[card]]
player/src/lib/voice/sentences.ts      sentence cutting
player/src/lib/voice/spokenLang.ts     which language a phrase / sentence is in
player/src/lib/voice/chatVoice.ts      binds a session to one chat thread (send, stop, answering)
player/src/lib/voice/voiceApi.ts       the four HTTP calls
player/src/components/Voice/*          orb (five visual modes from the logo), VoiceDock (in the chat), overlay
player/src/pages/Chat.voiceInChat.test.tsx  voice stays inside the chat (dock, typed -> spoken)
render/src/voice/voice.ts              speakable(), pickVoice(), warm(), hear(), speak()
render/src/voice/hotwords.ts           fixWords(): misheard product words put right after ANY engine (`tri words`)
deployment/gigaam/server.py            ears: POST /hear[?turn=1], GET /health (GigaAM v3 ru, Parakeet v2 en, "turn")
deployment/gigaam/turn.py              Smart Turn v3.2: numpy Whisper log-mel + onnx, Turn.done(samples)
deployment/gigaam/test_turn.py         that log-mel against transformers (run where transformers is)
deployment/mouth/server.py             mouth: POST /speak, GET /health (Kokoro en, Piper ru, 8 threads)
UI strings                             player/src/atoms/language.ts, keys voice.*
apps/vibee-ios/Vibee/VoiceInput.swift  iOS: press-to-talk -> /api/voice/transcribe, answer -> /api/voice/speak
apps/vibee-ios/Vibee/AgentChatView.swift  the mic button in the native chat (iOS strings via say(en, ru))
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

| step                          | ru                                | en                                  |
| ----------------------------- | --------------------------------- | ----------------------------------- |
| warm (already loaded)         | 487 ms                            |                                     |
| speak one sentence            | 1209 ms                           | 2115 ms                             |
| hear a 4 s phrase, from here  | median 3649 [3335..7910] x5       | median 3371 [2819..5499] x5         |
| whisper alone, inside its pod | median ~2.3 s [1.8..2.8]          |                                     |
| hear, after #3248, x5         | median 2605 [2134..3453]          | median 2616 [2176..4305]            |
| -- of which upload            | 232 ms                            | 20 ms                               |
| -- of which whisper           | 1819 ms                           | 2067 ms                             |
| -- of which the road          | 554 ms                            | 529 ms                              |
| hear, after #3252, x7         | median 745 [683..780]             | median 3202 [2835..3482]            |
| -- of which upload            | 87 ms                             | 18 ms                               |
| -- of which the ears          | 175 ms (gigaam)                   | 2617 ms (whisper)                   |
| -- of which the road          | 483 ms                            | 567 ms                              |
| hear, cycle 4 (before #8), x5 | median 1118 [763..6074]           | median 4183 [3539..7162]            |
| -- of which the road          | 849 ms                            | 1189 ms                             |
| felt after the last word      | 850 + 568 = 1418 ms               | 850 + 3633 = 4483 ms                |
| hear, cycle 5 (#3261), x7     | median 701 [650..790]             | median 648 [592..785]               |
| -- of which the ears          | 180 ms (gigaam)                   | 187 ms (parakeet)                   |
| -- of which the road          | 434 ms                            | 443 ms                              |
| felt after the last word      | 850 + 151 = 1001 ms               | 850 + 98 = 948 ms                   |
| speak, cycle 5, x3 / x5       | median 1152 [916..2496]           | median 1949-2300, tail 4.4s         |
| speak, inside the mouth, x3   | 94-154 ms (irina, dmitri)         | 272-318 ms short, ~0.8 s 100 chars  |
| speak, cycle 6 (#3264), x3    | median 836 [682..849]             | median 924 [802..985]               |
| -- of which the mouth         | 196 ms                            | 410 ms                              |
| hear, cycle 6, x5             | median 748 (gigaam 182, road 447) | median 665 (parakeet 173, road 467) |
| one connection (#3266), x5    | road 266, warm round trip 246     | road 291, warm round trip 246       |
| hear, cycle 7, x5             | median 798 (gigaam 160)           | median 645 (parakeet 185)           |
| speak, cycle 7, x3            | median 605 (mouth 210)            | median 684 (mouth 428)              |

Cycle 7's lower speak and road are mostly the MEASUREMENT getting honest:
`tri voice` stopped paying a TLS handshake per call, which a browser pays
once. What is left of the hearing road (266/291 ms) is now the warm round
trip itself (246 ms) -- the sin1 -> sfo distance. `tri voice` still uploads
our TTS mp3 (33 KB), not the player's 32 kbit/s opus, so the bitrate gain
shows only in the A/B (ru 128k 0.88 s -> 32k 0.75 s, one sample each).

"Felt" is what `tri voice` prints since cycle 4: the player's pause
(`END_OF_TURN_MS`) plus the hearing that is NOT hidden inside it by early
hearing (`END_OF_TURN_MS - EAGER_HEAR_MS` = 550 ms). Both constants are read
from `session.ts` itself, never copied. Without early hearing the ru row
would be 850 + 1118 = 1968 ms. The road doubled against cycle 3 (483 -> 849)
with the same code: night-time variance and a 6 s outlier, not a change --
but it is now the largest leg after the pause, see #14.

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

After #3252 Russian waits 745 ms, and the ears are the SMALLEST leg: the
road between the browser, render and the ears is now what to cut -- and,
before it, the player's own wait: `END_OF_TURN_MS = 850` of silence before the
phrase is even sent, more than hearing and the road together. That makes #8
(a model that knows the turn is over) the largest wait left. English
did not change (whisper 2.1-2.8 s between runs is its spread, not a
regression -- the whisper pod was idle at 475 threads during the run).

Server-Timing settled it before GigaAM: whisper was ~70% of the wait, the road ~0.55 s,
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

`gigaam` is NOT wired to GitHub: `./tri ears deploy ru` (old name: `tri
gigaam deploy`) from a clean tree after the PR merges. A merge alone ships
the render, not the ears.

## English ears: Parakeet (cycle 5, 2026-10-02)

Live after #3261: English heard in a median 648 ms (was 4183), felt 948 ms
after the last word (was 4483) -- now level with Russian. Both languages'
hearing is ~180 ms; what is left is the pause (850), the road (~440) and,
for English, the first sound: Kokoro takes ~2 s a sentence (#15). `tri
voice` gives speaking a median of up to 3 runs since one 4.6 s sample
called it SLOW.

The same image (`deployment/gigaam`) as a second service, `parakeet`
(6d9197c7), with `GIGAAM_MODEL=nemo-parakeet-tdt-0.6b-v2 GIGAAM_QUANT=int8`.
Railway hands service variables to the build as ARGs, so the model a service
bakes is the one it loads. Inside its pod, two phrases our TTS spoke, x3:

| phrase                                   | Parakeet v2 int8 | whisper (tri voice) |
| ---------------------------------------- | ---------------- | ------------------- |
| "Voice check: one, two, three, four." 2s | 229-268 ms       | ~2.6-3.0 s          |
| a 5 s sentence with a name and a time    | 348-441 ms       |                     |

Text was exact, punctuated ("...call Anna at five in the evening."). One
quirk: spoken digits come back joined, "one, two, three, four" -> "1234".

- v2, not v3: v2 is English-only and leads the Open ASR board; v3 is
  multilingual but its Russian was unusable (cycle 3). One specialist per
  language, whisper behind both as the fallback.
- int8: a 630 MB model where fp32 is 2.4 GB; the image stays small and the
  speed above is with it.
- Render: `VOICE_HEAR_EN_URL` / `VOICE_HEAR_EN_KEY` (the parakeet service's
  `GIGAAM_KEY`). Unset -> English stays on whisper, exactly as before.
  `earsConfig(lang)` in `voice.ts` is the one table: ru -> gigaam,
  en -> parakeet; an unnamed language goes to whisper, never to either.
- `/api/voice/status` says `hearRu` and `hearEn`; `tri ears` and `tri voice`
  print both.
- Deploy both after a merge that touches `deployment/gigaam`:
  `./tri ears deploy ru` and `./tri ears deploy en` from a clean tree
  (plain `./tri ears deploy` now also ships the mouth).

## Early hearing (cycle 4, 2026-10-02)

After GigaAM the person's wait was mostly the player's own: 850 ms of silence
to judge the turn over, THEN the words. Now (`session.ts`):

- After `EAGER_HEAR_MS` (300) of silence, `requestData()`; the next data
  event snapshots the chunks and transcribes them with an AbortSignal.
- Any loud tick drops the guess (`dropEager`): the person kept talking.
- At the turn end, if the guess is there with the same language hint, its
  words are the turn's words; one transcribe, not two. A guess that FAILED
  falls back to hearing the whole recording -- never an error on its own.
- Only text is guessed. Nothing is SENT to the agent before the turn ends:
  a question can make an invoice or send a message, and those cannot be
  taken back. (LiveKit's preemptive generation drafts the ANSWER early; that
  needs an undo the agent does not have.)
- webm/ogg only (`canHearEarly`). Safari records mp4 with its index at the
  end, so a cut of it is not a file; Safari keeps the old path.
- Cost: one extra transcription per pause of 300..850 ms inside a phrase.
  GigaAM and Parakeet each do it in ~180 ms (before cycle 5 English was a
  second whisper run, aborted client-side while whisper finished anyway).

Why not Smart Turn v3 (the model #8 named): on the server it pays the road
(~0.5-0.8 s) to save at most the 850 ms; in the browser it needs
onnxruntime-web, an 8 MB model and log-mel in JS. Early hearing removes
the same wait for the common case with no model at all. #8's other half --
a slow speaker cut off mid-thought by a fixed pause -- is still open.

## Mouth: our own Kokoro/Piper pool (cycle 6, 2026-10-02)

#15 was not Kokoro and not the road. Inside the whisper pod, the same model
files, three runs each:

| engine                  | threads | short phrase | 100-char sentence |
| ----------------------- | ------- | ------------ | ----------------- |
| speaches API, Kokoro    | 48      | 1.2-1.7 s    | 2.9-3.4 s         |
| Kokoro fp32, standalone | 8       | 320-366 ms   | 673-749 ms        |
| Kokoro fp32, standalone | 48      | 1.3-1.5 s    | 2.5-2.8 s         |
| Kokoro int8, standalone | 8 / 48  | 1.5 / 3.4 s  | 3.7 / 6.6 s       |
| speaches API, Piper ru  | 48      | 0.3-0.77 s   |                   |
| Piper ru, standalone    | 8       | 107-178 ms   | 131-134 ms        |

An ONNX session on all 48 visible cores spends its time synchronising
threads, not computing -- the same lesson as the ears' `pids.max`, from the
other side. speaches has no knob for it, so `deployment/mouth` serves the
same files (same package versions: kokoro-onnx 0.4.5, piper-tts 1.3.0,
onnxruntime 1.22.0) on `MOUTH_THREADS=8`, two sentences at a time. Its own
pod measured English 272-318 ms short and ~0.8 s for 100 characters,
Russian 94-154 ms -- mp3 encoding included.

Live after #3264 (`tri voice --runs 5`): English speaks in a median 924 ms
(was 1949-2300 with a 4.4 s tail), Russian 836 ms (was 1152). Of that the
mouth is 410 / 196 ms; the rest, ~450-500 ms, is the same road as hearing
(#14) -- now the largest leg in BOTH directions.

**The voice is noisy on purpose.** The first live run called the Russian
round trip WRONG: GigaAM heard "Пверка" (cyrillic-ok) in one clip. Twelve
more clips, each heard once, were all right -- Piper's noise_scale made one
short clip (31 KB vs ~33 KB) swallow a syllable. Since cycle 6 `tri voice`
hears every clip it spoke in turn: all misheard is WRONG, a third or more is
CHECK (exit 2), fewer is "one noisy sample, not a fault".

- Render: `VOICE_SPEAK_URL` (`http://mouth.railway.internal:8080`) and
  `VOICE_SPEAK_KEY` (the mouth's `MOUTH_KEY`). Unset -> speaches, as before.
  `speak()` tries the mouth first; a refusal, an error, empty audio or a
  timeout (`mouthTimeoutMs`: 3 s + 12 ms a character) falls back to
  speaches. `Speech.engine` says which one spoke, the route sends it as
  `Server-Timing: speak;dur=..;desc="mouth"`, `/api/voice/status` as
  `speakVia`.
- int8 Kokoro is SLOWER on this CPU at any thread count; keep fp32.
- Piper is not deterministic (noise_scale): the same Russian phrase comes
  back a few hundred bytes different. Not a bug.
- `warm()` still loads the voice into speaches, so the fallback is warm.
- The mouth is NOT wired to GitHub: `./tri mouth deploy` (= `tri ears deploy
mouth`) from a clean tree after a merge that touches `deployment/mouth`.
- `railway add --service mouth -v MOUTH_KEY=...` ECHOES the value. If you
  ever create a service that way, rotate the key at once with
  `railway variables --skip-deploys --set` from a shell variable.

## Competitors (researched 2026-10-02)

- ChatGPT, 2025-11-25 (cycle 12): voice is no longer a separate screen.
  It runs inside the chat with a live transcript and an End button, and
  typing still gets a spoken answer. The old screen is the "Separate mode"
  setting. TechCrunch and Engadget covered it. Ours follows since cycle 12:
  `VoiceDock`, with `voiceSeparateAtom` as the setting.
- Deepgram Flux: `EagerEndOfTurn` fires a draft transcript before the turn is
  sure, `TurnResumed` cancels it, `EndOfTurn` confirms. Our early hearing is
  the same three events inside the player.

- LiveKit Agents: barge-in after ~0.5 s of speech; on a "false interruption"
  (no transcript within ~2 s) the agent resumes. Our step 1-2 copies this.
- Hume EVI: ~800 ms before speech interrupts. Vapi: `numWords` before stop,
  plus an ignore list of acknowledgements. ElevenLabs: a soft-timeout filler
  phrase after ~3 s of thinking.
- Silero VAD in the browser: `@ricky0123/vad-web` (MIT/ISC); ~4.8 MB gzip
  with its onnxruntime (cycle 8). LiveKit and Pipecat run Silero on the
  SERVER, on the audio stream; OpenAI Realtime offers `server_vad` and
  `semantic_vad`. We record in the browser, so ours must judge there.
  Pipecat Smart Turn v3: 8 MB ONNX end-of-turn model, CPU, knows Russian.
- Latency trick everyone uses (LiveKit, Pipecat, Vapi): send the first
  clause to TTS, not the first sentence. Ours since cycle 2: the first comma,
  semicolon or colon after 24 chars, followed by a space, when both halves
  stand alone (`firstClause` in `sentences.ts`). Only the first piece.
- First-sound latency, hosted TTS (cycle 6): ElevenLabs Flash ~75 ms to the
  first byte, Cartesia Sonic 40-90 ms, Deepgram Aura-2 under 200 ms -- all
  STREAM audio as it is made. Our mouth answers a whole short phrase in
  0.1-0.3 s without streaming; streaming would matter only for long first
  clauses. Open models in the same class: Kokoro, Piper, Kitten TTS.
- Thinking fillers (cycle 9): ElevenLabs Agents' soft timeout says a
  phrase after a configurable silence (default 3 s, raised to 10 s in their
  2026-06 changelog; can be LLM-generated) and their design guide warns
  against fillers that promise a time. Vapi fires `request-response-delayed`
  after `timingMilliseconds` (2000 typical). LiveKit async tools take a
  `with_filler` phrase; Pipecat pushes a `TTSSpeakFrame` before a slow tool.
  Overuse is the known failure (one write-up counts ~16% of turns with a
  filler as "awkward"), so ours is capped at two per question.
- **End of turn (cycle 11).** LiveKit's turn detector (on by default)
  moves the wait between `min_delay` 0.3 s and `max_delay` 2.5 s by its
  confidence (0.5/3.0 without it; older `max_endpointing_delay` was 6 s).
  Pipecat's Smart Turn v3 judges the AUDIO (Whisper-tiny encoder, 8M
  params, 8 MB int8 ONNX, 23 languages, ~12-65 ms on CPU) after a 0.2 s
  VAD stop and falls back after `stop_secs` 3 s. A reported trap of
  theirs: a short fallback (1 s) made every "incomplete" verdict end at
  1 s anyway. Ours uses the words we already have, with no download; the
  audio model is the next step for what the words lose ("weekend.").
- **A stalled TTS (cycle 10).** LiveKit's `tts.FallbackAdapter` gives each
  attempt `attempt_timeout` (10 s default) before the next provider.
  Pipecat's `ServiceSwitcher` fails over only on an `ErrorFrame`, so a TTS
  that silently stalls is invisible to it (issue #5305: 66 s of dead air).
  Ours had the Pipecat hole in the player; now `speakDeadlineMs`. LiveKit's
  `BackgroundAudioPlayer` plays a bundled clip (keyboard typing) as its
  thinking sound -- no synthesis at all; ours are words, so they are made
  ahead (warmed at session open).

## The road, split (cycle 7)

`tri road` (= the first line of `tri voice`) measured it from the owner's
Mac on 2026-10-02:

| leg                                           | cost            | who pays it                          |
| --------------------------------------------- | --------------- | ------------------------------------ |
| new connection: DNS + TCP + TLS to the edge   | 160-400 ms      | the first call after 50-60 s quiet   |
| warm round trip, edge `sin1` <-> render `sfo` | 240-320 ms      | EVERY call, even the empty status    |
| upload of the phrase                          | 0.5-1 s (33 KB) | every phrase, after the person stops |

- The edge is Singapore, the render and every pod run in `sfo`
  (`railway status --json` -> `multiRegionConfig.sfo`). The ~250 ms warm
  round trip is that distance; only moving the render (and its database)
  removes it -- an owner decision, not a loop's.
- The edge closes an idle connection after 50-60 s (alive at 50, closed at
  60). The player now notes every call and, when the person STARTS talking
  after 15 s of quiet, sends one plain GET of `/api/voice/status`
  (`wakeRoad`, `voiceApi.ts`): the handshake runs inside their phrase. Plain
  on purpose -- a custom header would add a CORS preflight to the road it
  opens.
- Chrome records at 128 kbit/s by default (48 KB for 3 s), and the recording
  holds the silence before the first word too (up to `IDLE_RESTART_MS`, 12 s).
  `SPEECH_BITS_PER_SECOND = 32_000`: same words from GigaAM and Parakeet at
  128k, 32k and 24k (checked live), 4.5x fewer bytes. A browser that refuses
  the rate records at its own.
- `tri voice` used to open a new connection per call (urllib), so every road
  it printed carried a handshake a person pays once. It now keeps ONE
  connection like a browser, prints the handshake and the warm round trip on
  their own line, and puts the warm round trip next to each hearing road.
- **A warm python connection looked slower than fresh ones** (upload 1189 ms
  median) -- the A/B with curl over HTTP/2 (what the browser speaks) showed
  no difference; it was the network that minute. Measure an anomaly against
  the browser's own protocol before acting on it.

## Steady noise is the room (cycle 8)

The gate (`player/src/lib/voice/vad.ts`, pure, shared by the session, the
tests and `tri vad`) learned its noise floor from quiet only. A fan, an
engine or a hum that STARTS above the floor was loud for good: the session
recorded it as one phrase until `MAX_UTTERANCE_MS` (30 s), and a question
asked over it waited all that time.

The rule: loud AND flat for `STEADY_MS` (2 s) is the room. Flat means the
loudest tick over the quietest in the window is under `STEADY_SPREAD` (2.5).
The gate then takes the window's mean as the new floor and says `steady`;
the session drops what the noise started (`roomChanged`), or, if the noise
had cut into an answer, resumes it (`resumeHeld`).

`tri vad` (scripts/vad-bench.ts) runs the gate tick by tick over audio. Its
own battery: `say` (Milena, Samantha) + ffmpeg `anoisesrc` at 48 kHz.

| file                         | gate before cycle 8          | gate now                                 |
| ---------------------------- | ---------------------------- | ---------------------------------------- |
| ru / en phrase, quiet room   | turn end (4.68 / 4.12 s)     | the same; flattest 2 s spread 92 / 16    |
| brown, pink, white fan alone | "talking" to the end of file | room learned at 2.04 s; spread 1.05-1.73 |
| ru / en question over a fan  | "talking" to the end of file | room at 2.04 s, then 4.56 / 4.04 s heard |
| ru over a fan ~7 dB below it | onset at 0.24 s, never ended | room at 2.04 s; phrase 4.08 of 5.56 s    |

Measured spreads: speech 8.9-93x alone, 4.9-7.6x over a fan; noise
1.05-2.09x. The margin under speech-over-fan is about 2x -- the thinnest
number in this table.

**Limits, said plainly.** TTS is not a person (a person breathes, pauses and
swings more, which helps). The browser's own `noiseSuppression` is NOT in
the bench, so it is the worst case. A fan within ~7 dB of the voice still
eats the quiet tail of a phrase (4.08 s of 5.56 s heard). A RISING noise (a
car passing) is not flat and is still "speech" -- a model VAD is the answer
to that.

Silero, the competitors' choice: `@ricky0123/vad-web` needs onnxruntime-web
(11.2 MB wasm, 2.9 MB gzip) plus the model (2.3 MB, 1.9 MB gzip) -- about
4.8 MB gzip on first use, loaded lazily. An owner decision on weight, not a
loop's.

**zsh trap met while measuring:** `"anoisesrc=c=$c:a=0.2"` in zsh expands
`$c:a` as the `:a` (absolute path) modifier. `tri` is bash; in an
interactive zsh write `${c}`.

## The wait is said out loud (cycle 9)

A tool call left the person in 5-60 s of silence, which on a call reads as
"it dropped". `armFiller()` in `session.ts` is armed every time `pump()`
runs dry while the answer is unfinished (phase `thinking`):

- `FILLER_FIRST_MS` 3000: nothing said yet -> a `voice.filler.first` phrase.
- `FILLER_STILL_MS` 12000: already said a filler OR part of the answer (a
  gap mid-answer) -> `voice.filler.still`. `FILLER_MAX` 2 per question.
- `FILLER_PREPARE_MS` 1000: the phrase's audio is asked for this early, so
  it plays on time. `tri filler` measured English synthesis 620 ms typical
  with a 1.6 s cold tail; at the first try (1500) that tail was LATE.
- A phrase whose audio has not settled by its moment is SKIPPED, and the
  slot counts (the next is "still"). Queued, it would sit at the head and
  the pump would await it with the answer behind -- after the merge
  `tri filler` saw one English synthesis take 36.7 s (not reproduced in
  four more runs).
- Variants are `|`-separated in `language.ts` and rotate per KIND (one
  shared counter made "still" start at its second variant).
- One guard only: `queue empty && phase === 'thinking'`. The generation,
  follower and paused guards all overlapped it -- mutation proved each
  redundant. `silence()` (new question, orb, teardown) clears the timer.
- `fillerSound()` caches the promise per text for the session; a failed
  synthesis is dropped from the cache so the next try asks again.
- `resumeHeld()` drops a filler at the head of the queue: after a barge-in
  that was noise, the answer resumes, not "Let me see." again.

`tri filler` (`tri пауза`): synthesises every phrase once through
`/api/voice/speak` and compares it with its lead (moment minus prepare).
Exit 2 = a phrase is LATE, 1 = a phrase failed.

## A sentence has a deadline; the first wait is warmed (cycle 10)

The render gives the mouth `3 s + 12 ms/char`, then speaches up to 30 s
more, so one sentence can take ~34 s (cycle 9's 36.7 s). The player had NO
limit: `pump()` awaited `queue[0].audio`, and the whole answer waited in
silence behind it. Now `render()` races the request against
`speakDeadlineMs(chars)` = `7000 + 12 * chars` and aborts it; null audio
means the device's voice reads the sentence (`fallbackVoice`). Raced, not
only aborted: a hung response may never notice the signal (the test's fake
ignores it on purpose -- the `no-race` mutation dies there). For an
ordinary sentence the deadline is above the server's legitimate fallback;
a ~600-char one that fell back to speaches may be read by the device.

`start()` calls `fillerSound(fillerText('first'))` once the mic is open:
the cold first synthesis of a quiet spell is paid while the person is
still finding words, not at the first question (where, asked at 1 s and
due at 3 s, it was skipped). Typed sessions (no mic) do not warm.

`tri filler` now prints each phrase as `total=engine ms+road ms` and warns
(exit 2) when a phrase used over half of the player's deadline (read from
`speakDeadlineMs` in the source). Measured 2026-10-02 warm: English
engine 290-350 ms + road 260-520 ms; Russian engine 100-140 ms.

**Test traps met:** the fake-timer helper reused message ids `u`/`a`, so
`ReplyFollower` ignored every answer after the first. And `ReplyFollower`
does not emit a short sentence ("Slow.") while the answer still streams --
a test of "a sentence is being synthesised" needs a long first sentence.

## The words say when a turn is over (cycle 11)

Silence alone cannot tell "Show me my week." from "Show me my week and..."
plus a breath; at a fixed 850 ms the second was cut in half, and the rest
came as a new question over the answer. The words of the pause are usually
known by then (early hearing asks at 300 ms), so `turnEnd.ts` `hangs()`
judges them: a phrase that stops on a conjunction, a preposition, a
hesitation (`and`, `to`, `uh`, `и`, `на`, `э-э`) or a trailing comma or
ellipsis gets `HANGING_TURN_MS` (2500, LiveKit's max_delay with its turn
detector) of silence. Anything else ends at 850 exactly as before. Words
still on their way also hold the turn (up to 2500): the end of the turn
waited for those same words anyway, and now a person who goes on in that
time is ONE phrase, not two.

Measured with `./tri turn --live` (2026-10-02, one kept connection):

- The engines keep the hang in Russian: GigaAM returned "…на этой неделе и"
  and "Хочу записаться на" without a full stop.
- Parakeet merges "week and" into "weekend." (three runs out of three).
  Such a phrase ends at 850 as before. The words cannot save it; only an
  audio model can (Smart Turn v3, row 8b).
- The words land at 720-1094 ms of silence, the engines taking 106-219 ms
  of that. So the "heard" earcon, which used to play at 850 ms, now comes
  0-244 ms later. The answer leaves at the same moment as before.
- A first run with a fresh connection per call printed 1.2-3.4 s. The road
  paid for DNS and TLS every time; the browser does not. Measure with
  one connection, as `tri voice` does.

Traps: the session tests' `say` must let promises settle between ticks
(`await Promise.resolve()`), since a browser tick is its own task. A
synchronous tick loop never sees the words arrive and holds every turn to 2500. Leave "on", "in", "about", "so", "мне", "это" and "ну" OUT of the
list: "turn it on", "покажи мне" and a backchannel "ну" are finished.

## Voice lives inside the chat (cycle 12)

The owner asked, 2026-10-02: why is the voice agent not in the context
of the chat? The session always sent into the open thread
(`createChatVoiceSession(thread, ...)`). But the full-screen overlay hid
that thread: the cards, the earlier answers, and what was just said.
ChatGPT got the same complaint and moved voice into the chat on
2025-11-25, keeping "Separate mode" as a setting. We did the same:

- `VoiceDock` is a bar above the chat's own input box. It holds a small
  orb (tap = interrupt, or restart after an error), the phase, what was
  heard, and buttons for stop, mute, full screen and End. The
  conversation stays on screen and scrolls as it grows.
- **Typing while voice is on** goes to `session.type()`, which answers
  aloud. Before, the box sent past the session, so the answer was
  silent. `type()` now accepts input in any phase except `off`: it drops
  the half-recorded phrase and silences the current answer first.
- Full screen is a choice that is remembered: `voiceSeparateAtom`
  (`vibee.voice.separate`). The overlay's top bar has a button back to
  the chat.

Trap: `useReducedMotion` calls `window.matchMedia`, which jsdom lacks. A
page test that opens voice must stub it.

## The voice judges the turn too -- in shadow (cycle 13)

Words cannot hear a held vowel. The ears now judge the same bytes with
Smart Turn v3.2 (pipecat-ai, BSD-2, `smart-turn-v3.2-cpu.onnx`, 8,679,182
bytes, sha256 pinned in the Dockerfile at HF revision f766f81d). Flow:
player eager hearing -> render `/api/voice/transcribe?turn=1` -> ears
`/hear?turn=1` -> `{text, done, turnMs}` -> render `{text, done}` ->
`stillGoing(words, done)` holds the turn when `done < SOUND_DONE` (0.5).
The voice may only HOLD, never end a turn early.

It is OFF (`VoiceDeps.voiceHolds`): when off, the player does not even ask.
On macOS `say` phrases, 300 ms into the pause, it held 2 of 3 finished
Russian questions ("Сколько стоит клуб?" 0.06) and caught 2 of 7 cut
ones; English was better. Synthesized speech is not its training data, so
that is no verdict either way -- the switch flips only after
`./tri turn --audio done-*.wav cut-*.wav` on the owner's recorded voice
(the summary line: finished held / unfinished caught). Inference ~70 ms CPU.

`./tri turn --record [--lang en]` (cycle 15) is the kit for that: ten
phrases (five finished, five cut mid-thought), Enter starts and stops each
one, files land in `~/.cache/tri/turn-voice/<lang>/done-NN.wav` /
`cut-NN.wav`, already-recorded ones are skipped, and the same `--audio`
verdict runs at the end. It needs a terminal (exit 2 without a tty) and
ffmpeg. The FIRST recording can sit silent: macOS asks for microphone
access for the terminal app, and `ffmpeg -f avfoundation` waits for that
prompt without a word -- a probe from a non-interactive shell just hangs.

Live after deploy (#3315, `tri turn --live`, our mouth -> our ears): English
agreed with the words 3 of 3 (cut "invoices and" 0.01, "Open my calendar."
0.99); Russian finished 0.99, but cut "...na etoy nedele i" 0.77 and "Khochu
zapisat'sya na" 0.52 -- the voice called both finished. Russian stays words-only.

Competitors, LiveKit EOT-bench (false cut-off at a 300 ms budget): LiveKit
v1 9.9 %, Deepgram Flux 12.9 %, v1-mini 27.8 %, Smart Turn v3.2 35.2 %,
AssemblyAI 49.4 %. The field is moving to fused audio+text judges.

Self-critique, cycle 13: the first model download was TRUNCATED (5.88 MB of
8.68) and its wrong sha was pinned before anything loaded it. Check a
download's size against the HF API (`?blobs=true`) before pinning. And
`test_turn.py` proves the features, not the judgement: worst diff 2.2e-06
against transformers says nothing about Russian.

## Product words put right after hearing (cycle 14)

Measured through the live road (`tri words`: our mouth speaks, our ears
hear) on 2026-10-02, GigaAM v3, Russian. Each said word came back wrong in
at least one run, and a SECOND run of the same phrases gave NEW variants --
the engine is not deterministic across calls, so one probe is not a list:

| said        | heard (two runs)                   |
| ----------- | ---------------------------------- |
| reels       | rilz, ril'sa, rels, vilz           |
| lipsync     | Lipsing, Lepsing, Lifsing, lipsing |
| neurophoto  | nerofoto, neirofato                |
| hive (tab)  | uli (every run)                    |
| lead magnet | lit-magnit, lidmagnit              |
| Vibee       | Vaib + LATIN e, Vai + LATIN "be"   |

English (Parakeet) heard every product word right, so `en` has no rows.

`render/src/voice/hotwords.ts` puts them right inside `hear()`, whichever
engine heard (GigaAM or the whisper fallback), so the chat, the agent and
the turn judge all see the meant word. A row is a heard STEM with the noun
endings kept (`rilzami` -> `rilsami`), matched as a whole word only. A
Latin look-alike letter inside a Russian word is mended to Cyrillic, but
AFTER the rows run: "vaibe" wholly in Cyrillic is a real word ("in the
vibe"), and only its two-alphabet spelling is the brand.

Competitors do this INSIDE the decoder, not after it. Deepgram Nova-3
"keyterm prompting": ~100 terms, hard cap 500 tokens, 20-50 recommended,
built into the model (no added latency), multilingual since 2026
([Deepgram](https://deepgram.com/learn/deepgram-expands-nova-3-with-10-new-languages-and-multilingual-keyterm-prompting),
[SDK issue #503](https://github.com/deepgram/deepgram-python-sdk/issues/503)).
NVIDIA NeMo has GPU-PB phrase boosting for CTC, RNN-T and TDT -- Parakeet
included since NeMo 2.5 -- applied at decoding without retraining, best
with beam search
([NeMo word boosting](https://docs.nvidia.com/nemo-framework/user-guide/latest/nemotoolkit/asr/asr_customization/word_boosting.html),
[TurboBias](https://arxiv.org/pdf/2508.07014)). Our pods run both models
through `onnx-asr` 0.12 with greedy decoding and no biasing hook, so the
fix-up table is the free lever today. Moving to NeMo GPU-PB means a NeMo
runtime and beam search in the pod: worth it only if the table grows past a
page. (A first draft of this paragraph said "Parakeet has no biasing hook"
from memory; the search said otherwise.)

Self-critique: synthesized speech, one voice. The rows are what the engine
returned for OUR mouth -- a person's "reels" may break differently. Grow
the table from `tri words` and real transcripts, never from guesses: a row
that fires on a real word is worse than the mishearing.

## The phone hears and speaks too (cycle 15)

The iOS agent chat is native SwiftUI (`AgentChatView.swift`), not the web
chat, so thirteen cycles of web voice never reached it. Cycle 15 gave it
the smallest honest version: a mic button between the text field and
Send. Press -> `AVAudioRecorder` writes 16 kHz mono 16-bit WAV (what the
ears resample to anyway; 60 s cap ~1.9 MB, under the render's 8 MB);
press again -> `POST /api/voice/transcribe?lang=ru|en` (the phone's
language, so the fast ears are used, never whisper's detection) -> the
words are sent as an ordinary message -> the agent's answer goes to
`POST /api/voice/speak` and plays. Same ears, same mouth, same budgets
(401 says "sign in under Profile", 429 says "wait a minute").

Two iOS traps it had to respect:

- **Sound belongs to the feed.** `FeedView` sets `.playback` /
  `.moviePlayback`. Recording needs `.playAndRecord`; the category is
  borrowed for one utterance and put back (`restoreSession`), or the
  feed's videos would follow call routing.
- **`Info.plist` is generated.** The permission text lives in
  `project.yml` (`NSMicrophoneUsageDescription`), the Russian one in
  `Vibee/ru.lproj/InfoPlist.strings`; run `xcodegen generate` and commit
  the regenerated plist. A recording without the key crashes the app.

Competitors: ChatGPT's iOS app has both a dictation mic (speech into the
text box, the person reviews it) and a separate hands-free voice mode;
Telegram transcribes voice notes after the fact. Ours sends at once and
reads the answer aloud -- closer to a walkie-talkie than to dictation.

Self-critique: press-to-talk, not hands-free -- the second press ends the
turn, which cannot be wrong but is not a conversation. No barge-in by
voice: a new press stops the answer. `VoiceInputTests` pin the URL, the
reading of the answer, the failure texts and the format; nothing tests the
recording itself, which needs a microphone and a person.

## The phone mic, guarded (cycle 16)

The reviewer bee on #3332 found four holes; all are closed here.

- **Time up sends.** At the 60 s cap `AVAudioRecorder` stops itself and
  the button used to stay on "listening". Now the recorder's delegate
  sets `timeUp`, and the chat sends what was said as if pressed. A late
  stop from an earlier take is ignored: only the current recorder's
  `ObjectIdentifier` counts (`testOnlyTheCurrentRecorderCanCallTimeUp`).
- **Leaving the chat stops it.** Hidden tabs stay alive in this app, so
  `onDisappear` alone is not enough: `tabIsShown` -> `setShown(false)`
  stops the recording (and throws the file away) and the reading. A
  `speak` that was still fetching does not play into a hidden tab.
- **The mic rests when Send rests.** Before a card's thread is ready
  (`!canWrite`) or while an answer streams, a new recording cannot start;
  one already running can always be stopped.
- **Read only what was answered.** The answer is read only if the message
  list grew, so a send that was refused no longer re-reads the old answer.

`tri turn --record` also reported "no recordings" when only `cut-*` files
existed: an unmatched zsh/bash glob stays literal, and the check looked
at the pattern instead of the files.

Self-critique: the cycle 15 merge (squash-merged parent + stacked branch)
put the `tri words` help block in twice; git auto-merged two identical
insertions without a conflict. The bee caught it, not me. After merging
main into a stacked branch, `git diff origin/main -- tri | grep '^+'` must
show only this branch's lines.

## The phone mic's edges (cycle 17)

The bee on #3336 merged it and left three edges, all closed here:

- **No recording nobody asked for.** The time-up handler pressed the mic
  without looking: if a manual Stop finished first, the press started a
  new take. It now presses only while still `.listening`.
- **No recording in a hidden tab.** `start()` awaits the permission
  prompt; a person who left meanwhile got a recording in a tab nobody
  sees, holding the audio session for 60 s. It now checks `shown` (and
  that the phase is still idle) after the prompt.
- **A test that kills the mutation.** Cycle 16's test passed with the
  identity check deleted: an idle `VoiceInput` returns before the check
  is reached. The rule is now `VoiceInput.isTimeUp(listening:stopped:current:)`,
  and the test reaches the listening case. Both mutants (`listening`
  alone, identity alone) were run with `swift` against the same
  assertions and KILLED.

Self-critique: cycle 16 claimed "mutation-check the guard" in its plan
and shipped without doing it; a test that cannot reach the line it guards
is not a test of it. When the simulator cannot run, extract the rule into
a pure function and mutate that.

## Hands-free on the phone, a voice per language (cycle 19)

Three things, one PR:

- **The phone hears the end of a turn.** `TurnJudge.swift` is the web's
  rule (`vad.ts`: noise floor, 160 ms onset, 850 ms end, a loud flat 2 s is
  the room, 8 s of nobody gives up) as a pure struct. `VoiceInput` reads
  the recorder's meter every 50 ms (`isMeteringEnabled`,
  `averagePower` -> `TurnJudge.level(dB:)`) and raises `turnEnded`;
  `AgentChatView` sends on `wantsFinish` (time up OR turn ended). No second
  press per question any more.
- **A conversation.** Long-press the mic (or the accessibility action
  "Talk hands-free"): ask, hear the answer, the mic listens again
  (`VoiceInput.listensAgain`). A tap ends it -- while listening it sends
  what was said, while speaking it hushes. Silence (`nobodySpoke`) ends it
  out loud. **No barge-in by voice**: the iPhone has no echo cancellation
  on this path, so the agent would hear itself and interrupt itself; a tap
  interrupts instead (row 19b).
- **A voice picker per spoken language** (row 11). The session speaks each
  sentence in ITS language, so an English app reads Russian sentences with
  a Russian voice nobody could choose. `voicePickers(appLang, voices)`
  gives one select per language that has a choice, the app's first.

`./tri vad --ios` compiles the real `TurnJudge.swift` with a reader and
runs it over the same battery as `tri vad` (or your files, e.g. the
owner's `~/.cache/tri/turn-voice/ru/*.wav` from `tri turn --record`, which
get 1.5 s of quiet appended -- Enter stops them on the last word). Exit 1 =
speech that never ended as a turn, or a fan that was anything but "nobody
spoke". Battery: speech ends 5.4 / 5.9 s, speech over a fan 8.3 / 8.8 s,
each fan "nobody spoke" at 8.05 s.

Self-critique:

- **The port had a bug the first test did not see.** The floor learned
  whenever the level was quiet (`loudSince == nil`, i.e. between WORDS);
  the web learns only before speech (`!turn.spoke`, between PHRASES). A
  mutant survived, which is how it showed. Pinned by "hushed gaps do not
  teach the floor".
- **A test that never spoke.** The first syllables were 150 ms, under the
  160 ms onset: "speech" never started and the test proved nothing. Now
  250 ms.
- **`tri vad --ios` passed a broken rule.** With the room never learned,
  two fans read "going" -- the mic held open to 60 s -- and the check only
  asked "not ended". It now demands "nobody spoke". Found by running the
  mutant, not by reading the code.
- **Measured on battery audio, not a phone.** `averagePower` is RMS in
  dBFS, close to what `tri vad --ios` computes, not identical; the iPhone
  mic's AGC is not in the battery. Thresholds are the web's, unvalidated on
  a device.

## Weak spots, with status

| #   | weak spot                                             | status                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | card markup read aloud                                | FIXED cycle 1                                                                                                                                                                                                                   |
| 2   | any sound killed the answer (280 ms, no resume)       | FIXED cycle 1 (pause/resume)                                                                                                                                                                                                    |
| 3   | its own voice through the speaker interrupted it      | FIXED cycle 1 (onset + echo)                                                                                                                                                                                                    |
| 4   | stuck "speaking" on a suspended AudioContext          | FIXED cycle 1 (watchdog)                                                                                                                                                                                                        |
| 5   | silence after the phrase looked like "not heard"      | FIXED cycle 1 (earcon)                                                                                                                                                                                                          |
| 6   | Russian hearing ~3.6 s median (whisper ~2.3 s)        | FIXED cycle 3 (GigaAM, #3252)                                                                                                                                                                                                   |
| 7   | energy VAD: a fan or street noise counts as speech    | PARTLY cycle 8 (steady noise = room); rising noise -> Silero                                                                                                                                                                    |
| 8   | words heard only after the 850 ms pause               | FIXED cycle 4 (#3257)                                                                                                                                                                                                           |
| 8b  | turn end is a fixed pause; slow speakers get cut      | PARTLY cycle 11 (words); cycle 13 voice judge in SHADOW (`voiceHolds` off) until `tri turn --audio` on real voices                                                                                                              |
| 9   | nothing said while the agent thinks for long          | FIXED cycle 9 (filler at 3 s, "still" at 15 s; `tri filler`)                                                                                                                                                                    |
| 10  | first sound waits for a whole first sentence          | FIXED cycle 2 (first clause)                                                                                                                                                                                                    |
| 11  | voice picker only for the app language                | FIXED cycle 19 (`voicePickers`: one select per spoken language, app first)                                                                                                                                                      |
| 12  | product words misheard by every engine ("рилс")       | FIXED cycle 14 (`hotwords.ts` after hearing; `tri words`) -- table from synthesized speech only                                                                                                                                 |
| 13  | English hearing is still whisper, ~2.6 s              | FIXED cycle 5 (Parakeet v2)                                                                                                                                                                                                     |
| 14  | the road (browser-render-ears) 0.5-0.85 s, tails 6 s  | PARTLY cycle 7 (wakeRoad, 32k); sin1->sfo 250 ms is the region                                                                                                                                                                  |
| 15  | English first sound ~2 s (Kokoro in the whisper pod)  | FIXED cycle 6 (mouth, 8 threads)                                                                                                                                                                                                |
| 16  | a stalled synthesis silences the whole answer         | FIXED cycle 10 (`speakDeadlineMs`, device voice reads it)                                                                                                                                                                       |
| 17  | first wait phrase cold, skipped at the first question | FIXED cycle 10 (warmed at session open)                                                                                                                                                                                         |
| 18  | full-screen voice hid the chat it talks about         | FIXED cycle 12 (VoiceDock; typed -> spoken; overlay is opt-in)                                                                                                                                                                  |
| 19  | the iOS app has no voice at all                       | FIXED cycle 15 (`VoiceInput.swift`: press-to-talk in `AgentChatView`, answer read aloud); cycle 16 guards (time up, hidden tab, rests with Send) -- cycle 19 hands-free (`TurnJudge`, long-press conversation; `tri vad --ios`) |
| 19b | iPhone: no barge-in by voice while it speaks          | OPEN -- no echo cancellation on this path (`.playAndRecord` + `.voiceChat` would be the start); a tap interrupts                                                                                                                |

Move a row to FIXED only with the PR number and a test that kills the mutation.

## Loop handoff (so a new cycle does not break the last)

1. `./tri loop`. Exit 1 means work in flight: a dirty tree, a gate or push
   running in THIS tree, an open PR on this branch, a FAILED deploy, or one
   still BUILDING/DEPLOYING (until cycle 4 that last case read "nothing in
   flight"; until cycle 7 an OPEN PR on this branch did too). Finish
   that first; never start a second branch over a dirty tree.
2. A FAILED player deploy on main blocks every later player merge (the
   deploy runs the whole vitest suite). Fix it in the same PR if nobody else
   is on it -- cycle 1 found #3242's bare `<img>` this way.
3. Take the top OPEN row above. One row per PR is fine; mutation-test it.
4. After merge: `./tri loop` until player SUCCESS, then `./tri voice`
   (`./tri road` alone answers "is it the network?" in two seconds). If
   the PR touched `deployment/gigaam`, also `./tri ears deploy ru` and
   `./tri ears deploy en`; if it touched `deployment/mouth`,
   `./tri mouth deploy`. `./tri ears` then shows every deploy and the
   render's routing for hearing and speaking.
   A PR that touches `vad.ts` or the session's tick: `./tri vad` (exit 1 =
   speech taken for the room or a fan held as a phrase) before the commit.
   A PR that touches `TurnJudge.swift`: `./tri vad --ios`, and
   `./tri iphone typecheck` for any Swift change (no simulator needed).
   A PR that touches `voice.filler.*`, the FILLER\_\* numbers or
   `speakDeadlineMs`: `./tri filler`. A PR that touches `turnEnd.ts`,
   `turnOver` or the eager guess: `./tri turn` (battery, exit 1 on a wrong
   verdict) and `./tri turn --live` (what the real ears keep of a hang).
   A PR that touches `hotwords.ts`: `./tri words` after the render deploy
   (exit 1 = a word still misheard, or a row firing on a real word).
5. Update the tables here in the same PR.
6. A push that had to skip hooks (`--no-verify`, ssh dropping after a long
   pre-push) skips the player's lint ratchet too. Cycle 7 put 4 errors on
   main that way -- a plain function named `useRoad` is a React hook to
   eslint's `rules-of-hooks` -- and cycle 8's honest push was the one
   refused. `tri loop` now runs the ratchet; never name a non-hook `use*`.

## Common issues

- **Type errors that vitest never shows.** Cycle 13 put 10 into the player's
  ratchet: spreading `extra: Partial<VoiceDeps>` over the test deps widened
  `d.transcribe` to a union, and `vi.fn(async () => ...)` has no parameters,
  so `mock.calls[0][0]` has no type. Give test mocks their real parameters
  and pick only the fields a helper overrides (`Pick<VoiceDeps, 'voiceHolds'>`).
  Check one file fast with a temporary tsconfig that extends
  `tsconfig.app.json` and includes only the test (delete it after).
- **"a cough held it" fails under heavy load** (load average 200+): a
  real-timer filler ("Let me see.") lands in `spoken`. It passed 57/57
  twice right after; a red run on a starved machine is not a verdict.

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
