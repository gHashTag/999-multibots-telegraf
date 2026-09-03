import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  AGENT_OPERATOR_CURRICULUM,
  createAgentTrainingTools,
} from './src/agent/agent-training-tools'

const here = path.dirname(fileURLToPath(import.meta.url))

function fakeContext(progress?: Record<string, unknown>) {
  const calls: Array<{ sql: string; params?: unknown[] }> = []
  return {
    calls,
    ctx: {
      telegramId: 'owner-42',
      pool: {
        async query(sql: string, params?: unknown[]) {
          calls.push({ sql, params })
          if (sql.includes('FROM agent_training_progress')) {
            return { rows: progress ? [progress] : [] }
          }
          if (sql.includes('RETURNING')) {
            return {
              rows: [
                {
                  course_key: 'agent-operator-v1',
                  current_lesson: 1,
                  completed_lessons: [],
                  updated_at: '2026-09-01T00:00:00.000Z',
                },
              ],
            }
          }
          return { rows: [] }
        },
      },
    },
  }
}

describe('buttonless agent operator training', () => {
  it('teaches value before paid practice and states every price', () => {
    expect(AGENT_OPERATOR_CURRICULUM).toHaveLength(7)
    expect(
      AGENT_OPERATOR_CURRICULUM.slice(0, 3).every(x => x.tokens === 0)
    ).toBe(true)
    expect(AGENT_OPERATOR_CURRICULUM.filter(x => x.tokens > 0)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 4, tokens: 1 }),
        expect.objectContaining({ id: 5, tokens: 6 }),
      ])
    )
    for (const lesson of AGENT_OPERATOR_CURRICULUM) {
      expect(lesson.command).toMatch(/^урок \d+/)
      expect(lesson.result.length).toBeGreaterThan(10)
    }
  })

  it('starts owner-bound progress without spending or generating', async () => {
    const { calls, ctx } = fakeContext()
    const tool = createAgentTrainingTools().find(
      item => item.name === 'agent_training_start'
    )!

    const result = (await tool.handler({}, ctx)) as Record<string, unknown>

    expect(result).toMatchObject({
      started: true,
      course: 'agent-operator-v1',
      spent_tokens: 0,
      paid_action_started: false,
      publication_started: false,
    })
    const write = calls.find(call =>
      call.sql.includes('INSERT INTO agent_training_progress')
    )!
    expect(write.params?.[0]).toBe('owner-42')
    expect(tool.parameters).not.toHaveProperty('properties.telegram_id')
    expect(calls.map(call => call.sql).join('\n')).not.toMatch(/CREATE TABLE/i)
    expect(calls.map(call => call.sql).join('\n')).not.toMatch(/user_tokens/i)
  })

  it('reports the next lesson and never turns status into a paid action', async () => {
    const { calls, ctx } = fakeContext({
      course_key: 'agent-operator-v1',
      current_lesson: 4,
      completed_lessons: [1, 2, 3],
      updated_at: '2026-09-01T00:00:00.000Z',
    })
    const tool = createAgentTrainingTools().find(
      item => item.name === 'agent_training_status'
    )!

    const result = (await tool.handler({}, ctx)) as Record<string, any>

    expect(result.next_lesson).toMatchObject({ id: 4, tokens: 1 })
    expect(result.requires_explicit_phrase).toBe('делай урок 4 за 1 токен')
    expect(calls).toHaveLength(1)
    expect(calls[0].sql.trim()).toMatch(/^SELECT/)
    expect(tool.annotations?.readOnlyHint).toBe(true)
  })

  it('records bounded lesson evidence under the verified owner without spending', async () => {
    const { calls, ctx } = fakeContext()
    const tool = createAgentTrainingTools().find(
      item => item.name === 'agent_training_complete_lesson'
    )!

    await tool.handler(
      { lesson_id: 1, evidence_summary: 'Профиль и метрики показаны' },
      ctx
    )

    const write = calls.find(call =>
      call.sql.includes('UPDATE agent_training_progress')
    )!
    expect(write.params).toEqual(['owner-42', 1, 'Профиль и метрики показаны'])
    expect(write.sql).toContain('last_evidence = $3')
    expect(write.sql).not.toMatch(/user_tokens|feed_publish|image_generate/i)
  })

  it('keeps progress owner-bound in a versioned migration', () => {
    const migration = fs.readFileSync(
      path.join(
        here,
        '../../../sql/migrations/20260901_create_agent_training_progress.sql'
      ),
      'utf8'
    )
    expect(migration).toContain('telegram_id text PRIMARY KEY')
    expect(migration).toContain("CHECK (course_key = 'agent-operator-v1')")
    expect(migration).toContain('CHECK (current_lesson BETWEEN 1 AND 8)')
  })

  it('keeps the chat page free of clickable sales and suggestion buttons', () => {
    const source = fs.readFileSync(
      path.join(here, '../player/src/pages/Chat.tsx'),
      'utf8'
    )
    expect(source).not.toContain('<button')
    expect(source).not.toContain('SUGGESTIONS.map')
    expect(source).toContain('начать обучение')
    expect(source).toContain('пополнить 50 токенов')
    expect(source).toContain('enterKeyHint="send"')
  })

  it('gives profile skills a direct in-app deep link', () => {
    const tabs = fs.readFileSync(
      path.join(here, '../player/src/components/Profile/ProfileTabs.tsx'),
      'utf8'
    )
    const skills = fs.readFileSync(
      path.join(here, '../player/src/components/Profile/ProfileSkills.tsx'),
      'utf8'
    )
    expect(tabs).toContain("searchParams.get('tab')")
    expect(tabs).toContain("next.set('tab', tab)")
    expect(tabs).toContain('PRIVATE_TABS.has(requestedTab) && !isOwn')
    expect(skills).toContain("searchParams.get('skill')")
    expect(skills).toContain('id={`profile-skill-${sk.id}`}')
    expect(skills).toContain('profile-skills__card--focused')
  })

  it('requires a verbal confirmation before every paid lesson', () => {
    const prompt = fs.readFileSync(path.join(here, 'src/agent/chat.ts'), 'utf8')
    expect(prompt).toContain('agent_training_start')
    expect(prompt).toContain('agent_training_status')
    expect(prompt).toContain('«делай урок N за X токенов»')
    expect(prompt).toContain('НЕ создавай искусственный дефицит')
  })
})
