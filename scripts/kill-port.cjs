const { execSync } = require('child_process');

// Получаем порты из аргументов командной строки
const ports = process.argv.slice(2);

if (ports.length === 0) {
    console.log('Usage: node kill-port.cjs <port1> <port2> ...');
    process.exit(1);
}

// Для каждого порта
ports.forEach(port => {
    try {
        // В зависимости от операционной системы используем разные команды
        if (process.platform === 'win32') {
            // Windows
            execSync(`netstat -ano | findstr :${port}`).toString().split('\n').forEach(line => {
                const match = line.match(/\s+([0-9]+)\s*$/);
                if (match) {
                    try {
                        execSync(`taskkill /F /PID ${match[1]}`);
                        console.log(`Killed process using port ${port}`);
                    } catch (e) {
                        // Игнорируем ошибки при попытке убить процесс
                    }
                }
            });
        } else {
            // Unix-like системы (Linux, MacOS)
            try {
                execSync(`lsof -i :${port} | grep LISTEN | awk '{print $2}' | xargs kill -9`);
                console.log(`Killed process using port ${port}`);
            } catch (e) {
                // Игнорируем ошибки если процесс не найден
            }
        }
    } catch (error) {
        // Если процесс не найден на порту, игнорируем ошибку
        console.log(`No process found using port ${port}`);
    }
});
