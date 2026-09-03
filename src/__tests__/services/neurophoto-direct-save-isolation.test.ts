/**
 * A local-save failure must NOT skip delivery in generateNeuroPhotoDirect.
 *
 * The user is charged up front, then each image runs saveFileLocally -> Pulse ->
 * sendPhoto inside one big try whose catch (saveError) only logged. saveFileLocally
 * (a network download + disk write, which rethrows on non-200 / timeout / disk
 * error) was the FIRST statement in that try, so a transient save failure jumped
 * straight to saveError, SKIPPED the whole delivery block (sendPhoto), yet
 * generatedUrls.push still counted the image and the summary reported success:
 * charged, no photo, no refund. Found by the #1649 scout fan-out.
 *
 * Fix: wrap only the saveFileLocally call in its OWN try/catch (catch
 * localSaveError) that logs and continues — the served reference is the remote
 * imageUrl anyway — so a save failure can no longer skip the sendPhoto delivery.
 *
 * Integration-only service -> structural assertion + mutation.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const src = fs.readFileSync('src/services/generateNeuroPhotoDirect.ts', 'utf8')

describe('generateNeuroPhotoDirect isolates the local save from delivery', () => {
  it('wraps saveFileLocally in its own try/catch (catch localSaveError)', () => {
    expect(src).toMatch(
      /let savedLocalPath[\s\S]{0,120}try \{[\s\S]{0,240}saveFileLocally\([\s\S]{0,260}\} catch \(localSaveError\)/
    )
  })

  it('the localSaveError handler continues (does not rethrow)', () => {
    const m = src.match(/catch \(localSaveError\) \{([\s\S]{0,500}?)\n {8,}\}/)
    expect(m, 'localSaveError catch block not found').toBeTruthy()
    expect(m![1]).not.toMatch(/throw/)
  })
})
