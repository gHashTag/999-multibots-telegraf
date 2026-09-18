/**
 * A WAY TO PAY ON THE SCREEN THAT SHOWS THE BALANCE.
 *
 * Measured 2026-09-17: the profile is 260 lines and does not call the token
 * routes once. The only working top-up in the product lived inside the chat, so
 * a person who opened their profile to look at their balance could see the
 * number and had nothing to press.
 *
 * The flow itself is not reimplemented here -- it is `useTokenTopUp`, the same
 * hook the chat now uses. Two implementations is how one of them quietly stops
 * verifying the credit.
 *
 * THE PRICES COME FROM THE SERVER. The chat's buttons carry a copy of the
 * three packs, and a copy of a price is a price that will be wrong one day; the
 * landing already learned this and reads /api/tokens/packs instead. No answer
 * means no prices shown, never invented ones.
 */
import { useEffect, useState } from 'react'
import { API_BASE } from '@/config'
import { useLanguage } from '@/hooks/useLanguage'

/** The bot that holds the rouble and crypto cashiers. */
const BOT = 't27ai_bot'

interface Pack {
  id: string
  tokens: number
  stars: number
}

function toPack(raw: Record<string, unknown>): Pack {
  return {
    id: String(raw.id ?? raw['токенов'] ?? ''),
    tokens: Number(raw['токенов'] ?? raw.tokens ?? 0),
    stars: Number(raw['звёзд'] ?? raw.stars ?? 0),
  }
}

export interface TokenTopUpCardProps {
  tokens: number | null
  note: string | null
  buy: (pack: string) => void
}

/**
 * Open the bot at a cashier. Telegram's own opener when the mini app is running
 * inside Telegram, a plain link otherwise -- the same page opened in a browser
 * has no Telegram to ask.
 */
function openInBot(startParam: string) {
  const url = `https://t.me/${BOT}?start=${startParam}`
  const wa = (
    window as unknown as {
      Telegram?: { WebApp?: { openTelegramLink?: (u: string) => void } }
    }
  ).Telegram?.WebApp
  if (wa?.openTelegramLink) wa.openTelegramLink(url)
  else window.open(url, '_blank')
}

export function TokenTopUpCard({ tokens, note, buy }: TokenTopUpCardProps) {
  const { t } = useLanguage()
  const [packs, setPacks] = useState<Pack[] | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/tokens/packs`)
        const d = await res.json()
        const raw = d?.['пакеты']
        if (alive && Array.isArray(raw)) {
          setPacks(
            raw
              .map(x => toPack(x as Record<string, unknown>))
              .filter(p => p.tokens > 0 && p.stars > 0)
              // Biggest first: the large pack makes the middle one read as the
              // sensible choice, and its price per token really is the lowest.
              .sort((a, b) => b.tokens - a.tokens)
          )
        }
      } catch {
        /* no answer means no price shown, never an invented one */
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const best = packs?.length
    ? packs.reduce((a, b) => (a.stars / a.tokens <= b.stars / b.tokens ? a : b))
    : null

  return (
    <section className="profile-topup" data-testid="profile-topup">
      <h3 className="profile-topup__title">
        {tokens === null
          ? t('topup.balance')
          : `${tokens} ${t('topup.tokens')}`}
      </h3>
      {packs === null && (
        <p className="profile-topup__note">{t('topup.loading')}</p>
      )}
      {packs?.length === 0 && (
        <p className="profile-topup__note">{t('topup.unavailable')}</p>
      )}
      <div className="profile-topup__packs">
        {(packs ?? []).map(p => (
          <button
            key={p.id || p.tokens}
            type="button"
            className="profile-topup__pack"
            onClick={() => buy(p.id || String(p.tokens))}
          >
            {p.tokens} {t('topup.tokens')}
            {best && p.id === best.id ? ` · ${t('topup.best')}` : ''}
            <span>{p.stars} ⭐</span>
          </button>
        ))}
      </div>
      {note && <p className="profile-topup__note">{note}</p>}

      {/*
        ALL THREE WAYS TO PAY, AND TWO OF THEM FINISH IN THE BOT.
        Owner, 2026-09-17: "add all three payment types to the mini app". Stars
        are paid right here; the Robokassa and CryptoBot keys live on the BOT
        service, and copying payment secrets into a second service to move the
        window is a bigger decision than a button. So these open the cashier the
        bot already has -- `?start=topup_rub` lands on it, which /start was
        taught to read, rather than on a greeting to navigate out of.
      */}
      <div className="profile-topup__others">
        <button
          type="button"
          className="profile-topup__other"
          onClick={() => openInBot('topup_rub')}
        >
          💳 {t('topup.rubles')}
        </button>
        <button
          type="button"
          className="profile-topup__other"
          onClick={() => openInBot('topup_crypto')}
        >
          💎 {t('topup.crypto')}
        </button>
      </div>
      <p className="profile-topup__note">{t('topup.inTheBot')}</p>
    </section>
  )
}
