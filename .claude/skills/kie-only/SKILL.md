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

## The free leg is not a way around Kie (2026-10-03)

`image_generate` falls through to Pollinations ($0, keyless) when fal is above
the price and Replicate is off -- which was every call on 2026-10-03. Its
pictures carry a "pollinations.ai" stamp (`watermark` in the answer, #3409):
fine for a draft, never for a client, a post or brand art. Anything that
leaves the house is drawn on Kie (`image_edit` from a raster source).
