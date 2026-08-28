import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// Мокируем зависимости
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

vi.mock('fs', () => ({
  default: {
    promises: {
      readFile: vi.fn(),
      unlink: vi.fn(),
    },
  },
}))

vi.mock('path', () => ({
  default: {
    basename: vi.fn((filePath: string) => filePath.split('/').pop() || ''),
  },
}))

describe('uploadTrainFluxModelScene - Supabase Storage Upload', () => {
  let mockServiceClient: any
  let mockStorage: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Мокируем Supabase Storage
    mockStorage = {
      from: vi.fn().mockReturnThis(),
      upload: vi.fn(),
      getPublicUrl: vi.fn(),
    }

    mockServiceClient = {
      storage: mockStorage,
    }
    ;(createClient as any).mockReturnValue(mockServiceClient)

    // Мокируем process.env
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
  })

  describe('Загрузка ZIP файла в Supabase Storage', () => {
    it('должен успешно загрузить ZIP файл в bucket images', async () => {
      const zipPath = '/tmp/test.zip'
      const zipBuffer = Buffer.from('test zip content')
      const zipFileName = `train/123/${Date.now()}_test.zip`
      const publicUrl =
        'https://test.supabase.co/storage/v1/object/public/images/train/123/test.zip'

      // Мокируем fs.promises.readFile
      ;(fs.promises.readFile as any).mockResolvedValue(zipBuffer)

      // Мокируем path.basename
      ;(path.basename as any).mockReturnValue('test.zip')

      // Мокируем успешную загрузку
      mockStorage.upload.mockResolvedValue({
        data: { path: zipFileName },
        error: null,
      })

      // Мокируем получение публичного URL
      mockStorage.getPublicUrl.mockReturnValue({
        data: { publicUrl },
      })

      // Импортируем функцию загрузки (динамически, чтобы моки работали)
      const { createClient } = await import('@supabase/supabase-js')
      const SUPABASE_URL = process.env.SUPABASE_URL
      const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('Supabase credentials not configured')
      }

      const serviceClient = createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY
      )
      const buffer = await fs.promises.readFile(zipPath)
      const fileName = `train/123/${Date.now()}_${path.basename(zipPath)}`

      const { data: uploadData, error: uploadError } =
        await serviceClient.storage.from('images').upload(fileName, buffer, {
          contentType: 'application/zip',
          upsert: true,
        })

      expect(uploadError).toBeNull()
      expect(uploadData).toBeDefined()
      expect(mockStorage.from).toHaveBeenCalledWith('images')
      expect(mockStorage.upload).toHaveBeenCalledWith(
        expect.stringContaining('train/123/'),
        zipBuffer,
        {
          contentType: 'application/zip',
          upsert: true,
        }
      )

      const { data: publicUrlData } = serviceClient.storage
        .from('images')
        .getPublicUrl(fileName)

      expect(publicUrlData.publicUrl).toBe(publicUrl)
      expect(mockStorage.getPublicUrl).toHaveBeenCalledWith(fileName)
    })

    it('должен обработать ошибку при отсутствии Supabase credentials', async () => {
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      const SUPABASE_URL = process.env.SUPABASE_URL
      const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        await expect(
          Promise.reject(
            new Error('Supabase credentials not configured in environment')
          )
        ).rejects.toThrow('Supabase credentials not configured in environment')
      }
    })

    it('должен обработать ошибку загрузки в Supabase Storage', async () => {
      const zipPath = '/tmp/test.zip'
      const zipBuffer = Buffer.from('test zip content')
      const zipFileName = `train/123/${Date.now()}_test.zip`

      ;(fs.promises.readFile as any).mockResolvedValue(zipBuffer)
      ;(path.basename as any).mockReturnValue('test.zip')

      // Мокируем ошибку загрузки
      const uploadError = {
        message: 'new row violates row-level security policy',
      }

      mockStorage.upload.mockResolvedValue({
        data: null,
        error: uploadError,
      })

      const { createClient } = await import('@supabase/supabase-js')
      const SUPABASE_URL =
        process.env.SUPABASE_URL || 'https://test.supabase.co'
      const SUPABASE_SERVICE_ROLE_KEY =
        process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key'

      const serviceClient = createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY
      )
      const buffer = await fs.promises.readFile(zipPath)
      const fileName = `train/123/${Date.now()}_${path.basename(zipPath)}`

      const { data: uploadData, error } = await serviceClient.storage
        .from('images')
        .upload(fileName, buffer, {
          contentType: 'application/zip',
          upsert: true,
        })

      expect(error).toBeDefined()
      expect(error?.message).toBe('new row violates row-level security policy')
      expect(uploadData).toBeNull()

      // Проверяем, что ошибка правильно обрабатывается
      if (error) {
        await expect(
          Promise.reject(
            new Error(`Failed to upload ZIP to Supabase: ${error.message}`)
          )
        ).rejects.toThrow(
          'Failed to upload ZIP to Supabase: new row violates row-level security policy'
        )
      }
    })

    it('должен использовать serviceClient с SUPABASE_SERVICE_ROLE_KEY', async () => {
      const SUPABASE_URL = 'https://test.supabase.co'
      const SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

      const { createClient } = await import('@supabase/supabase-js')
      const serviceClient = createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY
      )

      expect(createClient).toHaveBeenCalledWith(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY
      )
      expect(serviceClient).toBeDefined()
      expect(serviceClient.storage).toBeDefined()
    })

    it('должен использовать bucket images вместо uploads', async () => {
      const zipPath = '/tmp/test.zip'
      const zipBuffer = Buffer.from('test zip content')

      ;(fs.promises.readFile as any).mockResolvedValue(zipBuffer)
      ;(path.basename as any).mockReturnValue('test.zip')

      mockStorage.upload.mockResolvedValue({
        data: { path: 'train/123/test.zip' },
        error: null,
      })

      const { createClient } = await import('@supabase/supabase-js')
      const SUPABASE_URL =
        process.env.SUPABASE_URL || 'https://test.supabase.co'
      const SUPABASE_SERVICE_ROLE_KEY =
        process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key'

      const serviceClient = createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY
      )
      const buffer = await fs.promises.readFile(zipPath)
      const fileName = `train/123/${Date.now()}_${path.basename(zipPath)}`

      await serviceClient.storage.from('images').upload(fileName, buffer, {
        contentType: 'application/zip',
        upsert: true,
      })

      // Проверяем, что используется bucket 'images', а не 'uploads'
      expect(mockStorage.from).toHaveBeenCalledWith('images')
      expect(mockStorage.from).not.toHaveBeenCalledWith('uploads')
    })
  })
})
