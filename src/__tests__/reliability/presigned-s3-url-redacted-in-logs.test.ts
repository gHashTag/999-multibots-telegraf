/**
 * Presigned S3 URLs must be redacted before logging.
 *
 * getSignedUrl (@aws-sdk/s3-request-presigner) mints a URL whose query carries
 * X-Amz-Signature (a time-limited bearer capability — expiresIn=604800 / 7 days) and
 * X-Amz-Credential (the access key id). Anyone with Inngest/Railway log-read access
 * could then GET/PUT that object for a week. The render pipeline logged the full URL
 * at several sites; each must log only the base URL (url.split('?')[0]) — dropping
 * the SigV4 query. Class of #1105 (bot tokens in logs).
 *
 * Integration-only render code -> structural assertions + mutation.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const R = 'src/inngest_app/functions/render'
const s3 = fs.readFileSync(`${R}/helpers/s3.service.ts`, 'utf8')
const renderSteps = fs.readFileSync(`${R}/helpers/renderSteps.ts`, 'utf8')
const steps = fs.readFileSync(`${R}/steps.ts`, 'utf8')
const render = fs.readFileSync(`${R}/render.ts`, 'utf8')

describe('presigned S3 URLs are redacted in render-pipeline logs', () => {
  it('s3.service redacts BOTH presigned URL logs (upload + download)', () => {
    const splits = s3.match(/url: url\.split\('\?'\)\[0\]/g) || []
    expect(
      splits.length,
      's3.service must redact both presigned URL logs'
    ).toBe(2)
  })

  it('renderSteps redacts the download URL log (no bare downloadUrl)', () => {
    expect(renderSteps).toMatch(/downloadUrl: downloadUrl\.split\('\?'\)\[0\]/)
    expect(renderSteps).not.toMatch(
      /logger\.info\('Generated download URL', \{ downloadUrl \}\)/
    )
  })

  it('steps redacts the result + existing-audio URL logs', () => {
    expect(steps).toMatch(/resultUrl\.split\('\?'\)\[0\]/)
    expect(steps).toMatch(/audioUrl\.split\('\?'\)\[0\]/)
    expect(steps).not.toMatch(/S3 for job \$\{job_id\}: \$\{resultUrl\}`/)
    expect(steps).not.toMatch(/existing audio URL: \$\{audioUrl\}`/)
  })

  it('render redacts the result URL log', () => {
    expect(render).toMatch(/uploadResult\.downloadUrl\.split\('\?'\)\[0\]/)
    expect(render).not.toMatch(/Result URL: \$\{uploadResult\.downloadUrl\}`/)
  })
})
