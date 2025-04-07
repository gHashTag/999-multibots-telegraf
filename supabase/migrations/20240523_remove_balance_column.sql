-- Миграция для удаления колонки balance из таблицы users
-- Сначала проверяем, что эта колонка существует
DO $$ 
BEGIN
   IF EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'users' 
      AND column_name = 'balance'
   ) THEN
      RAISE NOTICE 'Колонка balance существует в таблице users и будет удалена';
      
      -- Удаляем колонку balance из таблицы users
      ALTER TABLE public.users DROP COLUMN IF EXISTS balance;
      
      RAISE NOTICE 'Колонка balance успешно удалена из таблицы users';
   ELSE
      RAISE NOTICE 'Колонка balance не существует в таблице users';
   END IF;
END $$; 