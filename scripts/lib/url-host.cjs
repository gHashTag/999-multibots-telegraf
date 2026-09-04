/**
 * The host of a stored URL -- with the unparseable ones COUNTED, not dropped.
 *
 * probe-asset-links and probe-foreign-links both did
 *
 *     try { host = new URL(val).host } catch { continue }
 *
 * so a row whose stored URL does not parse vanished from the census entirely.
 * The probe then reported "N links across these hosts" over a population
 * quietly smaller than the one it read. That is the same shape as the
 * swallowed READ of it.178-179, one step further along: here the file is read
 * fine and the VALUE is unusable, which is if anything more interesting --
 * a malformed URL in the database is itself a defect worth seeing.
 *
 * These two probes need production credentials, so they cannot be run here.
 * The logic therefore lives in a library with its own self-check, which runs
 * at startup BEFORE any connection -- that much is verifiable without a
 * database.
 */

function hostCensus() {
  return {
    unparseable: [],

    /** Returns the host, or null having recorded why it could not. */
    hostOf(value) {
      try {
        return new URL(String(value)).host
      } catch {
        this.unparseable.push(String(value).slice(0, 120))
        return null
      }
    },

    /** One line, printed next to the verdict so the count is never bare. */
    note() {
      if (!this.unparseable.length) return 'неразбираемых адресов: 0'
      const first = this.unparseable.slice(0, 3).join(', ')
      const n = this.unparseable.length
      return `НЕРАЗБИРАЕМЫХ АДРЕСОВ: ${n} (не попали ни в один хост): ${first}`
    },
  }
}

/** Both directions: a census that cannot see a bad URL reports a clean repo. */
function selfCheck() {
  const c = hostCensus()
  if (c.hostOf('https://example.com/a.png') !== 'example.com')
    throw new Error('url-host: a valid URL did not yield its host')
  if (c.unparseable.length !== 0)
    throw new Error('url-host: a valid URL was recorded as unparseable')
  if (c.hostOf('not a url at all') !== null)
    throw new Error('url-host: a malformed URL did not return null')
  if (c.unparseable.length !== 1)
    throw new Error('url-host: a malformed URL was dropped instead of recorded')
  if (!c.note().includes('НЕРАЗБИРАЕМЫХ'))
    throw new Error('url-host: the note stays silent about a malformed URL')
}

module.exports = { hostCensus, selfCheck }
