# 🔍 Скрипт диагностики целостности системы

RED="[0;31m"
GREEN="[0;32m"
YELLOW="[1;33m"
NC="[0m"

echo "🔍 Начинаю диагностику целостности системы..."

# Проверка наличия всех критических файлов
for file in MAIN.md ROADMAP.md SELF_DIAGNOSIS.md project_info.md; do
  if [ -f "$file" ]; then
    echo -e "${GREEN}✅ Файл $file существует${NC}"
  else
    echo -e "${RED}❌ Файл $file отсутствует!${NC}"
  fi
done

# Проверка директорий
for dir in .history docs scripts src; do
  if [ -d "$dir" ]; then
    echo -e "${GREEN}✅ Директория $dir существует${NC}"
  else
    echo -e "${RED}❌ Директория $dir отсутствует!${NC}"
  fi
done

# Проверка скриптов
for script in scripts/*.sh; do
  if [ -x "$script" ]; then
    echo -e "${GREEN}✅ Скрипт $script исполняемый${NC}"
  else
    echo -e "${YELLOW}⚠️  Скрипт $script не исполняемый${NC}"
    chmod +x "$script"
  fi
done

echo "🎉 Диагностика завершена!"
