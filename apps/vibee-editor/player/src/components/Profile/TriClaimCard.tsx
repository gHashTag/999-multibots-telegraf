import { useCallback, useEffect, useRef, useState } from 'react'
import type { TonConnectUI } from '@tonconnect/ui'
import { useLanguage } from '@/hooks/useLanguage'
import type { ApiError } from '@/lib/apiFetch'
import {
  buildTriClaim,
  listTriClaims,
  pollGithubLink,
  startGithubLink,
  triClaimErrorKey,
  unlinkGithub,
  type GithubCode,
  type TriClaims,
  type TriEarning,
} from '@/lib/triClaim'
import { tonConnect } from '@/lib/tonConnect'

/**
 * TRI FOR ACCEPTED SPECS, ON THE OWN PROFILE (render src/tri-claim.ts).
 *
 * The author links the GitHub account Queen credits, then presses Withdraw on
 * an accepted spec. The server gathers the attestors' signatures and returns
 * one message; the author's own wallet signs it in TON Connect and pays the
 * gas. This app holds no key that can mint, and never sends on its own.
 *
 * Says what it is on its face: testnet only, V1, signer quorum, NOT
 * trustless.
 */

/** Connects a wallet for one send, without a proof: the payee is already bound. */
function walletConnected(ui: TonConnectUI): Promise<void> {
  if (ui.connected) return Promise.resolve()
  ui.setConnectRequestParameters(null)
  return new Promise((resolve, reject) => {
    let offModal = () => {}
    const offStatus = ui.onStatusChange(
      wallet => {
        if (!wallet) return
        offStatus()
        offModal()
        resolve()
      },
      e => {
        offStatus()
        offModal()
        reject(e)
      }
    )
    offModal = ui.onModalStateChange(state => {
      if (
        state.status === 'closed' &&
        state.closeReason === 'action-cancelled'
      ) {
        offStatus()
        offModal()
        reject(new Error('cancelled'))
      }
    })
    void ui.openModal()
  })
}

export interface TriClaimCardProps {
  isOwn: boolean
}

export function TriClaimCard({ isOwn }: TriClaimCardProps) {
  const { t, lang } = useLanguage()
  const [claims, setClaims] = useState<TriClaims | undefined>()
  const [code, setCode] = useState<GithubCode | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [sent, setSent] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reload = useCallback(async () => {
    try {
      setClaims(await listTriClaims())
    } catch {
      // Not answered: draw nothing rather than "nothing to claim".
      setClaims(undefined)
    }
  }, [])

  const stopPolling = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])

  useEffect(() => {
    if (isOwn) void reload()
    return stopPolling
  }, [isOwn, reload, stopPolling])

  const poll = useCallback(
    (afterS: number) => {
      stopPolling()
      timer.current = setTimeout(async () => {
        try {
          const r = await pollGithubLink()
          if (r.state === 'pending') return poll(r.interval)
          setCode(null)
          await reload()
        } catch (e) {
          setCode(null)
          setError(t(triClaimErrorKey((e as ApiError).code)))
        }
      }, afterS * 1000)
    },
    [reload, stopPolling, t]
  )

  const link = useCallback(async () => {
    setError(null)
    setBusy('github')
    try {
      const c = await startGithubLink()
      setCode(c)
      poll(c.interval)
    } catch (e) {
      setError(t(triClaimErrorKey((e as ApiError).code)))
    } finally {
      setBusy(null)
    }
  }, [poll, t])

  const unlink = useCallback(async () => {
    setError(null)
    setBusy('github')
    try {
      await unlinkGithub()
      await reload()
    } catch (e) {
      setError(t(triClaimErrorKey((e as ApiError).code)))
    } finally {
      setBusy(null)
    }
  }, [reload, t])

  const withdraw = useCallback(
    async (e: TriEarning) => {
      setError(null)
      setBusy(e.workId)
      let ui: TonConnectUI | null = null
      try {
        const built = await buildTriClaim(e.workId)
        ui = await tonConnect(lang)
        await walletConnected(ui)
        await ui.sendTransaction({
          validUntil: built.validUntil,
          network: built.network,
          messages: [built.message],
        })
        setSent(s => new Set(s).add(e.workId))
        await reload()
      } catch (err) {
        const c = (err as ApiError).code
        // Closing the wallet is the person's answer, not a fault.
        if (c || !/cancel|reject/i.test(String((err as Error).message)))
          setError(t(triClaimErrorKey(c)))
      } finally {
        if (ui?.connected) await ui.disconnect().catch(() => undefined)
        setBusy(null)
      }
    },
    [lang, reload, t]
  )

  if (!isOwn || claims === undefined) return null
  const tri = claims.triPerSpec ?? 0
  return (
    <section className="profile-topup" data-testid="profile-tri-claim">
      <h3 className="profile-topup__title">{t('tri.claim.title')}</h3>
      <p className="profile-topup__note">{t('tri.claim.status')}</p>

      {claims.github ? (
        <div className="profile-topup__others">
          <span className="profile-bots__name">
            {t('tri.claim.github.as', { login: claims.github.login })}
          </span>
          <button
            type="button"
            className="profile-topup__other"
            disabled={busy !== null}
            onClick={() => void unlink()}
          >
            {t('tri.claim.github.unlink')}
          </button>
        </div>
      ) : code ? (
        <div className="profile-topup__note" data-testid="tri-github-code">
          <p>{t('tri.claim.github.enter')}</p>
          <p>
            <code className="profile-bots__state">{code.userCode}</code>
          </p>
          <a
            href={code.verificationUri}
            target="_blank"
            rel="noopener noreferrer"
          >
            {code.verificationUri}
          </a>
        </div>
      ) : (
        <div className="profile-topup__others">
          <p className="profile-topup__note">{t('tri.claim.github.why')}</p>
          <button
            type="button"
            className="profile-topup__pack"
            disabled={busy !== null}
            onClick={() => void link()}
          >
            {t('tri.claim.github.link')}
          </button>
        </div>
      )}

      {claims.github && !claims.wallet && (
        <p className="profile-topup__note">{t('tri.claim.needWallet')}</p>
      )}
      {claims.github && claims.earnings.length === 0 && (
        <p className="profile-topup__note">{t('tri.claim.empty')}</p>
      )}
      {claims.earnings.length > 0 && (
        <ul className="profile-bots__list">
          {claims.earnings.map(e => (
            <li className="profile-bots__item" key={e.workId}>
              <span className="profile-bots__name">
                {e.repo.split('/')[1] ?? e.repo} #{e.issue}
              </span>
              <code className="profile-bots__state">{tri} TRI</code>
              <button
                type="button"
                className="profile-topup__pack"
                disabled={
                  busy !== null || !claims.wallet || Boolean(e.revokedAt)
                }
                onClick={() => void withdraw(e)}
              >
                {busy === e.workId
                  ? t('tri.claim.working')
                  : sent.has(e.workId)
                    ? t('tri.claim.sent')
                    : t('tri.claim.withdraw')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {sent.size > 0 && (
        <p className="profile-topup__note">{t('tri.claim.sentNote')}</p>
      )}
      {error && (
        <p className="profile-topup__note" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
