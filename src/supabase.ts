import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY

let supabaseClient: any;

// Определяем, запущен ли код в тестовом окружении - улучшенная версия с дополнительными проверками
const isTestEnvironment = () => {
  return process.env.NODE_ENV === 'test' || 
         process.env.TEST === 'true' || 
         new Error().stack?.includes('test') || // проверка на любые тесты
         new Error().stack?.includes('simplest-test') || // проверка на наши легкие тесты
         // проверка на Jest удалена, так как Jest не используется
         process.env.RUNNING_IN_TEST_ENV === 'true'; // явное указание тестового окружения
}

// Логирование для отладки
if (isTestEnvironment()) {
  console.log('[TEST MODE] Using mock Supabase client');
}

// Для тестового окружения используем мок-клиент
if (isTestEnvironment()) {
  try {
    // Пытаемся импортировать наш расширенный мок для Supabase
    const { createSupabaseMock } = require('./test-utils/core/mock/supabaseMock.js');
    supabaseClient = createSupabaseMock();
    console.log('[TEST MODE] Successfully loaded enhanced Supabase mock');
  } catch (error) {
    console.log('[TEST MODE] Could not load enhanced mock, using basic mock instead:', error);
    
    // Создаем базовый мок-клиент для тестирования, если расширенный не доступен
    supabaseClient = {
      from: (tableName: string) => ({
        select: (columns?: string) => ({
          eq: (field: string, value: any) => ({
            single: () => Promise.resolve({ data: null, error: null }),
            order: (column: string, options?: { ascending?: boolean }) => ({
              limit: (limit: number) => Promise.resolve({ data: [], error: null })
            }),
            in: (values: any[]) => Promise.resolve({ data: [], error: null }),
          }),
          gte: (field: string, value: any) => ({
            lt: (field: string, value: any) => Promise.resolve({ data: [], error: null })
          }),
          or: (query: string) => ({
            eq: (field: string, value: any) => Promise.resolve({ data: [], error: null })
          }),
          order: (column: string, options?: { ascending?: boolean }) => ({
            limit: (limit: number) => Promise.resolve({ data: [], error: null })
          }),
          match: (params: Record<string, any>) => Promise.resolve({ data: [], error: null }),
          is: (field: string, value: any) => Promise.resolve({ data: [], error: null }),
          in: (field: string, values: any[]) => Promise.resolve({ data: [], error: null }),
          filter: (column: string, operator: string, value: any) => Promise.resolve({ data: [], error: null }),
        }),
        insert: (data: any, options?: { returning?: string }) => Promise.resolve({ data: null, error: null }),
        update: (data: any, options?: { returning?: string }) => ({
          eq: (field: string, value: any) => Promise.resolve({ data: null, error: null }),
          match: (params: Record<string, any>) => Promise.resolve({ data: null, error: null }),
        }),
        delete: (options?: { returning?: string }) => ({
          eq: (field: string, value: any) => Promise.resolve({ data: null, error: null }),
          match: (params: Record<string, any>) => Promise.resolve({ data: null, error: null }),
        }),
        upsert: (data: any, options?: { returning?: string; onConflict?: string }) => 
          Promise.resolve({ data: null, error: null })
      }),
      auth: {
        onAuthStateChange: (callback: Function) => ({ data: null, error: null, unsubscribe: () => {} }),
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        getUser: () => Promise.resolve({ data: { user: null }, error: null }),
        signOut: () => Promise.resolve({ error: null }),
        signInWithPassword: () => Promise.resolve({ data: null, error: null }),
      },
      storage: {
        from: (bucket: string) => ({
          upload: (path: string, file: any) => Promise.resolve({ data: null, error: null }),
          download: (path: string) => Promise.resolve({ data: null, error: null }),
          getPublicUrl: (path: string) => ({ data: { publicUrl: `https://test-storage/${path}` } }),
          list: (prefix: string) => Promise.resolve({ data: [], error: null }),
          remove: (paths: string[]) => Promise.resolve({ data: null, error: null }),
        })
      },
      rpc: (fn: string, params: any) => Promise.resolve({ data: null, error: null }),
      rest: {
        get: (url: string) => Promise.resolve({ data: null, error: null }),
        post: (url: string, data: any) => Promise.resolve({ data: null, error: null }),
        put: (url: string, data: any) => Promise.resolve({ data: null, error: null }),
        delete: (url: string) => Promise.resolve({ data: null, error: null }),
      }
    };
  }
} else {
  // Для не-тестовых окружений проверяем наличие учетных данных и используем реального клиента
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
  }
  
  supabaseClient = createClient(supabaseUrl, supabaseKey);
}

export const supabase = supabaseClient;
