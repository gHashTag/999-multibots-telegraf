import { Telegraf, Scenes } from 'telegraf'
import { MyContext } from './interfaces'
import { SceneEnum } from '@/types/scenes'
import { handleMenu } from './handlers'
import { stage } from './stage'
import { Logger as logger } from '@/utils/logger'
import { enterScene } from '@/utils/sceneHelpers'

// ... existing code ...

export const registerCommands = (bot: Telegraf<MyContext>) => {
  bot.use(stage.middleware())

  bot.command('broadcast', async (ctx) => {
    await enterScene(ctx, SceneEnum.CancelPredictions) // Using CancelPredictions as a temporary scene for broadcast
  })

  bot.command('menu', async (ctx) => {
    await enterScene(ctx, SceneEnum.MainMenu)
  })

  bot.command('start', async (ctx) => {
    await enterScene(ctx, SceneEnum.SubscriptionCheck)
  })

  bot.command('help', async (ctx) => {
    await enterScene(ctx, SceneEnum.Help)
  })

  bot.command('balance', async (ctx) => {
    await enterScene(ctx, SceneEnum.Balance)
  })

  bot.command('invite', async (ctx) => {
    await enterScene(ctx, SceneEnum.Invite)
  })

  bot.command('subscribe', async (ctx) => {
    await enterScene(ctx, SceneEnum.Subscription)
  })

  // Handle menu actions
  bot.on('callback_query', async (ctx) => {
    if (!ctx.callbackQuery || typeof ctx.callbackQuery !== 'object') return
    
    const callbackData = 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : null
    if (!callbackData) return

    switch (callbackData) {
      case 'neuro_photo':
        await enterScene(ctx, SceneEnum.NeuroPhoto)
        break
      case 'improve_prompt':
        await enterScene(ctx, SceneEnum.ImprovePrompt)
        break
      case 'change_size':
        await enterScene(ctx, SceneEnum.ChangeSize)
        break
      case 'payment':
        await enterScene(ctx, SceneEnum.Payment)
        break
      case 'neuro_coder':
        await enterScene(ctx, SceneEnum.NeuroCoder)
        break
      case 'image_to_prompt':
        await enterScene(ctx, SceneEnum.TextToImage)
        break
      case 'check_balance':
        await enterScene(ctx, SceneEnum.CheckBalance)
        break
      default:
        await handleMenu(ctx)
    }
  })

  // ... existing code ...
}
