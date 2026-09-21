/**
 * TELL THE FIVE PEOPLE THAT THEIR STARS ARE ON THE BALANCE.
 *
 * On 2026-09-19 twelve Robokassa invoices were settled: the provider's own
 * record called them paid while our row still said PENDING, so five people had
 * paid and held nothing for it (docs/audit/paid-and-never-credited.md). The
 * owner asked for them to be told.
 *
 * ── WHICH BOT WRITES, AND HOW I GOT IT WRONG FIRST ────────────────────────
 *
 * My first answer was "the bot they paid through" -- `payments_v2.bot_name`.
 * Telegram disagreed: two of the five came back "chat not found", which means
 * they had never started that bot at all. The row's bot_name is the CASHIER
 * that processed the payment, not the bot the person talks to; the farm's
 * cashier is a bot of its own (see the skill note on the farm cashier).
 *
 * The bot a person actually has a chat with is `users.bot_name`. So: write
 * from the bot they paid through when that works, and otherwise from theirs --
 * and when neither token is in this environment, say so instead of sending
 * from some third bot, which would be a stranger writing to them about their
 * money.
 *
 * ── WHAT IT SAYS AND WHAT IT DOES NOT ──────────────────────────────────────
 *
 * The amount, the date, and whose fault it was. No offer, no link, no "by the
 * way, we also have". Somebody whose payment sat unnoticed for a year is owed
 * an apology, not a campaign.
 *
 * ── SAFETY ─────────────────────────────────────────────────────────────────
 *
 * Dry run by default: it prints every message in full and sends nothing.
 * Sending needs --commit. A refusal from Telegram (blocked, never started) is
 * reported per person, never swallowed -- an unsent apology must not look like
 * a sent one.
 *
 *   railway run -s 999-multibots-telegraf npx tsx scripts/tell-the-settled.ts
 *   railway run -s 999-multibots-telegraf npx tsx scripts/tell-the-settled.ts --commit
 */
import { telegramApiFor } from '../src/services/telegramApi'

const COMMIT = process.argv.includes('--commit')

/**
 * WHO HAS ALREADY BEEN TOLD, AND WHY THIS LIST EXISTS.
 *
 * The first run sent three messages and was refused twice. I fixed the two
 * refusals and ran it again -- and the three who had already been told got the
 * same apology a SECOND time. There was nothing to stop it: unlike the
 * settlement itself, where the row's own status is the lock, a message leaves
 * no trace in this repository at all.
 *
 * So the lock is written down. Anyone in this list is skipped; `--again`
 * overrides it deliberately. A list that has to be edited by hand is a poor
 * lock, and it is still better than none -- the honest alternative (a table of
 * what was sent to whom) is a bigger change than one apology deserves.
 */
const ALREADY_TOLD = new Set(
  process.argv.includes('--again')
    ? []
    : ['352374518', '405591717', '1830291751'] // told 2026-09-20, twice
)

/** Whom to tell, what they paid, and through which bot. Measured, not guessed. */
const PEOPLE = [
  {
    telegram_id: '352374518',
    bot: 'MetaMuse_Manifest_bot',
    stars: 43,
    // cyrillic-ok-next-line: message text
    what: 'восемь ваших платежей с апреля по сентябрь 2025 года на 44 ₽',
  },
  {
    telegram_id: '405591717',
    bot: 'MetaMuse_Manifest_bot',
    stars: 476,
    what: 'ваш платёж от 31 августа 2025 года на 1110 ₽', // cyrillic-ok: message text
  },
  {
    telegram_id: '945360934',
    // Refused as neuro_blogger_bot ("chat not found"); this is their own bot,
    // and its token is not in this farm -- reported, not worked around.
    bot: 'OM_AI_Digital_studio_bot',
    stars: 43,
    what: 'ваш платёж от 11 декабря 2025 года на 100 ₽', // cyrillic-ok: message text
  },
  {
    telegram_id: '8240165913',
    // Refused as neuro_blogger_bot ("chat not found"); this is the bot they
    // actually use.
    bot: 'AI_STARS_bot',
    stars: 43,
    what: 'ваш платёж от 14 декабря 2025 года на 100 ₽', // cyrillic-ok: message text
  },
  {
    telegram_id: '1830291751',
    bot: 'Gaia_Kamskaia_bot',
    stars: 217,
    what: 'ваш платёж от 28 мая 2026 года на 500 ₽', // cyrillic-ok: message text
  },
]

function text(person: (typeof PEOPLE)[number]): string {
  /* cyrillic-ok: this is the message a person reads */
  return (
    `Здравствуйте! Мы проверяли старые платежи и нашли ${person.what}.\n\n` +
    `Деньги у платёжной системы прошли, а звёзды из-за нашей ошибки тогда ` +
    `не зачислились. Сейчас исправлено: ${person.stars} ⭐ уже на вашем ` +
    `балансе.\n\n` +
    `Извините за задержку — ошибка наша, не ваша.`
  )
}

/** The token of a bot of the farm, by username. Tokens are never printed. */
async function tokenFor(username: string): Promise<string | null> {
  for (let i = 1; i <= 12; i++) {
    const token = process.env[`BOT_TOKEN_${i}`]
    if (!token) continue
    try {
      const res = await fetch(`${telegramApiFor(token)}/getMe`)
      const body = (await res.json()) as {
        ok?: boolean
        result?: { username?: string }
      }
      if (body.ok && body.result?.username === username) return token
    } catch {
      /* a token that cannot answer getMe is not the one we want anyway */
    }
  }
  return null
}

async function main(): Promise<void> {
  console.log(COMMIT ? 'SENDING\n' : 'DRY RUN -- nothing is sent\n')

  for (const person of PEOPLE) {
    if (ALREADY_TOLD.has(person.telegram_id)) {
      console.log(`--- ${person.telegram_id}: already told, skipping\n`)
      continue
    }
    const body = text(person)
    console.log(`--- ${person.telegram_id} via @${person.bot}`)
    console.log(body)
    console.log('')

    if (!COMMIT) continue

    const token = await tokenFor(person.bot)
    if (!token) {
      console.log(
        `  NOT SENT: no token for @${person.bot} in this environment\n`
      )
      continue
    }
    try {
      const res = await fetch(`${telegramApiFor(token)}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: person.telegram_id, text: body }),
      })
      const answer = (await res.json()) as {
        ok?: boolean
        description?: string
      }
      console.log(
        answer.ok
          ? `  SENT\n`
          : `  NOT SENT: ${answer.description ?? 'Telegram refused'}\n`
      )
    } catch (e) {
      console.log(`  NOT SENT: ${e instanceof Error ? e.message : String(e)}\n`)
    }
  }

  if (!COMMIT) console.log('Re-run with --commit to send.')
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exitCode = 1
})
