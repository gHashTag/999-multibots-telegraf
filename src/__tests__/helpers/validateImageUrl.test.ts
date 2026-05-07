/**
 * Tests for validateImageUrl.ts
 *
 * Image URL validation with HTTP checks and magic bytes
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'

// Mock logger before imports
vi.mock('@/utils/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

import { validateImageUrl, ImageValidationResult } from '@/helpers/validateImageUrl'

describe('validateImageUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('successful validation', () => {
    it('should validate a valid JPEG image', async () => {
      // Mock HEAD request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            if (name === 'content-type') return 'image/jpeg'
            if (name === 'content-length') return '1000'
            return null
          },
        },
      })

      // Mock partial GET request for magic bytes
      const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 206,
        arrayBuffer: () => Promise.resolve(jpegBytes.buffer),
      })

      const result = await validateImageUrl('https://example.com/image.jpg')

      expect(result.isValid).toBe(true)
      expect(result.contentType).toBe('image/jpeg')
      expect(result.size).toBe(1000)
    })

    it('should validate a valid PNG image', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            if (name === 'content-type') return 'image/png'
            if (name === 'content-length') return '2000'
            return null
          },
        },
      })

      // PNG magic bytes
      const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 206,
        arrayBuffer: () => Promise.resolve(pngBytes.buffer),
      })

      const result = await validateImageUrl('https://example.com/image.png')

      expect(result.isValid).toBe(true)
      expect(result.contentType).toBe('image/png')
    })

    it('should accept application/octet-stream content type', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            if (name === 'content-type') return 'application/octet-stream'
            if (name === 'content-length') return '1000'
            return null
          },
        },
      })

      const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 206,
        arrayBuffer: () => Promise.resolve(jpegBytes.buffer),
      })

      const result = await validateImageUrl('https://example.com/image')

      expect(result.isValid).toBe(true)
    })
  })

  describe('HTTP error handling', () => {
    it('should return invalid for 404 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })

      const result = await validateImageUrl('https://example.com/notfound.jpg')

      expect(result.isValid).toBe(false)
      expect(result.reason).toContain('404')
      expect(result.status).toBe(404)
    })

    it('should return invalid for 500 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })

      const result = await validateImageUrl('https://example.com/error.jpg')

      expect(result.isValid).toBe(false)
      expect(result.reason).toContain('500')
    })

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await validateImageUrl('https://example.com/image.jpg')

      expect(result.isValid).toBe(false)
      expect(result.reason).toContain('Network error')
    })
  })

  describe('content type validation', () => {
    it('should reject non-image content types', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            if (name === 'content-type') return 'text/html'
            if (name === 'content-length') return '1000'
            return null
          },
        },
      })

      const result = await validateImageUrl('https://example.com/page.html')

      expect(result.isValid).toBe(false)
      expect(result.reason).toContain('Invalid content type')
    })

    it('should reject application/json', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            if (name === 'content-type') return 'application/json'
            if (name === 'content-length') return '100'
            return null
          },
        },
      })

      const result = await validateImageUrl('https://example.com/data.json')

      expect(result.isValid).toBe(false)
      expect(result.reason).toContain('Invalid content type')
    })
  })

  describe('file size validation', () => {
    it('should reject files larger than 20MB', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            if (name === 'content-type') return 'image/jpeg'
            if (name === 'content-length') return String(25 * 1024 * 1024) // 25MB
            return null
          },
        },
      })

      const result = await validateImageUrl('https://example.com/huge.jpg')

      expect(result.isValid).toBe(false)
      expect(result.reason).toContain('File too large')
    })

    it('should accept files under 20MB', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            if (name === 'content-type') return 'image/jpeg'
            if (name === 'content-length') return String(10 * 1024 * 1024) // 10MB
            return null
          },
        },
      })

      const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 206,
        arrayBuffer: () => Promise.resolve(jpegBytes.buffer),
      })

      const result = await validateImageUrl('https://example.com/large.jpg')

      expect(result.isValid).toBe(true)
    })
  })

  describe('magic bytes validation', () => {
    it('should reject files with invalid magic bytes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            if (name === 'content-type') return 'image/jpeg'
            if (name === 'content-length') return '1000'
            return null
          },
        },
      })

      // Invalid magic bytes (not an image)
      const invalidBytes = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 206,
        arrayBuffer: () => Promise.resolve(invalidBytes.buffer),
      })

      const result = await validateImageUrl('https://example.com/fake.jpg')

      expect(result.isValid).toBe(false)
      expect(result.reason).toContain('Invalid image signature')
    })

    it('should validate GIF images', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            if (name === 'content-type') return 'image/gif'
            if (name === 'content-length') return '1000'
            return null
          },
        },
      })

      // GIF magic bytes
      const gifBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38])
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 206,
        arrayBuffer: () => Promise.resolve(gifBytes.buffer),
      })

      const result = await validateImageUrl('https://example.com/animation.gif')

      expect(result.isValid).toBe(true)
    })

    it('should validate WebP images', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            if (name === 'content-type') return 'image/webp'
            if (name === 'content-length') return '1000'
            return null
          },
        },
      })

      // WebP magic bytes (RIFF....WEBP)
      const webpBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 206,
        arrayBuffer: () => Promise.resolve(webpBytes.buffer),
      })

      const result = await validateImageUrl('https://example.com/image.webp')

      expect(result.isValid).toBe(true)
    })
  })

  describe('partial download failure handling', () => {
    it('should still return valid if partial download fails but HEAD was ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            if (name === 'content-type') return 'image/jpeg'
            if (name === 'content-length') return '1000'
            return null
          },
        },
      })

      // Partial download fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      const result = await validateImageUrl('https://example.com/image.jpg')

      // Should still be valid since HEAD request passed
      expect(result.isValid).toBe(true)
    })
  })
})
