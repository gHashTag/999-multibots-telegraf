import { useCallback, useEffect, useRef, useState } from 'react'
import type { TonConnectUI } from '@tonconnect/ui'
import { useLanguage } from '@/hooks/useLanguage'
import type { ApiError } from '@/lib/apiFetch'
import {
  bindTriWallet,
  issueTriChallenge,
  proofBody,
  readTriWallets,
  triWalletErrorKey,
  unbindTriWallet,
  type BoundTriWallet,
  type ProvedWallet,
  type TriProposal,
} from '@/lib/triWallet'
import {
  TEXT_CHAINS,
  WALLET_APPS,
  bindSigned,
  confirmProposal,
  findSigner,
  handoffUrl,
  openOutside,
  signWith,
  type TextChain,
} from '@/lib/triChains'
import { tonConnect } from '@/lib/tonConnect'

/**
 * THE TRI WALLET, ON THE OWN PROFILE, ON EVERY CHAIN (render src/tri-wallet.ts,
 * spec automation/tri-wallet-chains.t27).
 *
 * A person binds where their TRI is paid: TON, EVM (one address for every
 * EVM chain), Solana and TRON, each by the wallet's own signature. The card
 * says what is true today: TRI is paid on TON testnet only; a bound address on
 * another chain is where TRI goes once the bridge is live, and each row says
 * which of the two it is (`paid`, from the server).
 *
 * TON CONNECT IS LOADED ON THE PRESS, NOT WITH THE PAGE (lib/tonConnect.ts).
 * ONE PROOF, THEN LET GO: the TON Connect session is disconnected after the
 * server answers. The claim card connects again for a mint (TriClaimCard.tsx).
 *
 * EVM, SOLANA, TRON (lib/triChains.ts). A wallet injected in this browser
 * signs and binds at once. Inside Telegram there is none, so the card opens
 * the wallet app's own browser on /tri/bind with a fresh nonce, waits for the
 * proposal that page sends, and shows the address with one button to say it
 * is theirs. Nothing binds without that press.
 */

export interface TriWalletCardProps {
  isOwn: boolean
}

/** How often the card looks for the wallet browser's proposal. */
const PROPOSAL_POLL_MS = 3000

const CHAIN_LABEL: Record<TextChain, string> = {
  evm: 'EVM',
  solana: 'Solana',
  tron: 'TRON',
}

export function TriWalletCard({ isOwn }: TriWalletCardProps) {
  const { t, lang } = useLanguage()
  const [wallets, setWallets] = useState<BoundTriWallet[] | undefined>()
  const [proposals, setProposals] = useState<TriProposal[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** The chain whose wallet-app links are open, with the nonce they carry. */
  const [handoff, setHandoff] = useState<{
    chain: TextChain
    url: string
  } | null>(null)
  const [copied, setCopied] = useState(false)
  const cleanup = useRef<(() => void) | null>(null)

  const reload = useCallback(async () => {
    try {
      const r = await readTriWallets()
      setWallets(r.wallets)
      setProposals(r.proposals)
      return r
    } catch {
      // Not answered: draw nothing rather than "no wallet bound".
      setWallets(undefined)
      return null
    }
  }, [])

  useEffect(() => {
    if (isOwn) void reload()
    return () => cleanup.current?.()
  }, [isOwn, reload])

  // While the wallet app is open, the proposal arrives on its own.
  useEffect(() => {
    if (!handoff) return
    const timer = setInterval(() => {
      void reload().then(r => {
        if (r?.proposals.length) setHandoff(null)
      })
    }, PROPOSAL_POLL_MS)
    return () => clearInterval(timer)
  }, [handoff, reload])

  const fail = useCallback(
    (e: unknown) => setError(t(triWalletErrorKey((e as ApiError)?.code))),
    [t]
  )

  const finish = useCallback(async (ui: TonConnectUI) => {
    cleanup.current?.()
    cleanup.current = null
    if (ui.connected) await ui.disconnect().catch(() => undefined)
    setBusy(false)
  }, [])

  const bindTon = useCallback(async () => {
    setBusy(true)
    setError(null)
    setHandoff(null)
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
      fail(e)
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
          .catch(fail)
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
  }, [fail, finish, lang, reload, t])

  const bindText = useCallback(
    async (chain: TextChain) => {
      setBusy(true)
      setError(null)
      setCopied(false)
      try {
        const nonce = await issueTriChallenge()
        const signer = await findSigner(chain)
        if (signer) {
          await bindSigned(await signWith(signer, chain, nonce))
          setHandoff(null)
          await reload()
        } else {
          setHandoff({ chain, url: handoffUrl(chain, nonce) })
        }
      } catch (e) {
        fail(e)
      } finally {
        setBusy(false)
      }
    },
    [fail, reload]
  )

  const confirm = useCallback(
    async (p: TriProposal) => {
      setBusy(true)
      setError(null)
      try {
        await confirmProposal(p.nonce)
        await reload()
      } catch (e) {
        fail(e)
      } finally {
        setBusy(false)
      }
    },
    [fail, reload]
  )

  const unbind = useCallback(
    async (w: BoundTriWallet) => {
      setBusy(true)
      setError(null)
      try {
        await unbindTriWallet(w.network, w.chain)
        await reload()
      } catch (e) {
        fail(e)
      } finally {
        setBusy(false)
      }
    },
    [fail, reload]
  )

  const copy = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }, [])

  if (!isOwn || wallets === undefined) return null

  const nameOf = (w: BoundTriWallet) =>
    w.chain === 'ton'
      ? w.network === '-3'
        ? t('tri.wallet.testnet')
        : 'TON'
      : w.chain === 'evm'
        ? t('tri.wallet.chain.evm')
        : CHAIN_LABEL[w.chain]
  const hasTon = wallets.some(w => w.chain === 'ton')

  return (
    <section className="profile-topup" data-testid="profile-tri-wallet">
      <h3 className="profile-topup__title">{t('tri.wallet.title')}</h3>
      <p className="profile-topup__note">{t('tri.wallet.note')}</p>
      {wallets.length > 0 && (
        <ul className="profile-bots__list">
          {wallets.map(w => (
            <li
              className="profile-bots__item"
              key={`${w.chain}:${w.network}`}
              data-chain={w.chain}
            >
              <span className="profile-bots__name">{nameOf(w)}</span>
              <code className="profile-bots__state">{w.friendly}</code>
              <span className="profile-bots__why">
                {w.paid ? t('tri.wallet.paid') : t('tri.wallet.bridge')}
              </span>
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
      {proposals.map(p => (
        <div
          className="profile-topup__others"
          key={p.nonce}
          data-testid="tri-wallet-proposal"
        >
          <p className="profile-topup__note">
            {t('tri.wallet.proposal', {
              chain: CHAIN_LABEL[p.chain],
              address: p.address,
            })}
          </p>
          <button
            type="button"
            className="profile-topup__pack"
            disabled={busy}
            onClick={() => void confirm(p)}
          >
            {t('tri.wallet.proposal.confirm')}
          </button>
          <p className="profile-topup__note">{t('tri.wallet.proposal.note')}</p>
        </div>
      ))}
      <div className="profile-topup__others">
        <button
          type="button"
          className="profile-topup__pack"
          disabled={busy}
          onClick={() => void bindTon()}
        >
          {hasTon ? t('tri.wallet.rebind') : t('tri.wallet.bind')}
        </button>
        {TEXT_CHAINS.map(chain => (
          <button
            key={chain}
            type="button"
            className="profile-topup__pack"
            data-chain={chain}
            disabled={busy}
            onClick={() => void bindText(chain)}
          >
            {t(`tri.wallet.bind.${chain}`)}
          </button>
        ))}
      </div>
      {handoff && (
        <div className="profile-topup__others" data-testid="tri-wallet-open">
          <p className="profile-topup__note">
            {t('tri.wallet.open.note', { chain: CHAIN_LABEL[handoff.chain] })}
          </p>
          {WALLET_APPS[handoff.chain].map(app => (
            <button
              key={app.name}
              type="button"
              className="profile-topup__other"
              onClick={() => openOutside(app.link(handoff.url))}
            >
              {app.name}
            </button>
          ))}
          <button
            type="button"
            className="profile-topup__other"
            onClick={() => void copy(handoff.url)}
          >
            {copied ? t('tri.wallet.open.copied') : t('tri.wallet.open.copy')}
          </button>
          <p className="profile-topup__note">{t('tri.wallet.open.waiting')}</p>
        </div>
      )}
      {error && (
        <p className="profile-topup__note" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
