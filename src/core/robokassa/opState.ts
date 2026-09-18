/**
 * DID THIS PERSON ACTUALLY PAY -- ASKED OF ROBOKASSA, NOT OF OUR OWN TABLE.
 *
 * `checkPaymentStatus` says it plainly: a checker that reads the table holding
 * the defect cannot see the defect. Asked about a stuck payment it answers
 * PENDING, which is what the table already said. The independent channel is
 * Robokassa's own `OpStateExt`, and this is that call, in the bot's language so
 * the hourly watch can use it. `scripts/robokassa-reconcile.cjs` does the same
 * thing by hand; the classification below is copied from it deliberately --
 * two answers to one question is how a reconcile starts inventing debts.
 *
 * State codes are quoted from https://docs.robokassa.ru/ru/xml-interfaces
 * (fetched 2026-09-08):
 *   5   initialised, payment not yet confirmed
 *   10  cancelled, money was never taken from the buyer
 *   20  HOLD (funds held)
 *   50  money received, crediting to the shop in progress
 *   60  crediting refused, money returned to the buyer
 *   80  execution suspended after an incident
 *   100 paid successfully, funds credited
 * Result codes: 0 ok, 1 bad signature, 2 shop not found, 3 operation not found,
 * 4 two operations with one InvoiceID, 1000 internal error.
 *
 * THREE OUTCOMES, NEVER TWO. A network failure, an unparseable body, an
 * unexpected code -- none of those mean "did not pay". They are UNKNOWN, and
 * they stay UNKNOWN all the way to the caller, because a silent "no" here is
 * the exact shape that tells an owner nobody is owed anything.
 */
import crypto from 'node:crypto'

export type OpStateVerdict = 'PAID' | 'NOT_PAID' | 'NEEDS_A_HUMAN' | 'UNKNOWN'

export interface OpStateAnswer {
  verdict: OpStateVerdict
  /** The provider's State.Code, when there was one. */
  state?: number
  /** Why it is UNKNOWN, in the provider's own terms. */
  why?: string
}

const PAID = new Set([50, 100]) // money left the buyer
const UNPAID = new Set([5, 10]) // money never left the buyer
const HUMAN = new Set([20, 60, 80]) // held, refunded, suspended -- a person decides

const md5 = (s: string) =>
  crypto.createHash('md5').update(s, 'utf8').digest('hex')

/** MD5(login:invId:password2), the signature OpStateExt expects. */
export function opStateSignature(
  login: string,
  invId: string | number,
  password2: string
): string {
  return md5(`${login}:${invId}:${password2}`)
}

/** Pull one integer out of <Parent><Code>N</Code>, tolerant of attributes. */
function readCode(xml: string, parent: string): number | null {
  const block = new RegExp(
    `<${parent}\\b[^>]*>([\\s\\S]*?)</${parent}>`,
    'i'
  ).exec(xml)
  if (!block) {
    const attr = new RegExp(
      `<${parent}\\b[^>]*\\bCode\\s*=\\s*"(\\d+)"`,
      'i'
    ).exec(xml)
    return attr ? Number(attr[1]) : null
  }
  const code = /<Code\b[^>]*>\s*(\d+)\s*<\/Code>/i.exec(block[1])
  if (code) return Number(code[1])
  const attr = /<Code\s*=\s*"(\d+)"/i.exec(block[1])
  return attr ? Number(attr[1]) : null
}

/** What the provider's answer means. Never "no" where it could be "I cannot tell". */
export function classifyOpState(xml: unknown): OpStateAnswer {
  if (typeof xml !== 'string' || !xml.trim())
    return { verdict: 'UNKNOWN', why: 'empty body' }
  const result = readCode(xml, 'Result')
  if (result === null)
    return { verdict: 'UNKNOWN', why: 'no Result.Code in body' }
  if (result !== 0) return { verdict: 'UNKNOWN', why: `Result.Code=${result}` }
  const state = readCode(xml, 'State')
  if (state === null)
    return { verdict: 'UNKNOWN', why: 'Result ok but no State.Code' }
  if (PAID.has(state)) return { verdict: 'PAID', state }
  if (UNPAID.has(state)) return { verdict: 'NOT_PAID', state }
  if (HUMAN.has(state)) return { verdict: 'NEEDS_A_HUMAN', state }
  return { verdict: 'UNKNOWN', why: `undocumented State.Code=${state}`, state }
}

/**
 * Ask the provider about one invoice.
 *
 * Credentials are read by the caller and passed in, so this function can be
 * exercised without them -- and so no code path can quietly fall back to an
 * empty login and read every answer as UNKNOWN.
 */
export async function askOpState(
  invId: string | number,
  creds: { login: string; password2: string },
  fetchImpl: typeof fetch = fetch
): Promise<OpStateAnswer> {
  if (!creds.login || !creds.password2) {
    return { verdict: 'UNKNOWN', why: 'no merchant credentials' }
  }
  const url =
    'https://auth.robokassa.ru/Merchant/WebService/Service.asmx/OpStateExt' +
    `?MerchantLogin=${encodeURIComponent(creds.login)}` +
    `&InvoiceID=${encodeURIComponent(String(invId))}` +
    `&Signature=${opStateSignature(creds.login, invId, creds.password2)}`
  try {
    const res = await fetchImpl(url)
    const body = await res.text()
    if (!res.ok) {
      return { verdict: 'UNKNOWN', why: `HTTP ${res.status}` }
    }
    return classifyOpState(body)
  } catch (e) {
    return {
      verdict: 'UNKNOWN',
      why: e instanceof Error ? e.message.slice(0, 80) : 'request failed',
    }
  }
}
