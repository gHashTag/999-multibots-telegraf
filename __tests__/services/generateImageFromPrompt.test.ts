import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { generateImageFromPrompt } from '@/services/generateImageFromPrompt'

describe('generateImageFromPrompt', () => {
  beforeEach(() => {
    // Mock console.log
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('returns dummy URL and logs parameters with all args', async () => {
    const result = await generateImageFromPrompt('hello', 123, 'styleX', 'neg', '800x600')
    expect(result).toBe('https://example.com/generated_image.png')
    expect(console.log).toHaveBeenCalledWith('Генерация изображения:', {
      prompt: 'hello',
      userId: 123,
      style: 'styleX',
      negative_prompt: 'neg',
      size: '800x600',
    })
  })

  it('works without optional args', async () => {
    const result = await generateImageFromPrompt('hi', 42)
    expect(result).toBe('https://example.com/generated_image.png')
    expect(console.log).toHaveBeenCalledWith('Генерация изображения:', {
      prompt: 'hi',
      userId: 42,
      style: undefined,
      negative_prompt: undefined,
      size: undefined,
    })
  })
})