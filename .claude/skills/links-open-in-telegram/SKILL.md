---
name: 'Links Open In Telegram'
description: 'Every link to our app (app.t27.ai, vibee-editor-production) that a person receives opens INSIDE Telegram: appLinkFor(bot, route) gives t.me/<bot>?startapp=<route> for a bot with a Main Mini App and t.me/<bot>?start=app_<route> otherwise; /start app_<route> answers with one web_app button. Use when writing any message, button, caption, notice, prompt or share link that points at the app, when a person says a link "does not open", shows "Нужна подпись Telegram" or an empty screen, or when adding a screen to the app.'
---

# Links Open In Telegram

Владелец, 2026-09-22: «возьми за правило ссылки чтобы открывались внутри
телеграм! иначе без телеграм они не открываются! поэтому не работают!»

Приложение (`app.t27.ai` = `vibee-editor-production.up.railway.app`) узнаёт
человека ТОЛЬКО по подписи запуска Telegram (initData). Голая https-ссылка,
открытая в браузере телефона, подписи не несёт: «Нужна подпись Telegram» или
пустой экран. Ссылка выглядит живой и никуда не ведёт.

## When to Use This Skill

- Пишешь сообщение, кнопку, подпись поста, уведомление, промпт или ссылку
  «поделиться», которые ведут в приложение.
- Человек говорит «ссылка не открывается», видит «Нужна подпись Telegram»
  или пустой экран после нажатия.
- Добавляешь экран в приложение (новый маршрут) — таблица маршрутов общая.
- Меняешь `START_PARAM_ROUTES` в плеере, `miniApp.config.ts`, BotFather.

## Правило

**Ссылка на приложение, которую получает человек, — это ссылка Telegram, а
не адрес хоста.** Три законные формы:

| Где                                | Что                                                     |
| ---------------------------------- | ------------------------------------------------------- |
| Личный чат с ботом                 | `web_app`-кнопка (`appButton`, `buildMiniAppUrl`)       |
| Группа, канал, бизнес-личка, текст | `appLinkFor(bot, route)` — url-кнопка или текст         |
| Плеер (веб, вне Telegram)          | `appLinkFor(bot, route)` из `player/src/lib/appLink.ts` |

`web_app`-кнопки Telegram принимает ТОЛЬКО в личном чате с ботом: в группе,
в посте канала и в бизнес-сообщении (бот пишет от имени владельца) они роняют
всё сообщение. Там — только t.me-ссылка.

## Две ссылки, и почему две

- `https://t.me/<bot>?startapp=<route>` — одно нажатие, сразу в приложение.
  Работает ТОЛЬКО если у бота настроен Main Mini App в BotFather
  (`getMe.has_main_web_app`). Замер 2026-09-22: `false` у t27ai_bot,
  neuro_blogger_bot, MetaMuse_Manifest_bot — у такого бота ссылка открывает
  только чат, маршрут теряется.
- `https://t.me/<bot>?start=app_<route>` — открывает чат, `/start` отвечает
  ОДНИМ сообщением с ОДНОЙ `web_app`-кнопкой на этот экран (`sendAppDoor`).
  Два нажатия, но работает у любого бота сегодня. Новый человек сначала
  проходит регистрацию, экран доживает в `session.appDeepLink`.

`appLinkFor` сам выбирает первую, когда бот известен как имеющий Main Mini
App, и вторую иначе. Настроят BotFather — ссылки станут в одно нажатие без
правки кода (кэш getMe живёт 10 минут).

## Где что лежит

```
src/navigation/helpers/appLinks.ts         оригинал: APP_ROUTES, appLinkFor, appButton,
                                           rewriteAppUrls, sendAppDoor, кэш has_main_web_app
apps/vibee-editor/render/src/app-links.ts  зеркало для рендера: botOfToken (getMe через
                                           telegramApiFor), appLinkForToken, rewriteAppUrlsForToken
apps/vibee-editor/player/src/lib/appLink.ts зеркало для плеера (всегда ?start=app_)
player/src/components/Telegram/TelegramProvider.tsx  START_PARAM_ROUTES — куда ведёт маршрут
```

Маршруты (ровно ключи `START_PARAM_ROUTES`): `feed search learn editor create
avatar video image audio profile hive chat browser club pair`. Новый экран —
в ЧЕТЫРЕ места сразу: плеер (`START_PARAM_ROUTES` + `<Route>` в App.tsx), бот,
рендер, плеерный `appLink.ts`. `appLinksParity.test.ts` не даст забыть.

## Страховочная сетка

Модель может написать `https://app.t27.ai/hive` по памяти. Такой текст
переписывается в t.me-ссылку бота этого разговора перед отправкой:

- ответ агента и запасной ответ в чате бота — `buttonsForAnswer(..., { bot: ctx.botInfo })`;
- ответ клиенту в бизнес-личке — `businessBotService` (`rewriteAppUrls(..., botUsername)`);
- уведомления рендера — `sendToTelegram`, `sendVideoToTelegram`, `sendTelegramMessage`
  в render-server, подпись ролика в канал (`postReelToChannel`, `captionFor`).

Хост без схемы (`app.t27.ai/feed`) тоже ссылка — Telegram делает её
кликабельной, сетка ловит и её. Похожие хосты (`app.t27.ai.evil.example`,
почта `me@app.t27.ai`) не трогаются. Без имени бота текст не меняется:
ссылка на чужого бота хуже.

**Файл на том же хосте — не экран.** Тот же nginx отдаёт `/covers/`,
`/backgrounds/`, `/lipsync/`, `/audio/`, `/sounds/`, `/icons/`, любой
`.mp4`/`.png`, поток браузера на `/live/` и мост `/bridge`. Им Telegram не
нужен, и превращать их в t.me-ссылку — ломать рабочую ссылку. Решают
`APP_NON_SCREEN_PREFIXES` и «у последнего сегмента есть расширение»
(`isAppFileUrl`), одинаково у бота и рендера.

## Экран, который выдаёт ключ, ссылкой не называется

`UNLINKABLE_APP_ROUTES` — маршруты, на которые ссылки НЕ бывает. Сейчас там
один: `pair`. Экран чеканит код входа в момент открытия, поэтому
`t.me/<bot>?start=app_pair` — строка, которую кто угодно выложит, а бот своим
голосом предложит «показать код входа». `appLinkFor` такой ссылки не строит,
`appRouteFromStartParam` (публичная дверь `/start`) её не принимает, а сырой
`app.t27.ai/pair` в тексте модели становится просто чатом с ботом.

Честный путь остаётся: `/app` и кнопка «Вход на другом устройстве» в
приветствии — `web_app` в личке, нажатие самого человека. `/start app_pair`
отвечает ровно обычным приветствием и про payload не говорит ничего:
объяснение было бы следующей приманкой.

Маршрут попадает сюда, если попасть на него — значит что-то ВЫДАТЬ, а не
показать.

## Ссылка на бота несёт свой канал (тик 9, эпик #2974)

`?start=app_feed` в посте канала — это `?start=app_feed__telegram`. Параметр
`/start` — единственное, что t.me передаёт боту, поэтому канал едет в его
хвосте после `__` (до 64 символов `[A-Za-z0-9_-]`, правило Telegram).

- Ставит метку `tagged(url, channel)` в `render/src/agent/utm.ts`
  (`taggedBotLink`). Метит ТОЛЬКО наши полезные нагрузки (`app_*`, `svc_*`,
  `subscribe_*`, `club`, `foundry`, `topup*`); чужой бот, реферальный номер,
  `?startapp=` и уже помеченная ссылка остаются как были.
- Бот отрезает канал ПЕРВЫМ в `/start` (`splitStartSource` в
  `src/navigation/helpers/appLinks.ts`), до `crmPrepLead` и
  `appRouteFromStartParam`: иначе `app_feed__x` не совпадёт с маршрутом и
  человек попадёт в приветствие вместо экрана. Проверка формы —
  `src/__tests__/navigation/startSource.test.ts`.
- Запуск считается в рендере (`POST /api/traffic/start`, только ключ
  сервиса, без telegram_id), виден в CRM «Откуда люди», `crm_traffic`,
  `tri traffic`. Разделитель общий у двух процессов (тест паритета).
- Руками: `tri tag 'https://t.me/<бот>?start=app_feed' reddit`.

## Как проверить

```bash
npx vitest run src/__tests__/navigation/appLinks.test.ts \
  src/__tests__/navigation/appLinksParity.test.ts \
  src/__tests__/navigation/startAppDeepLink.test.ts \
  src/__tests__/scenes/createUserSceneAppDoor.test.ts \
  src/__tests__/guards/noRawAppHostInUserText.test.ts \
  src/__tests__/services/businessAppLinksOpenInTelegram.test.ts
(cd apps/vibee-editor/render && npx vitest run src/app-links.test.ts \
  src/auth/telegram-sender-app-links.test.ts channel-delivery.test.ts)
(cd apps/vibee-editor/player && npx vitest run src/lib/appLink.test.ts \
  src/components/Auth/__tests__/loginLinkOpensInsideTelegram.test.tsx)
```

`noRawAppHostInUserText.test.ts` падает на любом хосте приложения в КОДЕ
`src/` и рендера вне списка разрешённых (каждый файл — с причиной). Одна
строка может нести свою причину: `// app-link-ok: <почему>`.

Живьём: `/start app_hive` в личке бота → одно сообщение, одна кнопка, открывает
улей внутри Telegram. Есть ли Main Mini App — `getMe` через
`scripts/lib/telegram-api.cjs` / `src/services/telegramApi.ts` (НИКОГДА не
облако для бота на нашем Bot API сервере: такой запрос логинит его обратно).

## Common Issues

- **`?startapp=` у бота без Main Mini App** открывает голый чат: так жила кнопка
  входа в плеере до 2026-09-22. Строить только через `appLinkFor`.
- **url-кнопка на `MINI_APP_URL`** открывает приложение в браузере без подписи.
  В личке — `web_app`, вне лички — `appLinkFor`.
- **Маршрут, которого нет в `START_PARAM_ROUTES`,** молча открывает ленту.
- **BotFather не трогать из кода.** Main Mini App настраивает владелец руками.
- **Копия контекста `{ ...ctx }` теряет `chat`.** У Telegraf `chat` — геттер на
  прототипе, спред его не копирует. Так `CreateUserScene` отдавал новичку с
  `?start=app_hive` url-кнопку обратно на `/start` вместо `web_app` (ревью
  #2870). Копия теперь несёт `chat`, а `sendAppDoor` смотрит ещё и в
  `ctx.message.chat`. Проверка — `createUserSceneAppDoor.test.ts` на настоящем
  `Context`.
- **Тело URL в сетке — только ASCII-символы адреса.** Прежнее «всё, кроме
  пробела и скобок» глотало `»`, `”`, `**`, обратную кавычку, тире и слово
  после него, а маршрут читался из проглоченного (`hive»` — не маршрут →
  лента). `APP_URL_BODY` одинаков у бота и рендера, это держит
  `appLinksParity.test.ts`.
- Ссылка на пост ленты (`/feed?post=<id>`) пока не выражается маршрутом:
  копировать ссылку на пост из плеера — открытый вопрос (см. PR).

## Related Resources

- Скилы: `buttons-under-every-answer`, `business-dm-buttons`, `client-first-tap`, `app-sign-in`
- `src/navigation/config/miniApp.config.ts` (`buildMiniAppUrl`, `canShowMiniAppButton`)
- `apps/vibee-editor/player/src/lib/telegram.ts` (`launchStartParam`)
