'use strict'
// Is the outside world reachable, and if not, which kind of "not" is it?
// (tri online, bin/helpers/online.mjs)
//
// 2026-10-03: in the middle of a loop tick github.com stopped resolving. Then
// `git push --delete`, `git fetch` over ssh and `git fetch` over https all
// failed one after another, while one `gh api` call still got through. Each
// failure was read on its own and retried by hand. Nothing said "this is DNS,
// wait" as against "the key is refused, a retry will never help". The answer
// is plain data here, so it is tested without a network.

// What a failed probe's output means. The order matters: an auth refusal
// prints the host it reached, so it is matched before anything generic.
const PATTERNS = [
  [
    'auth',
    /permission denied|publickey|authentication failed|could not read username|bad credentials|http 401|requires authentication|repository not found/i,
  ],
  [
    'dns',
    /could not resolve host|nodename nor servname|name or service not known|temporary failure in name resolution|getaddrinfo|enotfound|eai_again/i,
  ],
  [
    'connect',
    /timed out|timeout|connection refused|econnrefused|econnreset|network is unreachable|no route to host|connection reset|ssl_error|unexpected eof|etimedout/i,
  ],
]

// status: the probe's exit code (0 = it answered); text: what it printed.
function classify(status, text) {
  if (status === 0) return 'up'
  const t = String(text || '')
  for (const [kind, re] of PATTERNS) if (re.test(t)) return kind
  return 'unknown'
}

// The line worth showing: the one the diagnosis came from. git prints its
// cause first and "Please make sure ... the repository exists." last, so the
// last line named nothing (first run of tri online, 2026-10-03).
function reason(text) {
  const lines = String(text || '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
  for (const [, re] of PATTERNS) {
    const hit = lines.find(l => re.test(l))
    if (hit) return hit.slice(0, 140)
  }
  return (lines[0] || '').slice(0, 140)
}

// What the next step is, given the probes by name. GitHub is what a loop
// pushes to, so its probes decide the code; the others are reported.
//   0  everything answered
//   1  the network is down (dns/connect) -- wait, then retry; nothing to fix
//   3  reachable but refused (auth) -- a retry never helps, a person must look
//   4  something else failed in a way not recognised -- read the line
function verdict(results) {
  const kinds = Object.values(results)
  if (kinds.every(k => k === 'up')) {
    return { code: 0, next: 'all reachable' }
  }
  const github = ['github-dns', 'git-ssh', 'github-api']
    .map(n => results[n])
    .filter(Boolean)
  if (github.includes('auth')) {
    return {
      code: 3,
      next: 'GitHub answers but refuses the credentials: a retry will not help (ssh key / gh auth status)',
    }
  }
  if (github.some(k => k === 'dns' || k === 'connect')) {
    return {
      code: 1,
      next: 'the network to GitHub is down: wait (`tri online --wait 300`) and retry; the code is not at fault',
    }
  }
  if (kinds.some(k => k === 'dns' || k === 'connect')) {
    return {
      code: 1,
      next: 'GitHub is reachable; a service beside it is not (see the lines above)',
    }
  }
  return {
    code: 4,
    next: 'a probe failed in a way not recognised: read its line',
  }
}

module.exports = { classify, reason, verdict }
