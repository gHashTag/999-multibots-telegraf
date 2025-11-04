/**
 * MONITORING FUNCTIONS FIXTURES
 *
 * Тестовые данные для monitoring функций:
 * - criticalErrorMonitor
 * - logMonitor
 */

export const criticalErrorMonitorData = {
  valid_check: {
    telegram_id: '123456789',
    check_type: 'system_health',
    alert_threshold: 5,
    time_window: 3600, // 1 hour
  },

  valid_detailed: {
    telegram_id: '123456789',
    check_type: 'full_diagnostics',
    alert_threshold: 10,
    time_window: 7200, // 2 hours
    include_logs: true,
    include_metrics: true,
    notify_on_critical: true,
  },

  valid_performance: {
    telegram_id: '123456789',
    check_type: 'performance',
    alert_threshold: 3,
    time_window: 1800, // 30 minutes
    performance_metrics: ['response_time', 'cpu_usage', 'memory_usage'],
  },

  invalid_check_type: {
    telegram_id: '123456789',
    check_type: '',
    alert_threshold: 5,
  },
}

export const logMonitorData = {
  valid_basic: {
    telegram_id: '123456789',
    log_level: 'error',
    time_range: 3600, // 1 hour
    limit: 100,
  },

  valid_advanced: {
    telegram_id: '123456789',
    log_level: 'warn',
    time_range: 7200, // 2 hours
    limit: 500,
    filter_pattern: 'payment|render',
    service_name: 'ai_koshey_bot',
    include_stack_trace: true,
  },

  valid_monitoring: {
    telegram_id: '123456789',
    log_level: 'info',
    time_range: 1800, // 30 minutes
    limit: 50,
    real_time_monitoring: true,
    alert_on_pattern: 'ERROR|CRITICAL|FATAL',
  },

  invalid_log_level: {
    telegram_id: '123456789',
    log_level: '',
    time_range: 3600,
  },
}

export const monitoringExpectedResults = {
  success_critical_check: {
    success: true,
    status: 'healthy',
    check_type: 'system_health',
    errors_found: 0,
    last_check: '2024-01-01T12:00:00Z',
    health_score: 100,
    alerts: [],
  },

  success_log_monitoring: {
    success: true,
    logs_found: 50,
    log_level: 'error',
    time_range: 3600,
    total_errors: 5,
    recent_errors: [
      {
        timestamp: '2024-01-01T11:30:00Z',
        message: 'Payment processing failed',
        service: 'payment_service',
      },
    ],
    trend: 'stable',
  },

  error_no_permissions: {
    success: false,
    error: 'No monitoring permissions',
  },

  error_invalid_time_range: {
    success: false,
    error: 'Invalid time range',
  },
}

export const monitoringErrors = {
  no_permissions: {
    code: 'NO_PERMISSIONS',
    message: 'Нет прав на мониторинг',
  },

  invalid_time_range: {
    code: 'INVALID_TIME_RANGE',
    message: 'Неверный диапазон времени',
  },

  log_service_unavailable: {
    code: 'LOG_SERVICE_UNAVAILABLE',
    message: 'Сервис логирования недоступен',
  },

  invalid_check_type: {
    code: 'INVALID_CHECK_TYPE',
    message: 'Неверный тип проверки',
  },

  critical_errors_found: {
    code: 'CRITICAL_ERRORS_FOUND',
    message: 'Обнаружены критические ошибки',
  },

  monitoring_failed: {
    code: 'MONITORING_FAILED',
    message: 'Ошибка мониторинга',
  },
}
