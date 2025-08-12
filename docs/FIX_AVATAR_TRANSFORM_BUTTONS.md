# Исправление проблемы с кнопками Avatar Transform Scene

## Описание проблемы
Пользователи видят кнопки "👩‍💼 Женский образ" / "👨‍💼 Мужской образ" вне сцены `avatarTransformScene`, что приводит к ошибке, так как эти кнопки не обрабатываются глобально.

### Логи ошибки:
```
999-multibots  |   "message": {
999-multibots  |     "message_id": 18956,
999-multibots  |     "from": {
999-multibots  |       "id": 793916476,
999-multibots  |       "is_bot": false,
999-multibots  |       "first_name": "Анна",
999-multibots  |       "username": "annakutishcheva",
999-multibots  |     },
999-multibots  |     "text": "👩‍💼 Женский образ"
999-multibots  |   }
```

## Причина проблемы
1. Пользователь начинает процесс трансформации через `/start` 
2. Попадает в `avatarTransformScene` и видит кнопки выбора пола
3. Выходит из сцены (используя команды меню или другим способом)
4. Кнопки остаются в интерфейсе Telegram
5. При нажатии на кнопку вне сцены - бот не знает, что делать

## Решение

### 1. Добавлен глобальный обработчик для кнопок Avatar Transform
В файле `src/hearsHandlers.ts` добавлен обработчик для всех кнопок из avatarTransformScene:

```typescript
// === ОБРАБОТЧИК ДЛЯ КНОПОК AVATAR TRANSFORM ===
bot.hears(
  ['👨‍💼 Мужской образ', '👨‍💼 Male look', '👩‍💼 Женский образ', '👩‍💼 Female look'],
  async ctx => {
    logger.info('GLOBAL HEARS: Avatar Transform button pressed outside scene', {
      telegramId: ctx.from?.id,
      buttonText: ctx.message && 'text' in ctx.message ? ctx.message.text : '',
    })

    try {
      const isRu = isRussianFromState(ctx)
      
      // Информируем пользователя и предлагаем начать заново
      await ctx.reply(
        isRu
          ? '🔄 Похоже, вы вышли из процесса трансформации.\n\nЧтобы создать новый образ, используйте команду /start'
          : '🔄 It seems you have exited the transformation process.\n\nTo create a new look, use the /start command',
        Markup.removeKeyboard()
      )
      
      // Переходим в главное меню
      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.MainMenu)
    } catch (error) {
      logger.error('Error handling Avatar Transform button outside scene:', {
        error,
        telegramId: ctx.from?.id,
      })
    }
  }
)
```

### 2. Сцена avatarTransformScene уже правильно очищает кнопки
При выходе из сцены используется `reply_markup: { remove_keyboard: true }`:
- Строка 347: При пропуске
- Строка 399: При загрузке фото  
- Строка 738: При начале генерации
- Строка 789: После завершения генерации

## Результат
Теперь если пользователь нажмет на кнопку выбора пола вне сцены:
1. Получит информативное сообщение о том, что вышел из процесса
2. Кнопки будут убраны из интерфейса
3. Пользователь будет перенаправлен в главное меню
4. Предложено использовать `/start` для новой трансформации

## Тестирование
1. Начните процесс через `/start`
2. Дойдите до выбора пола
3. Используйте команду `/menu` или другую
4. Попробуйте нажать на оставшуюся кнопку выбора пола
5. Должно появиться сообщение с предложением начать заново
