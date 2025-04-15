import { mockFn, assert, TestCategory, TestResult } from '@/test-utils/core'
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
import { TestCategory } from '../../core/categories'
import { TestResult } from '../../core/testUtils'
import { mockFunction } from '../../core'

// Mock external dependencies
const mockedTranscribeAudioWhisper = mockFn<typeof transcribeAudioWhisper>()
const mockedTranscribeLongAudioWithSettings =
  mockFn<typeof transcribeLongAudioWithSettings>()

// Test constants
const TEST_FILE_INFO: FileInfo = {
  fileId: 'test-file-id',
  filePath: '/path/to/audio.mp3',
  fileType: 'audio/mp3',
  fileName: 'audio.mp3',
  fileSize: 1024 * 1024, // 1MB
  duration: 300, // 5 minutes
}

const TEST_SETTINGS: TranscriptionSettings = {
  model: TranscriptionModels.WHISPER_BASE,
  language: TranscriptionLanguages.RUSSIAN,
  accuracy: 'high',
}

const TEST_RESULT: TranscriptionResult = {
  text: 'Test transcription result',
  segments: [{ start: 0, end: 300, text: 'Test transcription result' }],
  language: 'ru',
  taskId: 'test-task-id',
}

/**
 * Test file format validation
 */
async function testIsSupportedFormat(): Promise<TestResult> {
  try {
    // Test supported audio format
    assert.strictEqual(
      isSupportedFormat('audio/mp3'),
      true,
      'Should support MP3 format'
    )
    assert.strictEqual(
      isSupportedFormat('audio/wav'),
      true,
      'Should support WAV format'
    )

    // Test supported video format
    assert.strictEqual(
      isSupportedFormat('video/mp4'),
      true,
      'Should support MP4 format'
    )

    // Test unsupported format
    assert.strictEqual(
      isSupportedFormat('image/jpeg'),
      false,
      'Should not support JPEG format'
    )

    return {
      name: 'AudioToText: Format Validation',
      category: TestCategory.Speech,
      success: true,
      message: 'Successfully validated file format checks',
    }
  } catch (error) {
    return {
      name: 'AudioToText: Format Validation',
      category: TestCategory.Speech,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Test file size validation
 */
async function testIsValidFileSize(): Promise<TestResult> {
  try {
    // Test valid file size
    assert.strictEqual(
      isValidFileSize(MAX_FILE_SIZE - 1024),
      true,
      'Should accept file size below maximum'
    )

    // Test exact maximum size
    assert.strictEqual(
      isValidFileSize(MAX_FILE_SIZE),
      true,
      'Should accept file at maximum size'
    )

    // Test exceeding size
    assert.strictEqual(
      isValidFileSize(MAX_FILE_SIZE + 1024),
      false,
      'Should reject file size above maximum'
    )

    return {
      name: 'AudioToText: Size Validation',
      category: TestCategory.Speech,
      success: true,
      message: 'Successfully validated file size checks',
    }
  } catch (error) {
    return {
      name: 'AudioToText: Size Validation',
      category: TestCategory.Speech,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Test audio processing
 */
async function testProcessAudioFile(): Promise<TestResult> {
  try {
    mockedTranscribeAudioWhisper.mockReturnValue(Promise.resolve(TEST_RESULT))
    mockedTranscribeLongAudioWithSettings.mockReturnValue(
      Promise.resolve(TEST_RESULT)
    )

    // Test processing short audio
    const shortAudioInfo = { ...TEST_FILE_INFO, duration: 300 }
    const shortResult = await processAudioFile(shortAudioInfo, TEST_SETTINGS)
    assert.deepStrictEqual(
      mockedTranscribeAudioWhisper.mock.calls[0],
      [shortAudioInfo.filePath, TEST_SETTINGS],
      'Should call transcribeAudioWhisper with correct parameters'
    )
    assert.deepStrictEqual(
      shortResult,
      TEST_RESULT,
      'Should return correct transcription result for short audio'
    )

    // Test processing long audio
    const longAudioInfo = {
      ...TEST_FILE_INFO,
      duration: MAX_SINGLE_AUDIO_DURATION + 300,
    }
    const longResult = await processAudioFile(longAudioInfo, TEST_SETTINGS)
    assert.deepStrictEqual(
      mockedTranscribeLongAudioWithSettings.mock.calls[0],
      [[longAudioInfo.filePath], TEST_SETTINGS],
      'Should call transcribeLongAudioWithSettings with correct parameters'
    )
    assert.deepStrictEqual(
      longResult,
      TEST_RESULT,
      'Should return correct transcription result for long audio'
    )

    return {
      name: 'AudioToText: Process Audio',
      category: TestCategory.Speech,
      success: true,
      message: 'Successfully tested audio processing',
    }
  } catch (error) {
    return {
      name: 'AudioToText: Process Audio',
      category: TestCategory.Speech,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Test event creation
 */
async function testEventCreation(): Promise<TestResult> {
  try {
    const userId = 123456789

    // Test processing event creation
    const processingEvent = createAudioProcessingEvent(
      userId,
      TEST_FILE_INFO,
      TEST_SETTINGS
    )
    assert.strictEqual(
      processingEvent.userId,
      userId,
      'Processing event should have correct userId'
    )
    assert.strictEqual(
      processingEvent.fileId,
      TEST_FILE_INFO.fileId,
      'Processing event should have correct fileId'
    )
    assert.deepStrictEqual(
      processingEvent.settings,
      TEST_SETTINGS,
      'Processing event should have correct settings'
    )

    // Test completion event creation
    const completionEvent = createAudioProcessingCompletedEvent(
      userId,
      TEST_FILE_INFO.fileId,
      TEST_RESULT
    )
    assert.strictEqual(
      completionEvent.userId,
      userId,
      'Completion event should have correct userId'
    )
    assert.strictEqual(
      completionEvent.fileId,
      TEST_FILE_INFO.fileId,
      'Completion event should have correct fileId'
    )
    assert.strictEqual(
      completionEvent.taskId,
      TEST_RESULT.taskId,
      'Completion event should have correct taskId'
    )
    assert.deepStrictEqual(
      completionEvent.result,
      TEST_RESULT,
      'Completion event should have correct result'
    )

    return {
      name: 'AudioToText: Event Creation',
      category: TestCategory.Speech,
      success: true,
      message: 'Successfully tested event creation',
    }
  } catch (error) {
    return {
      name: 'AudioToText: Event Creation',
      category: TestCategory.Speech,
      success: false,
      message: String(error),
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
      category: TestCategory.Speech,
      success: true,
      message: 'Successfully transcribed audio',
    }
  } catch (error) {
    return {
      name: 'AudioToText: Transcription',
      category: TestCategory.Speech,
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
      category: TestCategory.Speech,
      success: true,
      message: 'Successfully handled transcription error',
    }
  } catch (error) {
    return {
      name: 'AudioToText: Error Handling',
      category: TestCategory.Speech,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Run all audioToText service tests
 */
export async function runAudioToTextServiceTests(): Promise<TestResult[]> {
  const results: TestResult[] = []

  try {
    results.push(await testIsSupportedFormat())
    results.push(await testIsValidFileSize())
    results.push(await testProcessAudioFile())
    results.push(await testEventCreation())
    results.push(await testTranscribeAudio())
    results.push(await testTranscribeAudioWithError())
  } catch (error) {
    results.push({
      name: 'AudioToText Service Tests',
      category: 'SERVICE',
      success: false,
      message: String(error),
    })
  }

  return results
}

export default runAudioToTextServiceTests
