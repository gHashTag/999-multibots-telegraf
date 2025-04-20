
// Mock WizardScene from telegraf/scenes
jest.mock('telegraf/scenes', () => ({
  WizardScene: jest.fn().mockImplementation((sceneType: string, ...handlers: any[]) => ({
    sceneType,
    handlers,
  })),
}))

import { composeWizardScene } from '@/scenes/sceneFactory'

describe('composeWizardScene', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns a function to create WizardScene', () => {
    const step1 = async () => {}
    const step2 = async () => {}
    const createWizard = composeWizardScene(step1, step2)
    expect(typeof createWizard).toBe('function')
  })

  it('creates WizardScene with sceneType and handlers', () => {
    const step1 = jest.fn(async (ctx, done, next) => {})
    const step2 = jest.fn(async (ctx, done, next) => {})
    const nextScene = jest.fn(async (ctx) => 'nextId')
    const createWizard = composeWizardScene(step1, step2)
    const scene: any = createWizard('sceneA', nextScene)
    expect(scene.sceneType).toBe('sceneA')
    expect(scene.handlers).toHaveLength(2)
    scene.handlers.forEach((handler: any) => {
      expect(typeof handler).toBe('function')
    })
  })

  it('handlers skip when no message and no callbackQuery', async () => {
    const step = jest.fn(async (ctx, done, next) => {})
    const nextScene = jest.fn()
    const createWizard = composeWizardScene(step)
    const scene: any = createWizard('sceneB', nextScene)
    const [handler] = scene.handlers
    const ctx: any = { scene: { enter: jest.fn(), leave: jest.fn(), state: {} } }
    const result = await handler(ctx, jest.fn())
    expect(result).toBeUndefined()
    expect(step).not.toHaveBeenCalled()
  })

  it('calls step and enter next scene when message present', async () => {
    const step = jest.fn(async (ctx, done, next) => await done())
    const nextScene = jest.fn(async () => 'nextSceneId')
    const createWizard = composeWizardScene(step)
    const scene: any = createWizard('sceneC', nextScene)
    const [handler] = scene.handlers
    const ctx: any = {
      message: {},
      scene: { enter: jest.fn(), leave: jest.fn(), state: { foo: 'bar' } },
    }
    await handler(ctx, jest.fn())
    expect(step).toHaveBeenCalledWith(
      ctx,
      expect.any(Function),
      expect.any(Function)
    )
    expect(nextScene).toHaveBeenCalledWith(ctx)
    expect(ctx.scene.enter).toHaveBeenCalledWith('nextSceneId', { foo: 'bar' })
    expect(ctx.scene.leave).not.toHaveBeenCalled()
  })

  it('calls leave when nextScene returns undefined', async () => {
    const step = jest.fn(async (ctx, done, next) => await done())
    const nextScene = jest.fn(async () => undefined)
    const createWizard = composeWizardScene(step)
    const scene: any = createWizard('sceneD', nextScene)
    const [handler] = scene.handlers
    const ctx: any = {
      callbackQuery: {},
      scene: { enter: jest.fn(), leave: jest.fn(), state: {} },
    }
    await handler(ctx, jest.fn())
    expect(step).toHaveBeenCalled()
    expect(nextScene).toHaveBeenCalledWith(ctx)
    expect(ctx.scene.leave).toHaveBeenCalled()
    expect(ctx.scene.enter).not.toHaveBeenCalled()
  })
})