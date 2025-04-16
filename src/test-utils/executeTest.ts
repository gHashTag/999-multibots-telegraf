import { MyContext } from '@/interfaces/telegram-bot.interface'

export interface TestParams {
  modelName: string
  modelFile: string
  telegramId: string
  ctx: MyContext
}

export const executeTest = async (params: TestParams) => {
  const { modelName, modelFile, telegramId, ctx } = params
  
  // Mock file system operations
  const mockFs = {
    existsSync: () => true,
    statSync: () => ({ size: 1024 * 1024 }) // 1MB file
  }

  // Mock API response
  const mockApiResponse = {
    success: true,
    data: {
      url: 'https://test-url.com/model',
      requestId: '123-456'
    }
  }

  return {
    mockFs,
    mockApiResponse,
    params
  }
} 