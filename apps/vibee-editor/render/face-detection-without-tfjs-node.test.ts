import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Face detection without @tensorflow/tfjs-node.
 *
 * tfjs-node was removed from the render on purpose (#888). The default node
 * entry of @vladmandic/face-api requires it, and faceDetection.ts used to
 * import face-api at the top, so the whole module failed to load and every
 * process logged face cropping as an error. These tests run against the REAL
 * render node_modules, where tfjs-node is absent, exactly as in the image.
 */

const requireHere = createRequire(__filename)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('face detection without tfjs-node', () => {
  it('precondition: tfjs-node is not installed for the render', () => {
    // If someone re-adds it, the rest of this file stops proving anything
    // about its absence -- and the #888 audit decision should be revisited.
    expect(() => requireHere.resolve('@tensorflow/tfjs-node')).toThrow()
  })

  it('the module loads, and says once why detection cannot run', async () => {
    const face = await import('./src/lib/faceDetection')
    const warn = vi.spyOn(console, 'warn')
    const error = vi.spyOn(console, 'error')

    // Warm-up shape: loadModels refuses, it never pretends to be ready.
    await expect(face.loadModels()).rejects.toBeInstanceOf(
      face.FaceDetectionUnavailableError
    )
    expect(face.faceDetectionUnavailable()).toMatch(/tfjs-node/)

    // Every later call gets the same typed answer, with no log of its own.
    for (let i = 0; i < 3; i++) {
      await expect(
        face.detectFaceInImage('/nonexistent.png')
      ).rejects.toBeInstanceOf(face.FaceDetectionUnavailableError)
      await expect(
        face.detectFaceInVideo('/nonexistent.mp4')
      ).rejects.toBeInstanceOf(face.FaceDetectionUnavailableError)
    }
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('the fallback is the plain center crop', async () => {
    const face = await import('./src/lib/faceDetection')
    expect(face.CENTER_CROP).toEqual({ offsetX: 0, offsetY: 0, scale: 1 })
    expect(Object.isFrozen(face.CENTER_CROP)).toBe(true)
  })

  it('a detected box still turns into a crop (the real-detection path)', async () => {
    const face = await import('./src/lib/faceDetection')
    const crop = face.calculateCropSettings({
      x: 0.6,
      y: 0.1,
      width: 0.2,
      height: 0.2,
      centerX: 0.7,
      centerY: 0.2,
      confidence: 0.9,
    })
    expect(crop.offsetX).toBeCloseTo(-20)
    expect(crop.offsetY).toBeCloseTo(30)
    expect(crop.scale).toBeCloseTo(1.75)
  })
})

describe('callers fall back to the center crop', () => {
  const server = fs.readFileSync(
    path.join(__dirname, 'render-server.ts'),
    'utf8'
  )

  it('the engine state reaches faceCroppingUnavailable()', () => {
    // Without this the module loads, the engine does not, and both render
    // handlers would log "Face detection failed" for every single video.
    expect(server).toMatch(/faceApiReady\?\.faceDetectionUnavailable\(\)/)
  })

  it('/analyze-face answers 200 with the center crop, not 500', () => {
    const start = server.indexOf("req.url === '/analyze-face'")
    expect(start).toBeGreaterThan(-1)
    const next = server.indexOf('req.url === ', start + 40)
    expect(next).toBeGreaterThan(start)
    const handler = server.slice(start, next)
    const fallback = handler.indexOf('faceDetectionAvailable: false')
    expect(fallback).toBeGreaterThan(-1)
    expect(handler).toContain('if (!unavailable) throw detectError')
    expect(handler.slice(fallback)).toContain(
      'cropSettings: { offsetX: 0, offsetY: 0, scale: 1 }'
    )
  })
})
