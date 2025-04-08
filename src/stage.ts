import { Scenes } from 'telegraf'
import { MyContext } from './interfaces'
import {
  startScene,
  subscriptionScene,
  subscriptionCheckScene,
  createUserScene,
  checkBalanceScene,
  chatWithAvatarWizard,
  menuScene,
  getEmailWizard,
  getRuBillWizard,
  balanceScene,
  neuroPhotoWizard,
  neuroPhotoWizardV2,
  improvePromptWizard,
  sizeWizard,
  inviteScene,
  helpScene,
  paymentScene,
  neuroCoderScene,
  cancelPredictionsWizard,
  selectModelScene,
  selectNeuroPhotoScene
} from './scenes'

export const stage = new Scenes.Stage<MyContext>([
  startScene,
  subscriptionScene,
  subscriptionCheckScene,
  createUserScene,
  checkBalanceScene,
  chatWithAvatarWizard,
  menuScene,
  getEmailWizard,
  getRuBillWizard,
  balanceScene,
  neuroPhotoWizard,
  neuroPhotoWizardV2,
  improvePromptWizard,
  sizeWizard,
  inviteScene,
  helpScene,
  paymentScene,
  neuroCoderScene,
  cancelPredictionsWizard,
  selectModelScene,
  selectNeuroPhotoScene
]) 