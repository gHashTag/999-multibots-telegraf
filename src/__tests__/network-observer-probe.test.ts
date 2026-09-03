import { describe, it, expect } from 'vitest'
import fs from 'fs'
import axios from 'axios'

/**
 * Negative control for the network observer itself.
 *
 * `npm run test:network` answers "does any test really reach the network".
 * A zero from it is only worth something if the observer can SEE the client the
 * code actually uses. It could not: the first version hooked `fetch` alone,
 * while axios in Node goes through the http/https transport, so axios traffic
 * was invisible. Measured, not assumed -- a probe making both calls produced
 * one log line out of two, and the report still said "no test reaches the
 * network".
 *
 * So the census now carries its own control: two calls on two different
 * clients, and an assertion that both were recorded. If someone narrows the
 * observer again, this goes red during the census instead of the census
 * quietly going blind.
 *
 * Both calls go to a dead LOCAL port. Nothing leaves the machine, and the
 * report counts them separately from real traffic.
 *
 * Runs only under DETECT_NETWORK=1: without it there is no log to assert
 * against, and an ordinary suite run should not make calls at all.
 */
const PROBE_HOST = 'http://127.0.0.1:1'
const LOG = process.env.NETWORK_LOG || '/tmp/vitest-network.log'

describe.skipIf(!process.env.DETECT_NETWORK)(
  'network observer sees both clients',
  () => {
    it('records a fetch call and an axios call alike', async () => {
      await expect(fetch(`${PROBE_HOST}/fetch-probe`)).rejects.toBeDefined()
      await expect(axios.get(`${PROBE_HOST}/axios-probe`)).rejects.toBeDefined()

      const log = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8') : ''
      expect(log).toContain('/fetch-probe')
      // The half that was missing: axios does not go through fetch.
      expect(log).toContain('/axios-probe')
    })
  }
)
