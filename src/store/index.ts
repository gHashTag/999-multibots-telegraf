import { MySession } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { SubscriptionType } from '@/interfaces'
import { PaymentType } from './interfaces'

export const defaultSession: MySession = {
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
    type: PaymentType.SYSTEM,
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
}
