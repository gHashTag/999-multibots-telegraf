# План удаления levels[]

## Маппинг levels[N] -> ModeEnum из CATEGORIES

### Основные функции (1-25):
- levels[1] -> ModeEnum.DigitalAvatarBody (🤖 Цифровое тело)
- levels[2] -> ModeEnum.NeuroPhoto (📸 Нейрофото)
- levels[3] -> ModeEnum.ImageToPrompt (🔍 Промпт из фото)
- levels[4] -> ModeEnum.Avatar (🧠 Мозг аватара)
- levels[5] -> ModeEnum.ChatWithAvatar (💭 Чат с аватаром)
- levels[6] -> ModeEnum.SelectModel (🤖 Выбор модели ИИ)
- levels[7] -> ModeEnum.Voice (🎤 Голос аватара)
- levels[8] -> ModeEnum.TextToSpeech (🎙️ Текст в голос)
- levels[9] -> ModeEnum.ImageToVideo (🎥 Фото в видео)
- levels[10] -> ModeEnum.TextToVideo (🎥 Видео из текста)
- levels[11] -> ModeEnum.TextToImage (🖼️ Генерация изображений)
- levels[12] -> 'ai_photoshop' (🎨 ИИ Фотошоп / FLUX Kontext)
- levels[13] -> ModeEnum.ImageUpscaler (⬆️ Увеличить качество)
- levels[14] -> 'morphing' (🌀 Infinity Морфинг)
- levels[15] -> 'face_swap' (🎭 Замена лица)
- levels[16] -> 'ai_heroes' (🦸‍♂️ ИИ Герои)
- levels[17] -> 'lip_sync' (🎤 Синхронизация губ) ИЛИ ModeEnum.Help (💬 Техподдержка) - КОНФЛИКТ!
- levels[18] -> 'competitor_monitoring' (🔍 Мониторинг конкурентов)
- levels[19] -> 'ai_reels' (🎬 ИИ Рилс)
- levels[20] -> ModeEnum.Invite (👥 Пригласить друга)
- levels[22] -> 'language' (🌐 Язык)
- levels[23] -> ModeEnum.SubscriptionScene (💫 Оформить подписку)
- levels[24] -> ModeEnum.TopUpBalance (💎 Пополнить баланс)
- levels[25] -> ModeEnum.Balance (💰 Баланс)

### Служебные кнопки (100+):
- levels[100] -> ModeEnum.TopUpBalance (💎 Пополнить баланс) - ДУБЛИКАТ levels[24]
- levels[101] -> ModeEnum.Balance (💰 Баланс) - ДУБЛИКАТ levels[25]
- levels[102] -> ModeEnum.Invite (👥 Пригласить друга) - ДУБЛИКАТ levels[20]
- levels[103] -> ModeEnum.Help (💬 Техподдержка)
- levels[104] -> 'main_menu' (🏠 Главное меню) - СПЕЦИАЛЬНЫЙ СЛУЧАЙ
- levels[105] -> ModeEnum.SubscriptionScene (💫 Оформить подписку) - ДУБЛИКАТ levels[23]
- levels[106] -> 'language' (🌐 Язык) - ДУБЛИКАТ levels[22]
- levels[107] -> ModeEnum.ImageUpscaler (⬆️ Увеличить качество фото) - ДУБЛИКАТ levels[13]
- levels[108] -> ModeEnum.VideoTranscription (📺 Транскрибация Reels)

## Проблемы:
1. levels[17] используется для ДВУХ разных кнопок (lip_sync И help) - КОНФЛИКТ!
2. Много дубликатов (100=24, 101=25, 102=20, 105=23, 106=22, 107=13)

## Решение:
1. Заменить все levels[N] на getButtonTextsByMode(ModeEnum.X) или getSpecialButtonTexts('main_menu')
2. Для levels[17] - использовать разные тексты в зависимости от контекста
3. Удалить levels[] полностью из NavigationService.ts
4. Обновить все импорты

