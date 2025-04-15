import { MyContext } from '@/interfaces'
import {
  createMockContext,
  createMockWizardContext,
} from '../../core/mockContext'
import { TestResult } from '../../core/types'
import {
  assertReplyContains,
  assertReplyMarkupContains,
  assertScene,
  assertPhotoSent,
} from '../../core/assertions'
import { create as mockFunction, MockedFunction } from '../../core/mock'
import { imageModelPrices } from '@/price/models'
import { InngestService } from '@/services/inngest.service'
import { getUserBalance } from '@/core/supabase'

// Mocked functions
const mockedGetUserBalance = mockFunction<typeof getUserBalance>()
const mockedInngestSendEvent = mockFunction<typeof InngestService.sendEvent>()

// Constants for testing
const TEST_USER_ID = 123456789
const TEST_USERNAME = 'test_user'
const TEST_MODEL_ID = 'black-forest-labs/flux-1.1-pro'
const TEST_MODEL_SHORT_NAME = 'FLUX1.1 [pro]'
const TEST_PROMPT = 'A beautiful sunset over the mountains'

/**
 * Setup test environment
 */
function setupTest() {
  // Mock getUserBalance
  mockedGetUserBalance.mockReturnValue(Promise.resolve(100))

  // Mock InngestService.sendEvent
  mockedInngestSendEvent.mockReturnValue(Promise.resolve())

  // Reset mocks between tests
  mockedGetUserBalance.mockClear()
  mockedInngestSendEvent.mockClear()
}

/**
 * Test entering the textToImageWizard scene
 */
export async function testTextToImageWizard_EnterScene(): Promise<TestResult> {
  try {
    setupTest()

    // Create mock context
    const ctx = createMockWizardContext()
    ctx.from = {
      id: TEST_USER_ID,
      is_bot: false,
      first_name: 'Test',
      language_code: 'ru',
    }
    ctx.message = { text: '/image', message_id: 1 } as any

    // Run the first step of the scene
    const textToImageWizard = (await import('@/scenes/textToImageWizard'))
      .textToImageWizard
    await textToImageWizard.steps[0](ctx as unknown as MyContext)

    // Check that the bot sent the right message with instructions
    assertReplyContains(ctx, 'Выберите модель для генерации')

    // Check that keyboard contains image model options
    const modelShortNames = Object.values(imageModelPrices)
      .filter(
        model =>
          !model.inputType.includes('dev') && model.inputType.includes('text')
      )
      .map(model => model.shortName)

    for (const modelName of modelShortNames.slice(0, 3)) {
      // Check just a few models to confirm
      assertReplyMarkupContains(ctx, modelName)
    }

    return {
      name: 'textToImageWizard: Enter Scene',
      success: true,
      message: 'Successfully displayed image model selection instructions',
    }
  } catch (error) {
    return {
      name: 'textToImageWizard: Enter Scene',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Test selecting an image model
 */
export async function testTextToImageWizard_SelectImageModel(): Promise<TestResult> {
  try {
    setupTest()

    // Create mock context at step 1 (model selection)
    const ctx = createMockWizardContext(1)
    ctx.from = {
      id: TEST_USER_ID,
      is_bot: false,
      first_name: 'Test',
      language_code: 'ru',
    }
    // Add botInfo to the context
    ;(ctx as any).botInfo = { username: 'test_bot' }

    // Simulate a message with model selection
    ctx.message = {
      message_id: 1,
      text: TEST_MODEL_SHORT_NAME,
    } as any

    // Run the step for processing the model selection
    const textToImageWizard = (await import('@/scenes/textToImageWizard'))
      .textToImageWizard
    await textToImageWizard.steps[1](ctx as unknown as MyContext)

    // Check that the model was saved in the session
    if ((ctx.session as any).selectedModel !== TEST_MODEL_ID) {
      throw new Error(
        `Expected model ${TEST_MODEL_ID} to be saved in session but got ${(ctx.session as any).selectedModel}`
      )
    }

    // Check that the bot sent a preview image
    assertPhotoSent(ctx)

    // Check that the bot sent the prompt for text input
    assertReplyContains(ctx, 'Пожалуйста, введите текст')

    // Check that the scene moved to the next step
    assertScene(ctx, 'text_to_image', 2)

    return {
      name: 'textToImageWizard: Select Image Model',
      success: true,
      message: 'Successfully selected image model and progressed to next step',
    }
  } catch (error) {
    return {
      name: 'textToImageWizard: Select Image Model',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Test providing text prompt after model selection
 */
export async function testTextToImageWizard_ProvideTextPrompt(): Promise<TestResult> {
  try {
    setupTest()

    // Create mock context at step 2 (prompt entry)
    const ctx = createMockWizardContext(2)
    ctx.from = {
      id: TEST_USER_ID,
      is_bot: false,
      first_name: 'Test',
      language_code: 'ru',
    }
    ;(ctx.session as any).selectedModel = TEST_MODEL_ID
    ;(ctx as any).botInfo = { username: 'test_bot' }

    // Simulate message with text prompt
    ctx.message = {
      message_id: 1,
      text: TEST_PROMPT,
    } as any

    // Run the step for processing the text prompt
    const textToImageWizard = (await import('@/scenes/textToImageWizard'))
      .textToImageWizard
    await textToImageWizard.steps[2](ctx as unknown as MyContext)

    // Check that InngestService.sendEvent was called with the correct parameters
    expect(mockedInngestSendEvent.mock.calls.length).toBe(1)

    // Check that the prompt was saved in the session
    if ((ctx.session as any).prompt !== TEST_PROMPT) {
      throw new Error(
        `Expected prompt "${TEST_PROMPT}" to be saved in session but got "${(ctx.session as any).prompt}"`
      )
    }

    // Check that the bot sent the confirmation message
    assertReplyContains(ctx, 'Запрос на генерацию изображения отправлен')

    // Check that the scene was exited
    expect(ctx.scene.leave).toHaveBeenCalled()

    return {
      name: 'textToImageWizard: Provide Text Prompt',
      success: true,
      message: 'Successfully processed text prompt and sent generation request',
    }
  } catch (error) {
    return {
      name: 'textToImageWizard: Provide Text Prompt',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Test canceling the wizard
 */
export async function testTextToImageWizard_Cancel(): Promise<TestResult> {
  try {
    setupTest()

    // Create mock context
    const ctx = createMockWizardContext(1)
    ctx.from = {
      id: TEST_USER_ID,
      is_bot: false,
      first_name: 'Test',
      language_code: 'ru',
    }

    // Simulate cancel command
    ctx.message = {
      message_id: 1,
      text: 'Отмена',
    } as any

    // Run any step of the scene with the cancel command
    const textToImageWizard = (await import('@/scenes/textToImageWizard'))
      .textToImageWizard
    await textToImageWizard.steps[1](ctx as unknown as MyContext)

    // Check that the scene was exited
    expect(ctx.scene.leave).toHaveBeenCalled()

    return {
      name: 'textToImageWizard: Cancel',
      success: true,
      message: 'Successfully canceled the wizard',
    }
  } catch (error) {
    return {
      name: 'textToImageWizard: Cancel',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Test handling insufficient balance
 */
export async function testTextToImageWizard_InsufficientBalance(): Promise<TestResult> {
  try {
    setupTest()

    // Mock getUserBalance to return insufficient balance
    mockedGetUserBalance.mockReturnValue(Promise.resolve(0))

    // Create mock context
    const ctx = createMockWizardContext(1)
    ctx.from = {
      id: TEST_USER_ID,
      is_bot: false,
      first_name: 'Test',
      language_code: 'ru',
    }
    ;(ctx as any).botInfo = { username: 'test_bot' }

    // Simulate a message with model selection
    ctx.message = {
      message_id: 1,
      text: TEST_MODEL_SHORT_NAME,
    } as any

    // Run the step for processing the model selection
    const textToImageWizard = (await import('@/scenes/textToImageWizard'))
      .textToImageWizard
    await textToImageWizard.steps[1](ctx as unknown as MyContext)

    // Check that the bot sent message about insufficient balance
    assertReplyContains(ctx, 'Недостаточно средств')

    // Check that the scene was exited
    expect(ctx.scene.leave).toHaveBeenCalled()

    return {
      name: 'textToImageWizard: Insufficient Balance',
      success: true,
      message: 'Successfully handled insufficient balance case',
    }
  } catch (error) {
    return {
      name: 'textToImageWizard: Insufficient Balance',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Test returning to main menu
 */
export async function testTextToImageWizard_ReturnToMainMenu(): Promise<TestResult> {
  try {
    setupTest()

    // Create mock context
    const ctx = createMockWizardContext(1)
    ctx.from = {
      id: TEST_USER_ID,
      is_bot: false,
      first_name: 'Test',
      language_code: 'ru',
    }

    // Simulate main menu command
    ctx.message = {
      message_id: 1,
      text: '🏠 Главное меню',
    } as any

    // Run the step with the main menu command
    const textToImageWizard = (await import('@/scenes/textToImageWizard'))
      .textToImageWizard
    await textToImageWizard.steps[1](ctx as unknown as MyContext)

    // Check that the scene was exited
    expect(ctx.scene.leave).toHaveBeenCalled()

    return {
      name: 'textToImageWizard: Return To Main Menu',
      success: true,
      message: 'Successfully returned to main menu',
    }
  } catch (error) {
    return {
      name: 'textToImageWizard: Return To Main Menu',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Run all tests for the textToImageWizard scene
 */
export async function runTextToImageWizardTests(): Promise<TestResult[]> {
  const results: TestResult[] = []

  try {
    results.push(await testTextToImageWizard_EnterScene())
    results.push(await testTextToImageWizard_SelectImageModel())
    results.push(await testTextToImageWizard_ProvideTextPrompt())
    results.push(await testTextToImageWizard_Cancel())
    results.push(await testTextToImageWizard_InsufficientBalance())
    results.push(await testTextToImageWizard_ReturnToMainMenu())
  } catch (error) {
    results.push({
      name: 'textToImageWizard: Overall',
      success: false,
      message: String(error),
    })
  }

  return results
}

// Helper function for TypeScript's expect
function expect(value: any): {
  toHaveBeenCalled: () => void
  toHaveBeenCalledTimes: (n: number) => void
} {
  return {
    toHaveBeenCalled: () => {
      if (!value || !value.mock || value.mock.calls.length === 0) {
        throw new Error('Expected function to have been called')
      }
    },
    toHaveBeenCalledTimes: (n: number) => {
      if (!value || !value.mock || value.mock.calls.length !== n) {
        throw new Error(
          `Expected function to have been called ${n} times, but it was called ${value?.mock?.calls?.length || 0} times`
        )
      }
    },
  }
}
