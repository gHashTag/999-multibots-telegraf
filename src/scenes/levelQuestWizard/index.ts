import { Scenes, Markup } from 'telegraf'
import { ModeEnum } from '@/interfaces/modes'
import {
  handleLevel1,
  handleLevel10,
  handleLevel11,
  handleLevel2,
  handleLevel3,
  handleLevel4,
  handleLevel5,
  handleLevel6,
  handleLevel7,
  handleLevel8,
  handleLevel9,
  handleQuestComplete,
  handleQuestRules,
} from './handlers'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers'
import { showMainMenu } from '@/services/NavigationService'
import { getReferalsCountAndUserData } from '@/core/supabase'

// Создаем сцены для каждого шага
const createStepScene = (
  stepNumber: number,
  handler: (ctx: MyContext) => Promise<void>,
  nextStepText: string
) => {
  const scene = new Scenes.BaseScene<MyContext>(`step${stepNumber}Scene`)
  scene.enter(async ctx => {
    const telegram_id = ctx.from?.id?.toString() || ''
    const { subscriptionType } = await getReferalsCountAndUserData(telegram_id)
    await handler(ctx)
    const isRu = isRussian(ctx)
    await ctx.reply(
      stepNumber < 12
        ? isRu
          ? `Нажмите "${nextStepText}", чтобы продолжить.`
          : `Click "${nextStepText}", to continue.`
        : isRu
        ? `Вы успешно прошли все обучение и достигли максимального уровня! 🌟✨`
        : `You have successfully completed all training and reached the maximum level! 🌟✨`,
      stepNumber < 12
        ? Markup.keyboard([[nextStepText], ['➡️ Завершить']]).resize()
        : await showMainMenu(ctx)
    )
  })

  scene.hears(nextStepText, async ctx => {
    if (stepNumber < 12) {
      await ctx.scene.enter(`step${stepNumber + 1}Scene`)
    } else {
      await ctx.scene.enter('complete')
    }
  })

  scene.hears('➡️ Завершить', async ctx => {
    await ctx.scene.enter('complete')
  })

  return scene
}

// Создаем все шаги
export const step0Scene = createStepScene(0, handleQuestRules, '➡️ Далее шаг 1')
export const step1Scene = createStepScene(1, handleLevel1, '➡️ Далее шаг 2')
export const step2Scene = createStepScene(2, handleLevel2, '➡️ Далее шаг 3')
export const step3Scene = createStepScene(3, handleLevel3, '➡️ Далее шаг 4')
export const step4Scene = createStepScene(4, handleLevel4, '➡️ Далее шаг 5')
export const step5Scene = createStepScene(5, handleLevel5, '➡️ Далее шаг 6')
export const step6Scene = createStepScene(6, handleLevel6, '➡️ Далее шаг 7')
export const step7Scene = createStepScene(7, handleLevel6, '➡️ Далее шаг 8')
export const step8Scene = createStepScene(8, handleLevel7, '➡️ Далее шаг 9')
export const step9Scene = createStepScene(9, handleLevel8, '➡️ Далее шаг 10')
export const step10Scene = createStepScene(10, handleLevel9, '➡️ Далее шаг 11')
export const step11Scene = createStepScene(11, handleLevel10, '➡️ Далее шаг 12')
export const step12Scene = createStepScene(12, handleLevel11, '➡️ Завершить')

// Финальная сцена
export const completeScene = new Scenes.BaseScene<MyContext>('complete')

completeScene.enter(async ctx => {
  await handleQuestComplete(ctx)
  await ctx.scene.leave()
  const { showMainMenu } = await import('@/services/NavigationService')
  await showMainMenu(ctx)
})

// Экспортируем все сцены
export const levelQuestWizard = new Scenes.BaseScene<MyContext>(
  'levelQuestWizard'
)

levelQuestWizard.enter(async ctx => {
  if (!ctx.from?.id) {
    console.error('❌ Telegram ID не найден')
    return
  }
  const telegram_id = ctx.from.id.toString()
  const { subscriptionType } = await getReferalsCountAndUserData(telegram_id)
  const isRu = isRussian(ctx)

  // ... логика сцены ...

  // Пример использования в конце сцены (если нужно обновить меню)
  await ctx.reply(
    isRu ? 'Вы завершили квест!' : 'You completed the quest!'
  )
  await showMainMenu(ctx)
})

// ... другие обработчики сцены ...
