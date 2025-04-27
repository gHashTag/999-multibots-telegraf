import type { MySession } from '@/interfaces'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { ModeEnum } from '@/interfaces/modes';
// Определяем значения напрямую, чтобы избежать проблем с импортом enum
const STARS = SubscriptionType.NEUROPHOTO;

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
  subscription: STARS,
  selectedPayment: {
    amount: 0,
    stars: 10,
    subscription: STARS,
    type: 'PAYMENT' as const,
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
  __scenes: {
    cursor: 0,
    state: {}
  }
}
