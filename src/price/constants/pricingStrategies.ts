import { ModeEnum } from '@/interfaces/modes'
import { PricingStrategy } from '@/price/types/strategies'

/**
 * Стратегии ценообразования для каждого режима
 *
 * FIXED - фиксированная цена из BASE_COSTS
 * FREE - бесплатно (цена = 0)
 * MODEL_BASED - цена зависит от выбранной модели (требуется указать modelId)
 * STEP_BASED - цена зависит от количества шагов (требуется указать steps)
 */
export const MODE_PRICING_STRATEGY: Partial<Record<ModeEnum, PricingStrategy>> =
  {
    [ModeEnum.NeuroPhoto]: PricingStrategy.FIXED,
    [ModeEnum.NeuroPhotoV2]: PricingStrategy.FIXED,
    [ModeEnum.ImageToPrompt]: PricingStrategy.FIXED,
    [ModeEnum.Avatar]: PricingStrategy.FREE,
    [ModeEnum.ChatWithAvatar]: PricingStrategy.FREE,
    [ModeEnum.SelectModel]: PricingStrategy.FREE,
    [ModeEnum.SelectAiTextModel]: PricingStrategy.FREE,
    [ModeEnum.Voice]: PricingStrategy.FIXED,
    [ModeEnum.TextToSpeech]: PricingStrategy.FIXED,
    [ModeEnum.ImageToVideo]: PricingStrategy.MODEL_BASED, // Нужно указать modelId
    [ModeEnum.TextToVideo]: PricingStrategy.MODEL_BASED, // Нужно указать modelId
    [ModeEnum.TextToImage]: PricingStrategy.FIXED,
    [ModeEnum.LipSync]: PricingStrategy.FIXED,
    [ModeEnum.VoiceToText]: PricingStrategy.FIXED,
    [ModeEnum.DigitalAvatarBody]: PricingStrategy.STEP_BASED, // Нужно указать steps
    [ModeEnum.DigitalAvatarBodyV2]: PricingStrategy.STEP_BASED, // Нужно указать steps

    // Служебные операции - бесплатно
    [ModeEnum.StartScene]: PricingStrategy.FREE,
    [ModeEnum.Help]: PricingStrategy.FREE,
    [ModeEnum.Subscribe]: PricingStrategy.FREE,
    [ModeEnum.MainMenu]: PricingStrategy.FREE,
    [ModeEnum.Balance]: PricingStrategy.FREE,
    [ModeEnum.Stats]: PricingStrategy.FREE,
    [ModeEnum.SelectNeuroPhoto]: PricingStrategy.FREE,
    [ModeEnum.ChangeSize]: PricingStrategy.FREE,
    [ModeEnum.Invite]: PricingStrategy.FREE,
    [ModeEnum.ImprovePrompt]: PricingStrategy.FREE,
    [ModeEnum.TopUpBalance]: PricingStrategy.FREE,
    [ModeEnum.VideoInUrl]: PricingStrategy.FREE,
    [ModeEnum.Support]: PricingStrategy.FREE,
    [ModeEnum.BroadcastWizard]: PricingStrategy.FREE,
    [ModeEnum.SubscriptionCheckScene]: PricingStrategy.FREE,
    [ModeEnum.ImprovePromptWizard]: PricingStrategy.FREE,
    [ModeEnum.SizeWizard]: PricingStrategy.FREE,
    [ModeEnum.PaymentScene]: PricingStrategy.FREE,
    [ModeEnum.InviteScene]: PricingStrategy.FREE,
    [ModeEnum.BalanceScene]: PricingStrategy.FREE,
    [ModeEnum.Step0]: PricingStrategy.FREE,
    [ModeEnum.NeuroCoderScene]: PricingStrategy.FREE,
    [ModeEnum.CheckBalanceScene]: PricingStrategy.FREE,
    [ModeEnum.HelpScene]: PricingStrategy.FREE,
    [ModeEnum.CancelPredictionsWizard]: PricingStrategy.FREE,
    [ModeEnum.EmailWizard]: PricingStrategy.FREE,
    [ModeEnum.GetRuBillWizard]: PricingStrategy.FREE,
    [ModeEnum.SubscriptionScene]: PricingStrategy.FREE,
    [ModeEnum.CreateUserScene]: PricingStrategy.FREE,
  }
