import { WizardScene } from 'telegraf/scenes'
import { MyContext } from '@/interfaces'

const unwrapCallback = async (
  ctx: MyContext,
  nextScene: (ctx: MyContext) => Promise<string | undefined>
): Promise<void> => {
  const nextSceneId = await nextScene(ctx)
  if (nextSceneId) {
    await ctx.scene.enter(nextSceneId, ctx.scene.state)
  } else {
    ctx.scene.leave()
  }
}

export const composeWizardScene = (
  ...advancedSteps: Array<
    (
      ctx: MyContext,
      doneCallback: () => Promise<void>,
      next: () => void
    ) => Promise<void>
  >
) =>
  function createWizardScene(
    sceneType: string,
    nextScene: (ctx: MyContext) => Promise<string | undefined>
  ) {
    return new WizardScene(
      sceneType,
      ...advancedSteps.map(
        stepFn => async (ctx: MyContext, next: () => void) => {
          if (!ctx.message && !ctx.callbackQuery) return undefined
          return stepFn(ctx, () => unwrapCallback(ctx, nextScene), next)
        }
      )
    )
  }
