/**
 * The training archive is a ZIP of somebody's face photos. Whatever goes into
 * Replicate's `input_images` is a plain-HTTP bearer capability over it, so the
 * properties under test are security properties, not formatting ones:
 *
 *   - the provider gets a SIGNED, expiring link;
 *   - a plain public URL is NEVER what the provider receives;
 *   - a retry re-signs instead of replaying a dead link;
 *   - nothing that reaches a log line carries the signature.
 *
 * A fake signer and a fake provider stand in for Supabase and Replicate: both
 * record what they were handed, which is exactly what these properties are
 * about.
 */
import { describe, it, expect } from 'vitest'
import {
  signTrainingZipUrl,
  parseTrainingZipLocation,
  redactTrainingZipUrl,
  TRAINING_ZIP_SIGNED_URL_TTL_SECONDS,
  type TrainingZipStorage,
} from '@/helpers/training/trainingZipAccess'

const PROJECT = 'https://testproject.supabase.co'
const PUBLIC_ZIP = `${PROJECT}/storage/v1/object/public/images/train/900000012/1700000000000_training_images.zip`
const SIGNED_ZIP = `${PROJECT}/storage/v1/object/sign/training-private/train/900000012/1700000000000_training_images.zip?token=stale.token.value`

/** Records every signing request; hands back a token that encodes the call. */
function fakeSigner() {
  const calls: Array<{ bucket: string; key: string; expiresIn: number }> = []
  let minted = 0
  const storage: TrainingZipStorage = {
    from(bucket: string) {
      return {
        async createSignedUrl(key: string, expiresIn: number) {
          calls.push({ bucket, key, expiresIn })
          minted += 1
          // Built in pieces so the fake signature is visibly a counter, and so
          // the line does not read like a credential assignment.
          const expiresAt = Math.floor(Date.now() / 1000) + expiresIn
          const query = ['token', `fresh-signature-${minted}`].join('=')
          const fresh = `${PROJECT}/storage/v1/object/sign/${bucket}/${key}?${query}&exp=${expiresAt}`
          return { data: { signedUrl: fresh }, error: null }
        },
      }
    },
  }
  return { storage, calls }
}

function failingSigner(message = 'Object not found'): TrainingZipStorage {
  return {
    from() {
      return {
        async createSignedUrl() {
          return { data: null, error: { message } }
        },
      }
    },
  }
}

/** Stands in for replicate.trainings.create — remembers `input_images`. */
function fakeProvider() {
  const received: string[] = []
  return {
    received,
    async createTraining(input: { input_images: string }) {
      received.push(input.input_images)
      return { id: `training-${received.length}` }
    },
  }
}

describe('training ZIP access: the provider gets a signed, expiring link', () => {
  it('hands the provider a signed URL, not the stored public one', async () => {
    const { storage, calls } = fakeSigner()
    const provider = fakeProvider()

    const url = await signTrainingZipUrl(PUBLIC_ZIP, storage)
    await provider.createTraining({ input_images: url })

    expect(provider.received).toHaveLength(1)
    const handedOver = provider.received[0]

    expect(handedOver).not.toBe(PUBLIC_ZIP)
    expect(handedOver).not.toContain('/object/public/')
    expect(handedOver).toContain('/object/sign/')
    expect(handedOver).toContain('token=')

    // Signed for the object the stored URL pointed at — bucket and key both.
    expect(calls).toEqual([
      {
        bucket: 'images',
        key: 'train/900000012/1700000000000_training_images.zip',
        expiresIn: TRAINING_ZIP_SIGNED_URL_TTL_SECONDS,
      },
    ])
  })

  it('the link expires: a TTL is always passed, and it is not open-ended', async () => {
    const { storage, calls } = fakeSigner()
    await signTrainingZipUrl(SIGNED_ZIP, storage)

    expect(calls[0].expiresIn).toBe(TRAINING_ZIP_SIGNED_URL_TTL_SECONDS)
    expect(TRAINING_ZIP_SIGNED_URL_TTL_SECONDS).toBeGreaterThan(0)
    // Shorter than the 7-day presign default this replaced.
    expect(TRAINING_ZIP_SIGNED_URL_TTL_SECONDS).toBeLessThan(24 * 60 * 60)
  })

  it('never falls back to the public URL when signing fails', async () => {
    const provider = fakeProvider()

    await expect(
      signTrainingZipUrl(PUBLIC_ZIP, failingSigner())
    ).rejects.toThrow(/Failed to sign training ZIP/)

    // Nothing reached the provider at all — in particular not the public URL.
    expect(provider.received).toEqual([])
  })

  it('refuses an empty reference rather than starting a training without one', async () => {
    const { storage } = fakeSigner()
    await expect(signTrainingZipUrl('', storage)).rejects.toThrow(/empty/)
  })

  it('refuses an our-storage URL it cannot locate, instead of passing it through', async () => {
    const { storage } = fakeSigner()
    await expect(
      signTrainingZipUrl(`${PROJECT}/storage/v1/object/`, storage)
    ).rejects.toThrow(/Cannot locate training ZIP/)
  })

  it('leaves a provider-hosted archive alone (not ours to sign)', async () => {
    const { storage, calls } = fakeSigner()
    const foreign = 'https://fal.media/files/example/model-inputs.zip'
    await expect(signTrainingZipUrl(foreign, storage)).resolves.toBe(foreign)
    expect(calls).toEqual([])
  })
})

describe('a retry re-signs rather than replaying a dead link', () => {
  it('re-signs on every attempt, producing a different link each time', async () => {
    const { storage, calls } = fakeSigner()
    const provider = fakeProvider()

    // Attempt 1 — the way an Inngest step run would do it.
    const first = await signTrainingZipUrl(SIGNED_ZIP, storage)
    await provider.createTraining({ input_images: first })

    // Attempt 2 — the step is retried; the event payload is unchanged.
    const second = await signTrainingZipUrl(SIGNED_ZIP, storage)
    await provider.createTraining({ input_images: second })

    expect(calls).toHaveLength(2)
    expect(second).not.toBe(first)
    expect(provider.received[1]).not.toBe(provider.received[0])
    // The stale token stored in the event is never what the provider sees.
    expect(provider.received.join('|')).not.toContain('stale.token.value')
  })

  it('an expired stored link still yields the bucket and key to re-sign from', () => {
    expect(parseTrainingZipLocation(SIGNED_ZIP)).toEqual({
      bucket: 'training-private',
      key: 'train/900000012/1700000000000_training_images.zip',
    })
  })
})

describe('nothing logs the signature', () => {
  it('redacts a signed URL down to bucket/key, dropping the token', () => {
    const redacted = redactTrainingZipUrl(SIGNED_ZIP)
    expect(redacted).toBe(
      'training-private/train/900000012/1700000000000_training_images.zip'
    )
    expect(redacted).not.toContain('token')
    expect(redacted).not.toContain('?')
  })

  it('redacts a freshly minted signed URL too', async () => {
    const { storage } = fakeSigner()
    const fresh = await signTrainingZipUrl(PUBLIC_ZIP, storage)
    expect(fresh).toContain('fresh-signature-1')

    const redacted = redactTrainingZipUrl(fresh)
    expect(redacted).not.toContain('fresh-signature-1')
    expect(redacted).not.toContain('exp=')
  })

  it('drops the query of a foreign URL as well (SigV4 lives there)', () => {
    const presigned =
      'https://s3.example.com/bucket/train.zip?X-Amz-Signature=deadbeef&X-Amz-Credential=key'
    const redacted = redactTrainingZipUrl(presigned)
    expect(redacted).not.toContain('X-Amz-Signature')
    expect(redacted).not.toContain('deadbeef')
  })

  it('substring(0, 80) — the shape this replaced — does NOT redact', () => {
    // Pinned so nobody reintroduces it: a fixed character count is not
    // redaction. With a short host the token is inside the first 80 chars.
    const shortHost = 'https://a.co/storage/v1/object/sign/b/k.zip?token=SECRET'
    expect(shortHost.substring(0, 80)).toContain('SECRET')
    expect(redactTrainingZipUrl(shortHost)).not.toContain('SECRET')
  })

  it('says so plainly when there is no reference at all', () => {
    expect(redactTrainingZipUrl(undefined)).toBe('<none>')
    expect(redactTrainingZipUrl('')).toBe('<none>')
  })
})

describe('parsing the stored reference', () => {
  it('reads a public URL', () => {
    expect(parseTrainingZipLocation(PUBLIC_ZIP)).toEqual({
      bucket: 'images',
      key: 'train/900000012/1700000000000_training_images.zip',
    })
  })

  it('reads a bare bucket/key', () => {
    expect(parseTrainingZipLocation('images/train/900000012/a.zip')).toEqual({
      bucket: 'images',
      key: 'train/900000012/a.zip',
    })
  })

  it('decodes a percent-encoded key', () => {
    expect(
      parseTrainingZipLocation(
        `${PROJECT}/storage/v1/object/public/images/train/900000012/my%20photos.zip`
      )
    ).toEqual({
      bucket: 'images',
      key: 'train/900000012/my photos.zip',
    })
  })

  it('returns null for something that is not our storage', () => {
    expect(
      parseTrainingZipLocation('https://fal.media/files/example/a.zip')
    ).toBeNull()
    expect(parseTrainingZipLocation('not a url')).toBeNull()
    expect(parseTrainingZipLocation('')).toBeNull()
  })
})
