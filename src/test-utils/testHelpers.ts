import { Context, NarrowedContext } from 'telegraf'
import { Message, Update } from 'telegraf/typings/core/types/typegram'
import {
  SceneContext,
  SceneSessionData,
  WizardContext,
} from 'telegraf/typings/scenes'
import { Middleware } from 'telegraf'
import { MyContext } from '@/interfaces'
import * as inngest from '@/services/inngest'

export type TestResult = {
  name: string
  success: boolean
  error?: any
}

export enum TestCategory {
  SCENE_ENTRY = 'Scene Entry',
  MODEL_SELECTION = 'Model Selection',
  PROMPT_PROCESSING = 'Prompt Processing',
  IMAGE_UPLOAD = 'Image Upload',
  PAYMENT = 'Payment Processing',
  CANCELLATION = 'Cancellation',
  BALANCE = 'Balance Check',
  NAVIGATION = 'Navigation',
  VALIDATION = 'Input Validation',
}

/**
 * Creates a typed context object for testing
 */
export function createTypedContext(
  userId: number,
  username?: string
): MyContext {
  const ctx = {
    session: {
      __scenes: {} as SceneSessionData,
      user: {
        id: userId,
        username: username || 'testuser',
        isAdmin: false,
        hasActiveSubscription: false,
        language: 'en',
      },
      data: {},
    },
    scene: {
      enter: jest.fn(() => Promise.resolve()),
      reenter: jest.fn(() => Promise.resolve()),
      leave: jest.fn(() => Promise.resolve()),
    },
    wizard: {
      cursor: 0,
      next: jest.fn(),
      back: jest.fn(),
      selectStep: jest.fn(),
    },
    reply: jest.fn(() => Promise.resolve({} as Message.TextMessage)),
    replyWithMarkdown: jest.fn(() =>
      Promise.resolve({} as Message.TextMessage)
    ),
    replyWithHTML: jest.fn(() => Promise.resolve({} as Message.TextMessage)),
    deleteMessage: jest.fn(() => Promise.resolve(true)),
    from: {
      id: userId,
      username: username || 'testuser',
      is_bot: false,
      first_name: 'Test',
      language_code: 'en',
    },
    message: {
      message_id: 123,
      from: {
        id: userId,
        username: username || 'testuser',
        is_bot: false,
        first_name: 'Test',
        language_code: 'en',
      },
      chat: {
        id: userId,
        type: 'private',
        first_name: 'Test',
        username: username || 'testuser',
      },
      date: Math.floor(Date.now() / 1000),
      text: '',
    },
    chat: {
      id: userId,
      type: 'private',
      first_name: 'Test',
      username: username || 'testuser',
    },
  } as unknown as MyContext

  return ctx
}

/**
 * Runs a specific step in a scene
 */
export async function runSceneStep(
  handler: any,
  ctx: MyContext
): Promise<void> {
  await handler(ctx, () => Promise.resolve())
}

/**
 * Custom expect function for making assertions in tests
 */
export function expect(actual: any) {
  return {
    toBe: (expected: any) => {
      if (actual !== expected) {
        throw new Error(`Expected ${actual} to be ${expected}`)
      }
    },
    toEqual: (expected: any) => {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(
          `Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`
        )
      }
    },
    toContain: (expected: any) => {
      if (!actual || !actual.includes(expected)) {
        throw new Error(`Expected ${actual} to contain ${expected}`)
      }
    },
    toBeDefined: () => {
      if (actual === undefined) {
        throw new Error('Expected value to be defined')
      }
    },
    toBeUndefined: () => {
      if (actual !== undefined) {
        throw new Error(`Expected undefined but got ${actual}`)
      }
    },
    toBeNull: () => {
      if (actual !== null) {
        throw new Error(`Expected null but got ${actual}`)
      }
    },
    toBeTruthy: () => {
      if (!actual) {
        throw new Error(`Expected ${actual} to be truthy`)
      }
    },
    toBeFalsy: () => {
      if (actual) {
        throw new Error(`Expected ${actual} to be falsy`)
      }
    },
    toHaveBeenCalled: () => {
      if (!actual.mock || actual.mock.calls.length === 0) {
        throw new Error('Expected function to have been called')
      }
    },
    toHaveBeenCalledWith: (...args: any[]) => {
      if (!actual.mock) {
        throw new Error('Expected a mock function')
      }

      const wasCalled = actual.mock.calls.some((callArgs: any[]) => {
        if (callArgs.length !== args.length) return false

        return args.every((arg, index) => {
          if (typeof arg === 'object' && arg !== null) {
            return JSON.stringify(callArgs[index]) === JSON.stringify(arg)
          }
          return callArgs[index] === arg
        })
      })

      if (!wasCalled) {
        throw new Error(
          `Expected function to have been called with ${JSON.stringify(args)}`
        )
      }
    },
    toHaveBeenCalledTimes: (times: number) => {
      if (!actual.mock || actual.mock.calls.length !== times) {
        throw new Error(
          `Expected function to have been called ${times} times but was called ${actual.mock ? actual.mock.calls.length : 0} times`
        )
      }
    },
  }
}

/**
 * Sets up mocks for a test
 */
export function setupTestMocks() {
  // Mock inngest.send
  jest
    .spyOn(inngest, 'send')
    .mockImplementation(() => Promise.resolve({ success: true } as any))

  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks()
  })
}

/**
 * Creates a test reporter for running tests and collecting results
 */
export function createTestRunner(category: string) {
  const results: TestResult[] = []

  const runTest = async (name: string, testFn: () => Promise<void>) => {
    try {
      await testFn()
      results.push({ name, success: true })
      console.log(`✅ [${category}] ${name}`)
    } catch (error) {
      results.push({ name, success: false, error })
      console.error(`❌ [${category}] ${name}: ${error}`)
    }
  }

  return {
    runTest,
    getResults: () => results,
  }
}
