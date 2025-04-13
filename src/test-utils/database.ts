import { UserSubscription } from '@/interfaces/subscription.interface';
import mockApi from './core/mock';

// Вспомогательная функция для получения подписки пользователя
export const getUserSub = mockApi.create();

// Вспомогательная функция для проверки активности подписки
export const hasActiveSubscription = mockApi.create();

// Вспомогательная функция для создания подписки
export const createSubscription = mockApi.create();

// Вспомогательная функция для обновления подписки
export const updateSubscription = mockApi.create(); 