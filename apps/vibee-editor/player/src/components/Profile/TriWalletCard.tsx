import { useCallback, useEffect, useRef, useState } from 'react'
import type { TonConnectUI } from '@tonconnect/ui'
import { useLanguage } from '@/hooks/useLanguage'
import type { ApiError } from '@/lib/apiFetch'
import {
  bindTriWallet,
  issueTriChallenge,
  listTriWallets,
  proofBody,
  triWalletErrorKey,
  unbindTriWallet,
  TON_MANIFEST_PATH,
  type BoundTriWallet,
  type ProvedWallet,
} from '@/lib/triWallet'

/**
 * THE TRI WALLET, ON THE OWN PROFILE (render src/tri-wallet.ts).
 *
 * A person binds the TON address their TRI would be paid to. The card says
 * what is true today: TRI is not deployed, so binding pays nothing -- it only
 * records, with the wallet's own signature, where TRI would go.
 *
 * TON CONNECT IS LOADED ON THE PRESS, NOT WITH THE PAGE. The library is
 * several megabytes unpacked and almost nobody opening a profile is binding
 * a wallet; a dynamic import keeps it in its own chunk.
 *
 * ONE PROOF, THEN LET GO. After the server accepts (or refuses) the proof the
 * TON Connect session is disconnected: the app never sends transactions, so a
 * live session would only be a standing permission nothing uses.
 */

let shared: Promise<TonConnectUI> | null = null

function tonConnect(lang: string): Promise<TonConnectUI> {
  if (!shared) {
    shared = import('@tonconnect/ui').then(
      ({ TonConnectUI }) =>
        new TonConnectUI({
          manifestUrl: `${window.location.origin}${TON_MANIFEST_PATH}`,
          language: lang === 'ru' ? 'ru' : 'en',
          restoreConnection: false,
        })
    )
    shared.catch(() => {
      shared = null
    })
  }
  return shared
}

export interface TriWalletCardProps {
  isOwn: boolean
}

export function TriWalletCard({ isOwn }: TriWalletCardProps) {
  const { t, lang } = useLanguage()
  const [wallets, setWallets] = useState<BoundTriWallet[] | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cleanup = useRef<(() => void) | null>(null)

  const reload = useCallback(async () => {
    try {
      setWallets(await listTriWallets())
    } catch {
      // Not answered: draw nothing rather than "no wallet bound".
      setWallets(undefined)
    }
  }, [])

  useEffect(() => {
    if (isOwn) void reload()
    return () => cleanup.current?.()
  }, [isOwn, reload])

  const finish = useCallback(async (ui: TonConnectUI) => {
    cleanup.current?.()
    cleanup.current = null
    if (ui.connected) await ui.disconnect().catch(() => undefined)
    setBusy(false)
  }, [])

  const bind = useCallback(async () => {
    setBusy(true)
    setError(null)
    let ui: TonConnectUI
    try {
      ui = await tonConnect(lang)
      if (ui.connected) await ui.disconnect()
      const payload = await issueTriChallenge()
      ui.setConnectRequestParameters({
        state: 'ready',
        value: { tonProof: payload },
      })
    } catch (e) {
      setError(t(triWalletErrorKey((e as ApiError).code)))
      setBusy(false)
      return
    }

    const offStatus = ui.onStatusChange(
      wallet => {
        if (!wallet) return
        const body = proofBody(wallet as unknown as ProvedWallet)
        if (!body) {
          setError(t('tri.wallet.err.noproof'))
          void finish(ui)
          return
        }
        bindTriWallet(body)
          .then(() => reload())
          .catch(e => setError(t(triWalletErrorKey((e as ApiError).code))))
          .finally(() => void finish(ui))
      },
      () => {
        setError(t('tri.wallet.err.generic'))
        void finish(ui)
      }
    )
    const offModal = ui.onModalStateChange(state => {
      if (state.status === 'closed' && state.closeReason === 'action-cancelled')
        void finish(ui)
    })
    cleanup.current = () => {
      offStatus()
      offModal()
    }
    await ui.openModal()
  }, [finish, lang, reload, t])

  const unbind = useCallback(
    async (w: BoundTriWallet) => {
      setBusy(true)
      setError(null)
      try {
        await unbindTriWallet(w.network)
        await reload()
      } catch (e) {
        setError(t(triWalletErrorKey((e as ApiError).code)))
      } finally {
        setBusy(false)
      }
    },
    [reload, t]
  )

  if (!isOwn || wallets === undefined) return null
  return (
    <section className="profile-topup" data-testid="profile-tri-wallet">
      <h3 className="profile-topup__title">{t('tri.wallet.title')}</h3>
      <p className="profile-topup__note">{t('tri.wallet.note')}</p>
      {wallets.length > 0 && (
        <ul className="profile-bots__list">
          {wallets.map(w => (
            <li className="profile-bots__item" key={w.network}>
              <span className="profile-bots__name">
                {w.network === '-3' ? t('tri.wallet.testnet') : 'TON'}
              </span>
              <code className="profile-bots__state">{w.friendly}</code>
              <button
                type="button"
                className="profile-topup__other"
                disabled={busy}
                onClick={() => void unbind(w)}
              >
                {t('tri.wallet.unbind')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="profile-topup__others">
        <button
          type="button"
          className="profile-topup__pack"
          disabled={busy}
          onClick={() => void bind()}
        >
          {wallets.length > 0 ? t('tri.wallet.rebind') : t('tri.wallet.bind')}
        </button>
      </div>
      {error && (
        <p className="profile-topup__note" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
