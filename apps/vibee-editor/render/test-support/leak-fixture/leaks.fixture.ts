import { it } from 'vitest'

// The shape of the 2026-10-08 leak: a reader asks reddit.com and the caller
// swallows the failure, so nothing in the test itself turns red.
it('reads a community and swallows the failure', async () => {
  await fetch('https://www.reddit.com/r/t27ai/about.json').catch(() => null)
})
