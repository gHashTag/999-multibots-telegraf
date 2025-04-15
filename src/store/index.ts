import { MySession } from '../interfaces'
import { ModeEnum } from '../interfaces/modes'
import {
  SubscriptionType,
  TransactionType,
} from '../interfaces/payments.interface'

export const defaultSession = (): MySession & {
  __scenes: Record<string, unknown>
} => ({
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
  subscription: 'stars' as SubscriptionType,
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
    type: TransactionType.MONEY_INCOME,
  },
  bypass_payment_check: false,
  __scenes: {
    cursor: 0,
    __scenes: {},
    data: '',
    severity: 0,
  },
})
