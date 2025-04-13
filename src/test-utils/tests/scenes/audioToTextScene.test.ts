import { MyContext } from '@/interfaces';
import { createMockContext, createMockWizardContext } from '../../core/mockContext';
import { TestResult } from '../../core/types';
import { assertReplyContains, assertReplyMarkupContains, assertScene } from '../../core/assertions';
import { create as mockFunction, MockedFunction } from '../../core/mock';
import { getUserBalance, updateUserBalance } from '@/core/supabase';
import { InngestService } from '@/services/inngest.service';
import { TranscriptionModels, TranscriptionLanguages, CALLBACKS } from '@/scenes/audioToTextScene/constants';
import { TransactionType } from '@/types';

// Mock necessary functions
const mockedGetUserBalance = mockFunction<typeof getUserBalance>();
const mockedUpdateUserBalance = mockFunction<typeof updateUserBalance>();
const mockedInngestSend = mockFunction<typeof InngestService.send>();
const mockedGetFile = mockFunction();

// Constants for testing
const TEST_USER_ID = 123456789;
const TEST_USERNAME = 'test_user';
const TEST_AUDIO_FILE_ID = 'test_audio_file_id';
const TEST_FILE_PATH = 'test_file_path';
const TEST_AUDIO_DURATION = 120; // 2 minutes
const TEST_TRANSACTION_AMOUNT = 10;

/**
 * Setup test environment
 */
function setupTest() {
  // Mock getUserBalance
  mockedGetUserBalance.mockReturnValue(Promise.resolve(100));

  // Mock updateUserBalance
  mockedUpdateUserBalance.mockReturnValue(Promise.resolve());

  // Mock Inngest send
  mockedInngestSend.mockReturnValue(Promise.resolve());

  // Reset mocks between tests
  mockedGetUserBalance.mockClear();
  mockedUpdateUserBalance.mockClear();
  mockedInngestSend.mockClear();
}

/**
 * Test entering the audioToTextScene
 */
export async function testAudioToTextScene_EnterScene(): Promise<TestResult> {
  try {
    setupTest();
    
    // Create mock context
    const ctx = createMockWizardContext();
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', language_code: 'ru' };
    ctx.message = { text: '/transcribe', message_id: 1 } as any;
    
    // Run the scene enter handler
    const audioToTextScene = (await import('@/scenes/audioToTextScene')).default;
    await audioToTextScene.enter(ctx as unknown as MyContext);
    
    // Check that the bot sent the right message with instructions
    assertReplyContains(ctx, 'Отправьте аудио или видео');
    
    // Check that session was initialized correctly
    if (!ctx.session.audioToText) {
      throw new Error('Session audioToText object was not initialized');
    }
    
    return {
      name: 'audioToTextScene: Enter Scene',
      success: true,
      message: 'Successfully displayed audio transcription instructions'
    };
  } catch (error) {
    return {
      name: 'audioToTextScene: Enter Scene',
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test processing an audio file
 */
export async function testAudioToTextScene_ProcessAudioFile(): Promise<TestResult> {
  try {
    setupTest();
    
    // Create mock context at step 1 (file processing)
    const ctx = createMockWizardContext(1);
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', language_code: 'ru' };
    ctx.session.audioToText = {
      audioFileId: '',
      audioFileUrl: '',
      transcription: ''
    };
    
    // Simulate a message with audio
    ctx.message = {
      message_id: 1,
      audio: {
        file_id: TEST_AUDIO_FILE_ID,
        duration: TEST_AUDIO_DURATION
      }
    } as any;
    
    // Mock getFile to return a file path
    ctx.telegram.getFile = mockedGetFile;
    mockedGetFile.mockReturnValue(Promise.resolve({ file_id: TEST_AUDIO_FILE_ID, file_path: TEST_FILE_PATH }));
    
    // Run the file processing handler
    const handlers = await import('@/scenes/audioToTextScene/handlers');
    await handlers.fileProcessingHandler(ctx as unknown as MyContext);
    
    // Check that file info was correctly stored in session
    if (ctx.session.audioToText.audioFileId !== TEST_AUDIO_FILE_ID) {
      throw new Error(`Expected file ID ${TEST_AUDIO_FILE_ID} to be saved in session but got ${ctx.session.audioToText.audioFileId}`);
    }
    
    if (ctx.session.audioToText.duration !== TEST_AUDIO_DURATION) {
      throw new Error(`Expected duration ${TEST_AUDIO_DURATION} to be saved in session but got ${ctx.session.audioToText.duration}`);
    }
    
    // Check that the settings message was sent
    assertReplyContains(ctx, 'Настройки транскрипции');
    
    // Check for settings buttons
    assertReplyMarkupContains(ctx, 'Язык');
    assertReplyMarkupContains(ctx, 'Модель');
    assertReplyMarkupContains(ctx, 'Точность');
    assertReplyMarkupContains(ctx, 'Начать транскрипцию');
    
    return {
      name: 'audioToTextScene: Process Audio File',
      success: true,
      message: 'Successfully processed audio file and showed transcription settings'
    };
  } catch (error) {
    return {
      name: 'audioToTextScene: Process Audio File',
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test selecting language settings
 */
export async function testAudioToTextScene_SelectLanguage(): Promise<TestResult> {
  try {
    setupTest();
    
    // Create mock context at transcription handler step
    const ctx = createMockWizardContext(2);
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', language_code: 'ru' };
    ctx.session.language = 'ru';
    ctx.session.audioToText = {
      audioFileId: TEST_AUDIO_FILE_ID,
      audioFileUrl: 'file://audio.mp3',
      filePath: TEST_FILE_PATH,
      duration: TEST_AUDIO_DURATION,
      transcriptionLanguage: TranscriptionLanguages.AUTO,
      transcriptionModel: TranscriptionModels.WHISPER_MEDIUM,
      accuracy: 'medium'
    };
    
    // Simulate a callback query for language selection
    ctx.callbackQuery = {
      id: '1',
      from: { id: TEST_USER_ID, is_bot: false, first_name: 'Test', language_code: 'ru' },
      message: { message_id: 1 },
      data: CALLBACKS.LANG_RU
    } as any;
    
    // Run the transcription handler
    const handlers = await import('@/scenes/audioToTextScene/handlers');
    await handlers.transcriptionHandler(ctx as unknown as MyContext);
    
    // Check that language was correctly updated in session
    if (ctx.session.audioToText.transcriptionLanguage !== TranscriptionLanguages.RUSSIAN) {
      throw new Error(`Expected language to be set to ${TranscriptionLanguages.RUSSIAN} but got ${ctx.session.audioToText.transcriptionLanguage}`);
    }
    
    // Check that confirmation message was sent
    assertReplyContains(ctx, 'Выбран язык: Русский');
    
    return {
      name: 'audioToTextScene: Select Language',
      success: true,
      message: 'Successfully selected transcription language'
    };
  } catch (error) {
    return {
      name: 'audioToTextScene: Select Language',
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test selecting transcription model
 */
export async function testAudioToTextScene_SelectModel(): Promise<TestResult> {
  try {
    setupTest();
    
    // Create mock context at transcription handler step
    const ctx = createMockWizardContext(2);
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', language_code: 'ru' };
    ctx.session.language = 'ru';
    ctx.session.audioToText = {
      audioFileId: TEST_AUDIO_FILE_ID,
      audioFileUrl: 'file://audio.mp3',
      filePath: TEST_FILE_PATH,
      duration: TEST_AUDIO_DURATION,
      transcriptionLanguage: TranscriptionLanguages.RUSSIAN,
      transcriptionModel: TranscriptionModels.WHISPER_MEDIUM,
      accuracy: 'medium'
    };
    
    // Simulate a callback query for model selection
    ctx.callbackQuery = {
      id: '1',
      from: { id: TEST_USER_ID, is_bot: false, first_name: 'Test', language_code: 'ru' },
      message: { message_id: 1 },
      data: CALLBACKS.MODEL_LARGE
    } as any;
    
    // Run the transcription handler
    const handlers = await import('@/scenes/audioToTextScene/handlers');
    await handlers.transcriptionHandler(ctx as unknown as MyContext);
    
    // Check that model was correctly updated in session
    if (ctx.session.audioToText.transcriptionModel !== TranscriptionModels.WHISPER_LARGE) {
      throw new Error(`Expected model to be set to ${TranscriptionModels.WHISPER_LARGE} but got ${ctx.session.audioToText.transcriptionModel}`);
    }
    
    // Check that confirmation message was sent
    assertReplyContains(ctx, 'Выбрана модель: Whisper Large');
    
    return {
      name: 'audioToTextScene: Select Model',
      success: true,
      message: 'Successfully selected transcription model'
    };
  } catch (error) {
    return {
      name: 'audioToTextScene: Select Model',
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test starting the transcription process
 */
export async function testAudioToTextScene_StartTranscription(): Promise<TestResult> {
  try {
    setupTest();
    
    // Create mock context at transcription handler step
    const ctx = createMockWizardContext(2);
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', language_code: 'ru' };
    ctx.session.language = 'ru';
    ctx.botInfo = { username: 'test_bot' } as any;
    ctx.session.audioToText = {
      audioFileId: TEST_AUDIO_FILE_ID,
      audioFileUrl: 'file://audio.mp3',
      filePath: TEST_FILE_PATH,
      duration: TEST_AUDIO_DURATION,
      transcriptionLanguage: TranscriptionLanguages.RUSSIAN,
      transcriptionModel: TranscriptionModels.WHISPER_MEDIUM,
      accuracy: 'medium'
    };
    
    // Simulate a callback query for starting transcription
    ctx.callbackQuery = {
      id: '1',
      from: { id: TEST_USER_ID, is_bot: false, first_name: 'Test', language_code: 'ru' },
      message: { message_id: 1 },
      data: CALLBACKS.START_TRANSCRIPTION
    } as any;
    
    // Mock user balance check
    mockedGetUserBalance.mockReturnValue(Promise.resolve(100));
    
    // Run the transcription handler
    const handlers = await import('@/scenes/audioToTextScene/handlers');
    
    // Mock the validateAndCalculateAudioTranscriptionPrice function
    const validatePrice = jest.fn().mockReturnValue(Promise.resolve({ 
      amount: TEST_TRANSACTION_AMOUNT,
      success: true
    }));
    
    // Replace the function in the imported module
    Object.defineProperty(handlers, 'validateAndCalculateAudioTranscriptionPrice', {
      value: validatePrice
    });
    
    await handlers.transcriptionHandler(ctx as unknown as MyContext);
    
    // Check that updateUserBalance was called
    if (mockedUpdateUserBalance.mock.calls.length !== 1) {
      throw new Error(`Expected updateUserBalance to be called once, but was called ${mockedUpdateUserBalance.mock.calls.length} times`);
    }
    
    // Check that Inngest.send was called with correct parameters
    if (mockedInngestSend.mock.calls.length !== 1) {
      throw new Error(`Expected Inngest.send to be called once, but was called ${mockedInngestSend.mock.calls.length} times`);
    }
    
    // Check that a confirmation message was sent
    assertReplyContains(ctx, 'Начинаю транскрипцию');
    
    // Check that scene was left
    if (ctx.scene.leave.mock.calls.length !== 1) {
      throw new Error('Expected scene.leave to be called');
    }
    
    return {
      name: 'audioToTextScene: Start Transcription',
      success: true,
      message: 'Successfully started transcription process'
    };
  } catch (error) {
    return {
      name: 'audioToTextScene: Start Transcription',
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test handling insufficient balance
 */
export async function testAudioToTextScene_InsufficientBalance(): Promise<TestResult> {
  try {
    setupTest();
    
    // Create mock context at transcription handler step
    const ctx = createMockWizardContext(2);
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', language_code: 'ru' };
    ctx.session.language = 'ru';
    ctx.botInfo = { username: 'test_bot' } as any;
    ctx.session.audioToText = {
      audioFileId: TEST_AUDIO_FILE_ID,
      audioFileUrl: 'file://audio.mp3',
      filePath: TEST_FILE_PATH,
      duration: TEST_AUDIO_DURATION,
      transcriptionLanguage: TranscriptionLanguages.RUSSIAN,
      transcriptionModel: TranscriptionModels.WHISPER_MEDIUM,
      accuracy: 'medium'
    };
    
    // Simulate a callback query for starting transcription
    ctx.callbackQuery = {
      id: '1',
      from: { id: TEST_USER_ID, is_bot: false, first_name: 'Test', language_code: 'ru' },
      message: { message_id: 1 },
      data: CALLBACKS.START_TRANSCRIPTION
    } as any;
    
    // Mock user balance to be insufficient
    mockedGetUserBalance.mockReturnValue(Promise.resolve(5));
    
    // Run the transcription handler
    const handlers = await import('@/scenes/audioToTextScene/handlers');
    
    // Mock the validateAndCalculateAudioTranscriptionPrice function
    const validatePrice = jest.fn().mockReturnValue(Promise.resolve({ 
      amount: 10,
      success: true
    }));
    
    // Replace the function in the imported module
    Object.defineProperty(handlers, 'validateAndCalculateAudioTranscriptionPrice', {
      value: validatePrice
    });
    
    await handlers.transcriptionHandler(ctx as unknown as MyContext);
    
    // Check that updateUserBalance was NOT called
    if (mockedUpdateUserBalance.mock.calls.length !== 0) {
      throw new Error(`Expected updateUserBalance not to be called, but was called ${mockedUpdateUserBalance.mock.calls.length} times`);
    }
    
    // Check that error message about insufficient balance was sent
    assertReplyContains(ctx, 'Недостаточно средств на балансе');
    
    // Check that scene was left
    if (ctx.scene.leave.mock.calls.length !== 1) {
      throw new Error('Expected scene.leave to be called');
    }
    
    return {
      name: 'audioToTextScene: Insufficient Balance',
      success: true,
      message: 'Successfully handled insufficient balance scenario'
    };
  } catch (error) {
    return {
      name: 'audioToTextScene: Insufficient Balance',
      success: false,
      message: String(error)
    };
  }
}

/**
 * Run all audioToTextScene tests
 */
export async function runAudioToTextSceneTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  // Run all test functions and collect results
  try {
    results.push(await testAudioToTextScene_EnterScene());
    results.push(await testAudioToTextScene_ProcessAudioFile());
    results.push(await testAudioToTextScene_SelectLanguage());
    results.push(await testAudioToTextScene_SelectModel());
    results.push(await testAudioToTextScene_StartTranscription());
    results.push(await testAudioToTextScene_InsufficientBalance());
  } catch (error) {
    results.push({
      name: 'audioToTextScene tests',
      success: false,
      message: String(error)
    });
  }
  
  return results;
}

export default runAudioToTextSceneTests; 