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

// What a failed probe's output means. The order decides a text that matches
// two kinds (a retried command printing both attempts): a refusal means a
// server answered, so the network worked, and auth wins over dns and connect.
// None of the texts seen live mixes them; the test pins the order anyway.
const PATTERNS = [
  [
    'auth',
    /permission denied|publickey|authentication failed|could not read username|bad credentials|http 401|requires authentication|repository not found|gh auth login/i,
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

// The probes a loop pushes through; any of them refusing or down decides.
const GITHUB = ['github-dns', 'git-ssh', 'github-api']

// What the next step is, given the probes by name. GitHub is what a loop
// pushes to, so its probes decide the code; the others are reported.
//   0  everything answered
//   1  the network is down (dns/connect) -- wait, then retry; nothing to fix
//   3  reachable but refused (auth) -- a retry never helps, a person must look
//   4  something else failed in a way not recognised -- read the line
function verdict(results) {
  const names = Object.keys(results)
  if (names.every(n => results[n] === 'up')) {
    return { code: 0, next: 'all reachable' }
  }
  const github = GITHUB.filter(n => n in results).map(n => results[n])
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
  // Here no GitHub probe is auth, dns or connect. If every failure is a network
  // one, none of them is GitHub's, so "reachable" is true; an unrecognised
  // GitHub probe falls through to 4 instead (#3442 review).
  const down = names.filter(n => results[n] !== 'up')
  if (down.every(n => results[n] === 'dns' || results[n] === 'connect')) {
    return {
      code: 1,
      next: `GitHub is reachable; ${down.join(', ')} is not (network): wait or check its host`,
    }
  }
  return {
    code: 4,
    next: `${down.join(', ')} failed in a way not recognised (an http error is the service, not the road): read its line`,
  }
}

module.exports = { GITHUB, classify, reason, verdict }
