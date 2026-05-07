use std::collections::HashMap;
use trios_mb_types::user::Language;

static MESSAGES: std::sync::OnceLock<HashMap<&'static str, HashMap<Language, &'static str>>> =
    std::sync::OnceLock::new();

fn messages() -> &'static HashMap<&'static str, HashMap<Language, &'static str>> {
    MESSAGES.get_or_init(|| {
        let mut m = HashMap::new();

        m.insert("nav_main_menu", lang("🏠 Главное меню", "🏠 Main menu"));
        m.insert("nav_back", lang("◀️ Назад", "◀️ Back"));
        m.insert("nav_cancel", lang("Отмена", "Cancel"));
        m.insert("nav_help", lang("❓ Справка", "❓ Help"));
        m.insert("nav_back_to_menu", lang("🔙 Назад в меню", "🔙 Back to menu"));
        m.insert("nav_back_to_menu_arrow", lang("⬅️ Назад в меню", "⬅️ Back to Menu"));
        m.insert("nav_next", lang("Далее", "Next"));

        m.insert("btn_stars", lang("⭐️ Звездами", "⭐️ Stars"));
        m.insert("btn_stars_alt", lang("⭐ Звездами", "⭐ Stars"));
        m.insert("btn_rubles", lang("💳 Рублями", "💳 Rubles"));
        m.insert("btn_crypto", lang("💎 Криптой", "💎 Crypto"));
        m.insert("btn_top_up_balance", lang("💎 Пополнить баланс", "💎 Top up Balance"));
        m.insert("btn_subscribe", lang("💫 Оформить подписку", "💫 Subscribe"));
        m.insert("btn_invite_friend", lang("👥 Пригласить друга", "👥 Invite Friend"));
        m.insert("btn_tech_support", lang("💬 Техподдержка", "💬 Tech Support"));
        m.insert("btn_language", lang("🌐 Язык", "🌐 Language"));
        m.insert("btn_balance", lang("💰 Баланс", "💰 Balance"));
        m.insert("btn_download_excel", lang("📊 Скачать детальный отчет Excel", "📊 Download detailed Excel report"));
        m.insert("btn_help_command", lang("Справка по команде", "Help for the command"));

        m.insert("cat_photo", lang("📸 Фото", "📸 Photo"));
        m.insert("cat_video", lang("🎥 Видео", "🎥 Video"));
        m.insert("cat_audio", lang("🎙️ Аудио", "🎙️ Audio"));
        m.insert("cat_avatars", lang("🤖 Аватары", "🤖 Avatars"));
        m.insert("cat_tools", lang("🛠️ Инструменты", "🛠️ Tools"));
        m.insert("cat_profile", lang("👤 Профиль", "👤 Profile"));
        m.insert("cat_top_up", lang("💎 Пополнить", "💎 Top up"));

        m.insert("item_neuro_photo", lang("📸 Нейрофото", "📸 NeuroPhoto"));
        m.insert("item_text_to_image", lang("🖼️ Текст в фото", "🖼️ Text to Photo"));
        m.insert("item_image_to_prompt", lang("🔍 Промпт из фото", "🔍 Prompt from Photo"));
        m.insert("item_ai_photoshop", lang("🎨 ИИ Фотошоп", "🎨 AI Photoshop"));
        m.insert("item_image_upscaler", lang("⬆️ Увеличить качество", "⬆️ Upscale Quality"));
        m.insert("item_face_swap", lang("🎭 Замена лица", "🎭 Face Swap"));
        m.insert("item_ai_heroes", lang("🦸‍♂️ ИИ Герои", "🦸‍♂️ AI Heroes"));
        m.insert("item_text_to_video", lang("🎥 Видео из текста", "🎥 Text to Video"));
        m.insert("item_image_to_video", lang("🎥 Фото в видео", "🎥 Photo to Video"));
        m.insert("item_morphing", lang("🌀 Infinity Морфинг", "🌀 Infinity Morphing"));
        m.insert("item_lip_sync", lang("🎤 Синхронизация губ", "🎤 Lip Sync"));
        m.insert("item_voice_avatar", lang("🎤 Голос аватара", "🎤 Avatar Voice"));
        m.insert("item_text_to_speech", lang("🎙️ Текст в голос", "🎙️ Text to Speech"));
        m.insert("item_video_transcription", lang("📺 Транскрибация", "📺 Transcription"));
        m.insert("item_music_generation", lang("🎵 Генерация музыки", "🎵 Music Generation"));
        m.insert("item_voice_training", lang("🎤 Обучить голос", "🎤 Train Voice"));
        m.insert("item_ai_cover", lang("🎧 AI Cover", "🎧 AI Cover"));
        m.insert("item_digital_body", lang("🤖 Цифровое тело", "🤖 Digital Body"));
        m.insert("item_avatar_brain", lang("🧠 Мозг аватара", "🧠 Avatar Brain"));
        m.insert("item_chat_avatar", lang("💭 Чат с аватаром", "💭 Chat with Avatar"));
        m.insert("item_select_model", lang("🤖 Язык аватара", "🤖 Avatar Language"));
        m.insert("item_instagram_parsing", lang("🔍 Парсинг Instagram", "🔍 Instagram Parsing"));
        m.insert("item_bot_stats", lang("📊 Статистика бота", "📊 Bot Statistics"));

        m.insert("start_welcome", lang(
            "👋 Привет, {name}!\n\n🤖 Добро пожаловать в {botName}!\n\n🎯 Выберите нужную функцию из меню ниже:",
            "👋 Hello, {name}!\n\n🤖 Welcome to {botName}!\n\n🎯 Select the function you need from the menu below:"
        ));
        m.insert("start_friend", lang("друг", "friend"));

        m.insert("menu_fallback", lang("🏠 Главное меню\nВыберите нужный раздел 👇", "🏠 Main Menu\nSelect the section 👇"));
        m.insert("menu_main_text", lang("🏠 Главное меню\n\nВыберите нужный раздел 👇", "🏠 Main menu\n\nChoose the section 👇"));

        m.insert("error_occurred", lang("❌ Произошла ошибка. Попробуйте позже.", "❌ An error occurred. Please try again later."));
        m.insert("error_occurred_short", lang("Произошла ошибка. Попробуйте позже.", "An error occurred. Please try again later."));
        m.insert("error_generic", lang("❌ Произошла ошибка.", "❌ An error occurred."));
        m.insert("error_balance_check", lang("❌ Произошла ошибка при проверке доступа. Пожалуйста, попробуйте еще раз или начните сначала /start.", "❌ Error checking access. Please try again or start over with /start."));
        m.insert("error_user_id", lang("❌ Ошибка получения ID пользователя", "❌ Error getting user ID"));
        m.insert("error_balance_retrieve", lang("❌ Произошла ошибка при получении информации о балансе", "❌ Error occurred while getting balance information"));
        m.insert("error_balance_charge", lang("Ошибка списания средств. Попробуйте позже.", "Error charging payment. Try again later."));
        m.insert("error_get_balance", lang("Ошибка получения баланса. Попробуйте позже.", "Error getting balance. Try again later."));
        m.insert("error_init", lang("❌ Ошибка инициализации. Попробуйте позже.", "❌ Initialization error. Try again later."));
        m.insert("error_identification", lang("❌ Ошибка идентификации пользователя.", "❌ User identification error."));
        m.insert("error_no_subscription_plans", lang("❌ Ошибка: не удалось получить доступные планы подписки.", "❌ Error: Could not retrieve available subscription plans."));
        m.insert("error_subscription_unavailable", lang("❌ К сожалению, в данный момент планы подписки недоступны. Попробуйте позже или обратитесь в поддержку.", "❌ Unfortunately, subscription plans are currently unavailable. Please try again later or contact support."));
        m.insert("error_subscription_unknown", lang("Неизвестный тип подписки. Пожалуйста, выберите другой вариант.", "Unknown subscription type. Please select another option."));
        m.insert("error_no_access", lang("❌ У вас нет доступа к этой функции.", "❌ You do not have access to this function."));
        m.insert("error_parsing_access", lang("❌ У вас нет доступа к функции парсинга Instagram.", "❌ You do not have access to Instagram parsing feature."));
        m.insert("error_parsing_start", lang("❌ Ошибка при запуске парсинга Instagram. Попробуйте позже.", "❌ Error starting Instagram parsing. Please try again later."));
        m.insert("error_payment_scene", lang("❌ Ошибка: вы не находитесь в сцене оплаты. Попробуйте начать заново.", "❌ Error: you are not in the payment scene. Please try again."));
        m.insert("error_ruble_payment", lang("❌ Произошла ошибка при переходе к оплате рублями. Попробуйте позже.", "❌ An error occurred while switching to ruble payment. Please try again later."));
        m.insert("error_data_missing", lang("❌ Ошибка: недостаточно данных для обработки.", "❌ Error: insufficient data for processing."));
        m.insert("error_report_generation", lang("❌ Произошла ошибка при генерации отчета. Попробуйте позже.", "❌ Error occurred while generating report. Please try again later."));
        m.insert("error_referral_data", lang("Произошла ошибка при получении данных о рефералах. Пожалуйста, попробуйте позже.", "An error occurred while fetching referral data. Please try again later."));

        m.insert("error_no_models", lang("❌ У вас нет обученных моделей для нейрофото.\n\nИспользуйте команду \"🤖 Цифровое тело аватара\", в главном меню, чтобы создать свою ИИ модель для генерации нейрофото с вашим лицом.", "❌ You don't have any trained models for neurophotos.\n\nUse the '🤖 Digital avatar body' command in the main menu to create your AI model for generating neurophotos with your face."));
        m.insert("error_model_not_selected", lang("❌ Произошла ошибка: модель не выбрана. Попробуйте начать заново.", "❌ Error: model not selected. Please start over."));
        m.insert("error_model_not_found", lang("❌ Модель не найдена. Попробуйте снова.", "❌ Model not found. Please try again."));
        m.insert("error_generation_data_missing", lang("❌ Произошла ошибка: данные для генерации не найдены. Попробуйте начать заново.", "❌ Error: generation data not found. Please start over."));
        m.insert("error_image_generation", lang("❌ Произошла ошибка при генерации изображения. Попробуйте позже.", "❌ Error occurred during image generation. Please try again later."));
        m.insert("error_upscale", lang("Произошла ошибка при увеличении качества изображения. Пожалуйста, попробуйте позже.", "An error occurred while upscaling the image. Please try again later."));
        m.insert("error_tts", lang("❌ Произошла ошибка при преобразовании текста в речь", "❌ Error occurred while converting text to speech"));
        m.insert("error_tts_charge", lang("⚠️ Аудио создано, но произошла ошибка при списании средств. Обратитесь в поддержку.", "⚠️ Audio created, but there was an error charging your balance. Please contact support."));
        m.insert("error_processing", lang("❌ Ошибка обработки видео: {error}", "❌ Video processing error: {error}"));
        m.insert("error_audio_processing", lang("❌ Ошибка обработки аудио: {error}", "❌ Audio processing error: {error}"));

        m.insert("insufficient_balance", lang("Недостаточно средств на балансе", "Insufficient balance"));
        m.insert("insufficient_stars_faceswap", lang("❌ Недостаточно звезд для замены лица.", "❌ Insufficient stars for face swap."));
        m.insert("insufficient_funds_lipsync", lang("Недостаточно средств. Требуется: ~{cost}⭐ (за ~{duration} сек), у вас: {balance}⭐", "Insufficient funds. Required: ~{cost}⭐ (for ~{duration} sec), you have: {balance}⭐"));

        m.insert("prompt_too_short", lang("Промпт слишком короткий. Пожалуйста, введите более подробное описание (минимум 3 символа).", "Prompt is too short. Please provide a more detailed description (minimum 3 characters)."));
        m.insert("prompt_empty", lang("❌ Пустой промпт. Пожалуйста, введите описание изображения, которое хотите сгенерировать.", "❌ Empty prompt. Please enter a description of the image you want to generate."));
        m.insert("prompt_empty_image", lang("❌ Пустой промпт. Пожалуйста, введите описание того, что нужно сделать с изображением.", "❌ Empty prompt. Please enter a description of what to do with the image."));

        m.insert("processing", lang("⏳ Обрабатываю...", "⏳ Processing..."));
        m.insert("processing_face_swap", lang("⏳ Обрабатываем замену лица... Это может занять 10-30 секунд.", "⏳ Processing face swap... This may take 10-30 seconds."));
        m.insert("processing_tts", lang("🎙️ Отправьте текст, для преобразования его в голос", "🎙️ Send text, to convert it to voice"));
        m.insert("processing_send_text", lang("✍️ Пожалуйста, отправьте текст", "✍️ Please send text"));
        m.insert("processing_generating_image", lang("⏳ Генерирую {count} изображени{suffix}...", "⏳ Generating {count} image{suffix}..."));
        m.insert("processing_converting_audio", lang("🔄 Конвертирую аудио в MP3 формат...", "🔄 Converting audio to MP3 format..."));
        m.insert("processing_video", lang("🎬 Генерируем видео...", "🎬 Generating video..."));
        m.insert("processing_image", lang("✅ Промпт получен! Начинаю обработку изображения...", "✅ Prompt received! Starting image processing..."));

        m.insert("cancelled", lang("❌ Процесс отменён. Возвращаюсь в главное меню.", "❌ Process cancelled. Returning to main menu."));
        m.insert("cancelled_short", lang("❌ Процесс отменён.", "❌ Process cancelled."));
        m.insert("cancelled_neuro", lang("Отменено. Возвращаю в главное меню.", "Cancelled. Returning to main menu."));
        m.insert("cancelled_morphing", lang("❌ Создание Infinity Морфинг отменено. Возвращаюсь в главное меню.", "❌ Infinity Morphing creation cancelled. Returning to main menu."));
        m.insert("cancelled_flux", lang("❌ Процесс отменён. Возвращаюсь в главное меню.", "❌ Process cancelled. Returning to main menu."));
        m.insert("cancelled_subscription", lang("❌ Оформление подписки отменено.", "❌ Subscription canceled."));
        m.insert("cancelled_video", lang("❌ Генерация видео отменена", "❌ Video generation cancelled"));

        m.insert("returning_to_menu", lang("👋 Возвращаемся в главное меню", "👋 Returning to main menu"));
        m.insert("returning_to_menu_short", lang("Возвращаемся в меню...", "Returning to menu..."));

        m.insert("choose_action", lang("👆 Выберите действие выше или используйте кнопки ниже:", "👆 Choose an action above or use the buttons below:"));
        m.insert("use_buttons", lang("👆 Пожалуйста, используйте кнопки выше", "👆 Please use the buttons above"));
        m.insert("use_main_menu", lang("❓ Для получения справки используйте кнопки главного меню", "❓ Use main menu buttons for help"));
        m.insert("use_menu_buttons", lang("Пожалуйста, выберите ⭐️ Звездами или вернитесь в Главное меню.", "Please select ⭐️ Stars or return to the Main menu."));

        m.insert("payment_select_method", lang("Выберите способ оплаты:", "Select payment method:"));
        m.insert("payment_what_are_stars", lang("Что такое звезды❓", "What are stars❓"));
        m.insert("payment_crypto_select", lang("💎 *Выберите криптовалюту для оплаты:*", "💎 *Select cryptocurrency for payment:*"));
        m.insert("payment_ton_usdt", lang("💠 TON USDT (стейблкоин)", "💠 TON USDT (stablecoin)"));
        m.insert("payment_ton_native", lang("💎 TON (нативный)", "💎 TON (native)"));
        m.insert("payment_usdc_base", lang("🔵 USDC (Base)", "🔵 USDC (Base)"));

        m.insert("subscription_choose", lang(
            "💫 **Выберите подписку**\n\nПолучите доступ ко всем функциям нейро-бота! Выберите подходящий тарифный план:",
            "💫 **Choose Subscription**\n\nGet access to all neuro-bot features! Choose a suitable tariff plan:"
        ));
        m.insert("subscription_choose_simple", lang("Выберите план подписки из кнопок ниже.", "Choose a subscription plan from the buttons below."));

        m.insert("balance_title", lang("💰 <b>Ваш баланс и статистика</b>\n\n", "💰 <b>Your balance and statistics</b>\n\n"));
        m.insert("balance_simple", lang("💰✨ <b>Ваш баланс:</b> {balance} ⭐️", "💰✨ <b>Your balance:</b> {balance} ⭐️"));
        m.insert("balance_current", lang("💎 <b>Текущий баланс:</b> {balance} ⭐\n\n", "💎 <b>Current balance:</b> {balance} ⭐\n\n"));
        m.insert("balance_stats", lang("📊 <b>Общая статистика:</b>\n", "📊 <b>Overall statistics:</b>\n"));
        m.insert("balance_topups", lang("   📈 <b>Пополнения:</b>\n", "   📈 <b>Top-ups:</b>\n"));
        m.insert("balance_robokassa", lang("      💳 Через Robokassa: {stars} ⭐ ({amount} руб.)\n", "      💳 Via Robokassa: {stars} ⭐ ({amount} RUB)\n"));
        m.insert("balance_telegram_stars", lang("      ⭐ Через Telegram Stars: {stars} ⭐\n", "      ⭐ Via Telegram Stars: {stars} ⭐\n"));
        m.insert("balance_total_topups", lang("   📈 <b>Итого пополнений:</b> {total} ⭐\n", "   📈 <b>Total top-ups:</b> {total} ⭐\n"));
        m.insert("balance_total_topups_no_detail", lang("   📈 Всего пополнений: {total} ⭐\n", "   📈 Total top-ups: {total} ⭐\n"));
        m.insert("balance_bonuses", lang("   🎁 Бонусы получено: {total} ⭐\n", "   🎁 Bonuses received: {total} ⭐\n"));
        m.insert("balance_total_spent", lang("   📉 Всего потрачено: {total} ⭐\n", "   📉 Total spent: {total} ⭐\n"));
        m.insert("balance_total_transactions", lang("   🔢 Всего операций: {count}\n\n", "   🔢 Total transactions: {count}\n\n"));
        m.insert("balance_services", lang("🛠️ <b>Детализация по сервисам:</b>\n", "🛠️ <b>Services breakdown:</b>\n"));
        m.insert("balance_operations", lang("операций", "operations"));
        m.insert("balance_recent_topups", lang("📈 <b>Последние пополнения:</b>\n", "📈 <b>Recent top-ups:</b>\n"));
        m.insert("balance_recent_expenses", lang("📉 <b>Последние траты:</b>\n", "📉 <b>Recent expenses:</b>\n"));
        m.insert("balance_report_generating", lang("📊 Генерируем отчет...", "📊 Generating report..."));
        m.insert("balance_report_generating_detail", lang("📊 Генерируем детальный Excel-отчет...\n⏳ Это может занять несколько секунд", "📊 Generating detailed Excel report...\n⏳ This may take a few seconds"));
        m.insert("balance_report_caption", lang(
            "📊 <b>Ваш персональный финансовый отчет</b>\n\n📅 Дата: {date}\n📋 Включает: все транзакции, аналитику по сервисам, детальную историю\n\n💡 <i>Откройте файл в Excel или Google Sheets для лучшего просмотра</i>",
            "📊 <b>Your personal financial report</b>\n\n📅 Date: {date}\n📋 Includes: all transactions, service analytics, detailed history\n\n💡 <i>Open the file in Excel or Google Sheets for best viewing</i>"
        ));
        m.insert("balance_report_success", lang("✅ Отчет успешно сгенерирован и отправлен!", "✅ Report successfully generated and sent!"));
        m.insert("balance_rub_short", lang("руб.", "RUB"));

        m.insert("select_model_generation", lang("Выберите модель для генерации:", "Select a model for generation:"));
        m.insert("select_model", lang("🎨 Выберите модель для генерации:", "🎨 Choose a model for generation:"));
        m.insert("model_selected", lang("✅ Модель выбрана: {model}\n\n📝 Теперь опишите, что должно происходить в видео:", "✅ Model selected: {model}\n\n📝 Now describe what should happen in the video:"));
        m.insert("model_selected_image", lang("✅ Модель выбрана: {model}\n\n🖼️ Теперь отправьте изображение для создания видео:", "✅ Model selected: {model}\n\n🖼️ Now send an image to create video:"));

        m.insert("video_select_format", lang(
            "🎥 Выберите модель и формат видео:\n\n🖥️ Горизонтальные (16:9) — слева\n📱 Вертикальные (9:16) — справа\n\n⭐ Цена в Telegram Stars",
            "🎥 Choose model and video format:\n\n🖥️ Horizontal (16:9) — left\n📱 Vertical (9:16) — right\n\n⭐ Price in Telegram Stars"
        ));

        m.insert("prompt_request_image", lang("Пожалуйста, введите текст для генерации изображения.", "Please enter text to generate an image."));
        m.insert("prompt_request_image_send", lang("📷 Отправьте изображение:", "📷 Send an image:"));
        m.insert("prompt_request_image_first", lang("📷 Отправьте первое изображение:", "📷 Send the first image:"));
        m.insert("prompt_request_image_second", lang("📷 Теперь отправьте второе изображение:", "📷 Now send the second image:"));
        m.insert("prompt_request_video_desc", lang("📝 Теперь опишите, что должно происходить в видео:", "📝 Now describe what should happen in the video:"));
        m.insert("prompt_request_video", lang("Введите описание видео.", "Enter video description."));
        m.insert("prompt_select_from_buttons", lang("Пожалуйста, выберите модель из кнопок выше.", "Please select a model from the buttons above."));

        m.insert("send_photo", lang("Отправьте фото", "Send a photo"));
        m.insert("send_photo_please", lang("❌ Пожалуйста, отправьте фото.", "❌ Please send a photo."));
        m.insert("send_image", lang("Пожалуйста, отправьте изображение", "Please send an image"));
        m.insert("send_image_not_text", lang("📸 Пожалуйста, отправьте изображение (не текст).", "📸 Please send an image (not text)."));
        m.insert("send_image_first", lang("❌ Сначала отправьте изображение.", "❌ Please send an image first."));
        m.insert("send_image_editing_first", lang("❌ Сначала выберите режим редактирования.", "❌ Please select an editing mode first."));
        m.insert("send_video_or_url", lang("Отправьте видео или URL видео", "Send a video or video URL"));
        m.insert("send_text", lang("Отправьте текст", "Send text"));
        m.insert("send_text_or_voice", lang("Видео получено! Теперь отправьте аудио, голосовое сообщение или URL аудио", "Video received! Now send an audio, voice message, or audio URL"));

        m.insert("image_received", lang("✅ Фото получено!\n\nТеперь загрузите второе фото - с лицом, которое хотите использовать.", "✅ Photo received!\n\nNow upload the second photo - with the face you want to use."));
        m.insert("image_received_first", lang("✅ Первое изображение получено!", "✅ First image received!"));
        m.insert("image_received_second", lang("✅ Второе изображение получено!", "✅ Second image received!"));
        m.insert("image_received_ok", lang("✅ Изображение получено!", "✅ Image received!"));
        m.insert("image_invalid", lang("❌ Файл не является корректным изображением.", "❌ File is not a valid image."));
        m.insert("image_too_large", lang("❌ Изображение слишком большое (максимум 10MB).", "❌ Image too large (maximum 10MB)."));
        m.insert("image_not_found", lang("Изображение не найдено. Начинаем заново.", "Image not found. Starting over."));
        m.insert("image_get_failed", lang("❌ Не удалось получить изображение. Попробуйте еще раз.", "Failed to get the image. Please try again."));
        m.insert("image_get_failed_short", lang("❌ Не удалось получить изображение.", "❌ Failed to get image."));
        m.insert("image_first_not_found", lang("❌ Ошибка: не найдено первое фото. Попробуйте еще раз.", "❌ Error: first photo not found. Try again."));

        m.insert("video_too_large", lang("❌ Видео слишком большое. Максимальный размер: {size}MB", "❌ Video is too large. Maximum size: {size}MB"));
        m.insert("video_invalid", lang("❌ Некорректное видео. Отправьте видео файл или URL.", "❌ Invalid video. Send a video file or URL."));
        m.insert("audio_too_large", lang("❌ Аудио слишком большое. Максимальный размер: {size}MB", "❌ Audio is too large. Maximum size: {size}MB"));
        m.insert("audio_too_large_voice", lang("❌ Голосовое сообщение слишком большое. Максимальный размер: {size}MB", "❌ Voice message is too large. Maximum size: {size}MB"));
        m.insert("audio_invalid", lang("❌ Некорректное аудио. Отправьте аудио файл, голосовое сообщение или URL.", "❌ Invalid audio. Send an audio file, voice message, or URL."));
        m.insert("audio_convert_failed", lang("Не удалось конвертировать аудио. Попробуйте отправить MP3 или WAV файл.", "Failed to convert audio. Please try sending an MP3 or WAV file."));

        m.insert("faceswap_intro", lang(
            "Замена лица\n\nЗагрузите фото человека, на которого хотите заменить лицо.\n\nТребования:\n• Лицо чётко видно\n• Анфас (прямо в камеру)\n• Хорошее освещение\n\nСтоимость: 10 ⭐",
            "Face Swap\n\nUpload photo of the person whose face you want to swap.\n\nRequirements:\n• Face clearly visible\n• Frontal angle\n• Good lighting\n\nCost: 10 ⭐"
        ));
        m.insert("faceswap_success", lang("✅ Готово! Лицо успешно заменено.", "✅ Done! Face swap completed."));
        m.insert("faceswap_error", lang("❌ Ошибка при замене лица:", "❌ Face swap error:"));

        m.insert("lipsync_ready", lang("✅ Lip Sync готов!", "✅ Lip Sync ready!"));
        m.insert("lipsync_processing", lang("✅ Видео обрабатывается. Результат будет отправлен позже.", "✅ Video is processing. Result will be sent later."));
        m.insert("lipsync_charged", lang("✅ Списано ~{cost}⭐ ({model}). Баланс: {balance}⭐", "✅ Charged ~{cost}⭐ ({model}). Balance: {balance}⭐"));
        m.insert("lipsync_error", lang("❌ Ошибка при обработке: {error}. Средства возвращены.", "❌ Processing error: {error}. Funds refunded."));

        m.insert("neurophoto_generated", lang("✨ Нейрофото сгенерировано! Выберите количество дополнительных изображений или используйте другие опции:", "✨ Neurophoto generated! Choose the number of additional images or use other options:"));
        m.insert("neurophoto_btn_new_prompt", lang("🆕 Новый промпт", "🆕 New prompt"));
        m.insert("neurophoto_btn_improve", lang("⬆️ Улучшить промпт", "⬆️ Improve prompt"));
        m.insert("neurophoto_btn_change_size", lang("📐 Изменить размер", "📐 Change size"));
        m.insert("neurophoto_upscale_soon", lang("Функция увеличения качества будет добавлена в ближайшее время.", "Upscale feature will be added soon."));
        m.insert("neurophoto_help", lang("Это сцена создания нейрофото. Введите описание на английском языке для генерации.", "This is the neurophoto creation scene. Enter a description in English to generate."));

        m.insert("image_generated", lang("✨ Изображение сгенерировано! Выберите количество дополнительных изображений или используйте другие опции:", "✨ Image generated! Choose the number of additional images or use other options:"));
        m.insert("images_generated", lang("✨ Изображения сгенерированы! Выберите количество дополнительных изображений:", "✨ Images generated! Choose the number of additional images:"));

        m.insert("video_desc_too_short", lang("Описание слишком короткое.", "Description is too short."));
        m.insert("video_no_model", lang("Модель не выбрана. Начинаем заново.", "No model selected. Starting over."));
        m.insert("video_error", lang("❌ Ошибка генерации видео. Попробуйте позже.", "❌ Video generation error. Try again later."));
        m.insert("video_error_auth", lang("🚫 Ошибка авторизации API для модели WAN 2.2.\n\nПопробуйте позже или выберите другую модель.", "🚫 API authorization error for WAN 2.2 model.\n\nTry later or choose another model."));
        m.insert("video_error_timeout", lang("⏱️ Превышено время ожидания для модели WAN 2.2.\n\nПопробуйте позже.", "⏱️ Timeout exceeded for WAN 2.2 model.\n\nTry again later."));
        m.insert("video_error_quota", lang("📊 Превышена квота для модели WAN 2.2.\n\nПопробуйте позже или выберите другую модель.", "📊 Quota exceeded for WAN 2.2 model.\n\nTry later or choose another model."));
        m.insert("video_models_not_found", lang("❌ Модели не найдены. Попробуйте позже.", "Models not found. Try again later."));
        m.insert("video_wizard_error", lang("❌ Ошибка в мастере генерации видео", "❌ Error in video generation wizard"));
        m.insert("video_wizard_step_error", lang("❌ Ошибка во втором шаге wizard", "❌ Error in wizard step"));
        m.insert("video_wizard_step3_error", lang("❌ Ошибка в третьем шаге wizard", "❌ Error in wizard step 3"));

        m.insert("morphing_welcome", lang(
            "🌀 <b>Добро пожаловать в Infinity Морфинг!</b>\n\n✨ Создавайте потрясающие видео переходы между изображениями\n📸 Загрузите минимум 2 изображения для начала\n🎯 Система создаст плавные переходы между всеми кадрами",
            "🌀 <b>Welcome to Infinity Morphing!</b>\n\n✨ Create stunning video transitions between images\n📸 Upload minimum 2 images to start\n🎯 System will create smooth transitions between all frames"
        ));
        m.insert("morphing_upload_first", lang("🌀 Infinity Морфинг - загрузите первое изображение:", "🌀 Infinity Morphing - upload first image:"));
        m.insert("morphing_enough_images", lang("Достаточно изображений для создания морфинга!", "Enough images to create morphing!"));
        m.insert("morphing_upload_more", lang("Загрузите еще изображения", "Upload more images"));
        m.insert("morphing_2_images_motivation", lang("🎉 Отлично! Уже можно создать морфинг. Добавьте еще изображения для большего количества переходов!", "🎉 Great! You can now create morphing. Add more images for more transitions!"));
        m.insert("morphing_5_images_motivation", lang("⭐ Превосходно! 5 изображений дадут потрясающий результат!", "⭐ Excellent! 5 images will give amazing results!"));
        m.insert("morphing_10_images_motivation", lang("🚀 Невероятно! 10 изображений = эпический морфинг! Можете продолжать добавлять!", "🚀 Incredible! 10 images = epic morphing! You can keep adding more!"));
        m.insert("morphing_20_images_motivation", lang("💫 ЛЕГЕНДАРНО! 20 изображений создадут кинематографический шедевр!", "💫 LEGENDARY! 20 images will create a cinematic masterpiece!"));
        m.insert("morphing_min_2_images", lang("❌ Необходимо минимум 2 изображения для создания морфинга.", "❌ Minimum 2 images required to create morphing."));
        m.insert("morphing_image_error", lang("❌ Ошибка при обработке изображения. Попробуйте еще раз.", "❌ Error processing image. Please try again."));
        m.insert("morphing_file_error", lang("❌ Ошибка получения файла", "❌ Error getting file"));

        m.insert("morphing_btn_create", lang("✅ Создать Infinity Морфинг", "✅ Create Infinity Morphing"));
        m.insert("morphing_btn_restart", lang("🔄 Начать заново", "🔄 Start over"));
        m.insert("morphing_btn_resume", lang("⚡ Продолжить незавершенное", "⚡ Resume incomplete"));
        m.insert("morphing_btn_with_loop", lang("🔄 С зацикливанием", "🔄 With Loop"));
        m.insert("morphing_btn_no_loop", lang("➡️ Без зацикливания", "➡️ No Loop"));
        m.insert("morphing_btn_back_upload", lang("🔙 Назад к загрузке", "🔙 Back to upload"));
        m.insert("morphing_btn_cinematic", lang("🎥 Кинематографичный", "🎥 Cinematic"));
        m.insert("morphing_btn_dramatic", lang("⚡ Драматичный", "⚡ Dramatic"));
        m.insert("morphing_btn_smooth", lang("🌊 Плавный", "🌊 Smooth Flow"));
        m.insert("morphing_btn_creative", lang("🎨 Креативный", "🎨 Creative"));
        m.insert("morphing_btn_custom_prompt", lang("✍️ Свой промпт", "✍️ Custom Prompt"));
        m.insert("morphing_btn_back_presets", lang("🔙 Назад к пресетам", "🔙 Back to presets"));

        m.insert("morphing_processing", lang("🚀 Infinity Морфинг запущен в обработку!", "🚀 Infinity Morphing processing started!"));
        m.insert("morphing_resumed", lang("✅ Морфинг успешно возобновлен и завершен!", "✅ Morphing successfully resumed and completed!"));
        m.insert("morphing_no_incomplete", lang("⚠️ Не найдено незавершенных процессов морфинга для возобновления.", "⚠️ No incomplete morphing processes found to resume."));
        m.insert("morphing_resume_error", lang("❌ Ошибка при попытке возобновить морфинг. Попробуйте начать заново.", "❌ Error trying to resume morphing. Please try starting over."));
        m.insert("morphing_error", lang("❌ Произошла ошибка при создании морфинг видео:", "❌ An error occurred while creating morphing video:"));
        m.insert("morphing_prompt_too_short", lang("❌ Промпт слишком короткий. Минимум 10 символов.", "❌ Prompt too short. Minimum 10 characters."));

        m.insert("flux_title", lang("🎨 *FLUX Kontext* - Продвинутое ИИ редактирование изображений", "🎨 *FLUX Kontext* - Advanced AI Image Editing"));
        m.insert("flux_retry", lang("🔄 Попробуем снова! Отправьте изображение для редактирования.", "🔄 Let's try again! Send an image for editing."));
        m.insert("flux_modes_back", lang("⬅️ Назад к режимам", "⬅️ Back to Modes"));
        m.insert("flux_auto_select", lang("🎬 Автовыбор", "🎬 Auto Select"));

        m.insert("upscaler_intro", lang(
            "⬆️ Отправьте фото для увеличения качества\n\n🎯 Clarity Upscaler увеличит разрешение в 2 раза и улучшит детализацию\n💎 Стоимость: 3 ⭐",
            "⬆️ Send a photo to upscale quality\n\n🎯 Clarity Upscaler will increase resolution 2x and improve details\n💎 Cost: 3 ⭐"
        ));

        m.insert("invite_intro", lang(
            "🎁 Пригласите друга и откройте для себя новые возможности! Отправьте ему эту ссылку, и пусть он присоединится к нашему сообществу.",
            "🎁 Invite a friend and unlock new opportunities! Send them this link and let them join our community."
        ));
        m.insert("invite_bonuses", lang("Бонусные звезды для использования в боте.", "Bonus stars for use in the bot."));
        m.insert("invite_exclusive", lang("Доступ к эксклюзивным функциям и возможностям.", "Access to exclusive features and capabilities."));
        m.insert("invite_level", lang("Повышение уровня и доступ к новым функциям.", "Level up and access to new features."));
        m.insert("invite_referrals", lang("Рефаралы:", "Referrals:"));

        m.insert("language_select", lang("🌐 *Выберите язык / Choose language*\n\nВыберите предпочитаемый язык интерфейса:", "🌐 *Choose language*\n\nSelect your preferred interface language:"));
        m.insert("language_changed_ru", lang("Язык изменён на русский", "Language changed to Russian"));
        m.insert("language_changed_en", lang("Язык изменён на английский", "Language changed to English"));
        m.insert("language_error", lang("❌ Ошибка при смене языка", "❌ Error changing language"));

        m.insert("support_message", lang("🛠 Для обращения в техподдержку, напишите {mention}\n\nПожалуйста, опишите вашу проблему максимально подробно.", "🛠 To contact tech support, write to {mention}\n\nPlease describe your problem in as much detail as possible."));

        m.insert("help_general", lang("Общая справка...", "General help..."));
        m.insert("help_digital_body", lang("Справка по Цифровому телу...", "Help for Digital Body..."));
        m.insert("help_neurophoto", lang("Справка по Нейрофото...", "Help for NeuroPhoto..."));
        m.insert("help_image_to_prompt", lang("Справка по Промпту из фото...", "Help for Prompt from Photo..."));
        m.insert("help_avatar_brain", lang("Справка по Мозгу аватара...", "Help for Avatar Brain..."));
        m.insert("help_chat_avatar", lang("Справка по Чату с аватаром...", "Help for Chat with Avatar..."));
        m.insert("help_select_model", lang("Справка по Выбору модели ИИ...", "Help for Choose AI Model..."));
        m.insert("help_voice", lang("Справка по Голосу аватара...", "Help for Avatar Voice..."));
        m.insert("help_tts", lang("Справка по Тексту в голос...", "Help for Text to Voice..."));
        m.insert("help_image_to_video", lang("Справка по Фото в видео...", "Help for Photo to Video..."));
        m.insert("help_text_to_image", lang("Справка по Тексту в фото...", "Help for Text to Image..."));
        m.insert("help_text_to_video", lang("Справка по Видео из текста...", "Help for Text to Video..."));
        m.insert("help_change_size", lang("Справка по Изменению размера...", "Help for Change Size..."));
        m.insert("help_invite", lang("Справка по Приглашению друга...", "Help for Invite a Friend..."));
        m.insert("help_flux_kontext", lang("Справка по FLUX Kontext...", "Help for FLUX Kontext..."));
        m.insert("help_transcription", lang("Справка по Транскрибации Reels...", "Help for Reels Transcription..."));
        m.insert("help_upscaler", lang("Справка по Увеличению качества...", "Help for Image Upscaling..."));

        m.insert("charged", lang("💰 Списано: {cost} ⭐", "💰 Charged: {cost} ⭐"));
        m.insert("stars_required", lang("💰 Требуется: {cost} ⭐", "💰 Required: {cost} ⭐"));
        m.insert("stars_you_have", lang("💰 У вас: {balance} ⭐", "💰 You have: {balance} ⭐"));
        m.insert("top_up_balance_cmd", lang("Пополните баланс командой /balance", "Top up with /balance"));

        m.insert("callback_error", lang("Произошла ошибка ответа от кнопки", "Button callback error"));
        m.insert("error_retrieving_user_data", lang("Ошибка: Не удалось получить данные пользователя.", "Error: Could not retrieve user data."));
        m.insert("error_model_determine", lang("Ошибка: Не удалось определить выбранную модель.", "Error: Could not determine the selected model."));
        m.insert("balance_check_failed", lang("❌ Ошибка проверки баланса", "❌ Balance check failed"));

        m.insert("not_found_text", lang("❌ Текст не найден:", "Text not found:"));

        m.insert("tts_prefilled", lang("📝 Текст для озвучивания:\n\n{text}\n\n✅ Нажмите /convert чтобы озвучить или отправьте другой текст", "📝 Text to convert:\n\n{text}\n\n✅ Send /convert to proceed or send different text"));

        m
    })
}

fn lang(ru: &'static str, en: &'static str) -> HashMap<Language, &'static str> {
    let mut h = HashMap::new();
    h.insert(Language::Ru, ru);
    h.insert(Language::En, en);
    h
}

pub fn t(lang: Language, key: &str) -> String {
    let msgs = messages();
    msgs.get(key)
        .and_then(|h| h.get(&lang))
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("{}:{}", key, lang.code()))
}

pub fn t_or(lang: Language, key: &str, fallback: &str) -> String {
    let msgs = messages();
    msgs.get(key)
        .and_then(|h| h.get(&lang))
        .map(|s| s.to_string())
        .unwrap_or_else(|| fallback.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn t_all_keys_both_languages() {
        let keys: Vec<&str> = messages().keys().copied().collect();
        assert!(keys.len() > 100, "should have at least 100 keys, got {}", keys.len());
        for key in &keys {
            let ru = t(Language::Ru, key);
            let en = t(Language::En, key);
            assert!(!ru.is_empty(), "key {} ru should not be empty", key);
            assert!(!en.is_empty(), "key {} en should not be empty", key);
            assert!(!ru.starts_with(&format!("{}:", key)), "key {} ru looks like a missing key fallback", key);
            assert!(!en.starts_with(&format!("{}:", key)), "key {} en looks like a missing key fallback", key);
        }
    }

    #[test]
    fn t_missing_key_format() {
        assert_eq!(t(Language::Ru, "no_such_key"), "no_such_key:ru");
        assert_eq!(t(Language::En, "no_such_key"), "no_such_key:en");
    }

    #[test]
    fn t_or_with_fallback() {
        assert_eq!(t_or(Language::Ru, "no_key", "default"), "default");
        assert_eq!(t_or(Language::Ru, "nav_main_menu", "default"), "🏠 Главное меню");
    }

    #[test]
    fn t_or_empty_fallback() {
        assert_eq!(t_or(Language::En, "missing", ""), "");
    }

    #[test]
    fn t_specific_keys() {
        assert_eq!(t(Language::Ru, "nav_main_menu"), "🏠 Главное меню");
        assert_eq!(t(Language::En, "nav_main_menu"), "🏠 Main menu");
        assert_eq!(t(Language::Ru, "nav_cancel"), "Отмена");
        assert_eq!(t(Language::En, "nav_cancel"), "Cancel");
        assert_eq!(t(Language::Ru, "error_occurred"), "❌ Произошла ошибка. Попробуйте позже.");
        assert_eq!(t(Language::En, "error_occurred"), "❌ An error occurred. Please try again later.");
        assert_eq!(t(Language::Ru, "insufficient_balance"), "Недостаточно средств на балансе");
        assert_eq!(t(Language::En, "insufficient_balance"), "Insufficient balance");
        assert_eq!(t(Language::Ru, "processing"), "⏳ Обрабатываю...");
        assert_eq!(t(Language::En, "processing"), "⏳ Processing...");
        assert_eq!(t(Language::Ru, "cat_photo"), "📸 Фото");
        assert_eq!(t(Language::En, "cat_photo"), "📸 Photo");
        assert_eq!(t(Language::Ru, "item_neuro_photo"), "📸 Нейрофото");
        assert_eq!(t(Language::En, "item_neuro_photo"), "📸 NeuroPhoto");
    }
}
