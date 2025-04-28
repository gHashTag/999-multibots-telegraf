#!/usr/bin/env node

const { execSync } = require('child_process');

const ports = process.argv.slice(2); // Получаем порты из аргументов командной строки

if (ports.length === 0) {
  console.log('Usage: node scripts/kill-port.cjs <port1> [port2] ...');
  process.exit(1);
}

ports.forEach(port => {
  const portNumber = parseInt(port, 10);
  if (isNaN(portNumber)) {
    console.warn(`⚠️ Invalid port specified: ${port}. Skipping.`);
    return;
  }

  console.log(`🔍 Checking port ${portNumber}...`);
  try {
    // Используем lsof для поиска PID процесса, слушающего порт
    // -i tcp:${portNumber} : Искать TCP соединения на этом порту
    // -t                 : Вывести только PID
    // || true            : Игнорировать ошибку, если lsof ничего не нашел (код выхода 1)
    const pid = execSync(`lsof -ti tcp:${portNumber} || true`, { encoding: 'utf8' }).trim();

    if (pid) {
      console.log(`⛔ Port ${portNumber} is in use by PID ${pid}. Attempting to kill...`);
      try {
        // Завершаем процесс
        execSync(`kill -9 ${pid}`);
        console.log(`✅ Successfully killed process ${pid} on port ${portNumber}.`);
      } catch (killError) {
        console.error(`❌ Failed to kill process ${pid} on port ${portNumber}:`, killError.message);
      }
    } else {
      console.log(`🟢 Port ${portNumber} is free.`);
    }
  } catch (lsofError) {
    // Обрабатываем другие возможные ошибки lsof, хотя `|| true` должен был предотвратить большинство
     if (!lsofError.message.includes('exit code 1')) { // Игнорируем ожидаемый код выхода 1, если порт свободен
       console.error(`❌ Error checking port ${portNumber}:`, lsofError.message);
    } else {
         console.log(`🟢 Port ${portNumber} is free (lsof check confirms).`);
     }
  }
});

console.log('🏁 Port check finished.');
