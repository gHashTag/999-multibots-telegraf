/**
 * Улучшенный мок для Supabase, предназначен для использования в тестах
 * без подключения к реальной базе данных
 */

// Интерфейс пользователя для тестов
export interface MockUser {
  id: string;
  telegram_id: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  is_ru: boolean;
  bot_name?: string;
  balance: number;
  level?: number;
  subscription?: string | null;
  subscription_end_date?: string | null;
  settings?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// Интерфейс операции для тестов
export interface MockOperation {
  id: string;
  user_id: string;
  telegram_id?: string;
  amount: number;
  type: string;
  status: string;
  description?: string;
  bot_name?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// Хранилище данных для моков
class MockStorage {
  private users: MockUser[] = [];
  private operations: MockOperation[] = [];
  private balanceNotificationSettings: Record<string, { enabled: boolean; threshold: number }> = {};
  private mockedUserBalance: number | null = null;

  // Методы для управления пользователями
  async createUser(userData: Partial<MockUser>): Promise<MockUser> {
    const now = new Date().toISOString();
    const user: MockUser = {
      id: userData.id || `user_${Math.random().toString(36).substring(2, 11)}`,
      telegram_id: userData.telegram_id || `${Math.floor(Math.random() * 1000000000)}`,
      username: userData.username || 'test_user',
      first_name: userData.first_name || 'Test',
      last_name: userData.last_name || 'User',
      is_ru: userData.is_ru ?? true,
      bot_name: userData.bot_name || 'test_bot',
      balance: userData.balance ?? 1000,
      level: userData.level ?? 1,
      subscription: userData.subscription || null,
      subscription_end_date: userData.subscription_end_date || null,
      settings: userData.settings || {},
      created_at: userData.created_at || now,
      updated_at: userData.updated_at || now,
    };

    this.users.push(user);
    return { ...user };
  }

  async getUserByTelegramId(telegramId: string): Promise<MockUser | null> {
    const user = this.users.find(u => u.telegram_id === telegramId);
    return user ? { ...user } : null;
  }

  async getUserById(id: string): Promise<MockUser | null> {
    const user = this.users.find(u => u.id === id);
    return user ? { ...user } : null;
  }

  async updateUser(telegramId: string, updates: Partial<MockUser>): Promise<MockUser | null> {
    const userIndex = this.users.findIndex(u => u.telegram_id === telegramId);
    if (userIndex === -1) return null;

    const now = new Date().toISOString();
    this.users[userIndex] = {
      ...this.users[userIndex],
      ...updates,
      updated_at: now,
    };

    return { ...this.users[userIndex] };
  }

  async deleteUser(telegramId: string): Promise<boolean> {
    const userIndex = this.users.findIndex(u => u.telegram_id === telegramId);
    if (userIndex === -1) return false;

    this.users.splice(userIndex, 1);
    return true;
  }

  // Методы для управления операциями
  async createOperation(operationData: Partial<MockOperation>): Promise<MockOperation> {
    const now = new Date().toISOString();
    const operation: MockOperation = {
      id: operationData.id || `op_${Math.random().toString(36).substring(2, 11)}`,
      user_id: operationData.user_id || this.users[0]?.id || 'user_default',
      telegram_id: operationData.telegram_id || this.users[0]?.telegram_id || '123456789',
      amount: operationData.amount ?? 100,
      type: operationData.type || 'test_operation',
      status: operationData.status || 'completed',
      description: operationData.description || 'Test operation',
      bot_name: operationData.bot_name || 'test_bot',
      metadata: operationData.metadata || {},
      created_at: operationData.created_at || now,
      updated_at: operationData.updated_at || now,
    };

    this.operations.push(operation);
    return { ...operation };
  }

  async getOperationById(id: string): Promise<MockOperation | null> {
    const operation = this.operations.find(op => op.id === id);
    return operation ? { ...operation } : null;
  }

  async getOperationsByUserId(userId: string): Promise<MockOperation[]> {
    const operations = this.operations.filter(op => op.user_id === userId);
    return operations.map(op => ({ ...op }));
  }

  async updateOperation(id: string, updates: Partial<MockOperation>): Promise<MockOperation | null> {
    const opIndex = this.operations.findIndex(op => op.id === id);
    if (opIndex === -1) return null;

    const now = new Date().toISOString();
    this.operations[opIndex] = {
      ...this.operations[opIndex],
      ...updates,
      updated_at: now,
    };

    return { ...this.operations[opIndex] };
  }

  async deleteOperation(id: string): Promise<boolean> {
    const opIndex = this.operations.findIndex(op => op.id === id);
    if (opIndex === -1) return false;

    this.operations.splice(opIndex, 1);
    return true;
  }

  // Методы для работы с балансом
  async getUserBalance(telegramId: string): Promise<number> {
    // Возвращаем мокированное значение баланса, если оно установлено
    if (this.mockedUserBalance !== null) {
      return this.mockedUserBalance;
    }

    // Иначе берем баланс из объекта пользователя
    const user = await this.getUserByTelegramId(telegramId);
    return user?.balance ?? 0;
  }

  setUserBalance(balance: number): void {
    this.mockedUserBalance = balance;
  }

  // Методы для работы с настройками уведомлений о балансе
  async getUserBalanceNotificationSettings(telegramId: string): Promise<{ enabled: boolean; threshold: number }> {
    return this.balanceNotificationSettings[telegramId] || { enabled: true, threshold: 50 };
  }

  async updateUserBalanceNotificationSettings(
    telegramId: string,
    settings: { enabled: boolean; threshold: number }
  ): Promise<boolean> {
    this.balanceNotificationSettings[telegramId] = settings;
    return true;
  }

  // Сброс всех данных
  reset(): void {
    this.users = [];
    this.operations = [];
    this.balanceNotificationSettings = {};
    this.mockedUserBalance = null;
  }
}

// Создаем экземпляр хранилища
const mockStorage = new MockStorage();

// Экспортируем мок
export const mockSupabase = {
  // Пользователи
  createUser: mockStorage.createUser.bind(mockStorage),
  getUserByTelegramId: mockStorage.getUserByTelegramId.bind(mockStorage),
  getUserById: mockStorage.getUserById.bind(mockStorage),
  updateUser: mockStorage.updateUser.bind(mockStorage),
  deleteUser: mockStorage.deleteUser.bind(mockStorage),

  // Операции
  createOperation: mockStorage.createOperation.bind(mockStorage),
  getOperationById: mockStorage.getOperationById.bind(mockStorage),
  getOperationsByUserId: mockStorage.getOperationsByUserId.bind(mockStorage),
  updateOperation: mockStorage.updateOperation.bind(mockStorage),
  deleteOperation: mockStorage.deleteOperation.bind(mockStorage),

  // Баланс
  getUserBalance: mockStorage.getUserBalance.bind(mockStorage),
  setUserBalance: mockStorage.setUserBalance.bind(mockStorage),

  // Настройки уведомлений
  getUserBalanceNotificationSettings: mockStorage.getUserBalanceNotificationSettings.bind(mockStorage),
  updateUserBalanceNotificationSettings: mockStorage.updateUserBalanceNotificationSettings.bind(mockStorage),

  // Сброс
  reset: mockStorage.reset.bind(mockStorage),
};

// Типизированный экспорт
export default mockSupabase; 