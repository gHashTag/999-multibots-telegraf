import { PaymentType, SubscriptionType } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { Scenes } from 'telegraf'

export const defaultSession: Partial<Scenes.WizardSession> & {
  [key: string]: any
} = {
  mode: ModeEnum.TextToImage,
  prompt: '',
  selectedModel: '',
  userModel: {
    model_name: '',
    trigger_word: '',
    model_url: 'placeholder/placeholder:placeholder',
    finetune_id: '',
  },
  targetUserId: 0,
  steps: 0,
  selectedSize: '',
  subscription: SubscriptionType.STARS,
  selectedPayment: {
    amount: 0,
    stars: 0,
    subscription: SubscriptionType.STARS,
    type: PaymentType.MONEY_OUTCOME,
  },
  videoUrl: '',
  imageUrl: '',
  audioUrl: '',
  email: '',
  images: [],
  memory: {
    messages: [],
  },
  attempts: 0,
  amount: 0,
  modelName: '',
  triggerWord: '',
  videoModel: '',
  translations: [],
  buttons: [],
  neuroPhotoInitialized: false,
  inviteCode: undefined,
  inviter: undefined,
  paymentAmount: undefined,
  gender: undefined,
}
