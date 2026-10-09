import { useState } from 'react'
import { useLanguage } from '@/hooks/useLanguage'
import type { ApiError } from '@/lib/apiFetch'
import { triWalletErrorKey } from '@/lib/triWallet'
import {
  findSigner,
  proposeSigned,
  readHandoff,
  signWith,
} from '@/lib/triChains'
import '@/components/Profile/Profile.css'

/**
 * THE WALLET APP'S OWN BROWSER: /tri/bind#c=<chain>&n=<nonce>
 * (spec automation/tri-wallet-chains.t27 HANDOFF_PATH).
 *
 * The profile card opened this page in MetaMask, Phantom, Trust, OKX or
 * another wallet's browser, because Telegram has no EVM, Solana or TRON
 * wallet inside it. The page carries no person -- no Telegram, no session --
 * and needs none: it asks the server for the text, has the injected wallet
 * sign it, and sends a PROPOSAL tied to the nonce in its own fragment. The
 * binding happens only when the person presses "Yes, this is my wallet" back
 * in the card. So this page can be opened by anybody holding the link and
 * still bind nothing.
 *
 * Safe to mount alone: it reads no profile, gate or Telegram state.
 */
export default function TriBindPage() {
  const { t } = useLanguage()
  const handoff = readHandoff(window.location.hash)
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'nowallet'>(
    'idle'
  )
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    if (!handoff) return
    setState('busy')
    setError(null)
    try {
      const signer = await findSigner(handoff.chain)
      if (!signer) {
        setState('nowallet')
        return
      }
      await proposeSigned(await signWith(signer, handoff.chain, handoff.nonce))
      setState('done')
    } catch (e) {
      setError(t(triWalletErrorKey((e as ApiError)?.code)))
      setState('idle')
    }
  }

  const chain = handoff
    ? { evm: 'EVM', solana: 'Solana', tron: 'TRON' }[handoff.chain]
    : ''

  return (
    <main className="profile-topup" data-testid="tri-bind">
      {!handoff ? (
        <p className="profile-topup__note" role="alert">
          {t('tri.bind.broken')}
        </p>
      ) : (
        <>
          <h3 className="profile-topup__title">
            {t('tri.bind.title', { chain })}
          </h3>
          <p className="profile-topup__note">{t('tri.bind.note')}</p>
          {state === 'done' ? (
            <p className="profile-topup__note" role="status">
              {t('tri.bind.done')}
            </p>
          ) : (
            <div className="profile-topup__others">
              <button
                type="button"
                className="profile-topup__pack"
                disabled={state === 'busy'}
                onClick={() => void run()}
              >
                {t('tri.bind.sign')}
              </button>
            </div>
          )}
          {state === 'nowallet' && (
            <p className="profile-topup__note" role="alert">
              {t('tri.bind.nowallet', { chain })}
            </p>
          )}
          {error && (
            <p className="profile-topup__note" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </main>
  )
}
