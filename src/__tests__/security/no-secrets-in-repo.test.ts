/**
 * В отслеживаемых файлах не должно быть настоящих ключей.
 *
 * Повод — живой замер: служебный ключ Supabase (`service_role`, полный доступ
 * к базе, действителен до 2035 года) лежит в одиннадцати файлах под `scripts/`.
 * Проверено запросом — **ключ работает**. Плюс токены Fly.io в `CLAUDE.md`.
 *
 * Репозиторий приватный, и это снижает остроту, но не убирает её: доступ есть
 * у всех участников, ключ уезжает в каждую копию, в резервные копии и в CI.
 *
 * Тест — последняя линия: он не чинит прошлое, но не даёт добавить новое.
 */
import { describe, it, expect } from 'vitest'
import { execSync } from 'child_process'
import fs from 'fs'

type Rule = [name: string, re: RegExp, why: string]

const PATTERNS: Rule[] = [
  ['токен бота Telegram', /(?:bot|token[=:"'\s]+)\d{8,10}:[A-Za-z0-9_-]{30,}/g, 'полное управление ботом'],
  ['ключ Replicate', /r8_[A-Za-z0-9]{35,}/g, 'генерации за ваш счёт'],
  ['ключ OpenAI', /sk-[A-Za-z0-9]{32,}/g, 'запросы за ваш счёт'],
  ['ключ Anthropic', /sk-ant-[A-Za-z0-9_-]{30,}/g, 'запросы за ваш счёт'],
  ['ключ ElevenLabs', /sk_[a-f0-9]{40,}/g, 'синтез речи за ваш счёт'],
  ['ключ AWS', /AKIA[0-9A-Z]{16}/g, 'доступ к хранилищу'],
  ['токен GitHub', /gh[pousr]_[A-Za-z0-9]{30,}/g, 'доступ к репозиторию'],
  ['служебный ключ Supabase', /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}/g, 'полный доступ к базе'],
  ['токен Fly.io', /fm2_[A-Za-z0-9+/=]{40,}/g, 'управление развёртыванием'],
]

/**
 * Файлы, где ключи уже лежат. Список — не индульгенция, а фиксация долга:
 * тест не даёт добавить НОВЫЕ места, пока эти не вычищены.
 *
 * Убирать записи по мере ротации и чистки.
 */
const KNOWN_DEBT: Record<string, string> = {
  'CLAUDE.md': 'токены Fly.io — проверено, недействительны, но убрать надо',
  'scripts/financial/check-all-bots-precise.js': 'служебный ключ Supabase — РАБОТАЕТ',
  'scripts/financial/check-all-bots.js': 'служебный ключ Supabase — РАБОТАЕТ',
  'scripts/financial/check-lee-solar.js': 'служебный ключ Supabase — РАБОТАЕТ',
  'scripts/users/execute-grant-remote.sh': 'служебный ключ Supabase — РАБОТАЕТ',
  'scripts/users/fix-user-5732975798.js': 'служебный ключ Supabase — РАБОТАЕТ',
  'scripts/users/grant-sub-production.sh': 'служебный ключ Supabase — РАБОТАЕТ',
  'scripts/users/grant-subscription-7912847443.js': 'служебный ключ Supabase — РАБОТАЕТ',
  'scripts/users/manage-user-5732975798.js': 'служебный ключ Supabase — РАБОТАЕТ',
  'scripts/users/manage-user-5781166218-production.js': 'служебный ключ Supabase — РАБОТАЕТ',
  'scripts/users/manage-user-5781166218.js': 'служебный ключ Supabase — РАБОТАЕТ',
  'scripts/users/update-user-is-test.js': 'служебный ключ Supabase — РАБОТАЕТ',
  // Образцы в самих искалках — заведомо ненастоящие значения.
  'scripts/probe-secrets-in-db.cjs': 'образцы для самопроверки, значения выдуманы',
  'scripts/probe-secrets-in-history.cjs': 'образцы для самопроверки, значения выдуманы',
  'src/__tests__/security/no-secrets-in-repo.test.ts': 'этот файл: образцы для самопроверки',
}

/** Образцы, на которых шаблоны ОБЯЗАНЫ срабатывать. */
const SELF_CHECK: Array<[string, string]> = [
  ['токен бота Telegram', 'bot7137641587:AAHqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'],
  ['ключ Replicate', 'r8_qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'],
  ['ключ AWS', 'AKIAQQQQQQQQQQQQQQQQ'],
  ['токен GitHub', 'ghp_qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'],
]

function trackedFiles(): string[] {
  return execSync('git ls-files', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter(Boolean)
}

describe('в репозитории нет новых секретов', () => {
  it('самопроверка: шаблоны срабатывают на заведомых образцах', () => {
    // Без этого «ничего не найдено» ничего не значит. Прошлая искалка нашла
    // ноль из-за границы слова в шаблоне — и это едва не ушло как хорошая
    // новость.
    const broken: string[] = []
    for (const [name, sample] of SELF_CHECK) {
      const rule = PATTERNS.find(p => p[0] === name)
      if (!rule) {
        broken.push(`${name}: шаблона нет`)
        continue
      }
      rule[1].lastIndex = 0
      if (!sample.match(rule[1])) broken.push(`${name}: не сработал`)
    }
    expect(broken).toEqual([])
  })

  it('нет секретов в файлах вне списка известного долга', () => {
    const unexplained: string[] = []

    for (const f of trackedFiles()) {
      if (KNOWN_DEBT[f]) continue
      if (!fs.existsSync(f)) continue
      const st = fs.statSync(f)
      if (!st.isFile() || st.size > 2 * 1024 * 1024) continue

      let text: string
      try {
        text = fs.readFileSync(f, 'utf8')
      } catch {
        continue
      }

      for (const [name, re] of PATTERNS) {
        re.lastIndex = 0
        if (re.test(text)) unexplained.push(`${f} — ${name}`)
      }
    }

    expect(unexplained).toEqual([])
  })

  it('в списке долга нет файлов, которые уже вычищены', () => {
    // Запись, пережившая свою причину, молча прикроет следующую ошибку.
    const stale: string[] = []
    for (const f of Object.keys(KNOWN_DEBT)) {
      if (!fs.existsSync(f)) {
        stale.push(`${f}: файла нет`)
        continue
      }
      const text = fs.readFileSync(f, 'utf8')
      const hit = PATTERNS.some(([, re]) => {
        re.lastIndex = 0
        return re.test(text)
      })
      if (!hit) stale.push(`${f}: секретов больше нет — убрать из списка`)
    }
    expect(stale).toEqual([])
  })
})
