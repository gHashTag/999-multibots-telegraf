# Лучшие практики разработки

## Структура кода

### Организация файлов и директорий

1. **Организуйте код по функциональности, а не по типу файлов**
   ```
   src/
     ├── core/             # Общие компоненты и утилиты
     ├── payment/          # Функциональность платежей
     │   ├── services/     # Сервисы для работы с платежами
     │   ├── models/       # Модели данных для платежей
     │   └── controllers/  # Обработчики для платежей
     ├── bot/              # Функциональность Telegram бота
     │   ├── commands/     # Команды бота
     │   ├── scenes/       # Сцены для диалогов
     │   └── middleware/   # Middleware для бота
     └── database/         # Работа с базой данных
   ```

2. **Разделяйте бизнес-логику и инфраструктурный код**
   - Бизнес-логика должна быть независима от конкретных API и фреймворков
   - Используйте интерфейсы для инфраструктурных зависимостей

3. **Следуйте принципу единственной ответственности**
   - Каждый файл должен иметь только одну причину для изменения
   - Выделяйте отдельные компоненты для разных функций

### Именование

1. **Используйте описательные имена**
   - Функции: действие + объект (`createUser`, `processPayment`)
   - Переменные: объект + характеристика (`userBalance`, `paymentStatus`)
   - Классы/типы: существительное с заглавной буквы (`PaymentProcessor`)

2. **Соблюдайте стиль кода**
   - Для переменных и функций: camelCase
   - Для классов и типов: PascalCase
   - Для констант: UPPER_SNAKE_CASE

3. **Используйте префиксы для специальных категорий**
   - Интерфейсы: `IPaymentProcessor`
   - Типы: `TPaymentData`
   - Перечисления: `EPaymentStatus`

## Код

### Общие принципы

1. **Пишите маленькие функции**
   - Каждая функция должна делать что-то одно и делать это хорошо
   - Оптимальный размер: до 25 строк

2. **Избегайте глубокой вложенности**
   - Не более 2-3 уровней вложенности
   - Используйте ранний возврат для обработки ошибок
   ```typescript
   function processPayment(payment: Payment) {
     // Ранний возврат при ошибке
     if (!payment.valid) {
       return { success: false, error: 'Invalid payment' };
     }
     
     // Основная логика
     const result = performPayment(payment);
     return { success: true, data: result };
   }
   ```

3. **Избегайте дублирования кода**
   - Выделяйте общую логику в отдельные функции
   - Используйте утилитарные функции для повторяющихся операций

### Типизация TypeScript

1. **Используйте строгую типизацию**
   ```typescript
   // В tsconfig.json
   {
     "compilerOptions": {
       "strict": true,
       "noImplicitAny": true,
       "strictNullChecks": true
     }
   }
   ```

2. **Определяйте интерфейсы для структур данных**
   ```typescript
   interface Payment {
     id: string;
     amount: number;
     telegramId: string;
     type: PaymentType;
     status: PaymentStatus;
     createdAt: Date;
   }
   ```

3. **Используйте перечисления для фиксированных наборов значений**
   ```typescript
   enum PaymentStatus {
     PENDING = 'PENDING',
     COMPLETED = 'COMPLETED',
     FAILED = 'FAILED',
     CANCELLED = 'CANCELLED'
   }
   ```

4. **Используйте дженерики для повторного использования кода**
   ```typescript
   async function fetchData<T>(url: string): Promise<T> {
     const response = await fetch(url);
     return await response.json() as T;
   }
   
   const user = await fetchData<User>('/api/user');
   ```

### Обработка ошибок

1. **Используйте try-catch для асинхронного кода**
   ```typescript
   async function createUser(userData: UserData) {
     try {
       const user = await userService.create(userData);
       logger.info('✅ User created successfully', { userId: user.id });
       return user;
     } catch (error) {
       logger.error('❌ Error creating user', { error, userData });
       throw new UserCreationError('Failed to create user', { cause: error });
     }
   }
   ```

2. **Создавайте специализированные классы ошибок**
   ```typescript
   class PaymentError extends Error {
     constructor(message: string, public readonly code: string, options?: ErrorOptions) {
       super(message, options);
       this.name = 'PaymentError';
     }
   }
   ```

3. **Избегайте проглатывания ошибок**
   - Всегда логируйте ошибки
   - Передавайте ошибки верхним уровням или преобразуйте их в более понятные

## Асинхронный код

### Использование Promise

1. **Предпочитайте async/await вместо цепочек .then()**
   ```typescript
   // Хорошо
   async function getUser(id: string) {
     try {
       const user = await database.users.findById(id);
       const payments = await database.payments.findByUserId(id);
       return { user, payments };
     } catch (error) {
       logger.error('Error fetching user data', { error });
       throw error;
     }
   }
   
   // Избегайте
   function getUser(id: string) {
     return database.users.findById(id)
       .then(user => {
         return database.payments.findByUserId(id)
           .then(payments => {
             return { user, payments };
           });
       })
       .catch(error => {
         logger.error('Error fetching user data', { error });
         throw error;
       });
   }
   ```

2. **Используйте Promise.all для параллельного выполнения**
   ```typescript
   async function getUserProfile(id: string) {
     try {
       const [user, posts, followers] = await Promise.all([
         userService.getUser(id),
         postService.getUserPosts(id),
         followerService.getFollowers(id)
       ]);
       
       return { user, posts, followers };
     } catch (error) {
       logger.error('Error getting user profile', { error });
       throw error;
     }
   }
   ```

3. **Используйте Promise.allSettled для надежной обработки нескольких промисов**
   ```typescript
   async function notifyAllUsers(users: User[], message: string) {
     const results = await Promise.allSettled(
       users.map(user => notifyUser(user.id, message))
     );
     
     const successful = results.filter(r => r.status === 'fulfilled').length;
     const failed = results.filter(r => r.status === 'rejected').length;
     
     logger.info(`Notification sent to ${successful} users, failed for ${failed} users`);
     
     return { successful, failed };
   }
   ```

### Работа с событиями Inngest

1. **Используйте шаги для устойчивости и повторных попыток**
   ```typescript
   export const processPayment = inngest.createFunction(
     { name: 'Process Payment' },
     { event: 'payment/process' },
     async ({ event, step }) => {
       const { telegramId, amount, type } = event.data;
       
       // Получение пользователя (с автоматическими повторными попытками)
       const user = await step.run('get-user', async () => {
         return await userService.getUserByTelegramId(telegramId);
       });
       
       // Валидация платежа
       await step.run('validate-payment', async () => {
         if (type === 'money_expense' && user.balance < amount) {
           throw new InsufficientFundsError('Insufficient funds');
         }
       });
       
       // Выполнение платежа
       const payment = await step.run('execute-payment', async () => {
         return await paymentService.createPayment({
           telegramId,
           amount,
           type
         });
       });
       
       // Отправка уведомления
       await step.run('send-notification', async () => {
         return await notificationService.sendPaymentNotification(telegramId, payment);
       });
       
       return { paymentId: payment.id, status: 'completed' };
     }
   );
   ```

2. **Структурируйте данные событий с подробной информацией**
   ```typescript
   // Отправка события
   await inngest.send({
     name: 'user/registered',
     data: {
       telegramId: '123456789',
       username: 'john_doe',
       registeredAt: new Date().toISOString(),
       source: 'telegram',
       botName: 'neuro_blogger_bot',
       // Дополнительные метаданные для анализа
       metadata: {
         language: 'ru',
         platform: 'android',
         referredBy: '987654321'
       }
     }
   });
   ```

## Работа с базой данных

### Запросы Supabase

1. **Используйте типизацию для запросов**
   ```typescript
   interface Database {
     public: {
       Tables: {
         users: {
           Row: User;
           Insert: UserInsert;
           Update: UserUpdate;
         };
         payments: {
           Row: Payment;
           Insert: PaymentInsert;
           Update: PaymentUpdate;
         };
       };
     };
   }
   
   const supabase = createClient<Database>(
     process.env.SUPABASE_URL,
     process.env.SUPABASE_SERVICE_KEY
   );
   ```

2. **Оптимизируйте запросы, выбирая только нужные поля**
   ```typescript
   // Выбор только необходимых полей
   const { data, error } = await supabase
     .from('users')
     .select('id, telegram_id, username, created_at')
     .eq('telegram_id', telegramId);
   ```

3. **Используйте транзакции для атомарных операций**
   ```typescript
   async function transferFunds(fromId: string, toId: string, amount: number) {
     const { data, error } = await supabase.rpc('transfer_funds', {
       from_id: fromId,
       to_id: toId,
       amount: amount
     });
     
     if (error) throw error;
     return data;
   }
   ```

### Логирование

1. **Используйте структурированное логирование с эмодзи**
   ```typescript
   // Настройка логгера
   const logger = createLogger({
     format: format.combine(
       format.timestamp(),
       format.json()
     ),
     transports: [
       new transports.Console()
     ]
   });
   
   // Использование логгера
   logger.info('🚀 Starting payment processing', { 
     telegramId: '123456789',
     amount: 100,
     type: 'money_income'
   });
   
   try {
     // Обработка платежа
     const result = await processPayment(payment);
     logger.info('✅ Payment processed successfully', { 
       paymentId: result.id,
       status: result.status
     });
   } catch (error) {
     logger.error('❌ Payment processing failed', {
       error: error.message,
       stack: error.stack,
       telegramId: '123456789'
     });
   }
   ```

2. **Стандартизируйте использование эмодзи в логах**
   - ℹ️ Информационные логи
   - ✅ Успешные операции
   - ❌ Ошибки
   - 🚀 Начало операции
   - 🏁 Завершение
   - 🔍 Шаги валидации
   - ⚡ События Inngest
   - 🎯 Тестовые случаи
   - 🔄 Повторные попытки
   - 💾 Операции с данными

## Тестирование

### Структурирование тестов

1. **Следуйте паттерну AAA (Arrange-Act-Assert)**
   ```typescript
   async function testUserCreation(): Promise<TestResult> {
     try {
       // Arrange - подготовка тестовых данных
       const userData = {
         telegram_id: '123456789',
         username: 'test_user'
       };
       
       // Act - выполнение тестируемого действия
       const user = await createUser(userData);
       
       // Assert - проверка результатов
       if (!user) {
         throw new Error('User was not created');
       }
       
       if (user.telegram_id !== userData.telegram_id) {
         throw new Error('User has incorrect telegram_id');
       }
       
       return {
         success: true,
         name: 'testUserCreation',
         message: 'User created successfully'
       };
     } catch (error) {
       return {
         success: false,
         name: 'testUserCreation',
         message: error.message
       };
     }
   }
   ```

2. **Изолируйте тесты с помощью моков**
   ```typescript
   // Создание мока для Supabase
   const mockSupabase = {
     from: createMockFn().mockReturnValue({
       insert: createMockFn().mockReturnValue({
         select: createMockFn().mockResolvedValue({
           data: [{ id: 1, telegram_id: '123456789', username: 'test_user' }],
           error: null
         })
       })
     })
   };
   
   // Использование мока в тесте
   async function testUserCreationWithMock(): Promise<TestResult> {
     try {
       // Arrange
       const userData = {
         telegram_id: '123456789',
         username: 'test_user'
       };
       
       // Act
       const user = await createUserWithDatabase(userData, mockSupabase as any);
       
       // Assert
       // ... проверки ...
       
       // Verify mock was called with correct arguments
       const fromCalls = mockSupabase.from.mock.calls;
       if (fromCalls.length !== 1 || fromCalls[0][0] !== 'users') {
         throw new Error('Supabase.from was not called correctly');
       }
       
       return { success: true, name: 'testUserCreationWithMock', message: 'Success' };
     } catch (error) {
       return { success: false, name: 'testUserCreationWithMock', message: error.message };
     }
   }
   ```

3. **Используйте фабрики для создания тестовых данных**
   ```typescript
   // Фабрика тестовых данных
   class UserFactory {
     static create(overrides: Partial<User> = {}): User {
       return {
         id: randomId(),
         telegram_id: `${Date.now()}`,
         username: `user_${Date.now()}`,
         created_at: new Date(),
         ...overrides
       };
     }
     
     static createMany(count: number, overrides: Partial<User> = {}): User[] {
       return Array.from({ length: count }, () => this.create(overrides));
     }
   }
   ```

### Выполнение тестов

1. **Создавайте понятные отчеты о тестировании**
   ```typescript
   function formatTestResults(results: TestResult[]): string {
     const successful = results.filter(r => r.success).length;
     const failed = results.filter(r => !r.success);
     
     let report = `📊 Test Report: ${successful}/${results.length} passed\n\n`;
     
     if (failed.length > 0) {
       report += '❌ Failed tests:\n';
       failed.forEach(test => {
         report += `  - ${test.name}: ${test.message}\n`;
       });
     }
     
     return report;
   }
   ```

2. **Автоматизируйте запуск тестов**
   ```typescript
   async function runAllTests() {
     const results = await runTests([
       testUserCreation,
       testPaymentProcessing,
       testBalanceCalculation
     ]);
     
     const report = formatTestResults(results);
     console.log(report);
     
     // Отправка отчета администратору через Telegram
     if (process.env.ADMIN_TELEGRAM_ID) {
       await sendTelegramMessage(
         process.env.ADMIN_TELEGRAM_ID,
         `🧪 Test Results:\n\n${report}`
       );
     }
     
     return results;
   }
   ```