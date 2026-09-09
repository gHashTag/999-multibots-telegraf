---
name: 'Owner Two-Tap Onboarding'
description: 'Connect a new bot owner to the personal seller: the bot in the farm, the owner as admin, Telegram connected in the mini app, the business chat, the memory loaded, the first /crm and /sweep. Use for «новый владелец», «подключить владельца», «не видит /crm», «нет доступа к команде».'
---

# Owner Two-Tap Onboarding

Цель: новый владелец бота доходит до продавца за два нажатия — подключить Telegram и нажать «Обход».
Сегодня часть шагов ручная; ниже — что делать и как проверить каждый.

## When to Use This Skill

- Человек с собственным ботом фермы спрашивает, как начать продавать / видеть лиды, и получает «❌ У вас нет доступа».
- Второй владелец подключил Telegram, но `/leads`, `/sweep`, кнопка загрузки отвечают отказом.
- Личка владельца не отвечается или отвечается без уведомлений.
- Кто-то предлагает «введите /phone», «пришлите id», «вставьте код входа» — код вводит только сам владелец.

## Quick Diagnosis

```bash
railway service 999-multibots-telegraf >/dev/null; railway variables --kv | cut -d= -f1 | grep -c '^BOT_TOKEN_'   # токены фермы
grep -n 'ADMIN_IDS' src/config/index.ts                                    # владельцы бота — env ADMIN_IDS
grep -n 'requireOwner' apps/vibee-editor/render/src/agent/*.ts | head       # рендер: CRM только для OWNER_TELEGRAM_ID
railway logs | grep -E '\[Business\] Connection established|ingested on connect' | tail -3
```

## Solution Steps

1. **Бот в ферме.** Токен от владельца → `railway variables --set BOT_TOKEN_<N>=…` (никогда в отслеживаемый файл),
   деплой, `railway logs | grep getMe` → строка с новым @username.
2. **Владелец-админ.** Добавить id в `ADMIN_IDS` (бот) и, пока рендер однопользовательский, в `OWNER_TELEGRAM_ID`
   рендера; редеплой. Проверка: `/crm` в боте отвечает сводкой, а не отказом.
3. **Нажатие 1 — Telegram.** Мини-апп → профиль → «Подключить Telegram»; код вводит владелец сам. После сохранения
   сессии загрузка переписки запускается сама (`crm-ingest-on-connect.ts`, 2000 диалогов × 500).
   Проверка: `bin/tri crm-leads 5` показывает людей.
4. **Бизнес-чат.** Telegram Premium → Настройки → Telegram для бизнеса → Чат-боты → добавить бота → разрешить отвечать.
   При подключении бот сам загружает переписку владельца; в логах `[Business] Connection established`.
5. **Нажатие 2 — Обход.** `/crm` → кнопки «Ответить ждущим», «Горячие», «Поговорить», «Пора», «Мы молчим», «Вернуть»;
   план на день приходит сам (`CRM_PLAN_HOUR`, `CRM_PLAN_TZ`) и по `/plan`.
6. Перед PR: `npx vitest run src/__tests__/bot src/__tests__/services` → зелёно.

## Common Issues

- Владелец в `ADMIN_IDS`, но рендер отказывает: `OWNER_TELEGRAM_ID` на рендере — один id (многопользовательский CRM
  с `requireConnectedOwner` — отдельный этап).
- Соединение бизнес-чата живёт в памяти процесса; после редеплоя восстанавливается `lookupConnection`.
- Загрузка «прошла», а агент ничего не помнит — смотреть `railway logs | grep 'ingest after connect'`.

## Related Resources

- `src/navigation/registerCommands.ts` (`registerCrmCommands`), `src/services/crmProactive.ts`, `src/services/crmPlan.ts`
- `src/services/businessBotService.ts` (`handleBusinessConnection`, `notifyOwnerOfLead`)
- `apps/vibee-editor/render/src/agent/tg-connect.ts`, `crm-ingest-on-connect.ts`, `crm-playbook.ts`
- Скилы: `mcp-owner-access`, `business-dm-buttons`, `client-first-tap`
