import { API_BASE } from '@/config'
import { apiFetch } from '@/lib/apiFetch'

/**
 * CLAIMING TRI FOR AN ACCEPTED .t27 SPEC (render src/tri-claim.ts).
 *
 * Two proofs, then a mint the person sends themselves:
 *   - GitHub: the account Queen credits the spec to, proved by GitHub's device
 *     flow -- the app shows a code, the person enters it on github.com.
 *   - TON: the wallet bound in TriWalletCard (a ton_proof).
 * The server collects M-of-N attestor signatures and hands back one message;
 * the person's own wallet signs it in TON Connect and pays the gas.
 *
 * Testnet only -- V1, signer quorum, NOT trustless.
 */

export const TRI_GITHUB_URL = `${API_BASE}/api/tri/github`
export const TRI_CLAIMS_URL = `${API_BASE}/api/tri/claims`
export const TRI_CLAIM_URL = `${API_BASE}/api/tri/claim`

export interface TriEarning {
  workId: string
  repo: string
  issue: number
  commit: string
  specPaths: string[]
  acceptedAt: string
  revokedAt: string | null
  /** A mint message was already built for it (it may or may not have been sent). */
  requested: boolean
}

export interface TriClaims {
  github: { login: string } | null
  /** The bound testnet wallet (raw form), or null. */
  wallet: string | null
  network: '-3'
  status: string
  triPerSpec?: number
  earnings: TriEarning[]
}

export interface GithubCode {
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

export type GithubPoll =
  | { state: 'pending'; interval: number }
  | { state: 'linked'; login: string }

/** What /api/tri/claim returns: one TON Connect message, ready to send. */
export interface BuiltClaim {
  network: '-3'
  status: string
  validUntil: number
  message: { address: string; amount: string; payload: string }
  attestation: {
    payee: string
    workId: string
    amountMtri: string
    epoch: number
    signers: number[]
  }
}

export const listTriClaims = () => apiFetch<TriClaims>(TRI_CLAIMS_URL)

export const startGithubLink = () =>
  apiFetch<GithubCode>(`${TRI_GITHUB_URL}/start`, {
    method: 'POST',
    body: '{}',
  })

export async function pollGithubLink(): Promise<GithubPoll> {
  const r = await apiFetch<{
    pending?: boolean
    interval?: number
    github?: { login: string }
  }>(`${TRI_GITHUB_URL}/poll`, { method: 'POST', body: '{}' })
  return r.github
    ? { state: 'linked', login: r.github.login }
    : { state: 'pending', interval: r.interval ?? 5 }
}

export const unlinkGithub = () => apiFetch(TRI_GITHUB_URL, { method: 'DELETE' })

export const buildTriClaim = (workId: string) =>
  apiFetch<BuiltClaim>(TRI_CLAIM_URL, {
    method: 'POST',
    body: JSON.stringify({ workId }),
  })

/** The refusals a person can act on, as i18n keys. */
export function triClaimErrorKey(code: string | undefined): string {
  switch (code) {
    case 'github_unlinked':
      return 'tri.claim.err.github'
    case 'wallet_unbound':
    case 'payee_unbound':
      return 'tri.claim.err.wallet'
    case 'not_your_earning':
      return 'tri.claim.err.notyours'
    case 'already_minted':
      return 'tri.claim.err.minted'
    case 'not_merged':
    case 'spec_not_in_merged_pull':
      return 'tri.claim.err.notmerged'
    case 'earning_revoked':
      return 'tri.claim.err.revoked'
    case 'access_denied':
      return 'tri.claim.err.denied'
    case 'expired':
    case 'expired_token':
      return 'tri.claim.err.expired'
    case 'quorum_not_reached':
    case 'claims_not_configured':
    case 'outside_unavailable':
      return 'tri.claim.err.unavailable'
    default:
      return 'tri.claim.err.generic'
  }
}
