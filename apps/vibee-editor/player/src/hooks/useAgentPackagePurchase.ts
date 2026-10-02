/**
 * BUYING AN AGENT PACKAGE FOR STARS, FROM THE CARD THAT SHOWS IT.
 *
 * The render mints the invoice (POST /api/agents/packages/invoice): a month,
 * as a Telegram subscription under the Stars cap or a one-off invoice above
 * it, and nothing while a subscription is running. Telegram opens it; the render books the charge from
 * its cashier's own Stars ledger (POST /api/agents/packages/verify), never on
 * the client's word. Same flow and the same patience as useTokenTopUp: a Stars
 * transaction reaches the Bot API with a delay, so "not booked yet" is checked
 * again with real attempts before anything is promised.
 */
import { useState } from 'react'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'
import { reportPayOutcome } from '@/lib/payOutcome'
import { forgetPackageStatus } from '@/hooks/useUserLevel'

type Lang = 'ru' | 'en'

interface TelegramInvoices {
  openInvoice?: (link: string, cb: (status: string) => void) => void
}

const NOTES = {
  ru: {
    opening: 'Открываю счёт…',
    checking: 'Оплачено! Проверяю…',
    booked: (until: string) =>
      `Готово ✅ Агент оплачен до ${until}. Команда напишет вам в боте.`,
    late: 'Оплата видна Telegram — подтверждение придёт в бот в течение часа.',
    failed: 'Оплата не прошла',
    subscribed: 'Подписка уже действует — следующий месяц Telegram спишет сам.',
    outside:
      'Оплата звёздами работает внутри Telegram. Нажмите «Задать вопрос» — пришлём счёт.',
    network: 'Сеть подвела — попробуйте ещё раз',
  },
  en: {
    opening: 'Opening the invoice…',
    checking: 'Paid! Checking…',
    booked: (until: string) =>
      `Done ✅ Your agent is paid until ${until}. The team will message you in the bot.`,
    late: 'Telegram has the payment — the confirmation reaches the bot within the hour.',
    failed: 'The payment did not go through',
    subscribed:
      'Your subscription is running — Telegram charges the next month by itself.',
    outside:
      'Paying in Stars works inside Telegram. Press "Ask a question" and we will send an invoice.',
    network: 'The network failed — please try again',
  },
} as const

export interface AgentPackagePurchase {
  /** The package being bought right now, or null. */
  busy: string | null
  /** What to say under one package's card. */
  noteFor: (packageId: string) => string | null
  buy: (packageId: string) => Promise<void>
}

const VERIFY_ATTEMPTS = 3
const VERIFY_GAP_MS = 25_000

export function useAgentPackagePurchase(
  lang: Lang,
  opts: { wait?: (ms: number) => Promise<void> } = {}
): AgentPackagePurchase {
  const [busy, setBusy] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const text = NOTES[lang]
  const say = (id: string, note: string) =>
    setNotes(n => ({ ...n, [id]: note }))
  const wait =
    opts.wait ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)))

  const verify = async (id: string): Promise<string | null> => {
    const res = await fetch(`${API_BASE}/api/agents/packages/verify`, {
      method: 'POST',
      headers: authHeaders(),
    })
    const d = await res.json()
    const pkg = Array.isArray(d?.packages)
      ? d.packages.find((p: { id?: string }) => p.id === id)
      : null
    return pkg?.active && typeof pkg.until === 'string' ? pkg.until : null
  }

  const buy = async (id: string) => {
    const wa = (
      window as unknown as { Telegram?: { WebApp?: TelegramInvoices } }
    ).Telegram?.WebApp
    if (!wa?.openInvoice) {
      say(id, text.outside)
      reportPayOutcome('agents', 'unsupported')
      return
    }
    setBusy(id)
    say(id, text.opening)
    try {
      const res = await fetch(
        `${API_BASE}/api/agents/packages/invoice?package=${encodeURIComponent(id)}`,
        { method: 'POST', headers: authHeaders() }
      )
      const d = await res.json()
      if (d?.already_subscribed) {
        say(id, text.subscribed)
        setBusy(null)
        return
      }
      if (!d?.ok || typeof d.link !== 'string') {
        say(id, String(d?.error ?? text.network))
        reportPayOutcome('agents', 'failed', { error: d?.error })
        setBusy(null)
        return
      }
      wa.openInvoice(d.link, async (status: string) => {
        try {
          if (status === 'paid') {
            say(id, text.checking)
            const locale = lang === 'ru' ? 'ru-RU' : 'en-GB'
            for (let attempt = 0; attempt <= VERIFY_ATTEMPTS; attempt++) {
              if (attempt > 0) await wait(VERIFY_GAP_MS)
              try {
                const until = await verify(id)
                if (until) {
                  // The next screen asks for the person's level afresh.
                  forgetPackageStatus()
                  say(
                    id,
                    text.booked(
                      new Date(until).toLocaleDateString(locale, {
                        day: 'numeric',
                        month: 'long',
                        timeZone: 'UTC',
                      })
                    )
                  )
                  return
                }
              } catch {
                /* the network is playing up: next attempt */
              }
            }
            say(id, text.late)
            reportPayOutcome('agents', 'pending', { stars: d.stars })
          } else if (status === 'failed') {
            say(id, text.failed)
            reportPayOutcome('agents', 'failed', { stars: d.stars })
          } else if (status === 'cancelled') {
            setNotes(n => {
              const rest = { ...n }
              delete rest[id]
              return rest
            })
            reportPayOutcome('agents', 'cancelled', { stars: d.stars })
          }
        } finally {
          setBusy(null)
        }
      })
    } catch {
      say(id, text.network)
      setBusy(null)
    }
  }

  return { busy, noteFor: id => notes[id] ?? null, buy }
}
