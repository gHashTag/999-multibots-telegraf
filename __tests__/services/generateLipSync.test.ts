import fs from 'fs'
import path from 'path'
import FormData from 'form-data'
import { EventEmitter } from 'events'

// Mock helpers.ensureDirectoryExistence
jest.mock('@/helpers', () => ({
  ensureDirectoryExistence: jest.fn().mockResolvedValue(undefined),
}))

// Mock axios
jest.mock('axios')
import axios from 'axios'
const mockedAxios = axios as jest.Mocked<typeof axios>

import * as lipSyncModule from '@/services/generateLipSync'
import { downloadFile } from '@/services/generateLipSync'
import * as helpersModule from '@/helpers'

// Типизация мока helpers.ensureDirectoryExistence
const mockedEnsureDirectoryExistence =
  helpersModule.ensureDirectoryExistence as jest.MockedFunction<
    typeof helpersModule.ensureDirectoryExistence
  >

describe('downloadFile', () => {
  let writer: EventEmitter & { close: jest.Mock }

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()

    // Mock fs.createWriteStream
    writer = new EventEmitter() as EventEmitter & { close: jest.Mock }
    writer.close = jest.fn()
    jest
      .spyOn(fs, 'createWriteStream')
      .mockReturnValue(writer as unknown as fs.WriteStream)
  })

  it('resolves when stream closes without error', async () => {
    const stream = { pipe: jest.fn((dest: any) => dest.emit('close')) }
    mockedAxios.get.mockResolvedValue({ data: stream } as any)

    await expect(
      lipSyncModule.downloadFile('url', '/tmp/f')
    ).resolves.toBeUndefined()

    expect(stream.pipe).toHaveBeenCalledWith(writer)
    expect(mockedAxios.get).toHaveBeenCalledWith('url', {
      responseType: 'stream',
    })
  })

  it('rejects when writer errors', async () => {
    const stream = {
      pipe: jest.fn((dest: any) => dest.emit('error', new Error('fail'))),
    }
    mockedAxios.get.mockResolvedValue({ data: stream } as any)

    await expect(lipSyncModule.downloadFile('url', '/tmp/f')).rejects.toThrow(
      'fail'
    )

    expect(mockedAxios.get).toHaveBeenCalledWith('url', {
      responseType: 'stream',
    })
  })
})

describe('generateLipSync', () => {
  let generateLipSync: typeof lipSyncModule.generateLipSync
  let ctx: { from: any; reply: jest.Mock }

  // Подготавливаем типизированные моки
  let mockCreateReadStream: jest.SpyInstance
  let mockJoin: jest.SpyInstance
  let mockDownloadFile: jest.SpyInstance

  beforeEach(() => {
    jest.resetModules()

    // Prepare mocks
    mockCreateReadStream = jest
      .spyOn(fs, 'createReadStream')
      .mockReturnValue('<stream>' as unknown as fs.ReadStream)

    mockJoin = jest
      .spyOn(path, 'join')
      .mockImplementation((...parts: string[]) => parts.join('/'))

    mockDownloadFile = jest
      .spyOn(lipSyncModule, 'downloadFile')
      .mockResolvedValue(undefined)

    // Mock axios.post
    mockedAxios.post.mockResolvedValue({
      data: { message: 'ok', resultUrl: 'url' },
    })

    // Suppress logs
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})

    ctx = { from: {}, reply: jest.fn() }

    // Default config mock
    jest.doMock('@/config', () => ({
      isDev: false,
      ELESTIO_URL: 'https://api',
      LOCAL_SERVER_URL: 'http://localhost',
      SECRET_API_KEY: 'secret',
    }))

    // Import under test
    ;({ generateLipSync } = require('@/services/generateLipSync'))
  })

  it('uploads files and posts formData to create-lip-sync in production', async () => {
    const result = await generateLipSync('vUrl', 'aUrl', '42', 'bot')

    // Проверяем вызов downloadFile для видео и аудио
    expect(mockDownloadFile).toHaveBeenCalledWith(
      'vUrl',
      expect.stringContaining('tmp/temp_video.mp4')
    )
    expect(mockDownloadFile).toHaveBeenCalledWith(
      'aUrl',
      expect.stringContaining('tmp/temp_audio.mp3')
    )

    // Проверяем вызов axios.post с правильными параметрами
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api/generate/create-lip-sync',
      expect.any(FormData),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-secret-key': 'secret' }),
      })
    )

    expect(result).toEqual({ message: 'ok', resultUrl: 'url' })
  })

  it('uses LOCAL_SERVER_URL when isDev true', async () => {
    // Переопределяем конфигурацию для dev-режима
    jest.doMock('@/config', () => ({
      isDev: true,
      ELESTIO_URL: 'https://api',
      LOCAL_SERVER_URL: 'http://localhost',
      SECRET_API_KEY: 'secret',
    }))

    jest.resetModules()

    jest.doMock('axios', () => axios)
    ;({ generateLipSync } = require('@/services/generateLipSync'))

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

    await expect(generateLipSync('vUrl', 'aUrl', '42', 'bot')).rejects.toThrow(
      'Error occurred while generating lip sync'
    )
  })

  it('propagates non-axios errors', async () => {
    // simulate downloadFile throwing
    mockDownloadFile.mockRejectedValue(new Error('fs fail'))
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(false)

    await expect(generateLipSync('vUrl', 'aUrl', '42', 'bot')).rejects.toThrow(
      'fs fail'
    )
  })
})
