export enum SpeechModeEnum {
  TextToSpeech = 'text_to_speech',
  VoiceAvatar = 'voice_avatar',
}

export const speechModeCosts: Record<SpeechModeEnum, number> = {
  [SpeechModeEnum.TextToSpeech]: 10,
  [SpeechModeEnum.VoiceAvatar]: 50,
}
