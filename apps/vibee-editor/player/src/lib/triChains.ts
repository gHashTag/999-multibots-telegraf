import { API_BASE } from '@/config'
import { apiFetch } from '@/lib/apiFetch'
import { getWebApp } from '@/lib/telegram'

/**
 * TRI WALLETS ON EVM, SOLANA AND TRON (render src/tri-wallet-chains.ts, spec
 * automation/tri-wallet-chains.t27).
 *
 * TON keeps TON Connect (lib/tonConnect.ts). These three sign TEXT: the
 * server prints it (/api/tri/wallet/message), the wallet signs it, the server
 * rebuilds it and checks the signature against the key the address fixes.
 * The client never composes the text, so it cannot drift from the server's.
 *
 * TWO ROADS, ONE PROOF.
 *
 *   Here      a wallet is injected in this browser (a desktop extension, or
 *             the app opened inside the wallet with a session): sign and bind
 *             at once.
 *   Wallet's  Telegram has no such wallet inside it. The card opens the
 *   browser   wallet's OWN browser at HANDOFF_PATH with the nonce in the
 *             fragment -- a fragment never reaches a server log. That page
 *             (pages/TriBind.tsx) can only PROPOSE; the person confirms the
 *             address back in the card.
 */

export type TextChain = 'evm' | 'solana' | 'tron'
export const TEXT_CHAINS: readonly TextChain[] = ['evm', 'solana', 'tron']

/** The spec's HANDOFF_PATH; the render's spec test holds this file to it. */
export const HANDOFF_PATH = '/tri/bind'

const WALLET_URL = `${API_BASE}/api/tri/wallet`

export function handoffUrl(
  chain: TextChain,
  nonce: string,
  origin = window.location.origin
): string {
  return `${origin}${HANDOFF_PATH}#c=${chain}&n=${nonce}`
}

/** What the wallet-browser page reads from its own address. */
export function readHandoff(
  hash: string
): { chain: TextChain; nonce: string } | null {
  const p = new URLSearchParams(hash.replace(/^#/, ''))
  const chain = p.get('c') as TextChain | null
  const nonce = p.get('n') ?? ''
  if (!chain || !TEXT_CHAINS.includes(chain)) return null
  if (!/^[0-9a-f]+$/.test(nonce)) return null
  return { chain, nonce }
}

// ---------------------------------------------------------------------------
// Wallet apps a phone can open the page in
// ---------------------------------------------------------------------------

export interface WalletApp {
  name: string
  link: (url: string) => string
}

const enc = encodeURIComponent

const METAMASK: WalletApp = {
  name: 'MetaMask',
  // MetaMask opens https:// + everything after /dapp/, the fragment included.
  link: url =>
    `https://metamask.app.link/dapp/${url.replace(/^https?:\/\//, '')}`,
}
const trust = (coinId: number): WalletApp => ({
  name: 'Trust Wallet',
  link: url =>
    `https://link.trustwallet.com/open_url?coin_id=${coinId}&url=${enc(url)}`,
})
const OKX: WalletApp = {
  name: 'OKX Wallet',
  link: url =>
    `https://www.okx.com/download?deeplink=${enc(`okx://wallet/dapp/url?dappUrl=${enc(url)}`)}`,
}
const COINBASE: WalletApp = {
  name: 'Coinbase Wallet',
  link: url => `https://go.cb-w.com/dapp?cb_url=${enc(url)}`,
}
const PHANTOM: WalletApp = {
  name: 'Phantom',
  link: url =>
    `https://phantom.app/ul/browse/${enc(url)}?ref=${enc(new URL(url).origin)}`,
}
const SOLFLARE: WalletApp = {
  name: 'Solflare',
  link: url =>
    `https://solflare.com/ul/v1/browse/${enc(url)}?ref=${enc(new URL(url).origin)}`,
}

/** SLIP-44 coin ids Trust Wallet opens its browser on: ETH, SOL, TRX. */
export const WALLET_APPS: Record<TextChain, WalletApp[]> = {
  evm: [METAMASK, trust(60), OKX, COINBASE],
  solana: [PHANTOM, SOLFLARE, trust(501), OKX],
  // TronLink's own link is a custom scheme Telegram will not open; inside
  // TronLink the copied link works.
  tron: [trust(195), OKX],
}

export function openOutside(url: string): void {
  const wa = getWebApp()
  if (wa && typeof wa.openLink === 'function') wa.openLink(url)
  else window.open(url, '_blank', 'noopener')
}

// ---------------------------------------------------------------------------
// Wallets injected into this browser
// ---------------------------------------------------------------------------

interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
}
interface SolanaProvider {
  connect(): Promise<{ publicKey: { toString(): string } } | void>
  publicKey?: { toString(): string } | null
  signMessage(
    message: Uint8Array,
    encoding?: string
  ): Promise<{ signature: Uint8Array } | Uint8Array>
}
interface TronWebLike {
  defaultAddress?: { base58?: string | false }
  trx: { signMessageV2(message: string): Promise<string> }
}
interface TronLinkLike {
  request?(args: { method: string }): Promise<unknown>
  tronWeb?: TronWebLike
}

/** A wallet that can give an address and sign this chain's text. */
export interface Signer {
  address(): Promise<string>
  sign(message: string, address: string): Promise<string>
}

type W = Window & {
  ethereum?: Eip1193
  phantom?: { solana?: SolanaProvider }
  solflare?: SolanaProvider
  solana?: SolanaProvider
  okxwallet?: { solana?: SolanaProvider; tronLink?: TronLinkLike }
  tronLink?: TronLinkLike
  tronWeb?: TronWebLike
}

/** EIP-6963: wallets announce themselves; the first one answers for EVM. */
function announcedEvm(timeoutMs: number): Promise<Eip1193 | null> {
  return new Promise(resolve => {
    let done = false
    const take = (e: Event) => {
      const p = (e as CustomEvent<{ provider?: Eip1193 }>).detail?.provider
      if (p && !done) {
        done = true
        resolve(p)
      }
    }
    window.addEventListener('eip6963:announceProvider', take)
    window.dispatchEvent(new Event('eip6963:requestProvider'))
    setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', take)
      if (!done) resolve(null)
    }, timeoutMs)
  })
}

const utf8Hex = (s: string) =>
  '0x' +
  Array.from(new TextEncoder().encode(s), b =>
    b.toString(16).padStart(2, '0')
  ).join('')

const base64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...Array.from(bytes)))

export async function findSigner(chain: TextChain): Promise<Signer | null> {
  const w = window as W
  if (chain === 'evm') {
    const eth = (await announcedEvm(300)) ?? w.ethereum ?? null
    if (!eth) return null
    return {
      async address() {
        const list = (await eth.request({
          method: 'eth_requestAccounts',
        })) as string[]
        if (!list?.[0]) throw new Error('no_account')
        return list[0]
      },
      async sign(message, address) {
        return String(
          await eth.request({
            method: 'personal_sign',
            params: [utf8Hex(message), address],
          })
        )
      },
    }
  }
  if (chain === 'solana') {
    const sol =
      w.phantom?.solana ?? w.solflare ?? w.okxwallet?.solana ?? w.solana
    if (!sol) return null
    return {
      async address() {
        const r = await sol.connect()
        const key =
          (r && 'publicKey' in r ? r.publicKey : sol.publicKey) ?? null
        if (!key) throw new Error('no_account')
        return key.toString()
      },
      async sign(message) {
        const r = await sol.signMessage(
          new TextEncoder().encode(message),
          'utf8'
        )
        return base64(r instanceof Uint8Array ? r : r.signature)
      },
    }
  }
  const link = w.tronLink ?? w.okxwallet?.tronLink
  const web = () => link?.tronWeb ?? w.tronWeb
  if (!link && !w.tronWeb) return null
  return {
    async address() {
      if (link?.request) await link.request({ method: 'tron_requestAccounts' })
      const a = web()?.defaultAddress?.base58
      if (!a) throw new Error('no_account')
      return a
    },
    async sign(message) {
      const t = web()
      if (!t) throw new Error('no_wallet')
      return t.trx.signMessageV2(message)
    },
  }
}

// ---------------------------------------------------------------------------
// The server
// ---------------------------------------------------------------------------

export interface SignedText {
  chain: TextChain
  address: string
  nonce: string
  issuedAt: string
  signature: string
}

/** Connects, asks the server for the text, has the wallet sign it. */
export async function signWith(
  signer: Signer,
  chain: TextChain,
  nonce: string
): Promise<SignedText> {
  const address = await signer.address()
  const m = await apiFetch<{
    message: string
    issuedAt: string
    address: string
  }>(`${WALLET_URL}/message`, {
    method: 'POST',
    body: JSON.stringify({ chain, address, nonce }),
  })
  const signature = await signer.sign(m.message, address)
  return { chain, address: m.address, nonce, issuedAt: m.issuedAt, signature }
}

/** Binds at once: this browser holds the person's credential. */
export async function bindSigned(body: SignedText): Promise<void> {
  await apiFetch(WALLET_URL, { method: 'POST', body: JSON.stringify(body) })
}

/** From the wallet's own browser: a proposal the person confirms. */
export async function proposeSigned(body: SignedText): Promise<void> {
  await apiFetch(`${WALLET_URL}/propose`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function confirmProposal(nonce: string): Promise<void> {
  await apiFetch(WALLET_URL, {
    method: 'POST',
    body: JSON.stringify({ confirm: nonce }),
  })
}
