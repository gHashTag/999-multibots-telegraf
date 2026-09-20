/**
 * WHERE ONE PERSON'S BROWSER ACTUALLY RUNS.
 *
 * The broker must not know whether a pod is a container on this machine or a
 * machine on a cloud with an API, because that answer is going to change: the
 * pod was proven locally first (docker), and the place it belongs in
 * production is a platform that can start and stop a machine per session.
 * Everything the broker needs is behind this interface, so swapping the
 * platform is a new file here and nothing else.
 *
 * WHAT A DRIVER MUST NEVER LEAK. `endpoint` is where the viewer stream is
 * served INSIDE our network. It does not travel to the client: the broker
 * hands out a path through itself instead. A pod address in a browser is an
 * address anybody can try, and the thing behind it is somebody's logged-in
 * browser.
 *
 * Measured 2026-09-20: the pod answers on 8080 about 9.5 s after start and
 * costs ~743 MiB at rest with ~0% CPU when nobody is watching. Those two
 * numbers are why sessions are started on demand and stopped when idle rather
 * than kept warm.
 */

export interface PodHandle {
  /** What the driver calls this pod. Internal; never sent to a client. */
  podId: string
  /** host:port of the viewer stream, inside our network. Never sent out. */
  endpoint: string
  /**
   * host:port of the pod's CDP bridge -- how an AGENT drives the same browser
   * the person is watching. Inside our network, never published, never sent
   * to a client: whoever reaches CDP reads every cookie in the profile.
   */
  cdpEndpoint: string
}

export interface StartInput {
  sessionId: string
  /**
   * The person's profile, which outlives this session. Everything the whole
   * product is for -- the accounts they signed into themselves -- lives here.
   */
  profileId: string
  /** Lets the person watch and take over. This one they receive. */
  viewToken: string
  /** Lets the holder change the room itself. This one they never receive. */
  adminToken: string
}

export interface PodDriver {
  readonly name: string
  start(input: StartInput): Promise<PodHandle>
  stop(podId: string): Promise<void>
  alive(podId: string): Promise<boolean>
  /** The red button: the person's logins, gone. Not part of stopping. */
  wipeProfile(profileId: string): Promise<void>
}

/** Injected so the driver can be tested without a container runtime. */
export type Exec = (file: string, args: string[]) => Promise<{ stdout: string }>

export const DEFAULT_POD_IMAGE = 'f0-pod:v3'

/**
 * WHY A POD NEEDS A PORT OF ITS OWN FOR THE PICTURE.
 *
 * Signalling rides the proxy; WebRTC media does not. Left alone, the pod
 * offers ICE candidates on its container address, the viewer cannot reach
 * them, and the whole thing fails exactly as measured 2026-09-20:
 *
 *   ICE connection state changed: failed
 *   undeclaredMediaProcessor failed to open SrtpSession
 *
 * The cure is to give the pod one muxed UDP port, publish it on the host
 * unchanged, and tell the pod which address to advertise (NAT1TO1). The port
 * must be identical inside and out, because the number is what goes into the
 * candidate.
 */
/** Where neko's Chromium keeps the profile; read from its own launch config. */
export const PROFILE_PATH = '/home/neko/.config/chromium'

/**
 * The port the pod's socat bridge listens on. Chromium's own CDP stays on
 * loopback inside the container -- it ignores --remote-debugging-address --
 * so the bridge is the only way in, and it is bound to LOOPBACK OF THE HOST
 * here, never to a public interface.
 */
export const CDP_BRIDGE_PORT = 9223

/**
 * Seconds Chromium is given to shut down before it is killed.
 *
 * THIS IS NOT A TIDINESS SETTING. Chromium writes session cookies to disk on
 * a clean exit; a killed browser loses exactly what this whole feature
 * exists to keep. `docker rm -f` sends SIGKILL, so stopping goes through
 * `docker stop` first and only then removes the container.
 */
export const STOP_GRACE_SECONDS = 15

export const MUX_PORT_MIN = 52000
export const MUX_PORT_MAX = 52999

/** One volume per profile. The id is opaque, so the name says nothing. */
export function volumeNameFor(profileId: string): string {
  return `browser-profile-${profileId}`
}

export function pickMuxPort(random: () => number = Math.random): number {
  return MUX_PORT_MIN + Math.floor(random() * (MUX_PORT_MAX - MUX_PORT_MIN + 1))
}

/**
 * A pod per session as a local container. This is the driver the pod was
 * proven with, and it stays useful after the cloud driver exists: it is what
 * a developer runs, and what the tests of everything above it run against.
 */
export function dockerDriver(opts: {
  exec: Exec
  image?: string
  /** Screen the person will see. Bigger costs more pixels to encode. */
  screen?: string
  /** Address the pod should advertise for media. Not where it listens. */
  advertise?: string
  random?: () => number
}): PodDriver {
  const image = opts.image || DEFAULT_POD_IMAGE
  const screen = opts.screen || '1280x800@30'
  const advertise = opts.advertise || '127.0.0.1'
  const nameOf = (sessionId: string) => `browser-${sessionId}`

  return {
    name: 'docker',

    async start(input) {
      const podId = nameOf(input.sessionId)
      /*
       * The person's password IS the session's view token, so watching the
       * room and holding the token are the same thing and there is no shared
       * password to leak. The admin password is a different secret the client
       * never sees: whoever has it can change the room, and the client has no
       * business doing that to a browser we are responsible for.
       *
       * Port 0 lets the host pick a free one -- sessions come and go, and a
       * fixed port would collide with the next person's pod.
       */
      const mux = pickMuxPort(opts.random)
      await opts.exec('docker', [
        'run',
        '-d',
        '--name',
        podId,
        '--shm-size=1g',
        '-e',
        `NEKO_DESKTOP_SCREEN=${screen}`,
        '-e',
        `NEKO_MEMBER_MULTIUSER_USER_PASSWORD=${input.viewToken}`,
        '-e',
        `NEKO_MEMBER_MULTIUSER_ADMIN_PASSWORD=${input.adminToken}`,
        '-e',
        `NEKO_WEBRTC_UDPMUX=${mux}`,
        '-e',
        `NEKO_WEBRTC_TCPMUX=${mux}`,
        '-e',
        `NEKO_WEBRTC_NAT1TO1=${advertise}`,
        '-v',
        `${volumeNameFor(input.profileId)}:${PROFILE_PATH}`,
        '-p',
        '0:8080',
        /* Loopback only: the agent runs here, the internet does not. */
        '-p',
        `127.0.0.1:0:${CDP_BRIDGE_PORT}`,
        /* Same number inside and out: the candidate carries the number. */
        '-p',
        `${mux}:${mux}/udp`,
        '-p',
        `${mux}:${mux}/tcp`,
        image,
      ])

      const { stdout } = await opts.exec('docker', ['port', podId, '8080'])
      const endpoint = firstMapping(stdout)
      const cdp = await opts.exec('docker', [
        'port',
        podId,
        String(CDP_BRIDGE_PORT),
      ])
      const cdpEndpoint = firstMapping(cdp.stdout)
      if (!endpoint || !cdpEndpoint) {
        await opts.exec('docker', ['rm', '-f', podId]).catch(() => undefined)
        throw new Error(`pod ${podId} started but published no port`)
      }
      return { podId, endpoint, cdpEndpoint }
    },

    async stop(podId) {
      /* Graceful first -- see STOP_GRACE_SECONDS. Killing loses the logins. */
      await opts
        .exec('docker', ['stop', '-t', String(STOP_GRACE_SECONDS), podId])
        .catch(() => undefined)
      await opts.exec('docker', ['rm', '-f', podId])
    },

    async wipeProfile(profileId) {
      await opts.exec('docker', [
        'volume',
        'rm',
        '-f',
        volumeNameFor(profileId),
      ])
    },

    async alive(podId) {
      try {
        const { stdout } = await opts.exec('docker', [
          'inspect',
          '-f',
          '{{.State.Running}}',
          podId,
        ])
        return stdout.trim() === 'true'
      } catch {
        /* An inspect that fails means no such container, which is not alive. */
        return false
      }
    },
  }
}

/**
 * WHICH DRIVER THIS DEPLOYMENT HAS, OR HONESTLY NONE.
 *
 * Railway runs the broker but cannot run pods: no API to start a machine per
 * session, and no way to publish the UDP range WebRTC needs. So the driver is
 * chosen by configuration and the absence of one is a real answer -- the
 * route then refuses with "not configured" instead of failing somewhere
 * deeper and looking like a broken browser.
 */
/**
 * A POD THAT IS ALREADY THERE, BECAUSE RAILWAY CANNOT MAKE ONE PER SESSION.
 *
 * Railway is this project's hosting, and it runs containers happily -- but it
 * has no API to start a machine for a visit and stop it after, and no UDP for
 * WebRTC (neko's TCP mux covers that, through a Railway TCP proxy). So on
 * Railway a pod is a SERVICE somebody provisioned once, and this driver hands
 * that one out.
 *
 * WHAT THAT COSTS, said plainly rather than discovered later:
 *
 *   - One browser, not one per client. The broker still refuses to give it to
 *     two people (telegram_id is the primary key of `browser_sessions`), so
 *     the second person is told no rather than shown somebody else's mail.
 *   - `stop` cannot stop it: a Railway service does not scale to zero on
 *     request. It is a no-op here, and the idle reaper therefore frees
 *     nothing. The row still goes, so the session ends and the viewer's token
 *     stops working -- which is the part that matters for safety.
 *   - The profile is whatever that service has on its volume. `wipeProfile`
 *     cannot reach it from here and says so by failing, rather than
 *     pretending somebody was forgotten.
 *
 * None of this is a compromise of the architecture: it is the same
 * `PodDriver` seam, with the platform's real shape behind it.
 */
export function fixedDriver(opts: {
  endpoint: string
  /** Where the agent reaches this pod. Absent means agents cannot drive it. */
  cdpEndpoint?: string
}): PodDriver {
  const endpoint = opts.endpoint.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const cdp = (opts.cdpEndpoint || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
  return {
    name: 'fixed',
    async start() {
      return { podId: `fixed:${endpoint}`, endpoint, cdpEndpoint: cdp }
    },
    async stop() {
      /* Nothing to stop. The session row is dropped by the caller. */
    },
    async alive() {
      /*
       * It is a provisioned service: if it is down, the proxy fails and the
       * person sees that. Claiming it is dead here would make the broker
       * start a "new" one, which is the same pod, on a loop.
       */
      return true
    },
    async wipeProfile() {
      throw new Error(
        'this deployment cannot wipe the profile: the pod is a provisioned service'
      )
    },
  }
}

export function driverFromEnv(
  env: Record<string, string | undefined>,
  exec: Exec
): PodDriver | null {
  const choice = (env.BROWSER_POD_DRIVER || '').trim().toLowerCase()
  if (choice === 'fixed') {
    const endpoint = (env.BROWSER_POD_ENDPOINT || '').trim()
    /* Configured as "fixed" with nowhere to point is not configured. */
    return endpoint
      ? fixedDriver({
          endpoint,
          cdpEndpoint: (env.BROWSER_POD_CDP || '').trim(),
        })
      : null
  }
  if (choice === 'docker') {
    return dockerDriver({
      exec,
      image: env.BROWSER_POD_IMAGE,
      screen: env.BROWSER_POD_SCREEN,
    })
  }
  return null
}

/**
 * `docker port` prints one line per mapping and can print several: IPv4 and
 * IPv6 for the same port. Any one of them reaches the pod, so the first
 * usable line wins -- but an empty answer must not be read as success, which
 * is why this returns null instead of a half-formed address.
 */
export function firstMapping(stdout: string): string | null {
  for (const line of stdout.split('\n')) {
    const value = line.trim()
    if (!value) continue
    /* Shapes seen: "0.0.0.0:32768" and ":::32768". */
    const port = value.split(':').pop()
    if (!port || !/^\d+$/.test(port)) continue
    return `127.0.0.1:${port}`
  }
  return null
}
