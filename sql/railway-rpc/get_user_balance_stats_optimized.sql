-- =============================================================================
--  get_user_balance_stats_optimized(
--      p_telegram_id        bigint,
--      p_bot_name           text DEFAULT NULL,
--      p_limit_services     int  DEFAULT 10,
--      p_limit_transactions int  DEFAULT 5
--  ) -> json
--
--  Порт функции из облачного Supabase в Railway Postgres (Postgres-NFrq).
-- =============================================================================
--
--  ЧИТАТЬ ЦЕЛИКОМ ПЕРЕД ТЕМ, КАК «ПОПРАВИТЬ» ФОРМУЛУ БАЛАНСА.
--
--  В этой функции есть КОСЯК (REFUND и MONEY_OUTCOME/BONUS не учитываются в
--  current_balance). Косяк воспроизведён НАМЕРЕННО и побайтово. Задача этого
--  файла — перенести поведение, а не исправить его. Правка формулы здесь без
--  синхронной правки get_user_balance() разведёт две функции ещё дальше и
--  сделает расхождение невоспроизводимым. См. раздел «РАСХОЖДЕНИЕ».
--
-- -----------------------------------------------------------------------------
--  ОТКУДА ВЗЯТО ТЕЛО
-- -----------------------------------------------------------------------------
--
--  В отличие от get_user_balance и get_user_balance_stats, здесь тело-кандидат
--  ЕСТЬ в репозитории: sql/balance_functions_part1.sql (ноябрь 2025). Файл
--  старый, живую функцию с тех пор могли править прямо в SQL-редакторе
--  Supabase, поэтому файл НЕ принят на веру, а проверен как гипотеза.
--
--  Метод: облачный RPC через PostgREST — оракул; тело из репозитория,
--  установленное на Railway, — проверяемая гипотеза; payments_v2 — данные.
--
--  ПРЕДВАРИТЕЛЬНО ПРОВЕРЕНО, ЧТО ДАННЫЕ СОВПАДАЮТ. Все 17139 строк payments_v2
--  выкачаны из облака постранично через PostgREST по колонкам, которые читает
--  эта функция (id, telegram_id, payment_date, amount, stars, currency, status,
--  type, service_type, bot_name, payment_method, description, category), и
--  сравнены со строками Railway после нормализации JSON. Расхождений НОЛЬ,
--  лишних строк с обеих сторон НОЛЬ (17139 = 17139). Значит любое несовпадение
--  ответа — это формула, а не данные.
--
-- -----------------------------------------------------------------------------
--  ЧТО ИЗМЕРЕНО (2666 сравнений, 0 расхождений по существу)
-- -----------------------------------------------------------------------------
--
--  1. ВСЕ 629 различных telegram_id из payments_v2, вызов без limit-ов
--     (`{"p_telegram_id": N}`):                      629 / 629 совпали.
--
--  2. ВСЕ 759 пар (telegram_id, bot_name), какие есть в payments_v2,
--     вызов с p_bot_name:                            759 / 759 совпали.
--
--  3. ВСЕ 629 плательщиков с p_limit_services=3, p_limit_transactions=2
--     (проверка усечения списков):                   629 / 629, из них 1 —
--     перестановка внутри ничьей, см. п.«НИЧЬИ» ниже.
--
--  4. ВСЕ 629 плательщиков с p_limit_services=NULL, p_limit_transactions=NULL
--     (LIMIT NULL = без ограничения; у одного пользователя выдаётся 3163
--     элемента recent_expenses и 202 recent_topups — то есть сверены ВСЕ
--     строки, а не первые пять):                     629 / 629 совпали.
--
--  5. 20 точечных краевых случаев (см. «КРАЕВЫЕ»):   20 / 20 совпали.
--
--  Сравнение — не по «примерно равно», а по полному JSON после нормализации
--  (сортировка ключей; числа парсятся одинаково с обеих сторон).
--
-- -----------------------------------------------------------------------------
--  НИЧЬИ — ЕДИНСТВЕННЫЙ ИСТОЧНИК НЕДЕТЕРМИНИЗМА
-- -----------------------------------------------------------------------------
--
--  `ORDER BY total_stars DESC` в services_breakdown не имеет добивочного ключа.
--  Если у двух service_type ровно одинаковая сумма звёзд, порядок между ними
--  не определён — и он ПЛАВАЕТ в самом облаке, а не только между облаком и
--  портом. Зафиксировано прямым наблюдением:
--
--    telegram_id 184157003: image_to_video = 430.00 и Unknown = 430.00.
--    Один вызов облака вернул их в одном порядке, следующий — в другом.
--
--    telegram_id 409972991 при p_limit_services=3: text_to_image = 136.00 и
--    payment_operation = 136.00, в срез из трёх попадает то один, то другой.
--
--  Добивочный ключ (например `ORDER BY total_stars DESC, service_display_name`)
--  СОЗНАТЕЛЬНО НЕ ДОБАВЛЕН: он сделал бы порт детерминированнее оригинала и
--  тем самым отличным от него. Если детерминизм нужен — это отдельное решение
--  продукта, принимать его надо для облака и порта одновременно.
--
-- -----------------------------------------------------------------------------
--  DEFAULT-Ы: ПОДТВЕРЖДЕНЫ ЗАМЕРОМ, А НЕ ВЗЯТЫ ИЗ ФАЙЛА
-- -----------------------------------------------------------------------------
--
--  OpenAPI-спека PostgREST помечает p_limit_services и p_limit_transactions
--  просто как необязательные и НЕ показывает значения по умолчанию. Значения
--  сняты поведением на пользователе 144022504 (у него 12 различных
--  service_type и 3163 расхода — то есть все три варианта различимы):
--
--    {"p_telegram_id":144022504}                                -> services 10, topups 5, expenses 5
--    {"p_telegram_id":144022504,"p_limit_services":10,
--     "p_limit_transactions":5}                                 -> ИДЕНТИЧНЫЙ JSON (побайтово)
--    {"p_telegram_id":144022504,"p_limit_services":12,
--     "p_limit_transactions":50}                                -> services 12, topups 50, expenses 50
--
--  Первый и второй совпали, первый и третий — нет. Значит умолчания именно
--  10 и 5, а не «без ограничения». Дополнительно:
--    p_limit_* = NULL  -> LIMIT NULL, ограничения нет (services 12, expenses 3163);
--    p_limit_* = 0     -> пустые массивы [];
--    p_limit_services = -1 -> ошибка SQLSTATE 2201W "LIMIT must not be negative",
--                             одинаковая в облаке и в порте. Причём облако падает
--                             именно на выборке сервисов — значит порядок
--                             операторов в теле такой же, как здесь.
--
-- -----------------------------------------------------------------------------
--  РАСХОЖДЕНИЕ С get_user_balance() — ЭТО НЕ ОПЕЧАТКА, ЭТО ФАКТ
-- -----------------------------------------------------------------------------
--
--  current_balance здесь считается как
--      MONEY_INCOME/REAL + MONEY_INCOME/BONUS - MONEY_OUTCOME/REAL
--  и НЕ учитывает ни REFUND, ни MONEY_OUTCOME/BONUS.
--
--  get_user_balance() (см. sql/railway-rpc/get_user_balance.sql) считает
--      SUM(MONEY_INCOME + REFUND - MONEY_OUTCOME)   без разбора category.
--
--  ПРОВЕРЕНО, ЧТО ТАК ЖЕ ВЕДЁТ СЕБЯ ЖИВОЕ ОБЛАКО, а не только файл из репо.
--  Обе облачные функции прозвонены по всем 629 плательщикам. Разошлись 12
--  человек, и для КАЖДОГО из двенадцати разница ровно равна
--      SUM(stars) FILTER (REFUND, COMPLETED)
--    - SUM(stars) FILTER (MONEY_OUTCOME, category=BONUS, COMPLETED)
--
--    telegram_id   get_user_balance   ..._stats_optimized      дельта
--    ------------  -----------------  ---------------------  ----------
--    89962285              -176.86              -626.86        +450.00   (REFUND)
--    144022504      195848267.69         195847917.69          +350.00   (REFUND)
--    352374518            46591.14             46302.09        +289.05   (REFUND)
--    435572800           108860.80            108752.99        +107.81   (REFUND)
--    409972991            -4994.00             -4904.00         -90.00   (MONEY_OUTCOME/BONUS)
--    411128512            39879.73             39804.73         +75.00   (REFUND)
--    171606410            14983.83             14945.40         +38.43   (REFUND)
--    1374279961             135.26               105.26         +30.00   (REFUND)
--    6419070693           17069.17             17046.69         +22.48   (REFUND)
--    2086031075            7761.75              7744.89         +16.86   (REFUND)
--    704993799             1093.07              1084.64          +8.43   (REFUND)
--    7669741878           36714.19             36708.57          +5.62   (REFUND)
--
--  Совпало ровно с предсказанием по данным: тех же 12 telegram_id, те же 12
--  чисел, ни одного лишнего. Итого в проде ДВЕ разные «правды» о балансе, и
--  экран статистики показывает не то, что показывает основной баланс.
--  Это дефект продукта, а не миграции. Заводить отдельной задачей.
--
--  Побочный эффект того же перекоса, тоже воспроизведён намеренно:
--  services_breakdown и recent_expenses берут ВЕСЬ MONEY_OUTCOME (обе
--  категории), а знаменатель процентов v_total_outcome — только REAL. У
--  telegram_id 409972991 сумма total_stars по сервисам = 4996.00 при
--  total_outcome = 4906.00, и сумма percentage = 101.9 %.
--
--  Строка type='BONUS' игнорируют ОБЕ функции одинаково: у telegram_id
--  289259562 есть BONUS/REAL/COMPLETED на 10000.00 звёзд, и обе дают 159105.00
--  (= 100000 + 60000 - 895). Здесь расхождения нет.
--
-- -----------------------------------------------------------------------------
--  КРАЕВЫЕ СЛУЧАИ — ВСЕ СОВПАЛИ С ОБЛАКОМ
-- -----------------------------------------------------------------------------
--
--  * Нет платежей вообще (telegram_id 1744064537268, 0, -1) — не NULL и не
--    ошибка, а полный объект с нулями и пустыми массивами:
--    {"current_balance":0.00, ..., "services_breakdown":[], "recent_topups":[],
--     "recent_expenses":[]}. За это отвечают COALESCE(...,'[]'::JSON).
--  * p_telegram_id = NULL — то же самое, нули и пустые массивы, без ошибки.
--  * p_bot_name = NULL явно и p_bot_name опущен — идентичны.
--  * p_bot_name, которого нет ('no_such_bot_xyz', '') — нули и пустые массивы.
--  * Только PENDING-строки (738546690, 257999602) — нули: status='COMPLETED'
--    отсекает всё. В базе 208 PENDING и 16931 COMPLETED.
--  * Больше service_type, чем p_limit_services (144022504: 12 сервисов) —
--    усечение до limit-а, порядок по убыванию total_stars.
--  * Пользователь с REFUND (89962285: 60 строк REFUND/BONUS на 450.00) —
--    в балансе НЕ учтены, но в total_transactions УЧТЕНЫ (177 = 3+114+60).
--  * Пользователь с MONEY_OUTCOME/BONUS (409972991) — в total_outcome НЕ
--    учтены (4906.00 вместо 4996.00), в total_transactions учтены (188), в
--    recent_expenses учтены (187 строк при снятом лимите, а REAL-их 184).
--  * Пользователь со строкой type='BONUS' (289259562) — 10000.00 не попали ни
--    в total_real_income, ни в total_bonus_income, но попали в
--    total_transactions (7).
--
--  Разбивка payment_methods проверена на различающих строках:
--    rubles = currency='RUB' AND payment_method IN ('Robokassa','Manual')
--      + 238415691 (RUB/Manual)      -> учтён:     {"stars":1303.00,"amount":2999.00,"count":1}
--      + 1076720055 (RUB/Robokassa)  -> учтён, а его же строка XTR/Manual на
--                                       15625.00 НЕ учтена (фильтр по currency работает)
--      - 750275943 (RUB/Telegram, 2 строки, 2606.00) -> НЕ учтён: rubles = 0/0/0
--      - 36 человек с RUB и payment_method IS NULL   -> НЕ учтены даже в count
--    telegram_stars = currency IN ('XTR','STARS') AND payment_method='Telegram'
--      + 144022504: telegram_stars {"stars":45.00,"count":9} при
--        total_real_income 195840589.33 — то есть 195830377.19 звёзд по
--        STARS/System в разбивку НЕ попали (фильтр по payment_method работает).
--
-- -----------------------------------------------------------------------------
--  ЧТО ПРОВЕРИТЬ НЕЛЬЗЯ (честно, а не «наверное, так же»)
-- -----------------------------------------------------------------------------
--
--  1. Элемент 'STARS' в списке currency IN ('XTR','STARS') для telegram_stars
--     НЕ ПРОВЕРЕН: в данных нет ни одной строки currency='STARS' И
--     payment_method='Telegram'. Убрать его или оставить — на этих данных
--     неразличимо. Оставлен как в файле репозитория.
--  2. Списки payment_method проверены только на встречающихся значениях
--     (Robokassa, Manual, Telegram, System, SYSTEM, Admin, admin_topup,
--     admin_special_topup, balance, image-to-video-refund,
--     video-generation-refund, System Compensation, Refund, NULL). Если в
--     живой функции в IN-списке есть ещё какое-то значение, которого нет в
--     данных, замер его не увидит.
--  3. status='COMPLETED' против «status <> 'PENDING'» неразличимо: строк
--     status='FAILED' в базе НОЛЬ (есть только PENDING 208 и COMPLETED 16931).
--  4. Типы SUBSCRIPTION_PURCHASE, SUBSCRIPTION_RENEWAL, REFERRAL, SYSTEM
--     существуют в enum operation_type, но строк с ними НЕТ. Как их считает
--     живая функция — не установлено.
--  5. Коллизия COALESCE(service_type,'Unknown') с буквальным service_type =
--     'Unknown' не проверена: строк с текстом 'Unknown' в базе НОЛЬ (все 684
--     «Unknown» — это NULL). Если такие строки появятся, GROUP BY service_type
--     даст ДВА элемента с одинаковой подписью "Unknown". Поведение
--     унаследовано из оригинала, не исправлено.
--  6. Не наблюдаемо через PostgREST и потому взято из файла репозитория как
--     есть: LANGUAGE plpgsql, STABLE, отсутствие SECURITY DEFINER, значение
--     search_path, GRANT-ы, COMMENT. Поведенчески эти атрибуты на замерах не
--     проявляются.
--  7. Отличие от файла репозитория, внесённое сознательно: имя таблицы
--     квалифицировано как public.payments_v2, а функция создаётся в схеме
--     public. На Railway payments_v2 есть только в public, поэтому на
--     результат это не влияет; это защита от подмены search_path.
--
--  ИТОГ: тело из sql/balance_functions_part1.sql признано СОВПАДАЮЩИМ с живой
--  облачной функцией. Логических расхождений не найдено ни одного.
--
-- -----------------------------------------------------------------------------
--  ЗАВИСИМОСТИ
-- -----------------------------------------------------------------------------
--
--  Таблица public.payments_v2 и типы operation_type, payment_status,
--  simple_transaction_category уже существуют на Railway (Postgres-NFrq),
--  поэтому здесь НИЧЕГО не создаётся и не удаляется, кроме самой функции.
--
--  Рекомендуемые индексы (не обязательны для корректности, только скорость;
--  на 17k строк выигрыш заметен при массовом прозвоне):
--    CREATE INDEX IF NOT EXISTS idx_payments_v2_telegram_id
--      ON public.payments_v2 (telegram_id);
--    CREATE INDEX IF NOT EXISTS idx_payments_v2_tg_status_type
--      ON public.payments_v2 (telegram_id, status, type);
--
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_user_balance_stats_optimized(
    p_telegram_id BIGINT,
    p_bot_name TEXT DEFAULT NULL,
    p_limit_services INT DEFAULT 10,
    p_limit_transactions INT DEFAULT 5
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
    v_result JSON;
    v_current_balance NUMERIC;
    v_total_real_income NUMERIC;
    v_total_bonus_income NUMERIC;
    v_total_outcome NUMERIC;
    v_total_transactions INT;
    v_rubles_income RECORD;
    v_telegram_stars_income RECORD;
    v_services_stats JSON;
    v_recent_topups JSON;
    v_recent_expenses JSON;
BEGIN
    -- Основные суммы одним проходом.
    -- ВНИМАНИЕ: total_transactions считает ВСЕ COMPLETED-строки, включая
    -- REFUND, MONEY_OUTCOME/BONUS и type='BONUS', которые в баланс не входят.
    SELECT
        COALESCE(SUM(stars) FILTER (WHERE type = 'MONEY_INCOME' AND category = 'REAL'), 0) AS total_real_income,
        COALESCE(SUM(stars) FILTER (WHERE type = 'MONEY_INCOME' AND category = 'BONUS'), 0) AS total_bonus_income,
        COALESCE(SUM(stars) FILTER (WHERE type = 'MONEY_OUTCOME' AND category = 'REAL'), 0) AS total_outcome,
        COUNT(*) AS total_transactions
    INTO
        v_total_real_income,
        v_total_bonus_income,
        v_total_outcome,
        v_total_transactions
    FROM public.payments_v2
    WHERE
        telegram_id = p_telegram_id
        AND status = 'COMPLETED'
        AND (p_bot_name IS NULL OR bot_name = p_bot_name);

    -- НЕ ТРОГАТЬ БЕЗ get_user_balance(): REFUND и MONEY_OUTCOME/BONUS здесь
    -- намеренно проигнорированы — так считает живое облако. См. шапку файла.
    v_current_balance := v_total_real_income + v_total_bonus_income - v_total_outcome;

    -- Разбивка по рублям.
    SELECT
        COALESCE(SUM(stars), 0) AS stars,
        COALESCE(SUM(amount), 0) AS amount,
        COUNT(*) AS count
    INTO v_rubles_income
    FROM public.payments_v2
    WHERE
        telegram_id = p_telegram_id
        AND status = 'COMPLETED'
        AND type = 'MONEY_INCOME'
        AND category = 'REAL'
        AND currency = 'RUB'
        AND payment_method IN ('Robokassa', 'Manual')
        AND (p_bot_name IS NULL OR bot_name = p_bot_name);

    -- Разбивка по Telegram Stars.
    SELECT
        COALESCE(SUM(stars), 0) AS stars,
        COUNT(*) AS count
    INTO v_telegram_stars_income
    FROM public.payments_v2
    WHERE
        telegram_id = p_telegram_id
        AND status = 'COMPLETED'
        AND type = 'MONEY_INCOME'
        AND category = 'REAL'
        AND currency IN ('XTR', 'STARS')
        AND payment_method = 'Telegram'
        AND (p_bot_name IS NULL OR bot_name = p_bot_name);

    -- Статистика по сервисам.
    -- Здесь берётся ВЕСЬ MONEY_OUTCOME (обе категории), а знаменатель
    -- процентов — только REAL. Отсюда суммы percentage > 100 %. Так в облаке.
    -- ORDER BY без добивочного ключа: при равных total_stars порядок не
    -- определён и плавает в самом облаке — добивочный ключ НЕ добавлять.
    WITH service_stats AS (
        SELECT
            COALESCE(service_type, 'Unknown') AS service_display_name,
            COUNT(*) AS transaction_count,
            SUM(stars) AS total_stars,
            AVG(stars) AS avg_stars,
            MAX(payment_date) AS last_used
        FROM public.payments_v2
        WHERE
            telegram_id = p_telegram_id
            AND status = 'COMPLETED'
            AND type = 'MONEY_OUTCOME'
            AND (p_bot_name IS NULL OR bot_name = p_bot_name)
        GROUP BY service_type
        ORDER BY total_stars DESC
        LIMIT p_limit_services
    )
    SELECT json_agg(
        json_build_object(
            'service', service_display_name,
            'count', transaction_count,
            'total_stars', ROUND(total_stars::NUMERIC, 2),
            'avg_stars', ROUND(avg_stars::NUMERIC, 2),
            'percentage', CASE
                WHEN v_total_outcome > 0
                THEN ROUND((total_stars / v_total_outcome * 100)::NUMERIC, 1)
                ELSE 0
            END,
            'last_used', last_used
        )
    ) INTO v_services_stats
    FROM service_stats;

    -- Последние пополнения (только MONEY_INCOME/REAL; BONUS-пополнения сюда
    -- не попадают — проверено на telegram_id 289259562).
    WITH recent_topups AS (
        SELECT
            payment_date,
            stars,
            amount,
            currency,
            payment_method,
            description
        FROM public.payments_v2
        WHERE
            telegram_id = p_telegram_id
            AND status = 'COMPLETED'
            AND type = 'MONEY_INCOME'
            AND category = 'REAL'
            AND (p_bot_name IS NULL OR bot_name = p_bot_name)
        ORDER BY payment_date DESC
        LIMIT p_limit_transactions
    )
    SELECT json_agg(
        json_build_object(
            'date', payment_date,
            'stars', ROUND(stars::NUMERIC, 2),
            'amount', ROUND(COALESCE(amount, 0)::NUMERIC, 2),
            'currency', currency,
            'payment_method', payment_method,
            'description', description
        )
    ) INTO v_recent_topups
    FROM recent_topups;

    -- Последние расходы (обе категории MONEY_OUTCOME, без фильтра category —
    -- проверено на telegram_id 409972991: 187 строк, из них REAL только 184).
    WITH recent_expenses AS (
        SELECT
            payment_date,
            stars,
            service_type,
            description
        FROM public.payments_v2
        WHERE
            telegram_id = p_telegram_id
            AND status = 'COMPLETED'
            AND type = 'MONEY_OUTCOME'
            AND (p_bot_name IS NULL OR bot_name = p_bot_name)
        ORDER BY payment_date DESC
        LIMIT p_limit_transactions
    )
    SELECT json_agg(
        json_build_object(
            'date', payment_date,
            'stars', ROUND(stars::NUMERIC, 2),
            'service', COALESCE(service_type, 'Unknown'),
            'description', description
        )
    ) INTO v_recent_expenses
    FROM recent_expenses;

    -- Порядок ключей значим: облако отдаёт JSON (не JSONB), то есть порядок
    -- вставки сохраняется. Менять порядок нельзя — сломает побайтовое сравнение.
    v_result := json_build_object(
        'current_balance', ROUND(v_current_balance, 2),
        'total_real_income', ROUND(v_total_real_income, 2),
        'total_bonus_income', ROUND(v_total_bonus_income, 2),
        'total_outcome', ROUND(v_total_outcome, 2),
        'total_transactions', v_total_transactions,
        'payment_methods', json_build_object(
            'rubles', json_build_object(
                'stars', ROUND(v_rubles_income.stars::NUMERIC, 2),
                'amount', ROUND(v_rubles_income.amount::NUMERIC, 2),
                'count', v_rubles_income.count
            ),
            'telegram_stars', json_build_object(
                'stars', ROUND(v_telegram_stars_income.stars::NUMERIC, 2),
                'count', v_telegram_stars_income.count
            )
        ),
        'services_breakdown', COALESCE(v_services_stats, '[]'::JSON),
        'recent_topups', COALESCE(v_recent_topups, '[]'::JSON),
        'recent_expenses', COALESCE(v_recent_expenses, '[]'::JSON)
    );

    RETURN v_result;
END;
$fn$;

COMMENT ON FUNCTION public.get_user_balance_stats_optimized(BIGINT, TEXT, INT, INT) IS
  'Статистика баланса пользователя в JSON. ВНИМАНИЕ: current_balance = MONEY_INCOME/REAL + MONEY_INCOME/BONUS - MONEY_OUTCOME/REAL, то есть НЕ учитывает REFUND и MONEY_OUTCOME/BONUS и расходится с get_user_balance() на 12 из 629 плательщиков. Это поведение живого облака, воспроизведено намеренно. Умолчания p_limit_services=10, p_limit_transactions=5 подтверждены замером; NULL = без ограничения, 0 = пустые массивы, отрицательное = ошибка 2201W. Порядок при равных total_stars не определён и в облаке тоже. Порт совпал с облаком на 2666 сравнениях (629 без лимитов, 759 пар с bot_name, 629 с лимитами 3/2, 629 без лимитов вовсе, 20 краевых). Недоказано: currency=STARS с payment_method=Telegram, status=FAILED, типы SUBSCRIPTION_*/REFERRAL/SYSTEM — таких строк в данных нет. См. заголовок sql/railway-rpc/get_user_balance_stats_optimized.sql';

COMMIT;
