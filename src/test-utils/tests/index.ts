// Экспортируем все тесты
import { testImageToPrompt } from './imageToPrompt.test'
import { testBroadcastMessage, testBroadcast } from './broadcast.test'
import { testPaymentSystem, runAllPaymentTests } from './payment.test'

export {
  testImageToPrompt,
  testBroadcastMessage,
  testBroadcast,
  testPaymentSystem,
  runAllPaymentTests,
}
