import { generateImageFromPrompt } from '@/services/generateImageFromPrompt'

describe('generateImageFromPrompt', () => {
  const prompt = 'test prompt'
  const userId = 123
  const style = 'styleX'
  const negative_prompt = 'no'
  const size = '1024x768'
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('logs the input parameters and returns fake URL', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    const url = await generateImageFromPrompt(
      prompt,
      userId,
      style,
      negative_prompt,
      size
    )
    expect(consoleLogSpy).toHaveBeenCalledWith('Генерация изображения:', {
      prompt,
      userId,
      style,
      negative_prompt,
      size,
    })
    expect(url).toBe('https://example.com/generated_image.png')
    consoleLogSpy.mockRestore()
  })
})