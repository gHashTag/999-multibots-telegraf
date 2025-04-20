import { describe, it, expect, beforeEach, jest } from '@jest/globals'

// Mock scenes to avoid loading actual scene modules
jest.mock('@/scenes', () => ({
  startScene: {},
  subscriptionScene: {},
  subscriptionCheckScene: {},
  createUserScene: {},
  checkBalanceScene: {},
  chatWithAvatarWizard: {},
  menuScene: {},
  getEmailWizard: {},
  getRuBillWizard: {},
  balanceScene: {},
  avatarBrainWizard: {},
  imageToPromptWizard: {},
  emailWizard: {},
  textToImageWizard: {},
  improvePromptWizard: {},
  sizeWizard: {},
  neuroPhotoWizard: {},
  neuroPhotoWizardV2: {},
  textToVideoWizard: {},
  imageToVideoWizard: {},
  cancelPredictionsWizard: {},
  trainFluxModelWizard: {},
  uploadTrainFluxModelScene: {},
  digitalAvatarBodyWizard: {},
  digitalAvatarBodyWizardV2: {},
  selectModelWizard: {},
  voiceAvatarWizard: {},
  textToSpeechWizard: {},
  paymentScene: {},
  neuroCoderScene: {},
  lipSyncWizard: {},
  helpScene: {},
  inviteScene: {},
  levelQuestWizard: [],
  uploadVideoScene: {},
}))
// Mock Telegraf session and Stage middleware
jest.mock('telegraf', () => {
  const actual = jest.requireActual('telegraf')
  return {
    ...actual,
    session: jest.fn(() => 'SESSION_MIDDLEWARE'),
    Scenes: {
      Stage: jest.fn().mockImplementation(() => ({ middleware: () => 'STAGE_MIDDLEWARE' })),
      WizardScene: jest.fn().mockImplementation((id: string, ...handlers: any[]) => ({
        id,
        steps: handlers,
        middleware: () => 'WIZARD_MIDDLEWARE',
        enter: jest.fn(),
        leave: jest.fn(),
      })),
      BaseScene: jest.fn().mockImplementation((id: string) => ({
        id,
        middleware: () => 'BASE_MIDDLEWARE',
        enter: jest.fn(),
        leave: jest.fn(),
      })),
    },
  }
})
// Mock dependencies
jest.mock('@/store', () => ({ defaultSession: { dummy: true } }))
jest.mock('@/handlers/setupLevelHandlers', () => ({ setupLevelHandlers: jest.fn() }))
jest.mock('@/commands/get100Command', () => ({ get100Command: jest.fn() }))

// Import module under test
import { registerCommands } from '@/registerCommands'
import { setupLevelHandlers } from '@/handlers/setupLevelHandlers'
import { get100Command } from '@/commands/get100Command'
import { session } from 'telegraf'
import { stage } from '@/registerCommands'

describe('registerCommands', () => {
  let bot: any
  let composer: any

  beforeEach(() => {
    // Reset mocks and create fresh bot/composer stubs
    jest.clearAllMocks()
    bot = {
      use: jest.fn(),
      command: jest.fn(),
    }
    composer = {
      middleware: jest.fn(() => 'COMPOSER_MIDDLEWARE'),
      command: jest.fn(),
    }
  })

  it('registers middleware and commands correctly', () => {
    registerCommands({ bot, composer })
    // Middleware registration
    expect(session).toHaveBeenCalledWith({ defaultSession: { dummy: true } })
    expect(bot.use).toHaveBeenCalledWith('SESSION_MIDDLEWARE')
    expect(bot.use).toHaveBeenCalledWith('STAGE_MIDDLEWARE')
    expect(bot.use).toHaveBeenCalledWith('COMPOSER_MIDDLEWARE')
    // Level handlers setup
    expect(setupLevelHandlers).toHaveBeenCalledWith(bot)
    // Bot commands
    expect(bot.command).toHaveBeenCalledWith('start', expect.any(Function))
    expect(bot.command).toHaveBeenCalledWith('menu', expect.any(Function))
    // Composer commands
    expect(composer.command).toHaveBeenCalledWith('menu', expect.any(Function))
    expect(composer.command).toHaveBeenCalledWith('get100', expect.any(Function))
    expect(composer.command).toHaveBeenCalledWith('buy', expect.any(Function))
    expect(composer.command).toHaveBeenCalledWith('invite', expect.any(Function))
    expect(composer.command).toHaveBeenCalledWith('balance', expect.any(Function))
    expect(composer.command).toHaveBeenCalledWith('help', expect.any(Function))
    expect(composer.command).toHaveBeenCalledWith('neuro_coder', expect.any(Function))
  })
})