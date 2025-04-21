import { getUserPhotoUrl } from '@/middlewares/getUserPhotoUrl'

describe('getUserPhotoUrl', () => {
  let ctx: any
  const userId = 55

  beforeEach(() => {
    ctx = {
      telegram: {
        token: 'TOKEN',
        getUserProfilePhotos: jest.fn(),
        getFile: jest.fn(),
      },
    }
    jest.clearAllMocks()
  })

  it('returns null when no photos', async () => {
    ctx.telegram.getUserProfilePhotos.mockResolvedValue({ total_count: 0 })
    await expect(getUserPhotoUrl(ctx, userId)).resolves.toBeNull()
  })

  it('returns null when file_path missing', async () => {
    ctx.telegram.getUserProfilePhotos.mockResolvedValue({
      total_count: 1,
      photos: [[{ file_id: 'fid' }]],
    })
    ctx.telegram.getFile.mockResolvedValue({})
    await expect(getUserPhotoUrl(ctx, userId)).resolves.toBeNull()
  })

  it('returns full URL when file_path present', async () => {
    ctx.telegram.getUserProfilePhotos.mockResolvedValue({
      total_count: 1,
      photos: [[{ file_id: 'f1' }, { file_id: 'f2' }]],
    })
    ctx.telegram.getFile.mockResolvedValue({ file_path: 'path/to.jpg' })
    const url = await getUserPhotoUrl(ctx, userId)
    expect(url).toBe(`https://api.telegram.org/file/botTOKEN/path/to.jpg`)
  })

  it('throws error when getUserProfilePhotos errors', async () => {
    const err = new Error('nope')
    ctx.telegram.getUserProfilePhotos.mockRejectedValue(err)
    await expect(getUserPhotoUrl(ctx, userId)).rejects.toThrow(err)
  })
})
