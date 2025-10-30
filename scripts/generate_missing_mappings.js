// Generate missing mappings only
const missingHeroes = [
  // Marvel Male
  'Халк', 'Дэдпул', 'Росомаха', 'Человек-муравей', 'Блэк Пантер', 'Локи', 'Веном', 
  'Призрачный гонщик', 'Зимний солдат',
  
  // DC Male
  'Супермен', 'Бэтмен', 'Флэш', 'Зелёный фонарь', 'Аквамен', 'Киборг', 'Шазам', 
  'Зелёная стрела', 'Джокер', 'Найтвинг', 'Дэфстроук',
  
  // Anime Male
  'Гоку', 'Наруто', 'Луффи', 'Ичиго', 'Саитама', 'Эдвард Элрик', 'Лайт Ягами', 
  'Какаши', 'Сасукэ', 'Вегета', 'Пикколо', 'Натсу', 'Эрен Йегер', 'Леви Аккерман',
  
  // Slavic Male (missing from current)
  'Алеша Попович', 'Перун', 'Святогор',
  
  // Games/Movies Male
  'Кратос', 'Геральт из Ривии', 'Мастер Чиф', 'Данте', 'Субзиро', 'Скорпион', 
  'Рю', 'Кен', 'Соник', 'Марио', 'Линк', 'Клауд Страйф', 'Сефирот', 'Джон Уик', 
  'Терминатор', 'Хищник', 'Спаун', 'Альтаир', 'Эцио', 'Алекс Мерсер',
  
  // Marvel Female
  'Чёрная вдова', 'Гвен Стейси', 'Шторм', 'Джин Грей', 'Роуг', 'Китти Прайд', 
  'Псайлок', 'Мистик', 'Эмма Фрост', 'Небула', 'Капитан Картер',
  
  // DC Female
  'Чудо-женщина', 'Харли Квинн', 'Супергёрл', 'Бэтгерл', 'Кэтвумен', 'Ядовитый плющ', 
  'Рейвен', 'Старфайр', 'Мера', 'Хищные птицы', 'Черная канарейка', 'Джессика Круз',
  
  // Anime Female
  'Сейлор Мун', 'Мику Хацунэ', 'Сакура Харуно', 'Хината Хьюга', 'Цунадэ', 'Булма', 
  '18-й андроид', 'Эрза Скарлет', 'Микаса Аккерман', 'Рей Аянами', 'Асука Лэнгли', 
  'Фэй Валентайн', 'Нами', 'Nico Robin', 'Риас Гремори', 'Zero Two',
  
  // Star Wars Female
  'Рэй Скайуокер', 'Принцесса Лея', 'Ахсока Тано', 'Падме Амидала', 'Джайна Соло',
  
  // Games Female
  'Лара Крофт', 'Чун Ли', 'Соня Блейд', 'Китана', 'Джейд', 'Милина', 'Трисс Меригольд', 
  'Йеннифэр', 'Элли', 'Джилл Валентайн', 'Ада Вонг', 'Селин', 'Алиса Абернати', 
  'Принцесса Зельда', 'Самус Аран', 'Байонетта', 'Каратэ', 'Тифа Локхарт', 'Аэрис',
  
  // Slavic Female (missing)
  'Берегиня', 'Русалка',
  
  // Disney Female
  'Эльза', 'Анна', 'Мулан', 'Покахонтас', 'Мерида', 'Моана'
];

const heroTranslations = [
  // Marvel Male
  { hero: 'Халк', ru: '💚 Халк', en: '💚 Hulk' },
  { hero: 'Дэдпул', ru: '🔴 Дэдпул', en: '🔴 Deadpool' },
  { hero: 'Росомаха', ru: '🦾 Росомаха', en: '🦾 Wolverine' },
  { hero: 'Человек-муравей', ru: '🐜 Человек-муравей', en: '🐜 Ant-Man' },
  { hero: 'Блэк Пантер', ru: '🐾 Блэк Пантер', en: '🐾 Black Panther' },
  { hero: 'Локи', ru: '🐍 Локи', en: '🐍 Loki' },
  { hero: 'Веном', ru: '🖤 Веном', en: '🖤 Venom' },
  { hero: 'Призрачный гонщик', ru: '🔥 Призрачный гонщик', en: '🔥 Ghost Rider' },
  { hero: 'Зимний солдат', ru: '🧊 Зимний солдат', en: '🧊 Winter Soldier' },
  
  // DC Male
  { hero: 'Супермен', ru: '🚀 Супермен', en: '🚀 Superman' },
  { hero: 'Бэтмен', ru: '🦇 Бэтмен', en: '🦇 Batman' },
  { hero: 'Флэш', ru: '💨 Флэш', en: '💨 Flash' },
  { hero: 'Зелёный фонарь', ru: '💍 Зелёный фонарь', en: '💍 Green Lantern' },
  { hero: 'Аквамен', ru: '🌊 Аквамен', en: '🌊 Aquaman' },
  { hero: 'Киборг', ru: '🔧 Киборг', en: '🔧 Cyborg' },
  { hero: 'Шазам', ru: '🌩️ Шазам', en: '🌩️ Shazam' },
  { hero: 'Зелёная стрела', ru: '🎯 Зелёная стрела', en: '🎯 Green Arrow' },
  { hero: 'Джокер', ru: '🃏 Джокер', en: '🃏 Joker' },
  { hero: 'Найтвинг', ru: '🦅 Найтвинг', en: '🦅 Nightwing' },
  { hero: 'Дэфстроук', ru: '⚔️ Дэфстроук', en: '⚔️ Deathstroke' },
  
  // Anime Male
  { hero: 'Гоку', ru: '🥋 Гоку', en: '🥋 Goku' },
  { hero: 'Наруто', ru: '🍥 Наруто', en: '🍥 Naruto' },
  { hero: 'Луффи', ru: '🎩 Луффи', en: '🎩 Luffy' },
  { hero: 'Ичиго', ru: '🗡️ Ичиго', en: '🗡️ Ichigo' },
  { hero: 'Саитама', ru: '👊 Саитама', en: '👊 Saitama' },
  { hero: 'Эдвард Элрик', ru: '⚗️ Эдвард Элрик', en: '⚗️ Edward Elric' },
  { hero: 'Лайт Ягами', ru: '📓 Лайт Ягами', en: '📓 Light Yagami' },
  { hero: 'Какаши', ru: '👁️ Какаши', en: '👁️ Kakashi' },
  { hero: 'Сасукэ', ru: '🗲 Сасукэ', en: '🗲 Sasuke' },
  { hero: 'Вегета', ru: '👑 Вегета', en: '👑 Vegeta' },
  { hero: 'Пикколо', ru: '🧘 Пикколо', en: '🧘 Piccolo' },
  { hero: 'Натсу', ru: '🔥 Натсу', en: '🔥 Natsu' },
  { hero: 'Эрен Йегер', ru: '🗿 Эрен Йегер', en: '🗿 Eren Yeager' },
  { hero: 'Леви Аккерман', ru: '🪓 Леви Аккерман', en: '🪓 Levi Ackerman' },
  
  // Slavic Male (note: different from current Алёша Попович)
  { hero: 'Алеша Попович', ru: '🏹 Алеша Попович', en: '🏹 Alesha Popovich' },
  { hero: 'Перун', ru: '🌩️ Перун', en: '🌩️ Perun' },
  { hero: 'Святогор', ru: '⛰️ Святогор', en: '⛰️ Svyatogor' },
  
  // Games Male
  { hero: 'Кратос', ru: '🪓 Кратос', en: '🪓 Kratos' },
  { hero: 'Геральт из Ривии', ru: '🐺 Геральт из Ривии', en: '🐺 Geralt of Rivia' },
  { hero: 'Мастер Чиф', ru: '🎖️ Мастер Чиф', en: '🎖️ Master Chief' },
  { hero: 'Данте', ru: '🔥 Данте', en: '🔥 Dante' },
  { hero: 'Субзиро', ru: '❄️ Субзиро', en: '❄️ Sub-Zero' },
  { hero: 'Скорпион', ru: '🦂 Скорпион', en: '🦂 Scorpion' },
  { hero: 'Рю', ru: '👨‍🥋 Рю', en: '👨‍🥋 Ryu' },
  { hero: 'Кен', ru: '🔥 Кен', en: '🔥 Ken' },
  { hero: 'Соник', ru: '💨 Соник', en: '💨 Sonic' },
  { hero: 'Марио', ru: '🍄 Марио', en: '🍄 Mario' },
  { hero: 'Линк', ru: '🗡️ Линк', en: '🗡️ Link' },
  { hero: 'Клауд Страйф', ru: '⚔️ Клауд Страйф', en: '⚔️ Cloud Strife' },
  { hero: 'Сефирот', ru: '🗡️ Сефирот', en: '🗡️ Sephiroth' },
  { hero: 'Джон Уик', ru: '🔫 Джон Уик', en: '🔫 John Wick' },
  { hero: 'Терминатор', ru: '🤖 Терминатор', en: '🤖 Terminator' },
  { hero: 'Хищник', ru: '👽 Хищник', en: '👽 Predator' },
  { hero: 'Спаун', ru: '🔥 Спаун', en: '🔥 Spawn' },
  { hero: 'Альтаир', ru: '🦅 Альтаир', en: '🦅 Altair' },
  { hero: 'Эцио', ru: '🏛️ Эцио', en: '🏛️ Ezio' },
  { hero: 'Алекс Мерсер', ru: '🧬 Алекс Мерсер', en: '🧬 Alex Mercer' },
  
  // Marvel Female
  { hero: 'Чёрная вдова', ru: '🕷️ Чёрная вдова', en: '🕷️ Black Widow' },
  { hero: 'Гвен Стейси', ru: '🕸️ Гвен Стейси', en: '🕸️ Gwen Stacy' },
  { hero: 'Шторм', ru: '⛈️ Шторм', en: '⛈️ Storm' },
  { hero: 'Джин Грей', ru: '🔥 Джин Грей', en: '🔥 Jean Grey' },
  { hero: 'Роуг', ru: '💀 Роуг', en: '💀 Rogue' },
  { hero: 'Китти Прайд', ru: '👻 Китти Прайд', en: '👻 Kitty Pryde' },
  { hero: 'Псайлок', ru: '🗡️ Псайлок', en: '🗡️ Psylocke' },
  { hero: 'Мистик', ru: '💙 Мистик', en: '💙 Mystique' },
  { hero: 'Эмма Фрост', ru: '💎 Эмма Фрост', en: '💎 Emma Frost' },
  { hero: 'Небула', ru: '🌌 Небула', en: '🌌 Nebula' },
  { hero: 'Капитан Картер', ru: '🛡️ Капитан Картер', en: '🛡️ Captain Carter' },
  
  // DC Female
  { hero: 'Чудо-женщина', ru: '⭐ Чудо-женщина', en: '⭐ Wonder Woman' },
  { hero: 'Харли Квинн', ru: '🎭 Харли Квинн', en: '🎭 Harley Quinn' },
  { hero: 'Супергёрл', ru: '💫 Супергёрл', en: '💫 Supergirl' },
  { hero: 'Бэтгерл', ru: '🦇 Бэтгерл', en: '🦇 Batgirl' },
  { hero: 'Кэтвумен', ru: '🐱 Кэтвумен', en: '🐱 Catwoman' },
  { hero: 'Ядовитый плющ', ru: '🌿 Ядовитый плющ', en: '🌿 Poison Ivy' },
  { hero: 'Рейвен', ru: '🌙 Рейвен', en: '🌙 Raven' },
  { hero: 'Старфайр', ru: '🔥 Старфайр', en: '🔥 Starfire' },
  { hero: 'Мера', ru: '🌊 Мера', en: '🌊 Mera' },
  { hero: 'Хищные птицы', ru: '🦅 Хищные птицы', en: '🦅 Birds of Prey' },
  { hero: 'Черная канарейка', ru: '🐦 Черная канарейка', en: '🐦 Black Canary' },
  { hero: 'Джессика Круз', ru: '💍 Джессика Круз', en: '💍 Jessica Cruz' },
  
  // More female heroes...
  { hero: 'Сейлор Мун', ru: '🌙 Сейлор Мун', en: '🌙 Sailor Moon' },
  { hero: 'Мику Хацунэ', ru: '🎤 Мику Хацунэ', en: '🎤 Hatsune Miku' },
  { hero: 'Лара Крофт', ru: '🗿 Лара Крофт', en: '🗿 Lara Croft' },
  { hero: 'Принцесса Лея', ru: '👸 Принцесса Лея', en: '👸 Princess Leia' },
  { hero: 'Эльза', ru: '❄️ Эльза', en: '❄️ Elsa' },
  { hero: 'Анна', ru: '🌸 Анна', en: '🌸 Anna' }
];

console.log('// ===== SUGGESTED HEROTRANSLATIONS ADDITIONS =====');
heroTranslations.forEach(item => {
  console.log(`'${item.hero}': { ru: '${item.ru}', en: '${item.en}' },`);
});

console.log('\n// ===== SUGGESTED BUTTONTOHERROMAP ADDITIONS =====');
heroTranslations.forEach(item => {
  console.log(`'${item.ru}': '${item.hero}',`);
  console.log(`'${item.en}': '${item.hero}',`);
});