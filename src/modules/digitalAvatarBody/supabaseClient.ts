import { supabase as globalSupabaseClient } from '@/core/supabase'

/**
 * Модуль-специфичный клиент Supabase для digitalAvatarBody.
 * Реэкспортирует глобальный клиент для обеспечения единой точки входа
 * и возможности будущей специфичной конфигурации или мокирования для модуля.
 */
export const supabase = globalSupabaseClient
