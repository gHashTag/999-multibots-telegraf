export { supabase, supabaseAdmin } from './client'

// Явные экспорты вместо export *
export { getBotsFromSupabase } from './getBotsFromSupabase'
export { saveVideoUrlToSupabase } from './saveVideoUrlToSupabase'
export { updateHistory } from './updateHistory'
export { getAiFeedbackFromSupabase } from './getAiFeedbackFromSupabase'
export { getBotGroupFromAvatars } from './getBotGroupFromAvatars'
export { createUser } from './createUser'
export { createModelTraining } from './createModelTraining'
export { updateUserBalance } from './updateUserBalance'
export { getAspectRatio } from './getAspectRatio'
export { getGeneratedImages } from './getGeneratedImages'
export { getHistory } from './getHistory'
export { getModel } from './getModel'
export { getPrompt } from './getPrompt'
export { getUserData } from './getUserData'
export { incrementGeneratedImages } from './incrementGeneratedImages'
export { isLimitAi } from './isLimitAi'
export { savePrompt } from './savePrompt'
export { setAspectRatio } from './setAspectRatio'
export { getUidInviter } from './getUidInviter'
export {
  getUserBalance,
  invalidateBalanceCache,
  getUserBalanceStats,
  type PaymentDetail,
  type UserBalanceStats,
} from './getUserBalance'
export { updateUserVoice } from './updateUserVoice'
export { getUserModel } from './getUserModel'
export { getReferalsCountAndUserData } from './getReferalsCountAndUserData'
export { cleanupOldArchives } from './cleanupOldArchives'
export { deleteFileFromSupabase } from './deleteFileFromSupabase'
export { ensureSupabaseAuth } from './ensureSupabaseAuth'
export { getTelegramIdByUserId } from './getTelegramIdByUserId'
export { getVoiceId } from './getVoiceId'
export { saveUserEmail } from './saveUserEmail'
export { sendPaymentInfo } from './sendPaymentInfo'
export { getPaymentsInfoByTelegramId } from './getPaymentsInfoByTelegramId'
export { updateUserSoul } from './updateUserSoul'
export { getUserByTelegramId } from './getUserByTelegramId'
export { getLatestUserModel } from './getLatestUserModel'
export { setPayments } from './setPayments'
export { getUid } from './getUid'
export { updateUserSubscription } from './updateUserSubscription'
export { getTranslation } from './getTranslation'
export { checkPaymentStatus } from './checkPaymentStatus'
export { updateUserLevelPlusOne } from './updateUserLevelPlusOne'
export { savePromptDirect } from './savePromptDirect'
export { getUserByTelegramIdString } from './getUserByTelegramIdString'
export { getUserDetailsSubscription } from './getUserDetailsSubscription'
export { createSuccessfulPayment as setSuccessfulPayment } from './createSuccessfulPayment'
export { getUserById } from './getUserById'
export {
  getPendingPayment,
  getPaymentByInvId,
  updatePaymentStatus,
} from './payments'

// Добавляем экспорт новой функции
export { updateUserModel } from './updateUserModel'
export { updateUserGender } from './updateUserGender'
export { getVideoUrl } from './video'
