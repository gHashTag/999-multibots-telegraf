/**
 * TEST FUNCTIONS FIXTURES
 *
 * Тестовые данные для test функций:
 * - testSimpleFunction
 * - testSimpleMessageFunction
 * - testAdvancedLoopFunction
 */

export const testSimpleFunctionData = {
  valid_basic: {
    telegram_id: '123456789',
    message: 'Hello World',
    test_mode: true,
  },

  valid_with_options: {
    telegram_id: '123456789',
    message: 'Test message',
    test_mode: true,
    options: {
      delay: 1000,
      simulate_error: false,
      mock_response: true,
    },
  },

  invalid_message: {
    telegram_id: '123456789',
    message: '',
    test_mode: true,
  },
}

export const testSimpleMessageFunctionData = {
  valid_simple: {
    telegram_id: '123456789',
    text: 'Test text',
    chat_id: '123456789',
  },

  valid_with_markup: {
    telegram_id: '123456789',
    text: 'Formatted text',
    chat_id: '123456789',
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Button 1', callback_data: 'btn1' }],
        [{ text: 'Button 2', callback_data: 'btn2' }],
      ],
    },
  },

  valid_with_parse_mode: {
    telegram_id: '123456789',
    text: '<b>Bold text</b>',
    chat_id: '123456789',
    parse_mode: 'HTML',
  },

  invalid_chat_id: {
    telegram_id: '123456789',
    text: 'Test',
    chat_id: '',
  },
}

export const testAdvancedLoopFunctionData = {
  valid_basic: {
    telegram_id: '123456789',
    loop_count: 5,
    delay: 100,
    message: 'Loop message',
  },

  valid_advanced: {
    telegram_id: '123456789',
    loop_count: 10,
    delay: 200,
    message: 'Advanced loop',
    async_mode: true,
    break_on_error: false,
    log_progress: true,
    parallel_execution: false,
  },

  valid_parallel: {
    telegram_id: '123456789',
    loop_count: 20,
    delay: 50,
    message: 'Parallel loop',
    async_mode: true,
    parallel_execution: true,
    max_parallel: 5,
  },

  invalid_loop_count: {
    telegram_id: '123456789',
    loop_count: 0,
    delay: 100,
    message: 'Loop message',
  },
}

export const testExpectedResults = {
  success_simple_function: {
    success: true,
    message: 'Test completed',
    execution_time: 150,
    iterations: 1,
  },

  success_simple_message: {
    success: true,
    message_id: 'msg_123',
    chat_id: '123456789',
    text: 'Test text',
  },

  success_advanced_loop: {
    success: true,
    loop_count: 5,
    successful_iterations: 5,
    failed_iterations: 0,
    total_time: 500,
    average_iteration_time: 100,
  },

  success_parallel_loop: {
    success: true,
    loop_count: 20,
    successful_iterations: 20,
    failed_iterations: 0,
    total_time: 200,
    average_iteration_time: 10,
  },

  error_invalid_input: {
    success: false,
    error: 'Invalid input parameters',
  },

  error_loop_failed: {
    success: false,
    error: 'Loop execution failed',
  },
}

export const testErrors = {
  invalid_message: {
    code: 'INVALID_MESSAGE',
    message: 'Недопустимое сообщение',
  },

  invalid_chat_id: {
    code: 'INVALID_CHAT_ID',
    message: 'Недопустимый ID чата',
  },

  invalid_loop_count: {
    code: 'INVALID_LOOP_COUNT',
    message: 'Недопустимое количество итераций',
  },

  test_timeout: {
    code: 'TEST_TIMEOUT',
    message: 'Превышено время выполнения теста',
  },

  parallel_execution_failed: {
    code: 'PARALLEL_EXECUTION_FAILED',
    message: 'Ошибка параллельного выполнения',
  },

  simulation_error: {
    code: 'SIMULATION_ERROR',
    message: 'Ошибка симуляции',
  },
}
