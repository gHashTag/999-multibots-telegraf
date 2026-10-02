/**
 * READ EVERY VALUE A `code:` PROPERTY CAN TAKE IN A SLICE OF SERVER SOURCE.
 *
 * The failure-code contracts (agent-chat-codes, money-route-codes,
 * pairing-refusal-codes) read the codes out of the server so no list is
 * copied into a test. Each used to match only a bare `code: 'x'`, so these
 * shapes set a code the contract never saw:
 *   - a ternary, `code: empty ? 'no_answer' : 'model_failed'`;
 *   - a variable, `code: reason`, or a shorthand `{ code }`;
 *   - a fallback, `code: reason ?? 'internal'`, where the literal was counted
 *     and the variable was not;
 *   - a value Prettier moved to the next line, `code:\n  reason`.
 * Now the literals of the value are FOUND, and every name the value can
 * evaluate to is OPAQUE, so a contract can say which references it trusts.
 * A ternary's condition is not a value, so only its branches are read.
 *
 * Test-only: imported by the contracts, never by the server.
 */
const QUOTED = /'([a-z_]+)'/g
const NOT_A_VALUE = new Set([
  'null',
  'undefined',
  'true',
  'false',
  'as',
  'const',
  'satisfies',
])

export const quotedCodes = (src: string) =>
  [...src.matchAll(QUOTED)].map(m => m[1])

export function codeValues(src: string) {
  const found: string[] = []
  const opaque: string[] = []
  for (const m of src.matchAll(/\bcode:\s+([^,\n}]+)/g)) {
    const expr = m[1].trim()
    // Prettier spaces a ternary's `?`; `??` and `?.` never match ' ? '.
    const q = expr.indexOf(' ? ')
    const value = q >= 0 ? expr.slice(q + 3) : expr
    found.push(...quotedCodes(value))
    const names = value
      .replace(/'[^']*'|"[^"]*"/g, ' ')
      .match(/[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/g)
    for (const name of names ?? [])
      if (!NOT_A_VALUE.has(name)) opaque.push(name)
  }
  for (const m of src.matchAll(/[{,]\s*code\s*(?=[,}])/g)) opaque.push('code')
  return { found, opaque }
}
