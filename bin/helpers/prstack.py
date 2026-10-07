"""Which open PR has to land before which -- one home for `tri queue` and `tri jam`.

A PR stands on another in two ways, and only the first is visible in a list:

  base     its base branch is another open PR's head branch;
  commits  its base is main, but its head carries commits of another open
           PR's head. Branched off a sibling's branch, opened against main.

On 2026-10-03 `tri queue` read only `baseRefName`, so it called a PR of the
second kind "free to merge" while it carried a sibling's unreviewed commits.
Squash-merging it would have shipped the sibling's code without a review, and
the sibling would then conflict with its own commits.

Commits are compared by SHA (`gh pr ... --json commits` gives the PR's own
commits, those not on its base). In order of strength:

  1. its commits include another open PR's HEAD commit -- it was branched off
     that PR's branch; with several such, the nearest (most commits) wins;
  2. it shares commits with an OLDER open PR whose head it does not carry
     (branched off a sibling that has moved on since) -- the older goes first.

Two PRs with the same head are one change twice: the older is the parent.
A PR whose head commit sits inside another is that one's parent, never its
child, so no pair can stand on each other.
"""


def _oids(pr):
    return {c.get('oid') for c in pr.get('commits') or [] if c.get('oid')}


def stack_parents(prs):
    """Map PR number -> (parent number, how, detail). PRs on main alone are absent."""
    heads = {p.get('headRefName'): p['number'] for p in prs if p.get('headRefName')}
    out = {}
    for p in prs:
        base = p.get('baseRefName')
        if base in heads and heads[base] != p['number']:
            out[p['number']] = (heads[base], 'base', f'base is the branch of #{heads[base]}')
    commits = {p['number']: _oids(p) for p in prs}
    head = {p['number']: p.get('headRefOid') for p in prs}
    for p in prs:
        n = p['number']
        mine = commits[n]
        if n in out or not mine:
            continue
        best = None
        for q in prs:
            m = q['number']
            theirs = commits[m]
            if m == n or not theirs:
                continue
            if head[m] and head[m] in mine:
                if head[m] == head[n] and m > n:
                    continue  # the same head twice: the older one is the parent
                cand = (2, len(theirs), (m, 'commits', f'carries the head commit of #{m}'))
            elif m < n and (mine & theirs) and head[n] not in theirs:
                shared = len(mine & theirs)
                cand = (1, len(theirs), (m, 'commits', f'shares {shared} commit(s) with older #{m}'))
            else:
                continue
            if best is None or cand[:2] > best[:2]:
                best = cand
        if best:
            out[n] = best[2]
    return out


def merge_order(numbers, parents, key=None):
    """Numbers ordered so that every parent comes before its children."""
    numbers = list(numbers)
    rank = {n: i for i, n in enumerate(sorted(numbers, key=key))}
    done, order = set(), []

    def visit(n, seen=()):
        if n in done or n in seen:
            return
        par = parents.get(n)
        if par and par[0] in rank:
            visit(par[0], seen + (n,))
        done.add(n)
        order.append(n)

    for n in sorted(numbers, key=lambda x: rank[x]):
        visit(n)
    return order
