import fs from 'fs'
import path from 'path'
import FormData from 'form-data'

// Mock helpers.ensureDirectoryExistence
jest.mock('@/helpers', () => ({ ensureDirectoryExistence: jest.fn().mockResolvedValue(undefined) }))
// Mock axios
jest.mock('axios')
import axios from 'axios'
const mockedAxios = axios as jest.Mocked<typeof axios>

import * as lipSyncModule from '@/services/generateLipSync'
import { downloadFile } from '@/services/generateLipSync'

describe('downloadFile', () => {
  let writer: any
  beforeEach(() => {
    jest.resetModules()
    // Mock fs.createWriteStream
    const { EventEmitter } = require('events')
    writer = new EventEmitter()
    writer.close = jest.fn()
    jest.spyOn(fs, 'createWriteStream').mockReturnValue(writer)
  })

  it('resolves when stream closes without error', async () => {
    const stream = { pipe: jest.fn((dest: any) => dest.emit('close')) }
    mockedAxios.get.mockResolvedValue({ data: stream } as any)
    await expect(lipSyncModule.downloadFile('url', '/tmp/f')).resolves.toBeUndefined()
    expect(stream.pipe).toHaveBeenCalledWith(writer)
  })

  it('rejects when writer errors', async () => {
    const stream = { pipe: jest.fn((dest: any) => dest.emit('error', new Error('fail'))) }
    mockedAxios.get.mockResolvedValue({ data: stream } as any)
    await expect(lipSyncModule.downloadFile('url', '/tmp/f')).rejects.toThrow('fail')
  })
})

describe('generateLipSync', () => {
  let generateLipSync: any
  let ctx: any

  beforeEach(() => {
    jest.resetModules()
    // Prepare mocks
    jest.spyOn(fs, 'createReadStream').mockReturnValue('<stream>' as any)
    jest.spyOn(path, 'join').mockImplementation((...parts: string[]) => parts.join('/'))
    // Ensure directory
    const { ensureDirectoryExistence } = require('@/helpers')
    ensureDirectoryExistence.mockResolvedValue(undefined)
    // Mock downloadFile
    jest.spyOn(lipSyncModule, 'downloadFile').mockResolvedValue(undefined)
    // Mock axios.post
    mockedAxios.post.mockResolvedValue({ data: { message: 'ok', resultUrl: 'url' } } as any)
    // Suppress logs
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    ctx = { from: {}, reply: jest.fn() }
    // Default config mock
    jest.doMock('@/config', () => ({ isDev: false, ELESTIO_URL: 'https://api', LOCAL_SERVER_URL: 'http://localhost', SECRET_API_KEY: 'secret' }))
    // Import under test
    ({ generateLipSync } = require('@/services/generateLipSync'))
  })

  it('uploads files and posts formData to create-lip-sync in production', async () => {
    const result = await generateLipSync('vUrl', 'aUrl', '42', 'bot')
    // download video and audio
    expect(lipSyncModule.downloadFile).toHaveBeenCalledWith('vUrl', expect.stringContaining('tmp/temp_video.mp4'))
    expect(lipSyncModule.downloadFile).toHaveBeenCalledWith('aUrl', expect.stringContaining('tmp/temp_audio.mp3'))
    // axios.post called
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api/generate/create-lip-sync',
      expect.any(FormData),
      expect.objectContaining({ headers: expect.objectContaining({ 'x-secret-key': 'secret' }) })
    )
    expect(result).toEqual({ message: 'ok', resultUrl: 'url' })
  })

  it('uses LOCAL_SERVER_URL when isDev true', async () => {
    jest.doMock('@/config', () => ({ isDev: true, ELESTIO_URL: 'https://api', LOCAL_SERVER_URL: 'http://localhost', SECRET_API_KEY: 'secret' }))
    jest.resetModules()
    jest.doMock('axios', () => axios)
    ({ generateLipSync } = require('@/services/generateLipSync'))
    await generateLipSync('vUrl', 'aUrl', '42', 'bot')
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://localhost/generate/create-lip-sync',
      expect.any(FormData),
      expect.any(Object)
    )
  })

  it('throws new error when axios.isAxiosError', async () => {
    mockedAxios.post.mockRejectedValue(new Error('api fail'))
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(true)
    await expect(generateLipSync('vUrl', 'aUrl', '42', 'bot')).rejects.toThrow('Error occurred while generating lip sync')
  })

  it('propagates non-axios errors', async () => {
    // simulate downloadFile throwing
    jest.spyOn(lipSyncModule, 'downloadFile').mockRejectedValue(new Error('fs fail'))
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(false)
    await expect(generateLipSync('vUrl', 'aUrl', '42', 'bot')).rejects.toThrow('fs fail')
  })
})