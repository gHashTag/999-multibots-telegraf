import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import axios from 'axios'
import { EventEmitter } from 'events'
jest.mock('fs', () => ({ createWriteStream: jest.fn() }))
import * as fs from 'fs'
jest.mock('axios')
import { downloadFile } from '@/services/generateLipSync'
describe('downloadFile', () => {
  let writer: EventEmitter
  beforeEach(() => {
    jest.clearAllMocks()
    writer = new EventEmitter()
    ;(fs.createWriteStream as jest.Mock).mockReturnValue(writer)
  })
  test('resolves when stream closes without error', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue({ data: { pipe: (dest: any) => dest.emit('close') } })
    await expect(downloadFile('url', 'path')).resolves.toBeUndefined()
    expect(axios.get).toHaveBeenCalledWith('url', { responseType: 'stream' })
  })
  test('rejects when stream emits error', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue({ data: { pipe: (dest: any) => setImmediate(() => dest.emit('error', new Error('fail'))) } })
    await expect(downloadFile('url', 'path')).rejects.toThrow('fail')
  })
})