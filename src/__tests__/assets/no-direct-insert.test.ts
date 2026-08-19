/**
 * В таблицу `assets` пишем ТОЛЬКО через saveVideoUrlToSupabase.
 *
 * Зачем. Зеркалирование файла в своё хранилище живёт в одном месте. Любая
 * вторая дверь — прямой `supabase.from('assets').insert(...)` — обходит его и
 * сохраняет ссылку провайдера, которая протухнет.
 *
 * Так и вышло: зеркалирование добавили в saveVideoUrlToSupabase, а
 * videoGenerator/helpers/supabaseHelper.ts продолжал вставлять напрямую.
 *
 * Цена измерена HEAD-запросами по выборке из каждого месяца:
 *
 *   replicate.delivery         1214 ссылок — все 404
 *   tempfile.aiquickdraw.com    171 ссылка — все 404
 *   replicate.com                96 ссылок — все 404
 *   v3b.fal.media                15 ссылок — живы
 *
 * 1481 вложение из 1496 уже потеряно.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/**
 * Файлы, которым прямая вставка разрешена, с причиной.
 */
const ALLOWED: Record<string, string> = {
  'src/core/supabase/saveVideoUrlToSupabase.ts':
    'единственная законная дверь: именно здесь происходит зеркалирование',
  'src/core/replicate/generateVideo.ts':
    'недостижим от точек входа (scripts/probe-reachability.cjs) — мёртвый код, ' +
    'править вслепую не стал',
}

function collect(): string[] {
  const out: string[] = []
  ;(function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (p.endsWith('.ts')) out.push(p)
    }
  })('src')
  return out.filter(f => !f.includes('__tests__') && !f.includes('/test/'))
}

function directInserts(): string[] {
  const hits: string[] = []
  for (const f of collect()) {
    const lines = strip(fs.readFileSync(f, 'utf8')).split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (!/\.from\(\s*['"]assets['"]\s*\)/.test(lines[i])) continue
      // Вставка может стоять на той же строке или на следующих.
      const window = lines.slice(i, Math.min(i + 4, lines.length)).join('\n')
      if (!/\.insert\s*\(/.test(window)) continue
      hits.push(`${f}:${i + 1}`)
    }
  }
  return hits
}

describe('вложения сохраняются одной дверью', () => {
  it('разбор находит хотя бы одну вставку — иначе тест пустой', () => {
    expect(directInserts().length).toBeGreaterThan(0)
  })

  it('нет прямых вставок в assets вне разрешённых файлов', () => {
    const unexplained = directInserts().filter(
      hit => !ALLOWED[hit.split(':')[0]]
    )
    // Прямая вставка обходит зеркалирование и сохраняет ссылку провайдера.
    expect(unexplained).toEqual([])
  })

  it('в списке разрешённых нет файлов, которые больше не вставляют', () => {
    // Запись, пережившая свою причину, молча прикроет следующую ошибку.
    const inserting = new Set(directInserts().map(h => h.split(':')[0]))
    const stale = Object.keys(ALLOWED).filter(f => !inserting.has(f))
    expect(stale).toEqual([])
  })
})
