# NeuroBlogger 🚀

## Инструкция по деплою

1. Обновить код на GitHub
2. SSH подключение к серверу: `ssh -i ~/.ssh/id_rsa root@999-multibots-u14194.vm.elestio.app`
3. Зайти в директорию проекта: `cd /opt/app/999-multibots-telegraf`
4. Обновить конфигурацию Nginx: `ansible-playbook playbook.yml --vault-password-file .vault_password`
5. Перезапустить контейнеры: `docker-compose down && docker-compose up -d`

## Решение проблем

- При ошибке 401 Unauthorized - проверить валидность токенов в .env.production
- Если NGINX конфигурация не применяется - проверить логи: `docker logs nginx-proxy`
