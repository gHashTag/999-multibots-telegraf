# Список файлов для удаления во избежание дублирования информации

Следующие файлы можно удалить, так как их содержимое теперь хранится в банке памяти:

## В директории docs/

1. `PAYMENT-TESTS-README.md` - информация перенесена в `testing_payments.md`
2. `PAYMENT.md` - информация перенесена в `payment_system_detailed.md`
3. `TESTING.md` - информация перенесена в `testing_system.md`
4. `BOT-SETUP-README.md` - информация перенесена в `bot_setup.md`
5. `NGINX-CONFIG-README.md` - информация перенесена в `nginx_setup.md`
6. `PAYMENT_ROBOKASSA.md` - информация перенесена в `robokassa_payment.md`
7. `README-server.md` - информация перенесена в `server_deployment.md`
8. `DOCKER.md` - информация перенесена в `docker_guide.md`
9. `PAYMENT_SYSTEM.md` - информация перенесена в `payment_system.md`
10. `PAYMENT_RULES.md` - информация перенесена в `payment_rules.md`

## Команда для удаления файлов

```bash
# Переход в директорию проекта
cd /opt/app/999-multibots-telegraf

# Удаление файлов
rm docs/PAYMENT-TESTS-README.md
rm docs/PAYMENT.md
rm docs/TESTING.md
rm docs/BOT-SETUP-README.md
rm docs/NGINX-CONFIG-README.md
rm docs/PAYMENT_ROBOKASSA.md
rm docs/README-server.md
rm docs/DOCKER.md
rm docs/PAYMENT_SYSTEM.md
rm docs/PAYMENT_RULES.md
```

## Примечание

Перед удалением файлов убедитесь, что у вас есть резервная копия проекта или возможность восстановить файлы через систему контроля версий (Git).

Также рекомендуется добавить в README.md проекта информацию о том, что документация теперь хранится в банке памяти в директории:
```
src/core/mcp/agent/memory-bank/NeuroBlogger/
```