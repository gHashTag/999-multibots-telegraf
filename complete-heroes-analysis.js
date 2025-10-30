// Полный анализ героев - извлекаем данные из исходного кода

const fs = require('fs');
const path = require('path');

// Читаем файл с героями
const avatarTransformSceneContent = fs.readFileSync(
  path.join(__dirname, 'src/scenes/avatarTransformScene/index.ts'), 
  'utf-8'
);

console.log('🔍 ПОЛНЫЙ АНАЛИЗ ГЕРОЕВ И ПРОМПТОВ\n');

// Извлекаем AI_HEROES массив
const aiHeroesMatch = avatarTransformSceneContent.match(/const AI_HEROES = \{([\s\S]*?)\n\}/);
if (!aiHeroesMatch) {
  console.error('❌ Не удалось найти AI_HEROES массив');
  process.exit(1);
}

// Извлекаем героев из массивов male и female
const maleHeroesMatch = avatarTransformSceneContent.match(/male: \[([\s\S]*?)\]/);
const femaleHeroesMatch = avatarTransformSceneContent.match(/female: \[([\s\S]*?)\]/);

if (!maleHeroesMatch || !femaleHeroesMatch) {
  console.error('❌ Не удалось найти массивы male/female героев');
  process.exit(1);
}

// Парсим героев
function parseHeroes(heroesString) {
  return heroesString
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith("'") && line.includes("',"))
    .map(line => line.replace(/^'/, '').replace(/',.*$/, ''));
}

const maleHeroes = parseHeroes(maleHeroesMatch[1]);
const femaleHeroes = parseHeroes(femaleHeroesMatch[1]);
const allHeroes = [...maleHeroes, ...femaleHeroes];

console.log(`📊 СТАТИСТИКА ГЕРОЕВ:`);
console.log(`   Мужских героев: ${maleHeroes.length}`);
console.log(`   Женских героев: ${femaleHeroes.length}`);
console.log(`   Всего героев: ${allHeroes.length}`);

// Извлекаем промпты из heroPrompts объекта
const heroPromptsMatch = avatarTransformSceneContent.match(/const heroPrompts: Record<string, string> = \{([\s\S]*?)\n  \}/);
if (!heroPromptsMatch) {
  console.error('❌ Не удалось найти heroPrompts объект');
  process.exit(1);
}

// Парсим промпты
function parsePrompts(promptsString) {
  const prompts = [];
  const lines = promptsString.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("'") && line.includes("': `")) {
      const heroName = line.split("': `")[0].replace(/^'/, '');
      prompts.push(heroName);
    }
  }
  
  return prompts;
}

const heroesWithPrompts = parsePrompts(heroPromptsMatch[1]);

console.log(`\n📝 ПРОМПТЫ:`);
console.log(`   Героев с промптами: ${heroesWithPrompts.length}`);

// Анализ соответствий
const heroesWithoutPrompts = allHeroes.filter(hero => !heroesWithPrompts.includes(hero));
const promptsWithoutHeroes = heroesWithPrompts.filter(prompt => !allHeroes.includes(prompt));

console.log(`\n❌ ГЕРОИ БЕЗ ПРОМПТОВ:`);
if (heroesWithoutPrompts.length === 0) {
  console.log('   ✅ Все герои имеют промпты!');
} else {
  heroesWithoutPrompts.forEach((hero, index) => {
    console.log(`   ${index + 1}. ${hero}`);
  });
}

console.log(`\n❌ ПРОМПТЫ БЕЗ ГЕРОЕВ В МАССИВЕ:`);
if (promptsWithoutHeroes.length === 0) {
  console.log('   ✅ Все промпты соответствуют героям в массиве!');
} else {
  promptsWithoutHeroes.forEach((prompt, index) => {
    console.log(`   ${index + 1}. ${prompt}`);
  });
}

console.log(`\n📈 ИТОГОВАЯ СТАТИСТИКА:`);
console.log(`   ✅ Героев с промптами: ${allHeroes.length - heroesWithoutPrompts.length}`);
console.log(`   ❌ Героев без промптов: ${heroesWithoutPrompts.length}`);
console.log(`   🎯 Процент покрытия: ${Math.round((allHeroes.length - heroesWithoutPrompts.length) / allHeroes.length * 100)}%`);

// Детальный анализ по категориям
console.log(`\n🎭 АНАЛИЗ ПО КАТЕГОРИЯМ:`);

// Мужские герои без промптов
const maleWithoutPrompts = maleHeroes.filter(hero => !heroesWithPrompts.includes(hero));
console.log(`   Мужских героев без промптов: ${maleWithoutPrompts.length}`);
if (maleWithoutPrompts.length > 0) {
  maleWithoutPrompts.forEach(hero => console.log(`     - ${hero}`));
}

// Женские герои без промптов
const femaleWithoutPrompts = femaleHeroes.filter(hero => !heroesWithPrompts.includes(hero));
console.log(`   Женских героев без промптов: ${femaleWithoutPrompts.length}`);
if (femaleWithoutPrompts.length > 0) {
  femaleWithoutPrompts.forEach(hero => console.log(`     - ${hero}`));
}

console.log(`\n🎲 СЛУЧАЙНЫЙ ВЫБОР:`);
console.log(`   При случайном выборе используется массив из ${allHeroes.length} героев`);
if (heroesWithoutPrompts.length === 0) {
  console.log(`   ✅ Все герои будут работать корректно`);
} else {
  console.log(`   ⚠️  ${heroesWithoutPrompts.length} героев будут использовать fallback промпт`);
}

// Проверим наличие ключевых героев
console.log(`\n🔍 ПРОВЕРКА КЛЮЧЕВЫХ ГЕРОЕВ:`);
const keyHeroes = [
  'Человек-паук', 'Железный человек', 'Капитан Америка', 'Тор',
  'Супермен', 'Бэтмен', 'Чудо-женщина',
  'Гоку', 'Наруто', 'Луффи',
  'Нико Робин', 'Кая' // Недавно добавленные
];

keyHeroes.forEach(hero => {
  const hasHero = allHeroes.includes(hero);
  const hasPrompt = heroesWithPrompts.includes(hero);
  const status = hasHero && hasPrompt ? '✅' : hasHero ? '⚠️' : '❌';
  console.log(`   ${status} ${hero} - в массиве: ${hasHero}, промпт: ${hasPrompt}`);
});

if (heroesWithoutPrompts.length === 0 && promptsWithoutHeroes.length === 0) {
  console.log(`\n🎉 ОТЛИЧНО! Все герои настроены корректно!`);
  console.log(`   - Нет героев без промптов`);
  console.log(`   - Нет промптов без героев`);
  console.log(`   - Случайный выбор работает на 100%`);
} else {
  console.log(`\n🚨 ТРЕБУЮТСЯ ИСПРАВЛЕНИЯ:`);
  if (heroesWithoutPrompts.length > 0) {
    console.log(`   - Добавить промпты для ${heroesWithoutPrompts.length} героев`);
  }
  if (promptsWithoutHeroes.length > 0) {
    console.log(`   - Добавить в массив или удалить ${promptsWithoutHeroes.length} промптов`);
  }
}