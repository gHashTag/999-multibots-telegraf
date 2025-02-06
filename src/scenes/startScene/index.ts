import { startCommand } from '@/commands/startCommand'
import { MyContext } from '@/interfaces'
import { Scenes } from 'telegraf'

export const startScene = new Scenes.WizardScene<MyContext>(
  'startScene',
  startCommand
)
