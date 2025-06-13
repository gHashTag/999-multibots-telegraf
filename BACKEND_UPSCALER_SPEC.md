# 📋 Backend API Specification: Neurophoto Upscaler

## Новый Endpoint: `/generate/upscale-neurophoto`

### 🎯 **Назначение**
Endpoint для увеличения качества нейрофотографий с использованием Clarity Upscaler. Должен работать аналогично существующим endpoints для генерации нейрофото.

### 📡 **Параметры Запроса**

**Method:** `POST`  
**URL:** `/generate/upscale-neurophoto`  
**Headers:**
```
Content-Type: application/json
x-secret-key: [SECRET_API_KEY]
```

**Body:**
```json
{
  "imageUrl": "string",           // URL изображения для увеличения
  "telegram_id": "string",        // ID пользователя в Telegram
  "username": "string",           // Username пользователя
  "is_ru": boolean,              // Язык пользователя (true=русский)
  "originalPrompt": "string",     // Оригинальный промпт (опционально)
  "bot_name": "string"           // Имя бота
}
```

### 📤 **Ответ Сервера**

**Success Response:**
```json
{
  "success": true,
  "data": {
    "upscaledImageUrl": "string",  // URL увеличенного изображения
    "cost": number                 // Стоимость в звездах (должно быть 3)
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "string"               // Описание ошибки
}
```

### 🔧 **Логика Обработки**

1. **Проверка баланса** - списать 3 ⭐ с баланса пользователя
2. **Upscaling** - использовать Clarity Upscaler модель:
   ```
   Model: philz1337x/clarity-upscaler:dfad41707589d68ecdccd1dfa600d55a208f9310748e44bfe35b4a6291453d5e
   Parameters: { 
     image: imageUrl, 
     creativity: 0.1 
   }
   ```
3. **Сохранение** - сохранить результат локально на сервере
4. **Отправка** - отправить увеличенное фото пользователю в Telegram
5. **Логирование** - записать операцию в базу данных

### 💰 **Ценообразование**
- **Базовая стоимость:** $0.04 USD
- **Финальная цена:** 3 ⭐ (с наценкой 50%)

### 🎹 **Клавиатура Результата**
После отправки фото добавить inline клавиатуру:
```
⬆️ Ещё одно фото    [callback: upscale_another_photo]
🏠 Главное меню     [callback: go_main_menu]
```

### 📝 **Подпись к Фото**
```
Russian:
⬆️ Качество нейрофото увеличено в 2 раза!

🔧 Модель: Clarity Upscaler
✨ Качество: Высокое разрешение  
💎 Стоимость: 3 ⭐
📝 Исходное нейрофото: [originalPrompt]

English:
⬆️ Neurophoto quality enhanced 2x!

🔧 Model: Clarity Upscaler
✨ Quality: High resolution
💎 Cost: 3 ⭐  
📝 Original neurophoto: [originalPrompt]
```

### 🔄 **Обработка Ошибок**

1. **Недостаточно средств** - вернуть ошибку с сообщением
2. **Ошибка upscaling** - вернуть средства пользователю
3. **Недоступное изображение** - проверить доступность URL
4. **Превышение времени** - таймаут 5 минут

### 📊 **Аналитика**
Записывать в базу данных:
- `service_type`: `"image_upscaler"`
- `model_name`: `"philz1337x/clarity-upscaler"`
- `operation_type`: `"neurophoto_upscale"`
- `cost_in_stars`: `3`

### 🔗 **Похожие Endpoints**
Можно использовать как референс:
- `/generate/neuro-photo` - генерация нейрофото
- `/generate/neuro-photo-v2` - генерация нейрофото v2

### ⚠️ **Важные Моменты**
1. **Безопасность** - проверять `x-secret-key` заголовок
2. **Лимиты** - проверять размер изображения (макс 10MB)
3. **Формат** - поддержка jpg, png, webp
4. **Сессия** - НЕ нужно сохранять в сессии (бот уже делает это)

---

### 🚀 **Тестирование**
После реализации можно протестировать:
1. Сгенерировать нейрофото
2. Нажать кнопку "⬆️ Увеличить качество"  
3. Проверить что приходит увеличенное изображение
4. Проверить что списались 3 ⭐
5. Проверить что работают кнопки в результате 