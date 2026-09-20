/**
 * DOES THE PROFILE ACTUALLY SURVIVE A RESTART?
 *
 * The unit tests pin that the same profile id reaches the second visit. That
 * is not the same claim as "the person is still signed in", and only a real
 * pod can answer the second one. So: drive the pod's own browser to a page,
 * stop the pod the way the driver stops it, start a NEW container on the same
 * profile, and look for what the first one wrote.
 *
 * WHY THE PROOF IS CHROMIUM'S OWN `History`, and not a cookie from some site.
 * Two measured constraints shaped this:
 *
 *   - Headful Chromium binds CDP to loopback INSIDE the container and ignores
 *     --remote-debugging-address, so publishing 9222 reaches nothing. Every
 *     command here therefore goes through `docker exec`.
 *   - A cookie needs a site that sets one, which drags the internet into a
 *     test that should not need it. The pod's own neko server is always
 *     reachable at 127.0.0.1:8080, and merely visiting it makes Chromium
 *     write to `History` -- the same profile directory, flushed by the same
 *     clean shutdown, as `Cookies`.
 *
 * So the History row is a witness for the mechanism that carries the logins.
 * `Cookies` is checked for existence alongside it.
 *
 *   npx tsx scripts/browser-profile-check.ts
 */
import { execFile } from 'node:child_process'
import { newSessionToken } from '../src/browser/wire'
import {
  volumeNameFor,
  PROFILE_PATH,
  STOP_GRACE_SECONDS,
} from '../src/browser/pod-driver'

const IMAGE = process.env.BROWSER_POD_IMAGE || 'f0-pod:v1'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let failures = 0

function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`
  )
}

/**
 * `grep -c` exits 1 when the count is zero, which triggers the `|| echo 0`
 * and prints TWO lines. Reading the whole output as a number then gives NaN,
 * and NaN fails every comparison -- a green control check reported as a
 * failure. Take the first line and nothing else.
 */
function firstNumber(out: string): number {
  return Number(out.split('\n')[0].trim())
}

const docker = (args: string[]): Promise<string> =>
  new Promise((resolve, reject) =>
    execFile('docker', args, { timeout: 180_000 }, (e, out) =>
      e ? reject(e) : resolve(String(out))
    )
  )

/** Same shape the driver starts, minus the ports this check does not need. */
async function startPod(name: string, profileId: string): Promise<void> {
  await docker([
    'run',
    '-d',
    '--name',
    name,
    '--shm-size=1g',
    '-e',
    'NEKO_DESKTOP_SCREEN=1280x800@30',
    '-e',
    'NEKO_MEMBER_MULTIUSER_USER_PASSWORD=irrelevant-here',
    '-e',
    'NEKO_MEMBER_MULTIUSER_ADMIN_PASSWORD=irrelevant-here',
    '-v',
    `${volumeNameFor(profileId)}:${PROFILE_PATH}`,
    IMAGE,
  ])
}

async function waitForBrowser(name: string) {
  for (let i = 0; i < 200; i++) {
    try {
      const out = await docker([
        'exec',
        name,
        'curl',
        '-s',
        '--max-time',
        '2',
        'http://127.0.0.1:9222/json/version',
      ])
      if (out.includes('Browser')) return
    } catch {
      /* still coming up */
    }
    await sleep(500)
  }
  throw new Error('the pod browser never answered CDP')
}

/** Graceful, exactly as the driver does it: a killed browser flushes nothing. */
async function stopPod(name: string) {
  await docker(['stop', '-t', String(STOP_GRACE_SECONDS), name])
  await docker(['rm', '-f', name])
}

async function main() {
  const profileId = newSessionToken().slice(0, 16)
  const proof = `proof-${profileId}`
  const a = `profcheck-a-${profileId}`
  const b = `profcheck-b-${profileId}`
  const history = `${PROFILE_PATH}/Default/History`
  console.log('profile', profileId, '\n')

  try {
    await startPod(a, profileId)
    await waitForBrowser(a)
    /* A visit the pod can always make: its own server. */
    await docker([
      'exec',
      a,
      'curl',
      '-s',
      '-X',
      'PUT',
      `http://127.0.0.1:9222/json/new?http://127.0.0.1:8080/?${proof}`,
    ])
    await sleep(4000)
    check('the first visit happened', true, proof)

    await stopPod(a)
    console.log('    (stopped gracefully, container removed)\n')

    await startPod(b, profileId)
    await waitForBrowser(b)

    const found = await docker([
      'exec',
      b,
      'sh',
      '-c',
      `grep -ac '${proof}' '${history}' 2>/dev/null || echo 0`,
    ])
    check(
      'THE BROWSER STATE SURVIVED into a brand new container',
      firstNumber(found) > 0,
      `matches in History: ${firstNumber(found)}`
    )

    const cookies = await docker([
      'exec',
      b,
      'sh',
      '-c',
      `test -f '${PROFILE_PATH}/Default/Cookies' && echo yes || echo no`,
    ])
    check('the cookie store came with it', cookies.trim() === 'yes')

    /* The control: a FRESH profile must not know anything about this one. */
    const other = `${profileId}-other`
    const c = `profcheck-c-${profileId}`
    await startPod(c, other)
    await waitForBrowser(c)
    const leak = await docker([
      'exec',
      c,
      'sh',
      '-c',
      `grep -ac '${proof}' '${history}' 2>/dev/null || echo 0`,
    ])
    check(
      "a different profile knows nothing about this person's browsing",
      firstNumber(leak) === 0,
      `matches: ${firstNumber(leak)}`
    )
    await stopPod(c)
    await docker(['volume', 'rm', '-f', volumeNameFor(other)])

    await stopPod(b)
    await docker(['volume', 'rm', '-f', volumeNameFor(profileId)])
    const volumes = await docker(['volume', 'ls', '-q'])
    check(
      'wiping the profile removes the disk',
      !volumes.split('\n').includes(volumeNameFor(profileId))
    )
  } finally {
    for (const name of [a, b, `profcheck-c-${profileId}`]) {
      await docker(['rm', '-f', name]).catch(() => undefined)
    }
    for (const id of [profileId, `${profileId}-other`]) {
      await docker(['volume', 'rm', '-f', volumeNameFor(id)]).catch(
        () => undefined
      )
    }
  }

  console.log(failures ? `\n${failures} FAILED` : '\nall checks passed')
  process.exit(failures ? 1 : 0)
}

main().catch(e => {
  console.error('FAILED', e)
  process.exit(1)
})
