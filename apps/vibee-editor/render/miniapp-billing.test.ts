/**
 * Regression test: the Mini App must PAY for /api/generate/*.
 *
 * Two callers hit those endpoints. The agent (tools.ts) arrives with X-Api-Key
 * and has already paid at the tool layer. The Mini App arrives with a Telegram
 * signature and, until this wiring, paid NOTHING -- every user generated for
 * free, past the price and past the limit. billing-shared.ts existed with the
 * prices and the atomic spend, but render-server.ts never called it.
 *
 * Booting the server here would pull ffmpeg/face-api native deps (a local boot
 * has never worked in this repo), so the wiring is pinned at the source level,
 * and the price table itself is asserted by importing it.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { TOKEN_PRICES, priceFor } from './src/agent/billing-shared'

const SERVER = fs.readFileSync(path.join(__dirname, 'render-server.ts'), 'utf8')

/** The body of one /api/generate/<kind> handler. */
function handler(kind: 'image' | 'video' | 'audio' | 'lipsync'): string {
  const start = SERVER.indexOf(`req.url === '/api/generate/${kind}'`)
  expect(start, `${kind} handler not found`).toBeGreaterThan(-1)
  const next = SERVER.indexOf('req.url === ', start + 40)
  return SERVER.slice(start, next === -1 ? start + 9000 : next)
}

describe('mini-app generation is billed', () => {
  const ops = {
    image: 'image_generate',
    video: 'video_generate',
    audio: 'audio_generate',
    lipsync: 'lipsync_generate',
  } as const

  for (const kind of ['image', 'video', 'audio', 'lipsync'] as const) {
    it(`${kind}: charges with the shared price id before generating`, () => {
      const h = handler(kind)
      expect(h, `${kind} does not charge`).toMatch(/chargeMiniAppUser\(\s*req/)
      expect(h).toContain(`'${ops[kind]}'`)
      // The charge must precede the provider work, not follow it.
      const chargeAt = h.search(/chargeMiniAppUser\(\s*req/)
      const refundAt = h.indexOf('refundMiniAppUser')
      expect(chargeAt).toBeGreaterThan(-1)
      expect(refundAt, `${kind} never refunds`).toBeGreaterThan(chargeAt)
    })
  }

  it('quantity is measured, not a literal, wherever the provider bills per unit', () => {
    /*
     * ЕДИНИЦА БЕЗ КОЛИЧЕСТВА — ЭТО ПЛОСКАЯ ЦЕНА ПОД ДРУГИМ ИМЕНЕМ.
     *
     * Помощники `тысячиЗнаковКОплате` и `секундыКОплате` проверены своими
     * тестами, но НИЧТО не проверяло, что маршрут ими пользуется. Мутация это
     * показала: вернул в маршруте звука `оплаченныеТысячи = 1`, и всё
     * осталось зелёным — и юнит-тесты, и pipeline-check. Проводку можно было
     * молча оторвать.
     *
     * Три маршрута тарифицируются не за вызов, и все три пинятся здесь по
     * исходнику: звук — за тысячу знаков, видео и липсинк — за секунду.
     */
    /*
     * ИЗМЕРЕНИЕ БЕЗУСЛОВНО. Здесь пинилось `познаковаяМодель(model)` — и это
     * закрепляло дыру: счёт знаков был ДОБРОВОЛЬНЫМ. Тест держал проводку, но
     * не спрашивал, при каких условиях она срабатывает.
     */
    expect(SERVER).toMatch(/оплаченныеТысячи = тысячиЗнаковКОплате\(text\)/)
    expect(SERVER).not.toMatch(/оплаченныеТысячи = познаковаяМодель/)
    expect(SERVER).toMatch(/'audio_generate',\s*\n\s*оплаченныеТысячи,/)

    expect(SERVER).toMatch(/секунды = посекунднаяМодель\(model\)/)
    expect(SERVER).toMatch(/'video_generate',\s*\n\s*секунды,/)

    // Липсинк уже считал секунды до этой правки — пинится, чтобы не потерялось.
    expect(SERVER).toMatch(/'lipsync_generate',\s*\n\s*billedSeconds/)
  })

  it('every paid kind registers a job, so a dropped connection can be rescued', () => {
    /*
     * `startJob` звали только видео и липсинк, а приложение спрашивает
     * оборванный результат для ВСЕХ видов. Для картинки и звука отвечать было
     * нечем: обрыв терял генерацию, уже оплаченную провайдеру.
     *
     * Тип задачи перечислял все четыре вида с самого начала — то есть замысел
     * был, а проводки не было. Ровно тот случай, когда «покрыто типами» и
     * «работает» расходятся.
     *
     * Пинится по ИСХОДНИКУ по вчерашней причине: юнит-тест на startJob
     * остаётся зелёным, даже если маршрут его не зовёт.
     */
    for (const вид of ['image', 'video', 'audio', 'lipsync']) {
      expect(SERVER, `${вид}: маршрут не регистрирует задачу`).toMatch(
        new RegExp(`startJob\\('${вид}'`)
      )
    }
  })

  it('refuses instead of giving the generation away when billing cannot run', () => {
    // Fail-closed: a route that cannot charge does not open. Matches
    // requireInternalKey's rule in the bot.
    expect(SERVER).toContain("status: 503, reason: 'billing unavailable'")
  })

  it('skips the agent path only on the VALIDATED key, not a spoofable header', () => {
    // Server-to-server callers already paid at the tool layer, but the skip
    // must key off the VALIDATED auth decision, not the raw header presence.
    // authenticate() only returns via 'api-key' when X-Api-Key timing-safe
    // matches RENDER_API_KEY; a present-but-WRONG X-Api-Key falls through to
    // the Telegram/session branch (auth.ts does not reject it). So a signed
    // Mini App user who adds a junk X-Api-Key header must still be charged.
    // Matched as a pattern, not as a whole literal: the ok-branch now also
    // carries the receipt (what was charged, what is left), and pinning the
    // exact `{ ok: true }` text made this security assertion fail on a change
    // that did not touch the gate. What must hold is the CONDITION -- the
    // validated auth decision -- and that is what is pinned.
    expect(SERVER).toMatch(
      /if \(authenticate\(req\)\.via === 'api-key'\) return \{ ok: true/
    )
    // The old presence check skipped billing for ANY spoofed header -> free
    // generation past the paywall. It must not come back.
    expect(SERVER).not.toContain(
      "if (req.headers['x-api-key']) return { ok: true }"
    )
  })

  it('answers 402 when the balance is short', () => {
    expect(SERVER).toContain('status: 402')
  })

  it('uses signed Telegram or the verified app session owner for billing', () => {
    expect(SERVER).toContain('const tid = verifiedViewerId(req)')
  })
})

describe('prices come from the shared table, not from render-server', () => {
  it('uses the same ids the agent tools bill', () => {
    for (const op of [
      'image_generate',
      'video_generate',
      'audio_generate',
      'lipsync_generate',
    ]) {
      expect(TOKEN_PRICES[op], `${op} has no price`).toBeGreaterThan(0)
    }
  })

  it('prices are derived from cost, not hand-set', () => {
    expect(TOKEN_PRICES.image_generate).toBe(priceFor('image_generate'))
    expect(TOKEN_PRICES.video_generate).toBe(priceFor('video_generate'))
    expect(TOKEN_PRICES.audio_generate).toBe(priceFor('audio_generate'))
    expect(TOKEN_PRICES.lipsync_generate).toBe(priceFor('lipsync_generate'))
  })

  it('render-server does not define its own prices', () => {
    expect(SERVER).toContain("from './src/agent/billing-shared'")
    expect(SERVER).not.toContain('OPERATION_COST_USD')
  })
})
