#!/usr/bin/env python3
"""
tri mutants <list.json> -- <test command>

A batch of reverse mutations against one test command: the green run once,
then each mutation applied, the tests run, the file restored -- and a table
of which mutations the tests killed and which survived.

WHY. `tri mutate` checks one mutation and re-runs the green pass each time.
Binding a spec (skill t27-spec-first) wants six or seven mutations against
the same test file, and on 27.09.2026 that batch was written by hand twice in
one loop turn. The hand-written one found what it is for: of seven
mutations of crm-duet, one survived (`lines < turns` for `lines < turns * 2`)
and showed the spec's own vectors could not tell the two apart.

The list is JSON, so a multi-line `from` needs no escaping games:

    [{"file": "src/agent/x.ts", "from": "a < b * 2", "to": "a < b"}, ...]

A mutation may name the test files that hold it -- `"tests": ["x.test.ts"]`
-- when they are not the ones after `--`: loop turn 7 (27.09.2026) ran the
crm-story-reel list with its two usual files and read two "survivors" that
their own tests (in other files) killed at once. Those files are appended
to the command for that mutation, and to the green run.

Every `from` must occur exactly once (a pattern that matches nothing is a
mutation that never happened, and a green run would read as "survived").
The file is restored in `finally`, on Ctrl-C and SIGTERM too. Exit 1 when
any survived.

A KILLED RUN LEAVES A MUTANT BEHIND -- `finally` does not run when the
process is killed outright. Loop turn 14 (27.09.2026): the container was
restarted mid-batch and story-reel-tool.ts stayed with `hueChecked` returning
`true` -- a mutant one careless `git add -A` away from shipping. So before
each mutation the original and the mutation are written to a journal in
.git (tri-mutants.pending.json); a restore removes it. `tri mutants --heal`
(also run at the start of every batch and by `tri loop`) puts back a file
that still holds exactly that mutant, and says so; a file that has moved on
since is left alone and named.
"""
import io
import os
import json
import signal
import subprocess
import sys


def journal_path() -> str:
    git_dir = subprocess.run(
        ['git', 'rev-parse', '--absolute-git-dir'], capture_output=True, text=True
    ).stdout.strip()
    return os.path.join(git_dir or '.git', 'tri-mutants.pending.json')


def heal() -> int:
    """Put back a file a killed batch left mutated. 0 nothing or healed, 1 not safe."""
    jp = journal_path()
    if not os.path.exists(jp):
        return 0
    with io.open(jp, encoding='utf-8') as fh:
        j = json.load(fh)
    f = j['file']
    try:
        now = io.open(f, encoding='utf-8').read()
    except OSError:
        now = None
    if now == j['mutated']:
        io.open(f, 'w', encoding='utf-8').write(j['original'])
        os.remove(jp)
        print(f'HEALED  {f}: a killed mutant batch left "{j["name"]}" in it; restored')
        return 0
    if now == j['original']:
        os.remove(jp)
        return 0
    print(f'NOT HEALED  {f}: a killed batch left a journal for "{j["name"]}",')
    print('  but the file holds neither the original nor that mutant -- look at it')
    print(f'  (journal: {jp})')
    return 1


def stale(path: str) -> list:
    """Every mutation of a list whose `from` is not in its file exactly once.

    Loop turn 9 (27.09.2026): a refactor of the code under a list left two
    anchors behind; the run named the first and stopped, the second showed
    up only after the fix. All of them, at once, without running anything.
    """
    with io.open(path, encoding='utf-8') as fh:
        muts = json.load(fh)
    out = []
    for i, m in enumerate(muts):
        label = m.get('name') or m['from'].strip().splitlines()[0][:60]
        try:
            s = io.open(m['file'], encoding='utf-8').read()
        except OSError:
            out.append(f'#{i + 1} {m["file"]}: no such file here ({label})')
            continue
        n = s.count(m['from'])
        if n != 1:
            out.append(f'#{i + 1} {m["file"]}: `from` occurs {n} times, need 1 ({label})')
    return out


def adopt(args: list) -> int:
    """tri mutants --adopt <proven.json> <guards.json>: keep a batch for good.

    A cron loop keeps every proven mutation in a guard list that
    `tri loop-guard start` re-runs (paths from the repo root). The batch was
    run from the package, so its paths are relative to there. CRM loop ticks
    7 and 8 (01.10.2026) moved them across by hand: a python one-off that
    prefixed the paths, and once rewrote the whole list with a different
    indent -- a 390-line diff for six entries. This re-roots the paths, skips
    what the list already holds, keeps its two-space JSON and checks every
    anchor of the result before writing it.
    """
    if len(args) != 2:
        print('tri mutants --adopt <proven.json> <guards.json>  (run where the batch ran)')
        return 2
    src, dst = args
    root = subprocess.run(
        ['git', 'rev-parse', '--show-toplevel'], capture_output=True, text=True
    ).stdout.strip()
    here = os.path.relpath(os.getcwd(), root) if root else '.'
    with io.open(src, encoding='utf-8') as fh:
        new = json.load(fh)
    with io.open(dst, encoding='utf-8') as fh:
        old = json.load(fh)
    seen = {(m['file'], m['from'], m['to']) for m in old}
    added = 0
    for m in new:
        m = dict(m)
        if here != '.':
            m['file'] = os.path.normpath(os.path.join(here, m['file']))
        if (m['file'], m['from'], m['to']) in seen:
            continue
        seen.add((m['file'], m['from'], m['to']))
        old.append(m)
        added += 1
    tmp = dst + '.adopt'
    with io.open(tmp, 'w', encoding='utf-8') as fh:
        fh.write(json.dumps(old, ensure_ascii=False, indent=2) + '\n')
    # The guard list's paths are from the repo root: check from there.
    cwd = os.getcwd()
    tmp_abs = os.path.abspath(tmp)
    os.chdir(root or '.')
    problems = stale(tmp_abs)
    os.chdir(cwd)
    if problems:
        os.remove(tmp)
        print(f'NOT adopted -- the result would hold {len(problems)} stale anchor(s):')
        for line in problems:
            print(f'  {line}')
        return 1
    os.replace(tmp, dst)
    print(f'{dst}: +{added} ({len(new) - added} already there), {len(old)} in all, anchors ok')
    return 0


def main() -> int:
    args = sys.argv[1:]
    if args[:1] == ['--heal']:
        return heal()
    # A batch never starts on top of a mutant a killed batch left behind.
    if heal() != 0:
        return 2
    if args[:1] == ['--adopt']:
        return adopt(args[1:])
    if args[:1] == ['--check']:
        # tri mutants --check <list.json>... : anchors only, nothing runs.
        if len(args) < 2:
            print('tri mutants --check <list.json>...  (paths relative to here)')
            return 2
        bad = 0
        for path in args[1:]:
            problems = stale(path)
            print(f'{path}: {"ok" if not problems else f"{len(problems)} stale"}')
            for line in problems:
                print(f'  {line}')
            bad += len(problems)
        return 1 if bad else 0
    if len(args) < 3 or '--' not in args:
        print('tri mutants <list.json> -- <test command>')
        print('list: [{"file": "...", "from": "...", "to": "..."}, ...]')
        return 2
    sep = args.index('--')
    if sep != 1:
        print('one list file before --')
        return 2
    cmd = args[sep + 1:]
    with io.open(args[0], encoding='utf-8') as fh:
        muts = json.load(fh)

    # Check every mutation BEFORE running anything: one bad pattern halfway
    # through would leave a table that reads as a verdict.
    # Loop turn 6 (27.09.2026): run from the repo root, the first file of the
    # list was "not found" and the answer was a Python traceback; the paths
    # are relative to where the command runs, so say that instead.
    problems = stale(args[0])
    if problems:
        for line in problems:
            print(line)
        if any('no such file' in line for line in problems):
            print("the list's paths are relative to where you run it (cd into the package).")
        return 2

    extra = []
    for m in muts:
        for t in m.get('tests', []):
            if t not in extra:
                extra.append(t)

    # tri gate: the tree as this batch found it; record compares it at the
    # end (every mutation is restored, so a moved tree is someone else's).
    os.environ['TRI_GATE_START'] = subprocess.run(
        ['node', os.path.join(os.path.dirname(__file__), 'gate.mjs'), 'tree'],
        capture_output=True, text=True,
    ).stdout.strip()
    print('-- green run, no mutation --')
    # The same turn passed test FILES after `--`; the first was run as a
    # program and died with a traceback. After `--` comes a command.
    try:
        green = subprocess.run(cmd + extra, capture_output=True).returncode
    except OSError as e:
        print(f'cannot run `{cmd[0]}` ({e.strerror}): after -- comes a COMMAND,')
        print('e.g. -- npx vitest run src/spec/x.test.ts')
        return 2
    if green != 0:
        print('the tests fail WITHOUT a mutation: fix the run first,')
        print('or every mutation will read as killed.')
        return 2

    signal.signal(signal.SIGINT, signal.default_int_handler)
    # A container stop sends SIGTERM first: restore the file then, too.
    signal.signal(signal.SIGTERM, signal.default_int_handler)
    jp = journal_path()
    survived = 0
    for i, m in enumerate(muts):
        f = m['file']
        original = io.open(f, encoding='utf-8').read()
        mutated = original.replace(m['from'], m['to'], 1)
        label = m.get('name') or m['from'].strip().splitlines()[0][:60]
        try:
            with io.open(jp, 'w', encoding='utf-8') as jf:
                json.dump(
                    {'file': os.path.abspath(f), 'name': label,
                     'original': original, 'mutated': mutated},
                    jf,
                )
            io.open(f, 'w', encoding='utf-8').write(mutated)
            killed = (
                subprocess.run(
                    cmd + m.get('tests', []), capture_output=True
                ).returncode
                != 0
            )
        finally:
            # Someone edited the file while it held the mutant (CRM loop tick
            # 7, 01.10.2026: a batch ran in the background while the next
            # item was about to be written). Writing `original` back would
            # erase that edit without a word -- keep it beside the file.
            try:
                now = io.open(f, encoding='utf-8').read()
            except OSError:
                now = mutated
            if now != mutated:
                kept = f + '.edited-during-mutants'
                io.open(kept, 'w', encoding='utf-8').write(now)
                print(f'WARNING  {f} changed during mutation #{i + 1}: the edit '
                      f'(mutant included) is kept in {kept}')
            io.open(f, 'w', encoding='utf-8').write(original)
            if os.path.exists(jp):
                os.remove(jp)
        print(f'{"killed  " if killed else "SURVIVED"}  #{i + 1} {f}: {label}')
        survived += 0 if killed else 1

    print(f'-- {len(muts) - survived} of {len(muts)} killed --')
    # tri gate: the verdict, stamped with the tree it ran on -- for a list
    # that lives in the repo. A one-off list from a scratch folder is an
    # experiment, not a gate: loop turn 10 (27.09.2026) found three of them
    # holding `tri gate` red forever as "stale", with nothing to re-run.
    root = subprocess.run(
        ['git', 'rev-parse', '--show-toplevel'], capture_output=True, text=True
    ).stdout.strip()
    listed = os.path.realpath(args[0])
    if root and listed.startswith(os.path.realpath(root) + os.sep):
        subprocess.run([
            'node', os.path.join(os.path.dirname(__file__), 'gate.mjs'),
            'record',
            f'mutants {os.path.basename(args[0])}',
            'fail' if survived else 'ok',
            f'{len(muts) - survived}/{len(muts)} killed',
        ])
    else:
        print('(a list outside the repo: not recorded for tri gate)')
    if survived:
        print('a survivor is a rule no test holds: add the vector that tells')
        print('the mutant from the code (in the spec too, if one is bound).')
    return 1 if survived else 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        # Ctrl-C or SIGTERM: `finally` already put the file back.
        print('interrupted -- the mutated file was restored')
        sys.exit(130)
