.venv(base) ➜ 999-multibots-telegraf git:(main) ✗ pnpm dev

> neuro-blogger-telegram-bot@0.0.1 predev /Users/playra/999-multibots-telegraf
> node scripts/kill-port.cjs 2999 3001 8288

Checking port 2999...
Successfully killed process on port 2999
Checking port 3001...
Successfully killed process on port 3001
Checking port 8288...
Successfully killed process on port 8288
All ports checked

> neuro-blogger-telegram-bot@0.0.1 dev /Users/playra/999-multibots-telegraf
> cross-env NODE_ENV=development nodemon src/bot.ts

[nodemon] 2.0.22
[nodemon] to restart at any time, enter `rs`
[nodemon] watching path(s): src/\*_/_
[nodemon] watching extensions: ts
[nodemon] starting `npx ts-node -r tsconfig-paths/register src/bot.ts src/bot.ts`
--- Debugging .env loading ---
[CONFIG] Current Working Directory: /Users/playra/999-multibots-telegraf
[CONFIG] Found .env files: .env
[CONFIG] NODE_ENV before loading: development
[CONFIG] NODE_ENV is already set to: development
[CONFIG] isDev flag set to: true
[CONFIG] Attempting to load env file from: /Users/playra/999-multibots-telegraf/.env
[CONFIG] dotenv load result: Success
[CONFIG] NODE_ENV after loading .env: development
--- End Debugging .env loading ---
[CONFIG] Parsed ADMIN_IDS_ARRAY: [ 144022504, 1254048880, 352374518, 1852726961 ]
--- Bot Logic ---
[BOT] Detected mode (via isDev): development
[BOT] process.env.NODE_ENV: development
--- End Bot Logic Check ---
2025-04-20 11:31:50 [INFO]: 🤖 Инициализация defaultBot: {"description":"DefaultBot initialization","tokenLength":46}
2025-04-20 11:31:50 [INFO]: 🤖 Инициализация бота: {"description":"Bot initialization","bot_name":"ai_koshey_bot","tokenLength":46}
2025-04-20 11:31:50 [INFO]: 🤖 Инициализация бота: {"description":"Bot initialization","bot_name":"clip_maker_neuro_bot","tokenLength":46}
2025-04-20 11:31:50 [INFO]: 🌟 Инициализировано ботов: {"description":"Bots initialized","count":2,"bot_names":["neuro_blogger_bot","MetaMuse_Manifest_bot","ZavaraBot","LeeSolarbot","NeuroLenaAssistant_bot","NeurostylistShtogrina_bot","Gaia_Kamskaia_bot","ai_koshey_bot","clip_maker_neuro_bot"]}
2025-04-20 11:31:50 [INFO]: 🤖 Инициализация pulseBot: {"description":"PulseBot initialization","tokenLength":46}
2025-04-20 11:31:50 [INFO]: 🔄 Использован алиас режима {"description":"Mode alias used","originalMode":"neuro_photo_2","normalizedMode":"neuro_photo_v2"}
Environment check: { nodeEnv: 'development' }
Payment variables check:
MERCHANT_LOGIN: neuroblogger
PASSWORD1: [PROTECTED]
RESULT_URL2: https://999-multibots-telegraf-u14194.vm.elestio.app/payment-success
2025-04-20 11:31:50 [INFO]: 🔄 Использован алиас режима {"description":"Mode alias used","originalMode":"neuro_photo_2","normalizedMode":"neuro_photo_v2"}
🏁 Запуск приложения
🔧 Режим работы: development
📝 Загружен файл окружения: development
(node:34708) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
🤖 Тестовый бот ai_koshey_bot инициализирован
🚀 Тестовый бот ai_koshey_bot запущен в режиме разработки
[Robokassa] Webhook server running on port 2999
✅ Боты успешно запущены
{
"update_id": 545877991,
"message": {
"message_id": 51817,
"from": {
"id": 144022504,
"is_bot": false,
"first_name": "Dmitrii",
"last_name": "NeuroСoder",
"username": "neuro_sage",
"language_code": "ru"
},
"chat": {
"id": 144022504,
"first_name": "Dmitrii",
"last_name": "NeuroСoder",
"username": "neuro_sage",
"type": "private"
},
"date": 1745123499,
"text": "/start",
"entities": [
{
"offset": 0,
"length": 6,
"type": "bot_command"
}
]
}
}
CASE bot.command: start
2025-04-20 11:31:52 [INFO]: 🚀 [StartScene] Начало работы с ботом {"telegramId":"144022504","function":"startScene","username":"neuro_sage","language":"ru","sessionData":"{\"mode\":\"start_scene\",\"prompt\":\"\",\"selectedModel\":\"\",\"userModel\":{\"model_name\":\"\",\"trigger_word\":\"\",\"model_url\":\"placeholder/placeholder:placeholder\",\"finetune_id\":\"\"},\"targetUserId\":\"0\",\"steps\":0,\"selectedSize\":\"\",\"subscription\":\"stars\",\"selectedPayment\":{\"amount\":0,\"stars\":0,\"subscription\":\"stars\",\"type\":\"system\"},\"videoUrl\":\"\",\"imageUrl\":\"\",\"audioUrl\":\"\",\"email\":\"\",\"cursor\":0,\"images\":[],\"memory\":{\"messages\":[]},\"attempts\":0,\"amount\":0,\"modelName\":\"\",\"triggerWord\":\"\",\"videoModel\":\"\",\"translations\":[],\"buttons\":[],\"**scenes\":{\"current\":\"start_scene\",\"state\":{},\"cursor\":0}}"}
2025-04-20 11:31:52 [INFO]: 📡 [StartScene] Получение перевода для стартового сообщения {"telegramId":"144022504","function":"startScene","bot_name":"ai_koshey_bot","step":"fetching_translation"}
CASE: getTranslation: start
2025-04-20 11:31:52 [INFO]: ✅ [StartScene] Перевод получен {"telegramId":"144022504","function":"startScene","translationReceived":true,"imageUrlReceived":true,"step":"translation_received"}
2025-04-20 11:31:52 [INFO]: 🖼️ [StartScene] Отправка приветственного изображения с подписью {"telegramId":"144022504","function":"startScene","url":"https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/landingpage/avatars/neuro_blogger_bot/flux_pro.jpeg","step":"sending_welcome_image"}
2025-04-20 11:31:53 [INFO]: 🎬 [StartScene] Отправка ссылки на туториал для ai_koshey_bot {"telegramId":"144022504","function":"startScene","tutorialUrl":"https://t.me/neuro_coder_ai/1212","step":"sending_tutorial"}
2025-04-20 11:31:53 [INFO]: 📤 [StartScene] Отправка текста с туториалом и клавиатурой {"telegramId":"144022504","function":"startScene","step":"sending_tutorial_text_with_keyboard","buttons":["💫 Оформить подписку","💬 Техподдержка"]}
2025-04-20 11:31:53 [INFO]: 🏁 [StartScene] Завершение сцены старта {"telegramId":"144022504","function":"startScene","step":"scene_leave"}
{
"update_id": 545877992,
"message": {
"message_id": 51820,
"from": {
"id": 144022504,
"is_bot": false,
"first_name": "Dmitrii",
"last_name": "NeuroСoder",
"username": "neuro_sage",
"language_code": "ru"
},
"chat": {
"id": 144022504,
"first_name": "Dmitrii",
"last_name": "NeuroСoder",
"username": "neuro_sage",
"type": "private"
},
"date": 1745123517,
"text": "/menu",
"entities": [
{
"offset": 0,
"length": 5,
"type": "bot_command"
}
]
}
}
2025-04-20 11:31:57 [INFO]: [Command /menu START] User: 144022504. Resetting session and checking subscription status... {"telegramId":"144022504"}
2025-04-20 11:31:57 [INFO]: [getUserDetails v3.0 Start] Запрос деталей для User: 144022504 {"telegramId":"144022504"}
2025-04-20 11:31:57 [INFO]: 🔍 Получение баланса пользователя из БД: {"description":"Getting user balance from database","telegram_id":"144022504"}
2025-04-20 11:31:57 [INFO]: ✅ Баланс пользователя получен и кэширован: {"description":"User balance retrieved and cached","telegram_id":"144022504","stars":9887.12}
2025-04-20 11:31:57 [INFO]: [getUserDetails v3.0 Step 1 OK] Баланс для User: 144022504: 9887.12 {"telegramId":"144022504"}
2025-04-20 11:31:57 [INFO]: [getUserDetails v3.0 Step 2 OK] Пользователь 144022504 найден в таблице users. {"telegramId":"144022504"}
2025-04-20 11:31:57 [INFO]: [getUserDetails v3.0 Step 3 OK] Проверка подписки User: 144022504 {"isActive":true,"type":"neurobase","paymentDate":"2025-04-19T13:01:14.437818+00:00","expirationDate":"2025-05-19T13:01:14.437Z"}
2025-04-20 11:31:57 [INFO]: [getUserDetails v3.0 Finish] Детали пользователя 144022504 успешно собраны. {"details":{"stars":9887.12,"subscriptionType":"NEUROBASE","isSubscriptionActive":true,"isExist":true,"subscriptionStartDate":"2025-04-19T13:01:14.437818+00:00"}}
2025-04-20 11:31:57 [INFO]: [Command /menu DETAILS] User: 144022504. Status received. {"telegramId":"144022504","details":{"stars":9887.12,"subscriptionType":"NEUROBASE","isSubscriptionActive":true,"isExist":true,"subscriptionStartDate":"2025-04-19T13:01:14.437818+00:00"}}
2025-04-20 11:31:57 [INFO]: [Command /menu DECISION] User: 144022504. Subscription ACTIVE. Entering 'menuScene'. {"telegramId":"144022504"}
CASE 📲: menuCommand
💻 CASE: mainMenu
message 🏠 Главное меню
Выберите нужный раздел 👇
{
"update_id": 545877993,
"message": {
"message_id": 51822,
"from": {
"id": 144022504,
"is_bot": false,
"first_name": "Dmitrii",
"last_name": "NeuroСoder",
"username": "neuro_sage",
"language_code": "ru"
},
"chat": {
"id": 144022504,
"first_name": "Dmitrii",
"last_name": "NeuroСoder",
"username": "neuro_sage",
"type": "private"
},
"date": 1745123520,
"text": "📸 Нейрофото"
}
}
CASE 1: menuScene.next
CASE menuNextStep: text 2 📸 Нейрофото
2025-04-20 11:32:00 [INFO]: 🚀 [handleMenu] Обработка команды меню {"telegramId":"144022504","function":"handleMenu","sessionData":"{\"mode\":\"main_menu\",\"prompt\":\"\",\"selectedModel\":\"\",\"userModel\":{\"model_name\":\"\",\"trigger_word\":\"\",\"model_url\":\"placeholder/placeholder:placeholder\",\"finetune_id\":\"\"},\"targetUserId\":\"0\",\"steps\":0,\"selectedSize\":\"\",\"subscription\":\"stars\",\"selectedPayment\":{\"amount\":0,\"stars\":0,\"subscription\":\"stars\",\"type\":\"system\"},\"videoUrl\":\"\",\"imageUrl\":\"\",\"audioUrl\":\"\",\"email\":\"\",\"cursor\":0,\"images\":[],\"memory\":{\"messages\":[]},\"attempts\":0,\"amount\":0,\"modelName\":\"\",\"triggerWord\":\"\",\"videoModel\":\"\",\"translations\":[],\"buttons\":[],\"**scenes\":{\"current\":\"main_menu\",\"state\":{},\"cursor\":1}}"}
CASE: handleMenuCommand
2025-04-20 11:32:00 [INFO]: 📝 [handleMenu] Получен текст команды: "📸 Нейрофото" {"telegramId":"144022504","function":"handleMenu","text":"📸 Нейрофото"}
CASE: handleMenuCommand.text 📸 Нейрофото
2025-04-20 11:32:00 [INFO]: ✅ [handleMenu] Найдено действие для текста: "📸 Нейрофото" {"telegramId":"144022504","function":"handleMenu","text":"📸 Нейрофото","result":"action_found"}
CASE: handleMenuCommand.if 📸 Нейрофото
2025-04-20 11:32:00 [INFO]: 📸 [handleMenu] Переход к нейрофото {"telegramId":"144022504","function":"handleMenu","action":"neurophoto","nextScene":"check_balance_scene"}
CASE handleMenu: 📸 Нейрофото
2025-04-20 11:32:00 [INFO]: 🚀 [CheckBalanceScene] Вход в сцену проверки баланса {"telegramId":"144022504","function":"checkBalanceScene.enter","sessionMode":"neuro_photo","sessionData":"{\"mode\":\"neuro_photo\",\"prompt\":\"\",\"selectedModel\":\"\",\"userModel\":{\"model_name\":\"\",\"trigger_word\":\"\",\"model_url\":\"placeholder/placeholder:placeholder\",\"finetune_id\":\"\"},\"targetUserId\":\"0\",\"steps\":0,\"selectedSize\":\"\",\"subscription\":\"stars\",\"selectedPayment\":{\"amount\":0,\"stars\":0,\"subscription\":\"stars\",\"type\":\"system\"},\"videoUrl\":\"\",\"imageUrl\":\"\",\"audioUrl\":\"\",\"email\":\"\",\"cursor\":0,\"images\":[],\"memory\":{\"messages\":[]},\"attempts\":0,\"amount\":0,\"modelName\":\"\",\"triggerWord\":\"\",\"videoModel\":\"\",\"translations\":[],\"buttons\":[],\"**scenes\":{\"current\":\"check_balance_scene\",\"state\":{}}}"}
💵 CASE: checkBalanceScene
2025-04-20 11:32:00 [INFO]: [CheckBalanceScene] Запрошен режим: neuro_photo пользователем: 144022504 {"telegramId":"144022504","mode":"neuro_photo","language":"ru","function":"checkBalanceScene.enter","step":"identifying_user_and_mode"}
2025-04-20 11:32:00 [INFO]: [CheckBalanceScene] Получение данных пользователя из БД {"telegramId":"144022504","function":"checkBalanceScene.enter","step":"fetching_user_data"}
2025-04-20 11:32:00 [INFO]: [getUserDetails v3.0 Start] Запрос деталей для User: 144022504 {"telegramId":"144022504"}
2025-04-20 11:32:00 [INFO]: 💾 Получение баланса из кэша: {"description":"Getting user balance from cache","telegram_id":"144022504","cached_balance":9887.12}
2025-04-20 11:32:00 [INFO]: [getUserDetails v3.0 Step 1 OK] Баланс для User: 144022504: 9887.12 {"telegramId":"144022504"}
2025-04-20 11:32:00 [INFO]: [getUserDetails v3.0 Step 2 OK] Пользователь 144022504 найден в таблице users. {"telegramId":"144022504"}
2025-04-20 11:32:00 [INFO]: [getUserDetails v3.0 Step 3 OK] Проверка подписки User: 144022504 {"isActive":true,"type":"neurobase","paymentDate":"2025-04-19T13:01:14.437818+00:00","expirationDate":"2025-05-19T13:01:14.437Z"}
2025-04-20 11:32:00 [INFO]: [getUserDetails v3.0 Finish] Детали пользователя 144022504 успешно собраны. {"details":{"stars":9887.12,"subscriptionType":"NEUROBASE","isSubscriptionActive":true,"isExist":true,"subscriptionStartDate":"2025-04-19T13:01:14.437818+00:00"}}
2025-04-20 11:32:00 [INFO]: [CheckBalanceScene] Данные пользователя получены {"telegramId":"144022504","function":"checkBalanceScene.enter","step":"user_data_fetched","userExists":true,"subscriptionActive":true,"subscriptionType":"NEUROBASE","stars":9887.12}
2025-04-20 11:32:00 [INFO]: [CheckBalanceScene] Подписка активна для пользователя 144022504. Тип: NEUROBASE {"telegramId":"144022504","function":"checkBalanceScene.enter","step":"subscription_check_passed","subscriptionType":"NEUROBASE","mode":"neuro_photo"}
2025-04-20 11:32:00 [INFO]: [CheckBalanceScene] Проверка баланса для режима: neuro_photo {"telegramId":"144022504","function":"checkBalanceScene.enter","step":"balance_check","mode":"neuro_photo","cost":5,"balance":9887.12,"hasEnoughBalance":true}
2025-04-20 11:32:00 [INFO]: [CheckBalanceScene] Отображение информации о балансе для платной функции {"telegramId":"144022504","function":"checkBalanceScene.enter","step":"displaying_balance_info","mode":"neuro_photo","cost":5,"balance":9887.12}
2025-04-20 11:32:00 [INFO]: 🔎 getBotByName запрошен для {"description":"getBotByName requested for","bot_name":"ai_koshey_bot"}
2025-04-20 11:32:00 [INFO]: 🔑 Токен бота получен из конфигурации {"description":"Bot token retrieved from configuration","bot_name":"ai_koshey_bot","tokenLength":46}
2025-04-20 11:32:00 [INFO]: 🔄 Создание нового экземпляра бота {"description":"Creating new bot instance","bot_name":"ai_koshey_bot"}
2025-04-20 11:32:00 [INFO]: ✅ Бот успешно получен {"description":"Bot successfully retrieved","bot_name":"ai_koshey_bot","hasSendMessage":true}
2025-04-20 11:32:01 [INFO]: [CheckBalanceScene] Все проверки пройдены, доступ разрешен для режима: neuro_photo {"telegramId":"144022504","function":"checkBalanceScene.enter","step":"all_checks_passed","mode":"neuro_photo","cost":5,"balance":9887.12,"result":"access_granted"}
2025-04-20 11:32:01 [INFO]: [CheckBalanceScene] Вызов функции перехода к целевой сцене: neuro_photo {"telegramId":"144022504","function":"checkBalanceScene.enter","step":"entering_target_scene","targetScene":"neuro_photo"}
2025-04-20 11:32:01 [INFO]: [enterTargetScene] Начало перехода в целевую сцену: neuro_photo {"telegramId":"144022504","function":"enterTargetScene","requestedMode":"neuro_photo","sessionData":"{\"mode\":\"neuro_photo\",\"prompt\":\"\",\"selectedModel\":\"\",\"userModel\":{\"model_name\":\"\",\"trigger_word\":\"\",\"model_url\":\"placeholder/placeholder:placeholder\",\"finetune_id\":\"\"},\"targetUserId\":\"0\",\"steps\":0,\"selectedSize\":\"\",\"subscription\":\"stars\",\"selectedPayment\":{\"amount\":0,\"stars\":0,\"subscription\":\"stars\",\"type\":\"system\"},\"videoUrl\":\"\",\"imageUrl\":\"\",\"audioUrl\":\"\",\"email\":\"\",\"cursor\":0,\"images\":[],\"memory\":{\"messages\":[]},\"attempts\":0,\"amount\":0,\"modelName\":\"\",\"triggerWord\":\"\",\"videoModel\":\"\",\"translations\":[],\"buttons\":[],\"**scenes\":{\"current\":\"check_balance_scene\",\"state\":{}}}"}
2025-04-20 11:32:01 [INFO]: [enterTargetScene] Подготовка к переключению на сцену: neuro_photo {"telegramId":"144022504","function":"enterTargetScene","targetScene":"neuro_photo","step":"prepare_switch"}
2025-04-20 11:32:01 [INFO]: [enterTargetScene] Переход к сцене нейрофото {"telegramId":"144022504","function":"enterTargetScene","fromMode":"neuro_photo","toScene":"neuro_photo"}
2025-04-20 11:32:01 [INFO]: 🚀 [NeuroPhoto] Начало сцены neuroPhotoConversationStep {"telegramId":"144022504","currentScene":"neuro_photo","step":"conversation","sessionData":"{\"mode\":\"neuro_photo\",\"prompt\":\"\",\"selectedModel\":\"\",\"userModel\":{\"model_name\":\"\",\"trigger_word\":\"\",\"model_url\":\"placeholder/placeholder:placeholder\",\"finetune_id\":\"\"},\"targetUserId\":\"0\",\"steps\":0,\"selectedSize\":\"\",\"subscription\":\"stars\",\"selectedPayment\":{\"amount\":0,\"stars\":0,\"subscription\":\"stars\",\"type\":\"system\"},\"videoUrl\":\"\",\"imageUrl\":\"\",\"audioUrl\":\"\",\"email\":\"\",\"cursor\":0,\"images\":[],\"memory\":{\"messages\":[]},\"attempts\":0,\"amount\":0,\"modelName\":\"\",\"triggerWord\":\"\",\"videoModel\":\"\",\"translations\":[],\"buttons\":[],\"\_\_scenes\":{\"current\":\"neuro_photo\",\"state\":{},\"cursor\":0}}"}
CASE 1: neuroPhotoConversation
2025-04-20 11:32:01 [INFO]: 🔍 [NeuroPhoto] Получение модели пользователя {"telegramId":"144022504","step":"getting_user_model"}
{
id: '7d43907b-6acb-4329-b5af-9e53cf8a29b5',
telegram_id: 144022504,
model_name: 'neuro_sage',
trigger_word: 'NEURO_SAGE',
zip_url: 'https://ai-server-new-u14194.vm.elestio.app/uploads/144022504/model/1741876849120-training_images_1741876848422.zip',
model_url: 'ghashtag/neuro_sage:65d4aa45988460fc1966dddd91245f7838161a0eec9847ac783fd1918b704033',
replicate_training_id: null,
status: 'SUCCESS',
created_at: '2025-03-13T14:40:50.078295+00:00',
updated_at: '2025-04-06T03:30:05.710448+00:00',
error: null,
steps: 2000,
finetune_id: null,
result: null,
api: 'replicate',
cancel_url: null,
weights: null,
bot_name: 'neuro_blogger_bot'
} getLatestUserModel
2025-04-20 11:32:01 [INFO]: 📋 [NeuroPhoto] Получение данных о рефералах и пользователе {"telegramId":"144022504","hasUserModel":true,"modelUrl":"ghashtag/neuro_sage:65d4aa45988460fc1966dddd91245f7838161a0eec9847ac783fd1918b704033"}
2025-04-20 11:32:01 [INFO]: [getUserDetails v3.0 Start] Запрос деталей для User: 144022504 {"telegramId":"144022504"}
2025-04-20 11:32:01 [INFO]: 💾 Получение баланса из кэша: {"description":"Getting user balance from cache","telegram_id":"144022504","cached_balance":9887.12}
2025-04-20 11:32:01 [INFO]: [getUserDetails v3.0 Step 1 OK] Баланс для User: 144022504: 9887.12 {"telegramId":"144022504"}
2025-04-20 11:32:01 [INFO]: [getUserDetails v3.0 Step 2 OK] Пользователь 144022504 найден в таблице users. {"telegramId":"144022504"}
2025-04-20 11:32:02 [INFO]: [getUserDetails v3.0 Step 3 OK] Проверка подписки User: 144022504 {"isActive":true,"type":"neurobase","paymentDate":"2025-04-19T13:01:14.437818+00:00","expirationDate":"2025-05-19T13:01:14.437Z"}
2025-04-20 11:32:02 [INFO]: [getUserDetails v3.0 Finish] Детали пользователя 144022504 успешно собраны. {"details":{"stars":9887.12,"subscriptionType":"NEUROBASE","isSubscriptionActive":true,"isExist":true,"subscriptionStartDate":"2025-04-19T13:01:14.437818+00:00"}}
2025-04-20 11:32:02 [INFO]: 📊 [NeuroPhoto] Данные пользователя получены {"telegramId":"144022504","referralCount":0,"subscriptionType":"NEUROBASE"}
2025-04-20 11:32:02 [INFO]: 💾 [NeuroPhoto] Модель пользователя сохранена в сессии {"telegramId":"144022504","modelUrl":"ghashtag/neuro_sage:65d4aa45988460fc1966dddd91245f7838161a0eec9847ac783fd1918b704033","triggerWord":"NEURO_SAGE"}
2025-04-20 11:32:02 [INFO]: 🔄 [NeuroPhoto] Обработка команды отмены: продолжение {"telegramId":"144022504","isCancel":false}
isCancel false
CASE: neuroPhotoConversation next
2025-04-20 11:32:02 [INFO]: ⏭️ [NeuroPhoto] Переход к следующему шагу {"telegramId":"144022504","nextStep":"neuroPhotoPromptStep"}
2025-04-20 11:32:02 [INFO]: [enterTargetScene] Переход в сцену neuro_photo завершен {"telegramId":"144022504","function":"enterTargetScene","targetScene":"neuro_photo","step":"switch_completed","result":"completed"}
{
"update_id": 545877994,
"message": {
"message_id": 51825,
"from": {
"id": 144022504,
"is_bot": false,
"first_name": "Dmitrii",
"last_name": "NeuroСoder",
"username": "neuro_sage",
"language_code": "ru"
},
"chat": {
"id": 144022504,
"first_name": "Dmitrii",
"last_name": "NeuroСoder",
"username": "neuro_sage",
"type": "private"
},
"date": 1745123525,
"text": "shaman"
}
}
