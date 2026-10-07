---
name: 'owner-studio'
description: 'STUDIO step before a talking reel: redraw one real photo of a person photorealistic in a ready-made studio (noir, lab, broadcast) on Kie gpt-image-2-5, then use that frame as the face for lipsync. Use when asked for "студия", "крутая студия", "img2img gpt 2.5", "говорящий аватар из фото", "креативы из моего фото", or before any talking reel that would otherwise start from a raw phone photo.'
---

# Owner studio: photo -> studio frame -> talking avatar

## When to Use This Skill

- Someone sends a phone photo or screenshot and wants "me, but in a cool studio".
- A talking reel (owner-noir-reel, story-reel-gift) is about to start from a raw photo.
- New studio presets are needed.

## The one source of truth

Prompts, model, price and order live in
`apps/vibee-editor/render/src/spec/owner-studio.t27`. **Do not copy the prompts
here or into code.** Read them from the spec. The spec holds:

- `IDENTITY`, which always goes first;
- `STUDIO_1..3`: `noir`, `lab`, `broadcast`;
- `MODEL` and `MODEL_FALLBACK`.

## Solution Steps

1. **Crop letterbox bars first** (`CROP_LETTERBOX`). A screenshot of a video
   carries black bars, and the model keeps them as part of the scene. Use PIL
   and find the first and last rows whose brightness is above 60. Note that
   ffmpeg `cropdetect` piped through zsh trips the `$c:a` modifier trap.
2. **Upload the source to Kie's own file store**:
   `POST https://kieai.redpandaai.co/api/file-base64-upload` with
   `Authorization: Bearer $KIE_AI_API_KEY` (from the `vibee-render` env).
   - It returns `data.downloadUrl`, a temporary file.
   - Kie is the primary provider. Nothing in this step leaves Kie.
3. **One task per studio**: `POST api.kie.ai/api/v1/jobs/createTask` with:
   - `model` set to the spec `MODEL`;
   - `input.prompt` set to `IDENTITY + " " + STUDIO_n`;
   - `input.input_urls` set to `[src]`. Use `input_urls`, NOT `image_urls`:
     see `editInputFor` in `src/kie-image.ts`.
   - `aspect_ratio` `9:16` and `resolution` `1K`.
4. Poll `jobs/recordInfo?taskId=` until it returns `success`. The result is at
   `resultJson.resultUrls[0]`. It is a temporary URL, so **copy the file out at
   once**.
5. **Look at every frame before using it.** Check that it is the same face,
   that no text appeared, and that the mouth is not covered by the mic.
6. The chosen frame becomes the `face_url` for `lipsync_generate`
   (`kie/kling/ai-avatar-standard`, see the owner-noir-reel skill).

## Measured (2026-10-02, owner's own photo)

- Three studios in parallel, all `success` in about 1 to 2 min.
- Each came back 941x1672.
- The face, the leopard shirt and the glove were all kept.
- Price: 6 credits ($0.03) per frame, or about $0.09 for three.

## Common Issues

- **Black bars in the output** mean the crop in step 1 was skipped.
- **`401 invalid API_KEY format`**: the variable is `KIE_AI_API_KEY`, not
  `KIE_API_KEY`.
- **The mic covers the lips.** The lipsync then animates the mic. Keep the
  `IDENTITY` clause "held below the mouth".
- **Not yet a client tool.** The host tool that serves these presets to every
  client (pick a studio, then make a talking reel) is not written. The spec
  claim status says so.

## Пишем на .t27

**Владелец, 07.10.2026: «все пишем на .t27».** Число, порог, правило, цена,
лимит, порядок на экране -- всё, что в этой теме решает поведение, пишется
спекой `.t27` ПЕРВОЙ (в `gHashTag/t27`); хост импортирует числа из вывода
`t27c gen-ts`, а тест гоняет каждый `test` спеки против кода. Код без спеки --
долг, а не норма. Как именно, законы и ловушки -- только в навыке
`t27-spec-first`: здесь указатель, не копия правила.

## Related Resources

- `owner-noir-reel`: the talking leg and brand canon (▽ point down, no text).
- `story-reel-gift`: the reel that should take the studio frame as its face.
- `apps/vibee-editor/render/SOUL.md` §3: palette black, gold `#FFD700`, accent
  `#00FF88`.
