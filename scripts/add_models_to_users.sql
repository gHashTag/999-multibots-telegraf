-- SQL функция для добавления моделей указанным пользователям
-- Модели: "Coco Age" и "Vyacheslav Nekludov"
-- Пользователи: 461758294, 289259562, 164609458, 752224685

CREATE OR REPLACE FUNCTION add_models_to_users()
RETURNS TABLE(
    inserted_count INTEGER,
    message TEXT
) 
LANGUAGE plpgsql
AS $$
DECLARE
    user_ids INTEGER[] := ARRAY[461758294, 289259562, 164609458, 752224685];
    user_id INTEGER;
    total_inserted INTEGER := 0;
    current_timestamp TIMESTAMP := NOW();
BEGIN
    -- Добавляем модель "Coco Age" для каждого пользователя
    FOREACH user_id IN ARRAY user_ids
    LOOP
        INSERT INTO model_trainings (
            telegram_id,
            model_name,
            trigger_word,
            zip_url,
            model_url,
            replicate_training_id,
            status,
            created_at,
            updated_at,
            error,
            steps,
            api,
            cancel_url,
            weights,
            bot_name,
            gender
        ) VALUES (
            user_id,
            'Coco Age',
            'MUSE_NATALY',
            'https://ai-server-u14194.vm.elestio.app/uploads/352374518/model/1753200057463-training_images_1753200054995.zip',
            'ghashtag/muse_nataly:d7aa70227518ba5c7e71a6ae7516d6d5d18157d09da8dbbb890af8522f5c0f90',
            '9expvj23x9rme0cr6bf8g2f8dg',
            'SUCCESS',
            current_timestamp,
            current_timestamp,
            NULL,
            2000,
            'replicate',
            'https://api.replicate.com/v1/predictions/9expvj23x9rme0cr6bf8g2f8dg/cancel',
            'https://replicate.delivery/xezq/1WUbkNH3Eb60EFPyfHMAcm4znOKifHHy8FsyQyLlgTuu2WDVA/trained_model.tar',
            'HaimGroupMedia_bot',
            'female'
        );
        
        total_inserted := total_inserted + 1;
    END LOOP;
    
    -- Добавляем модель "Vyacheslav Nekludov" для каждого пользователя  
    FOREACH user_id IN ARRAY user_ids
    LOOP
        INSERT INTO model_trainings (
            telegram_id,
            model_name,
            trigger_word,
            zip_url,
            model_url,
            replicate_training_id,
            status,
            created_at,
            updated_at,
            error,
            steps,
            api,
            cancel_url,
            weights,
            bot_name,
            gender
        ) VALUES (
            user_id,
            'Vyacheslav Nekludov',
            'MUSE_NATALY',
            'https://ai-server-u14194.vm.elestio.app/uploads/352374518/model/1753537610585-training_images_1753537608470.zip',
            'ghashtag/muse_nataly:bd4ec60ac9d0265d8bf56957399ce0ae45967bd6d17228a1d9dd31c8a96c9df9',
            'ychtnxxyrhrme0cr8vy91ppvgw',
            'SUCCESS',
            current_timestamp,
            current_timestamp,
            NULL,
            2000,
            'replicate',
            'https://api.replicate.com/v1/predictions/ychtnxxyrhrme0cr8vy91ppvgw/cancel',
            'https://replicate.delivery/xezq/DYTziGMFIVaEIxi66HfTRCFAu1d9R9Hxt8zwffuGBfbeXKloC/trained_model.tar',
            'HaimGroupMedia_bot',
            'male'
        );
        
        total_inserted := total_inserted + 1;
    END LOOP;
    
    RETURN QUERY SELECT 
        total_inserted,
        FORMAT('Successfully added %s model records for %s users', total_inserted, array_length(user_ids, 1));
        
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error adding models to users: %', SQLERRM;
END;
$$;

-- Комментарий для использования:
-- Выполните: SELECT * FROM add_models_to_users();
-- Это добавит 8 записей (2 модели × 4 пользователя) в таблицу model_trainings