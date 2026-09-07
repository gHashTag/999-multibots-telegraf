/**
 * Адрес с токеном бота не должен покидать функцию и тем более попадать в базу.
 *
 * Повод — живой замер: в `users.photo_url` **264 строки** содержат **14 разных
 * токенов ботов**, и шесть из них на момент проверки были ДЕЙСТВУЮЩИМИ.
 * Токен даёт полное управление ботом: читать все сообщения, писать от его
 * имени, менять настройки.
 *
 * Причина: `getUserPhotoUrl` возвращала адрес вида
 *   https://api.telegram.org/file/bot<ТОКЕН>/<путь>
 * который затем сохранялся в профиль. Вдобавок такая ссылка живёт около часа,
 * то есть хранилась мёртвой почти сразу после записи.
 *
 * Тест статический: он не поднимает бота, а следит, чтобы такой адрес нигде не
 * уходил в возврат или в запись. Пропустить это через выполнение нельзя —
 * настоящий токен в тесте не появится.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/**
 * The token-bearing file URL, IN BOTH SHAPES.
 *
 * It used to be written as a literal. Since the API root became configurable
 * (`services/telegramApi.ts`) the same places build it through
 * `telegramFileApiFor`, and the token in it is exactly the same token.
 *
 * Matching only the literal would mean the leak migrates along with a
 * refactor while this test says nothing -- which is precisely what happened:
 * the sweep emptied the pattern and only this file's own vacuity check
 * noticed.
 */
const TOKEN_URL =
  /api\.telegram\.org\/file\/bot\$\{|telegramFileApiFor\s*\(|telegramApiFor\s*\(/

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

describe('токен бота не уходит в адресах', () => {
  const files = collect()

  it('разбор находит места, где такой адрес строится — иначе тест пустой', () => {
    const building = files.filter(f =>
      TOKEN_URL.test(strip(fs.readFileSync(f, 'utf8')))
    )
    // Строить его законно: файл надо скачать. Незаконно — возвращать и хранить.
    expect(building.length).toBeGreaterThan(0)
  })

  it('такой адрес не возвращается из функции', () => {
    const bad: string[] = []
    for (const f of files) {
      const lines = strip(fs.readFileSync(f, 'utf8')).split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (!/^\s*return\b/.test(lines[i])) continue
        // return самой строки-шаблона
        if (TOKEN_URL.test(lines[i])) {
          bad.push(`${f}:${i + 1}`)
          continue
        }
        // return переменной, присвоенной таким шаблоном выше
        const m = lines[i].match(/^\s*return\s+([A-Za-z_$][\w$]*)\s*$/)
        if (!m) continue
        const above = lines.slice(Math.max(0, i - 12), i).join('\n')
        if (
          new RegExp(
            `\\b${m[1]}\\s*=\\s*\`[^\`]*` +
              `(api\\.telegram\\.org/file/bot|\\$\\{telegramFileApiFor)`
          ).test(above)
        ) {
          bad.push(`${f}:${i + 1}`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('такой адрес не кладётся в поля профиля', () => {
    const bad: string[] = []
    for (const f of files) {
      const lines = strip(fs.readFileSync(f, 'utf8')).split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (!/(photo_url|avatar_url|public_url|media_url)\s*:/.test(lines[i]))
          continue
        const window = lines.slice(i, Math.min(i + 2, lines.length)).join('\n')
        if (TOKEN_URL.test(window)) bad.push(`${f}:${i + 1}`)
      }
    }
    expect(bad).toEqual([])
  })
})
