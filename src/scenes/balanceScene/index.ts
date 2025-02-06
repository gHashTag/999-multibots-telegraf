import { balanceCommand } from '@/commands/balanceCommand'
import { MyContext } from '@/interfaces'
import { Scenes } from 'telegraf'

export const balanceScene = new Scenes.WizardScene<MyContext>(
  'balanceCommand',
  balanceCommand
)
