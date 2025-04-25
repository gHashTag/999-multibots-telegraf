.venv(base) ➜  999-multibots-telegraf git:(main) ✗ ssh -i ~/.ssh/id_rsa root@999-multibots-u14194.vm.elestio
<docker-compose down && docker-compose up --build -d'

 Container bot-proxy  Stopping
 Container bot-proxy  Stopped
 Container bot-proxy  Removing
 Container bot-proxy  Removed
 Container 999-multibots  Stopping
 Container 999-multibots  Stopped
 Container 999-multibots  Removing
 Container 999-multibots  Removed
 Network 999-multibots-telegraf_app-network  Removing
 Network 999-multibots-telegraf_app-network  Removed
#0 building with "default" instance using docker driver

#1 [app internal] load build definition from Dockerfile
#1 transferring dockerfile: 1.47kB done
#1 DONE 0.0s

#2 [app internal] load metadata for docker.io/library/node:20-alpine
#2 DONE 0.8s

#3 [app internal] load .dockerignore
#3 transferring context: 241B done
#3 DONE 0.0s

#4 [app builder 1/6] FROM docker.io/library/node:20-alpine@sha256:8bda036ddd59ea51a23bc1a1035d3b5c614e72c01366d989f4120e8adca196d4
#4 DONE 0.0s

#5 [app internal] load build context
#5 transferring context: 705.54kB 0.8s done
#5 DONE 0.8s

#6 [app builder 2/6] WORKDIR /app
#6 CACHED

#7 [app stage-1 7/8] RUN npm install --omit=dev
#7 CACHED

#8 [app builder 5/6] COPY . .
#8 CACHED

#9 [app builder 3/6] COPY package*.json ./
#9 CACHED

#10 [app stage-1 6/8] COPY package*.json ./
#10 CACHED

#11 [app stage-1 3/8] RUN apk add --no-cache     python3     py3-pip     openssh-client     sshpass     nginx
#11 CACHED

#12 [app builder 4/6] RUN npm install
#12 CACHED

#13 [app stage-1 5/8] RUN mkdir -p /app/.ssh && chmod 700 /app/.ssh && chown -R node:node /app/.ssh
#13 CACHED

#14 [app builder 6/6] RUN npm run build:nocheck
#14 CACHED

#15 [app stage-1 4/8] RUN python3 -m venv /app/ansible-venv     && . /app/ansible-venv/bin/activate     && pip install --no-cache-dir ansible
#15 CACHED

#16 [app stage-1 8/8] COPY --from=builder /app/dist ./dist
#16 CACHED

#17 [app] exporting to image
#17 exporting layers done
#17 writing image sha256:8b7dba364d97e1c289ffd9b04960c6216e02787e3870b6cc411a01d5572196cc done
#17 naming to docker.io/library/999-multibots-telegraf-app done
#17 DONE 0.0s
 Network 999-multibots-telegraf_app-network  Creating
 Network 999-multibots-telegraf_app-network  Created
 Container 999-multibots  Creating
 Container 999-multibots  Created
 Container bot-proxy  Creating
 Container bot-proxy  Created
 Container 999-multibots  Starting
 Container 999-multibots  Started
 Container bot-proxy  Starting
 Container bot-proxy  Started
.venv(base) ➜  999-multibots-telegraf git:(main) ✗ pnpm dev


> neuro-blogger-telegram-bot@0.0.1 dev /Users/playra/999-multibots-telegraf
> nodemon src/bot.ts

[nodemon] 2.0.22
[nodemon] to restart at any time, enter `rs`
[nodemon] watching path(s): src/**/*
[nodemon] watching extensions: ts,json
[nodemon] starting `npx ts-node -r tsconfig-paths/register src/bot.ts src/bot.ts`
┌───────────────────────────────────┐
│ New version of nodemon available! │
│ Current Version: 2.0.22           │
│ Latest Version: 3.1.9             │
└───────────────────────────────────┘
--- Debugging .env loading --- 
[CONFIG] Current Working Directory: /Users/playra/999-multibots-telegraf
[CONFIG] Attempting to load primary env file from: /Users/playra/999-multibots-telegraf/.env
[CONFIG] Successfully loaded and parsed primary .env file from /Users/playra/999-multibots-telegraf/.env
[CONFIG] isDev flag set to: true
[CONFIG] NODE_ENV is set to: development
--- End Debugging .env loading --- 
[CONFIG] Parsed ADMIN_IDS_ARRAY: [ 144022504, 1254048880, 352374518, 1852726961 ]
--- Bot Logic ---
[BOT] Detected mode (via isDev): development
[BOT] process.env.NODE_ENV: development
--- End Bot Logic Check ---
2025-04-22 14:50:00 [INFO]: 🤖 Инициализация defaultBot: {"description":"DefaultBot initialization","tokenLength":46}
2025-04-22 14:50:00 [INFO]: 🤖 Инициализация бота: {"description":"Bot initialization","bot_name":"ai_koshey_bot","tokenLength":46}
2025-04-22 14:50:00 [INFO]: 🤖 Инициализация бота: {"description":"Bot initialization","bot_name":"clip_maker_neuro_bot","tokenLength":46}
2025-04-22 14:50:00 [INFO]: 🌟 Инициализировано ботов: {"description":"Bots initialized","count":2,"bot_names":["neuro_blogger_bot","MetaMuse_Manifest_bot","ZavaraBot","LeeSolarbot","NeuroLenaAssistant_bot","NeurostylistShtogrina_bot","Gaia_Kamskaia_bot","ai_koshey_bot","clip_maker_neuro_bot"]}
2025-04-22 14:50:00 [INFO]: 🤖 Инициализация pulseBot: {"description":"PulseBot initialization","tokenLength":46}
2025-04-22 14:50:00 [INFO]: 🔄 Использован алиас режима {"description":"Mode alias used","originalMode":"neuro_photo_2","normalizedMode":"neuro_photo_v2"}
Environment check: { nodeEnv: 'development' }
Payment variables check:
MERCHANT_LOGIN: neuroblogger
ROBOKASSA_PASSWORD_1_TEST: [PROTECTED]
RESULT_URL2: https://999-multibots-telegraf-u14194.vm.elestio.app/payment-success
2025-04-22 14:50:01 [INFO]: 🔄 Использован алиас режима {"description":"Mode alias used","originalMode":"neuro_photo_2","normalizedMode":"neuro_photo_v2"}
🏁 Запуск приложения
🔧 Режим работы: development
📝 Загружен файл окружения: development
🔄 [SCENE_DEBUG] Проверка импорта stage из registerCommands...
(node:61452) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
✅ [SCENE_DEBUG] Stage импортирован успешно
📊 [SCENE_DEBUG] Количество обработчиков сцен: 0
🔧 Ищем тестового бота с username: ai_koshey_bot
✅ Найден бот ai_koshey_bot
🔄 [SCENE_DEBUG] Регистрация команд бота и stage middleware...
✅ [SCENE_DEBUG] Команды и middleware зарегистрированы
🤖 Тестовый бот ai_koshey_bot инициализирован
🚀 Тестовый бот ai_koshey_bot запущен в режиме разработки
[Robokassa] Failed to start webhook server: listen EADDRINUSE: address already in use :::2999
[Robokassa] Port 2999 is already in use. Maybe another instance is running?
🔍 Инициализация сцен...
📋 Регистрация сцены: payment_scene
✅ Все сцены успешно зарегистрированы
✅ Боты успешно запущены
CASE bot.command: start
CASE:createUserStep {
  id: 144022504,
  is_bot: false,
  first_name: 'Dmitrii',
  last_name: 'NeuroСoder',
  username: 'neuro_sage',
  language_code: 'ru'
}
botNameMatch null
botName 
startNumber 
CASE: 🔄 Команда /start. botInfo.username: ai_koshey_bot
ctx.message.text /start
parts [ '/start' ]
CASE: ctx.session.inviteCode not exists
2025-04-22 14:50:08 [INFO]: 📢 [CreateUserScene] Уведомление о новом пользователе (без реферала) отправлено в канал {"telegramId":"144022504","channel":"@neuro_blogger_pulse","step":"admin_notification_sent_no_referral"}
2025-04-22 14:50:08 [INFO]: Попытка создания/обновления пользователя (upsert) {"telegramId":"144022504","username":"neuro_sage","inviter":null,"function":"createUser"}
2025-04-22 14:50:09 [ERROR]: Ошибка при создании/обновлении пользователя (upsert) {"telegramId":"144022504","username":"neuro_sage","error":"duplicate key value violates unique constraint \"users_username_key\"","details":"Key (username)=(neuro_sage) already exists.","hint":null,"code":"23505","function":"createUser"}
2025-04-22 14:50:09 [INFO]: Пользователь уже существует, upsert вызвал ошибку конфликта (23505) {"telegramId":"144022504","username":"neuro_sage","function":"createUser"}
2025-04-22 14:50:10 [INFO]: 🚀 [StartScene] Начало работы с ботом {"telegramId":"144022504","function":"startScene","username":"neuro_sage","language":"ru","sessionData":"{\"mode\":\"start_scene\",\"prompt\":\"\",\"selectedModel\":\"\",\"userModel\":{\"model_name\":\"\",\"trigger_word\":\"\",\"model_url\":\"placeholder/placeholder:placeholder\",\"finetune_id\":\"\"},\"targetUserId\":0,\"steps\":0,\"selectedSize\":\"\",\"subscription\":\"stars\",\"selectedPayment\":{\"amount\":0,\"stars\":0,\"subscription\":\"stars\",\"type\":\"system\"},\"videoUrl\":\"\",\"imageUrl\":\"\",\"audioUrl\":\"\",\"email\":\"\",\"cursor\":0,\"images\":[],\"memory\":{\"messages\":[]},\"attempts\":0,\"amount\":0,\"modelName\":\"\",\"triggerWord\":\"\",\"videoModel\":\"\",\"translations\":[],\"buttons\":[],\"neuroPhotoInitialized\":false,\"__scenes\":{\"current\":\"start_scene\",\"state\":{},\"cursor\":0},\"inviteCode\":\"\"}"}
2025-04-22 14:50:10 [INFO]: 👤 [StartScene] Проверка существования пользователя {"telegramId":"144022504","function":"startScene","step":"checking_user_existence"}
2025-04-22 14:50:10 [INFO]: [getUserDetailsSubscription v3.0 Start] Запрос деталей для User: 144022504 {"telegramId":"144022504"}
2025-04-22 14:50:10 [INFO]: 🔍 Получение баланса пользователя из БД: {"description":"Getting user balance from database","telegram_id":"144022504"}
2025-04-22 14:50:10 [INFO]: ✅ Баланс пользователя получен и кэширован: {"description":"User balance retrieved and cached","telegram_id":"144022504","stars":12043.24}
2025-04-22 14:50:10 [INFO]: [getUserDetailsSubscription v3.0 Step 1 OK] Баланс для User: 144022504: 12043.24 {"telegramId":"144022504"}
2025-04-22 14:50:10 [INFO]: [getUserDetailsSubscription v3.0 Step 2 OK] Пользователь 144022504 найден в таблице users. {"telegramId":"144022504"}
2025-04-22 14:50:10 [INFO]: [getUserDetailsSubscription v3.0 Step 3 OK] Проверка подписки User: 144022504 {"isActive":true,"type":"neurobase","paymentDate":"2025-04-21T10:56:39.836731+00:00","expirationDate":"2025-05-21T10:56:39.836Z"}
2025-04-22 14:50:10 [INFO]: [getUserDetailsSubscription v3.0 Finish] Детали пользователя 144022504 успешно собраны. {"details":{"stars":12043.24,"subscriptionType":"NEUROBASE","isSubscriptionActive":true,"isExist":true,"subscriptionStartDate":"2025-04-21T10:56:39.836731+00:00"}}
2025-04-22 14:50:10 [INFO]: 🚩 [StartScene] Статус пользователя: СУЩЕСТВУЮЩИЙ {"telegramId":"144022504","isNewUser":false,"function":"startScene","step":"user_status_determined"}
2025-04-22 14:50:10 [INFO]: ✅ [StartScene] Пользователь уже существует {"telegramId":"144022504","function":"startScene","userDetails":{"stars":12043.24,"subscriptionType":"NEUROBASE","isSubscriptionActive":true,"isExist":true,"subscriptionStartDate":"2025-04-21T10:56:39.836731+00:00"},"step":"user_exists"}
2025-04-22 14:50:10 [INFO]: Попытка создания/обновления пользователя (upsert) {"username":"neuro_sage","function":"createUser"}
2025-04-22 14:50:11 [ERROR]: Ошибка при создании/обновлении пользователя (upsert) {"username":"neuro_sage","error":"duplicate key value violates unique constraint \"users_username_key\"","details":"Key (username)=(neuro_sage) already exists.","hint":null,"code":"23505","function":"createUser"}
2025-04-22 14:50:11 [INFO]: Пользователь уже существует, upsert вызвал ошибку конфликта (23505) {"username":"neuro_sage","function":"createUser"}
2025-04-22 14:50:11 [ERROR]: Ошибка при получении данных существующего пользователя после конфликта upsert {"error":"invalid input syntax for type bigint: \"undefined\"","function":"createUser"}
2025-04-22 14:50:11 [ERROR]: ❌ [StartScene] Ошибка при обновлении данных существующего пользователя {"telegramId":"144022504","error":"[object Object]","function":"startScene","step":"user_data_update_error"}
2025-04-22 14:50:11 [INFO]: 📡 [StartScene] Получение перевода для стартового сообщения (существующий пользователь) {"telegramId":"144022504","function":"startScene","bot_name":"ai_koshey_bot","step":"fetching_translation_existing"}
CASE: getTranslation: start
2025-04-22 14:50:11 [INFO]: ✅ [StartScene] Перевод получен {"telegramId":"144022504","function":"startScene","translationReceived":true,"imageUrlReceived":true,"step":"translation_received"}
2025-04-22 14:50:11 [INFO]: 🖼️ [StartScene] Отправка приветственного изображения с подписью {"telegramId":"144022504","function":"startScene","url":"https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/landingpage/avatars/neuro_blogger_bot/flux_pro.jpeg","step":"sending_welcome_image"}
2025-04-22 14:50:12 [INFO]: 🎬 [StartScene] Отправка ссылки на туториал для ai_koshey_bot {"telegramId":"144022504","function":"startScene","tutorialUrl":"https://t.me/neuro_coder_ai/1212","step":"sending_tutorial"}
2025-04-22 14:50:12 [INFO]: 📤 [StartScene] Отправка текста с туториалом и клавиатурой {"telegramId":"144022504","function":"startScene","step":"sending_tutorial_text_with_keyboard","buttons":["💫 Оформить подписку","💬 Техподдержка"]}
2025-04-22 14:50:12 [INFO]: 🚪 [StartScene] Вход в главное меню для существующего пользователя {"telegramId":"144022504","function":"startScene","step":"enter_main_menu"}
CASE 📲: menuCommand
💻 CASE: mainMenu
message 🏠 Главное меню
Выберите нужный раздел 👇
