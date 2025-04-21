describe('deleteFileFromSupabase', () => {
  let deleteFileFromSupabase: typeof import('@/core/supabase/deleteFileFromSupabase').deleteFileFromSupabase
  const mockRemove = jest.fn()
  const mockFrom = jest.fn()
  const bucket = 'my-bucket'
  const filename = 'path/to/file.txt'

  beforeEach(() => {
    jest.resetModules()
    mockRemove.mockReset()
    // Mock supabase.storage.from(bucket).remove([...])
    mockFrom.mockImplementation(() => ({ remove: mockRemove }))
    jest.doMock('@/core/supabase', () => ({
      supabase: { storage: { from: mockFrom } },
    }))
    // Import under test
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      deleteFileFromSupabase =
        require('@/core/supabase/deleteFileFromSupabase').deleteFileFromSupabase
    })
  })

  it('calls remove with correct bucket and filename', async () => {
    mockRemove.mockResolvedValue({ data: ['ok'], error: null })
    await expect(
      deleteFileFromSupabase(bucket, filename)
    ).resolves.toBeUndefined()
    expect(mockFrom).toHaveBeenCalledWith(bucket)
    expect(mockRemove).toHaveBeenCalledWith([filename])
  })

  it('handles Supabase error without throwing', async () => {
    mockRemove.mockResolvedValue({ data: null, error: { message: 'fail' } })
    await expect(
      deleteFileFromSupabase(bucket, filename)
    ).resolves.toBeUndefined()
    expect(mockRemove).toHaveBeenCalled()
  })

  it('catches exception and does not throw', async () => {
    mockRemove.mockRejectedValue(new Error('unexpected'))
    await expect(
      deleteFileFromSupabase(bucket, filename)
    ).resolves.toBeUndefined()
    expect(mockRemove).toHaveBeenCalled()
  })
})
