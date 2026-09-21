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
 * Шаблон адреса файла Telegram с подстановкой токена.
 *
 * TWO SHAPES SINCE THE HOST IS CHOSEN PER BOT (services/telegramApi.ts): the
 * literal cloud host, and the helper call that builds the same URL -- for a
 * bot on our own Bot API server, a URL whose PATH holds the token. A pattern
 * that knew only the literal would stay green while every such URL moved into
 * `telegramFileUrlFor(...)`, and `return telegramFileUrlFor(token, p)` leaks
 * exactly what the literal did.
 */
const TOKEN_URL =
  /api\.telegram\.org\/file\/bot\$\{|telegramFileUrlFor\(|\/file\/bot\$\{token\}/

/**
 * The two modules whose JOB is to build such a URL, the way Telegraf's own
 * getFileLink does. They return it to callers that fetch it; the checks below
 * are about everyone else.
 */
const BUILDERS = [
  path.join('src', 'services', 'telegramApi.ts'),
  path.join('src', 'services', 'telegramFiles.ts'),
]

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
    // Outside the builders: the scan must see the CALLERS, not only the
    // two files that exist to build the URL.
    const building = files.filter(
      f =>
        !BUILDERS.includes(f) &&
        TOKEN_URL.test(strip(fs.readFileSync(f, 'utf8')))
    )
    // Строить его законно: файл надо скачать. Незаконно — возвращать и хранить.
    expect(building.length).toBeGreaterThan(0)
  })

  it('такой адрес не возвращается из функции', () => {
    const bad: string[] = []
    for (const f of files.filter(f => !BUILDERS.includes(f))) {
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
            `\\b${m[1]}\\s*=\\s*(\`[^\`]*api\\.telegram\\.org/file/bot|telegramFileUrlFor\\()`
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
