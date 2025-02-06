import { MyContext } from '../../interfaces'

export async function startCommand(ctx: MyContext) {
  console.log('CASE: startCommand')
  // Запускаем нейро-квест
  await ctx.scene.enter('neuroQuestCommand')
  return
}
