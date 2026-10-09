import { useCallback, useEffect, useRef, useState } from 'react'
import type { TonConnectUI } from '@tonconnect/ui'
import { useLanguage } from '@/hooks/useLanguage'
import type { ApiError } from '@/lib/apiFetch'
import {
  buildTriClaim,
  buildTriClaimBatch,
  listTriClaims,
  pollGithubLink,
  startGithubLink,
  triClaimErrorKey,
  unlinkGithub,
  walletMaxMessages,
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
 *
 * WITHDRAW ALL (spec automation/tri-claim-batch.t27). One press: the card
 * picks every earning that is neither revoked nor sent, oldest first, asks
 * the server for batchMax of them at a time, and sends the messages perTx in
 * one wallet transaction (the wallet's own limit). A cancelled prompt ends
 * the run; already-minted earnings count as done.
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
  const [progress, setProgress] = useState<{
    done: number
    total: number
  } | null>(null)
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

  const withdrawAll = useCallback(async () => {
    if (!claims) return
    setError(null)
    setBusy('all')
    // Spec selectable: neither revoked nor sent; oldest first.
    const queue = claims.earnings
      .filter(e => !e.revokedAt && !sent.has(e.workId))
      .sort((a, b) => a.acceptedAt.localeCompare(b.acceptedAt))
      .map(e => e.workId)
    const total = queue.length
    let done = 0
    setProgress({ done, total })
    let ui: TonConnectUI | null = null
    try {
      ui = await tonConnect(lang)
      await walletConnected(ui)
      const walletMax = walletMaxMessages(ui.wallet)
      while (queue.length) {
        const b = await buildTriClaimBatch(
          queue.slice(0, claims.batchMax ?? queue.length),
          walletMax
        )
        const touched = new Set([
          ...b.messages.map(m => m.workId),
          ...b.refused.map(r => r.workId),
        ])
        // Spec continue_after: a batch that built and refused nothing ends it.
        if (!touched.size) break
        for (let i = queue.length - 1; i >= 0; i--)
          if (touched.has(queue[i])) queue.splice(i, 1)
        const minted = b.refused
          .filter(r => r.code === 'already_minted')
          .map(r => r.workId)
        done += minted.length
        setSent(s => new Set([...s, ...minted]))
        for (let i = 0; i < b.messages.length; i += b.perTx) {
          const chunk = b.messages.slice(i, i + b.perTx)
          await ui.sendTransaction({
            validUntil: b.validUntil,
            network: b.network,
            messages: chunk.map(({ address, amount, payload }) => ({
              address,
              amount,
              payload,
            })),
          })
          done += chunk.length
          setSent(s => new Set([...s, ...chunk.map(m => m.workId)]))
          setProgress({ done, total })
        }
      }
    } catch (err) {
      const c = (err as ApiError).code
      // Closing the wallet is the person's answer and ends the run.
      if (c || !/cancel|reject/i.test(String((err as Error).message)))
        setError(t(triClaimErrorKey(c)))
    } finally {
      if (ui?.connected) await ui.disconnect().catch(() => undefined)
      setBusy(null)
      setProgress({ done, total })
      await reload()
    }
  }, [claims, lang, reload, sent, t])

  if (!isOwn || claims === undefined) return null
  const tri = claims.triPerSpec ?? 0
  const pendingCount = claims.earnings.filter(
    e => !e.revokedAt && !sent.has(e.workId)
  ).length
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
      {claims.github && claims.wallet && pendingCount > 0 && (
        <div className="profile-topup__others" data-testid="tri-claim-all">
          <button
            type="button"
            className="profile-topup__pack"
            disabled={busy !== null}
            onClick={() => void withdrawAll()}
          >
            {busy === 'all'
              ? t('tri.claim.working')
              : t('tri.claim.all', { n: pendingCount })}
          </button>
          <p className="profile-topup__note">
            {t('tri.claim.all.note', {
              ton: String(
                (pendingCount * (claims.mintValueMilliton ?? 0)) / 1000
              ),
            })}
          </p>
        </div>
      )}
      {progress && (
        <p className="profile-topup__note" role="status">
          {t('tri.claim.all.progress', {
            done: progress.done,
            total: progress.total,
          })}
        </p>
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
