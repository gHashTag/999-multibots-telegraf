#!/usr/bin/env python3
"""tri jam [--json] [--summary] [--threshold MIN] [--fresh MIN] [--limit N]

The Queen's review-jam detector. READ-ONLY: `gh pr list` and one GraphQL
query per PR, nothing is written -- it never merges, never labels, never
comments.

WHY. Owner's rule (2026-10-03): the Queen does not code and does not merge,
she manages. That day five PRs sat open with no reviewer for hours and
`tri queue` called a commit-stacked PR "free to merge". Nobody had asked the
one question a manager asks first: who is supposed to touch this PR next?
This answers it for every open PR: one jam case and one action.

The cases, their numbers and the first-match order are the spec's (see the
constants below). The facts each case reads:

  measured        the PR's own record, commits and checks were all read
  draft_or_fresh  a draft, or a head younger than --fresh minutes
  stacked         base is another open PR's branch, or the head carries an
                  open sibling's commits (prstack.py -- shared with tri queue)
  conflicting     GitHub says CONFLICTING
  labeled         carries `bee-reviewed` and is still open (the bee died
                  between the label and the merge)
  refused         the LAST bee note is a refusal ...
  pushed_after    ... and the head is newer than it
  has_reviewer    the last bee note is not a refusal, is on this head, and is
                  younger than --threshold minutes
  only_noise_red  red checks, every one of them noise, and no live reviewer:
                  GitHub Actions jobs with ZERO steps (the billing stop --
                  Actions have not run a job here since 2026-06-02), or a
                  GitGuardian red whose flagged commits are all older than
                  the head. Without "no live reviewer" every PR of this repo
                  would be NOISE_RED forever, since Actions are always red.

A refusal is the convention `tri pr-billing` reads (cmd_pr_billing in ./tri):
the FIRST line of a comment or review names a bee and says "not merg" or
"changes requested", or the review state is CHANGES_REQUESTED. The two
patterns are pinned to ./tri's by bin/helpers/test_jam.py.

Reported apart and never a jam: dependabot's PRs (a coder splits the safe
part; never merged blind) and release(board) PRs (the owner's).

Exit: 0 every PR was read and none is the Queen's turn; 1 at least one is;
2 a read failed (gh refused, rate-limited, unparseable, --limit hit). 2 wins
over 1: an unread PR is never reported as free, and the table still lists
the jams that were read. "jam: none" is never printed when a read failed.

What the Queen does with each case lives in ONE place:
.claude/skills/continuous-improvement-loop/SKILL.md, "The Queen's round".
"""
import json
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prstack import merge_order, stack_parents  # noqa: E402

GH = os.environ.get('TRI_GH', 'gh')
REPO = os.environ.get('TRI_GH_REPO', 'gHashTag/999-multibots-telegraf')
LABEL = 'bee-reviewed'
# Same text as the jq in cmd_pr_billing (./tri); test_jam.py pins both.
BEE_RE = r'\bbees?\b'
REFUSE_RE = r'not merg|changes requested'
FAILED = ('FAILURE', 'TIMED_OUT', 'STARTUP_FAILURE')
SHA_RE = re.compile(r'\b[0-9a-f]{40}\b')

# Spec of record, not yet landed: gHashTag/t27#5700,
# specs/automation/review-jam.t27. The names, the values (= position) and the
# first-match order of jam_case are that issue's, word for word. When the
# spec lands, bind this file to it (skill t27-spec-first: copy the spec and
# its `t27c gen-ts` output next to the host, import the numbers) and delete
# these hand-written lines.
JAM_NONE = 0
JAM_NO_REVIEWER = 1
JAM_STACKED_ON_OPEN = 2
JAM_REFUSED_NOT_FIXED = 3
JAM_REFUSED_THEN_PUSHED = 4
JAM_LABELED_NOT_MERGED = 5
JAM_CONFLICTING = 6
JAM_NOISE_RED = 7
JAM_DRAFT_OR_FRESH = 8
JAM_UNMEASURED = 9

ACT_NOTHING = 0
ACT_DISPATCH_REVIEWER = 1
ACT_WAIT_FOR_BASE = 2
ACT_DISPATCH_CODER = 3
ACT_DISPATCH_RE_REVIEW = 4
ACT_FINISH_MERGE = 5
ACT_REBASE_BY_CODER = 6
ACT_NAME_NOISE_AND_REVIEW = 7
ACT_WAIT = 8
ACT_MEASURE_AGAIN = 9

CASES = ['NONE', 'NO_REVIEWER', 'STACKED_ON_OPEN', 'REFUSED_NOT_FIXED',
         'REFUSED_THEN_PUSHED', 'LABELED_NOT_MERGED', 'CONFLICTING', 'NOISE_RED',
         'DRAFT_OR_FRESH', 'UNMEASURED']
ACTS = ['NOTHING', 'DISPATCH_REVIEWER', 'WAIT_FOR_BASE', 'DISPATCH_CODER',
        'DISPATCH_RE_REVIEW', 'FINISH_MERGE', 'REBASE_BY_CODER',
        'NAME_NOISE_AND_REVIEW', 'WAIT', 'MEASURE_AGAIN']


def jam_case(measured, draft_or_fresh, stacked_on_open, conflicting, labeled_reviewed,
             refused, pushed_after_refusal, has_reviewer, only_noise_red):
    """The first rule that fits wins, in the spec's order."""
    if not measured:
        return JAM_UNMEASURED
    if draft_or_fresh:
        return JAM_DRAFT_OR_FRESH
    if stacked_on_open:
        return JAM_STACKED_ON_OPEN
    if conflicting:
        return JAM_CONFLICTING
    if labeled_reviewed:
        return JAM_LABELED_NOT_MERGED
    if refused and pushed_after_refusal:
        return JAM_REFUSED_THEN_PUSHED
    if refused:
        return JAM_REFUSED_NOT_FIXED
    if only_noise_red:
        return JAM_NOISE_RED
    if not has_reviewer:
        return JAM_NO_REVIEWER
    return JAM_NONE


def jam_action(case):
    """Same position; an unknown case is never "nothing to do"."""
    return case if 0 <= case <= JAM_UNMEASURED else ACT_MEASURE_AGAIN


def jam_is_queens_turn(case):
    return case not in (JAM_NONE, JAM_DRAFT_OR_FRESH, JAM_STACKED_ON_OPEN)


# ---------------------------------------------------------------- reading

class Unmeasured(Exception):
    pass


def gh(args):
    try:
        r = subprocess.run([GH, *args], capture_output=True, text=True, timeout=90,
                           env={**os.environ, 'GH_PAGER': 'cat', 'NO_COLOR': '1'})
    except (OSError, subprocess.TimeoutExpired) as e:
        raise Unmeasured(f'gh {args[0] if args else ""}: {e}')
    if r.returncode != 0:
        why = (r.stderr or r.stdout or '').strip().split('\n')[0][:160] or f'rc {r.returncode}'
        raise Unmeasured(f'gh {" ".join(args[:2])}: {why}')
    try:
        return json.loads(r.stdout)
    except ValueError:
        raise Unmeasured(f'gh {" ".join(args[:2])}: answer is not JSON')


# One query per PR: 100 PRs with commits+comments+reviews+checks in one call
# exceeds GitHub's 500,000-node limit (measured 03.10).
QUERY = '''query($owner:String!,$name:String!,$n:Int!){
 repository(owner:$owner,name:$name){ pullRequest(number:$n){
  headRefOid
  commits(last:100){ totalCount nodes{ commit{ oid committedDate } } }
  comments(last:100){ nodes{ createdAt body } }
  reviews(last:100){ nodes{ submittedAt state body } }
  timelineItems(last:100, itemTypes:[LABELED_EVENT, HEAD_REF_FORCE_PUSHED_EVENT]){ nodes{
   __typename
   ... on LabeledEvent { createdAt label{ name } }
   ... on HeadRefForcePushedEvent { createdAt } } }
  last: commits(last:1){ nodes{ commit{ oid checkSuites(first:50){
   pageInfo{ hasNextPage }
   nodes{ app{ slug } checkRuns(first:50){ pageInfo{ hasNextPage }
    nodes{ name conclusion text steps(first:1){ totalCount } } } } } } } }
 } } }'''


def fetch_detail(n):
    owner, name = REPO.split('/', 1)
    d = gh(['api', 'graphql', '-F', f'owner={owner}', '-F', f'name={name}', '-F', f'n={n}',
            '-f', f'query={QUERY}'])
    pr = (((d or {}).get('data') or {}).get('repository') or {}).get('pullRequest')
    if not pr:
        raise Unmeasured(f'graphql #{n}: no pullRequest in the answer')
    return pr


# ---------------------------------------------------------------- facts

def ts(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace('Z', '+00:00'))
    except ValueError:
        return None


def mins(a, b):
    return (a - b).total_seconds() / 60 if a and b else None


def human(m):
    if m is None:
        return '?'
    if m < 90:
        return f'{m:.0f}m'
    if m < 48 * 60:
        return f'{m / 60:.0f}h'
    return f'{m / 1440:.0f}d'


def bee_notes(comments, reviews):
    """Comments and reviews whose first line names a bee, and every CHANGES_REQUESTED."""
    raw = [((c.get('createdAt') or ''), c.get('body'), '') for c in comments or []]
    raw += [((r.get('submittedAt') or ''), r.get('body'), r.get('state') or '')
            for r in reviews or []]
    notes = []
    for at, body, st in raw:
        f = (body or '').split('\n')[0].strip()
        bee = re.search(BEE_RE, f, re.I)
        refusal = st == 'CHANGES_REQUESTED' or bool(bee and re.search(REFUSE_RE, f, re.I))
        if bee or refusal:
            notes.append({'at': at, 'line': f[:120], 'refusal': refusal})
    return sorted(notes, key=lambda x: x['at'])


def _nodes(d, key):
    return (d.get(key) or {}).get('nodes') or []


def head_time(detail):
    """When the head arrived: its commit date or the last force-push, whichever is later."""
    head = detail.get('headRefOid')
    dates = [(c.get('commit') or {}).get('committedDate') or '' for c in _nodes(detail, 'commits')
             if (c.get('commit') or {}).get('oid') == head]
    dates += [t.get('createdAt') or '' for t in _nodes(detail, 'timelineItems')
              if t.get('__typename') == 'HeadRefForcePushedEvent']
    return max(dates) if dates else ''


def label_time(detail):
    at = [t.get('createdAt') or '' for t in _nodes(detail, 'timelineItems')
          if t.get('__typename') == 'LabeledEvent' and (t.get('label') or {}).get('name') == LABEL]
    return max(at) if at else ''


def check_runs(detail):
    """(runs, truncated) for the head commit."""
    nodes = _nodes(detail, 'last')
    commit = (nodes[0].get('commit') or {}) if nodes else {}
    suites = commit.get('checkSuites') or {}
    truncated = bool((suites.get('pageInfo') or {}).get('hasNextPage'))
    runs = []
    for s in suites.get('nodes') or []:
        cr = s.get('checkRuns') or {}
        truncated = truncated or bool((cr.get('pageInfo') or {}).get('hasNextPage'))
        for r in cr.get('nodes') or []:
            runs.append({'app': (s.get('app') or {}).get('slug') or '',
                         'name': r.get('name') or '?', 'conclusion': r.get('conclusion') or '',
                         'text': r.get('text') or '',
                         'steps': (r.get('steps') or {}).get('totalCount') or 0})
    return runs, truncated


def red_checks(runs, head):
    """Split the failing runs into noise and real: (noise descriptions, real names)."""
    failing = [r for r in runs if r['conclusion'] in FAILED]
    billing = [r for r in failing if r['app'] == 'github-actions' and r['steps'] == 0]
    noise, real = [], []
    if billing:
        noise.append(f'{len(billing)} Actions job(s) with zero steps (billing stop)')
    for r in failing:
        if r in billing:
            continue
        if r['app'] == 'gitguardian':
            # Its table names each flagged commit by full SHA. Noise only when
            # it names some, and the head is not among them.
            flagged = set(SHA_RE.findall(r['text']))
            if flagged and head not in flagged:
                noise.append('GitGuardian flags only older commit(s) '
                             + ', '.join(sorted(s[:9] for s in flagged)))
                continue
        real.append(f'{r["app"] or "?"}/{r["name"]}')
    return noise, real


def is_dependabot(p):
    return 'dependabot' in ((p.get('author') or {}).get('login') or '').lower()


def is_release(p):
    return (p.get('title') or '').startswith('release(board)')


def facts(p, parents, now, opts):
    """Every flag jam_case reads, plus what the move line needs. Pure."""
    n = p['number']
    d = p.get('_detail')
    f = {'measured': False, 'why': p.get('_unmeasured') or 'not read', 'notes': [], 'parent': None}
    if d is None:
        return f
    head = d.get('headRefOid') or p.get('headRefOid') or ''
    commits = d.get('commits') or {}
    runs, truncated = check_runs(d)
    if truncated:
        f['why'] = 'more than 50 check suites or runs on the head: noise cannot be told from red'
        return f
    if (commits.get('totalCount') or 0) > len(commits.get('nodes') or []):
        f['why'] = f'{commits.get("totalCount")} commits, only the last 100 read: stacking unknown'
        return f
    f['measured'] = True
    hd = head_time(d)
    head_age = mins(now, ts(hd))
    notes = bee_notes(_nodes(d, 'comments'), _nodes(d, 'reviews'))
    last = notes[-1] if notes else None
    noise, real = red_checks(runs, head)
    # "" (an undatable head) sorts before every note: the refusal reads as
    # unanswered, never as "pushed after".
    f['refused'] = bool(last and last['refusal'])
    f['pushed_after'] = bool(f['refused'] and hd and last['at'] < hd)
    live = bool(last and not last['refusal'] and last['at'] > hd)
    note_age = mins(now, ts(last['at'])) if last else None
    f['has_reviewer'] = bool(live and note_age is not None and note_age < opts['threshold'])
    f['only_noise_red'] = bool(noise and not real and not f['has_reviewer'])
    f['draft'] = bool(p.get('isDraft'))
    f['fresh'] = head_age is not None and head_age < opts['fresh']
    f['draft_or_fresh'] = f['draft'] or f['fresh']
    f['stacked'] = n in parents
    f['parent'] = parents.get(n)
    f['conflicting'] = p.get('mergeable') == 'CONFLICTING'
    f['labeled'] = any(lb.get('name') == LABEL for lb in p.get('labels') or [])
    f['label_age'] = human(mins(now, ts(label_time(d))))
    f['head_age'] = human(head_age)
    f['note_age'] = human(note_age)
    f['last'] = last
    f['read_before'] = bool(last and not last['refusal'])
    f['noise'], f['real'] = noise, real
    if real:
        f['notes'].append(('RED', 'real failing check(s), not noise: ' + ', '.join(real[:4])))
    if noise and not f['only_noise_red']:
        f['notes'].append(('NOISE', '; '.join(noise)))
    if p.get('mergeable') == 'UNKNOWN':
        f['notes'].append(('MERGEABLE_UNKNOWN', 'GitHub has not computed mergeable yet'))
    return f


def move(case, f, opts):
    if case == JAM_UNMEASURED:
        return f'measure again: {f["why"]}'
    if case == JAM_DRAFT_OR_FRESH:
        if f['draft']:
            return 'wait: a draft'
        return f'wait: head pushed {f["head_age"]} ago, the author may still be at it'
    if case == JAM_STACKED_ON_OPEN:
        par, _how, why = f['parent']
        return f'wait for the base: merge #{par} first ({why})'
    if case == JAM_CONFLICTING:
        return 'dispatch a coder bee to rebase on main'
    if case == JAM_LABELED_NOT_MERGED:
        return (f'finish the merge: labeled {LABEL} {f["label_age"]} ago and still open '
                '(the bee died between label and merge)')
    if case == JAM_REFUSED_THEN_PUSHED:
        return f're-review by a DIFFERENT bee: refused, then pushed -- "{f["last"]["line"][:70]}"'
    if case == JAM_REFUSED_NOT_FIXED:
        return f'dispatch a coder bee to answer the refusal: "{f["last"]["line"][:70]}"'
    if case == JAM_NOISE_RED:
        return 'dispatch a reviewer who names the red as noise: ' + '; '.join(f['noise'])
    if case == JAM_NO_REVIEWER:
        if f['read_before']:
            return (f'dispatch a reviewer bee: the last bee note ({f["note_age"]} ago) is older '
                    f'than the head or than {opts["threshold"]:g} min, and nothing was merged')
        return 'dispatch a reviewer bee: nobody has read it'
    return f'nothing: a bee spoke on this head {f["note_age"]} ago'


def classify_all(prs, now, opts):
    """Rows for the actionable PRs in merge order, then dependabot's and the owner's
    apart. Pure: each PR carries `_detail` (the GraphQL pullRequest) or `_unmeasured`."""
    dep = [p for p in prs if is_dependabot(p)]
    rel = [p for p in prs if is_release(p) and not is_dependabot(p)]
    act = [p for p in prs if not is_dependabot(p) and not is_release(p)]
    for p in act:
        d = p.get('_detail')
        if d is not None:
            p['commits'] = [{'oid': (c.get('commit') or {}).get('oid')} for c in _nodes(d, 'commits')]
            p['headRefOid'] = d.get('headRefOid') or p.get('headRefOid')
    parents = stack_parents(prs)
    rows = []
    for p in act:
        f = facts(p, parents, now, opts)
        if f['measured']:
            case = jam_case(True, f['draft_or_fresh'], f['stacked'], f['conflicting'],
                            f['labeled'], f['refused'], f['pushed_after'], f['has_reviewer'],
                            f['only_noise_red'])
        else:
            case = JAM_UNMEASURED
        rows.append({'number': p['number'], 'title': p.get('title') or '',
                     'case': 'JAM_' + CASES[case], 'action': 'ACT_' + ACTS[jam_action(case)],
                     'queens_turn': jam_is_queens_turn(case),
                     'parent': f['parent'][0] if f['parent'] else None,
                     'age': human(mins(now, ts(p.get('createdAt')))),
                     'move': move(case, f, opts),
                     'notes': [{'tag': t, 'text': x} for t, x in f['notes']]})
    created = {p['number']: p.get('createdAt') or '' for p in prs}
    order = merge_order([r['number'] for r in rows], parents, key=lambda n: (created[n], n))
    rows.sort(key=lambda r: order.index(r['number']))

    def brief(ps):
        return [{'number': p['number'], 'title': p.get('title') or '',
                 'age': human(mins(now, ts(p.get('createdAt'))))} for p in ps]
    return rows, brief(dep), brief(rel)


def exit_code(rows, unread_lists):
    if unread_lists or any(r['case'] == 'JAM_UNMEASURED' for r in rows):
        return 2
    return 1 if any(r['queens_turn'] for r in rows) else 0


# ---------------------------------------------------------------- output

def main(argv):
    opts = {'json': False, 'summary': False, 'threshold': 30.0, 'fresh': 20.0, 'limit': 100}
    usage = 'usage: tri jam [--json] [--summary] [--threshold MIN] [--fresh MIN] [--limit N]'
    it = iter(argv)
    for a in it:
        if a in ('--json', '--summary'):
            opts[a[2:]] = True
        elif a in ('--threshold', '--fresh', '--limit'):
            try:
                opts[a[2:]] = (int if a == '--limit' else float)(next(it))
            except (StopIteration, ValueError):
                print(usage, file=sys.stderr)
                return 2
        else:
            print(usage, file=sys.stderr)
            return 2
    now = ts(os.environ.get('TRI_JAM_NOW')) or datetime.now(timezone.utc)
    try:
        prs = gh(['pr', 'list', '--repo', REPO, '--state', 'open', '--limit', str(opts['limit']),
                  '--json', 'number,title,author,baseRefName,headRefName,headRefOid,isDraft,'
                  'labels,mergeable,createdAt'])
        if not isinstance(prs, list):
            raise Unmeasured('gh pr list: answer is not a list')
    except Unmeasured as e:
        return report([], [], [], [f'the PR list: {e}'], now, opts)
    extra = []
    if len(prs) >= opts['limit']:
        extra.append(f'the list hit --limit {opts["limit"]}: older PRs were not seen')

    def fill(p):
        if is_dependabot(p) or is_release(p):
            return
        try:
            p['_detail'] = fetch_detail(p['number'])
        except Unmeasured as e:
            p['_unmeasured'] = str(e)

    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(fill, prs))
    rows, dep, rel = classify_all(prs, now, opts)
    return report(rows, dep, rel, extra, now, opts)


def report(rows, dep, rel, extra, now, opts):
    rc = exit_code(rows, extra)
    turn = [r for r in rows if r['queens_turn'] and r['case'] != 'JAM_UNMEASURED']
    unread = [r for r in rows if r['case'] == 'JAM_UNMEASURED']
    names = ', '.join(f'#{r["number"]} {r["case"]}' for r in turn)
    if rc == 2:
        summary = (f'jam: UNMEASURED -- {len(unread) + len(extra)} read(s) failed, '
                   'so "no jam" cannot be said'
                   + (f'; {len(turn)} jam(s) among what was read: {names}' if turn else ''))
    elif turn:
        summary = f"jam: {len(turn)} of {len(rows)} open PR(s) are the Queen's turn -- {names}"
    else:
        summary = f'jam: none -- {len(rows)} open PR(s), every one has its hand on it'
    if opts['json']:
        print(json.dumps({'now': now.isoformat(), 'threshold_min': opts['threshold'],
                          'fresh_min': opts['fresh'], 'unmeasured': extra, 'prs': rows,
                          'dependabot': dep, 'owners': rel, 'summary': summary, 'exit': rc},
                         indent=1))
        return rc
    if opts['summary']:
        print(summary)
        return rc
    print(f'tri jam -- {len(rows)} open PR(s); fresh = head younger than {opts["fresh"]:g} min, '
          f'a reviewer note goes stale after {opts["threshold"]:g} min '
          f'({now.strftime("%Y-%m-%d %H:%M")} UTC); * = the Queen\'s turn')
    for r in rows:
        mark = '*' if r['queens_turn'] else ' '
        print(f' {mark}#{r["number"]:<5} {r["case"]:<24} {r["age"]:>4}  {r["title"][:60]}')
        print(f'         -> {r["action"]}: {r["move"]}')
        for x in r['notes']:
            print(f'         . {x["tag"]}: {x["text"]}')
    for u in extra:
        print(f'  !! UNMEASURED {u}')
    if dep:
        print('dependabot (apart, never a jam: a coder splits the safe part, never merged blind):')
        for p in dep:
            print(f'   #{p["number"]:<5} {p["age"]:>4}  {p["title"][:60]}')
    if rel:
        print("owner's -- release(board), never actioned by a bee:")
        for p in rel:
            print(f'   #{p["number"]:<5} {p["age"]:>4}  {p["title"][:60]}')
    print()
    print(summary)
    print(f'exit {rc}')
    return rc


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
