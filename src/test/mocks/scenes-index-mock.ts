// Мок для индекса сцен проекта
import { BaseScene, WizardScene } from './telegraf-scenes.mock'

// Создаем моки сцен
const startScene = new BaseScene('startScene')
const menuScene = new BaseScene('menuScene')
const balanceScene = new BaseScene('balanceScene')
const videoScene = new WizardScene(
  'videoScene',
  async ctx => Promise.resolve(),
  async ctx => Promise.resolve()
)
const imageScene = new WizardScene(
  'imageScene',
  async ctx => Promise.resolve(),
  async ctx => Promise.resolve()
)
const neuroPhotoWizard = new WizardScene(
  'neuroPhotoWizard',
  async ctx => Promise.resolve(),
  async ctx => Promise.resolve()
)
const imageToVideoWizard = new WizardScene(
  'imageToVideoWizard',
  async ctx => Promise.resolve(),
  async ctx => Promise.resolve()
)
const textToVideoWizard = new WizardScene(
  'textToVideoWizard',
  async ctx => Promise.resolve(),
  async ctx => Promise.resolve()
)
const helpScene = new BaseScene('helpScene')
const paymentScene = new BaseScene('paymentScene')
const starPaymentScene = new BaseScene('starPaymentScene')
const rublePaymentScene = new BaseScene('rublePaymentScene')
const voiceToImageWizard = new WizardScene(
  'voiceToImageWizard',
  async ctx => Promise.resolve(),
  async ctx => Promise.resolve()
)
const voiceAvatarWizard = new WizardScene(
  'voiceAvatarWizard',
  async ctx => Promise.resolve(),
  async ctx => Promise.resolve()
)

export const scenes = {
  startScene,
  menuScene,
  balanceScene,
  videoScene,
  imageScene,
  neuroPhotoWizard,
  imageToVideoWizard,
  textToVideoWizard,
  helpScene,
  paymentScene,
  starPaymentScene,
  rublePaymentScene,
  voiceToImageWizard,
  voiceAvatarWizard,
}

export default scenes
