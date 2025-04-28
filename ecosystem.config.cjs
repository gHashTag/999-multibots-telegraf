module.exports = {
  apps : [{
    name   : "neuroblogger-bot",
    script : "./dist/index.js", // Путь к собранному файлу Vite
    cwd    : "/app/",
    // Options reference: https://pm2.keymetrics.io/docs/usage/application-declaration/
    // args: '',
    instances: 1, // Запускаем один экземпляр
    autorestart: true,
    watch: false, // Отключаем watch, так как Docker перезапустит контейнер при изменениях
    max_memory_restart: '1G', // Перезапуск, если потребление памяти > 1GB
    env: {
      NODE_ENV: 'development' // Окружение по умолчанию
    },
    env_production: {
      NODE_ENV: 'production' // Окружение для production
    },
    // Добавляем логирование в стандартный вывод Docker
    out_file: '/dev/stdout',
    error_file: '/dev/stderr',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
}; 