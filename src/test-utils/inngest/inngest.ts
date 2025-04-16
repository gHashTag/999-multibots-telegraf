import { InngestFunction, EventSchemas } from 'inngest'
import { InngestTestEngine } from '@inngest/test'
import { ImageToVideoEvent } from '@/inngest-functions/imageToVideo.inngest'

export interface InngestEvent<T = any> {
  name: string
  data: T
  ts?: number
  id?: string
  version?: string
}

interface TestResult<T = any> {
  steps?: Array<{
    id: string
    name: string
    data: any
    error?: Error
  }>
  output?: T
  result?: T
  error?: Error
}

export const createTestEngine = <
  TFunction extends InngestFunction<any, any, any>,
>(
  fn: TFunction
) => {
  return new InngestTestEngine({
    function: fn,
    steps: [],
  })
}

export const executeTest = async <TEventData = any, TResult = any>(
  engine: InngestTestEngine,
  event: InngestEvent<TEventData>
): Promise<TResult> => {
  try {
    console.log('Executing test with event:', event)

    const result = (await engine.execute({
      events: [
        {
          name: event.name,
          data: event.data,
          ts: event.ts || Date.now(),
          id: event.id || 'test-' + Date.now(),
        },
      ],
    })) as TestResult<TResult>

    console.log('Test execution result:', result)

    if (result.error) {
      throw result.error
    }

    if (!result.output && !result.result) {
      throw new Error('No result found in test execution')
    }

    return (result.output || result.result) as TResult
  } catch (error) {
    console.error('Test execution failed:', error)
    throw error
  }
}
