import { describe, expect, it } from 'vitest'
import { authorizeUrl, FACEBOOK_SCOPES, THREADS_SCOPES } from './meta-connect'

/**
 * Facebook Login for Business takes a saved configuration (`config_id`)
 * instead of a scope list. The app "Trinity S³AI" uses it, so the dialog
 * must be able to send one; Threads keeps its scopes regardless.
 */
const params = (url: string) => new URL(url).searchParams

describe('authorizeUrl with META_LOGIN_CONFIG_ID', () => {
  it('facebook sends config_id and no scope when it is set', () => {
    const p = params(
      authorizeUrl('facebook', '1', 's', { META_LOGIN_CONFIG_ID: ' 42 ' })
    )
    expect(p.get('config_id')).toBe('42')
    expect(p.get('override_default_response_type')).toBe('true')
    expect(p.has('scope')).toBe(false)
    expect(p.get('response_type')).toBe('code')
    expect(p.get('state')).toBe('s')
  })

  it('facebook falls back to the scope list without it', () => {
    const p = params(authorizeUrl('facebook', '1', 's', {}))
    expect(p.get('scope')).toBe(FACEBOOK_SCOPES)
    expect(p.has('config_id')).toBe(false)
  })

  it('threads ignores it and keeps its own scopes', () => {
    const url = authorizeUrl('threads', '1', 's', {
      META_LOGIN_CONFIG_ID: '42',
    })
    expect(url.startsWith('https://threads.net/oauth/authorize?')).toBe(true)
    expect(params(url).get('scope')).toBe(THREADS_SCOPES)
    expect(params(url).has('config_id')).toBe(false)
  })
})
