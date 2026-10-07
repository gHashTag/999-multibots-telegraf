"""tri jam (jam.py) and the stack rule it shares with tri queue (prstack.py).

    python3 -m unittest bin/helpers/test_jam.py

No network: the decision functions run on fixtures/jam-prs.json, and the one
end-to-end case drives jam.py through a gh stub that answers from the same
fixture and fails on anything but a read.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

import jam  # noqa: E402
from prstack import merge_order, stack_parents  # noqa: E402

FIXTURE = os.path.join(HERE, 'fixtures', 'jam-prs.json')
OPTS = {'json': False, 'summary': False, 'threshold': 30.0, 'fresh': 20.0, 'limit': 100}


def sha(tok):
    return (tok.encode().hex() * 40)[:40]


def expand(x):
    """A fixture entry -> (gh pr list item, GraphQL pullRequest or None)."""
    n = x['n']
    commits = x.get('commits') or [[f'z{n}', '2026-10-03T08:00:00Z']]
    head = sha(commits[-1][0])
    item = {'number': n, 'title': x.get('title', f'pr {n}'),
            'author': {'login': x.get('author', 'gHashTag')},
            'baseRefName': x.get('base', 'main'), 'headRefName': f'feat/b{n}',
            'headRefOid': head, 'isDraft': bool(x.get('draft')),
            'labels': [{'name': lb} for lb in x.get('labels', [])],
            'mergeable': x.get('mergeable', 'MERGEABLE'), 'createdAt': '2026-10-03T07:00:00Z'}
    timeline = []
    if x.get('labeled'):
        timeline.append({'__typename': 'LabeledEvent', 'createdAt': x['labeled'],
                         'label': {'name': 'bee-reviewed'}})
    if x.get('force_pushed'):
        timeline.append({'__typename': 'HeadRefForcePushedEvent', 'createdAt': x['force_pushed']})
    runs = [{'name': name, 'conclusion': concl, 'steps': {'totalCount': steps},
             'text': re.sub(r'\{sha:(\w+)\}', lambda m: sha(m.group(1)), text), 'app': app}
            for app, name, concl, steps, text in x.get('checks', [])]
    suites = {}
    for r in runs:
        suites.setdefault(r.pop('app'), []).append(r)
    trunc = bool(x.get('truncated'))
    detail = {
        'headRefOid': head,
        'commits': {'totalCount': len(commits),
                    'nodes': [{'commit': {'oid': sha(t), 'committedDate': d}} for t, d in commits]},
        'comments': {'nodes': [{'createdAt': a, 'body': b} for a, b in x.get('comments', [])]},
        'reviews': {'nodes': [{'submittedAt': a, 'state': s, 'body': b}
                              for a, s, b in x.get('reviews', [])]},
        'timelineItems': {'nodes': timeline},
        'last': {'nodes': [{'commit': {'oid': head, 'checkSuites': {
            'pageInfo': {'hasNextPage': trunc},
            'nodes': [{'app': {'slug': app}, 'checkRuns': {'pageInfo': {'hasNextPage': False},
                                                             'nodes': rs}}
                      for app, rs in suites.items()]}}}]},
    }
    return item, (None if x.get('unmeasured') else detail)


def load():
    with open(FIXTURE) as fh:
        fx = json.load(fh)
    return fx, jam.ts(fx['now'])


def classified():
    fx, now = load()
    prs = []
    for x in fx['prs']:
        item, detail = expand(x)
        if detail is None:
            item['_unmeasured'] = x['unmeasured']
        elif 'dependabot' not in x.get('author', '') and not x.get('title', '').startswith('release('):
            item['_detail'] = detail
        prs.append(item)
    return fx, jam.classify_all(prs, now, dict(OPTS))


class SpecFunctions(unittest.TestCase):
    """jam_case / jam_action / jam_is_queens_turn as gHashTag/t27#5700 states them."""

    def test_values_are_positions(self):
        self.assertEqual([getattr(jam, 'JAM_' + c) for c in jam.CASES], list(range(10)))
        self.assertEqual([getattr(jam, 'ACT_' + a) for a in jam.ACTS], list(range(10)))

    def test_unmeasured_beats_every_flag(self):
        self.assertEqual(jam.jam_case(False, True, True, True, True, True, True, False, True),
                         jam.JAM_UNMEASURED)

    def test_first_match_order(self):
        allf = [True] * 8
        order = [jam.JAM_DRAFT_OR_FRESH, jam.JAM_STACKED_ON_OPEN, jam.JAM_CONFLICTING,
                 jam.JAM_LABELED_NOT_MERGED, jam.JAM_REFUSED_THEN_PUSHED]
        flags = list(allf)
        for i, want in enumerate(order):
            self.assertEqual(jam.jam_case(True, *flags[:6], False, flags[7]), want)
            flags[i] = False
        # refused, not pushed after
        self.assertEqual(jam.jam_case(True, False, False, False, False, True, False, False, True),
                         jam.JAM_REFUSED_NOT_FIXED)
        self.assertEqual(jam.jam_case(True, False, False, False, False, False, False, False, True),
                         jam.JAM_NOISE_RED)
        self.assertEqual(jam.jam_case(True, False, False, False, False, False, False, False, False),
                         jam.JAM_NO_REVIEWER)
        self.assertEqual(jam.jam_case(True, False, False, False, False, False, False, True, False),
                         jam.JAM_NONE)

    def test_stacked_and_unreviewed_is_stacked(self):
        self.assertEqual(jam.jam_case(True, False, True, False, False, False, False, False, False),
                         jam.JAM_STACKED_ON_OPEN)

    def test_issue_scenario_labeled(self):
        c = jam.jam_case(True, False, False, False, True, False, False, True, False)
        self.assertEqual(c, jam.JAM_LABELED_NOT_MERGED)
        self.assertEqual(jam.jam_action(c), jam.ACT_FINISH_MERGE)

    def test_action_and_turn(self):
        self.assertEqual(jam.jam_action(200), jam.ACT_MEASURE_AGAIN)
        self.assertEqual(jam.jam_action(jam.JAM_NONE), jam.ACT_NOTHING)
        self.assertEqual(jam.jam_action(jam.JAM_NOISE_RED), jam.ACT_NAME_NOISE_AND_REVIEW)
        idle = {jam.JAM_NONE, jam.JAM_DRAFT_OR_FRESH, jam.JAM_STACKED_ON_OPEN}
        for c in range(10):
            self.assertEqual(jam.jam_is_queens_turn(c), c not in idle, jam.CASES[c])


class Fixture(unittest.TestCase):
    def test_every_pr_lands_in_its_case(self):
        fx, (rows, dep, rel) = classified()
        by = {r['number']: r for r in rows}
        self.assertEqual(len(by) + len(dep) + len(rel), len(fx['prs']))
        for x in fx['prs']:
            want = x['expect']
            if want == 'dependabot':
                self.assertIn(x['n'], [p['number'] for p in dep])
                self.assertNotIn(x['n'], by)
            elif want == 'owners':
                self.assertIn(x['n'], [p['number'] for p in rel])
                self.assertNotIn(x['n'], by)
            else:
                self.assertEqual(by[x['n']]['case'], want, f'#{x["n"]}: {by[x["n"]]["move"]}')
                if 'parent' in x:
                    self.assertEqual(by[x['n']]['parent'], x['parent'])
                if 'note' in x:
                    self.assertIn(x['note'], [n['tag'] for n in by[x['n']]['notes']])

    def test_parent_before_child_and_exit(self):
        _fx, (rows, _d, _r) = classified()
        nums = [r['number'] for r in rows]
        self.assertLess(nums.index(104), nums.index(105))
        self.assertLess(nums.index(104), nums.index(106))
        self.assertEqual(jam.exit_code(rows, []), 2)  # 101 and 121 are unread
        read = [r for r in rows if r['case'] != 'JAM_UNMEASURED']
        self.assertEqual(jam.exit_code(read, []), 1)
        calm = [r for r in read if not r['queens_turn']]
        self.assertEqual(jam.exit_code(calm, []), 0)
        self.assertEqual(jam.exit_code(calm, ['the list hit --limit 100']), 2)

    def test_refusal_patterns_match_tri_pr_billing(self):
        with open(os.path.join(ROOT, 'tri')) as fh:
            tri = fh.read()
        self.assertIn('test("%s"; "i")' % jam.BEE_RE.replace('\\', '\\\\'), tri)
        self.assertIn('test("%s"; "i")' % jam.REFUSE_RE, tri)


class Stack(unittest.TestCase):
    @staticmethod
    def pr(n, oids, base='main'):
        return {'number': n, 'baseRefName': base, 'headRefName': f'b{n}',
                'headRefOid': oids[-1], 'commits': [{'oid': o} for o in oids]}

    def test_head_inside_is_stacked_even_on_main(self):
        p = stack_parents([self.pr(1, ['a', 'b']), self.pr(2, ['a', 'b', 'c'])])
        self.assertEqual(p, {2: (1, 'commits', 'carries the head commit of #1')})

    def test_nearest_parent_wins(self):
        p = stack_parents([self.pr(1, ['a']), self.pr(2, ['a', 'b']), self.pr(3, ['a', 'b', 'c'])])
        self.assertEqual(p[3][0], 2)
        self.assertEqual(p[2][0], 1)
        self.assertEqual(merge_order([3, 2, 1], p, key=lambda n: -n), [1, 2, 3])

    def test_moved_on_sibling_shares_with_older(self):
        p = stack_parents([self.pr(1, ['a', 'b2']), self.pr(2, ['a', 'c'])])
        self.assertEqual(p, {2: (1, 'commits', 'shares 1 commit(s) with older #1')})

    def test_same_head_twice_the_older_is_parent(self):
        p = stack_parents([self.pr(5, ['a']), self.pr(9, ['a'])])
        self.assertEqual(list(p), [9])
        self.assertEqual(p[9][0], 5)

    def test_unrelated_and_base(self):
        self.assertEqual(stack_parents([self.pr(1, ['a']), self.pr(2, ['b'])]), {})
        p = stack_parents([self.pr(1, ['a']), self.pr(2, ['b'], base='b1')])
        self.assertEqual(p[2][:2], (1, 'base'))


STUB = r'''#!/usr/bin/env python3
import json, os, sys
a = sys.argv[1:]
with open(os.environ['JAM_STUB_LOG'], 'a') as fh:
    fh.write(' '.join(a[:2]) + '\n')
d = json.load(open(os.environ['JAM_STUB_DATA']))
if a[:2] == ['pr', 'list']:
    print(json.dumps(d['list']))
elif a[:2] == ['api', 'graphql']:
    n = next(x[2:] for x in a if x.startswith('n='))
    print(json.dumps({'data': {'repository': {'pullRequest': d['detail'][n]}}}))
else:
    sys.exit(9)
'''


class EndToEnd(unittest.TestCase):
    def run_jam(self, gh, data=None, *args):
        with tempfile.TemporaryDirectory() as tmp:
            env = {**os.environ, 'TRI_JAM_NOW': '2026-10-03T12:00:00Z',
                   'JAM_STUB_LOG': os.path.join(tmp, 'log')}
            if data is not None:
                with open(os.path.join(tmp, 'data.json'), 'w') as fh:
                    json.dump(data, fh)
                stub = os.path.join(tmp, 'gh')
                with open(stub, 'w') as fh:
                    fh.write(STUB)
                os.chmod(stub, 0o755)
                env['JAM_STUB_DATA'] = os.path.join(tmp, 'data.json')
                gh = stub
            env['TRI_GH'] = gh
            r = subprocess.run([sys.executable, os.path.join(HERE, 'jam.py'), *args],
                               capture_output=True, text=True, env=env, timeout=60)
            log = ''
            if os.path.exists(env['JAM_STUB_LOG']):
                with open(env['JAM_STUB_LOG']) as fh:
                    log = fh.read()
            return r, log

    def test_gh_that_cannot_answer_is_unmeasured(self):
        r, _ = self.run_jam('/usr/bin/false', None, '--summary')
        self.assertEqual(r.returncode, 2)
        self.assertRegex(r.stdout, r'^jam: UNMEASURED -- ')
        self.assertNotIn('jam: none', r.stdout)

    def test_reads_only_and_finds_the_jam(self):
        fx, _now = load()
        keep = {104, 105, 113, 117, 118}
        lst, det = [], {}
        for x in fx['prs']:
            if x['n'] in keep:
                item, detail = expand(x)
                lst.append(item)
                det[str(x['n'])] = detail
        r, log = self.run_jam(None, {'list': lst, 'detail': det}, '--json')
        self.assertEqual(r.returncode, 1, r.stderr)
        out = json.loads(r.stdout)
        cases = {p['number']: p['case'] for p in out['prs']}
        self.assertEqual(cases, {104: 'JAM_NOISE_RED', 105: 'JAM_STACKED_ON_OPEN', 113: 'JAM_NONE'})
        self.assertEqual([p['number'] for p in out['dependabot']], [117])
        self.assertEqual([p['number'] for p in out['owners']], [118])
        calls = log.split()
        self.assertTrue(set(zip(calls[::2], calls[1::2])) <= {('pr', 'list'), ('api', 'graphql')})
        self.assertEqual(log.count('api graphql'), 3)  # apart PRs are not read


if __name__ == '__main__':
    unittest.main()
