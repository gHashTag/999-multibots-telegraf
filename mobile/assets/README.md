# Assets для Vibee Mobile

Поместите следующие изображения в эту папку:

## Требуемые файлы

### icon.png
- Размер: 1024x1024 пикселей
- Формат: PNG с прозрачностью
- Назначение: Иконка приложения для App Store и Play Market

### splash.png
- Размер: 1242x2436 пикселей (iPhone X/11 Pro resolution)
- Формат: PNG
- Назначение: Экран загрузки при запуске приложения

### adaptive-icon.png
- Размер: 1024x1024 пикселей
- Формат: PNG с прозрачностью
- Назначение: Адаптивная иконка для Android (будет обрезана в круг/квадрат)

### favicon.png
- Размер: 48x48 пикселей
- Формат: PNG
- Назначение: Фавикон для веб-версии приложения

## Временные placeholder файлы

До добавления настоящих изображений, можно использовать временные:

```bash
# Создать простые placeholder изображения
# (требуется ImageMagick)
convert -size 1024x1024 xc:#4c4cff -gravity center -pointsize 200 -fill white -annotate +0+0 'V' icon.png
convert -size 1242x2436 xc:#0f0f23 -gravity center -pointsize 300 -fill white -annotate +0+0 'Vibee' splash.png
convert -size 1024x1024 xc:#4c4cff -gravity center -pointsize 200 -fill white -annotate +0+0 'V' adaptive-icon.png
convert -size 48x48 xc:#4c4cff favicon.png
```

## Рекомендации по дизайну

- Используйте цветовую схему проекта: `#0f0f23` (темный фон), `#4c4cff` (акцент)
- Иконка должна быть простой и узнаваемой даже в маленьком размере
- Для splash screen используйте минималистичный дизайн
- Adaptive icon должна хорошо выглядеть как в круглой, так и в квадратной форме
