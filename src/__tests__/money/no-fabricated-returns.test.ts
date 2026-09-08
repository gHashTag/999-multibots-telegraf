/**
 * Функция не возвращает выдуманное значение вместо результата.
 *
 * Класс дефекта: вызывающий получает строку, похожую на успех, и не может
 * отличить её от настоящего результата. Отказ всплывает через три шага и без
 * причины — либо не всплывает вовсе, а человек платит за пустоту.
 *
 * Что это уже стоило:
 *   generateInstagramScraping — возвращала `success: true`, ничего не запустив.
 *     28 списаний у трёх человек, 94 звезды, ноль запусков (PR #510)
 *   заглушки ElevenLabs — выдуманный адрес аудио и выдуманная расшифровка,
 *     из-за чего «STUB TRANSCRIPTION TEXT» могло попасть в субтитры
 *   generateImageFromPrompt — `return "https://example.com/generated_image.png"`
 *
 * Тест статический: он следит, чтобы такие возвраты не появлялись снова.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Blank out comments WITHOUT losing lines.
 *
 * The previous version deleted block comments outright, newlines included, so
 * every line number reported after one was shifted -- by 84 lines in
 * kie-ai-webhook.routes.ts, which pointed the reader at an unrelated
 * sendMessage. A finding whose address is wrong costs the next reader the same
 * search twice.
 */
const strip = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

/**
 * Возврат строкового литерала, который выглядит как адрес или как заглушка.
 *
 * A SUBSTITUTION IS A CONSTRUCTION, NOT A FABRICATION. The rule also matched
 * `return `https://t.me/${username}?start=${key}`` -- the only way to write a
 * REAL link to our own bot (#2238) -- and turned the gate red on clean main.
 *
 * The first fix was to put that file in ALLOWED. A control refuted it: the
 * allow-list works PER FILE, so the entry would have hidden a genuine stub in
 * the same file. I dropped `return 'https://stub.example.com/x'` next to it and
 * the test still passed. So the matcher is narrowed rather than the list
 * widened: an exception is as wide as its unit, and the unit here is a file.
 *
 * Stubs do not hide from this. They have their own rule, FABRICATED_HOST, which
 * looks for stub/fake/dummy/placeholder/example/mock INSIDE the address and
 * cares about neither `return` nor substitutions.
 */
const STUBWORD = String.raw`[a-z0-9_-]*(?:stub|fake|dummy|placeholder|example)[a-z0-9_-]*`
const FABRICATED = new RegExp(
  String.raw`return\s+(?:` +
    // a quoted literal: exactly as before
    String.raw`['"](?:https?://[^'"]*|${STUBWORD})['"]` +
    '|' +
    // a template with NO substitution: still a literal, just spelled with backticks
    String.raw`\`(?:https?://[^\`$]*|${STUBWORD})\`` +
    ')',
  'i'
)

/**
 * The same fabrication, returned as a PROPERTY rather than as the whole value.
 *
 * The rule above only sees `return 'https://...'`. Four provider clients build
 * `return { video_url: `https://stub.heygen.com/...` }` instead, and were
 * therefore invisible to a test written to catch exactly them. A matcher that
 * knows one spelling of a thing does not know the thing.
 */
const FABRICATED_HOST =
  /['"`]https?:\/\/[^'"`]*\b(?:stub|fake|dummy|placeholder|example|mock)\b[^'"`]*['"`]/i

/**
 * Разрешённые возвраты адресов — с причиной. Это не заглушки, а настоящие
 * значения: публичные адреса сетей и наши собственные ссылки.
 */
const ALLOWED: Record<string, string> = {
  'src/core/x402/index.ts': 'публичные адреса сетей Base — это и есть значения',
  /*
   * TWO ENTRIES REMOVED, AND THAT IS A STRENGTHENING.
   *
   * getPhotoUrl.ts and renderAvatarVideo.ts built their addresses by template
   * too (`${step}`, `${bucket}/${key}`). With the matcher narrowed they are no
   * longer fabrications, so they no longer need excusing -- and both files are
   * FULLY guarded again, where the allow-list entry had been covering
   * everything in them, because it works per file.
   *
   * The list demanded this itself: its own "no stale entries" check went red on
   * exactly those two.
   */
}

/**
 * Provider clients that are stubs end to end: they fabricate an address instead
 * of calling the provider. NOT an indulgence -- debt recorded with its liveness.
 *
 * LIVENESS (checked, not assumed): renderAvatarVideo.ts and render/steps.ts
 * import them, and renderFunction and renderAvatarVideoFunction ARE registered.
 * But nothing in src sends the events they subscribe to ('render' and
 * 'render/avatar-video') -- there is a constant and an mcp-server mapping, and
 * no sender. So these are latent: no live path from this code reaches them.
 *
 * Fixing means wiring the real providers (video-providers/KieAiProvider.ts
 * already exists with a real key) or deleting the dead clients. Both are the
 * owner's call.
 */
const STUB_PROVIDERS: Record<string, string> = {
  'src/services/hedra.ts': 'заглушка Hedra: stub.hedra.com вместо вызова',
  'src/services/heygen.ts': 'заглушка HeyGen: stub.heygen.com вместо вызова',
  'src/services/heygenService.ts':
    'вторая заглушка HeyGen (тот же класс, другое имя файла)',
  'src/services/kieAI.ts': 'заглушка KIE: stub.kieai.com вместо вызова',
  'src/core/kling.ts': 'заглушка Kling: example.com вместо вызова',
  'src/services/plan_b/avatar.service.ts':
    'адрес аватара по умолчанию — заглушка на example.com',
  'src/inngest_app/e2e-test-all-functions.ts': 'сценарий e2e, адреса нарочно',
  'src/inngest_app/send-event.ts': 'ручная отправка события, адреса нарочно',
  'src/api_server/routes/kie-ai-webhook.routes.ts':
    'строка ИНСТРУКЦИИ для оператора в отладочном эндпоинте: показывает, каким ' +
    'curl-ом дёрнуть коллбэк, и placeholder внутри примера — часть текста ' +
    'команды, а не выдаваемый человеку результат',
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
  // '/tests/' as well as '/test/': src/tests/ holds fixtures full of
  // example.com URLs, and excluding only the singular form let six of them
  // into a census of production code.
  return out.filter(
    f =>
      !f.includes('__tests__') &&
      !f.includes('/test/') &&
      !f.includes('/tests/')
  )
}

function findFabricated(): string[] {
  const hits: string[] = []
  for (const f of collect()) {
    const lines = strip(fs.readFileSync(f, 'utf8')).split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (FABRICATED.test(lines[i])) hits.push(`${f}:${i + 1}`)
    }
  }
  return hits
}

function findFabricatedHosts(): string[] {
  const hits: string[] = []
  for (const f of collect()) {
    const lines = strip(fs.readFileSync(f, 'utf8')).split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (FABRICATED_HOST.test(lines[i])) hits.push(`${f}:${i + 1}`)
    }
  }
  return hits
}

describe('нет выдуманных возвратов', () => {
  it('разбор что-то находит — иначе тест пустой', () => {
    // Страховка от самого себя: если шаблон перестанет срабатывать, проверка
    // ниже станет зелёной и бессмысленной. В проекте есть законные возвраты
    // адресов, поэтому ноль здесь означал бы поломку разбора.
    expect(findFabricated().length).toBeGreaterThan(0)
  })

  it('нет выдуманных возвратов вне разрешённых файлов', () => {
    const unexplained = findFabricated().filter(h => !ALLOWED[h.split(':')[0]])
    expect(unexplained).toEqual([])
  })

  it('выдуманный адрес В СВОЙСТВЕ тоже виден, и все такие места названы', () => {
    // The rule above only sees `return 'https://...'`. Four provider clients
    // build `return { video_url: ... }` instead and were therefore invisible to
    // a test written about exactly them.
    const hits = findFabricatedHosts()
    expect(hits.length, 'разбор перестал находить').toBeGreaterThan(0)
    const unexplained = hits.filter(h => {
      const f = h.split(':')[0]
      return !STUB_PROVIDERS[f] && !ALLOWED[f]
    })
    expect(unexplained).toEqual([])
  })

  it('в списке заглушек нет файлов, которые уже вычищены', () => {
    // An entry that outlives its reason silently covers the next stub.
    const hits = new Set(findFabricatedHosts().map(h => h.split(':')[0]))
    const stale = Object.keys(STUB_PROVIDERS).filter(f => !hits.has(f))
    expect(stale).toEqual([])
  })

  it('в списке разрешённых нет файлов, где таких возвратов уже нет', () => {
    // Запись, пережившая свою причину, молча прикроет следующую ошибку.
    const files = new Set(findFabricated().map(h => h.split(':')[0]))
    const stale = Object.keys(ALLOWED).filter(f => !files.has(f))
    expect(stale).toEqual([])
  })
})
