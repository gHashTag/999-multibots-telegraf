import { describe, expect, it } from 'vitest'
import {
  contributorKeyPath,
  isContributorIdentity,
  safeContributionBody,
} from '../hive/contributor-keys-route'
import * as SPEC from './hive-contributor-keys.gen'

// Each spec test below exercises the actual render boundary. Provider and route
// I/O, ownership isolation and response redaction are exercised by the adapter's
// integration tests; the spec does not claim a live provider response.
const subject = '900000001'
const payload = (apiKey = 'test-fixture', label?: string) =>
  JSON.stringify({
    provider: 'nvidia',
    apiKey,
    ...(label === undefined ? {} : { label }),
  })

describe('hive contributor key spec binds to the render boundary', () => {
  it('only an allowed person session with a verified subject can manage keys', () => {
    for (const via of ['session', 'telegram']) {
      expect(isContributorIdentity(via, true, subject)).toBe(
        `telegram:${subject}`
      )
      expect(isContributorIdentity(via, false, subject)).toBeNull()
      expect(isContributorIdentity(via, true, null)).toBeNull()
    }
    for (const via of ['game', 'service', 'agent', '', 'unknown']) {
      expect(isContributorIdentity(via, true, subject)).toBeNull()
    }
  })

  it('the trusted subject is positive decimal within the digit limit', () => {
    for (const id of ['1', '9'.repeat(SPEC.MAX_SUBJECT_DIGITS)]) {
      expect(isContributorIdentity('session', true, id)).toBe(`telegram:${id}`)
    }
    for (const id of [
      '',
      '0',
      '00',
      '-1',
      '+1',
      '1e5',
      '12.3',
      ' 9',
      '9\n',
      '9'.repeat(SPEC.MAX_SUBJECT_DIGITS + 1),
    ]) {
      expect(isContributorIdentity('session', true, id)).toBeNull()
    }
  })

  it('the request body is bounded by UTF8 bytes including JSON whitespace', () => {
    const raw = payload()
    for (const bytes of [SPEC.BODY_MAX_BYTES - 1, SPEC.BODY_MAX_BYTES]) {
      expect(safeContributionBody(raw.padEnd(bytes))).toEqual({
        provider: 'nvidia',
        apiKey: 'test-fixture',
      })
    }
    expect(safeContributionBody(raw.padEnd(SPEC.BODY_MAX_BYTES + 1))).toBeNull()
    // Valid user text, short enough in code units but too long in UTF8 bytes.
    const unicode = payload('test-fixture', '\u00e9')
    expect(safeContributionBody(unicode.padEnd(SPEC.BODY_MAX_BYTES))).toBeNull()
  })

  it('secrets have a nonempty bounded printable value without whitespace', () => {
    for (const secret of ['x', 'x'.repeat(SPEC.MAX_SECRET_CHARS)]) {
      expect(safeContributionBody(payload(secret))?.apiKey).toBe(secret)
    }
    for (const secret of [
      '',
      'x'.repeat(SPEC.MAX_SECRET_CHARS + 1),
      'x y',
      ' x',
      'x ',
      'x\n',
      'x\r',
      'x\r\ny',
      'x\ty',
      'x\u0000y',
      '\u00e9',
    ]) {
      expect(safeContributionBody(payload(secret))).toBeNull()
    }
  })

  it('an optional label is bounded before trimming', () => {
    expect(safeContributionBody(payload('test-fixture'))).not.toBeNull()
    expect(safeContributionBody(payload('test-fixture', ''))).not.toBeNull()
    const label = 'L'.repeat(SPEC.MAX_LABEL_CHARS)
    expect(safeContributionBody(payload('test-fixture', label))?.label).toBe(
      label
    )
    expect(
      safeContributionBody(payload('test-fixture', ` ${label} `))
    ).toBeNull()
    expect(
      safeContributionBody(payload('test-fixture', ' label '))?.label
    ).toBe('label')
    expect(
      safeContributionBody(payload('test-fixture', `${label}L`))
    ).toBeNull()
  })

  it('only provider credentials and an optional label cross the boundary', () => {
    for (const provider of ['nvidia', 'zai']) {
      const value = { provider, apiKey: 'test-fixture' }
      expect(safeContributionBody(JSON.stringify(value))).toEqual(value)
    }
    for (const raw of [
      'null',
      '[]',
      'true',
      '"secret"',
      '{',
      JSON.stringify({ provider: 'unknown', apiKey: 'test-fixture' }),
      JSON.stringify({ provider: 'nvidia', apiKey: 1 }),
      JSON.stringify({ provider: 'nvidia', apiKey: 'test-fixture', label: 1 }),
    ]) {
      expect(safeContributionBody(raw)).toBeNull()
    }
    for (const field of [
      'owner',
      'github',
      'githubLogin',
      'url',
      'subject',
      'telegramId',
      'enabled',
    ]) {
      const value = {
        provider: 'nvidia',
        apiKey: 'test-fixture',
        [field]: 'untrusted',
      }
      expect(safeContributionBody(JSON.stringify(value))).toBeNull()
    }
  })

  it('key actions require the exact route and a safe signed integer', () => {
    expect(contributorKeyPath('/api/hive/keys')).toBe('/queen/contributor-keys')
    for (const id of [
      '0',
      '1',
      '-1',
      String(Number.MAX_SAFE_INTEGER),
      String(-Number.MAX_SAFE_INTEGER),
    ]) {
      for (const action of ['probe', 'enable', 'disable']) {
        expect(contributorKeyPath(`/api/hive/keys/${id}/${action}`)).toBe(
          `/queen/contributor-keys/${id}/${action}`
        )
      }
    }
    for (const path of [
      '/api/hive/keys/',
      '/api/hive/keys/1/delete',
      '/api/hive/keys/1/probe/extra',
      '/api/hive/keys/1/probe\n',
      '/api/hive/keys/1/probe?owner=other',
      '/api/hive/keys/../probe',
      '/api/hive/keys/1.5/probe',
      '/api/hive/keys/1e2/probe',
      '/api/hive/keys/9007199254740992/probe',
      '/api/hive/keys/-9007199254740992/probe',
      '/api/hive/keys/%31/probe',
      '/api/other/keys/1/probe',
    ]) {
      expect(contributorKeyPath(path)).toBeNull()
    }
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(1)
  })
})
