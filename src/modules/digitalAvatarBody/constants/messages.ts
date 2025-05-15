export const TRAINING_MESSAGES = {
  userNotFound: {
    ru: 'Ваш профиль не найден. Пожалуйста, перезапустите бота командой /start.',
    en: 'Your profile was not found. Please restart the bot with /start.',
  },
  errorGeneral: {
    ru: 'Произошла ошибка. Пожалуйста, попробуйте позже.',
    en: 'An error occurred. Please try again later.',
  },
  errorFileUpload: {
    ru: 'Ошибка при загрузке файла. Убедитесь, что файл корректен и попробуйте снова.',
    en: 'Error uploading file. Please ensure the file is correct and try again.',
  },
  insufficientFunds: {
    ru: 'Недостаточно средств для выполнения операции.',
    en: 'Insufficient funds to perform the operation.',
  },
  error: (details: string) => ({
    ru: `Произошла ошибка: ${details}`,
    en: `An error occurred: ${details}`,
  }),
  start: {
    ru: 'Операция успешно начата.',
    en: 'Operation started successfully.',
  },
  // Добавьте другие сообщения по мере необходимости
}
