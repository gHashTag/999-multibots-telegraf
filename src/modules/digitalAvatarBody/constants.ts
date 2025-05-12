export const DIGITAL_AVATAR_BODY_CONFIG = {
  API_URL: 'default_api_url',
  CONFIG_UPLOAD_DIR: 'default_upload_dir',
  SECRET_API_KEY: 'default_secret_key',
  COSTS: {
    modelTraining: 50,
  },
  REPLICATE: {
    REPLICATE_API_TOKEN: 'default_token',
    TRAINING_MODEL_ID: 'default_model_id',
    TRAINING_MODEL_VERSION: 'default_version',
    TRAINING_MODEL_OWNER: 'default_owner',
    TRAINING_MODEL_NAME: 'default_name',
    REPLICATE_USERNAME: 'default_username',
  },
}

export const MODEL_TRAINING_ERROR_MESSAGES = {
  INSUFFICIENT_BALANCE: 'Недостаточно средств для тренировки модели.',
  TRAINING_FAILED: 'Ошибка при тренировке модели.',
}
