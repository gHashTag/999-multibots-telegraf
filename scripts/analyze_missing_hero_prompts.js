const fs = require('fs');
const path = require('path');

// Read the avatar transform scene file
const filePath = path.join(__dirname, '../src/scenes/avatarTransformScene/index.ts');
const content = fs.readFileSync(filePath, 'utf8');

// Extract AI_HEROES from the file
const aiHeroesMatch = content.match(/const AI_HEROES = \{([\s\S]*?)\}/);
if (!aiHeroesMatch) {
  console.log('Could not find AI_HEROES object');
  process.exit(1);
}

// Parse male heroes
const maleHeroesMatch = aiHeroesMatch[1].match(/male: \[([\s\S]*?)\]/);
const maleHeroes = maleHeroesMatch ? maleHeroesMatch[1]
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.startsWith("'") && line.includes(','))
  .map(line => line.replace(/^'/, '').replace(/',.*$/, '').trim()) : [];

// Parse female heroes  
const femaleHeroesMatch = aiHeroesMatch[1].match(/female: \[([\s\S]*?)\]/);
const femaleHeroes = femaleHeroesMatch ? femaleHeroesMatch[1]
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.startsWith("'") && line.includes(','))
  .map(line => line.replace(/^'/, '').replace(/',.*$/, '').trim()) : [];

// Extract heroPrompts keys - look for the section between heroPrompts declaration and the next closing brace
const heroPromptsStart = content.indexOf('const heroPrompts: Record<string, string> = {');
if (heroPromptsStart === -1) {
  console.log('Could not find heroPrompts object');
  process.exit(1);
}

// Find the matching closing brace by counting braces
let heroPromptsEnd = heroPromptsStart;
let braceCount = 0;
let inPrompt = false;
for (let i = heroPromptsStart; i < content.length; i++) {
  if (content[i] === '{') braceCount++;
  if (content[i] === '}') {
    braceCount--;
    if (braceCount === 0) {
      heroPromptsEnd = i;
      break;
    }
  }
  if (content[i] === '`') inPrompt = !inPrompt;
}

const heroPromptsSection = content.slice(heroPromptsStart, heroPromptsEnd);

// Extract hero names from heroPrompts - handles both quoted and unquoted keys
const heroPromptsKeys = [];
const lines = heroPromptsSection.split('\n');
for (const line of lines) {
  const trimmed = line.trim();
  // Match patterns like: 'Hero Name': or Hero: (with or without quotes)
  const match = trimmed.match(/^['"]?([^'":\s]+(?:\s+[^'":\s]+)*)['"]?\s*:\s*`/);
  if (match && !trimmed.startsWith('//')) {
    heroPromptsKeys.push(match[1]);
  }
}

// Combine all heroes
const allHeroes = [...maleHeroes, ...femaleHeroes];

// Find missing prompts
const missingPrompts = allHeroes.filter(hero => !heroPromptsKeys.includes(hero));

// Categorize heroes by type
function categorizeHero(hero) {
  // Marvel
  const marvelHeroes = ['Человек-паук', 'Железный человек', 'Капитан Америка', 'Тор', 'Халк', 'Доктор Стрэндж', 'Дэдпул', 'Росомаха', 'Человек-муравей', 'Блэк Пантер', 'Локи', 'Веном', 'Карающий', 'Призрачный гонщик', 'Зимний солдат', 'Звёздный лорд', 'Капитан Марвел', 'Скарлет Витч', 'Чёрная вдова', 'Гвен Стейси', 'Шури', 'Валькирия', 'Шторм', 'Джин Грей', 'Роуг', 'Китти Прайд', 'Псайлок', 'Мистик', 'Эмма Фрост', 'Гамора', 'Небула', 'Капитан Картер'];
  
  // DC
  const dcHeroes = ['Супермен', 'Бэтмен', 'Флэш', 'Зелёный фонарь', 'Аквамен', 'Киборг', 'Шазам', 'Зелёная стрела', 'Джокер', 'Найтвинг', 'Дэфстроук', 'Чудо-женщина', 'Харли Квинн', 'Супергёрл', 'Бэтгерл', 'Кэтвумен', 'Ядовитый плющ', 'Рейвен', 'Старфайр', 'Мера', 'Хищные птицы', 'Черная канарейка', 'Джессика Круз'];
  
  // Anime
  const animeHeroes = ['Гоку', 'Наруто', 'Луффи', 'Ичиго', 'Саитама', 'Эдвард Элрик', 'Лайт Ягами', 'Какаши', 'Сасукэ', 'Вегета', 'Пикколо', 'Натсу', 'Эрен Йегер', 'Леви Аккерман', 'Сейлор Мун', 'Мику Хацунэ', 'Сакура Харуно', 'Хината Хьюга', 'Цунадэ', 'Булма', '18-й андроид', 'Эрза Скарлет', 'Микаса Аккерман', 'Рей Аянами', 'Асука Лэнгли', 'Фэй Валентайн', 'Нами', 'Nico Robin', 'Риас Гремори', 'Zero Two'];
  
  // Slavic/Russian
  const slavicHeroes = ['Илья Муромец', 'Добрыня Никитич', 'Алеша Попович', 'Перун', 'Святогор', 'Василиса Прекрасная', 'Снегурочка', 'Жар-птица', 'Берегиня', 'Русалка', 'Иван-царевич', 'Кощей Бессмертный', 'Серый Волк', 'Емеля', 'Марья Моревна', 'Алёнушка', 'Царевна-лягушка', 'Баба Яга'];
  
  // Games
  const gameHeroes = ['Кратос', 'Геральт из Ривии', 'Мастер Чиф', 'Данте', 'Субзиро', 'Скорпион', 'Рю', 'Кен', 'Соник', 'Марио', 'Линк', 'Клауд Страйф', 'Сефирот', 'Спаун', 'Альтаир', 'Эцио', 'Алекс Мерсер', 'Лара Крофт', 'Чун Ли', 'Соня Блейд', 'Китана', 'Джейд', 'Милина', 'Трисс Меригольд', 'Йеннифэр', 'Элли', 'Джилл Валентайн', 'Ада Вонг', 'Принцесса Зельда', 'Самус Аран', 'Байонетта', 'Каратэ', 'Тифа Локхарт', 'Аэрис'];
  
  // Star Wars
  const starWarsHeroes = ['Рэй Скайуокер', 'Принцесса Лея', 'Ахсока Тано', 'Падме Амидала', 'Джайна Соло'];
  
  // Movies/TV
  const movieHeroes = ['Джон Уик', 'Терминатор', 'Хищник', 'Селин', 'Алиса Абернати'];
  
  // Fairy Tales/Disney
  const fairytaleHeroes = ['Мальвина', 'Красная Шапочка', 'Золушка', 'Снежная Королева', 'Алиса', 'Пеппи Длинныйчулок', 'Эльза', 'Анна', 'Мулан', 'Покахонтас', 'Мерида', 'Моана'];
  
  if (marvelHeroes.includes(hero)) return 'Marvel';
  if (dcHeroes.includes(hero)) return 'DC';
  if (animeHeroes.includes(hero)) return 'Anime';
  if (slavicHeroes.includes(hero)) return 'Slavic/Russian';
  if (gameHeroes.includes(hero)) return 'Games';
  if (starWarsHeroes.includes(hero)) return 'Star Wars';
  if (movieHeroes.includes(hero)) return 'Movies/TV';
  if (fairytaleHeroes.includes(hero)) return 'Fairy Tales/Disney';
  return 'Other';
}

// Categorize missing heroes
const missingByCategory = {};
missingPrompts.forEach(hero => {
  const category = categorizeHero(hero);
  if (!missingByCategory[category]) {
    missingByCategory[category] = [];
  }
  missingByCategory[category].push(hero);
});

// Generate report
console.log('=== AI HEROES PROMPT ANALYSIS REPORT ===\n');

console.log('## Summary Statistics');
console.log(`Total Heroes in AI_HEROES: ${allHeroes.length}`);
console.log(`Male Heroes: ${maleHeroes.length}`);
console.log(`Female Heroes: ${femaleHeroes.length}`);
console.log(`Heroes with Prompts: ${heroPromptsKeys.length}`);
console.log(`Heroes Missing Prompts: ${missingPrompts.length}`);
console.log(`Coverage: ${((heroPromptsKeys.length / allHeroes.length) * 100).toFixed(1)}%\n`);

console.log('## Heroes with Existing Prompts:');
heroPromptsKeys.forEach(hero => console.log(`✅ ${hero}`));

console.log('\n## Missing Prompts by Category:');
Object.entries(missingByCategory).forEach(([category, heroes]) => {
  console.log(`\n### ${category} (${heroes.length} missing):`);
  heroes.forEach(hero => console.log(`❌ ${hero}`));
});

console.log('\n## Priority Suggestions:');
console.log('1. **High Priority (Popular characters):**');
console.log('   - Marvel: Тор, Халк, Росомаха, Локи, Веном');
console.log('   - DC: Супермен, Бэтмен, Флэш, Чудо-женщина, Джокер');
console.log('   - Anime: Гоку, Наруто, Луффи, Саитама');

console.log('\n2. **Medium Priority:**');
console.log('   - Games: Кратос, Геральт из Ривии, Лара Крофт');
console.log('   - Star Wars: Рэй Скайуокер, Принцесса Лея');

console.log('\n3. **Lower Priority:**');
console.log('   - Fairy Tales/Disney characters');
console.log('   - Less popular game/anime characters');

console.log('\n## Recommendation:');
console.log('Focus on adding prompts for the most popular missing heroes first:');
console.log('Тор, Халк, Супермен, Бэтмен, Гоку, Наруто, Чудо-женщина, Джокер');
