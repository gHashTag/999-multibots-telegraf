import { TranscriptionModels, PRICE_PER_MINUTE } from '@/scenes/audioToTextScene/constants';
import { getUserBalance } from '@/core/supabase';

/**
 * Calculates the cost of audio transcription and optionally validates user balance
 * @param durationSeconds Duration in seconds
 * @param model Transcription model
 * @param userId Optional user ID for balance check
 * @param botName Optional bot name for balance check
 * @returns Information about price and model
 */
export const validateAndCalculateAudioTranscriptionPrice = async (
  durationSeconds: number,
  model: TranscriptionModels = TranscriptionModels.WHISPER_MEDIUM,
  userId?: number,
  botName?: string
): Promise<{ amount: number; modelId: string }> => {
  try {
    // Validate model if provided
    if (!Object.values(TranscriptionModels).includes(model)) {
      throw new Error(`Invalid transcription model: ${model}`);
    }
    
    // Convert duration from seconds to minutes and round up
    const durationMinutes = Math.ceil(durationSeconds / 60);
    
    // Get price per minute for the selected model
    const pricePerMinute = PRICE_PER_MINUTE[model] || 10; // Default: 10 credits per minute
    
    // Calculate total price
    const amount = durationMinutes * pricePerMinute;
    
    // Check user balance if userId and botName are provided
    if (userId !== undefined && botName) {
      // Get user balance - convert userId to string for compatibility with TelegramId type
      const balance = await getUserBalance(userId.toString(), botName);
      
      // Check if funds are sufficient
      if (balance < amount) {
        throw new Error(`Insufficient funds. Required: ${amount} credits, available: ${balance} credits`);
      }
    }
    
    return {
      amount,
      modelId: model
    };
  } catch (error) {
    console.error('Error calculating audio transcription price:', error);
    throw error;
  }
}; 