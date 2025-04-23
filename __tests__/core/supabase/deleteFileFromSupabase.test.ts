import * as supabaseModule from '@/core/supabase'
import { deleteFileFromSupabase } from '@/core/supabase/deleteFileFromSupabase'
import { logger } from '@/utils/logger'

// Мокаем зависимости
jest.mock('@/core/supabase', () => ({
  supabase: {
    storage: {
      from: jest.fn(),
    },
  },
}))

jest.mock('@/utils/logger')

// Типизируем моки
const mockedLogger = logger as jest.Mocked<typeof logger>
const mockedSupabase = supabaseModule.supabase as jest.Mocked<
  typeof supabaseModule.supabase
> & {
  storage: {
    from: jest.Mock
  }
}

describe('deleteFileFromSupabase', () => {
  const mockRemove = jest.fn()
  const bucket = 'my-bucket'
  const filename = 'path/to/file.txt'

  beforeEach(() => {
    jest.clearAllMocks()

    // Настраиваем моки
    mockedSupabase.storage.from.mockReturnValue({
      remove: mockRemove,
    })
  })

  it('calls remove with correct bucket and filename', async () => {
    mockRemove.mockResolvedValue({ data: ['ok'], error: null })

    await expect(
      deleteFileFromSupabase(bucket, filename)
    ).resolves.toBeUndefined()

    expect(mockedSupabase.storage.from).toHaveBeenCalledWith(bucket)
    expect(mockRemove).toHaveBeenCalledWith([filename])
    expect(mockedLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Successfully deleted file'),
      expect.objectContaining({
        bucket,
        filename,
      })
    )
  })

  it('handles Supabase error without throwing', async () => {
    const supabaseError = { message: 'fail' }
    mockRemove.mockResolvedValue({ data: null, error: supabaseError })

    await expect(
      deleteFileFromSupabase(bucket, filename)
    ).resolves.toBeUndefined()

    expect(mockRemove).toHaveBeenCalled()
    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error deleting file from Supabase'),
      expect.objectContaining({
        bucket,
        filename,
        error: supabaseError,
      })
    )
  })

  it('catches exception and does not throw', async () => {
    const unexpectedError = new Error('unexpected')
    mockRemove.mockRejectedValue(unexpectedError)

    await expect(
      deleteFileFromSupabase(bucket, filename)
    ).resolves.toBeUndefined()

    expect(mockRemove).toHaveBeenCalled()
    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Unexpected error deleting file from Supabase'),
      expect.objectContaining({
        bucket,
        filename,
        error: unexpectedError,
      })
    )
  })
})
