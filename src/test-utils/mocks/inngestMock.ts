import { jest } from '@jest/globals'

type InngestHandler = (...args: any[]) => Promise<any>

export const mockInngestFunction = (handler: InngestHandler) => {
  return {
    handler: jest.fn(handler)
  }
}

export const mockStep = {
  run: jest.fn((name: string, fn: InngestHandler) => fn())
} 