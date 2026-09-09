---
name: 'Client First Tap'
description: 'A new client reaches a result in one or two taps: deep links survive registration, /start is one message with buttons and a legend, ?start=dm continues the conversation, the free portrait can be skipped. Use when a client lands in the wrong scene from a link, when /start makes people type, or when funnel numbers drop between start and the first press.'
---

# Client First Tap

Клиент, впервые написавший боту, должен за одно-два нажатия получить результат, а не регистрацию и анкету.

## When to Use This Skill

- Клиент нажал «🚀 Открыть в боте» под ответом в личке и попал в сцену выбора пола/демо вместо услуги.
- `/start` показывает два сообщения, и человек не понимает, что делают кнопки.
- Кто-то предлагает попросить клиента ввести команду, id или «войти в профиль».
- Воронка `user_events` (`start → menu_shown → button_pressed → topup_opened`) проседает на первом шаге.

## Quick Diagnosis

```bash
grep -n "pendingServiceMode" src/navigation/registerCommands.ts src/scenes/createUserScene.ts   # deep link переживает регистрацию (план)
grep -n "avatar:skip" src/scenes/avatarTransformScene/index.ts                                  # портрет можно пропустить (план)
grep -n "standardButtons" src/navigation/helpers/menuKeyboard.ts                                 # кнопки под «Что дальше?»
```

## Solution Steps

1. Сегодня: каждый ответ модели уже с кнопками — `⭐ Пополнить`, `💰 Мой баланс`, `✨ Что ты умеешь`,
   `🙋 Позвать человека`, `🎬 Открыть приложение` (см. `buttons-under-every-answer`).
2. План: сохранить deep link `svc_<key>` в `ctx.session.pendingServiceMode` в `/start`, отработать при выходе
   из `CreateUserScene`; ветка `?start=dm` — «Продолжим здесь…» + кнопки; `[⏭ Пропустить]` в первом шаге
   `AvatarTransform`; легенда под «Что дальше?».
3. Проверка живьём с нового аккаунта: `t.me/<bot>?start=svc_neurophoto` → сразу услуга, без набора текста.
4. Смотреть воронку сутки: `button_pressed` должен превышать `topup_opened`.

## Common Issues

- Новый пользователь идёт в `CreateUserScene` первым: всё, что должно пережить регистрацию, живёт в `ctx.session`.
- Проверка квоты бесплатного портрета падает «открыто» при ошибке БД — демо стоит владельцу денег.
- Две кассы: звёзды в боте (`payments_v2`) и токены помощника на рендере (`user_tokens`) — см. `two-tap-topup`.

## Related Resources

- `src/navigation/registerCommands.ts` (`/start`), `src/scenes/createUserScene.ts`, `src/scenes/avatarTransformScene/index.ts`
- `src/navigation/helpers/menuKeyboard.ts`, `src/navigation/helpers/actionButtons.ts`, `src/services/trackEvent.ts`
- Скилы: `buttons-under-every-answer`, `two-tap-topup`, `telegram-scenes-ULTIMATE`
