import { API_BASE } from '@/config'
import { apiFetch } from '@/lib/apiFetch'

/**
 * THE TON ADDRESS A PERSON'S TRI WOULD BE PAID TO (render src/tri-wallet.ts).
 *
 * The flow is TON Connect's `ton_proof`: the server issues a one-time payload,
 * the wallet signs it together with this site's domain, and the server checks
 * the signature against the key inside the wallet's own state init. The
 * address therefore cannot be typed in by hand -- only a wallet that holds it
 * can bind it.
 *
 * Nothing here moves money: binding records where TRI is sent. The mint
 * itself is lib/triClaim.ts, and TRI exists on TON testnet only.
 */

export const TRI_WALLET_URL = `${API_BASE}/api/tri/wallet`
export const TRI_WALLET_CHALLENGE_URL = `${TRI_WALLET_URL}/challenge`

/**
 * The manifest a wallet fetches to show who is asking. Its host is the domain
 * the wallet signs into the proof, and the server accepts exactly one --
 * app.t27.ai -- so the manifest is this origin's.
 */
export const TON_MANIFEST_PATH = '/tonconnect-manifest.json'

export type TonNetwork = '-239' | '-3'

export interface BoundTriWallet {
  chain: 'ton' | 'evm' | 'solana' | 'tron'
  /** A TON network id, or the one network of an EVM/Solana/TRON binding. */
  network: string
  address: string
  friendly: string
  boundAt: string
  /** TRI is paid here today: TON, until the bridge is live. */
  paid: boolean
}

/** An address a wallet's own browser signed for, waiting for the person. */
export interface TriProposal {
  nonce: string
  chain: 'evm' | 'solana' | 'tron'
  network: string
  address: string
  proposedAt: string
}

/** The parts of a TON Connect wallet this flow reads. */
export interface ProvedWallet {
  account: {
    address: string
    chain: string
    walletStateInit: string
    /** Sent by the wallet, never forwarded: the server reads the state init. */
    publicKey?: string
  }
  connectItems?: {
    tonProof?:
      | {
          name: 'ton_proof'
          proof: {
            timestamp: number
            domain: { lengthBytes: number; value: string }
            payload: string
            signature: string
          }
        }
      | { name: 'ton_proof'; error: { code: number; message?: string } }
  }
}

/**
 * The body POST /api/tri/wallet expects, or null when the wallet connected
 * without a proof (it refused, or does not support `ton_proof`). The client's
 * `publicKey` is deliberately not sent: the server takes the key from the
 * state init and would ignore it anyway.
 */
export function proofBody(wallet: ProvedWallet) {
  const item = wallet.connectItems?.tonProof
  if (!item || !('proof' in item)) return null
  return {
    address: wallet.account.address,
    network: wallet.account.chain,
    stateInit: wallet.account.walletStateInit,
    proof: item.proof,
  }
}

export async function listTriWallets(): Promise<BoundTriWallet[]> {
  return (await readTriWallets()).wallets
}

/** The bound wallets and the proposals waiting for this person's yes. */
export async function readTriWallets(): Promise<{
  wallets: BoundTriWallet[]
  proposals: TriProposal[]
}> {
  const r = await apiFetch<{
    wallets?: BoundTriWallet[]
    proposals?: TriProposal[]
  }>(TRI_WALLET_URL)
  return { wallets: r.wallets ?? [], proposals: r.proposals ?? [] }
}

export async function issueTriChallenge(): Promise<string> {
  const r = await apiFetch<{ payload: string }>(TRI_WALLET_CHALLENGE_URL, {
    method: 'POST',
    body: '{}',
  })
  return r.payload
}

export async function bindTriWallet(
  body: NonNullable<ReturnType<typeof proofBody>>
): Promise<BoundTriWallet> {
  const r = await apiFetch<{ wallet: BoundTriWallet }>(TRI_WALLET_URL, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return r.wallet
}

export async function unbindTriWallet(
  network: string,
  chain: BoundTriWallet['chain'] = 'ton'
): Promise<void> {
  const q = new URLSearchParams({ chain, network })
  await apiFetch(`${TRI_WALLET_URL}?${q}`, { method: 'DELETE' })
}

/** The server's refusal codes a person can act on, as i18n keys. */
export function triWalletErrorKey(code: string | undefined): string {
  switch (code) {
    case 'wallet_bound_elsewhere':
      return 'tri.wallet.err.elsewhere'
    case 'proof_expired':
    case 'payload_unknown':
      return 'tri.wallet.err.expired'
    case 'domain_mismatch':
    case 'domain_length_mismatch':
      return 'tri.wallet.err.domain'
    case 'workchain_refused':
      return 'tri.wallet.err.workchain'
    case 'person_required':
      return 'tri.wallet.err.signin'
    case 'too_many_challenges':
      return 'tri.wallet.err.busy'
    case 'signature_invalid':
    case 'signature_malformed':
    case 'address_malformed':
      return 'tri.wallet.err.signature'
    case 'proposal_unknown':
    case 'already_proposed':
      return 'tri.wallet.err.proposal'
    default:
      return 'tri.wallet.err.generic'
  }
}
