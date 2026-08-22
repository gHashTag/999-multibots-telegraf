export const meta = {
  name: 'quality-gate',
  description: 'Динамическая ревизия диффа: параллельные ревьюеры по измерениям + адверсариальная проверка каждой находки',
  whenToUse: 'Перед мержем PR, особенно если дифф трогает деньги (payments_v2, балансы) или Telegram-сцены. args: { ref: "main...HEAD" | "main...feat/x", focus?: "краткий контекст задачи" }',
  phases: [
    { title: 'Review', detail: 'по одному агенту на измерение' },
    { title: 'Verify', detail: 'скептик пытается опровергнуть каждую находку' },
  ],
}

// Динамика: размер пула ревьюеров растёт с бюджетом («+500k» в промпте),
// но не превышает список измерений. Без бюджета — базовые 4.
const REF = (args && args.ref) || 'main...HEAD'
const FOCUS = (args && args.focus) || ''

const DIMENSIONS = [
  {
    key: 'money',
    prompt: `Ты ревьюер ДЕНЕЖНОГО кода в репо /Users/playra/999-multibots-telegraf.
Прочитай дифф: git diff ${REF} (запусти сам). ${FOCUS}
Правила дома, нарушение любого = находка:
1) updateUserBalance возвращает boolean и НЕ бросает — результат обязан проверяться;
2) payments_v2 — источник правды: INCOME не должен маскироваться под OUTCOME и наоборот, service_type/subscription_type согласованы;
3) списание/начисление без проверки результата, двойная запись, отсутствие идемпотентности по inv_id;
4) платёж прошёл, а пользователь не уведомлён при сбое активации.
Ищи ТОЛЬКО в изменённых строках и в том, что они ломают вокруг.`,
  },
  {
    key: 'telegram',
    prompt: `Ты ревьюер Telegram-кода (Telegraf 4.16) в репо /Users/playra/999-multibots-telegraf.
Прочитай дифф: git diff ${REF} (запусти сам). ${FOCUS}
Пять абсолютных правил проекта, нарушение = находка:
1) answerCbQuery() ПЕРВОЙ строкой в каждом action-обработчике;
2) доступ к ctx.message.text только после проверки типа ('text' in ctx.message);
3) wizardData инициализируется в step 1;
4) язык только через isRussianFromState(ctx);
5) команды, добавленные глобально, должны работать и внутри активной сцены (перехватчик в stage).
Плюс: parse_mode и разметка кнопок валидны, callback_data ≤64 байт.`,
  },
  {
    key: 'correctness',
    prompt: `Ты придирчивый ревьюер корректности в репо /Users/playra/999-multibots-telegraf.
Прочитай дифф: git diff ${REF} (запусти сам). ${FOCUS}
Ищи реальные дефекты: недостижимый код, неверные условия, race conditions,
незакрытые ветки ошибок, payload/enum, которые парсятся не так, как пишутся,
вылет за границы массивов, ошибки в regex. Особо: если дифф добавляет новую
ветку в существующий разборщик (payload, enum, switch) — проверь, что старые
входы попадают туда же, куда раньше.`,
  },
  {
    key: 'regression',
    prompt: `Ты ревьюер регрессий в репо /Users/playra/999-multibots-telegraf.
Прочитай дифф: git diff ${REF} (запусти сам). ${FOCUS}
Вопрос один: что из СУЩЕСТВУЮЩЕГО поведения этот дифф меняет незаметно?
Проверь: списки-реестры (имена ботов, токены, команды) — все ли места
обновлены синхронно (grep по соседям изменённых констант); не перехватывает
ли новый обработчик чужие апдейты; не изменился ли путь по умолчанию для
старых пользователей. Названия «мест, которые перечисляют ботов» ищи grep'ом,
не по памяти.`,
  },
]

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'line', 'claim', 'scenario'],
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          claim: { type: 'string', description: 'одно предложение: что сломано' },
          scenario: { type: 'string', description: 'конкретный вход → неверный результат' },
          severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['real', 'reason'],
  properties: {
    real: { type: 'boolean' },
    reason: { type: 'string' },
  },
}

// Канон: pipeline без барьера — находки каждого измерения уходят на проверку,
// не дожидаясь остальных ревьюеров.
const results = await pipeline(
  DIMENSIONS,
  d =>
    agent(d.prompt + '\nВерни только реальные находки; пусто — честный ответ.', {
      label: `review:${d.key}`,
      phase: 'Review',
      schema: FINDINGS_SCHEMA,
    }),
  (review, d) =>
    parallel(
      (review?.findings || []).slice(0, 6).map(f => () =>
        agent(
          `Репо /Users/playra/999-multibots-telegraf. Попробуй ОПРОВЕРГНУТЬ находку ревью (измерение ${d.key}):
Файл: ${f.file}:${f.line}
Утверждение: ${f.claim}
Сценарий: ${f.scenario}
Прочитай реальный код вокруг (не только дифф). Если сценарий не воспроизводится, вход невозможен или защита есть выше/ниже по стеку — real=false с причиной. Сомневаешься — real=false.`,
          { label: `verify:${d.key}`, phase: 'Verify', schema: VERDICT_SCHEMA }
        ).then(v => ({ ...f, dimension: d.key, verdict: v }))
      )
    )
)

const all = results.filter(Boolean).flat().filter(Boolean)
const confirmed = all.filter(f => f.verdict && f.verdict.real)
const rejected = all.length - confirmed.length
log(`Находок: ${all.length}, подтверждено: ${confirmed.length}, опровергнуто: ${rejected}`)
return { ref: REF, confirmed, totalRaw: all.length }
