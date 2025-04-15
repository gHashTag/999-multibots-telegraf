import mock from '@/test-utils/core/mock'

type InngestHandler = (...args: any[]) => Promise<any>

export const mockInngestFunction = (handler: InngestHandler) => {
  return {
    handler: mock.create(handler),
  }
}

export const mockStep = {
  run: mock.create((name: string, fn: InngestHandler) => fn()),
}
