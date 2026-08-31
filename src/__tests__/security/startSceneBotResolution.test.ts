/**
 * Ratchet: startScene resolves the current bot from the live context token.
 *
 * This is a multi-bot process: bots are keyed by per-bot tokens (BOT_TOKEN_1,
 * ...), NOT a singular process.env.BOT_TOKEN. startScene used
 * getBotNameByToken(process.env.BOT_TOKEN || '') -- which never matches the
 * running bot, so getBotNameByToken fell back to the default bot
 * ('neuro_blogger_bot') and EVERY bot showed that bot's welcome branding
 * (cross-tenant). The fix resolves from ctx.telegram.token, like every other
 * scene (neuroPhotoWizard, cryptoPaymentScene, ...).
 *
 * This pins it: the getBotNameByToken call(s) in startScene take ctx.telegram
 * .token, and none takes process.env.BOT_TOKEN.
 *
 * loop-fable iter201 (found by the bug-hunt-wave6 workflow, default-masks-error lens).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(__dirname, '../../scenes/startScene/index.ts')

function analyze(source: string) {
  const sf = ts.createSourceFile(
    'startScene.ts',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )
  let total = 0
  let fromEnvBotToken = 0
  let fromContextToken = 0
  const visit = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'getBotNameByToken'
    ) {
      total++
      const arg = n.arguments[0] ? n.arguments[0].getText(sf) : ''
      if (/process\.env\.BOT_TOKEN\b/.test(arg)) fromEnvBotToken++
      if (/ctx\.telegram\.token/.test(arg)) fromContextToken++
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { total, fromEnvBotToken, fromContextToken }
}

describe('startScene resolves the current bot from the context token', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const { total, fromEnvBotToken, fromContextToken } = analyze(source)

  it('self-check: detector distinguishes the env-token arg from the context-token arg', () => {
    expect(
      analyze(`getBotNameByToken(process.env.BOT_TOKEN || '')`)
    ).toMatchObject({
      fromEnvBotToken: 1,
      fromContextToken: 0,
    })
    expect(analyze(`getBotNameByToken(ctx.telegram.token)`)).toMatchObject({
      fromEnvBotToken: 0,
      fromContextToken: 1,
    })
  })

  it('matcher is not stale: startScene resolves a bot name', () => {
    expect(total).toBeGreaterThanOrEqual(1)
  })

  it('no getBotNameByToken uses the singular process.env.BOT_TOKEN', () => {
    expect(
      fromEnvBotToken,
      `startScene resolves the bot via getBotNameByToken(process.env.BOT_TOKEN) -- ` +
        `wrong for a multi-bot process; it falls back to the default bot and shows ` +
        `that bot's welcome for EVERY bot. Use ctx.telegram.token.`
    ).toBe(0)
  })

  it('the current bot is resolved from ctx.telegram.token', () => {
    expect(fromContextToken).toBeGreaterThanOrEqual(1)
  })
})
