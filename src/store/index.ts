import { MySession } from '../interfaces'
import { ModeEnum } from '../interfaces/modes'
import { LocalSubscription } from '../scenes/getRuBillWizard'

export const defaultSession = (): MySession => ({
  memory: {
    messages: [],
  },
  email: '',
  selectedModel: '',
  prompt: '',
  selectedSize: '',
  userModel: {
    model_name: '',
    trigger_word: '',
    model_url: '' as `${string}/${string}:${string}`,
    model_key: '' as `${string}/${string}:${string}`,
  },
  numImages: 1,
  telegram_id: '',
  mode: ModeEnum.TextToImage,
  attempts: 0,
  videoModel: '',
  imageUrl: '',
  videoUrl: '',
  audioUrl: '',
  amount: 0,
  subscription: '',
  images: [],
  modelName: '',
  targetUserId: 0,
  username: '',
  triggerWord: '',
  steps: 0,
  inviter: '',
  inviteCode: '',
  invoiceURL: '',
  buttons: [],
  selectedPayment: {
    amount: 0,
    stars: 0,
  },
  bypass_payment_check: false,
})
