/**
 * THE SERVER'S QUERY AGAINST LIVE GITHUB, AND AGAINST THE CLIENT'S READ
 * (spec kanban-card-chat.t27 v4, STATUS_DOOR).
 *
 *   GH_READ=$(gh auth token) npx tsx scripts/card-status-parity.ts <owner/repo> <n>
 *
 * The render test feeds statusFromGraphql a hand-written answer; only a live
 * read proves GitHub still accepts CARD_STATUS_QUERY and answers in that
 * shape. The same card is then read the client's way (player cardStatus, v3
 * REST) and the two must agree on order, states and checks -- the sheet must
 * not change when the owner turns the server read on.
 *
 * Reads only. The token comes from the environment and is never printed.
 * Prints one JSON line: {same, server, client} or {error}. Exit 0 same,
 * 1 differ or the query broke, 2 nothing to compare (no token, no answer,
 * a read that threw). Exit 1 is DRIFT for `tri card-drift`, so a network
 * error must not be one: a read that did not happen says nothing.
 */
import { readCardStatus } from '../../player/src/lib/cardStatus'
import {
  type CardStatus,
  clearCardStatusCache,
  readServerStatus,
} from '../src/agent/card-status'

function line(s: CardStatus | { kind: string } | null): unknown {
  if (!s || s.kind !== 'prs') return s
  const p = s as Extract<CardStatus, { kind: 'prs' }>
  return {
    more: p.more,
    partial: p.partial,
    prs: p.prs.map(
      x =>
        `${x.repo}#${x.number} ${x.state}${x.draft ? ' draft' : ''}${x.checks ? ` ${x.checks}` : ''}`
    ),
  }
}

async function main(): Promise<number> {
  const [repo, n] = process.argv.slice(2)
  const token = process.env.GH_READ ?? ''
  if (!repo || !Number.isInteger(Number(n))) {
    console.log(JSON.stringify({ error: 'usage: <owner/repo> <n>' }))
    return 2
  }
  if (!token) {
    console.log(JSON.stringify({ error: 'no GH_READ token' }))
    return 2
  }
  // The query itself first: an `errors` answer is a broken query, not "no PR".
  const probe = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'vibee-render-card-status',
    },
    body: JSON.stringify({ query: 'query{viewer{login}}' }),
  })
  if (!probe.ok) {
    console.log(JSON.stringify({ error: `github HTTP ${probe.status}` }))
    return 2
  }
  clearCardStatusCache()
  const server = await readServerStatus(repo, Number(n), token)
  if (!server) {
    console.log(
      JSON.stringify({ error: 'the query broke or the issue is gone' })
    )
    return 1
  }
  const authed: typeof fetch = (url, init = {}) =>
    fetch(url, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string>),
        Authorization: `Bearer ${token}`,
      },
    })
  const client = await readCardStatus(repo, Number(n), {
    fetchImpl: authed,
    storage: null,
  })
  if (client.kind === 'unmeasured') {
    console.log(JSON.stringify({ server: line(server), client: 'unmeasured' }))
    return 2
  }
  const a = JSON.stringify(line(server))
  const b = JSON.stringify(line(client))
  console.log(
    JSON.stringify({
      same: a === b,
      server: line(server),
      client: line(client),
    })
  )
  return a === b ? 0 : 1
}

main().then(
  code => process.exit(code),
  e => {
    console.log(JSON.stringify({ error: String((e as Error)?.message ?? e) }))
    process.exit(2)
  }
)
