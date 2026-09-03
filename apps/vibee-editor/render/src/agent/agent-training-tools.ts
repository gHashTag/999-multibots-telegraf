import type { AgentTool } from './tools'

export interface AgentOperatorLesson {
  id: number
  title: string
  result: string
  command: string
  tokens: number
  tools: readonly string[]
  separatePublicationApproval?: boolean
}

/** Value comes before spend; every paid practice has a named maximum price. */
export const AGENT_OPERATOR_CURRICULUM: readonly AgentOperatorLesson[] = [
  {
    id: 1,
    title: 'Диагностика профиля',
    result: 'Проверенный профиль, баланс и фактическая статистика ленты.',
    command: 'урок 1: проверь мой профиль',
    tokens: 0,
    tools: ['whoami', 'my_balance', 'feed_analytics'],
  },
  {
    id: 2,
    title: 'Голос и правила',
    result: 'Приватный скилл с тоном, запретами и канонами автора.',
    command: 'урок 2: настрой мой стиль',
    tokens: 0,
    tools: ['skills_list', 'skills_create', 'skills_update'],
  },
  {
    id: 3,
    title: 'Контент-план',
    result: 'Черновик тем и следующего рилса, привязанный к цели профиля.',
    command: 'урок 3: подготовь контент-план',
    tokens: 0,
    tools: ['plan_list', 'plan_goal_create', 'plan_item_add'],
  },
  {
    id: 4,
    title: 'Первая иллюстрация',
    result: 'Один согласованный визуал для выбранной сцены.',
    command: 'урок 4: подготовь промпт и смету',
    tokens: 1,
    tools: ['providers_status', 'image_generate'],
  },
  {
    id: 5,
    title: 'Фирменная озвучка',
    result: 'Одна мастер-дорожка после согласования текста и голоса.',
    command: 'урок 5: подготовь текст голоса и смету',
    tokens: 6,
    tools: ['providers_status', 'audio_generate'],
  },
  {
    id: 6,
    title: 'Шестисценный рилс',
    result:
      'Draft истории, шесть сцен, точная смета и mp4 после отдельного согласия.',
    command: 'урок 6: собери черновик рилса по шаблону',
    tokens: 0,
    tools: [
      'reel_templates_list',
      'reel_from_template_prepare',
      'providers_status',
    ],
  },
  {
    id: 7,
    title: 'Публикация и разбор',
    result: 'Текст поста, отдельное подтверждение и разбор фактических метрик.',
    command: 'урок 7: подготовь публикацию и метрики',
    tokens: 0,
    tools: ['feed_publish', 'feed_analytics'],
    separatePublicationApproval: true,
  },
] as const

const noArgs = { type: 'object', properties: {}, additionalProperties: false }

function lesson(id: number): AgentOperatorLesson | null {
  return AGENT_OPERATOR_CURRICULUM.find(item => item.id === id) ?? null
}

function approvalPhrase(item: AgentOperatorLesson): string | null {
  if (item.tokens <= 0) return null
  return `делай урок ${item.id} за ${item.tokens} токен${item.tokens === 1 ? '' : 'ов'}`
}

function publicLesson(item: AgentOperatorLesson) {
  return {
    id: item.id,
    title: item.title,
    result: item.result,
    command: item.command,
    tokens: item.tokens,
    tools: [...item.tools],
    requires_explicit_phrase: approvalPhrase(item),
    publication_requires_separate_confirmation:
      item.separatePublicationApproval === true,
  }
}

export function createAgentTrainingTools(): AgentTool[] {
  return [
    {
      name: 'agent_training_start',
      description:
        'Начать разговорный курс управления агентом. Бесплатно: создаёт только ' +
        'owner-bound прогресс; ничего не генерирует и не публикует.',
      parameters: noArgs,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      async handler(_args, ctx) {
        let result: { rows: any[] }
        try {
          result = await ctx.pool.query(
            `INSERT INTO agent_training_progress
               (telegram_id, course_key, current_lesson, completed_lessons, updated_at)
             VALUES ($1, 'agent-operator-v1', 1, '{}', now())
             ON CONFLICT (telegram_id) DO UPDATE SET updated_at = now()
             RETURNING course_key, current_lesson, completed_lessons, updated_at::text`,
            [ctx.telegramId]
          )
        } catch (error) {
          if ((error as { code?: string })?.code === '42P01') {
            return {
              started: false,
              reason: 'хранилище обучения ещё не подготовлено',
              migration_required: true,
            }
          }
          throw error
        }
        return {
          started: true,
          course: 'agent-operator-v1',
          lesson: publicLesson(lesson(Number(result.rows[0].current_lesson))!),
          spent_tokens: 0,
          paid_action_started: false,
          publication_started: false,
          commands: ['мой прогресс', 'следующий урок', 'покажи смету', 'стоп'],
        }
      },
    },
    {
      name: 'agent_training_status',
      description:
        'Показать прогресс, следующий результат и цену. Только чтение; не запускает ' +
        'генерацию, оплату или публикацию.',
      parameters: noArgs,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      async handler(_args, ctx) {
        let result: { rows: any[] }
        try {
          result = await ctx.pool.query(
            `SELECT course_key, current_lesson, completed_lessons, updated_at::text
               FROM agent_training_progress
              WHERE telegram_id = $1`,
            [ctx.telegramId]
          )
        } catch (error) {
          if ((error as { code?: string })?.code === '42P01') {
            return { started: false, migration_required: true }
          }
          throw error
        }
        const row = result.rows[0]
        if (!row) {
          return {
            started: false,
            next_command: 'начать обучение',
            paid_action_started: false,
          }
        }
        const next = lesson(Number(row.current_lesson))
        return {
          started: true,
          course: row.course_key,
          completed_lessons: row.completed_lessons ?? [],
          next_lesson: next ? publicLesson(next) : null,
          requires_explicit_phrase: next ? approvalPhrase(next) : null,
          paid_action_started: false,
          publication_started: false,
          updated_at: row.updated_at,
        }
      },
    },
    {
      name: 'agent_training_complete_lesson',
      description:
        'Отметить текущий урок завершённым после показа результата. Не запускает ' +
        'инструменты урока, не списывает токены и не публикует.',
      parameters: {
        type: 'object',
        properties: {
          lesson_id: { type: 'integer', minimum: 1, maximum: 7 },
          evidence_summary: {
            type: 'string',
            minLength: 3,
            maxLength: 500,
            description: 'что именно получил человек в этом разговоре',
          },
        },
        required: ['lesson_id', 'evidence_summary'],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      async handler(args, ctx) {
        const lessonId = Number(args.lesson_id)
        const evidence = String(args.evidence_summary ?? '')
          .trim()
          .slice(0, 500)
        if (!lesson(lessonId) || evidence.length < 3) {
          return { completed: false, reason: 'нужны текущий урок и результат' }
        }
        const result = await ctx.pool.query(
          `UPDATE agent_training_progress
              SET completed_lessons = CASE
                    WHEN NOT ($2 = ANY(completed_lessons))
                    THEN array_append(completed_lessons, $2)
                    ELSE completed_lessons
                  END,
                  current_lesson = LEAST(8, GREATEST(current_lesson, $2 + 1)),
                  last_evidence = $3,
                  updated_at = now()
            WHERE telegram_id = $1 AND current_lesson = $2
            RETURNING current_lesson, completed_lessons, updated_at::text`,
          [ctx.telegramId, lessonId, evidence]
        )
        if (!result.rows.length) {
          return {
            completed: false,
            reason: 'можно завершить только текущий урок',
          }
        }
        const next = lesson(Number(result.rows[0].current_lesson))
        return {
          completed: true,
          lesson_id: lessonId,
          evidence_summary: evidence,
          next_lesson: next ? publicLesson(next) : null,
          spent_tokens: 0,
          paid_action_started: false,
          publication_started: false,
        }
      },
    },
  ]
}
