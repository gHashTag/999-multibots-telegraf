/**
 * Handle Model Training Completed Inngest Function (Wrapper)
 * Handles completion of model training from Replicate webhook
 */

import { inngest } from '@/inngest_app/client'
import { createHandleModelTrainingCompletedFunction } from './existing/handleModelTrainingCompleted'

// Export the created function by calling the factory
export const handleModelTrainingCompleted =
  createHandleModelTrainingCompletedFunction(inngest)





