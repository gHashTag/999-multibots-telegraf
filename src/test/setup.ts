import { vi } from 'vitest'

// Global mock for Telegraf
vi.mock('telegraf/typings/scenes/context', () => ({}))

// Mock for missing telegraf scenes module
vi.mock('telegraf/typings/scenes', () => ({
  default: {},
}))

// Mock for the missing scenes/index.js file that's being imported in telegraf
vi.mock('telegraf/typings/scenes/index.js', () => ({
  default: {},
}))

// Mock for the sceneIds constant that is being imported in the test
vi.mock('@/constants/scenes', () => ({
  sceneIds: {
    START: 'start',
    MENU: 'menu',
    HELP: 'help',
    BALANCE: 'balance',
    PAYMENT: 'payment',
    STAR_PAYMENT: 'starPayment',
    RUBLE_PAYMENT: 'rublePayment',
    SETTINGS: 'settings',
    REFERRAL: 'referral',
    NEUROBLOGS_WIZARD: 'neuroblogsWizard',
    NEUROBLOGS_PROMPT_WIZARD: 'neuroblogsPromptWizard',
    REFERRAL_WITHDRAWAL: 'referralWithdrawal',
    NEURO_GYM_WIZARD: 'neuroGymWizard',
    NEURO_PHOTO_WIZARD: 'neuroPhotoWizard',
    NEURO_VOICE_WIZARD: 'neuroVoiceWizard',
    IMAGE_TO_VIDEO_WIZARD: 'imageToVideoWizard',
    TEXT_TO_VIDEO_WIZARD: 'textToVideoWizard',
    TEXT_TO_VOICE_WIZARD: 'textToVoiceWizard',
    SUBSCRIPTION_INFO: 'subscriptionInfo',
  },
}))

// Mock for other potentially missing modules
vi.mock('telegraf', () => {
  return {
    Markup: {
      keyboard: vi.fn().mockReturnThis(),
      inlineKeyboard: vi.fn().mockReturnThis(),
      button: vi.fn().mockReturnThis(),
      callbackButton: vi.fn().mockReturnThis(),
      urlButton: vi.fn().mockReturnThis(),
      removeKeyboard: vi.fn().mockReturnThis(),
      resize: vi.fn().mockReturnThis(),
      extra: vi.fn().mockReturnThis(),
      oneTime: vi.fn().mockReturnThis(),
      selective: vi.fn().mockReturnThis(),
    },
    Scenes: {
      BaseScene: class {},
      Stage: class {},
    },
    Composer: class {},
  }
})

// Mock for node-telegram-bot-api which might be used internally by telegraf
vi.mock('node-telegram-bot-api', () => ({
  default: class {},
}))

// Mock for core modules that might be imported but missing
vi.mock('@/core/supabase/getUserDetailsSubscription', () => ({
  getUserDetailsSubscription: vi.fn(),
}))

vi.mock('@/core/supabase/getUserBalance', () => ({
  getUserBalance: vi.fn(),
}))

// Suppress console warnings during tests
vi.spyOn(console, 'warn').mockImplementation(() => {})
