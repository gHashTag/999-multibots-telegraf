import { MySession } from '../interfaces'
import { ModeEnum } from '../price/helpers/modelsCost'
import { LocalSubscription } from '../scenes/getRuBillWizard'
export const defaultSession = (): MySession => ({
  memory: {
    messages: []
  },
  email: '',
  selectedModel: '',
  prompt: '',
  selectedSize: '',
  userModel: {
    id: 0,
    telegram_id: '',
    balance: 0,
    stars: 0,
    subscription: null,
    subscription_end_date: null,
    created_at: '',
    updated_at: '',
    email: '',
    username: '',
    first_name: '',
    last_name: '',
    language_code: '',
    is_premium: false,
    is_blocked: false,
    is_admin: false,
    is_super_admin: false,
    referral_code: '',
    referrer_id: null,
    referral_balance: 0,
    referral_count: 0,
    total_referral_earnings: 0,
    total_earnings: 0,
    total_spent: 0,
    last_activity: '',
    settings: null
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
  subscription: null,
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
    stars: 0
  }
})
