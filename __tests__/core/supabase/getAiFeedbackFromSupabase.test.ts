import { getAiFeedbackFromSupabase } from '@/core/supabase/getAiFeedbackFromSupabase'

describe('getAiFeedbackFromSupabase - input validation and env', () => {
  const validParams = {
    assistant_id: 'aid',
    report: 'This is a report',
    language_code: 'en',
    full_name: 'User Name',
  }
  const OLD_ENV = process.env
  beforeEach(() => {
    jest.resetModules()
    process.env = { ...OLD_ENV }
  })
  afterEach(() => {
    process.env = OLD_ENV
  })

  it('throws if assistant_id is missing', async () => {
    // @ts-ignore
    await expect(getAiFeedbackFromSupabase({ ...validParams, assistant_id: '' }))
      .rejects.toThrow('Assistant ID is not set')
  })

  it('throws if report is missing', async () => {
    // @ts-ignore
    await expect(getAiFeedbackFromSupabase({ ...validParams, report: '' }))
      .rejects.toThrow('Report is not set')
  })

  it('throws if language_code is missing', async () => {
    // @ts-ignore
    await expect(getAiFeedbackFromSupabase({ ...validParams, language_code: '' }))
      .rejects.toThrow('Language code is not set')
  })

  it('throws if full_name is missing', async () => {
    // @ts-ignore
    await expect(getAiFeedbackFromSupabase({ ...validParams, full_name: '' }))
      .rejects.toThrow('Full name is not set')
  })

  it('throws if OPENAI_API_KEY is not set', async () => {
    delete process.env.OPENAI_API_KEY
    await expect(getAiFeedbackFromSupabase(validParams))
      .rejects.toThrow('OpenAI API key is not set')
  })