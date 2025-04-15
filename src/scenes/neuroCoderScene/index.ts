import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces/context.interface'
import { promptNeuroCoder, promptNeuroCoder2 } from './prompts'
import { handleNeuroCoderInput } from './handlers'

export const neuroCoderScene = new Scenes.BaseScene<MyContext>('neuroCoder')

neuroCoderScene.enter(async ctx => {
  await ctx.reply(promptNeuroCoder)
})

neuroCoderScene.on('text', handleNeuroCoderInput)

export * from './types'
export * from './prompts'
export * from './handlers'
