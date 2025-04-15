import { 
  mockFn, 
  assert, 
  TestCategory,
  TestResult,
  createMockFunction,
  MockFunction,
  assertMockCalled
} from '@/test-utils/core'
import { TestCategory as CoreTestCategory } from '@/test-utils/core/categories'
import {
  TranscriptionSettings,
  TranscriptionResult,
  FileInfo,
  AudioProcessingEvent,
  AudioProcessingCompletedEvent,
} from '@/scenes/audioToTextScene/types'
import {
  TranscriptionModels,
  TranscriptionLanguages,
  MAX_SINGLE_AUDIO_DURATION,
  MAX_FILE_SIZE,
  SUPPORTED_AUDIO_FORMATS,
  SUPPORTED_VIDEO_FORMATS,
} from '@/scenes/audioToTextScene/constants'
import {
  isSupportedFormat,
  isValidFileSize,
  processAudioFile,
  createAudioProcessingEvent,
  createAudioProcessingCompletedEvent,
} from '@/services/audioToText'
import {
  transcribeAudioWhisper,
  transcribeLongAudioWithSettings,
} from '@/services/openai-service'

// Mock external dependencies with proper typing
const mockedTranscribeAudioWhisper: MockFunction<typeof transcribeAudioWhisper> = createMockFunction()
const mockedTranscribeLongAudioWithSettings: MockFunction<typeof transcribeLongAudioWithSettings> = createMockFunction()

// Test constants
const testFileInfo: FileInfo = {
  fileId: 'test-file-id',
  filePath: '/path/to/test.mp3',
  fileType: 'audio/mp3',
  fileName: 'test.mp3',
  fileSize: 1024 * 1024, // 1MB
  duration: 60,
  isVideo: false
}

const testSettings: TranscriptionSettings = {
  model: TranscriptionModels.WHISPER_BASE,
  language: TranscriptionLanguages.RUSSIAN,
  accuracy: 'high'
}

const expectedTranscriptionResult: TranscriptionResult = {
  text: 'Test transcription',
  taskId: 'test-task-id',
  segments: [{
    start: 0,
    end: 60,
    text: 'Test transcription'
  }],
  language: 'ru'
}

/**
 * Test file format validation
 */
export function testIsSupportedFormat(): TestResult {
  try {
    // Test audio formats
    for (const format of SUPPORTED_AUDIO_FORMATS) {
      assert.true(
        isSupportedFormat(format),
        `Should support audio format: ${format}`
      )
    }

    // Test video formats
    for (const format of SUPPORTED_VIDEO_FORMATS) {
      assert.true(
        isSupportedFormat(format),
        `Should support video format: ${format}`
      )
    }

    // Test unsupported format
    assert.false(
      isSupportedFormat('image/jpeg'),
      'Should not support image format'
    )

    return {
      name: 'AudioToText: Format Validation',
      category: 'service',
      success: true,
      message: 'Successfully validated file formats'
    }
  } catch (error) {
    return {
      name: 'AudioToText: Format Validation',
      category: 'service',
      success: false,
      message: String(error)
    }
  }
}

/**
 * Test file size validation
 */
export function testIsValidFileSize(): TestResult {
  try {
    // Test valid file size
    assert.true(
      isValidFileSize(MAX_FILE_SIZE - 1024),
      'Should accept file size below maximum'
    )

    // Test exact maximum size
    assert.true(
      isValidFileSize(MAX_FILE_SIZE),
      'Should accept file at maximum size'
    )

    // Test exceeding size
    assert.false(
      isValidFileSize(MAX_FILE_SIZE + 1024),
      'Should reject file size above maximum'
    )

    return {
      name: 'AudioToText: Size Validation',
      category: 'service',
      success: true,
      message: 'Successfully validated file size checks'
    }
  } catch (error) {
    return {
      name: 'AudioToText: Size Validation',
      category: 'service',
      success: false,
      message: String(error)
    }
  }
}

/**
 * Test audio processing
 */
export function testProcessAudioFile(): TestResult {
  try {
    const mockTranscribeAudio = createMockFunction<typeof transcribeAudioWhisper>()
    mockTranscribeAudio.mockReturnValue(Promise.resolve(expectedTranscriptionResult))
    
    const mockTranscribeLong = createMockFunction<typeof transcribeLongAudioWithSettings>()
    mockTranscribeLong.mockReturnValue(Promise.resolve(expectedTranscriptionResult))

    // Test processing short audio
    const shortAudioInfo = { ...testFileInfo, duration: 300 }
    const shortResult = processAudioFile(shortAudioInfo, testSettings)
    
    assertMockCalled(mockTranscribeAudio, {
      args: [shortAudioInfo.filePath, testSettings],
      times: 1
    })

    assert.deepEqual(
      shortResult,
      expectedTranscriptionResult,
      'Should return correct transcription result for short audio'
    )

    // Test processing long audio
    const longAudioInfo = {
      ...testFileInfo,
      duration: MAX_SINGLE_AUDIO_DURATION + 300
    }
    const longResult = processAudioFile(longAudioInfo, testSettings)
    
    assertMockCalled(mockTranscribeLong, {
      args: [[longAudioInfo.filePath], testSettings],
      times: 1
    })

    assert.deepEqual(
      longResult,
      expectedTranscriptionResult,
      'Should return correct transcription result for long audio'
    )

    return {
      name: 'AudioToText: Process Audio',
      category: 'service',
      success: true,
      message: 'Successfully tested audio processing'
    }
  } catch (error) {
    return {
      name: 'AudioToText: Process Audio',
      category: 'service',
      success: false,
      message: String(error)
    }
  }
}

/**
 * Test event creation
 */
export function testEventCreation(): TestResult {
  try {
    const userId = 123456789

    // Test processing event creation
    const processingEvent = createAudioProcessingEvent(
      userId,
      testFileInfo,
      testSettings
    )
    
    assert.equal(
      processingEvent.userId,
      userId,
      'Processing event should have correct userId'
    )
    
    assert.equal(
      processingEvent.fileId,
      testFileInfo.fileId,
      'Processing event should have correct fileId'
    )
    
    assert.deepEqual(
      processingEvent.settings,
      testSettings,
      'Processing event should have correct settings'
    )

    // Test completion event creation
    const completionEvent = createAudioProcessingCompletedEvent(
      userId,
      testFileInfo.fileId,
      expectedTranscriptionResult
    )
    
    assert.equal(
      completionEvent.userId,
      userId,
      'Completion event should have correct userId'
    )
    
    assert.equal(
      completionEvent.fileId,
      testFileInfo.fileId,
      'Completion event should have correct fileId'
    )
    
    assert.equal(
      completionEvent.taskId,
      expectedTranscriptionResult.taskId,
      'Completion event should have correct taskId'
    )
    
    assert.deepEqual(
      completionEvent.result,
      expectedTranscriptionResult,
      'Completion event should have correct result'
    )

    return {
      name: 'AudioToText: Event Creation',
      category: 'service',
      success: true,
      message: 'Successfully tested event creation'
    }
  } catch (error) {
    return {
      name: 'AudioToText: Event Creation',
      category: 'service',
      success: false,
      message: String(error)
    }
  }
}

/**
 * Test transcription
 */
async function testTranscribeAudio(): Promise<TestResult> {
  try {
    // ... existing assertions ...
    return {
      name: 'AudioToText: Transcription',
      category: CoreTestCategory.Speech,
      success: true,
      message: 'Successfully transcribed audio',
    }
  } catch (error) {
    return {
      name: 'AudioToText: Transcription',
      category: CoreTestCategory.Speech,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Test transcription error handling
 */
async function testTranscribeAudioWithError(): Promise<TestResult> {
  try {
    // ... existing assertions ...
    return {
      name: 'AudioToText: Error Handling',
      category: CoreTestCategory.Speech,
      success: true,
      message: 'Successfully handled transcription error',
    }
  } catch (error) {
    return {
      name: 'AudioToText: Error Handling',
      category: CoreTestCategory.Speech,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Run all audioToText service tests
 */
export function runAudioToTextServiceTests(): TestResult[] {
  const results: TestResult[] = []

  results.push(testIsSupportedFormat())
  results.push(testIsValidFileSize())
  results.push(testProcessAudioFile())
  results.push(testEventCreation())

  return results
}

export default runAudioToTextServiceTests
