/**
 * Инструменты видят всё, что должны, и молчат об этом честно.
 *
 * ОТКУДА ЭТО. Осмотр репозитория на секреты видел на 50 файлов меньше, чем
 * думал: `git ls-files` без `-z` экранирует не-ASCII имена в вид
 * "scripts/\320\237...", такое имя не открывается, проверка существования его
 * отбрасывает — и файл молча выпадает. В четырёх выпавших лежал рабочий
 * служебный ключ базы (docs/OWNER-DECISIONS.md, пункт 1).
 *
 * Молчаливая слепота инструмента дороже ненайденного дефекта: она обесценивает
 * ВСЕ выводы, сделанные этим инструментом. Две недели я строил проверки, и ни
 * одна не заметила, что осматривает не весь репозиторий.
 *
 * Замер: `scripts/probe-tool-blindness.cjs`.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

/** Нулевой байт — признак двоичного файла. Записан кодом, а не буквально. */
const NUL = String.fromCharCode(0)

/** Имя команды по частям: иначе этот файл сам попадёт в свою же проверку. */
const PLAIN_LS = ['git', 'ls-files'].join(' ')
const PLAIN_LS_RE = new RegExp(`execSync\\(\\s*['"\`]${PLAIN_LS}['"\`]`)

/**
 * Инструменты, которым `git ls-files` без `-z` разрешён — и почему.
 * Список ровно один: искалка, которая эти два способа СРАВНИВАЕТ.
 */
const ALLOWED_PLAIN_LS: Record<string, string> = {
  'scripts/probe-tool-blindness.cjs': 'сравнивает перечисление с -z и без него',
}

const { matchCode } = require('../../../scripts/lib/blank-code.cjs')

/** A tracked-listing call, assembled so this file's prose is not a hit. */
const LS_CALL_RE = new RegExp(
  `['"\`]git ${['ls', '-files'].join('')}|['"\`]${['ls', '-files'].join('')}['"\`]`,
  'g'
)

/**
 * Guards allowed an index-only population -- and why.
 * Exactly one: the file that compares the two listings, where those calls are
 * the subject under test rather than a population.
 */
const ALLOWED_TRACKED_ONLY: Record<string, string> = {
  'src/__tests__/tools/no-silent-blindness.test.ts':
    'сама сравнивает перечисления; её вызовы — предмет проверки, а не популяция',
}

function walk(root: string, filter: (p: string) => boolean): string[] {
  const out: string[] = []
  ;(function rec(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) rec(p)
      else if (e.isFile() && filter(p)) out.push(p)
    }
  })(root)
  return out
}

describe('инструменты не слепнут молча', () => {
  it('перечисление через git с -z открывается целиком', () => {
    // Главная проверка. Если хоть одно имя из списка не открывается, значит
    // перечисление врёт — и любой обход по нему осматривает не весь репозиторий.
    const files = execSync('git ls-files -z', {
      encoding: 'utf8',
      maxBuffer: 1 << 26,
    })
      .split('\0')
      .filter(Boolean)

    expect(files.length).toBeGreaterThan(100)

    const unopenable = files.filter(f => !fs.existsSync(f))
    expect(unopenable).toEqual([])
  })

  it('перечисление БЕЗ -z действительно теряет файлы — иначе проверка выше пустая', () => {
    // Страховка от самого себя: если git перестанет экранировать (например,
    // из-за core.quotepath=false в чьей-то настройке), проверка выше станет
    // зелёной по другой причине, и правило «всегда -z» потеряет основание.
    // Тогда этот тест напомнит, что основание изменилось.
    const plain = execSync(PLAIN_LS, { encoding: 'utf8', maxBuffer: 1 << 26 })
      .split('\n')
      .filter(Boolean)
    const lost = plain.filter(f => !fs.existsSync(f))
    expect(lost.length).toBeGreaterThan(0)
  })

  it('ни один инструмент не перечисляет файлы без -z', () => {
    const tools = [
      ...walk('scripts', p => p.endsWith('.cjs')),
      ...walk('src/__tests__', p => p.endsWith('.ts')),
    ]
    expect(tools.length).toBeGreaterThan(20)

    const offenders = tools.filter(t => {
      if (ALLOWED_PLAIN_LS[t]) return false
      const text = fs.readFileSync(t, 'utf8')
      return PLAIN_LS_RE.test(text)
    })
    expect(offenders).toEqual([])
  })

  it('ни одна охрана не берёт популяцию из одного лишь индекса', () => {
    // it.174: file written, gate run (green), and only THEN `git add`. The
    // next day main was red because of that file. The population came from the
    // tracked listing, which knows nothing of a new file, so the guard obliged
    // to judge it could not see it.
    //
    // Same class as the 50 files lost to name escaping, for which this whole
    // file exists: the tool inspected less than the repository and said nothing.
    // Only WHAT dropped out differs -- non-ASCII names there, everything not
    // yet in the index here.
    //
    // The correct population is repoFiles() in scripts/lib/repo-sources.cjs:
    // tracked PLUS present-but-unstaged, both via -z.
    const guards = walk('src/__tests__', p => p.endsWith('.ts'))
    expect(guards.length).toBeGreaterThan(20)

    const offenders = guards.filter(g => {
      if (ALLOWED_TRACKED_ONLY[g]) return false
      // matchCode drops hits that begin inside a comment or a string: a file
      // DESCRIBING the rule does not violate it.
      return matchCode(fs.readFileSync(g, 'utf8'), LS_CALL_RE).length > 0
    })
    expect(
      offenders,
      'a guard population must include untracked files: ' +
        'repoFiles() from scripts/lib/repo-sources.cjs'
    ).toEqual([])
  })

  it('в списке разрешённых на индекс нет записей, переживших причину', () => {
    const stale = Object.keys(ALLOWED_TRACKED_ONLY).filter(f => {
      if (!fs.existsSync(f)) return true
      return matchCode(fs.readFileSync(f, 'utf8'), LS_CALL_RE).length === 0
    })
    expect(stale).toEqual([])
  })

  it('в списке разрешённых нет инструментов, которые так уже не делают', () => {
    // Запись, пережившая свою причину, прикроет следующую ошибку.
    const stale = Object.keys(ALLOWED_PLAIN_LS).filter(f => {
      if (!fs.existsSync(f)) return true
      return !PLAIN_LS_RE.test(fs.readFileSync(f, 'utf8'))
    })
    expect(stale).toEqual([])
  })

  it('все файлы .ts в src читаются как текст', () => {
    // Обходы каталога экранирование не задевает, но задевают нечитаемые файлы:
    // почти везде стоит `catch { continue }`, то есть пропуск без счётчика.
    // Пока таких файлов ноль — правило держится. Появится хоть один, и любой
    // обход начнёт молча его пропускать.
    const ts = walk('src', p => p.endsWith('.ts'))
    expect(ts.length).toBeGreaterThan(500)

    const bad: string[] = []
    for (const f of ts) {
      try {
        const text = fs.readFileSync(f, 'utf8')
        if (text.includes(NUL)) bad.push(`${f} — двоичный`)
      } catch (e) {
        bad.push(`${f} — не читается`)
      }
    }
    expect(bad).toEqual([])
  })

  it('в src нет исходников с расширением, которое обходы не смотрят', () => {
    // Все искалки берут только .ts. Появление .tsx или .mts означало бы код,
    // который не осматривает никто.
    const missed = walk('src', p => /\.(tsx|mts|cts|jsx)$/.test(p))
    expect(missed).toEqual([])
  })
})
