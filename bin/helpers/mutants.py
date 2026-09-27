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
The file is restored in `finally`, on Ctrl-C too. Exit 1 when any survived.
"""
import io
import os
import json
import signal
import subprocess
import sys


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


def main() -> int:
    args = sys.argv[1:]
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
    survived = 0
    for i, m in enumerate(muts):
        f = m['file']
        original = io.open(f, encoding='utf-8').read()
        try:
            io.open(f, 'w', encoding='utf-8').write(
                original.replace(m['from'], m['to'], 1)
            )
            killed = (
                subprocess.run(
                    cmd + m.get('tests', []), capture_output=True
                ).returncode
                != 0
            )
        finally:
            io.open(f, 'w', encoding='utf-8').write(original)
        label = m.get('name') or m['from'].strip().splitlines()[0][:60]
        print(f'{"killed  " if killed else "SURVIVED"}  #{i + 1} {f}: {label}')
        survived += 0 if killed else 1

    print(f'-- {len(muts) - survived} of {len(muts)} killed --')
    # tri gate: the verdict, stamped with the tree it ran on.
    subprocess.run([
        'node', os.path.join(os.path.dirname(__file__), 'gate.mjs'), 'record',
        f'mutants {os.path.basename(args[0])}',
        'fail' if survived else 'ok',
        f'{len(muts) - survived}/{len(muts)} killed',
    ])
    if survived:
        print('a survivor is a rule no test holds: add the vector that tells')
        print('the mutant from the code (in the spec too, if one is bound).')
    return 1 if survived else 0


if __name__ == '__main__':
    sys.exit(main())
