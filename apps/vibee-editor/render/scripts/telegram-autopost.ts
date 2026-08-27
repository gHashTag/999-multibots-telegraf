/**
 * АВТОПОСТИНГ РИЛСОВ В TELEGRAM-КАНАЛ — замыкает воронку «производство →
 * канал → лента»: рилс публикуется в ленту мини-аппа автопилотом, этот
 * скрипт доносит его до канала (слой удержания и монетизации по канону
 * 2026: дискавери снаружи, Telegram — своя аудитория).
 *
 * ВКЛЮЧЕНИЕ (только с добра владельца, наружу без этого ничего не уходит):
 *   TG_POST_BOT_TOKEN — токен бота-администратора канала
 *   TG_POST_CHANNEL_ID — числовой ID или @username канала
 * Без обоих — DRY-RUN: печатает, что отправил бы, и уходит (код 0).
 *
 * Дубль-защита: пост считается донесённым, когда в template_settings
 * стоит tg_posted_at — запись делает ТОЛЬКО успешная отправка.
 *
 * Запуск тем же окружением, что автопилот (нужен DATABASE_URL):
 *   npx tsx scripts/telegram-autopost.ts
 */
import fs from 'node:fs'
import path from 'node:path'

if (!process.env.DATABASE_URL) {
  console.error('[tg-post] нет DATABASE_URL')
  process.exit(1)
}
const LOOP_DIR = process.env.LOOP_DIR || path.resolve(process.cwd(), '../../../loop')
const LOG = path.join(LOOP_DIR, 'LOOP_STATE.md')

const TOKEN = process.env.TG_POST_BOT_TOKEN || ''
const CHANNEL = process.env.TG_POST_CHANNEL_ID || ''
const DRY = !TOKEN || !CHANNEL

function log(line: string) {
  console.log(`[tg-post] ${line}`)
  try {
    fs.appendFileSync(LOG, `- ${new Date().toISOString()} tg-post: ${line}\n`)
  } catch {
    /* журнал не критичен */
  }
}

async function main() {
  const { Pool } = await import('pg')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    // Первый рилс владелька, ещё не донесённый до канала.
    const r = await pool.query(
      `SELECT id, name, video_url, description, created_at::text
         FROM public_templates
        WHERE telegram_id = $1 AND is_public = TRUE AND deleted_at IS NULL
          AND video_url IS NOT NULL
          AND template_settings->>'tg_posted_at' IS NULL
        ORDER BY created_at ASC
        LIMIT 1`,
      [process.env.OWNER_TELEGRAM_ID || '144022504']
    )
    const post = r.rows[0]
    if (!post) {
      log('новых рилсов для канала нет (всё донесено)')
      return
    }

    // Подпись канала: заголовок + первая строка описания + маяк ленты.
    const firstLine = String(post.description || '')
      .split('\n')
      .find(l => l.trim()) ?? ''
    const caption = [
      String(post.name),
      '',
      firstLine.slice(0, 220),
      '',
      'Смотреть в ленте: https://app.t27.ai/feed',
    ].join('\n')

    if (DRY) {
      log(
        `DRY-RUN: отправил бы в канал рилс «${post.name}» (id ${post.id}) — ` +
          `задай TG_POST_BOT_TOKEN и TG_POST_CHANNEL_ID для включения`
      )
      return
    }

    // Отправка: sendVideo с URL — Telegram сам скачивает файл ≤20 МБ.
    const api = `https://api.telegram.org/bot${TOKEN}/sendVideo`
    const resp = await fetch(api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHANNEL,
        video: post.video_url,
        caption,
        parse_mode: 'HTML',
        supports_streaming: true,
      }),
      signal: AbortSignal.timeout(60_000),
    })
    const d: any = await resp.json().catch(() => ({}))
    if (!resp.ok || !d?.ok) {
      // Неудача НЕ помечает пост — следующий прогон попробует снова.
      log(`отправка не удалась (id ${post.id}): ${d?.description || resp.status}`)
      process.exit(1)
    }

    // Метка доноса — только после подтверждения Telegram.
    await pool.query(
      `UPDATE public_templates
          SET template_settings = template_settings || jsonb_build_object(
                'tg_posted_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSZ'))
        WHERE id = $1`,
      [post.id]
    )
    log(`рилс «${post.name}» (id ${post.id}) отправлен в канал ${CHANNEL}`)
  } finally {
    await pool.end()
  }
}

main().catch(e => {
  console.error('[tg-post] падение:', String(e).slice(0, 300))
  process.exit(1)
})
