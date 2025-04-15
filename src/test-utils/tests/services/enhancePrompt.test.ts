import { TestCategory } from '../../core/categories'
import { createSceneTest } from '../../core/testUtils'
import { mockFn } from '../../core/mockFunction'
import OpenAI from 'openai'
import {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessage,
} from 'openai/resources/chat/completions'
import { APIPromise, RequestOptions } from 'openai/core'
import { enhancePrompt } from '@/services/enhancePrompt'

type CreateChatCompletionFunction = (
  body: ChatCompletionCreateParamsNonStreaming
) => APIPromise<ChatCompletion>

// Mock OpenAI response
const mockMessage: ChatCompletionMessage = {
  role: 'assistant',
  content: 'Enhanced prompt',
  refusal: null,
}

const mockOpenAIResponse: ChatCompletion = {
  id: 'mock-completion',
  object: 'chat.completion',
  created: Date.now(),
  model: 'gpt-3.5-turbo',
  choices: [
    {
      message: mockMessage,
      index: 0,
      finish_reason: 'stop',
      logprobs: null,
    },
  ],
}

function createMockAPIPromise(): APIPromise<ChatCompletion> {
  const mockResponse = new Response(JSON.stringify(mockOpenAIResponse))
  
  const options = {
    method: 'post' as const,
    path: '/chat/completions',
    query: {},
    headers: {},
    body: {},
  } satisfies RequestOptions
  
  const responsePromise = Promise.resolve({
    response: mockResponse,
    options,
    controller: new AbortController(),
  })

  return new APIPromise(responsePromise, async () => mockOpenAIResponse)
}

// Create mock OpenAI client
const mockOpenAIClient = {
  chat: {
    completions: {
      create: mockFn<CreateChatCompletionFunction>()
        .mockImplementation(() => createMockAPIPromise()),
    },
  },
} as unknown as OpenAI

export const testEnhancePrompt = createSceneTest('enhancePrompt', async () => {
  const tests = [
    {
      name: 'enhancePrompt_English',
      async run() {
        const prompt = 'Test prompt in English'
        const result = await enhancePrompt(prompt, false, mockOpenAIClient)
        
        if (result !== 'Enhanced prompt') {
          throw new Error(`Expected 'Enhanced prompt' but got '${result}'`)
        }

        return {
          success: true,
          message: 'Successfully enhanced English prompt',
          category: TestCategory.Neuro,
        }
      },
    },
    {
      name: 'enhancePrompt_Russian',
      async run() {
        const prompt = 'Тестовый промпт на русском'
        const result = await enhancePrompt(prompt, true, mockOpenAIClient)

        if (result !== 'Enhanced prompt') {
          throw new Error(`Expected 'Enhanced prompt' but got '${result}'`)
        }

        return {
          success: true,
          message: 'Successfully enhanced Russian prompt',
          category: TestCategory.Neuro,
        }
      },
    },
    {
      name: 'enhancePrompt_APIError',
      async run() {
        const errorClient = {
          chat: {
            completions: {
              create: mockFn<CreateChatCompletionFunction>()
                .mockImplementation(() => {
                  throw new Error('API Error')
                }),
            },
          },
        } as unknown as OpenAI

        try {
          await enhancePrompt('Test prompt', false, errorClient)
          throw new Error('Expected error to be thrown')
        } catch (error) {
          if (!(error instanceof Error) || error.message !== 'API Error') {
            throw new Error(`Expected 'API Error' but got '${error}'`)
          }
        }

        return {
          success: true,
          message: 'Successfully handled API error',
          category: TestCategory.Neuro,
        }
      },
    },
  ]

  for (const test of tests) {
    await test.run()
  }
})
