import type { MyContext } from '@/interfaces'
import { NeuroPhotoWizardDependencies } from '../interfaces'

/**
 * Core service for handling business logic in the NeuroPhotoWizard module.
 * This service manages the flow of the wizard, interacting with injected dependencies.
 * @param ctx Telegram context for accessing session and user data.
 * @param dependencies Injected dependencies for isolation.
 * @returns Promise with the result of the wizard step processing.
 */
export async function processNeuroPhotoWizardStep(
  ctx: MyContext,
  dependencies: NeuroPhotoWizardDependencies
): Promise<void> {
  const telegramId = ctx.from?.id?.toString() || 'unknown'
  const isRussian = ctx.from?.language_code === 'ru'

  // Log the start of the wizard step
  dependencies.logger.info({
    message: '🔄 [NeuroPhotoWizard] Processing wizard step',
    telegramId,
    step: ctx.session.__scenes?.cursor || 0,
    sessionState: JSON.stringify({
      prompt: ctx.session.prompt,
      initialized: ctx.session.neuroPhotoInitialized,
    }),
  })

  // Check if user model exists in session
  if (
    !ctx.session.userModel ||
    !ctx.session.userModel.model_url ||
    !ctx.session.userModel.trigger_word
  ) {
    dependencies.logger.info({
      message: '⚠️ [NeuroPhotoWizard] No user model in session',
      telegramId,
      sessionData: JSON.stringify(ctx.session),
    })
    await dependencies.menu.sendGenericErrorMessage(ctx)
    return
  }

  // Log successful model check
  dependencies.logger.info({
    message: '✅ [NeuroPhotoWizard] User model check passed',
    telegramId,
    modelUrl: ctx.session.userModel.model_url,
    triggerWord: ctx.session.userModel.trigger_word,
  })

  // If prompt exists and scene is initialized, move to next step
  if (ctx.session.prompt && ctx.session.neuroPhotoInitialized === true) {
    dependencies.logger.info({
      message: '🔄 [NeuroPhotoWizard] Moving to prompt step (prompt exists)',
      telegramId,
      prompt: ctx.session.prompt,
    })
    ctx.wizard.next()
    return
  }

  // Mark scene as initialized
  ctx.session.neuroPhotoInitialized = true
  dependencies.logger.info({
    message: '✅ [NeuroPhotoWizard] Scene initialized',
    telegramId,
  })

  // Check for user input text
  if (
    ctx.message &&
    'text' in ctx.message &&
    ctx.message.text !== '📸 Нейрофото'
  ) {
    ctx.session.prompt = ctx.message.text
    dependencies.logger.info({
      message: '💾 [NeuroPhotoWizard] Saving prompt',
      telegramId,
      prompt: ctx.session.prompt,
    })
    ctx.wizard.next()
    return
  }

  // Send welcome message if no prompt yet
  dependencies.logger.info({
    message: '📤 [NeuroPhotoWizard] Sending welcome message',
    telegramId,
  })
  // Welcome message will be sent in the scene using the adapter
}
