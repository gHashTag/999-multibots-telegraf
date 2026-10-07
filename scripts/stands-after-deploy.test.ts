/**
 * `tri stands-after-deploy` re-runs the phone stands after a mini-app deploy
 * and files ONE issue per failing stand + deploy.
 *
 * The CLI is driven through its seams (--deploys-from, --shots-from,
 * --doctor-from, STANDS_GH = a fake gh that records its calls), so no
 * railway, browser, dev server or GitHub is touched here.
 */
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  failingStands,
  issueTitle,
  latestSuccess,
  marker,
  planIssues,
} from '../bin/helpers/stands-after-deploy.mjs'

const CLI = resolve(__dirname, '../bin/helpers/stands-after-deploy.mjs')

const DEPLOYS = [
  {
    id: 'skip-1',
    status: 'SKIPPED',
    createdAt: '2026-10-07T10:08:11Z',
    meta: { commitHash: 'aaa' },
  },
  {
    id: 'dep-2',
    status: 'SUCCESS',
    createdAt: '2026-10-07T09:16:29Z',
    meta: { commitHash: 'bea9e92f8' },
  },
  {
    id: 'dep-1',
    status: 'SUCCESS',
    createdAt: '2026-10-06T09:16:29Z',
    meta: { commitHash: 'old' },
  },
]

// The shape `shot.mjs all` prints: state lines and assertions before each
// stand's verdict line.
const SHOTS = [
  'ok   default: 9 controls, target 44px, wider 0px, small 0, cut 0, overlap 0, order 0 · /x/story-palette-default-390-ru.png',
  '== shot green -- story-palette at 390px (ru)',
  'RED  open: 12 controls, target 44px, wider 0px, small 1, cut 0, overlap 0, order 0 · /x/crm-open-390-en.png',
  '       small   button "Send" 32x32',
  '== shot RED -- crm at 390px (en)',
  'could not measure: locator timed out',
  '== shot NOT MEASURED -- crm at 320px (ru)',
  '== shot NOT MEASURED -- my-story 390 ru',
].join('\n')

describe('latestSuccess', () => {
  it('takes the newest SUCCESS deploy, never a SKIPPED one', () => {
    expect(latestSuccess(DEPLOYS)).toEqual({
      id: 'dep-2',
      sha: 'bea9e92f8',
      at: '2026-10-07T09:16:29Z',
    })
    expect(latestSuccess([DEPLOYS[0]])).toBeNull()
  })
})

describe('failingStands', () => {
  it('groups failing runs by stand with the assertion and the screenshot', () => {
    const { down, stands } = failingStands(SHOTS)
    expect(down).toBe('')
    expect(stands.map(s => s.name)).toEqual(['crm', 'my-story'])
    const crm = stands[0]
    expect(crm.runs).toHaveLength(2)
    expect(crm.runs[0]).toMatchObject({
      width: '390',
      lang: 'en',
      verdict: 'RED',
    })
    expect(crm.runs[0].lines).toContain('small   button "Send" 32x32')
    expect(crm.runs[0].shots).toEqual(['/x/crm-open-390-en.png'])
    expect(crm.runs[1].lines).toEqual(['could not measure: locator timed out'])
  })

  it('a run that measured nothing is "down", not a stand failure', () => {
    const r = failingStands(
      '== shot NOT MEASURED -- all: dev server did not answer'
    )
    expect(r.down).toContain('dev server')
    expect(r.stands).toEqual([])
  })
})

describe('planIssues', () => {
  const stands = [{ name: 'crm' }, { name: 'my-story' }]
  it('never files the same stand + deploy twice, comments on an open one', () => {
    const issues = [
      {
        number: 7,
        title: issueTitle('crm'),
        state: 'OPEN',
        body: marker('crm', 'dep-1'),
      },
      {
        number: 8,
        title: issueTitle('my-story'),
        state: 'CLOSED',
        body: '',
        comments: [{ body: marker('my-story', 'dep-2') }],
      },
    ]
    expect(planIssues(stands, { id: 'dep-2' }, issues)).toEqual([
      { kind: 'comment', stand: 'crm', number: 7 },
      { kind: 'skip', stand: 'my-story', number: 8 },
    ])
    expect(planIssues(stands, { id: 'dep-2' }, [])).toEqual([
      { kind: 'create', stand: 'crm' },
      { kind: 'create', stand: 'my-story' },
    ])
  })
})

describe('tri stands-after-deploy run (CLI, seams)', () => {
  const setup = () => {
    const dir = mkdtempSync(join(tmpdir(), 'stands-'))
    writeFileSync(join(dir, 'deploys.json'), JSON.stringify(DEPLOYS))
    writeFileSync(join(dir, 'shots.txt'), SHOTS)
    writeFileSync(join(dir, 'doctor.txt'), 'browser is not running\n')
    // A fake gh: `issue list` answers from issues.json; every `issue create`
    // or `comment` is appended to issues.json (with its body), as GitHub would.
    writeFileSync(join(dir, 'issues.json'), '[]')
    writeFileSync(
      join(dir, 'gh.mjs'),
      `import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
const dir = ${JSON.stringify(dir)}
const a = process.argv.slice(2)
appendFileSync(dir + '/calls.log', a.slice(0, 2).join(' ') + '\\n')
const db = JSON.parse(readFileSync(dir + '/issues.json', 'utf8'))
const val = k => a[a.indexOf(k) + 1]
if (a[0] === 'issue' && a[1] === 'list') console.log(JSON.stringify(db))
if (a[0] === 'issue' && a[1] === 'create') {
  db.push({ number: db.length + 1, title: val('--title'), state: 'OPEN', body: val('--body'), comments: [] })
  console.log('https://github.com/x/y/issues/' + db.length)
}
if (a[0] === 'issue' && a[1] === 'comment')
  db.find(i => i.number === Number(a[2])).comments.push({ body: val('--body') })
writeFileSync(dir + '/issues.json', JSON.stringify(db))
`
    )
    writeFileSync(
      join(dir, 'gh'),
      `#!/bin/sh\nexec node ${join(dir, 'gh.mjs')} "$@"\n`,
      {
        mode: 0o755,
      }
    )
    return dir
  }
  const run = (dir: string, extra: string[] = []) =>
    spawnSync(
      'node',
      [
        CLI,
        'run',
        '--state-dir',
        join(dir, 'state'),
        '--deploys-from',
        join(dir, 'deploys.json'),
        '--shots-from',
        join(dir, 'shots.txt'),
        '--doctor-from',
        join(dir, 'doctor.txt'),
        ...extra,
      ],
      { encoding: 'utf8', env: { ...process.env, STANDS_GH: join(dir, 'gh') } }
    )
  const calls = (dir: string, what: string) =>
    (existsSync(join(dir, 'calls.log'))
      ? readFileSync(join(dir, 'calls.log'), 'utf8')
      : ''
    )
      .split('\n')
      .filter(l => l === what).length

  it('files one issue per failing stand, and nothing again for the same deploy', () => {
    const dir = setup()
    try {
      const first = run(dir)
      expect(first.status).toBe(1)
      expect(first.stdout).toContain('== stands RED -- deploy dep-2')
      expect(calls(dir, 'issue create')).toBe(2)
      const issues = JSON.parse(readFileSync(join(dir, 'issues.json'), 'utf8'))
      expect(issues[0].body).toContain('## Boundary')
      expect(issues[0].body).toContain('small   button "Send" 32x32')
      expect(issues[0].body).toContain(marker('crm', 'dep-2'))
      expect(readFileSync(join(dir, 'state/last-deploy'), 'utf8')).toBe('dep-2')

      // The same deploy on the next tick: nothing to do at all.
      const again = run(dir)
      expect(again.status).toBe(0)
      expect(again.stdout).toContain('already checked')

      // Forced re-run of the SAME deploy: the marker dedupes, no new issue.
      const forced = run(dir, ['--force'])
      expect(forced.status).toBe(1)
      expect(calls(dir, 'issue create')).toBe(2)
      expect(calls(dir, 'issue comment')).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)

  it('a new deploy with the stand still red comments on the open issue', () => {
    const dir = setup()
    try {
      run(dir)
      const next = [
        { ...DEPLOYS[1], id: 'dep-3', createdAt: '2026-10-07T11:00:00Z' },
      ]
      writeFileSync(join(dir, 'deploys.json'), JSON.stringify(next))
      const r = run(dir)
      expect(r.status).toBe(1)
      expect(calls(dir, 'issue create')).toBe(2)
      expect(calls(dir, 'issue comment')).toBe(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)

  it('nothing measured: no issue, the deploy is retried, then given up', () => {
    const dir = setup()
    try {
      writeFileSync(
        join(dir, 'shots.txt'),
        '== shot NOT MEASURED -- all: vite died'
      )
      for (const n of [1, 2]) {
        const r = run(dir)
        expect(r.status).toBe(2)
        expect(r.stdout).toContain(`try ${n}/3`)
        expect(existsSync(join(dir, 'state/last-deploy'))).toBe(false)
      }
      expect(run(dir).stdout).toContain('giving up')
      expect(readFileSync(join(dir, 'state/last-deploy'), 'utf8')).toBe('dep-2')
      expect(calls(dir, 'issue create')).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
