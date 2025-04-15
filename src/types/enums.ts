/**
 * Статусы нейро-промптов
 */
export enum NeuroPromptStatus {
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed',
}

export enum ModeEnum {
  TextToImage = 'text_to_image',
  TextToVideo = 'text_to_video',
  ImageToImage = 'image_to_image',
  TopUpBalance = 'top_up_balance',
  Subscription = 'subscription',
}
