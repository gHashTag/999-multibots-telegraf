# Медиатека клиента — агент хранит, видит и слышит присланное — 2026-09-13

Статусы: `[измерено]` — проверено по коду или в продакшене; `[решение]` — принято и реализовано в этом PR; `[вопрос]` — открыто, требует проверки в проде.

## Что было измерено (три дыры)

- `[измерено]` **Бизнес-личка** (`src/services/businessBotService.ts`): фото / голосовое / файл клиента пересылались владельцу, клиенту уходила заготовленная фраза, байты выбрасывались (`stats.nonTextDropped++`). Модель видела строку «[Клиент прислал фото] подпись» — описание файла, а не файл.
- `[измерено]` **Инжест переписки** (`crm_ingest_chats`, `apps/vibee-editor/render/src/agent/crm-memory-tools.ts`): фильтр `.filter(m => m.message)` выбрасывал каждое медиа без подписи, поэтому в `crm_messages` были дыры ровно там, где присылали скриншоты, голосовые и брифы.
- `[измерено]` **Чат с ботом** (`registerCommands.ts` → `buildAgentTurn`): файлы клались на полку и попадали в маркер-строки, но по человеку ничего не индексировалось — на вопрос «что мне присылал этот человек» ответа не было.

## Что сделано

### Таблица `user_media` `[решение]`

Один Postgres с перепиской, одна строка на `(owner_id, lead_id, url)`:

| колонка                        | смысл                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `owner_id`                     | чья CRM / чей бот (telegram_id владельца)                                           |
| `lead_id`                      | кто прислал; в чате с ботом совпадает с `owner_id`                                  |
| `surface`                      | `bot` \| `business` \| `ingest`                                                     |
| `msg_id`, `at`, `out`          | сообщение Telegram, время, «от владельца ли»                                        |
| `kind`                         | `image` \| `video` \| `audio` \| `file` — те же четыре, что в `agentAttachments.ts` |
| `name`, `mime`, `bytes`        | имя, тип, размер                                                                    |
| `url`                          | **только наша полка** `${PUBLIC_URL}/s3/<key>`                                      |
| `tg_file_unique_id`            | стабильный id Telegram (для Bot API); у MTProto — `null`                            |
| `caption`                      | подпись человека                                                                    |
| `transcript`, `transcribed_at` | что услышали/увидели; `transcribed_at` без `transcript` = пробовали, нечитаемо      |

Индекс `(owner_id, lead_id, at DESC)`. Повторная запись того же URL — `ON CONFLICT DO UPDATE`, подпись дозаполняется, `fresh` (по `xmax = 0`) — только у первой вставки: именно она идёт в описание.

**Ссылка Telegram не хранится никогда** `[решение]`: `api.telegram.org/file/bot<TOKEN>/…` содержит токен бота. `rememberMedia` бросает исключение до INSERT, маршрут отвечает 400 на всю пачку, бот-клиент (`src/services/mediaLibrary.ts`) отказывается отправлять. Тесты закреплены на обоих концах.

### Путь по каждой поверхности

**Бизнес-личка** `[решение]` — `businessBotService.ts`: после пересылки владельцу вызывается тот же `buildAgentTurn(bot.telegram, [msg])`, что и в чате бота: файл один раз скачивается по токен-ссылке, кладётся на полку, агенту уходит `Клиент прислал фото.\nподпись\n[attached image: …; url=<полка>]`. Ответ агента — клиенту (через `answerClient`, ход записывается `recordTurns`). Полка индексируется `POST /api/crm/media` (owner = владелец, lead = клиент, surface `business`), в фоне.
Если файл отклонён (больше 20 МБ, не скачался): с подписью — прежний путь `[Клиент прислал фото] подпись`; без подписи — **одно** сообщение `отказ\n\nзаготовка` с прежней кнопкой карточки.
Одно сообщение = один ход: буфер альбомов чата с ботом здесь не переиспользуется (части альбома отвечаются по отдельности, чтобы недошедшая часть не стоила клиенту ответа).

**Чат с ботом** `[решение]` — `registerCommands.ts` сразу после `buildAgentTurn(ctx.telegram, albumParts)`: `plan.stored` → `POST /api/crm/media` (owner = lead = человек, surface `bot`). Строка `buildAgentTurn(ctx.telegram, albumParts)` сохранена — её пинит `agent-chat-wiring.test.ts`.

**Инжест** `[решение]` — `crm_ingest_chats`: фильтр стал `m.message || m.media`; медиа без подписи пишется в `crm_messages` как `[фото: name]` / `[голосовое]` / `[видео: …]` / `[файл: name]` + подпись. Для новейших `MEDIA_PER_DIALOG = 12` медиа диалога (≤ 20 МБ) — `client.downloadMedia(m)` → `s3PutBytes` (`src/lib/s3-put.ts`) → `rememberMedia` → фоновое описание. Всего за запуск `MAX_MEDIA_DOWNLOADS = 60`. В отчёт добавлены `media_saved`, `media_skipped`.

### Расшифровка `[решение]`

`describeMedia(url, kind, mime, name)` в `media-library.ts`: провайдер выбирается из `allProviders()` по флагу `vision` / `audio` (`provider.ts`), запрос — не-стриминговый `POST ${p.base}/chat/completions` с частью `image_url` / `audio_url` (формат `media-parts.ts`), URL пропускается через `usableMediaUrl` (только наша полка, только известные расширения), таймаут 20 с. Текстовые документы (`text/*`, `.md`, `.csv`, `.json`, ≤ 200 КБ) читаются как текст, первые 4000 символов. Видео и бинарные файлы → `null` без единого вызова (закреплено тестом: `fetch` не вызывается).

Расшифровка ложится в `crm_messages` под тем же `msg_id` (`mirrorTranscript`): если строки нет — `mirrorNow` вставляет `[голосовое]\n<слова>`; если есть — `UPDATE … text || '\n' || $4` один раз (страж `position($4 in text) = 0`). Отдельной строки `msg_id*1000+1` нет: одно сообщение Telegram — одна строка. Zep получает вставку через `mirrorNow` как обычно.

### Инструмент агента `crm_lead_media` `[решение]`

READ-only, `requireSeller`, параметры `{lead, limit?, kind?}`; подписи и расшифровки завёрнуты в `foreignText`. Попадает в `CRM_MEMORY_TOOLS` → `TOOLS` → компактный набор (`/^(crm_|tg_|soul_)/`). Добавлен в `crm-owner-gate.test.ts`: посторонний получает отказ без касания БД.

## Бюджеты и границы `[решение]`

- Bot API отдаёт ботам ≤ 20 МБ (`TELEGRAM_DOWNLOAD_LIMIT`); тот же потолок у инжеста (`MEDIA_MAX_BYTES`).
- Инжест: 12 медиа на диалог, 60 на запуск; остальное — только строки без байтов, до следующего запуска.
- Описание — последовательно, 20 с на файл, в фоне; ответ человеку его не ждёт.
- Видео и бинарные документы хранятся, но не читаются: ни один настроенный провайдер их не берёт (`media-parts.ts`, измерено 2026-09-07).

## Проверка в проде `[вопрос]`

1. SQL после первого дня:
   ```sql
   select surface, kind, count(*) from user_media group by 1,2;
   select count(*) filter (where transcript is not null) as read,
          count(*) filter (where transcribed_at is not null and transcript is null) as unreadable,
          count(*) filter (where transcribed_at is null) as pending
   from user_media;
   ```
   Ожидание: строки по трём `surface`; у `audio`/`image` есть `transcript`, у `video` — `transcribed_at` без `transcript`.
2. Голосовое в бизнес-личку с чужого аккаунта: агент отвечает по содержанию (не заготовкой), в `crm_messages` под `msg_id` появляется `[голосовое]\n<слова>`, `crm_lead_media` по этому lead показывает строку с URL полки.
3. `select count(*) from user_media where url like '%api.telegram.org%'` → **0** всегда.
4. `crm_ingest_chats` у продавца с медиа в переписке: `media_saved > 0`, в `crm_messages` больше нет дыр на местах фото без подписи.
5. `[вопрос]` Реальный `audio_url` у nemotron для `.ogg` с полки — путь `chat.ts` уже работает, но описание идёт отдельным не-стриминговым запросом; проверить по логу `[media-library] could not describe`.

## Обработать файлы одного клиента

`crm_ingest_chats` принимает `lead` (telegram_id или @username): читается только этот диалог,
глубина до 500 сообщений, файлы — все в рамках бюджета прогона (60), а не 12 на диалог.
Вызов от имени владельца: `POST <render>/mcp?telegram_id=<owner>` → `tools/call`
`crm_ingest_chats {"lead":"<id>","depth":500}`; результат — `crm_lead_media {"lead":"<id>"}`.
Расшифровки появляются в фоне (голос → текст, фото → описание), видео и бинарные файлы
сохраняются без текста [известно].

## Если провайдер не смог прочитать файл

Сбой провайдера (404/5xx/таймаут) не считается «прочитано»: строка остаётся в очереди
(`transcribed_at IS NULL`) и дочитывается при следующем адресном инжесте (`lead`) или по
`crm_lead_media {"lead":"<id>","reread":true}` — он снимает пометку с фото/аудио без текста и
запускает расшифровку в фоне. Итоговые null только у видео и бинарных файлов.

Урок 2026-09-13 [измерено]: `AGENT_MODEL` применялся к любому провайдеру, стоящему первым,
включая выбранный владельцем из бота; nemotron получал `glm-5.3` и отвечал «404 page not found»
на каждый ход и каждое описание. Теперь `AGENT_MODEL` принадлежит только провайдеру из
`AGENT_PROVIDER` (или `zai`, если не задан).

### Переписать уже готовые описания

`crm_lead_media {"lead":"<id>","reread":true,"rewrite":"image"}` стирает имеющиеся описания фото
этого человека (`rewritten` в ответе) и читает их заново по-русски; `"rewrite":"audio"` — то же для
расшифровок. Без `reread` параметр не действует.

## Один файл — одна строка

У MTProto нет `file_unique_id`, а адрес на полке содержит метку времени, поэтому ключ
`(owner, lead, url)` не защищает от повторной загрузки на следующем обходе. Инжест пропускает
сообщения, чьи `msg_id` уже есть в `user_media` для этого человека (surface `ingest`);
`crm_lead_media {reread:true}` дополнительно удаляет ранее возникшие дубли, оставляя самую
раннюю строку. Описания фото пишутся по-русски, видимый текст цитируется на языке оригинала.

## Темп и лимиты провайдера

Зрение на шлюзе NVIDIA [измерено 2026-09-13]: 15–40 с на фото; пачка из 33 файлов получала
503 «ResourceExhausted» на каждом втором вызове. Поэтому: срок ожидания 45 с, пауза между файлами
(`MEDIA_DESCRIBE_PAUSE_MS`, по умолчанию 2000), до трёх попыток с нарастающей паузой на
429/502/503/504 и обрыв по сроку (`MEDIA_RETRY_BASE_MS`, по умолчанию 5000), одна очередь на
процесс — обход и `reread` не соревнуются за шлюз. Что не удалось и после этого — остаётся в
очереди до следующего `reread` или адресного инжеста.

## Крупные аудио — через Whisper

Чат-шлюз (nemotron) читает голосовые на десятки КБ, но 5–7 МБ трек не успевает за 45 с × 3
[измерено 2026-09-13]. Если в render задан `WHISPER_API_KEY` (или `OPENAI_API_KEY`), аудио идёт
первым делом в `/audio/transcriptions` (`WHISPER_BASE_URL` → `OPENAI_BASE_URL` → api.openai.com/v1,
модель `WHISPER_MODEL`, по умолчанию whisper-1; срок 180 с, до 25 МБ): байты берутся с нашей полки и
отправляются файлом. При отказе Whisper слово остаётся за чат-провайдером; ключ, отвергнутый 401/403,
до перезапуска процесса больше не спрашивается. [вопрос] Ключ OpenAI в render 26.08 отвечал 401 —
перед использованием проверить `/v1/models`; альтернатива — любой OpenAI-совместимый Whisper
(например, Groq) через `WHISPER_BASE_URL` + `WHISPER_API_KEY`.

Бесплатная замена [известно, 2026-09-13]: Groq отдаёт Whisper на том же протоколе с бесплатным планом
(файл до 25 МБ, `whisper-large-v3-turbo`; на платном плане лимиты 20 запросов/мин, 2000/день,
7200 аудио-секунд/час — https://console.groq.com/docs/speech-to-text,
https://console.groq.com/docs/rate-limits). Ключ вида `gsk_…` в `WHISPER_API_KEY` достаточно:
адрес и модель Groq подставляются сами, явные `WHISPER_BASE_URL`/`WHISPER_MODEL` их перекрывают.

Open-source путь [измерено 2026-09-13]: сервис `whisper` в том же проекте Railway — Speaches
(MIT, faster-whisper, https://github.com/speaches-ai/speaches). Что сработало и что нет:

- Образ — `ghcr.io/speaches-ai/speaches:0.9.0-rc.3-cpu`, не `latest-cpu`: в `latest-cpu`
  нет `PRELOAD_MODELS`, и сервер отвечает 404 «Model ... is not installed locally».
- Переменные сервиса: `API_KEY` (свой, 64 hex), `PRELOAD_MODELS=["deepdml/faster-whisper-large-v3-turbo-ct2"]`,
  `WHISPER__COMPUTE_TYPE=int8`, `WHISPER__INFERENCE_DEVICE=cpu`, `UVICORN_HOST=::` (приватная сеть
  Railway — IPv6), `UVICORN_PORT=8000`, `RAILWAY_RUN_UID=0` и `HF_HUB_CACHE=/home/ubuntu/.cache/huggingface/hub`
  — без UID 0 том смонтирован root'ом и предзагрузка падает с `PermissionError`.
- Том на `/home/ubuntu/.cache/huggingface/hub` — кеш модели переживает рестарты.
- Публичный домен не нужен и не работал (502 при `::`); render ходит по приватному адресу.
- В render: `WHISPER_BASE_URL=http://whisper.railway.internal:8000/v1`, `WHISPER_API_KEY` (тот же ключ),
  `WHISPER_MODEL=deepdml/faster-whisper-large-v3-turbo-ct2`, `MEDIA_WHISPER_TIMEOUT_MS=600000`.
- Результат: `Allmix.mp3` (7,1 МБ) и `...wav` (5,5 МБ) Алекса прочитаны за один проход, оба 200.
  На музыке Whisper оставляет артефакт «Субтитры сделал DimaTorzok» — это не речь из файла [известно].
  Аудио не покидает проект Railway.

## Фото и видео — открытая vision-модель

Запрос владельца 2026-09-13: «у Apple есть открытое решение для vision — добавь для изучения
ассетов видео и фото». Что прочитано [измерено 2026-09-13]:

- Открытые vision-модели Apple — FastVLM 0.5B/1.5B/7B (https://github.com/apple/ml-fastvlm,
  https://huggingface.co/apple/FastVLM-0.5B), AIMv2, MobileCLIP/MobileCLIP2, DepthPro, DFN-CLIP,
  SlowFast-LLaVA для видео — все веса на Hugging Face помечены `license: apple-amlr`. Текст лицензии
  (https://github.com/apple/ml-fastvlm/blob/main/LICENSE_MODEL): право использования даётся
  «exclusively for Research Purposes», и «“Research Purposes” does not include any commercial
  exploitation, product development or use in any commercial product or service». Для CRM,
  обслуживающей клиентов, это запрет. [решение] FastVLM в прод не ставим; он остаётся кандидатом
  для исследовательского трека Trinity (GoldenFloat/AX7203, некоммерческие измерения) — там лицензия
  соблюдается.
- Apple Vision Framework (OCR, классификация) — не open source, работает только на устройствах
  Apple; для сервера в Railway не подходит.
- Выбрано [решение]: тот же паттерн, что `whisper` — сервис `vision` в проекте Railway:
  образ `ghcr.io/ggml-org/llama.cpp:server` (llama.cpp, MIT) с моделью
  `ggml-org/Qwen3-VL-2B-Instruct-GGUF:Q8_0` (Qwen3-VL-2B-Instruct, Apache-2.0; 1,8 ГБ + mmproj 0,45 ГБ;
  понимает русский). Настройка через переменные `LLAMA_ARG_HF_REPO`, `LLAMA_API_KEY` (свой, 64 hex),
  `LLAMA_ARG_HOST=::`, `LLAMA_ARG_PORT=8000`, `PORT=8000`, `LLAMA_ARG_CTX_SIZE=8192`,
  `LLAMA_ARG_N_PARALLEL=1`, `LLAMA_CACHE=/data/llama-cache`, `RAILWAY_RUN_UID=0`; том на `/data`,
  публичного домена нет. mmproj скачивается вместе с моделью автоматически (`-hf`).
- В render: `VISION_BASE_URL=http://vision.railway.internal:8000/v1`, `VISION_API_KEY` (тот же ключ),
  `VISION_MODEL=qwen3-vl-2b-instruct`, `MEDIA_VISION_TIMEOUT_MS=300000`.

Как это читает файлы (`media-vision.ts`):

- Фото: байты берутся с нашей полки (только `/s3/`, только известные расширения — `usableMediaUrl`),
  вкладываются `data:`-URL в один не-стриминговый `POST /chat/completions`. Если сервис `vision`
  отказал — слово за чат-провайдером, как раньше; ключ, отвергнутый 401/403, до перезапуска процесса
  больше не спрашивается.
- Видео (`.mp4 .mov .m4v .webm .mkv`, до 40 МБ): ffmpeg (уже в образе render) берёт 4 кадра в центрах
  равных отрезков (для 60 с — 7,5 / 22,5 / 37,5 / 52,5 с), не шире 448 px (`MEDIA_VISION_FRAME_SIDE`), и все кадры уходят ОДНИМ
  запросом; описание начинается словом «Видео:». То, что между кадрами, теряется по построению —
  описание честно говорит о кадрах. Без `VISION_API_KEY` видео остаётся честным `null` без единого
  вызова (закреплено тестом). Если `vision` отказал — строка остаётся pending (`DescribeFailed`),
  потому что видео больше никто не прочитает.
- Бюджет: 2B-модель на CPU Railway — десятки секунд на кадр [вопрос: измерить на первом проходе],
  поэтому срок 300 с и по одному запросу за раз (`LLAMA_ARG_N_PARALLEL=1`).

[измерено] 2026-09-13, сервис `vision` на CPU Railway (Qwen3-VL-2B Q8_0, один слот): четыре кадра 768 px дали ~3 800 токенов промпта при ~30 ток/с и ~3 ток/с генерации — ролик `IMG_6859.MOV` считался более пяти минут и упёрся в `MEDIA_VISION_TIMEOUT_MS`. Поэтому кадр ужат до 448 px, ответ по видео ограничен 320 токенами, по фото — 500. Второй замер (кадр 448 px по ширине, ответ 320 токенов): вертикальный ролик дал кадры 448×~800 — 1 514 токенов промпта за ~80 с (~17 ток/с) и ~220 с генерации (~1,5 ток/с) — снова 300 с и обрыв. Поэтому 448 px теперь ограничивает длинную сторону (~150 токенов на кадр), а ответ по видео — 200 токенов; расчётно ~35 с промпт + ~130 с генерация. Если и этого мало — [решение владельца]: 2 кадра вместо 4 или квант Q4_K_M вместо Q8_0.

Что проверить после деплоя [вопрос]: `crm_lead_media` с `reread:true` для клиента с `.MOV`
(Алекс, `IMG_6859.MOV`) — раньше честный `null`, теперь ожидается «Видео: …»; в логах render строки
`[media-library] vision did not take …` укажут на отказ сервиса.
