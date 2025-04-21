import { processApiResponse } from '@/helpers/error/processApiResponse'

describe('processApiResponse', () => {
  it('returns string if output is string', async () => {
    expect(await processApiResponse('hello')).toBe('hello')
  })

  it('returns first element if output is array', async () => {
    expect(await processApiResponse(['first', 'second'])).toBe('first')
  })

  it('returns output property if output is object with output', async () => {
    const obj = { output: 'value', other: 123 }
    expect(await processApiResponse(obj as any)).toBe('value')
  })

  it('throws error for invalid api response', async () => {
    await expect(processApiResponse(123 as any)).rejects.toThrow(
      /Некорректный ответ от API/
    )
  })
})
