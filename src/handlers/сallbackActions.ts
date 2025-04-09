import { MyContext } from '@/types'
import { handleCallback } from './handleCallback'
import { handleModelCallback } from './handleModelCallback'

export function registerCallbackActions(bot: any) {
  bot.action('callback_query', (ctx: MyContext) => {
    console.log('CASE: callback_query', ctx)
    handleCallback(ctx)
  })

  bot.action(/^select_model_/, async (ctx: any) => {
    console.log('CASE: select_model_', ctx.match)
    const model = ctx.match.input.replace('select_model_', '')
    ctx.session.selectedModel = model
    console.log('Selected model:', model)
    await handleModelCallback(ctx, model)
  })
}
