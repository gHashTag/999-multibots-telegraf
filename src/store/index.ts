import { MySession, PaymentType } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { SubscriptionType } from '@/interfaces/subscription.interface'

export const defaultSession: any = {
  __scenes: {
    data: '',
    cursor: 0,
    severity: 0,
    __scenes: {},
    subscription: null,
    step: 0,
  },
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
  cursor: 0,
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
  lastStartCommand: 0,
}
