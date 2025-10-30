-- =============================================================================
-- Financial Analysis Functions for Bot Owner Billing
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Main function to calculate bot financial summary
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_bot_financial_summary(
    p_bot_name TEXT,
    p_start_date TIMESTAMP DEFAULT NULL,
    p_end_date TIMESTAMP DEFAULT NULL
)
RETURNS TABLE (
    bot_name TEXT,
    total_revenue_stars NUMERIC,
    total_revenue_fiat NUMERIC,
    revenue_transactions BIGINT,
    unique_paying_users BIGINT,
    total_expenses_stars NUMERIC,
    total_service_costs NUMERIC,
    expense_transactions BIGINT,
    service_breakdown JSONB
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_date_filter TEXT := '';
BEGIN
    -- Build date filter
    IF p_start_date IS NOT NULL THEN
        v_date_filter := v_date_filter || ' AND payment_date >= ''' || p_start_date || '''';
    END IF;

    IF p_end_date IS NOT NULL THEN
        v_date_filter := v_date_filter || ' AND payment_date <= ''' || p_end_date || '''';
    END IF;

    RETURN QUERY
    EXECUTE format('
        WITH financial_metrics AS (
            SELECT
                $1 as bot_name,

                -- Revenue metrics
                COALESCE(SUM(stars) FILTER (WHERE type = ''MONEY_INCOME''), 0) as total_revenue_stars,
                COALESCE(SUM(amount) FILTER (WHERE type = ''MONEY_INCOME''), 0) as total_revenue_fiat,
                COUNT(*) FILTER (WHERE type = ''MONEY_INCOME'') as revenue_transactions,
                COUNT(DISTINCT telegram_id) FILTER (WHERE type = ''MONEY_INCOME'') as unique_paying_users,

                -- Expense metrics
                COALESCE(SUM(COALESCE(cost, stars)) FILTER (WHERE type = ''MONEY_OUTCOME''), 0) as total_expenses_stars,
                COALESCE(SUM(cost) FILTER (WHERE type = ''MONEY_OUTCOME'' AND cost IS NOT NULL), 0) as total_service_costs,
                COUNT(*) FILTER (WHERE type = ''MONEY_OUTCOME'') as expense_transactions

            FROM payments_v2
            WHERE
                bot_name = $1
                AND status = ''COMPLETED''
                %s
        ),
        service_stats AS (
            SELECT
                COALESCE(service_type, ''unknown'') as service_type,
                COUNT(*) as transaction_count,
                SUM(COALESCE(cost, stars)) as total_cost,
                AVG(COALESCE(cost, stars)) as avg_cost_per_transaction
            FROM payments_v2
            WHERE
                bot_name = $1
                AND status = ''COMPLETED''
                AND type = ''MONEY_OUTCOME''
                %s
            GROUP BY service_type
            ORDER BY total_cost DESC
        )
        SELECT
            fm.*,
            COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        ''service_type'', ss.service_type,
                        ''transaction_count'', ss.transaction_count,
                        ''total_cost'', ROUND(ss.total_cost::NUMERIC, 2),
                        ''avg_cost_per_transaction'', ROUND(ss.avg_cost_per_transaction::NUMERIC, 2),
                        ''percentage_of_total'', CASE
                            WHEN fm.total_expenses_stars > 0
                            THEN ROUND((ss.total_cost / fm.total_expenses_stars * 100)::NUMERIC, 2)
                            ELSE 0
                        END
                    )
                    ORDER BY ss.total_cost DESC
                ),
                ''[]''::jsonb
            ) as service_breakdown
        FROM financial_metrics fm
        LEFT JOIN service_stats ss ON true
        GROUP BY
            fm.bot_name, fm.total_revenue_stars, fm.total_revenue_fiat,
            fm.revenue_transactions, fm.unique_paying_users, fm.total_expenses_stars,
            fm.total_service_costs, fm.expense_transactions
    ', v_date_filter, v_date_filter)
    USING p_bot_name;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Function to get all bots financial overview
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_all_bots_financial_overview(
    p_start_date TIMESTAMP DEFAULT NULL,
    p_end_date TIMESTAMP DEFAULT NULL,
    p_commission_rate NUMERIC DEFAULT 0.20
)
RETURNS TABLE (
    bot_name TEXT,
    total_revenue_stars NUMERIC,
    total_expenses_stars NUMERIC,
    gross_profit_stars NUMERIC,
    platform_commission NUMERIC,
    net_profit_stars NUMERIC,
    profit_margin_percent NUMERIC,
    settlement_amount NUMERIC,
    settlement_status TEXT,
    revenue_transactions BIGINT,
    expense_transactions BIGINT,
    unique_users BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_date_filter TEXT := '';
BEGIN
    -- Build date filter
    IF p_start_date IS NOT NULL THEN
        v_date_filter := v_date_filter || ' AND payment_date >= ''' || p_start_date || '''';
    END IF;

    IF p_end_date IS NOT NULL THEN
        v_date_filter := v_date_filter || ' AND payment_date <= ''' || p_end_date || '''';
    END IF;

    RETURN QUERY
    EXECUTE format('
        WITH bot_financials AS (
            SELECT
                bot_name,
                -- Revenue
                COALESCE(SUM(stars) FILTER (WHERE type = ''MONEY_INCOME''), 0) as revenue_stars,

                -- Expenses (use cost if available, fallback to stars)
                COALESCE(SUM(COALESCE(cost, stars)) FILTER (WHERE type = ''MONEY_OUTCOME''), 0) as expenses_stars,

                -- Transaction counts
                COUNT(*) FILTER (WHERE type = ''MONEY_INCOME'') as revenue_transactions,
                COUNT(*) FILTER (WHERE type = ''MONEY_OUTCOME'') as expense_transactions,

                -- Unique users
                COUNT(DISTINCT telegram_id) as unique_users

            FROM payments_v2
            WHERE
                status = ''COMPLETED''
                AND bot_name IS NOT NULL
                %s
            GROUP BY bot_name
        ),
        settlements AS (
            SELECT
                *,
                -- Calculate profits
                (revenue_stars - expenses_stars) as gross_profit,
                (revenue_stars * $1) as platform_commission,
                (revenue_stars * (1 - $1) - expenses_stars) as settlement_amount
            FROM bot_financials
        )
        SELECT
            s.bot_name,
            ROUND(s.revenue_stars::NUMERIC, 2) as total_revenue_stars,
            ROUND(s.expenses_stars::NUMERIC, 2) as total_expenses_stars,
            ROUND(s.gross_profit::NUMERIC, 2) as gross_profit_stars,
            ROUND(s.platform_commission::NUMERIC, 2) as platform_commission,
            ROUND((s.revenue_stars * (1 - $1))::NUMERIC, 2) as net_profit_stars,
            CASE
                WHEN s.revenue_stars > 0
                THEN ROUND((s.settlement_amount / s.revenue_stars * 100)::NUMERIC, 2)
                ELSE 0
            END as profit_margin_percent,
            ROUND(s.settlement_amount::NUMERIC, 2) as settlement_amount,
            CASE
                WHEN s.settlement_amount > 0 THEN ''OWED_TO_BOT_OWNER''
                WHEN s.settlement_amount < 0 THEN ''BOT_OWNER_OWES_PLATFORM''
                ELSE ''BALANCED''
            END as settlement_status,
            s.revenue_transactions,
            s.expense_transactions,
            s.unique_users
        FROM settlements s
        ORDER BY s.settlement_amount DESC
    ', v_date_filter)
    USING p_commission_rate;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Function to calculate monthly settlement report
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_monthly_settlement(
    p_year INTEGER,
    p_month INTEGER,
    p_bot_name TEXT DEFAULT NULL,
    p_commission_rate NUMERIC DEFAULT 0.20
)
RETURNS TABLE (
    bot_name TEXT,
    month_year TEXT,
    daily_breakdown JSONB,
    monthly_summary JSONB
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_start_date TIMESTAMP;
    v_end_date TIMESTAMP;
    v_bot_filter TEXT := '';
BEGIN
    -- Calculate month boundaries
    v_start_date := DATE_TRUNC('month', MAKE_DATE(p_year, p_month, 1));
    v_end_date := DATE_TRUNC('month', MAKE_DATE(p_year, p_month, 1)) + INTERVAL '1 month' - INTERVAL '1 second';

    -- Add bot filter if specified
    IF p_bot_name IS NOT NULL THEN
        v_bot_filter := ' AND bot_name = ''' || p_bot_name || '''';
    END IF;

    RETURN QUERY
    EXECUTE format('
        WITH daily_stats AS (
            SELECT
                bot_name,
                DATE(payment_date) as transaction_date,
                SUM(CASE WHEN type = ''MONEY_INCOME'' THEN stars ELSE 0 END) as daily_revenue,
                SUM(CASE WHEN type = ''MONEY_OUTCOME'' THEN COALESCE(cost, stars) ELSE 0 END) as daily_expenses,
                COUNT(*) as daily_transactions,
                COUNT(DISTINCT telegram_id) as daily_unique_users
            FROM payments_v2
            WHERE
                status = ''COMPLETED''
                AND payment_date >= $1
                AND payment_date <= $2
                %s
            GROUP BY bot_name, DATE(payment_date)
        ),
        bot_monthly_summary AS (
            SELECT
                bot_name,
                SUM(daily_revenue) as total_revenue,
                SUM(daily_expenses) as total_expenses,
                SUM(daily_transactions) as total_transactions,
                COUNT(DISTINCT transaction_date) as active_days,
                MAX(daily_unique_users) as peak_daily_users,
                SUM(daily_revenue) * $3 as platform_commission,
                (SUM(daily_revenue) * (1 - $3) - SUM(daily_expenses)) as settlement_amount
            FROM daily_stats
            GROUP BY bot_name
        ),
        daily_aggregated AS (
            SELECT
                bot_name,
                jsonb_agg(
                    jsonb_build_object(
                        ''date'', transaction_date,
                        ''revenue'', ROUND(daily_revenue::NUMERIC, 2),
                        ''expenses'', ROUND(daily_expenses::NUMERIC, 2),
                        ''transactions'', daily_transactions,
                        ''unique_users'', daily_unique_users,
                        ''net_profit'', ROUND((daily_revenue - daily_expenses)::NUMERIC, 2)
                    )
                    ORDER BY transaction_date
                ) as daily_breakdown
            FROM daily_stats
            GROUP BY bot_name
        )
        SELECT
            bms.bot_name,
            $4 || ''-'' || LPAD($5::TEXT, 2, ''0'') as month_year,
            COALESCE(da.daily_breakdown, ''[]''::jsonb) as daily_breakdown,
            jsonb_build_object(
                ''total_revenue_stars'', ROUND(bms.total_revenue::NUMERIC, 2),
                ''total_expenses_stars'', ROUND(bms.total_expenses::NUMERIC, 2),
                ''gross_profit'', ROUND((bms.total_revenue - bms.total_expenses)::NUMERIC, 2),
                ''platform_commission'', ROUND(bms.platform_commission::NUMERIC, 2),
                ''settlement_amount'', ROUND(bms.settlement_amount::NUMERIC, 2),
                ''settlement_status'', CASE
                    WHEN bms.settlement_amount > 0 THEN ''OWED_TO_BOT_OWNER''
                    WHEN bms.settlement_amount < 0 THEN ''BOT_OWNER_OWES_PLATFORM''
                    ELSE ''BALANCED''
                END,
                ''total_transactions'', bms.total_transactions,
                ''active_days'', bms.active_days,
                ''peak_daily_users'', bms.peak_daily_users
            ) as monthly_summary
        FROM bot_monthly_summary bms
        LEFT JOIN daily_aggregated da ON bms.bot_name = da.bot_name
        ORDER BY bms.settlement_amount DESC
    ', v_bot_filter)
    USING v_start_date, v_end_date, p_commission_rate, p_year, p_month;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Function to calculate star-to-ruble exchange rate
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_star_to_ruble_rate(
    p_days_back INTEGER DEFAULT 30,
    p_min_transactions INTEGER DEFAULT 10
)
RETURNS TABLE (
    avg_rate NUMERIC,
    median_rate NUMERIC,
    min_rate NUMERIC,
    max_rate NUMERIC,
    sample_size BIGINT,
    confidence_score NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    WITH rate_data AS (
        SELECT
            (amount / NULLIF(stars, 0)) as rate_per_star,
            payment_date
        FROM payments_v2
        WHERE
            type = 'MONEY_INCOME'
            AND status = 'COMPLETED'
            AND currency = 'RUB'
            AND stars > 0
            AND amount > 0
            AND payment_date >= CURRENT_TIMESTAMP - (p_days_back || ' days')::INTERVAL
    ),
    rate_stats AS (
        SELECT
            AVG(rate_per_star) as avg_rate,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rate_per_star) as median_rate,
            MIN(rate_per_star) as min_rate,
            MAX(rate_per_star) as max_rate,
            COUNT(*) as sample_size,
            STDDEV(rate_per_star) as std_dev
        FROM rate_data
    )
    SELECT
        ROUND(rs.avg_rate::NUMERIC, 6) as avg_rate,
        ROUND(rs.median_rate::NUMERIC, 6) as median_rate,
        ROUND(rs.min_rate::NUMERIC, 6) as min_rate,
        ROUND(rs.max_rate::NUMERIC, 6) as max_rate,
        rs.sample_size,
        CASE
            WHEN rs.sample_size >= p_min_transactions AND rs.std_dev < (rs.avg_rate * 0.1)
            THEN 100.0
            WHEN rs.sample_size >= p_min_transactions
            THEN GREATEST(50.0, 100.0 - (rs.std_dev / rs.avg_rate * 100))
            ELSE LEAST(50.0, rs.sample_size::NUMERIC / p_min_transactions * 50)
        END as confidence_score
    FROM rate_stats rs;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Function to export billing data in structured format
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION export_billing_data(
    p_start_date TIMESTAMP DEFAULT NULL,
    p_end_date TIMESTAMP DEFAULT NULL,
    p_bot_name TEXT DEFAULT NULL,
    p_format TEXT DEFAULT 'summary' -- 'summary', 'detailed', 'csv'
)
RETURNS TABLE (
    export_data JSONB
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_date_filter TEXT := '';
    v_bot_filter TEXT := '';
BEGIN
    -- Build filters
    IF p_start_date IS NOT NULL THEN
        v_date_filter := v_date_filter || ' AND payment_date >= ''' || p_start_date || '''';
    END IF;

    IF p_end_date IS NOT NULL THEN
        v_date_filter := v_date_filter || ' AND payment_date <= ''' || p_end_date || '''';
    END IF;

    IF p_bot_name IS NOT NULL THEN
        v_bot_filter := ' AND bot_name = ''' || p_bot_name || '''';
    END IF;

    IF p_format = 'summary' THEN
        RETURN QUERY
        EXECUTE format('
            SELECT jsonb_build_object(
                ''export_metadata'', jsonb_build_object(
                    ''generated_at'', CURRENT_TIMESTAMP,
                    ''period_start'', $1,
                    ''period_end'', $2,
                    ''bot_filter'', $3,
                    ''format'', $4
                ),
                ''financial_summary'', (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            ''bot_name'', bot_name,
                            ''total_revenue_stars'', total_revenue_stars,
                            ''total_expenses_stars'', total_expenses_stars,
                            ''settlement_amount'', settlement_amount,
                            ''settlement_status'', settlement_status,
                            ''profit_margin_percent'', profit_margin_percent
                        )
                        ORDER BY settlement_amount DESC
                    )
                    FROM get_all_bots_financial_overview($1, $2)
                    WHERE ($3 IS NULL OR bot_name = $3)
                ),
                ''exchange_rate'', (
                    SELECT row_to_json(r)
                    FROM calculate_star_to_ruble_rate() r
                )
            ) as export_data
        ')
        USING p_start_date, p_end_date, p_bot_name, p_format;

    ELSIF p_format = 'detailed' THEN
        RETURN QUERY
        EXECUTE format('
            WITH bot_details AS (
                SELECT
                    bot_name,
                    calculate_bot_financial_summary(bot_name, $1, $2) as financial_data
                FROM (
                    SELECT DISTINCT bot_name
                    FROM payments_v2
                    WHERE status = ''COMPLETED''
                    %s %s
                ) bots
            )
            SELECT jsonb_build_object(
                ''export_metadata'', jsonb_build_object(
                    ''generated_at'', CURRENT_TIMESTAMP,
                    ''period_start'', $1,
                    ''period_end'', $2,
                    ''format'', $4
                ),
                ''detailed_breakdown'', jsonb_agg(
                    jsonb_build_object(
                        ''bot_name'', bd.bot_name,
                        ''financial_summary'', row_to_json((bd.financial_data).*),
                        ''service_breakdown'', (bd.financial_data).service_breakdown
                    )
                    ORDER BY (bd.financial_data).total_revenue_stars DESC
                )
            ) as export_data
            FROM bot_details bd
        ', v_bot_filter, v_date_filter)
        USING p_start_date, p_end_date, p_bot_name, p_format;
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Create indexes for financial analysis optimization
-- -----------------------------------------------------------------------------

-- Index for bot financial queries
CREATE INDEX IF NOT EXISTS idx_payments_v2_bot_financial_analysis
ON payments_v2(bot_name, status, type, payment_date DESC, stars, cost)
WHERE status = 'COMPLETED';

-- Index for exchange rate calculations
CREATE INDEX IF NOT EXISTS idx_payments_v2_exchange_rate
ON payments_v2(currency, type, status, payment_date DESC, amount, stars)
WHERE currency = 'RUB' AND type = 'MONEY_INCOME' AND status = 'COMPLETED' AND stars > 0 AND amount > 0;

-- Index for service type analysis
CREATE INDEX IF NOT EXISTS idx_payments_v2_service_analysis
ON payments_v2(bot_name, service_type, status, type, cost, stars)
WHERE status = 'COMPLETED' AND type = 'MONEY_OUTCOME';

-- Index for monthly aggregations
CREATE INDEX IF NOT EXISTS idx_payments_v2_monthly_reports
ON payments_v2(bot_name, DATE_TRUNC('month', payment_date), status, type, stars, cost)
WHERE status = 'COMPLETED';

-- -----------------------------------------------------------------------------
-- 7. Grant permissions
-- -----------------------------------------------------------------------------

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION calculate_bot_financial_summary TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_bots_financial_overview TO authenticated;
GRANT EXECUTE ON FUNCTION generate_monthly_settlement TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_star_to_ruble_rate TO authenticated;
GRANT EXECUTE ON FUNCTION export_billing_data TO authenticated;

-- -----------------------------------------------------------------------------
-- 8. Create materialized view for dashboard analytics
-- -----------------------------------------------------------------------------

CREATE MATERIALIZED VIEW IF NOT EXISTS bot_financial_dashboard AS
SELECT
    bot_name,
    DATE_TRUNC('month', payment_date) as month,
    SUM(CASE WHEN type = 'MONEY_INCOME' AND status = 'COMPLETED' THEN stars ELSE 0 END) as monthly_revenue,
    SUM(CASE WHEN type = 'MONEY_OUTCOME' AND status = 'COMPLETED' THEN COALESCE(cost, stars) ELSE 0 END) as monthly_expenses,
    COUNT(CASE WHEN type = 'MONEY_INCOME' AND status = 'COMPLETED' THEN 1 END) as revenue_transactions,
    COUNT(CASE WHEN type = 'MONEY_OUTCOME' AND status = 'COMPLETED' THEN 1 END) as expense_transactions,
    COUNT(DISTINCT CASE WHEN type = 'MONEY_INCOME' AND status = 'COMPLETED' THEN telegram_id END) as unique_paying_users,

    -- Service breakdown
    jsonb_object_agg(
        COALESCE(service_type, 'revenue'),
        json_build_object(
            'count', COUNT(*) FILTER (WHERE service_type IS NOT NULL OR type = 'MONEY_INCOME'),
            'stars', SUM(COALESCE(cost, stars)) FILTER (WHERE service_type IS NOT NULL OR type = 'MONEY_INCOME')
        )
    ) FILTER (WHERE service_type IS NOT NULL OR type = 'MONEY_INCOME') as service_stats,

    -- Growth metrics
    LAG(SUM(CASE WHEN type = 'MONEY_INCOME' AND status = 'COMPLETED' THEN stars ELSE 0 END))
        OVER (PARTITION BY bot_name ORDER BY DATE_TRUNC('month', payment_date)) as prev_month_revenue,

    -- Settlement calculation with 20% commission
    (SUM(CASE WHEN type = 'MONEY_INCOME' AND status = 'COMPLETED' THEN stars ELSE 0 END) * 0.80 -
     SUM(CASE WHEN type = 'MONEY_OUTCOME' AND status = 'COMPLETED' THEN COALESCE(cost, stars) ELSE 0 END)) as estimated_settlement

FROM payments_v2
WHERE status = 'COMPLETED'
GROUP BY bot_name, DATE_TRUNC('month', payment_date);

-- Create unique index for the materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_bot_financial_dashboard_unique
ON bot_financial_dashboard(bot_name, month);

-- Function to refresh the dashboard
CREATE OR REPLACE FUNCTION refresh_financial_dashboard()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY bot_financial_dashboard;
END;
$$;

-- Grant permissions
GRANT SELECT ON bot_financial_dashboard TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_financial_dashboard TO authenticated;

-- -----------------------------------------------------------------------------
-- Add comments for documentation
-- -----------------------------------------------------------------------------

COMMENT ON FUNCTION calculate_bot_financial_summary IS
'Calculates comprehensive financial summary for a specific bot including revenue, expenses, and service breakdown';

COMMENT ON FUNCTION get_all_bots_financial_overview IS
'Returns financial overview for all bots with settlement calculations based on commission rate';

COMMENT ON FUNCTION generate_monthly_settlement IS
'Generates monthly settlement report with daily breakdown for specified month and year';

COMMENT ON FUNCTION calculate_star_to_ruble_rate IS
'Calculates current star-to-ruble exchange rate based on recent transactions with confidence score';

COMMENT ON FUNCTION export_billing_data IS
'Exports billing data in various formats (summary, detailed, csv) for reporting and integration';

COMMENT ON MATERIALIZED VIEW bot_financial_dashboard IS
'Pre-computed financial metrics by bot and month for dashboard analytics';