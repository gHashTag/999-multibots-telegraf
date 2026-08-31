import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

// Privileged-command authorization (money-mint / admin).
//
// A handful of bot commands are privileged: `addbalance` MINTS balance (it calls
// updateUserBalance directly), `checkbalance` and `factory` are admin tools.
// They are registered `bot.command('addbalance', requireAdmin(), handler)`, and
// handleAddBalanceCommand ALSO re-checks isAdmin internally. Dropping the
// requireAdmin() from the addbalance registration would let ANY user credit
// themselves -- the single worst authorization regression in the bot. This
// ratchet pins the gate on the known privileged commands (a NEW privileged
// command still needs human review, but these can never silently lose the gate).
//
// The check walks the registerCommands AST for bot.command(<name>, ...) and
// requires `requireAdmin` among the arguments -- not a text window (#1431/#1436).

const REGISTER = path.join(
  __dirname,
  '..',
  '..',
  'navigation',
  'registerCommands.ts'
)
const ADD_BALANCE_HANDLER = path.join(
  __dirname,
  '..',
  '..',
  'handlers',
  'adminCommands.ts'
)

// Commands that MUST carry requireAdmin() in their bot.command registration.
const MUST_BE_ADMIN_GATED = ['addbalance', 'checkbalance', 'factory']

const idText = (e: ts.Node): string => (ts.isIdentifier(e) ? e.text : '')

interface Reg {
  name: string
  gated: boolean
}

// Exported so the self-check can exercise it on a synthetic snippet.
export function commandRegistrations(fileName: string, text: string): Reg[] {
  const sf = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  const regs: Reg[] = []
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'command' &&
      /^(bot|stage)$/.test(idText(node.expression.expression))
    ) {
      const first = node.arguments[0]
      // requireAdmin() appears as a CallExpression arg whose callee is requireAdmin.
      const gated = node.arguments.some(
        a => ts.isCallExpression(a) && idText(a.expression) === 'requireAdmin'
      )
      const names: string[] = []
      if (first && ts.isStringLiteral(first)) names.push(first.text)
      else if (first && ts.isArrayLiteralExpression(first)) {
        first.elements.forEach(el => {
          if (ts.isStringLiteral(el)) names.push(el.text)
        })
      }
      names.forEach(name => regs.push({ name, gated }))
    }
    node.forEachChild(visit)
  }
  visit(sf)
  return regs
}

describe('privileged commands are admin-gated (money-mint / admin authorization)', () => {
  it('detector separates gated from ungated (control can fail)', () => {
    const snippet = [
      "bot.command('addbalance', requireAdmin(), h)",
      "bot.command('open', h)",
      "bot.command(['club', 'foundry'], h)",
    ].join('\n')
    const r = commandRegistrations('synthetic.ts', snippet)
    expect(r).toEqual([
      { name: 'addbalance', gated: true },
      { name: 'open', gated: false },
      { name: 'club', gated: false },
      { name: 'foundry', gated: false },
    ])
  })

  const regs = commandRegistrations(REGISTER, fs.readFileSync(REGISTER, 'utf8'))

  it('finds the privileged command registrations (matcher is not stale)', () => {
    MUST_BE_ADMIN_GATED.forEach(cmd => {
      expect(
        regs.some(r => r.name === cmd),
        `expected a bot.command('${cmd}', ...) registration`
      ).toBe(true)
    })
  })

  it('every privileged command registration carries requireAdmin()', () => {
    const ungated = regs
      .filter(r => MUST_BE_ADMIN_GATED.includes(r.name) && !r.gated)
      .map(r => r.name)
    expect(
      ungated,
      `Privileged command registered WITHOUT requireAdmin() -- anyone could run ` +
        `it (addbalance MINTS balance). Add requireAdmin() to the bot.command call:\n` +
        ungated.map(n => `  ${n}`).join('\n')
    ).toEqual([])
  })

  it('addbalance handler ALSO re-checks isAdmin internally (defense in depth)', () => {
    const src = fs.readFileSync(ADD_BALANCE_HANDLER, 'utf8')
    // handleAddBalanceCommand must not rely on the middleware alone.
    const fnStart = src.indexOf('handleAddBalanceCommand')
    expect(fnStart, 'handleAddBalanceCommand not found').toBeGreaterThan(-1)
    const body = src.slice(fnStart, fnStart + 1200)
    expect(
      /isAdmin\s*\(/.test(body),
      'handleAddBalanceCommand should re-check isAdmin() itself, not trust the middleware alone'
    ).toBe(true)
  })
})
