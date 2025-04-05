import { MySession } from '../interfaces'
import { ModeEnum } from '../price/helpers/modelsCost'

export const defaultSession: () => MySession = () => ({
  selectedModel: '',
  prompt: '',
  selectedSize: '9:16',
  userModel: {
    model_name: '',
    trigger_word: '',
    model_url: 'i/i:i',
  },
  numImages: 1,
  telegram_id: '0',
  mode: ModeEnum.TextToImage,
  attempts: 0,
  videoModel: '',
  paymentAmount: 0,
  images: [],
  modelName: '',
  targetUserId: 0,
  username: '',
  triggerWord: '',
  steps: 0,
  videoUrl: '',
  imageUrl: '',
  audioUrl: '',
  email: '',
  subscription: 'stars',
  inviter: '',
  inviteCode: '',
  invoiceURL: '',
  selectedPayment: {
    amount: 0,
    stars: '',
    subscription: 'stars',
  },
  buttons: [],
})
