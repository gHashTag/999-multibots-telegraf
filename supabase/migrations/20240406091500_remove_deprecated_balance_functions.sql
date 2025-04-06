-- Удаляем устаревшие функции для работы с балансом
DROP FUNCTION IF EXISTS public.get_user_balance(p_telegram_id text, p_bot_name text);
DROP FUNCTION IF EXISTS public.update_user_balance(p_new_balance numeric, p_telegram_id text);

-- Добавляем комментарий о миграции
COMMENT ON SCHEMA public IS 'Removed deprecated balance functions in favor of using getUserBalance TypeScript function'; 