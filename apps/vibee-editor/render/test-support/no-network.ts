/**
 * NO RENDER TEST REACHES THE NETWORK: the render's setup file
 * (vitest.config.mts) installs the guard every suite here shares.
 *
 * Found 2026-10-08: the full run passed all 7339 tests and still ended red on
 * 11 "getaddrinfo ENOTFOUND www.reddit.com" -- the blog-share desk's Reddit
 * leg read r/t27ai's live state from inside two tests, and the sign-in notice
 * sent a real sendMessage from a third. Why and how it works:
 * apps/vibee-editor/packages/test-guard/no-network.mjs.
 */
import { afterAll, afterEach, expect } from 'vitest'
import { installNoNetwork } from '../../packages/test-guard/no-network.mjs'

export {
  drainReached,
  failIfReached,
  hostOf,
  isLoopback,
  neverResolves,
} from '../../packages/test-guard/no-network.mjs'

installNoNetwork({
  afterEach,
  afterAll,
  testPath: () => expect.getState().testPath,
})
