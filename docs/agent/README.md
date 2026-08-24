# Агент Trinity S³AI — SAFE BETA

В SAFE BETA Агент работает только внутри подтверждённой Telegram Mini App-сессии. Сервер проверяет подписанный `initData`, сам определяет владельца и передаёт инструментам только его `telegramId`. Значение из аргументов клиента не может переключить владельца.

## Что доступно

Единый live registry возвращает ровно три инструмента:

| Инструмент             | Эффект | Результат                                                    |
| ---------------------- | ------ | ------------------------------------------------------------ |
| `whoami`               | read   | подтверждённый активный профиль                              |
| `feed_stats`           | read   | агрегированная статистика доступной ленты                    |
| `content_plan_prepare` | draft  | приватный структурированный черновик контент-плана владельца |

`content_plan_prepare` не публикует, не вызывает генераторы и не списывает средства. Все publish/autopublish, payment, paid generation, render и approval-execution маршруты заблокированы в артефакте до разбора тела запроса и вызова обработчика.

## Вкладка «Агент»

Экран показывает:

- подтверждённый профиль, от имени которого выполняется работа;
- фактический список инструментов из `tools/list`, сгруппированный по read/draft;
- безопасный первый сценарий: `whoami` → `feed_stats` → `content_plan_prepare`;
- Activity с автором, временем и очищенным результатом действия;
- явный release-blocked статус внешнего подключения.

Поток не выводит скрытые рассуждения модели, сырой ответ провайдера, credentials или клиентские объекты с секретными полями.

## Подключение Codex, Claude Code и других MCP-клиентов

Внешний `X-Agent-Key` **пока недоступен**. Предыдущая статическая схема через `AGENT_KEYS` запрещена: она не обеспечивала одновременно хешированное хранение, отзыв, owner binding и безопасную выдачу секрета. Сервер отвечает fail-closed, а UI не создаёт config/curl payload и ничего не копирует в clipboard.

Подключение будет открыто отдельным релизом только после появления server-side хранилища со следующими свойствами:

1. в базе хранится только хеш ключа;
2. запись активна, не отозвана и принадлежит одному подтверждённому владельцу;
3. scopes ограничены `read` и `draft`, paid quota равна нулю;
4. исходный секрет передаётся владельцу один раз вне DOM, URL, логов и репозитория;
5. `unknown`, `revoked` и ключ другого владельца получают `401` до body/DB tool dispatch;
6. журнал не содержит сырой ключ или чувствительные поля.

До реализации этого контракта не добавляйте `X-Agent-Key` в Codex, Claude Code, `.mcp.json`, curl или переменные фронтенда. В частности, `VITE_AGENT_KEY` и plaintext `AGENT_KEYS` не являются поддерживаемой production-конфигурацией.

## Безопасная проверка кандидата

Из корня репозитория:

```bash
make test-safe-beta
make verify-editor
```

Focused suite доказывает подпись/свежесть Telegram `initData`, server-owned профиль, точный registry из трёх инструментов, draft-only запись, отказ статическому ключу, очистку Activity и недостижимость заблокированных side effects.

## Исходный код

| Файл                                               | Ответственность                                                                  |
| -------------------------------------------------- | -------------------------------------------------------------------------------- |
| `apps/vibee-editor/render/src/agent/tools.ts`      | единый публичный registry и три SAFE BETA handler                                |
| `apps/vibee-editor/render/src/agent/routes.ts`     | signed Telegram identity, MCP discovery/calls, fail-closed external key boundary |
| `apps/vibee-editor/render/src/agent/access.ts`     | owner scope, tool filtering и redaction                                          |
| `apps/vibee-editor/render/src/runtime/safeBeta.ts` | неизменяемый HTTP/background side-effect lock                                    |
| `apps/vibee-editor/player/src/pages/Chat.tsx`      | вкладка Agent и authenticated Mini App stream                                    |

Production deploy, публикация и платные операции не входят в локальные команды проверки и требуют отдельного release-gate.
