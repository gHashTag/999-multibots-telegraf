999-multibots | --- Debugging .env loading ---
999-multibots | [CONFIG] Current Working Directory: /app
999-multibots | [CONFIG] Found .env files: None
999-multibots | [CONFIG] NODE_ENV before loading: production
999-multibots | [CONFIG] NODE_ENV is already set to: production
999-multibots | [CONFIG] isDev flag set to: false
999-multibots | [CONFIG] Attempting to load env file from: /app/.env
999-multibots | [CONFIG] dotenv load result: Success
999-multibots | [CONFIG] NODE_ENV after loading .env: production
999-multibots | [CONFIG] dotenv load error: ENOENT: no such file or directory, open '/app/.env'
999-multibots | --- End Debugging .env loading ---
999-multibots | Bot tokens check in ENV:
999-multibots | BOT_TOKEN_1 exists: true
999-multibots | BOT_TOKEN_2 exists: true
999-multibots | BOT_TOKEN_3 exists: true
999-multibots | BOT_TOKEN_4 exists: true
999-multibots | BOT_TOKEN_5 exists: true
999-multibots | BOT_TOKEN_6 exists: true
999-multibots | BOT_TOKEN_7 exists: true
999-multibots | SUPABASE_URL exists: true
999-multibots | SUPABASE_SERVICE_KEY exists: true
999-multibots | SUPABASE_SERVICE_ROLE_KEY exists: true
999-multibots | [CONFIG] Parsed ADMIN_IDS_ARRAY: [ 144022504, 1254048880, 352374518, 1852726961 ]
999-multibots | --- Bot Logic ---
999-multibots | [BOT] Detected mode (via isDev): production
999-multibots | [BOT] process.env.NODE_ENV: production
999-multibots | --- End Bot Logic Check ---
999-multibots | 2025-04-20 04:27:35 [INFO]: 🤖 Инициализация defaultBot: {"description":"DefaultBot initialization","tokenLength":46}
999-multibots | 2025-04-20 04:27:35 [INFO]: 🤖 Использование существующего defaultBot: {"description":"Using existing defaultBot","bot_name":"neuro_blogger_bot"}
999-multibots | 2025-04-20 04:27:35 [INFO]: 🤖 Инициализация бота: {"description":"Bot initialization","bot_name":"MetaMuse_Manifest_bot","tokenLength":46}
999-multibots | 2025-04-20 04:27:35 [INFO]: 🤖 Инициализация бота: {"description":"Bot initialization","bot_name":"ZavaraBot","tokenLength":46}
999-multibots | 2025-04-20 04:27:35 [INFO]: 🤖 Инициализация бота: {"description":"Bot initialization","bot_name":"LeeSolarbot","tokenLength":46}
999-multibots | 2025-04-20 04:27:35 [INFO]: 🤖 Инициализация бота: {"description":"Bot initialization","bot_name":"NeuroLenaAssistant_bot","tokenLength":46}
999-multibots | 2025-04-20 04:27:35 [INFO]: 🤖 Инициализация бота: {"description":"Bot initialization","bot_name":"NeurostylistShtogrina_bot","tokenLength":46}
999-multibots | 2025-04-20 04:27:35 [INFO]: 🤖 Инициализация бота: {"description":"Bot initialization","bot_name":"Gaia_Kamskaia_bot","tokenLength":46}
999-multibots | 2025-04-20 04:27:35 [INFO]: 🌟 Инициализировано ботов: {"description":"Bots initialized","count":7,"bot_names":["neuro_blogger_bot","MetaMuse_Manifest_bot","ZavaraBot","LeeSolarbot","NeuroLenaAssistant_bot","NeurostylistShtogrina_bot","Gaia_Kamskaia_bot","ai_koshey_bot","clip_maker_neuro_bot"]}
999-multibots | 2025-04-20 04:27:35 [INFO]: 🤖 Инициализация pulseBot: {"description":"PulseBot initialization","tokenLength":46}
999-multibots | 2025-04-20 04:27:36 [INFO]: 🔄 Использован алиас режима {"description":"Mode alias used","originalMode":"neuro_photo_2","normalizedMode":"neuro_photo_v2"}
999-multibots | Environment check: { nodeEnv: 'production' }
999-multibots | Payment variables check:
999-multibots | MERCHANT_LOGIN: neuroblogger
999-multibots | ROBOKASSA_PASSWORD_1_TEST: [PROTECTED]
999-multibots | RESULT_URL2: https://999-multibots-telegraf-u14194.vm.elestio.app/payment-success
999-multibots | 2025-04-20 04:27:36 [INFO]: 🔄 Использован алиас режима {"description":"Mode alias used","originalMode":"neuro_photo_2","normalizedMode":"neuro_photo_v2"}
999-multibots | 🏁 Запуск приложения
999-multibots | 🔧 Режим работы: production
999-multibots | 📝 Загружен файл окружения: production
999-multibots | 🤖 Бот neuro_blogger_bot инициализирован
999-multibots | 🔌 Используем порт 3001 для бота neuro_blogger_bot
999-multibots | 🚀 Бот neuro_blogger_bot запущен в продакшен режиме на порту 3001
999-multibots | 🤖 Бот MetaMuse_Manifest_bot инициализирован
999-multibots | 🔌 Используем порт 3002 для бота MetaMuse_Manifest_bot
999-multibots | 🚀 Бот MetaMuse_Manifest_bot запущен в продакшен режиме на порту 3002
999-multibots | 🤖 Бот ZavaraBot инициализирован
999-multibots | 🔌 Используем порт 3003 для бота ZavaraBot
bot-proxy | /docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration
bot-proxy | /docker-entrypoint.sh: Looking for shell scripts in /docker-entrypoint.d/
bot-proxy | /docker-entrypoint.sh: Launching /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh
bot-proxy | 10-listen-on-ipv6-by-default.sh: info: can not modify /etc/nginx/conf.d/default.conf (read-only file system?)
bot-proxy | /docker-entrypoint.sh: Sourcing /docker-entrypoint.d/15-local-resolvers.envsh
bot-proxy | /docker-entrypoint.sh: Launching /docker-entrypoint.d/20-envsubst-on-templates.sh
bot-proxy | /docker-entrypoint.sh: Launching /docker-entrypoint.d/30-tune-worker-processes.sh
bot-proxy | /docker-entrypoint.sh: Configuration complete; ready for start up
bot-proxy | 2025/04/20 04:27:35 [notice] 1#1: using the "epoll" event method
bot-proxy | 2025/04/20 04:27:35 [notice] 1#1: nginx/1.27.5
bot-proxy | 2025/04/20 04:27:35 [notice] 1#1: built by gcc 12.2.0 (Debian 12.2.0-14)
bot-proxy | 2025/04/20 04:27:35 [notice] 1#1: OS: Linux 6.8.0-57-generic
bot-proxy | 2025/04/20 04:27:35 [notice] 1#1: getrlimit(RLIMIT_NOFILE): 1048576:1048576
bot-proxy | 2025/04/20 04:27:35 [notice] 1#1: start worker processes
bot-proxy | 2025/04/20 04:27:35 [notice] 1#1: start worker process 21
bot-proxy | 2025/04/20 04:27:35 [notice] 1#1: start worker process 22
999-multibots | 🚀 Бот ZavaraBot запущен в продакшен режиме на порту 3003
999-multibots | 🤖 Бот LeeSolarbot инициализирован
999-multibots | 🔌 Используем порт 3004 для бота LeeSolarbot
999-multibots | 🚀 Бот LeeSolarbot запущен в продакшен режиме на порту 3004
999-multibots | ❌ Ошибка валидации токена: 401: Unauthorized
999-multibots | ❌ Ошибка валидации токена: 401: Unauthorized
999-multibots | 🤖 Бот Gaia_Kamskaia_bot инициализирован
999-multibots | 🔌 Используем порт 3005 для бота Gaia_Kamskaia_bot
999-multibots | 🚀 Бот Gaia_Kamskaia_bot запущен в продакшен режиме на порту 3005
999-multibots | 🚀 Вебхук сервер запущен на порту 2999
999-multibots | [Robokassa] Failed to start webhook server: listen EADDRINUSE: address already in use :::2999
999-multibots | [Robokassa] Port 2999 is already in use. Maybe another instance is running?
999-multibots | ✅ Боты успешно запущены
999-multibots | ✅ Зарегистрирован вебхук для бота neuro_blogger_bot на пути /telegraf/3991e899c2388ce7183615a24c6c3b0a9f36f4e54b53578d2a469a047e83074f
999-multibots | ✅ Зарегистрирован вебхук для бота MetaMuse_Manifest_bot на пути /telegraf/5b8ba177ba1aab7cc67834b211e4c31b84e10b381617dfe9e8636f069e5db394
999-multibots | ✅ Зарегистрирован вебхук для бота LeeSolarbot на пути /telegraf/abc3914b4be22e189c6144ce04dc45e9656a4077d9fa22f0465da6a82bd29543
999-multibots | ✅ Зарегистрирован вебхук для бота ZavaraBot на пути /telegraf/f79b12d1a748e9a7cafe4043830e0a41a5b87545947d3f248e8c9e9c6075786f
999-multibots | ✅ Зарегистрирован вебхук для бота Gaia_Kamskaia_bot на пути /telegraf/a0c1769324c81b94b654fbfa4712963f17db30162484198e06a560922163100c
999-multibots | 📥 Входящий запрос: POST /telegraf/3991e899c2388ce7183615a24c6c3b0a9f36f4e54b53578d2a469a047e83074f
999-multibots | 🔄 Получен вебхук для токена: 3991e8...
999-multibots | {
999-multibots | "update_id": 116726751,
999-multibots | "message": {
999-multibots | "message_id": 83517,
999-multibots | "from": {
999-multibots | "id": 144022504,
999-multibots | "is_bot": false,
999-multibots | "first_name": "Dmitrii",
999-multibots | "last_name": "NeuroСoder",
999-multibots | "username": "neuro_sage",
999-multibots | "language_code": "ru"
999-multibots | },
999-multibots | "chat": {
999-multibots | "id": 144022504,
999-multibots | "first_name": "Dmitrii",
999-multibots | "last_name": "NeuroСoder",
999-multibots | "username": "neuro_sage",
999-multibots | "type": "private"
999-multibots | },
999-multibots | "date": 1745123290,
999-multibots | "text": "/start",
999-multibots | "entities": [
999-multibots | {
999-multibots | "offset": 0,
999-multibots | "length": 6,
999-multibots | "type": "bot_command"
999-multibots | }
999-multibots | ]
999-multibots | }
999-multibots | }
999-multibots | CASE bot.command: start
999-multibots | 2025-04-20 04:28:10 [INFO]: 🚀 [StartScene] Начало работы с ботом {"telegramId":"144022504","function":"startScene","username":"neuro_sage","language":"ru","sessionData":"{\"mode\":\"start_scene\",\"prompt\":\"\",\"selectedModel\":\"\",\"userModel\":{\"model_name\":\"\",\"trigger_word\":\"\",\"model_url\":\"placeholder/placeholder:placeholder\",\"finetune_id\":\"\"},\"targetUserId\":\"0\",\"steps\":0,\"selectedSize\":\"\",\"subscription\":\"stars\",\"selectedPayment\":{\"amount\":0,\"stars\":0,\"subscription\":\"stars\",\"type\":\"system\"},\"videoUrl\":\"\",\"imageUrl\":\"\",\"audioUrl\":\"\",\"email\":\"\",\"cursor\":0,\"images\":[],\"memory\":{\"messages\":[]},\"attempts\":0,\"amount\":0,\"modelName\":\"\",\"triggerWord\":\"\",\"videoModel\":\"\",\"translations\":[],\"buttons\":[],\"**scenes\":{\"current\":\"start_scene\",\"state\":{},\"cursor\":0}}"}
999-multibots | 2025-04-20 04:28:10 [INFO]: 📡 [StartScene] Получение перевода для стартового сообщения {"telegramId":"144022504","function":"startScene","bot_name":"neuro_blogger_bot","step":"fetching_translation"}
999-multibots | CASE: getTranslation: start
999-multibots | 2025-04-20 04:28:11 [INFO]: ✅ [StartScene] Перевод получен {"telegramId":"144022504","function":"startScene","translationReceived":true,"imageUrlReceived":true,"step":"translation_received"}
999-multibots | 2025-04-20 04:28:11 [INFO]: 🖼️ [StartScene] Отправка приветственного изображения с подписью {"telegramId":"144022504","function":"startScene","url":"https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/landingpage/avatars/neuro_blogger_bot/flux_pro.jpeg","step":"sending_welcome_image"}
999-multibots | 2025-04-20 04:28:11 [INFO]: 🎬 [StartScene] Отправка ссылки на туториал для neuro_blogger_bot {"telegramId":"144022504","function":"startScene","tutorialUrl":"https://t.me/neuro_coder_ai/1212","step":"sending_tutorial"}
999-multibots | 2025-04-20 04:28:11 [INFO]: 📤 [StartScene] Отправка текста с туториалом и клавиатурой {"telegramId":"144022504","function":"startScene","step":"sending_tutorial_text_with_keyboard","buttons":["💫 Оформить подписку","💬 Техподдержка"]}
999-multibots | 2025-04-20 04:28:11 [INFO]: 🏁 [StartScene] Завершение сцены старта {"telegramId":"144022504","function":"startScene","step":"scene_leave"}
bot-proxy | 172.27.0.1 - - [20/Apr/2025:04:28:11 +0000] "POST /telegraf/3991e899c2388ce7183615a24c6c3b0a9f36f4e54b53578d2a469a047e83074f HTTP/1.1" 200 0 "-" "-" "91.108.5.21"
999-multibots | 📥 Входящий запрос: POST /telegraf/3991e899c2388ce7183615a24c6c3b0a9f36f4e54b53578d2a469a047e83074f
999-multibots | 🔄 Получен вебхук для токена: 3991e8...
999-multibots | {
999-multibots | "update_id": 116726752,
999-multibots | "message": {
999-multibots | "message_id": 83520,
999-multibots | "from": {
999-multibots | "id": 144022504,
999-multibots | "is_bot": false,
999-multibots | "first_name": "Dmitrii",
999-multibots | "last_name": "NeuroСoder",
999-multibots | "username": "neuro_sage",
999-multibots | "language_code": "ru"
999-multibots | },
999-multibots | "chat": {
999-multibots | "id": 144022504,
999-multibots | "first_name": "Dmitrii",
999-multibots | "last_name": "NeuroСoder",
999-multibots | "username": "neuro_sage",
999-multibots | "type": "private"
999-multibots | },
999-multibots | "date": 1745123301,
999-multibots | "text": "/menu",
999-multibots | "entities": [
999-multibots | {
999-multibots | "offset": 0,
999-multibots | "length": 5,
999-multibots | "type": "bot_command"
999-multibots | }
999-multibots | ]
999-multibots | }
999-multibots | }
999-multibots | 2025-04-20 04:28:21 [INFO]: [Command /menu START] User: 144022504. Resetting session and checking subscription status... {"telegramId":"144022504"}
999-multibots | 2025-04-20 04:28:21 [INFO]: [getUserDetailsSubscription v3.0 Start] Запрос деталей для User: 144022504 {"telegramId":"144022504"}
999-multibots | 2025-04-20 04:28:21 [INFO]: 🔍 Получение баланса пользователя из БД: {"description":"Getting user balance from database","telegram_id":"144022504"}
999-multibots | 2025-04-20 04:28:21 [INFO]: ✅ Баланс пользователя получен и кэширован: {"description":"User balance retrieved and cached","telegram_id":"144022504","stars":9887.12}
999-multibots | 2025-04-20 04:28:21 [INFO]: [getUserDetailsSubscription v3.0 Step 1 OK] Баланс для User: 144022504: 9887.12 {"telegramId":"144022504"}
999-multibots | 2025-04-20 04:28:21 [INFO]: [getUserDetailsSubscription v3.0 Step 2 OK] Пользователь 144022504 найден в таблице users. {"telegramId":"144022504"}
999-multibots | 2025-04-20 04:28:21 [INFO]: [getUserDetailsSubscription v3.0 Step 3 OK] Проверка подписки User: 144022504 {"isActive":true,"type":"neurobase","paymentDate":"2025-04-19T13:01:14.437818+00:00","expirationDate":"2025-05-19T13:01:14.437Z"}
999-multibots | 2025-04-20 04:28:21 [INFO]: [getUserDetailsSubscription v3.0 Finish] Детали пользователя 144022504 успешно собраны. {"details":{"stars":9887.12,"subscriptionType":"NEUROBASE","isSubscriptionActive":true,"isExist":true,"subscriptionStartDate":"2025-04-19T13:01:14.437818+00:00"}}
999-multibots | 2025-04-20 04:28:21 [INFO]: [Command /menu DETAILS] User: 144022504. Status received. {"telegramId":"144022504","details":{"stars":9887.12,"subscriptionType":"NEUROBASE","isSubscriptionActive":true,"isExist":true,"subscriptionStartDate":"2025-04-19T13:01:14.437818+00:00"}}
999-multibots | 2025-04-20 04:28:21 [INFO]: [Command /menu DECISION] User: 144022504. Subscription ACTIVE. Entering 'menuScene'. {"telegramId":"144022504"}
999-multibots | CASE 📲: menuCommand
999-multibots | 2025-04-20 04:28:21 [INFO]: [getUserDetailsSubscription v3.0 Start] Запрос деталей для User: 144022504 {"telegramId":"144022504"}
999-multibots | 2025-04-20 04:28:21 [INFO]: 💾 Получение баланса из кэша: {"description":"Getting user balance from cache","telegram_id":"144022504","cached_balance":9887.12}
999-multibots | 2025-04-20 04:28:21 [INFO]: [getUserDetailsSubscription v3.0 Step 1 OK] Баланс для User: 144022504: 9887.12 {"telegramId":"144022504"}
999-multibots | 2025-04-20 04:28:21 [INFO]: [getUserDetailsSubscription v3.0 Step 2 OK] Пользователь 144022504 найден в таблице users. {"telegramId":"144022504"}
999-multibots | 2025-04-20 04:28:21 [INFO]: [getUserDetailsSubscription v3.0 Step 3 OK] Проверка подписки User: 144022504 {"isActive":true,"type":"neurobase","paymentDate":"2025-04-19T13:01:14.437818+00:00","expirationDate":"2025-05-19T13:01:14.437Z"}
999-multibots | 2025-04-20 04:28:21 [INFO]: [getUserDetailsSubscription v3.0 Finish] Детали пользователя 144022504 успешно собраны. {"details":{"stars":9887.12,"subscriptionType":"NEUROBASE","isSubscriptionActive":true,"isExist":true,"subscriptionStartDate":"2025-04-19T13:01:14.437818+00:00"}}
bot-proxy | 172.27.0.1 - - [20/Apr/2025:04:28:22 +0000] "POST /telegraf/3991e899c2388ce7183615a24c6c3b0a9f36f4e54b53578d2a469a047e83074f HTTP/1.1" 200 0 "-" "-" "91.108.5.21"
999-multibots | 💻 CASE: mainMenu
999-multibots | nameStep 🤖 Цифровое тело
999-multibots | No available levels for the current invite count and subscription status.
999-multibots | CASE: !hasFullAccess - stars level
999-multibots | 📥 Входящий запрос: POST /telegraf/3991e899c2388ce7183615a24c6c3b0a9f36f4e54b53578d2a469a047e83074f
999-multibots | 🔄 Получен вебхук для токена: 3991e8...
999-multibots | {
999-multibots | "update_id": 116726753,
999-multibots | "message": {
999-multibots | "message_id": 83522,
999-multibots | "from": {
999-multibots | "id": 144022504,
999-multibots | "is_bot": false,
999-multibots | "first_name": "Dmitrii",
999-multibots | "last_name": "NeuroСoder",
999-multibots | "username": "neuro_sage",
999-multibots | "language_code": "ru"
999-multibots | },
999-multibots | "chat": {
999-multibots | "id": 144022504,
999-multibots | "first_name": "Dmitrii",
999-multibots | "last_name": "NeuroСoder",
999-multibots | "username": "neuro_sage",
999-multibots | "type": "private"
999-multibots | },
999-multibots | "date": 1745123307,
999-multibots | "text": "/menu",
999-multibots | "entities": [
999-multibots | {
999-multibots | "offset": 0,
999-multibots | "length": 5,
999-multibots | "type": "bot_command"
999-multibots | }
999-multibots | ]
999-multibots | }
999-multibots | }
999-multibots | CASE 1: menuScene.next
999-multibots | CASE menuNextStep: text 2 /menu
999-multibots | 2025-04-20 04:28:27 [INFO]: 🚀 [handleMenu] Обработка команды меню {"telegramId":"144022504","function":"handleMenu","sessionData":"{\"mode\":\"main_menu\",\"prompt\":\"\",\"selectedModel\":\"\",\"userModel\":{\"model_name\":\"\",\"trigger_word\":\"\",\"model_url\":\"placeholder/placeholder:placeholder\",\"finetune_id\":\"\"},\"targetUserId\":\"0\",\"steps\":0,\"selectedSize\":\"\",\"subscription\":\"stars\",\"selectedPayment\":{\"amount\":0,\"stars\":0,\"subscription\":\"stars\",\"type\":\"system\"},\"videoUrl\":\"\",\"imageUrl\":\"\",\"audioUrl\":\"\",\"email\":\"\",\"cursor\":0,\"images\":[],\"memory\":{\"messages\":[]},\"attempts\":0,\"amount\":0,\"modelName\":\"\",\"triggerWord\":\"\",\"videoModel\":\"\",\"translations\":[],\"buttons\":[],\"**scenes\":{\"current\":\"main_menu\",\"state\":{},\"cursor\":1}}"}
999-multibots | CASE: handleMenuCommand
999-multibots | 2025-04-20 04:28:27 [INFO]: 📝 [handleMenu] Получен текст команды: "/menu" {"telegramId":"144022504","function":"handleMenu","text":"/menu"}
999-multibots | CASE: handleMenuCommand.text /menu
999-multibots | 2025-04-20 04:28:27 [INFO]: ✅ [handleMenu] Найдено действие для текста: "/menu" {"telegramId":"144022504","function":"handleMenu","text":"/menu","result":"action_found"}
999-multibots | CASE: handleMenuCommand.if /menu
999-multibots | 2025-04-20 04:28:27 [INFO]: 🏠 [handleMenu] Команда /menu - переход к главному меню {"telegramId":"144022504","function":"handleMenu","action":"menu_command","nextScene":"main_menu"}
999-multibots | CASE: 🏠 Главное меню
999-multibots | CASE 📲: menuCommand
999-multibots | 2025-04-20 04:28:27 [INFO]: [getUserDetailsSubscription v3.0 Start] Запрос деталей для User: 144022504 {"telegramId":"144022504"}
999-multibots | 2025-04-20 04:28:27 [INFO]: 💾 Получение баланса из кэша: {"description":"Getting user balance from cache","telegram_id":"144022504","cached_balance":9887.12}
999-multibots | 2025-04-20 04:28:27 [INFO]: [getUserDetailsSubscription v3.0 Step 1 OK] Баланс для User: 144022504: 9887.12 {"telegramId":"144022504"}
999-multibots | 2025-04-20 04:28:27 [INFO]: [getUserDetailsSubscription v3.0 Step 2 OK] Пользователь 144022504 найден в таблице users. {"telegramId":"144022504"}
999-multibots | 2025-04-20 04:28:27 [INFO]: [getUserDetailsSubscription v3.0 Step 3 OK] Проверка подписки User: 144022504 {"isActive":true,"type":"neurobase","paymentDate":"2025-04-19T13:01:14.437818+00:00","expirationDate":"2025-05-19T13:01:14.437Z"}
999-multibots | 2025-04-20 04:28:27 [INFO]: [getUserDetailsSubscription v3.0 Finish] Детали пользователя 144022504 успешно собраны. {"details":{"stars":9887.12,"subscriptionType":"NEUROBASE","isSubscriptionActive":true,"isExist":true,"subscriptionStartDate":"2025-04-19T13:01:14.437818+00:00"}}
bot-proxy | 172.27.0.1 - - [20/Apr/2025:04:28:27 +0000] "POST /telegraf/3991e899c2388ce7183615a24c6c3b0a9f36f4e54b53578d2a469a047e83074f HTTP/1.1" 200 0 "-" "-" "91.108.5.21"
999-multibots | 💻 CASE: mainMenu
999-multibots | nameStep 🤖 Цифровое тело
999-multibots | CASE: !hasFullAccess - stars level
999-multibots | No available levels for the current invite count and subscription status.
