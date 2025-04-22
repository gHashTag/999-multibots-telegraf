bot-proxy      | /docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration
bot-proxy      | /docker-entrypoint.sh: Looking for shell scripts in /docker-entrypoint.d/
bot-proxy      | /docker-entrypoint.sh: Launching /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh
bot-proxy      | 10-listen-on-ipv6-by-default.sh: info: can not modify /etc/nginx/conf.d/default.conf (read-only file system?)
bot-proxy      | /docker-entrypoint.sh: Sourcing /docker-entrypoint.d/15-local-resolvers.envsh
bot-proxy      | /docker-entrypoint.sh: Launching /docker-entrypoint.d/20-envsubst-on-templates.sh
bot-proxy      | /docker-entrypoint.sh: Launching /docker-entrypoint.d/30-tune-worker-processes.sh
bot-proxy      | /docker-entrypoint.sh: Configuration complete; ready for start up
bot-proxy      | 2025/04/22 07:45:10 [notice] 1#1: using the "epoll" event method
bot-proxy      | 2025/04/22 07:45:10 [notice] 1#1: nginx/1.27.5
bot-proxy      | 2025/04/22 07:45:10 [notice] 1#1: built by gcc 12.2.0 (Debian 12.2.0-14) 
bot-proxy      | 2025/04/22 07:45:10 [notice] 1#1: OS: Linux 6.8.0-57-generic
bot-proxy      | 2025/04/22 07:45:10 [notice] 1#1: getrlimit(RLIMIT_NOFILE): 1048576:1048576
bot-proxy      | 2025/04/22 07:45:10 [notice] 1#1: start worker processes
bot-proxy      | 2025/04/22 07:45:10 [notice] 1#1: start worker process 21
bot-proxy      | 2025/04/22 07:45:10 [notice] 1#1: start worker process 22
999-multibots  | --- Debugging .env loading --- 
999-multibots  | [CONFIG] Current Working Directory: /app
999-multibots  | [CONFIG] Found .env files: None
999-multibots  | [CONFIG] NODE_ENV before loading: production
999-multibots  | [CONFIG] NODE_ENV is already set to: production
999-multibots  | [CONFIG] isDev flag set to: false
999-multibots  | [CONFIG] Attempting to load env file from: /app/.env
999-multibots  | [CONFIG] dotenv load result: Success
999-multibots  | [CONFIG] NODE_ENV after loading .env: production
999-multibots  | --- End Debugging .env loading --- 
999-multibots  | [CONFIG] dotenv load error: ENOENT: no such file or directory, open '/app/.env'
999-multibots  | Bot tokens check in ENV:
999-multibots  | BOT_TOKEN_1 exists: true
999-multibots  | BOT_TOKEN_2 exists: true
999-multibots  | BOT_TOKEN_3 exists: true
999-multibots  | BOT_TOKEN_4 exists: true
999-multibots  | BOT_TOKEN_5 exists: true
999-multibots  | BOT_TOKEN_6 exists: true
999-multibots  | BOT_TOKEN_7 exists: true
999-multibots  | SUPABASE_URL exists: true
999-multibots  | SUPABASE_SERVICE_KEY exists: true
999-multibots  | SUPABASE_SERVICE_ROLE_KEY exists: true
999-multibots  | [CONFIG] Parsed ADMIN_IDS_ARRAY: [ 144022504, 1254048880, 352374518, 1852726961 ]
999-multibots  | --- Bot Logic ---
999-multibots  | [BOT] Detected mode (via isDev): production
999-multibots  | [BOT] process.env.NODE_ENV: production
999-multibots  | --- End Bot Logic Check ---
999-multibots  | 2025-04-22 07:45:10 [INFO]: 🤖 Инициализация defaultBot: {"description":"DefaultBot initialization","tokenLength":46}
999-multibots  | 2025-04-22 07:45:10 [INFO]: 🤖 Использование существующего defaultBot: {"description":"Using existing defaultBot","bot_name":"neuro_blogger_bot"}
999-multibots  | 2025-04-22 07:45:10 [INFO]: 🤖 Инициализация бота: {"description":"Bot initialization","bot_name":"MetaMuse_Manifest_bot","tokenLength":46}
999-multibots  | 2025-04-22 07:45:10 [INFO]: 🤖 Инициализация бота: {"description":"Bot initialization","bot_name":"ZavaraBot","tokenLength":46}
999-multibots  | 2025-04-22 07:45:10 [INFO]: 🤖 Инициализация бота: {"description":"Bot initialization","bot_name":"LeeSolarbot","tokenLength":46}
999-multibots  | 2025-04-22 07:45:10 [INFO]: 🤖 Инициализация бота: {"description":"Bot initialization","bot_name":"NeuroLenaAssistant_bot","tokenLength":46}
999-multibots  | 2025-04-22 07:45:10 [INFO]: 🤖 Инициализация бота: {"description":"Bot initialization","bot_name":"NeurostylistShtogrina_bot","tokenLength":46}
999-multibots  | 2025-04-22 07:45:10 [INFO]: 🤖 Инициализация бота: {"description":"Bot initialization","bot_name":"Gaia_Kamskaia_bot","tokenLength":46}
999-multibots  | 2025-04-22 07:45:10 [INFO]: 🌟 Инициализировано ботов: {"description":"Bots initialized","count":7,"bot_names":["neuro_blogger_bot","MetaMuse_Manifest_bot","ZavaraBot","LeeSolarbot","NeuroLenaAssistant_bot","NeurostylistShtogrina_bot","Gaia_Kamskaia_bot","ai_koshey_bot","clip_maker_neuro_bot"]}
999-multibots  | 2025-04-22 07:45:10 [INFO]: 🤖 Инициализация pulseBot: {"description":"PulseBot initialization","tokenLength":46}
999-multibots  | 2025-04-22 07:45:10 [INFO]: 🔄 Использован алиас режима {"description":"Mode alias used","originalMode":"neuro_photo_2","normalizedMode":"neuro_photo_v2"}
999-multibots  | Environment check: { nodeEnv: 'production' }
999-multibots  | Payment variables check:
999-multibots  | MERCHANT_LOGIN: neuroblogger
999-multibots  | PASSWORD1: [PROTECTED]
999-multibots  | RESULT_URL2: https://999-multibots-telegraf-u14194.vm.elestio.app/payment-success
999-multibots  | 2025-04-22 07:45:11 [INFO]: 🔄 Использован алиас режима {"description":"Mode alias used","originalMode":"neuro_photo_2","normalizedMode":"neuro_photo_v2"}
999-multibots  | 🏁 Запуск приложения
999-multibots  | 🔧 Режим работы: production
999-multibots  | 📝 Загружен файл окружения: production
999-multibots  | 🤖 Бот neuro_blogger_bot инициализирован
999-multibots  | 🔌 Используем порт 3001 для бота neuro_blogger_bot
999-multibots  | 🚀 Бот neuro_blogger_bot запущен в продакшен режиме на порту 3001
999-multibots  | 🤖 Бот MetaMuse_Manifest_bot инициализирован
999-multibots  | 🔌 Используем порт 3002 для бота MetaMuse_Manifest_bot
999-multibots  | 🚀 Бот MetaMuse_Manifest_bot запущен в продакшен режиме на порту 3002
999-multibots  | 🤖 Бот ZavaraBot инициализирован
999-multibots  | 🔌 Используем порт 3003 для бота ZavaraBot
999-multibots  | 🚀 Бот ZavaraBot запущен в продакшен режиме на порту 3003
999-multibots  | 🤖 Бот LeeSolarbot инициализирован
999-multibots  | 🔌 Используем порт 3004 для бота LeeSolarbot
999-multibots  | 🚀 Бот LeeSolarbot запущен в продакшен режиме на порту 3004
999-multibots  | 🤖 Бот NeuroLenaAssistant_bot инициализирован
999-multibots  | 🔌 Используем порт 3005 для бота NeuroLenaAssistant_bot
999-multibots  | 🚀 Бот NeuroLenaAssistant_bot запущен в продакшен режиме на порту 3005
999-multibots  | ❌ Ошибка валидации токена: 401: Unauthorized
999-multibots  | 🤖 Бот Gaia_Kamskaia_bot инициализирован
999-multibots  | 🔌 Используем порт 3006 для бота Gaia_Kamskaia_bot
999-multibots  | 🚀 Бот Gaia_Kamskaia_bot запущен в продакшен режиме на порту 3006
999-multibots  | [Robokassa] Failed to start webhook server: listen EADDRINUSE: address already in use :::2999
999-multibots  | ✅ Боты успешно запущены
999-multibots  | 🚀 Вебхук сервер запущен на порту 2999
999-multibots  | ✅ Зарегистрирован вебхук для бота MetaMuse_Manifest_bot на пути /telegraf/5b8ba177ba1aab7cc67834b211e4c31b84e10b381617dfe9e8636f069e5db394
999-multibots  | ✅ Зарегистрирован вебхук для бота neuro_blogger_bot на пути /telegraf/3991e899c2388ce7183615a24c6c3b0a9f36f4e54b53578d2a469a047e83074f
999-multibots  | ✅ Зарегистрирован вебхук для бота LeeSolarbot на пути /telegraf/abc3914b4be22e189c6144ce04dc45e9656a4077d9fa22f0465da6a82bd29543
999-multibots  | ✅ Зарегистрирован вебхук для бота ZavaraBot на пути /telegraf/f79b12d1a748e9a7cafe4043830e0a41a5b87545947d3f248e8c9e9c6075786f
999-multibots  | ✅ Зарегистрирован вебхук для бота Gaia_Kamskaia_bot на пути /telegraf/a0c1769324c81b94b654fbfa4712963f17db30162484198e06a560922163100c
999-multibots  | ✅ Зарегистрирован вебхук для бота NeuroLenaAssistant_bot на пути /telegraf/85b54880b470eb4b66923a009fc04c75253712595ce90690d17c8d326357a32b
999-multibots  | 📥 Входящий запрос: POST /telegraf/3991e899c2388ce7183615a24c6c3b0a9f36f4e54b53578d2a469a047e83074f
999-multibots  | 🔄 Получен вебхук для токена: 3991e8...
999-multibots  | {
999-multibots  |   "update_id": 116727044,
999-multibots  |   "message": {
999-multibots  |     "message_id": 84127,
999-multibots  |     "from": {
999-multibots  |       "id": 144022504,
999-multibots  |       "is_bot": false,
999-multibots  |       "first_name": "Dmitrii",
999-multibots  |       "last_name": "NeuroСoder",
999-multibots  |       "username": "neuro_sage",
999-multibots  |       "language_code": "ru"
999-multibots  |     },
999-multibots  |     "chat": {
999-multibots  |       "id": 144022504,
999-multibots  |       "first_name": "Dmitrii",
999-multibots  |       "last_name": "NeuroСoder",
999-multibots  |       "username": "neuro_sage",
999-multibots  |       "type": "private"
999-multibots  |     },
999-multibots  |     "date": 1745307973,
999-multibots  |     "text": "/start",
999-multibots  |     "entities": [
999-multibots  |       {
999-multibots  |         "offset": 0,
999-multibots  |         "length": 6,
999-multibots  |         "type": "bot_command"
999-multibots  |       }
999-multibots  |     ]
999-multibots  |   }
999-multibots  | }
999-multibots  | CASE bot.command: start
999-multibots  | CASE: getTranslation: start
bot-proxy      | 172.27.0.1 - - [22/Apr/2025:07:46:14 +0000] "POST /telegraf/3991e899c2388ce7183615a24c6c3b0a9f36f4e54b53578d2a469a047e83074f HTTP/1.1" 200 0 "-" "-" "91.108.5.21"
999-multibots  | 2025-04-22 07:46:14 [INFO]: 🎬 Отправка ссылки на туториал для neuro_blogger_bot {"tutorialUrl":"https://t.me/neuro_coder_ai/1212"}
bot-proxy      | 2025/04/22 07:49:25 [notice] 1#1: signal 3 (SIGQUIT) received, shutting down
bot-proxy      | 2025/04/22 07:49:25 [notice] 21#21: gracefully shutting down
bot-proxy      | 2025/04/22 07:49:25 [notice] 21#21: exiting
bot-proxy      | 2025/04/22 07:49:25 [notice] 22#22: gracefully shutting down
bot-proxy      | 2025/04/22 07:49:25 [notice] 21#21: exit
bot-proxy      | 2025/04/22 07:49:25 [notice] 22#22: exiting
bot-proxy      | 2025/04/22 07:49:25 [notice] 22#22: exit
bot-proxy      | 2025/04/22 07:49:25 [notice] 1#1: signal 17 (SIGCHLD) received from 21
bot-proxy      | 2025/04/22 07:49:25 [notice] 1#1: worker process 21 exited with code 0
bot-proxy      | 2025/04/22 07:49:25 [notice] 1#1: worker process 22 exited with code 0
bot-proxy      | 2025/04/22 07:49:25 [notice] 1#1: exit
bot-proxy exited with code 0
bot-proxy exited with code 0
999-multibots  | 🛑 Получен сигнал SIGTERM, завершаем работу...
999-multibots exited with code 0
