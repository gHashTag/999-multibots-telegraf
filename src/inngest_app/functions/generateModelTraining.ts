/**
 * Model Training Inngest Function (Wrapper)
 * Creates digital avatars (LoRA training) for users
 */

import { generateModelTrainingFunction } from './existing/generateModelTrainingFunction'

// Re-export the function
export const generateModelTraining = generateModelTrainingFunction
