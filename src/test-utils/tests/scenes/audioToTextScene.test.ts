import { MyContext } from '@/interfaces'
import { createSceneTest, mockFn, TestCategory, TestResult } from '@/test-utils/core'
import { convertAudioToText } from '@/services/audioToText'
import { logger } from '@/utils/logger'

// Constants for testing
const TEST_USER_ID = '123456789'
const TEST_FILE_ID = 'test_audio_file_id'
const TEST_TRANSCRIPTION = 'Test transcription result'

// Mock implementations
const mockConvertAudioToText = mockFn<typeof convertAudioToText>()
mockConvertAudioToText.mockImplementation(async () => TEST_TRANSCRIPTION)

const mockLogger = mockFn<typeof logger.info>()

// Helper function to create test context
function createTestContext(): MyContext {
    return {
    message: {
      from: { id: TEST_USER_ID },
      audio: { file_id: TEST_FILE_ID },
    },
    scene: {
      enter: mockFn(),
      leave: mockFn(),
    },
    reply: mockFn(),
    wizard: {
      next: mockFn(),
      selectStep: mockFn(),
    },
  } as unknown as MyContext
}

// Reset mocks before each test
function resetMocks() {
  mockConvertAudioToText.mockClear()
  mockLogger.mockClear()
}

// Test cases
const testEnterScene = createSceneTest('Enter Audio to Text Scene', async (context) => {
  resetMocks()
  await context.scene.enter()
  expect(context.reply).toHaveBeenCalledWith('Please send an audio file to transcribe')
})

const testConvertAudio = createSceneTest('Convert Audio to Text', async (context) => {
  resetMocks()
  await context.message.audio
  expect(mockConvertAudioToText).toHaveBeenCalledWith(TEST_FILE_ID)
  expect(context.reply).toHaveBeenCalledWith(TEST_TRANSCRIPTION)
})

const testHandleError = createSceneTest('Handle Conversion Error', async (context) => {
  resetMocks()
  mockConvertAudioToText.mockImplementation(() => {
    throw new Error('Conversion failed')
  })
  await context.message.audio
  expect(context.reply).toHaveBeenCalledWith('Error converting audio to text: Conversion failed')
})

const testHandleNonAudioMessage = createSceneTest('Handle Non-Audio Message', async (context) => {
  resetMocks()
  context.message.audio = undefined
  await context.message
  expect(context.reply).toHaveBeenCalledWith('Please send an audio file')
})

// Export all test cases
export const audioToTextSceneTests = {
  testEnterScene,
  testConvertAudio,
  testHandleError,
  testHandleNonAudioMessage,
}
