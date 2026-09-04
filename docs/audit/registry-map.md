# Карта реестров: что уже отслеживается

**Читать ПЕРЕД тем, как разворачивать класс дефектов.** Команда: `tri реестры`
(`scripts/probe-registries.cjs`).

## Зачем

В репозитории **23 реестра на 229 записей**. Реестр — это список известных
случаев внутри теста: тест находит все места формы и сверяет со списком. Это
память аудита, и она **невидима**, пока не откроешь нужный тест.

Цена незнания померена: **целая итерация**. Перепись «выброшенных денежных
результатов» дала три места; только падение гейта показало список долга, в
первых строках которого написано, что оставшиеся записи — мёртвый код, и прямо
просят _не перепроверять их каждый цикл_. Два утверждения («генерация шла
бесплатно», «человек платил USDC и не получал звёзд») едва не ушли в отчёт как
живые денежные дефекты — оба неверны.

## Колонка ливнесс — главное

Перепись по тексту находит **форму**, но не отвечает, **исполняется ли** код.
Ответ живёт только в реестре:

- `dead, verified #1347` — вопрос закрыт;
- голое имя файла — вопрос открывается заново каждый цикл.

Из 23 реестров **15 без пометки о ливнесс**. Это работа на чтение для будущих
циклов; сейчас закреплено только то, что число **не растёт** — новый реестр
обязан сказать, живы ли его записи (`registryLivenessRatchet`).

## Текущая карта

```
src/__tests__/money/no-invented-price.test.ts
       предмет: цена не выдумывается
    6  ливнесс НЕТ   KNOWN_PUBLIC
       src/__tests__/reliability/routerMountAuthBoundary.test.ts
       предмет: router mount auth boundary (public routers are an explicit allowlist)
    5  ливнесс есть  DEBT
       src/__tests__/money/unchecked-money-result.test.ts
       предмет: результат денежной операции не выбрасывается
    4  ливнесс есть  ALLOWED
       src/__tests__/assets/no-direct-insert.test.ts
       предмет: вложения сохраняются одной дверью
    4  ливнесс НЕТ   ALLOWED
       src/__tests__/money/no-fabricated-returns.test.ts
       предмет: нет выдуманных возвратов
    3  ливнесс есть  KNOWN_UNGUARDED_TRACKED
       src/__tests__/scenes/paid-wizard-guard-ratchet.test.ts
       предмет: paid wizards keep their in-flight guard
    3  ливнесс есть  ALLOWLIST
       src/__tests__/tools/no-dead-handler-registrar.test.ts
       предмет: no dead handler-registrars
    2  ливнесс НЕТ   KNOWN
       src/__tests__/money/charge-order.test.ts
       предмет: деньги не уходят раньше работы
    1  ливнесс НЕТ   KNOWN_REASONS
       src/__tests__/money/refund-reason.test.ts
       предмет: возврат денег называет причину
    1  ливнесс есть  DEAD_DISCARD_ALLOWLIST
       src/__tests__/scenes/charge-result-checked-ratchet.test.ts
       предмет: charge results are never discarded in live scenes (unbilled-paid)
    1  ливнесс НЕТ   ALLOWLIST
       src/__tests__/tools/no-phantom-setup.test.ts
       предмет: no phantom setup/register/init imports in index.ts
    1  ливнесс НЕТ   ALLOWED_PLAIN_LS
       src/__tests__/tools/no-silent-blindness.test.ts
       предмет: инструменты не слепнут молча
    0  ливнесс НЕТ   EXEMPT
       src/__tests__/commands/autonomousMonitorGate.test.ts
       предмет: every autonomousMonitor handler is behind the admin gate
    0  ливнесс НЕТ   KNOWN_SAFE
       src/__tests__/money/batchRefundReconciliation.test.ts
       предмет: aiPhotoshop batch refunds reconcile the exact charge
    0  ливнесс есть  KNOWN_ID_COLLISIONS
       src/__tests__/scenes/duplicate-scene-id-ratchet.test.ts
       предмет: registered scenes have unique ids (no last-writer-wins shadowing) #1343
    0  ливнесс есть  ALLOWLIST
       src/__tests__/scenes/sceneIdUniquenessRatchet.test.ts
       предмет: scene ids are unique (no silent Stage shadowing)
    0  ливнесс НЕТ   DEBT
       src/__tests__/security/streamErrorListenerRatchet.test.ts
       предмет: stream/archiver sources have an error listener (no process crash)
```

## Как пользоваться

1. Перед переписью класса — `tri реестры`, и грепни ключевое слово класса
   (`grep -rl discard src/__tests__`).
2. Нашёл реестр — прочитай его шапку целиком: там обычно записано, почему
   записи остались и что считается починкой.
3. Починил место из реестра — **сократи реестр**, иначе ратчет упадёт на
   «устаревшей записи». Это не бюрократия: устаревшая запись прикрывает
   следующую ошибку.
4. Заводишь новый реестр — напиши в нём, живы ли записи. Без этого он
   бесполезен ровно так же, как был бесполезен для меня.
