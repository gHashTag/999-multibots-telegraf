// Hero Mapping Analysis Script
// This script analyzes the hero mappings in avatarTransformScene/index.ts

const AI_HEROES = {
  male: [
    // Marvel Universe (Самые популярные)
    'Человек-паук',
    'Железный человек', 
    'Капитан Америка',
    'Тор',
    'Халк',
    'Доктор Стрэндж',
    'Дэдпул',
    'Росомаха',
    'Человек-муравей',
    'Блэк Пантер',
    'Локи',
    'Веном',
    'Карающий',
    'Призрачный гонщик',
    'Зимний солдат',
    'Звёздный лорд',
    
    // DC Universe
    'Супермен',
    'Бэтмен',
    'Флэш',
    'Зелёный фонарь',
    'Аквамен',
    'Киборг',
    'Шазам',
    'Зелёная стрела',
    'Джокер',
    'Найтвинг',
    'Дэфстроук',
    
    // Anime & Manga (Популярные)
    'Гоку',
    'Наруто',
    'Луффи',
    'Ичиго',
    'Саитама',
    'Эдвард Элрик',
    'Лайт Ягами',
    'Какаши',
    'Сасукэ',
    'Вегета',
    'Пикколо',
    'Натсу',
    'Эрен Йегер',
    'Леви Аккерман',
    
    // Slavic & Mythology
    'Илья Муромец',
    'Добрыня Никитич',
    'Алеша Попович',
    'Перун',
    'Святогор',
    
    // Games & Movies (Культовые)
    'Кратос',
    'Геральт из Ривии',
    'Мастер Чиф',
    'Данте',
    'Субзиро',
    'Скорпион',
    'Рю',
    'Кен',
    'Соник',
    'Марио',
    'Линк',
    'Клауд Страйф',
    'Сефирот',
    'Джон Уик',
    'Терминатор',
    'Хищник',
    'Спаун',
    'Альтаир',
    'Эцио',
    'Алекс Мерсер'
  ],
  female: [
    // Marvel Universe
    'Капитан Марвел',
    'Скарлет Витч', 
    'Чёрная вдова',
    'Гвен Стейси',
    'Шури',
    'Валькирия',
    'Шторм',
    'Джин Грей',
    'Роуг',
    'Китти Прайд',
    'Псайлок',
    'Мистик',
    'Эмма Фрост',
    'Гамора',
    'Небула',
    'Капитан Картер',
    
    // DC Universe
    'Чудо-женщина',
    'Харли Квинн',
    'Супергёрл',
    'Бэтгерл',
    'Кэтвумен',
    'Ядовитый плющ',
    'Рейвен',
    'Старфайр',
    'Мера',
    'Хищные птицы',
    'Черная канарейка',
    'Джессика Круз',
    
    // Anime & Manga
    'Сейлор Мун',
    'Мику Хацунэ',
    'Сакура Харуно',
    'Хината Хьюга',
    'Цунадэ',
    'Булма',
    '18-й андроид',
    'Эрза Скарлет',
    'Микаса Аккерман',
    'Рей Аянами',
    'Асука Лэнгли',
    'Фэй Валентайн',
    'Нами',
    'Nico Robin',
    'Риас Гремори',
    'Zero Two',
    
    // Star Wars
    'Рэй Скайуокер',
    'Принцесса Лея',
    'Ахсока Тано',
    'Падме Амидала',
    'Джайна Соло',
    
    // Games & Movies
    'Лара Крофт',
    'Чун Ли',
    'Соня Блейд',
    'Китана',
    'Джейд',
    'Милина',
    'Трисс Меригольд',
    'Йеннифэр',
    'Элли',
    'Джилл Валентайн',
    'Ада Вонг',
    'Селин',
    'Алиса Абернати',
    'Принцесса Зельда',
    'Самус Аран',
    'Байонетта',
    'Каратэ',
    'Тифа Локхарт',
    'Аэрис',
    
    // Slavic & Mythology
    'Василиса Прекрасная',
    'Снегурочка',
    'Жар-птица',
    'Берегиня',
    'Русалка',
    'Мальвина',
    
    // Disney & Animation
    'Эльза',
    'Анна',
    'Мулан',
    'Покахонтас',
    'Мерида',
    'Моана'
  ],
};

// Current heroTranslations from the file
const heroTranslations = {
  // Marvel герои - уникальные эмодзи
  'Человек-паук': { ru: '🕷️ Человек-паук', en: '🕷️ Spider-Man' },
  'Железный человек': { ru: '🤖 Железный человек', en: '🤖 Iron Man' },
  'Капитан Америка': { ru: '🇦🇲 Капитан Америка', en: '🇦🇲 Captain America' },
  'Тор': { ru: '⚡ Тор', en: '⚡ Thor' },
  'Доктор Стрэндж': { ru: '🧿 Доктор Стрэндж', en: '🧿 Doctor Strange' },
  'Соколиный глаз': { ru: '🏹 Соколиный глаз', en: '🏹 Hawkeye' },
  'Звёздный лорд': { ru: '🚀 Звёздный лорд', en: '🚀 Star Lord' },
  'Капитан Марвел': { ru: '⭐ Капитан Марвел', en: '⭐ Captain Marvel' },
  'Скарлет Витч': { ru: '🔮 Скарлет Витч', en: '🔮 Scarlet Witch' },
  'Алая ведьма': { ru: '🌹 Алая ведьма', en: '🌹 Wanda Maximoff' },
  'Гамора': { ru: '🗡️ Гамора', en: '🗡️ Gamora' },
  'Шури': { ru: '💙 Шури', en: '💙 Shuri' },
  'Валькирия': { ru: '⚔️ Валькирия', en: '⚔️ Valkyrie' },
  // Славянские сказочные герои
  'Иван-царевич': { ru: '🤴 Иван-царевич', en: '🤴 Ivan Tsarevich' },
  'Илья Муромец': { ru: '🛡️ Илья Муромец', en: '🛡️ Ilya Muromets' },
  'Добрыня Никитич': { ru: '💉 Добрыня Никитич', en: '💉 Dobrynya Nikitich' },
  'Алёша Попович': { ru: '🎯 Алёша Попович', en: '🎯 Alyosha Popovich' },
  'Кощей Бессмертный': { ru: '💀 Кощей Бессмертный', en: '💀 Koschei' },
  'Серый Волк': { ru: '🐺 Серый Волк', en: '🐺 Grey Wolf' },
  'Емеля': { ru: '🎣 Емеля', en: '🎣 Emelya' },
  'Василиса Прекрасная': { ru: '👸 Василиса Прекрасная', en: '👸 Vasilisa' },
  'Баба Яга': { ru: '🧿 Баба Яга', en: '🧿 Baba Yaga' },
  'Снегурочка': { ru: '❄️ Снегурочка', en: '❄️ Snow Maiden' },
  'Марья Моревна': { ru: '💂 Марья Моревна', en: '💂 Marya Morevna' },
  'Алёнушка': { ru: '🌾 Алёнушка', en: '🌾 Alyonushka' },
  'Жар-птица': { ru: '🔥 Жар-птица', en: '🔥 Firebird' },
  'Царевна-лягушка': { ru: '🐸 Царевна-лягушка', en: '🐸 Frog Princess' },
  'Мальвина': { ru: '👩‍🎨 Мальвина', en: '👩‍🎨 Malvina' },
  'Красная Шапочка': { ru: '🧧 Красная Шапочка', en: '🧧 Red Hood' },
  'Золушка': { ru: '👠 Золушка', en: '👠 Cinderella' },
  'Снежная Королева': { ru: '🌨️ Снежная Королева', en: '🌨️ Snow Queen' },
  'Алиса': { ru: '🎀 Алиса', en: '🎀 Alice' },
  'Пеппи Длинныйчулок': { ru: '🦾 Пеппи Длинныйчулок', en: '🦾 Pippi' },
  'Карающий': { ru: '🎨 Карающий', en: '🎨 Punisher' },
};

// Current buttonToHeroMap from the file
const buttonToHeroMap = {
  // Marvel - Русские кнопки (уникальные эмодзи)
  '🕷️ Человек-паук': 'Человек-паук',
  '🤖 Железный человек': 'Железный человек',
  '🇦🇲 Капитан Америка': 'Капитан Америка',
  '⚡ Тор': 'Тор',
  '🧿 Доктор Стрэндж': 'Доктор Стрэндж',
  '🏹 Соколиный глаз': 'Соколиный глаз',
  '🚀 Звёздный лорд': 'Звёздный лорд',
  // Marvel - Английские кнопки
  '🕷️ Spider-Man': 'Человек-паук',
  '🤖 Iron Man': 'Железный человек',
  '🇦🇲 Captain America': 'Капитан Америка',
  '⚡ Thor': 'Тор',
  '🧿 Doctor Strange': 'Доктор Стрэндж',
  '🏹 Hawkeye': 'Соколиный глаз',
  '🚀 Star Lord': 'Звёздный лорд',
  // Marvel женские - Русские кнопки
  '⭐ Капитан Марвел': 'Капитан Марвел',
  '🔮 Скарлет Витч': 'Скарлет Витч',
  '🌹 Алая ведьма': 'Алая ведьма',
  '🗡️ Гамора': 'Гамора',
  '💙 Шури': 'Шури',
  '⚔️ Валькирия': 'Валькирия',
  // Marvel женские - Английские кнопки
  '⭐ Captain Marvel': 'Капитан Марвел',
  '🔮 Scarlet Witch': 'Скарлет Витч',
  '🌹 Wanda Maximoff': 'Алая ведьма',
  '🗡️ Gamora': 'Гамора',
  '💙 Shuri': 'Шури',
  '⚔️ Valkyrie': 'Валькирия',
  // Славянские сказочные - Русские
  '🤴 Иван-царевич': 'Иван-царевич',
  '🛡️ Илья Муромец': 'Илья Муромец',
  '💉 Добрыня Никитич': 'Добрыня Никитич',
  '🎯 Алёша Попович': 'Алёша Попович',
  '💀 Кощей Бессмертный': 'Кощей Бессмертный',
  '🐺 Серый Волк': 'Серый Волк',
  '🎣 Емеля': 'Емеля',
  '👸 Василиса Прекрасная': 'Василиса Прекрасная',
  '🧿 Баба Яга': 'Баба Яга',
  '❄️ Снегурочка': 'Снегурочка',
  '💂 Марья Моревна': 'Марья Моревна',
  '🌾 Алёнушка': 'Алёнушка',
  '🔥 Жар-птица': 'Жар-птица',
  '🐸 Царевна-лягушка': 'Царевна-лягушка',
  // Славянские сказочные - Английские
  '🤴 Ivan Tsarevich': 'Иван-царевич',
  '🛡️ Ilya Muromets': 'Илья Муромец',
  '💉 Dobrynya Nikitich': 'Добрыня Никитич',
  '🎯 Alyosha Popovich': 'Алёша Попович',
  '💀 Koschei': 'Кощей Бессмертный',
  '🐺 Grey Wolf': 'Серый Волк',
  '🎣 Emelya': 'Емеля',
  '👸 Vasilisa': 'Василиса Прекрасная',
  '🧿 Baba Yaga': 'Баба Яга',
  '❄️ Snow Maiden': 'Снегурочка',
  '💂 Marya Morevna': 'Марья Моревна',
  '🌾 Alyonushka': 'Алёнушка',
  '🔥 Firebird': 'Жар-птица',
  '🐸 Frog Princess': 'Царевна-лягушка',
  '👩‍🎨 Мальвина': 'Мальвина',
  '🧧 Красная Шапочка': 'Красная Шапочка',
  '👠 Золушка': 'Золушка',
  '🌨️ Снежная Королева': 'Снежная Королева',
  '🎀 Алиса': 'Алиса',
  '🦾 Пеппи Длинныйчулок': 'Пеппи Длинныйчулок',
  '👩‍🎨 Malvina': 'Мальвина',
  '🧧 Red Hood': 'Красная Шапочка',
  '👠 Cinderella': 'Золушка',
  '🌨️ Snow Queen': 'Снежная Королева',
  '🎀 Alice': 'Алиса',
  '🦾 Pippi': 'Пеппи Длинныйчулок',
  '🎨 Карающий': 'Карающий',
  '🎨 Punisher': 'Карающий',
};

// Analysis functions
function getAllHeroes() {
  return [...AI_HEROES.male, ...AI_HEROES.female];
}

function getHeroesInTranslations() {
  return Object.keys(heroTranslations);
}

function getHeroesInButtonMap() {
  const heroes = new Set();
  Object.values(buttonToHeroMap).forEach(hero => heroes.add(hero));
  return Array.from(heroes);
}

function findMissingFromTranslations() {
  const allHeroes = getAllHeroes();
  const translatedHeroes = getHeroesInTranslations();
  return allHeroes.filter(hero => !translatedHeroes.includes(hero));
}

function findMissingFromButtonMap() {
  const allHeroes = getAllHeroes();
  const buttonMappedHeroes = getHeroesInButtonMap();
  return allHeroes.filter(hero => !buttonMappedHeroes.includes(hero));
}

function findEmojiConflicts() {
  const emojiToHeroes = {};
  const conflicts = [];
  
  // Check heroTranslations for emoji conflicts
  Object.entries(heroTranslations).forEach(([hero, translations]) => {
    const ruEmoji = translations.ru.split(' ')[0];
    const enEmoji = translations.en.split(' ')[0];
    
    if (!emojiToHeroes[ruEmoji]) {
      emojiToHeroes[ruEmoji] = [];
    }
    emojiToHeroes[ruEmoji].push(`${hero} (RU)`);
    
    if (ruEmoji !== enEmoji) {
      if (!emojiToHeroes[enEmoji]) {
        emojiToHeroes[enEmoji] = [];
      }
      emojiToHeroes[enEmoji].push(`${hero} (EN)`);
    }
  });
  
  Object.entries(emojiToHeroes).forEach(([emoji, heroes]) => {
    if (heroes.length > 1) {
      conflicts.push({ emoji, heroes });
    }
  });
  
  return conflicts;
}

function generateMissingTranslations() {
  const missing = findMissingFromTranslations();
  const usedEmojis = new Set();
  
  // Collect already used emojis
  Object.values(heroTranslations).forEach(trans => {
    usedEmojis.add(trans.ru.split(' ')[0]);
    usedEmojis.add(trans.en.split(' ')[0]);
  });
  
  // Emoji suggestions for different categories
  const emojiSuggestions = {
    // Marvel/DC heroes
    'Халк': '💚',
    'Дэдпул': '🔴',
    'Росомаха': '🦾',
    'Человек-муравей': '🐜',
    'Блэк Пантер': '🐾',
    'Локи': '🐍',
    'Веном': '🖤',
    'Призрачный гонщик': '🔥',
    'Зимний солдат': '❄️',
    'Супермен': '🚀',
    'Бэтмен': '🦇',
    'Флэш': '⚡',
    'Зелёный фонарь': '💍',
    'Аквамен': '🌊',
    'Киборг': '🤖',
    'Шазам': '⚡',
    'Зелёная стрела': '🏹',
    'Джокер': '🃏',
    'Найтвинг': '🦅',
    'Дэфстроук': '⚔️',
    // Anime characters
    'Гоку': '🥋',
    'Наруто': '🍥',
    'Луффи': '🎩',
    'Ичиго': '⚔️',
    'Саитама': '👊',
    'Эдвард Элрик': '⚗️',
    'Лайт Ягами': '📓',
    'Какаши': '👁️',
    'Сасукэ': '🗲',
    'Вегета': '👑',
    'Пикколо': '💚',
    'Натсу': '🔥',
    'Эрен Йегер': '⚔️',
    'Леви Аккерман': '🗡️',
    // Female heroes
    'Чёрная вдова': '🕷️',
    'Гвен Стейси': '🕸️',
    'Шторм': '⛈️',
    'Джин Грей': '🔥',
    'Роуг': '💀',
    'Китти Прайд': '👻',
    'Псайлок': '🗡️',
    'Мистик': '💙',
    'Эмма Фрост': '💎',
    'Небула': '🌌',
    'Капитан Картер': '🛡️',
    'Чудо-женщина': '⭐',
    'Харли Квинн': '🎭',
    'Супергёрл': '💫',
    'Бэтгерл': '🦇',
    'Кэтвумен': '🐱',
    'Ядовитый плющ': '🌿',
    'Рейвен': '🌙',
    'Старфайр': '🔥',
    'Мера': '🌊',
    'Хищные птицы': '🦅',
    'Черная канарейка': '🐦',
    'Джессика Круз': '💍',
    // Games/Movies
    'Кратос': '⚔️',
    'Геральт из Ривии': '🗡️',
    'Мастер Чиф': '🚀',
    'Данте': '🔥',
    'Субзиро': '❄️',
    'Скорпион': '🦂',
    'Рю': '👊',
    'Кен': '🔥',
    'Соник': '💨',
    'Марио': '🍄',
    'Линк': '🗡️',
    'Клауд Страйф': '⚔️',
    'Сефирот': '🗡️',
    'Джон Уик': '🔫',
    'Терминатор': '🤖',
    'Хищник': '👽',
    'Спаун': '🔥',
    'Альтаир': '🦅',
    'Эцио': '🏛️',
    'Алекс Мерсер': '🧬'
  };
  
  const suggestions = [];
  missing.forEach(hero => {
    let emoji = emojiSuggestions[hero] || '🎭';
    
    // Ensure unique emoji
    let counter = 1;
    let originalEmoji = emoji;
    while (usedEmojis.has(emoji)) {
      emoji = ['🎨', '✨', '🌟', '💫', '🔸', '🔹', '🔺', '🔻'][counter % 8];
      counter++;
    }
    
    usedEmojis.add(emoji);
    
    // Generate English name
    let enName = hero;
    const nameMapping = {
      'Халк': 'Hulk',
      'Дэдпул': 'Deadpool',
      'Росомаха': 'Wolverine',
      'Человек-муравей': 'Ant-Man',
      'Блэк Пантер': 'Black Panther',
      'Локи': 'Loki',
      'Веном': 'Venom',
      'Призрачный гонщик': 'Ghost Rider',
      'Зимний солдат': 'Winter Soldier',
      'Супермен': 'Superman',
      'Бэтмен': 'Batman',
      'Флэш': 'Flash',
      'Зелёный фонарь': 'Green Lantern',
      'Аквамен': 'Aquaman',
      'Киборг': 'Cyborg',
      'Шазам': 'Shazam',
      'Зелёная стрела': 'Green Arrow',
      'Джокер': 'Joker',
      'Найтвинг': 'Nightwing',
      'Дэфстроук': 'Deathstroke',
      'Чёрная вдова': 'Black Widow',
      'Гвен Стейси': 'Gwen Stacy',
      'Шторм': 'Storm',
      'Джин Грей': 'Jean Grey',
      'Роуг': 'Rogue',
      'Китти Прайд': 'Kitty Pryde',
      'Псайлок': 'Psylocke',
      'Мистик': 'Mystique',
      'Эмма Фрост': 'Emma Frost',
      'Небула': 'Nebula',
      'Капитан Картер': 'Captain Carter',
      'Чудо-женщина': 'Wonder Woman',
      'Харли Квинн': 'Harley Quinn',
      'Супергёрл': 'Supergirl',
      'Бэтгерл': 'Batgirl',
      'Кэтвумен': 'Catwoman',
      'Ядовитый плющ': 'Poison Ivy',
      'Рейвен': 'Raven',
      'Старфайр': 'Starfire',
      'Мера': 'Mera',
      'Хищные птицы': 'Birds of Prey',
      'Черная канарейка': 'Black Canary',
      'Джессика Круз': 'Jessica Cruz'
    };
    
    if (nameMapping[hero]) {
      enName = nameMapping[hero];
    }
    
    suggestions.push({
      hero,
      translation: {
        ru: `${emoji} ${hero}`,
        en: `${emoji} ${enName}`
      }
    });
  });
  
  return suggestions;
}

function generateMissingButtonMappings() {
  const missing = findMissingFromButtonMap();
  const translationsMissing = findMissingFromTranslations();
  
  // Only generate button mappings for heroes that have translations
  const heroesWithTranslations = missing.filter(hero => !translationsMissing.includes(hero));
  
  const buttonMappings = [];
  heroesWithTranslations.forEach(hero => {
    if (heroTranslations[hero]) {
      const trans = heroTranslations[hero];
      buttonMappings.push({
        hero,
        ruButton: trans.ru,
        enButton: trans.en
      });
    }
  });
  
  return buttonMappings;
}

// Run analysis
function runAnalysis() {
  console.log('='.repeat(80));
  console.log('HERO MAPPING ANALYSIS REPORT');
  console.log('='.repeat(80));
  
  const allHeroes = getAllHeroes();
  const heroesInTranslations = getHeroesInTranslations();
  const heroesInButtonMap = getHeroesInButtonMap();
  const missingFromTranslations = findMissingFromTranslations();
  const missingFromButtonMap = findMissingFromButtonMap();
  const emojiConflicts = findEmojiConflicts();
  
  console.log(`\n📊 SUMMARY:`);
  console.log(`Total heroes in AI_HEROES: ${allHeroes.length}`);
  console.log(`  - Male heroes: ${AI_HEROES.male.length}`);
  console.log(`  - Female heroes: ${AI_HEROES.female.length}`);
  console.log(`Heroes with translations: ${heroesInTranslations.length}`);
  console.log(`Heroes with button mappings: ${heroesInButtonMap.length}`);
  console.log(`Missing from heroTranslations: ${missingFromTranslations.length}`);
  console.log(`Missing from buttonToHeroMap: ${missingFromButtonMap.length}`);
  console.log(`Emoji conflicts found: ${emojiConflicts.length}`);
  
  console.log(`\n❌ MISSING FROM HEROTRANSLATIONS (${missingFromTranslations.length}):`);
  missingFromTranslations.forEach((hero, index) => {
    const gender = AI_HEROES.male.includes(hero) ? 'male' : 'female';
    console.log(`${index + 1}. ${hero} (${gender})`);
  });
  
  console.log(`\n❌ MISSING FROM BUTTONTOHERROMAP (${missingFromButtonMap.length}):`);
  missingFromButtonMap.forEach((hero, index) => {
    const gender = AI_HEROES.male.includes(hero) ? 'male' : 'female';
    console.log(`${index + 1}. ${hero} (${gender})`);
  });
  
  if (emojiConflicts.length > 0) {
    console.log(`\n⚠️  EMOJI CONFLICTS (${emojiConflicts.length}):`);
    emojiConflicts.forEach((conflict, index) => {
      console.log(`${index + 1}. ${conflict.emoji} used by: ${conflict.heroes.join(', ')}`);
    });
  }
  
  // Generate missing translations
  const missingTranslations = generateMissingTranslations();
  if (missingTranslations.length > 0) {
    console.log(`\n✅ SUGGESTED HEROTRANSLATIONS ADDITIONS:`);
    console.log('// Add these to the heroTranslations object:');
    missingTranslations.forEach(suggestion => {
      console.log(`'${suggestion.hero}': { ru: '${suggestion.translation.ru}', en: '${suggestion.translation.en}' },`);
    });
  }
  
  // Generate missing button mappings
  const missingButtonMappings = generateMissingButtonMappings();
  if (missingButtonMappings.length > 0) {
    console.log(`\n✅ SUGGESTED BUTTONTOHERROMAP ADDITIONS:`);
    console.log('// Add these to the buttonToHeroMap object:');
    missingButtonMappings.forEach(mapping => {
      console.log(`'${mapping.ruButton}': '${mapping.hero}',`);
      console.log(`'${mapping.enButton}': '${mapping.hero}',`);
    });
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log('END OF REPORT');
  console.log('='.repeat(80));
}

// Run the analysis
runAnalysis();