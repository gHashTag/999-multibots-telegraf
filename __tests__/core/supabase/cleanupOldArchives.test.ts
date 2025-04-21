describe('cleanupOldArchives', () => {
  let cleanupOldArchives: typeof import('@/core/supabase/cleanupOldArchives').cleanupOldArchives
  const mockList = jest.fn()
  const mockRemove = jest.fn()
  const mockStorageFrom = jest.fn()

  beforeEach(() => {
    jest.resetModules()
    mockList.mockReset()
    mockRemove.mockReset()
    // storage.from mock returns object with list and remove
    mockStorageFrom.mockImplementation(() => ({
      list: mockList,
      remove: mockRemove,
    }))
    jest.doMock('@/core/supabase', () => ({
      supabase: { storage: { from: mockStorageFrom } },
    }))
    // Import under test
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      cleanupOldArchives =
        require('@/core/supabase/cleanupOldArchives').cleanupOldArchives
    })
  })

  it('does nothing when list errors', async () => {
    mockList.mockResolvedValue({ data: null, error: { message: 'fail' } })
    await cleanupOldArchives('user1')
    expect(mockList).toHaveBeenCalledWith('training/user1')
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it('does nothing when only one file exists', async () => {
    const files = [{ name: 'file1.zip', created_at: '2025-01-01T00:00:00Z' }]
    mockList.mockResolvedValue({ data: files, error: null })
    await cleanupOldArchives('user2')
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it('removes all but latest file', async () => {
    const files = [
      {
        name: 'old.zip',
        created_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
      },
      {
        name: 'mid.zip',
        created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
      },
      {
        name: 'new.zip',
        created_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
      },
    ]
    mockList.mockResolvedValue({ data: files, error: null })
    await cleanupOldArchives('user3')
    // Should remove 'mid.zip' and 'old.zip'
    expect(mockRemove).toHaveBeenCalledTimes(2)
    expect(mockRemove).toHaveBeenCalledWith(['training/user3/mid.zip'])
    expect(mockRemove).toHaveBeenCalledWith(['training/user3/old.zip'])
  })
})
