import { beforeEach, describe, expect, it, vi } from 'vitest'

const { uploadMock, apiFetchMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  apiFetchMock: vi.fn(),
}))

vi.mock('@/config', () => ({ API_BASE: 'https://render.example' }))
vi.mock('@/lib/s3Upload', () => ({ uploadToS3: uploadMock }))
vi.mock('@/lib/apiFetch', () => ({ apiFetch: apiFetchMock }))

import { uploadChatAttachment } from './chatAttachments'

describe('uploadChatAttachment', () => {
  beforeEach(() => {
    uploadMock.mockReset()
    apiFetchMock.mockReset()
  })

  it('uploads and then registers the asset in the verified owner profile', async () => {
    uploadMock.mockResolvedValue(
      'https://render.example/s3/assets/uploaded-frame.jpg'
    )
    apiFetchMock.mockResolvedValue({ id: 77 })
    const file = new File(['frame'], 'frame.jpg', { type: 'image/jpeg' })

    const result = await uploadChatAttachment(file, 'image')

    expect(uploadMock).toHaveBeenCalledWith(
      file,
      'frame.jpg',
      undefined,
      undefined
    )
    expect(apiFetchMock).toHaveBeenCalledWith(
      'https://render.example/api/assets',
      {
        method: 'POST',
        signal: undefined,
        body: JSON.stringify({
          url: 'https://render.example/s3/assets/uploaded-frame.jpg',
          type: 'user_image',
        }),
      }
    )
    expect(result).toMatchObject({
      id: '77',
      kind: 'image',
      name: 'frame.jpg',
      url: 'https://render.example/s3/assets/uploaded-frame.jpg',
    })
  })

  it('fails instead of falling back to a local blob URL', async () => {
    uploadMock.mockResolvedValue(null)
    const file = new File(['scene'], 'scene.mp4', { type: 'video/mp4' })

    await expect(uploadChatAttachment(file, 'video')).rejects.toThrow(
      'upload-failed'
    )
    expect(apiFetchMock).not.toHaveBeenCalled()
  })

  it('passes one cancellation signal through upload and owner registration', async () => {
    uploadMock.mockResolvedValue(
      'https://render.example/s3/assets/uploaded-scene.mp4'
    )
    apiFetchMock.mockResolvedValue({ id: 78 })
    const controller = new AbortController()
    const file = new File(['scene'], 'scene.mp4', { type: 'video/mp4' })

    await uploadChatAttachment(file, 'video', controller.signal)

    expect(uploadMock).toHaveBeenCalledWith(
      file,
      'scene.mp4',
      undefined,
      controller.signal
    )
    expect(apiFetchMock.mock.calls[0][1].signal).toBe(controller.signal)
  })
})
