# Документация по конфигурации Nginx в проекте

## Общая структура

Проект использует Nginx для проксирования запросов к API и ботам. Конфигурация Nginx распределена по нескольким файлам и подходит для различных сред:

### Файлы конфигурации

1. **nginx.conf** (корневой) - используется для разработки и тестирования:
   - Монтируется в `/etc/nginx/nginx.conf` в Docker-контейнере
   - Используется в `docker-compose.dev.yml` и `docker-compose.test.yml`

2. **configs/nginx.conf** - используется в продакшене:
   - Копируется в `/etc/nginx/http.d/default.conf` при сборке Docker-образа
   - Содержит идентичные настройки корневому файлу

3. **roles/nginx/templates/nginx.conf.j2** - шаблон для Ansible:
   - Используется для автоматизированного развертывания
   - Более компактная версия основного файла конфигурации
   - Включает директивы для подключения дополнительных конфигураций

4. **roles/nginx/templates/*.locations.j2** - шаблоны для конфигурации конкретных локаций:
   - api.locations.j2 - конфигурация для API и вебхуков
   - bot*.locations.j2 - конфигурации для проксирования запросов к отдельным ботам

## Развертывание в разных средах

### Разработка и тестирование

В средах разработки и тестирования используется корневой файл `nginx.conf`, который монтируется в контейнер Nginx:

```yaml
# docker-compose.dev.yml и docker-compose.test.yml
services:
  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    # ...
```

### Продакшн (Docker)

В продакшен-среде при использовании Docker конфигурация копируется из `configs/nginx.conf` в Dockerfile:

```dockerfile
# Dockerfile
COPY configs/nginx.conf /etc/nginx/http.d/default.conf
```

### Продакшн (Ansible)

При развертывании через Ansible используются шаблоны из директории `roles/nginx/templates`:

- `nginx.conf.j2` становится основным файлом конфигурации
- Дополнительные файлы `*.locations.j2` становятся отдельными файлами конфигурации для различных локаций

Ansible задача в `roles/nginx/tasks/main.yml` копирует эти файлы в соответствующие места на сервере и генерирует SSL-сертификаты.

## Основные настройки

### Проксирование API

```nginx
location /api {
    proxy_pass http://app:2999;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

### Обработка вебхуков от платежной системы

```nginx
location /payment-success {
    proxy_pass http://app:2999;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header Content-Type $http_content_type;
}
```

### Загрузка файлов

```nginx
location /uploads {
    client_max_body_size 100M;
    proxy_pass http://app:2999;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_read_timeout 300s;
    proxy_connect_timeout 300s;
}
```

### Проксирование ботов (Ansible шаблон)

```nginx
location /{{ bot_name }} {
    proxy_set_header Host $http_host;
    proxy_redirect   off;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Scheme $scheme;
    proxy_pass       http://999-multibots:{{ bot_port }}/{{ bot_name }};
}
```

## Безопасность

В конфигурации предусмотрены меры безопасности, включая:

- Блокировка доступа к потенциально опасным URL-путям:
  ```nginx
  location ~* (\.env|eval-stdin\.php|phpunit|wp-login) {
      deny all;
      return 403;
  }
  ```

- Настройка SSL с самоподписанным сертификатом (в Ansible):
  ```yaml
  - name: Generate self-signed certificate
    community.crypto.x509_certificate:
      privatekey_path: /etc/pki/key.pem
      csr_path: /etc/pki/cert.csr
      provider: selfsigned
      path: /etc/pki/cert.crt
  ```

## Рекомендации по изменению конфигурации

1. При внесении изменений в конфигурацию Nginx, убедитесь, что они внесены в:
   - Корневой файл `nginx.conf` для разработки и тестирования
   - Файл `configs/nginx.conf` для продакшена
   - Соответствующие шаблоны в `roles/nginx/templates/` для Ansible

2. После изменения конфигурации необходимо:
   - Для разработки/тестирования: перезапустить контейнер nginx
   - Для продакшена с Docker: пересобрать образ
   - Для продакшена с Ansible: выполнить деплой 