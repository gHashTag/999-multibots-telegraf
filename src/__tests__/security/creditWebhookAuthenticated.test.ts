/**
 * Repo-wide ratchet: every balance-credit in an api_server ROUTE must be
 * preceded by a recognized authenticity gate within its handler.
 *
 * A public HTTP route that credits balance (updateUserBalance MONEY_INCOME)
 * from request-controlled inputs, without first verifying that the caller is
 * the genuine payment provider, is a money mint (forge a callback -> credit any
 * account). The per-file ratchets pin the two routes that credit today
 * (x402CreditFailClosed, robokassa-order), but a NEW *.routes.ts that credits
 * without any auth gate would slip past both. This ratchet is the cross-file
 * net: it scans EVERY file under src/api_server/routes and fails if any
 * MONEY_INCOME credit lacks a preceding recognized gate in its handler.
 *
 * Recognized gates (each a real fail-closed auth primitive in this repo):
 *   - validateRobokassaSignature(   Robokassa HMAC signature check
 *   - verifyCallbackToken(          recipient callback token (timing-safe)
 *   - res.status(501) / res.status(403)   explicit refusal (x402 fail-closed)
 *
 * A new credit-route using a DIFFERENT auth primitive will (correctly) fail
 * this test until the primitive is added to RECOGNIZED_GATES after review --
 * failing toward review is the right posture for a money-credit gate.
 *
 * See loop-fable iter190; follows #1474 (x402) and the robokassa signature work.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const ROUTES_DIR = path.resolve(__dirname, '../../api_server/routes')

// Source-text markers that count as an authenticity gate call.
const RECOGNIZED_GATES = [
  /\bvalidateRobokassaSignature\s*\(/,
  /\bverifyCallbackToken\s*\(/,
  /\bres\s*\.\s*status\s*\(\s*501\s*\)/,
  /\bres\s*\.\s*status\s*\(\s*403\s*\)/,
]

/**
 * ВЫЗВАТЬ ПРОВЕРКУ — НЕ ЗНАЧИТ ЕЙ ПОДЧИНИТЬСЯ.
 *
 * Сетка искала только ВЫЗОВ примитива и считала обработчик защищённым. Аудит
 * 06.09.2026 показал, чем это кончается: в robokassa.routes.ts можно удалить
 *
 *     if (!isValidSignature) { return res.status(400).send('Invalid signature') }
 *
 * оставив сам вызов `validateRobokassaSignature(...)` — и ВЕСЬ набор тестов
 * бота остаётся зелёным. А это значит, что любой мог бы отправить
 * OutSum/InvId/произвольную подпись на публичный ResultURL и закрыть платёж с
 * зачислением.
 *
 * Поэтому проверяется не только вызов, но и ОТКАЗ: между гвардом и
 * зачислением обязан стоять ранний выход — return со статусом ошибки, throw
 * или res.status(4xx). Гвард, чей результат никуда не ведёт, — это
 * комментарий с побочным эффектом.
 */
const ОТКАЗ = /return\s+res\s*\.\s*status\s*\(\s*4\d\d\s*\)|throw\s+new\s+\w*Error/

/**
 * СВЯЗЬ, А НЕ СОСЕДСТВО.
 *
 * Первая попытка искала «есть ли где-то до зачисления ранний выход» — и была
 * бесполезна: в этом обработчике восемь `return res.status(4xx)` по совсем
 * другим поводам (нет тела, нет параметров, платёж не найден). Мутация,
 * удаляющая отказ ИМЕННО по подписи, оставалась зелёной.
 *
 * Проверяем то, что нужно на самом деле: результат гварда присвоен
 * переменной, эта переменная проверена отрицанием, и отказ стоит внутри
 * проверки. Гвард, чей ответ никуда не ведёт, — комментарий с побочным
 * эффектом.
 */
function отказПоРезультатуГварда(текст: string): boolean {
  // Прямой отказ статусом — сам по себе гвард, переменной не требует.
  if (/res\s*\.\s*status\s*\(\s*(?:501|403)\s*\)/.test(текст)) return true

  /*
   * ВСТРОЕННАЯ ФОРМА: `if (!гвард(...)) <отказ>` — без переменной.
   * Встречается там, где результат нигде больше не нужен.
   */
  for (const гвард of RECOGNIZED_GATES) {
    const встроенный = new RegExp(
      `if\\s*\\(\\s*!\\s*${гвард.source.replace('\\b', '').replace('\\s*\\(', '')}\\s*\\(`
    )
    if (встроенный.test(текст)) {
      const после = текст.slice(текст.search(встроенный))
      if (ОТКАЗ.test(после.slice(0, 400))) return true
    }
  }

  /*
   * Ищем построчно: `const X = ...<гвард>(...)`, затем `if (!X)` с отказом
   * внутри. Построчно, а не одним выражением, потому что склейка регулярных
   * выражений из чужих источников ломается молча — на этом уже споткнулась
   * первая версия проверки.
   */
  for (const строка of текст.split('\n')) {
    if (!RECOGNIZED_GATES.some(re => re.test(строка))) continue
    const m = /(?:const|let|var)\s+(\w+)/.exec(строка)
    if (!m) continue
    const имя = m[1]
    const проверка = new RegExp(
      `if\\s*\\(\\s*!\\s*${имя}\\s*\\)[\\s\\S]{0,400}?(?:${ОТКАЗ.source})`
    )
    if (проверка.test(текст)) return true
  }
  return false
}

interface CreditSite {
  file: string
  line: number
  gated: boolean
}

function enclosingFunction(n: ts.Node): ts.Node | undefined {
  let c: ts.Node | undefined = n.parent
  while (c) {
    if (
      ts.isFunctionDeclaration(c) ||
      ts.isFunctionExpression(c) ||
      ts.isArrowFunction(c) ||
      ts.isMethodDeclaration(c)
    ) {
      return c
    }
    c = c.parent
  }
  return undefined
}

function isMoneyIncomeCredit(n: ts.Node, sf: ts.SourceFile): boolean {
  if (!ts.isCallExpression(n)) return false
  const e = n.expression
  const name = ts.isIdentifier(e)
    ? e.text
    : ts.isPropertyAccessExpression(e)
      ? e.name.text
      : ''
  if (name !== 'updateUserBalance') return false
  return n.arguments.some(a => /MONEY_INCOME/.test(a.getText(sf)))
}

/** Analyze one source: list MONEY_INCOME credits and whether each is gated. */
function analyzeSource(fileLabel: string, source: string): CreditSite[] {
  const sf = ts.createSourceFile(
    fileLabel,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )
  const sites: CreditSite[] = []
  const visit = (n: ts.Node): void => {
    if (isMoneyIncomeCredit(n, sf)) {
      const creditPos = n.getStart(sf)
      const fn = enclosingFunction(n)
      let gated = false
      if (fn) {
        // Text of the enclosing handler up to (but not including) the credit.
        const before = source.slice(fn.getStart(sf), creditPos)
        // Оба условия обязательны: примитив вызван И его отказ приводит к
        // раннему выходу до зачисления.
        gated =
          RECOGNIZED_GATES.some(re => re.test(before)) &&
          отказПоРезультатуГварда(before)
      }
      sites.push({
        file: fileLabel,
        line: sf.getLineAndCharacterOfPosition(creditPos).line + 1,
        gated,
      })
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return sites
}

function listRouteFiles(): string[] {
  if (!fs.existsSync(ROUTES_DIR)) return []
  return fs
    .readdirSync(ROUTES_DIR)
    .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map(f => path.join(ROUTES_DIR, f))
}

function analyzeAllRoutes(): CreditSite[] {
  return listRouteFiles().flatMap(f =>
    analyzeSource(path.basename(f), fs.readFileSync(f, 'utf8'))
  )
}

describe('credit-webhook routes are authenticated before crediting', () => {
  const sites = analyzeAllRoutes()

  it('self-check: the detector distinguishes gated from ungated credits', () => {
    const gated = `
      export async function h(req, res) {
        if (!validateRobokassaSignature(a, b, c, d)) return res.status(400).end()
        await updateUserBalance(req.body.id, req.body.stars, PaymentType.MONEY_INCOME)
      }
    `
    const ungated = `
      export async function h(req, res) {
        await updateUserBalance(req.body.id, req.body.stars, PaymentType.MONEY_INCOME)
        res.status(200).end()
      }
    `
    /*
     * ТРЕТИЙ ОБРАЗЕЦ — РАДИ КОТОРОГО ВСЁ И ПЕРЕПИСАНО.
     *
     * Гвард ВЫЗВАН, а результат никуда не ведёт. Прежняя сетка считала это
     * защищённым, и потому удаление отказа по подписи в robokassa.routes.ts
     * оставляло весь набор тестов бота зелёным — при том что любой мог бы
     * закрыть платёж с зачислением, отправив произвольную подпись.
     */
    const вызванНоНеУслышан = `
      export async function h(req, res) {
        const ok = validateRobokassaSignature(a, b, c, d)
        await updateUserBalance(req.body.id, req.body.stars, PaymentType.MONEY_INCOME)
        res.status(200).end()
      }
    `
    expect(analyzeSource('g.ts', gated).map(s => s.gated)).toEqual([true])
    expect(analyzeSource('u.ts', ungated).map(s => s.gated)).toEqual([false])
    expect(
      analyzeSource('i.ts', вызванНоНеУслышан).map(s => s.gated),
      'гвард вызван, но его отказ никуда не ведёт — это не защита'
    ).toEqual([false])
  })

  it('matcher is not stale: finds every credit site (>= 3)', () => {
    // Today: x402 (2 sites) + robokassa (1 site). A silent zero-match would
    // make the main assertion pass vacuously.
    expect(sites.length).toBeGreaterThanOrEqual(3)
  })

  it('every MONEY_INCOME credit in api_server/routes has a preceding auth gate', () => {
    const ungated = sites.filter(s => !s.gated)
    expect(
      ungated,
      `An api_server route credits balance with no recognized auth gate before ` +
        `it: ${ungated.map(s => `${s.file}:${s.line}`).join(', ')}. A public ` +
        `route must verify the payment provider (signature / callback token / ` +
        `501 refusal) before updateUserBalance(MONEY_INCOME), or it is a mint.`
    ).toEqual([])
  })
})
