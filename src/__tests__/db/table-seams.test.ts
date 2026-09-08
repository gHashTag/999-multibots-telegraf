/**
 * Имена таблиц: не появляются ли НОВЫЕ, которых нет в базе.
 *
 * Последний класс швов после маршрутов (docs/audit/route-seams.md) и событий
 * (docs/audit/event-seams.md). Почерк тот же: имя — строка, она проходит типы,
 * сборку и деплой, а PostgREST отвечает 404 с кодом 42P01 уже в проде.
 *
 * Измерено: 27 имён таблиц из 46 в базе отсутствуют, 78 обращений, 19 из них
 * даже не проверяют ошибку. Разбор — docs/audit/table-seams.md.
 *
 * Тест НЕ ходит в базу: он сравнивает имена в коде со списком, снятым
 * отдельным замером. Иначе проверка зависела бы от доступности базы — ровно та
 * болезнь, из-за которой пришлось заводить npm run test:gate.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/**
 * Таблицы, которых в базе НЕТ на момент замера (scripts/probe-table-seams.cjs,
 * 2026-08-20). Список зафиксирован, чтобы поймать РОСТ: новое имя, которого
 * здесь нет и в базе тоже нет, — это новая поломка.
 *
 * Сокращать список по мере заведения таблиц: запись, пережившая свою причину,
 * молча прикроет следующую ошибку.
 */
const KNOWN_MISSING = new Set([
  // Written by src/services/trackEvent.ts and created by
  // sql/migrations/20260908_user_events.sql, which the owner applies. Until
  // then the writes fail silently by design -- a missing funnel row must never
  // cost somebody their reply -- and the reader (scripts/events.cjs) exits 3
  // saying the migration has not been applied rather than printing a screen of
  // zeros. Listed here deliberately, which is what this gate asks for: a new
  // name has to be either in the database or in this list, never unnoticed.
  'user_events',
  'ai_requests',
  'avatar_videos',
  'bot_skills',
  'bot_skills_log',
  'bots',
  'broll_ideas',
  'broll_prompts',
  'broll_videos',
  'chat_memory',
  'clips',
  'content_plans',
  'content_scripts',
  'daily_balance_stats',
  'detailed_scripts',
  'eleven_labs_generations',
  'heygen_api_keys',
  'job_layers',
  'kie_veo3_videos',
  'marketplace_items',
  'marketplace_purchases',
  'owner_payments',
  'reels_analysis',
  'render_servers',
  'scenario_clips',
  'service_usage_stats',
  'voice_models',
  'white_label_configs',
])

/** Таблицы, которые в базе есть. Тоже с даты замера. */
const KNOWN_PRESENT = new Set([
  'assets',
  'attachments',
  'avatars',
  'eleven_labs_transcriptions',
  'game',
  'idempotency_keys',
  'instagram_apify_reels',
  'instagram_scrapings',
  'jobs',
  'model_trainings',
  'payments_v2',
  'pending_messages',
  'prompts_history',
  'superhero_generations',
  'synclabs_videos',
  'templates',
  'translations',
  'user_feature_views',
  'users',
])

function collectTableNames(): Map<string, string[]> {
  const files: string[] = []
  ;(function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (p.endsWith('.ts')) files.push(p)
    }
  })('src')

  const used = new Map<string, string[]>()
  for (const f of files) {
    if (f.includes('__tests__') || f.includes('/test/')) continue
    const lines = strip(fs.readFileSync(f, 'utf8')).split('\n')
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/\.from\(\s*['"]([a-z0-9_]+)['"]\s*\)/i)
      if (!m) continue
      // storage.from('images') — это бакет файлового хранилища, а не таблица.
      // На этом уже обжёгся: первая версия замера показала «48 обращений к
      // несуществующей таблице images», хотя бакет существует.
      if (/\bstorage\b/.test((lines[i - 1] || '') + lines[i])) continue
      if (!used.has(m[1])) used.set(m[1], [])
      used.get(m[1])!.push(`${f}:${i + 1}`)
    }
  }
  return used
}

describe('швы имён таблиц', () => {
  const used = collectTableNames()

  it('разбор находит таблицы — иначе тест пустой', () => {
    expect(used.size).toBeGreaterThan(20)
  })

  it('не появилось новых имён вне обоих известных списков', () => {
    const unknown = [...used.keys()]
      .filter(t => !KNOWN_MISSING.has(t) && !KNOWN_PRESENT.has(t))
      .map(t => `${t} (${used.get(t)![0]})`)

    // Новое имя надо либо завести в базе, либо осознанно добавить в список
    // отсутствующих — но не оставлять незамеченным.
    expect(unknown).toEqual([])
  })

  it('в списках нет имён, которые больше нигде не используются', () => {
    // Запись, пережившая свою причину, молча прикроет следующую ошибку — тот
    // же урок, что со списками роутеров, событий и порядка списания.
    const stale = [...KNOWN_MISSING].filter(t => !used.has(t))
    expect(stale).toEqual([])
  })
})
