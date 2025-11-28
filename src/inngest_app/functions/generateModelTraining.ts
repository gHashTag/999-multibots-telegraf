/**
 * Model Training Inngest Function (Wrapper)
 * Creates digital avatars (LoRA training) for users
 */

import { inngest } from '@/inngest_app/client'
import { createGenerateModelTrainingFunction } from './existing/generateModelTrainingFunction'

// Export the created function by calling the factory
export const generateModelTraining = createGenerateModelTrainingFunction(inngest)
