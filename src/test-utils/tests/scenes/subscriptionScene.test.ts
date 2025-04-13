import { MyContext } from '@/interfaces'
import { createMockContext, createMockWizardContext } from '../../core/mockContext'
import { TestResult } from '../../core/types'
import { assertReplyContains, assertReplyMarkupContains, assertScene } from '../../core/assertions'
import { mockFunction } from '../../core/mock'
import { getTranslation } from '@/core/supabase'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { handleMenu } from '@/handlers'
import { isValidPaymentSubscription } from '@/interfaces/payments.interface'

// Mocked functions
const mockedGetTranslation = mockFunction<typeof getTranslation>()
const mockedHandleMenu = mockFunction<typeof handleMenu>()

// Constants for testing
const TEST_USER_ID = 123456789
const TEST_ADMIN_ID = 111222333 // Admin ID for testing
const TEST_SUBSCRIPTION_ID = 'premium'

/**
 * Setup test environment
 */
function setupTest() {
  // Mock getTranslation
  mockedGetTranslation.mockReturnValue(
    Promise.resolve({
      translation: 'Subscription plans',
      buttons: [
        {
          row: 0,
          text: 'Basic',
          en_price: 5,
          ru_price: 500,
          description: 'Basic plan',
          stars_price: 500,
          callback_data: 'basic',
        },
        {
          row: 0,
          text: 'Premium',
          en_price: 20,
          ru_price: 2000,
          description: 'Premium plan',
          stars_price: 2000,
          callback_data: 'premium',
        },
      ],
    })
  )

  // Mock handleMenu
  mockedHandleMenu.mockReturnValue(Promise.resolve())

  // Reset mocks between tests
  mockedGetTranslation.mockClear()
  mockedHandleMenu.mockClear()

  // Mock environment variables
  process.env.ADMIN_IDS = `${TEST_ADMIN_ID},999888777`
}

/**
 * Test entering the subscriptionScene
 */
export async function testSubscriptionScene_EnterScene(): Promise<TestResult> {
  try {
    setupTest()

    // Create mock context
    const ctx = createMockWizardContext()
    ctx.from = {
      id: TEST_USER_ID,
      is_bot: false,
      first_name: 'Test',
      username: 'test_user',
      language_code: 'ru',
    }

    // Run the first step of the scene
    const subscriptionScene = (await import('@/scenes/subscriptionScene')).default
    await subscriptionScene.steps[0](ctx as unknown as MyContext)

    // Check that the bot sent the right message with subscription plans
    assertReplyContains(ctx, 'Subscription plans')

    // Check that keyboard contains subscription options
    assertReplyMarkupContains(ctx, 'Basic')
    assertReplyMarkupContains(ctx, 'Premium')
    assertReplyMarkupContains(ctx, 'Главное меню')

    // Check that the scene moved to the next step
    assertScene(ctx, ModeEnum.SubscriptionScene, 1)

    return {
      name: 'subscriptionScene: Enter Scene',
      success: true,
      message: 'Successfully displayed subscription plans',
    }
  } catch (error) {
    return {
      name: 'subscriptionScene: Enter Scene',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Test entering the scene as an admin user (should see additional test plan)
 */
export async function testSubscriptionScene_AdminUser(): Promise<TestResult> {
  try {
    setupTest()

    // Create mock context with admin ID
    const ctx = createMockWizardContext()
    ctx.from = {
      id: TEST_ADMIN_ID,
      is_bot: false,
      first_name: 'Admin',
      username: 'admin_user',
      language_code: 'ru',
    }

    // Run the first step of the scene
    const subscriptionScene = (await import('@/scenes/subscriptionScene')).default
    await subscriptionScene.steps[0](ctx as unknown as MyContext)

    // Check that admin user sees the test subscription option
    assertReplyMarkupContains(ctx, 'Тест')

    return {
      name: 'subscriptionScene: Admin User',
      success: true,
      message: 'Successfully displayed test subscription option for admin user',
    }
  } catch (error) {
    return {
      name: 'subscriptionScene: Admin User',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Test selecting a subscription plan
 */
export async function testSubscriptionScene_SelectSubscription(): Promise<TestResult> {
  try {
    setupTest()

    // Create mock context at step 1 (subscription selection)
    const ctx = createMockWizardContext(1)
    ctx.from = {
      id: TEST_USER_ID,
      is_bot: false,
      first_name: 'Test',
      username: 'test_user',
      language_code: 'ru',
    }

    // Add subscription buttons to session (normally done in first step)
    ctx.session.buttons = [
      {
        row: 0,
        text: 'Premium',
        en_price: 20,
        ru_price: 2000,
        description: 'Premium plan',
        stars_price: 2000,
        callback_data: TEST_SUBSCRIPTION_ID,
      },
    ]

    // Mock scene enter for next wizard
    ctx.scene.enter = jest.fn().mockResolvedValue(undefined)

    // Simulate a callback query for subscription selection
    ctx.callbackQuery = {
      id: 'test-callback-id',
      from: ctx.from,
      message: { message_id: 1 } as any,
      data: TEST_SUBSCRIPTION_ID,
      chat_instance: 'test-chat-instance',
    }

    // Run the second step of the scene
    const subscriptionScene = (await import('@/scenes/subscriptionScene')).default
    await subscriptionScene.steps[1](ctx as unknown as MyContext)

    // Check that session contains the selected subscription
    expect(ctx.session.selectedPayment).toBeDefined()
    expect(ctx.session.selectedPayment.subscription).toBe(TEST_SUBSCRIPTION_ID)

    // Check that the scene entered payment wizard
    expect(ctx.scene.enter).toHaveBeenCalledWith('getRuBillWizard')

    return {
      name: 'subscriptionScene: Select Subscription',
      success: true,
      message: 'Successfully selected subscription and entered payment wizard',
    }
  } catch (error) {
    return {
      name: 'subscriptionScene: Select Subscription',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Test returning to main menu
 */
export async function testSubscriptionScene_ReturnToMainMenu(): Promise<TestResult> {
  try {
    setupTest()

    // Create mock context at step 1
    const ctx = createMockWizardContext(1)
    ctx.from = {
      id: TEST_USER_ID,
      is_bot: false,
      first_name: 'Test',
      username: 'test_user',
      language_code: 'ru',
    }

    // Simulate a callback query for returning to main menu
    ctx.callbackQuery = {
      id: 'test-callback-id',
      from: ctx.from,
      message: { message_id: 1 } as any,
      data: 'mainmenu',
      chat_instance: 'test-chat-instance',
    }

    // Run the second step of the scene
    const subscriptionScene = (await import('@/scenes/subscriptionScene')).default
    await subscriptionScene.steps[1](ctx as unknown as MyContext)

    // Check that handleMenu was called
    expect(mockedHandleMenu).toHaveBeenCalled()

    // Check that the scene was exited
    expect(ctx.scene.leave).toHaveBeenCalled()

    return {
      name: 'subscriptionScene: Return To Main Menu',
      success: true,
      message: 'Successfully returned to main menu',
    }
  } catch (error) {
    return {
      name: 'subscriptionScene: Return To Main Menu',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Test handling invalid callback data
 */
export async function testSubscriptionScene_InvalidCallback(): Promise<TestResult> {
  try {
    setupTest()

    // Create mock context at step 1
    const ctx = createMockWizardContext(1)
    ctx.from = {
      id: TEST_USER_ID,
      is_bot: false,
      first_name: 'Test',
      username: 'test_user',
      language_code: 'ru',
    }

    // Add subscription buttons to session (normally done in first step)
    ctx.session.buttons = [
      {
        row: 0,
        text: 'Premium',
        en_price: 20,
        ru_price: 2000,
        description: 'Premium plan',
        stars_price: 2000,
        callback_data: 'premium',
      },
    ]

    // Simulate a callback query with invalid data
    ctx.callbackQuery = {
      id: 'test-callback-id',
      from: ctx.from,
      message: { message_id: 1 } as any,
      data: 'invalid_subscription',
      chat_instance: 'test-chat-instance',
    }

    // Run the second step of the scene
    const subscriptionScene = (await import('@/scenes/subscriptionScene')).default
    await subscriptionScene.steps[1](ctx as unknown as MyContext)

    // Check that the bot sent error message
    assertReplyContains(ctx, 'Invalid subscription option')

    // Check that the scene was exited
    expect(ctx.scene.leave).toHaveBeenCalled()

    return {
      name: 'subscriptionScene: Invalid Callback',
      success: true,
      message: 'Successfully handled invalid subscription callback',
    }
  } catch (error) {
    return {
      name: 'subscriptionScene: Invalid Callback',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Test English localization
 */
export async function testSubscriptionScene_EnglishLocalization(): Promise<TestResult> {
  try {
    setupTest()

    // Create mock context with English language
    const ctx = createMockWizardContext()
    ctx.from = {
      id: TEST_USER_ID,
      is_bot: false,
      first_name: 'Test',
      username: 'test_user',
      language_code: 'en',
    }

    // Mock the scene.enter method for English payment
    ctx.scene.enter = jest.fn().mockResolvedValue(undefined)

    // Run the first step of the scene
    const subscriptionScene = (await import('@/scenes/subscriptionScene')).default
    await subscriptionScene.steps[0](ctx as unknown as MyContext)

    // Check that English text is displayed
    assertReplyMarkupContains(ctx, 'Main menu')

    // Setup for second step with English user
    ctx.session.buttons = [
      {
        row: 0,
        text: 'Premium',
        en_price: 20,
        ru_price: 2000,
        description: 'Premium plan',
        stars_price: 2000,
        callback_data: TEST_SUBSCRIPTION_ID,
      },
    ]

    // Simulate subscription selection
    ctx.callbackQuery = {
      id: 'test-callback-id',
      from: ctx.from,
      message: { message_id: 1 } as any,
      data: TEST_SUBSCRIPTION_ID,
      chat_instance: 'test-chat-instance',
    }

    // Run the second step
    await subscriptionScene.steps[1](ctx as unknown as MyContext)

    // Check that English payment wizard is entered
    expect(ctx.scene.enter).toHaveBeenCalledWith('getEnBillWizard')

    return {
      name: 'subscriptionScene: English Localization',
      success: true,
      message: 'Successfully handled English localization',
    }
  } catch (error) {
    return {
      name: 'subscriptionScene: English Localization',
      success: false,
      message: String(error),
    }
  }
}

/**
 * Run all tests for the subscriptionScene
 */
export async function runSubscriptionSceneTests(): Promise<TestResult[]> {
  const results: TestResult[] = []

  try {
    results.push(await testSubscriptionScene_EnterScene())
    results.push(await testSubscriptionScene_AdminUser())
    results.push(await testSubscriptionScene_SelectSubscription())
    results.push(await testSubscriptionScene_ReturnToMainMenu())
    results.push(await testSubscriptionScene_InvalidCallback())
    results.push(await testSubscriptionScene_EnglishLocalization())
  } catch (error) {
    results.push({
      name: 'subscriptionScene: Overall',
      success: false,
      message: String(error),
    })
  }

  return results
}

export default runSubscriptionSceneTests 