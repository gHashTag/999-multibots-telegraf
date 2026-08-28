---
name: 'Free reels + img2img (бесплатный контент-пайплайн)'
description: 'Как ДЁШЕВО/БЕСПЛАТНО делать рилсы (SplitTalkingHead/NoirReel/TrinityBlogReel) и img2img-историю из фото/аватара. Живой статус провайдеров и рабочие HTTP-рецепты. Load при запросах: «сделай рилс», «липсинк», «мой голос», «история из аватара img2img», «бесплатно на моём токене», t27.ai/Trinity S³AI контент.'
---

# Free reels + img2img

Проверено живьём 2026-08-28. Обновляй таблицу статуса при каждом заходе —
провайдеры протухают быстрее кода.

## СТАТУС ПРОВАЙДЕРОВ (обновляемая таблица — дата последней живой проверки)

| Провайдер                       | Что даёт                                    | Статус на 2026-08-28                                               | Как проверить                                       |
| ------------------------------- | ------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------- |
| **Remotion (локальный рендер)** | сборка mp4 из шаблона                       | ✅ РАБОТАЕТ, $0 (только `reel_render`=1 токен, free-in-prod)       | `POST /render/template`                             |
| **Pollinations FLUX**           | картинка по тексту (и грубый img2img)       | ✅ РАБОТАЕТ, **keyless**, $0                                       | `GET image.pollinations.ai/prompt/{p}?model=flux`   |
| **GLM текст (z.ai coding)**     | история/сценарий/промпты                    | ✅ РАБОТАЕТ (флэт-рейт)                                            | `POST api.z.ai/api/coding/paas/v4/chat/completions` |
| **GLM CogView / CogVideoX**     | картинки / видео (в т.ч. i2v из фото)       | ⚠️ `1113 нет пакета` на ВСЕХ 4 аккаунтах — нужен мультимодал-пакет | `POST api.z.ai/api/paas/v4/images/generations`      |
| **Pollinations Kontext**        | img2img С СОХРАНЕНИЕМ ЛИЦА (FLUX.1 Kontext) | ⚠️ требует бесплатный аккаунт `enter.pollinations.ai`              | `?model=kontext&image={url}`                        |
| **FAL** (картинки/lipsync VEED) | картинка, липсинк image+audio→video         | ⚠️ `Exhausted balance`                                             | `queue.fal.run`                                     |
| **ElevenLabs**                  | озвучка/клон голоса                         | ⚠️ ключ невалиден (идентификатор, не `sk_`) + платно               | `api.elevenlabs.io/v1/voices`                       |
| **Replicate**                   | картинка/видео фолбэк                       | 💲 платно (работает)                                               | `api.replicate.com/v1/account`                      |

Ключи z.ai аккаунтов владельца — вне гита: `~/.zai-accounts.local.env` (chmod 600).
GLM-мультимодал заработает, как только на ОДНОМ аккаунте будет resource package.

## ГЛАВНОЕ БЕСПЛАТНОЕ ПЛЕЧО: локальный Remotion

3 зарегистрированных шаблона (Root.tsx): **SplitTalkingHead** (основной,
talking-head), **NoirReel** (ч/б нуар + cutaway-сцены + золотая карточка),
**TrinityBlogReel** (барочная гравюра, без внешних медиа — самый безрисковый).
Рендер = $0 внешних сервисов. Всё, что нужно — media по ПУБЛИЧНОМУ URL.

### Рецепт: рилс с ЛИЦОМ пользователя (SplitTalkingHead), бесплатно

Источник — реальный talking-head клип (селфи-видео 9:16 с речью). Именно так
«мы это делаем»: AI-генерация головы — дорогой опциональный апгрейд, базовый
шаблон работает с записанным клипом даром.

```bash
RK=$(railway variables --kv | grep '^RENDER_API_KEY=' | cut -d= -f2-)
# 1) залить клип
UP=$(curl -s -X POST "$RENDER/upload" -H "X-Api-Key: $RK" \
  -H "X-Filename: clip.mp4" -H "Content-Type: video/mp4" --data-binary @clip.mp4)
DIRECT=$(echo "$UP" | python3 -c "import sys,json;print(json.load(sys.stdin)['directUrl'])")
# 2) рендер — lipSyncVideo = ПРЯМОЙ URL бакета (см. ловушку ниже)
curl -s -X POST "$RENDER/render/template" -H "X-Api-Key: $RK" -H 'Content-Type: application/json' \
  -d "{\"compositionId\":\"SplitTalkingHead\",\"lipSyncVideo\":\"$DIRECT\",\"props\":{\"captionLanguage\":\"ru\",\"ctaText\":\"t27.ai\"}}"
# 3) поллить GET /render/{renderId} до status=completed → outputUrl
```

Субтитры по словам транскрибируются сами (fetchCaptions). NoirReel — те же
шаги + `props.brand.masthead="Trinity S³AI"` + `cutaways:[{src,startFrame,durationFrames}]`
(cutaway src = ВИДЕО, grayscale). NoirReel НЕ авто-транскрибирует — задавай
`endCardStartMs`, иначе финальная карточка вылезет на 6-м кадре.

### 🪤 ЛОВУШКА: /s3/ путь → 401 в рендере

Если `lipSyncVideo` содержит `/s3/`, сервер пре-скачивает во внутренний
`http://0.0.0.0:8080/render-temp/…`, а его РЕЖЕТ глобальный auth-гейт → рендер
падает `401 unauthorized`. Обход: передавай **directUrl бакета**
(`https://bucket-production-….up.railway.app/vibee-assets/...`) — тогда
пре-скачивание не триггерится, Remotion тянет публичный URL напрямую.
Точное имя компании на карточках: **Trinity S³AI**.

## IMG2IMG: история из фото/аватара

Цель — из ОДНОГО фото персонажа сделать серию сцен. Порядок предпочтений:

1. **Pollinations FLUX (keyless, $0) — РАБОТАЕТ сейчас.** Держит АРХЕТИП
   (лысый/борода/очки/смокинг), НЕ точное лицо 1:1. Исходник не обязателен —
   опиши персонажа в промпте. Хостить исходник для `image=` — keyless на
   `catbox.moe` (0x0.st сейчас отключён).
   ```bash
   SRC=$(curl -s -F "reqtype=fileupload" -F "fileToUpload=@face.jpg" https://catbox.moe/user/api.php)
   P="a bald bearded man in dark sunglasses and black tuxedo with a gold triangle pin, cinematic black and white, <СЦЕНА>, keep his face"
   curl -s -o scene.jpg "https://image.pollinations.ai/prompt/$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' "$P")?model=flux&image=$SRC&width=720&height=1280&nologo=true&seed=11"
   ```
2. **Pollinations Kontext — точное ЛИЦО, $0 но нужен аккаунт** `enter.pollinations.ai`.
   `?model=kontext&image={url}` — instruction-based, держит персонажа.
3. **GLM CogVideoX-3 image-to-video** — оживить фото (i2v, `image_url`),
   `POST api.z.ai/api/paas/v4/videos/generations` model `cogvideox-3`, async
   (id→поллинг). ⚠️ нужен resource package (сейчас `1113`).
4. **FAL VEED Fabric** — `POST /api/generate/lipsync` (`{audio_url,image_url}`),
   говорящая голова из фото+аудио. ⚠️ FAL баланс исчерпан.

Голос/клон: у GLM только ASR (речь→текст), TTS НЕТ. Бесплатный клон — снаружи
(XTTS-v2 / Fish / F5-TTS через HF Spaces, хрупко). Пока проще — реальный голос
пользователя в его клипе.

## СВЯЗАТЬ img2img + рилс

Сцены из img2img → кадры/cutaways/posterUrl шаблона:

- SplitTalkingHead `segments[].bRollUrl` — b-roll (нужно ВИДЕО; из картинки — через i2v).
- NoirReel `cutaways[].src` — ВИДЕО-вставки.
- TrinityBlogReel `props.posterUrl` — статичная картинка-подложка (img2img сюда ложится напрямую и бесплатно).

## КАК ОБНОВЛЯТЬ ЭТОТ СКИЛЛ

При каждом заходе: (1) перепроверь таблицу статуса живыми curl (провайдеры
меняются); (2) если нашёл новый keyless/бесплатный сервис — добавь строку и
рецепт; (3) если z.ai аккаунт получил пакет — переведи GLM в ✅ и впиши рабочий
эндпоинт; (4) обнови дату «проверено живьём». Пиши только ПРОВЕРЕННОЕ curl-ом,
не по памяти.

## СБОРКА img2img-истории в РИЛС локально (ffmpeg, $0) — РАБОЧИЙ рецепт

Проверено 2026-08-28: 4 сцены Pollinations + голос из видео → рилс 1080×1920, 26с.
ВАЖНО: zoompan (Ken-Burns) со scale до 1620×2880 — ОЧЕНЬ медленный, ловит таймаут.
Делай СТАТИЧНЫЕ клипы + xfade (быстро, ultrafast).

```bash
ffmpeg -y -i clip.mp4 -vn -acodec aac -b:a 192k voice.m4a            # голос из видео
# каждая сцена → 7с статичный клип 1080x1920:
ffmpeg -y -loop 1 -t 7 -i scene.jpg -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p" -r 30 -c:v libx264 -preset ultrafast clip_N.mp4
# кроссфейды (offset = (7-0.6)*i) + голос:
ffmpeg -y -i clip_0.mp4 -i clip_1.mp4 -i clip_2.mp4 -i clip_3.mp4 -i voice.m4a \
 -filter_complex "[0:v][1:v]xfade=fade:0.6:6.4[a];[a][2:v]xfade=fade:0.6:12.8[b];[b][3:v]xfade=fade:0.6:19.2[v]" \
 -map "[v]" -map 4:a -c:v libx264 -preset veryfast -crf 22 -c:a aac -shortest story.mp4
# хостинг keyless: catbox (принимает и видео до 200МБ)
curl -s -F "reqtype=fileupload" -F "fileToUpload=@story.mp4" https://catbox.moe/user/api.php
```

## GLM МУЛЬТИМОДАЛ: исчерпывающе проверено 2026-08-28

4 аккаунта владельца × {cogview-4, cogview-3-flash, glm-image, cogvideox-3 i2v}:

- ВСЕ картинки → `1113 нет пакета` (cogview-3-flash ещё и `Unknown Model`).
- cogvideox-3 i2v → `1113` тоже (сначала пытается скачать image_url; на нескачиваемом
  URL даёт `image download fail` — это НЕ доступ, а порядок проверок; на скачиваемом
  → `1113`). Итог: **видео из фото у GLM тоже закрыто без пакета.**
  Вывод: GLM-мультимодал (картинки И видео) недоступен на всех аккаунтах владельца —
  нужен resource package. Ключи: `~/.zai-accounts.local.env`.

## PiP-раскладка (сцена fullscreen + ты в углу) — РАБОЧИЙ приём

`/render/template` в упрощённом пути знает только split/fullscreen. Чтобы задать
`pip-*`, передавай сегменты ВНУТРИ `props.segments` (НЕ top-level `segments` —
иначе convertSegmentsToFrames перезатрёт). Тайминг в КАДРАХ (30fps). Сегмент:
`{"type":"split","layout":"pip-bottom-right","startFrame":0,"durationFrames":210,"bRollUrl":<клип>,"bRollType":"video"}`.
`segment.layout` (SplitTalkingHead.tsx:363) перекрывает type → b-roll fullscreen,
аватар в углу. Чередуй pip-bottom-right / pip-bottom-left для динамики. bRollUrl —
ВИДЕО (картинку сперва в клип: ffmpeg -loop 1 -t 8). CI-ключ рендера при мёртвом
`railway` CLI бери из дашборда: Variables → Raw Editor. `railway variables --kv`
иногда пуст — используй `--json`.
