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

Every `from` must occur exactly once (a pattern that matches nothing is a
mutation that never happened, and a green run would read as "survived").
The file is restored in `finally`, on Ctrl-C too. Exit 1 when any survived.
"""
import io
import json
import signal
import subprocess
import sys


def main() -> int:
    args = sys.argv[1:]
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
    for i, m in enumerate(muts):
        s = io.open(m['file'], encoding='utf-8').read()
        n = s.count(m['from'])
        if n != 1:
            print(f'#{i + 1} {m["file"]}: `from` occurs {n} times, need 1')
            return 2

    print('-- green run, no mutation --')
    if subprocess.run(cmd, capture_output=True).returncode != 0:
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
            killed = subprocess.run(cmd, capture_output=True).returncode != 0
        finally:
            io.open(f, 'w', encoding='utf-8').write(original)
        label = m.get('name') or m['from'].strip().splitlines()[0][:60]
        print(f'{"killed  " if killed else "SURVIVED"}  #{i + 1} {f}: {label}')
        survived += 0 if killed else 1

    print(f'-- {len(muts) - survived} of {len(muts)} killed --')
    if survived:
        print('a survivor is a rule no test holds: add the vector that tells')
        print('the mutant from the code (in the spec too, if one is bound).')
    return 1 if survived else 0


if __name__ == '__main__':
    sys.exit(main())
