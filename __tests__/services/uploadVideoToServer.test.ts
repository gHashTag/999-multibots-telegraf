
// Mock axios
jest.mock('axios')
import axios from 'axios'
const mockedAxios = axios as jest.Mocked<typeof axios>

// Mock config
jest.mock('@/config', () => ({
  isDev: false,
  ELESTIO_URL: 'https://ele.stio',
  LOCAL_SERVER_URL: 'http://localhost',
}))

import { uploadVideoToServer } from '@/services/uploadVideoToServer'

describe('uploadVideoToServer', () => {
  beforeEach(() => {
    jest.resetModules()
    mockedAxios.post.mockReset()
  })

  it('posts video upload request to server URL in production', async () => {
    // config.isDev=false -> use ELESTIO_URL
    mockedAxios.post.mockResolvedValue({ data: { ok: true } })
    const req = { videoUrl: 'http://video.mp4', telegram_id: '42', fileName: 'video.mp4' }
    await expect(uploadVideoToServer(req)).resolves.toBeUndefined()
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://ele.stio/video/upload',
      req,
      { headers: { 'Content-Type': 'application/json' } }
    )
  })

  it('posts to LOCAL_SERVER_URL when in dev', async () => {
    // Override dev
    jest.doMock('@/config', () => ({ isDev: true, ELESTIO_URL: 'https://ele.stio', LOCAL_SERVER_URL: 'http://localhost' }))
    const { uploadVideoToServer: uploadDev } = require('@/services/uploadVideoToServer')
    mockedAxios.post.mockResolvedValue({ data: {} })
    const req = { videoUrl: 'v', telegram_id: '1', fileName: 'f' }
    await expect(uploadDev(req)).resolves.toBeUndefined()
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://localhost/video/upload',
      req,
      { headers: { 'Content-Type': 'application/json' } }
    )
  })

  it('throws and logs error when axios.post fails', async () => {
    mockedAxios.post.mockRejectedValue(new Error('fail upload'))
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    await expect(uploadVideoToServer({ videoUrl: '', telegram_id: '', fileName: '' })).rejects.toThrow('fail upload')
    expect(errorSpy).toHaveBeenCalledWith('Error uploading video:', expect.any(Error))
    errorSpy.mockRestore()
  })
})