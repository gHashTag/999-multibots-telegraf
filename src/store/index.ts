import { MySession, BufferType } from '../interfaces'
import { ModeEnum } from '../interfaces/modes'
import { TransactionType } from '../interfaces/payments.interface'

export const defaultSession = (): MySession & {
  __scenes: Record<string, unknown>
} => ({
  cursor: 0,
  attempts: 0,
  amount: 0,
  memory: {
    messages: [],
  },
  selectedModel: '',
  prompt: '',
  selectedSize: '',
  userModel: {
    model_name: '',
    trigger_word: '',
    model_url: '' as `${string}/${string}:${string}`,
    model_key: '' as `${string}/${string}:${string}`,
  },
  mode: ModeEnum.TextToImage,
  videoModel: '',
  imageUrl: '',
  subscription: undefined,
  buttons: [],
  selectedPayment: {
    amount: 0,
    stars: 0,
    subscription: undefined,
    type: TransactionType.MONEY_INCOME,
  },
  bypass_payment_check: false,
  images: [] as BufferType,
  modelName: '',
  targetUserId: '',
  username: '',
  triggerWord: '',
  steps: [],
  videoUrl: '',
  audioUrl: '',
  email: '',
  __scenes: {
    cursor: 0,
    __scenes: {},
    data: '',
    severity: 0,
    subscription: undefined,
    state: {
      step: 0,
    },
  },
})
