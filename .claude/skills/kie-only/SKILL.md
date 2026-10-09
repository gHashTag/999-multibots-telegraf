---
name: 'kie-only'
description: 'Kie (api.kie.ai) is THE provider for every generated asset: stills, video, lipsync, b-roll, speech. Load BEFORE choosing, suggesting or probing any AI provider, before making a reel, a voice, a lipsync or a b-roll, and whenever Replicate, fal, MiniMax, ElevenLabs or "which model" comes up. Holds what Kie has (exact model names), what it does not have (speech cloning), the owner''s default face, and the providers that must not be suggested.'
---

# Kie only

## The rule (owner, 2026-10-02 and again 2026-10-03, angrily, more than once)

**Every generated asset is made on Kie.** Do not suggest, probe, price or
route to another provider — not Replicate, not fal, not MiniMax directly, not
ElevenLabs directly. The owner has said it several times; each re-check of
another provider is the defect, not diligence.

Why they are dead, measured 2026-10-03 (so nobody spends a turn measuring
again):

| provider            | state                                                               |
| ------------------- | ------------------------------------------------------------------- |
| Replicate           | no balance (owner: "нет денег на Replicate")                        |
| fal                 | balance 0.0                                                         |
| MiniMax (direct)    | key valid, `insufficient balance`                                   |
| ElevenLabs (direct) | Railway holds a key ID, not a key: 400 `api_key_id_used_as_api_key` |

## What Kie has (exact `model` for `POST /api/v1/jobs/createTask`)

| job                  | model                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| lipsync (talking)    | `kling/ai-avatar-standard` (owner's pick)                                                      |
| still, img2img       | `gpt-image-2-5-flare-image-to-image`, `google/nano-banana-edit`                                |
| b-roll, image→video  | `minimax-h3/image-to-video` (`first_frame_url`, 5 s, 768P; strip its audio)                    |
| speech, preset voice | `elevenlabs/text-to-speech-multilingual-v2`, `elevenlabs/text-to-speech-turbo-2-5`, Gemini TTS |
| clean a recording    | `elevenlabs/audio-isolation`                                                                   |
| singing voice        | Suno `ai-music-api/create-voice` (songs only)                                                  |

Catalogue: `https://docs.kie.ai/llms.txt`. Key: `KIE_AI_API_KEY` on Railway
service `vibee-render`.

## What Kie does NOT have: speech in a cloned voice

No voice cloning, no speech-to-speech, no voice changer (catalogue 2026-10-03;
twelve guessed model names all answer 422). Kie's ElevenLabs takes preset
voices only.

So **the owner's generated (trained) voice cannot be made on Kie today.** His
old clone (`R8_5GW2UI4A`) is a MiniMax voice bound to Replicate's account.
When a reel needs his voice:

- say so in one sentence and offer the way that keeps the rule: our OWN
  zero-shot voice service on Railway (like `deployment/mouth`, which today runs
  Kokoro/Piper — preset voices only), fed with his voice notes;
- do NOT silently ship his raw voice notes as "his voice" on HIS reels — he
  asked for a generated voice ("надо генерировать новый голос мой"); his notes
  are a source for a clone, not the finished voice;
- do NOT route to another provider.

That service now exists: the owner's generated voice comes from our own `voice-clone` Railway service (`deployment/voice-clone`) through the agent tool `voice_clone_speak` (`render/src/agent/voice-clone-speak.ts`) — rules live there, not here.

## The owner's face

The default face for the owner's reels is **studio-lab**:
`https://vibee-render-production.up.railway.app/s3/assets/1790937535160-f8483d683486b9ec-studio-lab.jpg`
(blue lab, oscilloscope, FPGA board). Not studio-noir (the black wall with the
▽ lamp). Before re-using ANY older lipsync clip, look at one frame of it next
to studio-lab: reel 1 (2026-10-03) was re-rendered from an old noir lipsync
and sent to him that way.

## The Director makes the clip on Kie (2026-10-09, spec agent-media-kie.t27, #3920)

Owner: "why can the reels agent not make reels? the cow must be real!" Measured:
`video_generate` called Replicate only (off), and Kie video was refused to the
agent; `image_generate` put Kie LAST and priced it out ($0.005 ceiling), so
pollinations drew a watermarked cartoon cow. Now:

| what          | rule (from the spec's compiled logic)                                                                                                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| video default | `kie/hailuo/02-text-to-video-pro`, per clip, 114 tokens                                                                                                                                                                           |
| other video   | any `kie/...` whose bill is named before the press (`kieVideoSaleOf(...).sold`): minimax-h3 t2v 26/s, kling v3 turbo 36/s, kling v2.1 pro 100/clip; seedance-2, grok-imagine, wan 3.0 are refused (the provider picks the length) |
| length        | 6 or 10 s (`clip_seconds`)                                                                                                                                                                                                        |
| realism       | no `style` -> the prompt asks for live-action footage (`adds_realism`)                                                                                                                                                            |
| pictures      | chain Kie (`google/nano-banana`, $0.02) first, pollinations only as the rescue; `image_generate` = 8 tokens                                                                                                                       |

The agent's provider outages are a separate thing: on 2026-10-09 07:01-07:15
zai answered 1305 / timed out, nemotron was exhausted and the reserve key had
no funds, and `zai-lite` "talked instead of calling" -- a reel asked then got
words, not a tool call. That is money and keys, not code.

## The free leg is not a way around Kie (2026-10-03)

`image_generate` falls through to Pollinations ($0, keyless) when fal is above
the price and Replicate is off -- which was every call on 2026-10-03. Its
pictures carry a "pollinations.ai" stamp (`watermark` in the answer, #3409):
fine for a draft, never for a client, a post or brand art. Anything that
leaves the house is drawn on Kie (`image_edit` from a raster source).

## Пишем на .t27

**Владелец, 07.10.2026: «все пишем на .t27».** Число, порог, правило, цена,
лимит, порядок на экране -- всё, что в этой теме решает поведение, пишется
спекой `.t27` ПЕРВОЙ (в `gHashTag/t27`); хост импортирует числа из вывода
`t27c gen-ts`, а тест гоняет каждый `test` спеки против кода. Код без спеки --
долг, а не норма. Как именно, законы и ловушки -- только в навыке
`t27-spec-first`: здесь указатель, не копия правила.
