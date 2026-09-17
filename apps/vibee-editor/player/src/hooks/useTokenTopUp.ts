/**
 * BUYING TOKENS, IN ONE PLACE INSTEAD OF ONE PAGE.
 *
 * This is the only top-up in the product that works end to end: the server
 * mints a Stars invoice, Telegram opens it, and the credit is confirmed against
 * getStarTransactions rather than against the client's word. It lived inside
 * Chat.tsx, so the profile -- the screen a person opens to look at their
 * balance -- had no way to pay at all. Measured 2026-09-17: 260 lines of
 * Profile.tsx and not one call to the token routes.
 *
 * Moved here whole, comments included, so that the page which shows the balance
 * and the page which spends it use the SAME flow. A second implementation is
 * how one of them quietly stops verifying.
 *
 * WHY THE VERIFY LOOP IS NOT SIMPLER. A Stars transaction appears in the Bot
 * API with a delay, so a single check after payment says "not credited" for a
 * payment that is perfectly fine. The retries keep that promise with real
 * attempts rather than an empty timer -- and when the server says the credit
 * genuinely failed, this says so plainly instead of promising it will catch up.
 */
import { useEffect, useState } from 'react'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'
import { reportPayOutcome } from '@/lib/payOutcome'

export interface TokenTopUp {
  /** The balance, or null while it is unknown. */
  tokens: number | null
  /** The last thing worth telling the person, or null. */
  note: string | null
  /** Mint an invoice for a pack and open it in Telegram. */
  buy: (pack: string) => Promise<void>
}

export function useTokenTopUp(): TokenTopUp {
  const [tokens, setTokens] = useState<number | null>(null)
  const [topUpNote, setTopUpNote] = useState<string | null>(null)

  // The invoice is minted by the server (XTR) and opened by Telegram.WebApp.
  // The cashier's webhook does the verifying: the client is not believed.
  const buy = async (pack: string) => {
    setTopUpNote(null)
    try {
      const headers = authHeaders()
      const devKey = import.meta.env.DEV
        ? (import.meta.env.VITE_AGENT_KEY as string | undefined)
        : undefined
      if (devKey && !headers.has('X-Telegram-Init-Data')) {
        headers.set('X-Agent-Key', devKey)
      }
      const res = await fetch(`${API_BASE}/api/tokens/invoice`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ pack }),
      })
      const d = await res.json()
      if (!d.ok) {
        setTopUpNote(String(d.error ?? 'не получилось'))
        return
      }
      const wa = (window as any).Telegram?.WebApp
      if (wa?.openInvoice) {
        wa.openInvoice(d.link, async (status: string) => {
          if (status === 'paid') {
            setTopUpNote('Оплачено! Проверяю зачисление…')
            // Verified against the source of truth (getStarTransactions): the
            // webhook may be asleep, the Stars are not.
            try {
              const vres = await fetch(`${API_BASE}/api/tokens/verify`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ pack }),
              })
              const vd = await vres.json()
              if (vd.ok) {
                setTokens(vd['баланс'])
                setTopUpNote(
                  `Зачислено ${vd['зачислено_токенов']} токенов! Баланс: ${vd['баланс']}`
                )
              } else if (vd['зачисление_провалено']) {
                // Not "not visible yet" but "not credited": the invoice is
                // already marked redeemed, so a retry cannot find it again.
                // Promising it will catch up here is the same lie this
                // change repairs one layer down.
                setTokens(vd['баланс'] ?? null)
                setTopUpNote(
                  'Оплата прошла, но токены не зачислены. Мы уже знаем — напишите в поддержку, вернём или начислим руками.'
                )
              } else {
                setTopUpNote(
                  'Оплата прошла — проверяю зачисление ещё пару раз…'
                )
                // A Stars transaction reaches the Bot API with a delay, so the
                // promise is kept with real attempts, not an empty timer.
                for (let attempt = 0; attempt < 3; attempt++) {
                  await new Promise(r => setTimeout(r, 25_000))
                  try {
                    const r2 = await fetch(`${API_BASE}/api/tokens/verify`, {
                      method: 'POST',
                      headers,
                    })
                    const vd2 = await r2.json()
                    if (vd2?.ok) {
                      setTokens(vd2['баланс'])
                      setTopUpNote(
                        `Зачислено ${vd2['зачислено_токенов']} токенов! Баланс: ${vd2['баланс']}`
                      )
                      return
                    }
                  } catch {
                    /* the network is playing up: next attempt in 25s */
                  }
                }
                setTopUpNote(
                  'Оплата видна Telegram — зачисление догонит при следующем входе в чат'
                )
                reportPayOutcome('tokens', 'pending')
              }
            } catch {
              setTopUpNote('Оплата прошла — зачисление подтвердится чуть позже')
            }
          } else if (status === 'failed') {
            setTopUpNote('Оплата не прошла')
            reportPayOutcome('tokens', 'failed')
          } else if (status === 'cancelled') {
            reportPayOutcome('tokens', 'cancelled')
          }
        })
      } else {
        setTopUpNote('Покупка доступна внутри Telegram')
        reportPayOutcome('tokens', 'unsupported')
      }
    } catch {
      setTopUpNote('сеть подвела — попробуй ещё')
    }
  }

  // The balance is read on mount so a person sees what generations cost
  // before the first one is charged, not after. A free tool, same headers.
  useEffect(() => {
    ;(async () => {
      try {
        const headers = authHeaders()
        const devKey = import.meta.env.DEV
          ? (import.meta.env.VITE_AGENT_KEY as string | undefined)
          : undefined
        if (devKey && !headers.has('X-Telegram-Init-Data')) {
          headers.set('X-Agent-Key', devKey)
        }
        const res = await fetch(`${API_BASE}/mcp`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'my_balance', arguments: {} },
          }),
        })
        const d = await res.json()
        const bal = d?.result?.structuredContent?.['баланс_токенов']
        if (typeof bal === 'number') setTokens(bal)

        // The cashier's webhook sleeps from time to time (the bot polls), so a
        // payment made past verify would hang uncredited. A quiet verify on
        // entry settles a forgotten invoice from the last visit, against
        // getStarTransactions rather than against anyone's word.
        try {
          const vres = await fetch(`${API_BASE}/api/tokens/verify`, {
            method: 'POST',
            headers,
          })
          const vd = await vres.json()
          if (vd?.ok) {
            setTokens(vd['баланс'])
            setTopUpNote(
              `Зачислено ${vd['зачислено_токенов']} токенов — оплата прошлого визита дошла`
            )
          }
        } catch {
          /* the automatic verify is background work: silence is normal */
        }
      } catch {
        /* the balance is decoration, never a blocker */
      }
    })()
  }, [])

  return { tokens, note: topUpNote, buy }
}
