import { EventEmitter } from 'events'

jest.mock('@/config') // Мокаем конфиг, чтобы избежать загрузки .env

// Mock axios.get and fs.createWriteStream
jest.mock('axios', () => ({ get: jest.fn() }))
jest.mock('fs', () => ({ createWriteStream: jest.fn() }))
import axios from 'axios'
import fs from 'fs'
import { downloadFile } from '@/services/generateLipSync'

describe('downloadFile', () => {
  const url = 'http://example.com/file'
  const outputPath = '/tmp/out'
  let writer: EventEmitter & { close: jest.Mock }
  let response: { data: any }
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    // Create fake writable stream
    writer = new EventEmitter() as any
    writer.close = jest.fn()
    ;(fs.createWriteStream as jest.Mock).mockReturnValue(writer)
    // Prepare response.data with pipe
    response = {
      data: { pipe: (dest: any) => process.nextTick(() => dest.emit('close')) },
    }
    ;(axios.get as jest.Mock).mockResolvedValue(response)
  })

  it('resolves when stream closes without error', async () => {
    await expect(downloadFile(url, outputPath)).resolves.toBeUndefined()
    expect(axios.get).toHaveBeenCalledWith(url, { responseType: 'stream' })
    expect(fs.createWriteStream).toHaveBeenCalledWith(outputPath)
  })

  it('rejects when writer emits error', async () => {
    // On pipe, emit error instead of close
    response = {
      data: {
        pipe: (dest: any) =>
          process.nextTick(() => dest.emit('error', new Error('stream err'))),
      },
    }
    ;(axios.get as jest.Mock).mockResolvedValue(response)
    await expect(downloadFile(url, outputPath)).rejects.toThrow('stream err')
  })
})
