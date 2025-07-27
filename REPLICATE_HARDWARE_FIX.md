# 🔧 Исправление Ошибки Replicate Hardware GPU-T4

## 🚨 Проблема

При обучении Flux модели через Replicate API возникала ошибка:
```
❌ Ошибка: Request to https://api.replicate.com/v1/models failed with status 400 Bad Request: 
{"status":400,"title":"Validation failed","detail":"The following errors occurred:\n- hardware: gpu-t4 is not a valid hardware SKU. Your options are: cpu, gpu-a100-large, gpu-a100-large-2x, gpu-h100, gpu-l40s, gpu-l40s-2x.","errors":[{"pointer":"/hardware","detail":"gpu-t4 is not a valid hardware SKU. Your options are: cpu, gpu-a100-large, gpu-a100-large-2x, gpu-h100, gpu-l40s, gpu-l40s-2x."}]}
```

## 🎯 Причина

Replicate API обновил список доступных hardware типов и больше не поддерживает `gpu-t4`. Старая конфигурация использовала этот устаревший тип.

## ✅ Решение

### Файл: `src/services/createModelTraining.ts`

Добавлен параметр `hardware` в FormData с актуальным значением:

```typescript
// Добавляем hardware параметр для исправления ошибки с устаревшим gpu-t4
formData.append('hardware', 'gpu-a100-large')
```

### Доступные Hardware Опции (2025)

- `cpu` - CPU обработка (медленно)
- `gpu-a100-large` - Мощный GPU для обучения моделей ⭐ (рекомендуется)
- `gpu-a100-large-2x` - Двойной A100 (очень дорого)
- `gpu-h100` - Новейший GPU H100 (очень дорого)
- `gpu-l40s` - Средний GPU L40S
- `gpu-l40s-2x` - Двойной L40S

## 🚀 Результат

После добавления правильного hardware параметра, обучение Flux моделей должно проходить без ошибок.

## 🔮 Мудрость

*"Тот, кто идет в ногу со временем, не спотыкается о камни прошлого"* - Упанишады

Важно регулярно обновлять конфигурации внешних API, так как они могут изменяться без предупреждения.

## 📝 Коммит

Зафиксировано в коммите: `c029b29a`

**Дата:** 27 января 2025  
**Автор:** НейроКодер ॐ 