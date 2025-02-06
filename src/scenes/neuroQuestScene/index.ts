import { neuroQuestCommand } from '@/commands/neuroQuestCommand'
import { MyContext } from '@/interfaces'
import { Scenes } from 'telegraf'

export const neuroQuestScene = new Scenes.WizardScene<MyContext>(
  'neuroQuestScene',
  neuroQuestCommand
)
