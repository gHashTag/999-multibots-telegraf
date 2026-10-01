---
name: 'voice-mode'
description: 'The voice mode in the app chat (orb, talk to the agent hands-free): where the code is, how barge-in / pause / resume work, the measured numbers, the open weak spots with status, and how a loop cycle picks up where the last one stopped. Use when touching player/src/lib/voice, components/Voice, render /api/voice/*, the whisper or speaches services, or when someone says the voice does not answer, speaks the wrong language, reads markup aloud, or cannot be interrupted.'
---

# Voice mode

A person opens the orb in the chat and talks; the agent answers aloud in the
same conversation. Everything is ours and free: whisper (speaches) on Railway
for ears, speaches TTS (Kokoro for en, Piper voices for ru) for the mouth.

## When to use this skill

- Editing `apps/vibee-editor/player/src/lib/voice/*` or `components/Voice/*`.
- Editing the render routes `/api/voice/{status,warm,transcribe,speak}`
  (`render/render-server.ts`, `render/src/voice/voice.ts`).
- A report: "it does not answer", "it speaks English to me", "it reads
  brackets aloud", "I cannot interrupt it", "it stops when I cough".
- A loop cycle on the voice: start with **Loop handoff** below.

## Quick diagnosis

```bash
./tri loop     # tri виток: in-flight work, this branch's PR, last deploys
./tri voice    # tri голос: status, warm, speak ru/en, hear them back, times
```

`tri voice` needs a person's key in `$AGENT_KEY` (render `AGENT_KEYS`, first
entry, up to `:`). Without one it exits 2, NOT MEASURED -- not green.

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

## Measured numbers (tri voice, 2026-10-02)

| step                   | ru      | en      |
| ---------------------- | ------- | ------- |
| warm (already loaded)  | 483 ms  |         |
| speak one sentence     | 1263 ms | 1814 ms |
| hear a 4 s phrase back | 4646 ms | 2086 ms |

Russian transcription is the largest wait a person feels. Re-measure after any
whisper model or CPU change and update this table.

## Competitors (researched 2026-10-02)

- LiveKit Agents: barge-in after ~0.5 s of speech; on a "false interruption"
  (no transcript within ~2 s) the agent resumes. Our step 1-2 copies this.
- Hume EVI: ~800 ms before speech interrupts. Vapi: `numWords` before stop,
  plus an ignore list of acknowledgements. ElevenLabs: a soft-timeout filler
  phrase after ~3 s of thinking.
- Silero VAD in the browser: `@ricky0123/vad-web` (MIT/ISC, ~2 MB model).
  Pipecat Smart Turn v3: 8 MB ONNX end-of-turn model, CPU, knows Russian.
- Latency trick everyone uses: send the first clause to TTS, not the first
  sentence.

## Weak spots, with status

| #   | weak spot                                          | status                       |
| --- | -------------------------------------------------- | ---------------------------- |
| 1   | card markup read aloud                             | FIXED cycle 1                |
| 2   | any sound killed the answer (280 ms, no resume)    | FIXED cycle 1 (pause/resume) |
| 3   | its own voice through the speaker interrupted it   | FIXED cycle 1 (onset + echo) |
| 4   | stuck "speaking" on a suspended AudioContext       | FIXED cycle 1 (watchdog)     |
| 5   | silence after the phrase looked like "not heard"   | FIXED cycle 1 (earcon)       |
| 6   | Russian transcription 4.6 s                        | OPEN -- model/CPU, measure   |
| 7   | energy VAD: a fan or street noise counts as speech | OPEN -- Silero vad-web       |
| 8   | turn end is a fixed pause; slow speakers get cut   | OPEN -- Smart Turn v3        |
| 9   | nothing said while the agent thinks for long       | OPEN -- filler after ~3 s    |
| 10  | first sound waits for a whole first sentence       | OPEN -- first-clause split   |
| 11  | voice picker only for the app language             | OPEN                         |

Move a row to FIXED only with the PR number and a test that kills the mutation.

## Loop handoff (so a new cycle does not break the last)

1. `./tri loop`. Exit 1 means work in flight: a dirty tree, a gate or push
   running in THIS tree, an open PR on this branch, or a FAILED deploy. Finish
   that first; never start a second branch over a dirty tree.
2. A FAILED player deploy on main blocks every later player merge (the
   deploy runs the whole vitest suite). Fix it in the same PR if nobody else
   is on it -- cycle 1 found #3242's bare `<img>` this way.
3. Take the top OPEN row above. One row per PR is fine; mutation-test it.
4. After merge: `./tri loop` until player SUCCESS, then `./tri voice`.
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
