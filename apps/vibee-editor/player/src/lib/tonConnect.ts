import type { TonConnectUI } from '@tonconnect/ui'
import { TON_MANIFEST_PATH } from '@/lib/triWallet'

/**
 * ONE TonConnectUI PER PAGE, LOADED ON THE FIRST PRESS.
 *
 * The library is several megabytes unpacked and almost nobody opening a
 * profile touches a wallet; a dynamic import keeps it in its own chunk. TON
 * Connect allows one UI instance per page, so the wallet card and the claim
 * card share this one.
 */

let shared: Promise<TonConnectUI> | null = null

export function tonConnect(lang: string): Promise<TonConnectUI> {
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
