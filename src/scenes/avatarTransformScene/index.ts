import { Markup, Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { getMainMenuText } from '@/navigation'
import { getUserPhotoUrl } from '@/middlewares/getUserPhotoUrl'
import { logger } from '@/utils/logger'
import { redactBotToken } from '@/utils/redactBotToken'
import { ModeEnum } from '@/interfaces/modes'
import { sendPhotoWithFallback } from '@/helpers/sendPhotoWithFallback'
import { avatarActionCaption, avatarActionKeyboard } from './actionPrompt'
import {
  avatarModelCard,
  avatarModelDisplayName,
  avatarModelFromButton,
  avatarModelKeyboard,
  avatarModelPriority,
} from './models'
import { checkAvatarTransformUsage } from '@/core/supabase/checkAvatarTransformUsage'
import { markAvatarTransformUsed } from '@/core/supabase/markAvatarTransformUsed'
// 🚨 HERO VALIDATION SYSTEM
import { HeroValidationService } from '@/services/HeroValidationService'
import type { HeroName, Gender } from '@/types/heroes'
// 🦸‍♂️ NEW GENERATION LIMITS SYSTEM
import { checkSuperheroGenerationUsage } from '@/core/supabase/checkSuperheroGenerationUsage'
import { incrementSuperheroGeneration } from '@/core/supabase/incrementSuperheroGeneration'
import {
  getGenerationLimitMessage,
  getSuccessGenerationMessage,
} from '@/helpers/getGenerationLimitMessage'
import { getBotNameByToken } from '@/core/bot'
// Импортируем все модели для генерации с fallback логикой
import { generateFluxKontextMax } from '@/services/generateFluxKontextMax'
import { generateSeeDream45 } from '@/services/generateSeeDream45'
import { generateNanoBanana } from '@/services/generateNanoBanana'
import { generateGptImage25 } from '@/services/generateGptImage25'
// Legacy fallback
import { generateFluxKontext } from '@/services/generateFluxKontext'
import { isBalanceRefusal } from '@/price/helpers/isBalanceRefusal'
import { standardButtons } from '@/navigation/helpers/actionButtons'

// 🔴 DEBUG: Log when this scene loads (import time)
console.log('🔴 [DEBUG avatarTransform] Module loaded')

// 🦸‍♂️ AI HEROES - Simplified Top 10 Most Popular Heroes + Custom Option
const AI_HEROES = {
  male: [
    // Top 10 Most Popular Heroes (Based on Analytics)
    'Человек-паук',
    'Железный человек',
    'Бэтмен',
    'Супермен',
    'Капитан Америка',
    'Тор',
    'Дэдпул',
    'Росомаха',
    'Халк',
    'Доктор Стрэндж',
    // Custom prompt option
    'Кастомный промпт',
  ],
  female: [
    // Top 10 Most Popular Female Heroes (Based on Analytics)
    'Скарлет Витч',
    'Капитан Марвел',
    'Чудо-женщина',
    'Чёрная вдова',
    'Харли Квинн',
    'Супергёрл',
    'Гвен Стейси',
    'Василиса Прекрасная',
    'Лара Крофт',
    'Эльза',
    // Custom prompt option
    'Кастомный промпт',
  ],
}

// Функция для создания детального промпта с конкретным героем
const createMarvelPromptByGender = (
  gender: 'male' | 'female',
  heroName: string
): string => {
  const baseSettings = `[Cinematic portrait photography. Medium shot. Aspect ratio 9:16. Professional studio lighting with dramatic effects]`

  // Детальные промпты для каждого героя с уникальными атрибутами
  const heroPrompts: Record<string, string> = {
    // МУЖСКИЕ ГЕРОИ - БЕЗОПАСНЫЕ, НО УЗНАВАЕМЫЕ ПРОМПТЫ
    'Человек-паук': `${baseSettings} A charismatic ${
      gender === 'male' ? 'man' : 'woman'
    } in red and blue athletic outfit with web-like patterns. ${
      gender === 'male' ? 'Athletic build' : 'Athletic silhouette'
    }. Stylish clear glasses. Dynamic pose with hands positioned as if casting webs. Background with urban cityscape elements and geometric web patterns in blue and red colors. Superhero aesthetic with confident expression and energetic atmosphere.`,

    'Железный человек': `${baseSettings} A confident ${
      gender === 'male' ? 'man' : 'woman'
    } in sleek red and gold high-tech styled outfit. ${
      gender === 'male' ? 'Strong jawline' : 'Elegant features'
    }. Circular glowing element on chest area. One hand raised with glowing palm effect. Background with technological elements and holographic displays in blue and gold. Modern tech aesthetic with sharp, clean lines.`,

    'Капитан Америка': `${baseSettings} A heroic ${
      gender === 'male' ? 'man' : 'woman'
    } in blue outfit with white star emblem. ${
      gender === 'male' ? 'Strong patriotic stance' : 'Confident patriotic pose'
    }. Holding a circular shield-like prop. Red, white and blue color palette throughout. Background with patriotic elements and geometric patterns. Classic heroic lighting with strong shadows and highlights.`,

    'Доктор Стрэндж': `${baseSettings} A mystical ${
      gender === 'male' ? 'man' : 'woman'
    } in elegant dark blue outfit with golden trim and mystical symbols. ${
      gender === 'male' ? 'Distinguished goatee' : 'Mystical elegance'
    }. Hands positioned in magical gestures with orange and golden light effects. Floating geometric mandalas and mystical symbols in background. Rich colors with deep blues, golds, and warm orange magical energy.`,

    'Соколиный глаз': `${baseSettings} A skilled ${
      gender === 'male' ? 'man' : 'woman'
    } in tactical purple and black outfit with precision gear. ${
      gender === 'male' ? 'Sharp focused expression' : 'Precise archer stance'
    }. Holding a bow-like prop with arrows visible. Target-like patterns in background with purple and silver accents. Urban rooftop setting with precise lighting and clean composition.`,

    'Звёздный лорд': `${baseSettings} A charismatic ${
      gender === 'male' ? 'man' : 'woman'
    } in stylish red leather jacket with tech elements. ${
      gender === 'male' ? 'Confident smirk' : 'Adventure-ready pose'
    }. Retro-futuristic headphones around neck. Holding dual energy blaster props. Background with cosmic elements and 80s-inspired neon colors. Mix of retro and space aesthetics with pink, blue, and gold lighting.`,

    Дэдпул: `${baseSettings} A charismatic ${
      gender === 'male' ? 'man' : 'woman'
    } in red and black tactical outfit with mask-like eye elements. ${
      gender === 'male' ? 'Confident action pose' : 'Dynamic combat stance'
    }. Dual katana swords crossed on back. Black tactical accessories and belt with pouches. Hands in characteristic finger-gun pose. Background with urban rooftop elements and dramatic lighting with red and black color scheme. Anti-hero aesthetic with edgy, rebellious atmosphere.`,

    Халк: `${baseSettings} A powerful ${
      gender === 'male' ? 'man' : 'woman'
    } in purple and green athletic outfit with torn fabric effects. ${
      gender === 'male' ? 'Massive muscular build' : 'Strong powerful frame'
    }. Green body paint or lighting effects. Clenched fists in rage pose. Wild, messy hair. Background with destruction effects and green energy. Dramatic lighting with green and purple colors. Incredible strength aesthetic with intense, fierce expression.`,

    Тор: `${baseSettings} A mighty ${
      gender === 'male' ? 'Norse god' : 'Norse goddess'
    } in royal blue and silver Asgardian armor with cape. ${
      gender === 'male' ? 'Godlike powerful stance' : 'Divine warrior pose'
    }. Mystical hammer (Mjolnir) in hand with lightning effects. Blonde hair flowing with wind and power. Lightning bolts crackling around the figure. Red cape billowing dramatically. Background with stormy skies and Asgardian architecture. Blue and silver lightning effects with divine golden light. Thor aesthetic with Norse mythology power.`,

    Шури: `${baseSettings} A brilliant ${
      gender === 'male' ? 'Wakandan inventor' : 'Wakandan princess'
    } in sleek purple and silver tech outfit with African patterns. ${
      gender === 'male' ? 'Tech genius stance' : 'Princess inventor pose'
    }. Advanced Wakandan technology gauntlets on hands. Kimoyo beads glowing blue around wrists. Short natural hair in elegant style. Background with high-tech Wakandan laboratory and vibranium elements. Purple and blue tech lighting with African geometric patterns. Shuri aesthetic with technological innovation.`,

    Валькирия: `${baseSettings} A fierce ${
      gender === 'male' ? 'Asgardian warrior' : 'Asgardian valkyrie'
    } in white and blue armor with winged helmet. ${
      gender === 'male' ? 'Elite warrior stance' : 'Valkyrie battle pose'
    }. Distinctive winged helmet with silver and blue design. Dragonfang sword in hand with mystical energy. White and blue Asgardian armor with intricate patterns. Background with rainbow bridge and Asgardian warriors. White and blue divine lighting with rainbow bridge effects. Valkyrie aesthetic with Asgardian honor.`,

    Гамора: `${baseSettings} A deadly ${
      gender === 'male' ? 'cosmic assassin' : 'cosmic assassin'
    } in black and green tactical outfit with weapon harness. ${
      gender === 'male' ? 'Master assassin stance' : 'Gamora warrior pose'
    }. Green skin with intricate facial markings. Dual curved swords crossed on back. Black tactical outfit with green accents and armor plates. Long dark hair in warrior braids. Background with cosmic space and galaxy elements. Green and black assassin lighting with space atmosphere. Gamora aesthetic with cosmic deadliness.`,

    Росомаха: `${baseSettings} A rugged ${
      gender === 'male' ? 'man' : 'woman'
    } in brown and yellow leather outfit with animal-like elements. ${
      gender === 'male' ? 'Wild, fierce expression' : 'Fierce warrior stance'
    }. Metal claws props extending from knuckles. Dark wild hair in distinctive style. Leather jacket with fur collar. Background with forest and wilderness elements. Dramatic lighting with golden and brown tones. Wild, animalistic aesthetic with savage intensity.`,

    Веном: `${baseSettings} A menacing ${
      gender === 'male' ? 'man' : 'woman'
    } in black symbiote-inspired outfit with organic textures. ${
      gender === 'male' ? 'Predatory alien stance' : 'Symbiotic hunter pose'
    }. Black outfit with white spider emblem. Organic, flowing fabric that seems alive. Sharp, angular design elements. Aggressive pose with clawed hands. Background with dark urban environment and alien effects. Dark lighting with black and white contrasts. Alien symbiote aesthetic with threatening presence.`,

    // 🚨 КРИТИЧЕСКИЕ ДОБАВЛЕННЫЕ ГЕРОИ
    Бэтмен: `${baseSettings} A mysterious ${
      gender === 'male' ? 'vigilante' : 'vigilante'
    } in sleek black tactical outfit with cape. ${
      gender === 'male' ? 'Dark knight stance' : 'Gotham guardian pose'
    }. Black armored suit with bat emblem on chest. Utility belt with tactical gear. Long flowing cape billowing dramatically. Pointed cowl with white eye lenses. Background with Gotham City skyline and dramatic shadows. Dark atmospheric lighting with blue and gray tones. Batman aesthetic with gothic architecture elements.`,

    Супермен: `${baseSettings} A heroic ${
      gender === 'male' ? 'man' : 'woman'
    } in iconic blue and red suit with cape. ${
      gender === 'male' ? 'Man of steel stance' : 'Supergirl pose'
    }. Bright blue suit with red cape flowing in wind. Distinctive S-shield emblem on chest. Red boots and belt. Confident superhero pose with hands on hips. Background with bright sky and Metropolis cityscape. Bright heroic lighting with blue and red colors. Classic Superman aesthetic with hope and strength.`,

    'Чудо-женщина': `${baseSettings} A powerful ${
      gender === 'male' ? 'Amazonian warrior' : 'Amazon princess'
    } in golden and red warrior outfit with armor. ${
      gender === 'male' ? 'Divine warrior stance' : 'Wonder Woman pose'
    }. Golden eagle armor breastplate with red and blue elements. Golden tiara with red star. Indestructible bracelets on wrists. Lasso of Truth glowing golden at side. Long dark hair flowing with divine wind. Background with ancient Greek columns and divine light. Golden and red lighting with mythological elements. Wonder Woman aesthetic with Amazonian strength.`,

    'Чёрная вдова': `${baseSettings} A skilled ${
      gender === 'male' ? 'spy assassin' : 'spy assassin'
    } in black tactical suit with red accents. ${
      gender === 'male' ? 'Elite spy stance' : 'Black Widow pose'
    }. Sleek black catsuit with red belt and accents. Widow's Bite bracelets glowing blue on wrists. Dual pistol holsters on thighs. Red hair in perfect spy style. Background with high-tech espionage equipment and city lights. Dramatic lighting with black and red spy aesthetic. Black Widow style with Russian spy elements.`,

    'Харли Квинн': `${baseSettings} A chaotic ${
      gender === 'male' ? 'anti-hero' : 'anti-hero'
    } in colorful punk outfit with baseball bat. ${
      gender === 'male' ? 'Chaotic jester stance' : 'Harley Quinn pose'
    }. Red and blue pigtails with pink and blue hair tips. Colorful roller derby outfit with diamonds pattern. Baseball bat with "Good Night" written on it. Roller skates with bright colors. Background with carnival chaos and Gotham graffiti. Bright chaotic lighting with pink and blue neon colors. Harley Quinn aesthetic with punk rock rebellion.`,

    Супергёрл: `${baseSettings} A confident ${
      gender === 'male' ? 'Kryptonian hero' : 'Kryptonian heroine'
    } in blue and red suit with cape and skirt. ${
      gender === 'male' ? 'Young Superman stance' : 'Supergirl pose'
    }. Bright blue suit with red cape and red skirt. House of El S-shield on chest. Red boots and belt. Blonde hair flowing in heroic wind. Confident smile with hands on hips. Background with National City skyline and bright blue sky. Bright optimistic lighting with blue and red heroic colors. Supergirl aesthetic with youthful hope and strength.`,

    Локи: `${baseSettings} A mischievous ${
      gender === 'male' ? 'god' : 'goddess'
    } in elegant green and gold Asgardian outfit with flowing cape. ${
      gender === 'male' ? 'Cunning trickster stance' : 'Regal deceptive pose'
    }. Ornate horned helmet with curved golden horns. Green leather and gold armor with intricate Norse patterns. Scepter with glowing blue gem. Long black hair styled elegantly. Background with Asgardian palace and magical energy. Dramatic lighting with green and gold colors. Trickster god aesthetic with charismatic malevolence.`,

    // ЖЕНСКИЕ ГЕРОИ - БЕЗОПАСНЫЕ, НО УЗНАВАЕМЫЕ ПРОМПТЫ
    'Капитан Марвел': `${baseSettings} A powerful ${
      gender === 'male' ? 'man' : 'woman'
    } in cosmic-themed outfit with red, blue and gold colors. ${
      gender === 'male' ? 'Cosmic power stance' : 'Strong cosmic warrior pose'
    }. Hands glowing with golden energy effects. Short practical hair with golden highlights. Background with cosmic elements and star patterns. Dramatic lighting with golden energy flowing around the figure.`,

    'Скарлет Витч': `${baseSettings} A mystical ${
      gender === 'male' ? 'man' : 'woman'
    } in elegant red outfit with flowing cape and mystical accessories. ${
      gender === 'male'
        ? 'Mystical commanding presence'
        : 'Graceful mystical pose'
    }. Hands surrounded by crimson energy effects and floating particles. Long flowing hair with red highlights. Background with magical symbols and red energy patterns. Dramatic lighting with warm reds and mystical atmosphere.`,

    'Алая ведьма': `${baseSettings} A magical ${
      gender === 'male' ? 'man' : 'woman'
    } in dark red mystical robes with intricate golden patterns. ${
      gender === 'male' ? 'Powerful sorcerer stance' : 'Enchanting magical pose'
    }. Hands creating swirling red energy with magical particles. Detailed mystical jewelry and accessories. Background with ancient magical symbols and swirling red energy. Rich deep colors with crimson and gold magical effects.`,

    // СЛАВЯНСКИЕ СКАЗОЧНЫЕ ГЕРОИ
    'Иван-царевич': `${baseSettings} A noble ${
      gender === 'male' ? 'young prince' : 'princess'
    } in traditional Russian royal outfit with red and gold embroidery. Rich velvet caftan with golden patterns. Fur-trimmed hat or crown. Holding a decorative sword. Background with Russian palace elements, birch trees, and golden onion domes. Warm fairytale lighting with red and gold accents.`,

    'Илья Муромец': `${baseSettings} A mighty ${
      gender === 'male' ? 'warrior' : 'warrior woman'
    } in Viktor Vasnetsov epic style. Ancient Rus chainmail armor with Orthodox cross, conical helmet, massive sword Kladenets. Mounted on black horse. Russian steppe, distant monastery. Romantic realism oil painting style, dramatic lighting.`,

    'Добрыня Никитич': `${baseSettings} A brave ${
      gender === 'male' ? 'knight' : 'female warrior'
    } in golden Russian armor with dragon motifs. Noble stance with spear and round shield. Blonde hair and kind expression. Background with defeated dragon silhouette and Russian countryside. Golden hour lighting with warm tones.`,

    'Алёша Попович': `${baseSettings} A clever ${
      gender === 'male' ? 'young warrior' : 'warrior maiden'
    } in light Russian armor with playful elements. Mischievous smile. Holding a bow and arrows. Agile pose suggesting quick wit. Background with Russian village and church domes. Bright, cheerful lighting.`,

    'Кощей Бессмертный': `${baseSettings} A mystical ${
      gender === 'male' ? 'immortal sorcerer' : 'immortal sorceress'
    } in dark ornate robes with bone and skull motifs. Tall, thin silhouette. Glowing green eyes. Holding a magical staff with crystal. Background with dark castle and treasure chests. Eerie green and purple lighting with magical effects.`,

    'Серый Волк': `${baseSettings} A wise ${
      gender === 'male' ? 'man' : 'woman'
    } in wolf-themed outfit with grey fur elements. Wolf ears accessory. Silver and grey color palette. Loyal and protective stance. Background with moonlit forest and wolf pack silhouettes. Cool blue moonlight with silver accents.`,

    Емеля: `${baseSettings} A lucky ${
      gender === 'male' ? 'young man' : 'young woman'
    } in simple Russian peasant clothes sitting on a decorative stove-throne. Relaxed, carefree pose. Holding a magical pike fish. Background with Russian village and magical sparkles. Warm, cozy lighting with magical golden particles.`,

    // СОВРЕМЕННЫЕ ГЕРОИ
    Киборг: `${baseSettings} A futuristic ${
      gender === 'male' ? 'man' : 'woman'
    } in high-tech cybernetic outfit with metallic silver and blue elements. ${
      gender === 'male'
        ? 'Strong cybernetic build'
        : 'Sleek cybernetic silhouette'
    }. Glowing blue LED accents on arms and chest. One eye with subtle tech enhancement glow. Confident stance with technological pose. Background with futuristic cityscape and holographic displays. Cool blue and silver lighting with tech atmospheric effects.`,

    // СЛАВЯНСКИЕ СКАЗОЧНЫЕ ГЕРОИНИ
    'Василиса Прекрасная': `${baseSettings} A beautiful ${
      gender === 'male' ? 'prince' : 'princess'
    } in magnificent royal blue sarafan with intricate golden thread embroidery depicting firebirds and flowers. Floor-length dress with wide sleeves. Long blonde hair in elaborate thick braid with red silk ribbon. Ornate pearl-encrusted kokoshnik headdress with hanging pearls framing face. Delicate golden jewelry - earrings and necklaces. Holding small magical wooden doll (helping doll) with painted face. Graceful, serene expression with bright blue eyes. Background: opulent Russian boyar palace with carved wooden decorations, blooming rose garden, golden onion domes visible in distance. Soft romantic fairytale lighting with pink sunset glow and golden highlights.`,

    'Баба Яга': `${baseSettings} A mystical ${
      gender === 'male' ? 'wizard' : 'witch'
    } in tattered brown and grey robes made of forest materials - moss, bark, dried leaves. Wild long grey hair with twigs braided in. Natural elderly human face with wrinkles and mischievous expression, cunning grin. Hunched posture with gnarled wooden walking stick. Holding traditional Russian broom made of birch twigs and stone mortar (stupa). Necklace of small bones and forest trinkets. Background: iconic hut standing on giant chicken legs, dark enchanted forest with glowing mushrooms, twisted ancient trees, ravens perched on branches. Mysterious lighting with green and purple magical mist, moonbeams filtering through fog.`,

    Снегурочка: `${baseSettings} A gentle ${
      gender === 'male' ? 'snow prince' : 'snow maiden'
    } in flowing white and silver dress with snowflake patterns. White ermine fur trim on sleeves and hem. Long platinum blonde hair almost white, decorated with snowflake ornaments. Ethereal ice-crystal kokoshnik crown with hanging crystal beads. Natural human face with pale skin and bright ice-blue eyes. Delicate silver jewelry with crystal gems. Graceful pose with arms extended. Background: winter wonderland with snow-covered pine forest, crystal ice palace with spires, northern lights aurora borealis in sky. Cool blue and silver lighting with crystalline sparkles and frost effects everywhere.`,

    'Марья Моревна': `${baseSettings} A fierce ${
      gender === 'male' ? 'warrior prince' : 'warrior princess'
    } in ornate Russian battle armor with traditional motifs - double-headed eagles, orthodox crosses, Slavic patterns. Silver chainmail under decorated breastplate. Long dark hair in warrior braid with metal ornaments. Red cloak with golden trim flowing behind. Determined fierce expression with steel-grey eyes. Holding traditional Russian sword (kladenets) with ornate handle and round shield with royal coat of arms. High leather boots with metal studs. Battle-ready stance. Background: medieval Russian battlefield with army banners, defeated dark sorcerer Koschei in chains, ancient fortress walls, ravens circling overhead. Dramatic golden hour lighting with storm clouds, heroic atmosphere with rays of sunlight breaking through.`,

    Алёнушка: `${baseSettings} A gentle ${
      gender === 'male' ? 'young man' : 'young maiden'
    } in simple but beautiful Russian peasant dress - white linen shirt with puffed sleeves, blue sarafan with floral embroidery. Long brown hair in single braid with wildflower crown. Sad but beautiful expression with large expressive brown eyes, tears barely visible. Bare feet dangling in pond water. Sitting on large stone by water's edge. Holding dried herbs or wildflowers. Delicate features with rosy cheeks despite melancholy. Background: serene Russian countryside pond with white water lilies, silver birch trees with hanging branches, wooden bridge in distance, dragonflies hovering over water. Soft melancholic lighting with green nature tones, late afternoon golden light filtering through leaves.`,

    'Жар-птица': `${baseSettings} A radiant ${
      gender === 'male' ? 'person' : 'person'
    } in magnificent outfit made of real fire-colored feathers - deep reds, bright oranges, golden yellows. Feathered wings attached to arms that seem to glow from within. Crown of flame-shaped feathers rising from head. Golden beak-like mask over nose. Body suit covered in iridescent feathers that shift colors like real fire. Glowing golden skin with warm light emanating from within. Arms raised with magical golden sparks and flames dancing around fingers. Majestic poses suggesting flight. Background: magical garden with golden apple trees bearing glowing fruit, ornate Russian palace in background, other magical firebirds flying in sky. Brilliant warm lighting with actual fire effects, golden hour glow, magical sparkles everywhere.`,

    'Царевна-лягушка': `${baseSettings} A wise ${
      gender === 'male' ? 'prince' : 'princess'
    } in elegant emerald green royal gown with lily pad patterns and water ripple textures, pearl accents like dewdrops. Intricate crown designed like lotus flowers and lily pads with small gems. Long dark hair with aquatic flowers braided in. Natural human face with wise, mystical expression and large green eyes. Subtle green theatrical makeup. Holding ornate silver arrow with fletching and decorative tip. Graceful pose near water. Small decorative frog companions sitting nearby. Background: magical pond with giant lily pads, lotus flowers, ornate Russian palace in background, swans swimming, reflection of full moon on water surface. Magical lighting with green sparkles, moonbeams, ethereal mist rising from water.`,

    Мальвина: `${baseSettings} A graceful ${
      gender === 'male' ? 'person' : 'person'
    } in magnificent powder blue Victorian ball gown with enormous puffy sleeves, corseted waist, and full layered skirt. Bright sky-blue curly hair in elaborate ringlets with large pink satin bow. Natural human face with porcelain doll-like perfect makeup - rosy round cheeks, red cupid's bow lips, long dark eyelashes. Holding wooden pointer stick with authority. White lace gloves and blue dancing shoes. Perfect posture with chin raised elegantly. Background: puppet theater stage with red velvet curtains, wooden school desk with chalkboard showing alphabet, vintage schoolroom with inkwell and quill pens. Soft theatrical lighting with warm golden spotlights, elegant ballroom atmosphere.`,

    'Красная Шапочка': `${baseSettings} A brave ${
      gender === 'male' ? 'young man' : 'young girl'
    } in iconic bright red hooded cape lined with white fur, flowing behind. Blue peasant dress with white apron and puffed sleeves. Blonde hair in braids peeking from hood. Rosy cheeks and bright blue innocent eyes. Carrying wicker basket with checkered cloth cover, baked goods visible inside - pies, bread rolls, bottles of milk and honey. White knee-high stockings and brown leather shoes. Innocent but intelligent expression with slight concern. Background: enchanted forest path with tall pine and oak trees, grandmother's cottage with chimney smoke in distance, wildflowers along path, hidden wolf eyes glowing from bushes. Classic fairy tale storybook lighting with dappled sunlight through leaves, warm golden atmosphere with mysterious shadows.`,

    Золушка: `${baseSettings} A elegant ${
      gender === 'male' ? 'prince' : 'princess'
    } in magnificent transformation from rags to riches. Sparkly silver and blue ball gown with layers of tulle and silk, corseted bodice with intricate beadwork. Long blonde hair in elaborate updo with tiara. Single crystal glass slipper on foot, other foot bare showing elegant arch. Fairy godmother's magic wand nearby with sparkles. Delicate features with kind blue eyes and gentle smile. Pearl necklace and earrings. Graceful dancing pose with arms extended. Background: opulent palace ballroom with crystal chandeliers, golden pumpkin carriage with white horses waiting outside, magical sparkles and stars everywhere, clock showing almost midnight. Magical transformation lighting with gold and silver sparkles, dreamy blue moonlight, enchanted atmosphere.`,

    'Снежная Королева': `${baseSettings} A regal ${
      gender === 'male' ? 'ice king' : 'ice queen'
    } in stunning crystalline ice dress that seems carved from single glacier, with sharp geometric patterns and frost textures. Floor-length cape of white ermine fur with icicle trim. Elaborate ice crown with tall sharp points like icicles, embedded with diamonds and crystals. Platinum white hair in elegant updo with ice crystal ornaments. Pale skin with slight blue undertone, frost patterns on cheeks. Cold, piercing ice-blue eyes with no warmth. Long white gloves reaching to elbows. Regal, commanding posture with one hand holding ice scepter. Background: magnificent ice palace with crystal spires reaching toward sky, throne made of ice and snow, northern lights (aurora borealis) dancing in night sky, snow-covered landscape stretching to horizon. Icy blue and silver lighting with crystal reflections, frost effects on everything, magical winter wonderland atmosphere.`,

    Алиса: `${baseSettings} A curious ${
      gender === 'male' ? 'young man' : 'young girl'
    } in classic Victorian blue dress with white pinafore apron, puffed sleeves and high collar. Long blonde hair with black velvet headband or hair ribbon. White stockings and black Mary Jane shoes. Bright curious blue eyes with wonder-filled expression. Holding ornate playing cards (Queens and Kings) that seem to move magically, or delicate porcelain teacup with floral pattern. White lace gloves. Adventurous pose as if stepping through mirror or falling. Background: fantastical Wonderland with oversized mushrooms, giant chess pieces (red and white), roses being painted red, Mad Hatter's tea party table with floating teacups, white rabbit with pocket watch running by, Cheshire Cat's grin floating in air. Whimsical surreal lighting with impossible colors, dreamlike atmosphere with magical sparkles and swirling mists.`,

    'Пеппи Длинныйчулок': `${baseSettings} A playful ${
      gender === 'male' ? 'person' : 'girl'
    } with iconic bright red hair in two tight braids sticking straight out horizontally from head like handles. Countless freckles covering face and arms. Wearing mismatched knee-high striped stockings - one red and white, one blue and yellow. Blue dress with patches and buttons missing. Superhuman strength pose - lifting something impossibly heavy above head with one arm. Gap-toothed mischievous grin. Dirty fingernails from adventures. Worn brown shoes, one lace missing. Small pet monkey (Mr. Nilsson) sitting on shoulder. Background: colorful Villa Villekulla house with crooked chimney and bright painted walls, overgrown garden with fruit trees, small Swedish town in background, adventure props scattered around - ropes, treasure chest, pirate flag. Bright energetic daylight with saturated colors, playful adventure atmosphere with golden sunshine.`,

    Флэш: `${baseSettings} A fast ${
      gender === 'male' ? 'man' : 'woman'
    } in sleek red suit with lightning bolt accents. ${
      gender === 'male' ? 'Dynamic running pose' : 'Speed-ready athletic stance'
    }. Lightning bolt emblem on chest. Red suit with yellow/gold accents. Motion blur effects around figure. Speed force energy crackling around body. Background with city street and speed trail effects. Electric lighting with red and yellow colors. Super-speed aesthetic with energetic movement.`,

    Джокер: `${baseSettings} A charismatic ${
      gender === 'male' ? 'man' : 'woman'
    } in purple suit with chaotic elements. ${
      gender === 'male' ? 'Maniacal grinning pose' : 'Chaotic villain stance'
    }. Purple suit with green accents. Wild, green-tinted hair. Playing cards scattered around. Dramatic makeup with exaggerated smile. Background with carnival chaos and purple/green lighting. Theatrical lighting with purple and green colors. Chaotic villain aesthetic with unpredictable energy.`,

    Шазам: `${baseSettings} A powerful ${
      gender === 'male' ? 'hero' : 'heroine'
    } in red and gold superhero outfit with lightning motifs. ${
      gender === 'male' ? 'Confident heroic stance' : 'Strong warrior pose'
    }. Red suit with golden accents and lightning bolt emblem. White cape with golden trim. Maintain original facial features and natural age appearance. Hands glowing with magical lightning energy. Background with temple columns and lightning strikes. Bright magical lighting with gold and red colors. Heroic champion aesthetic with divine power, preserving the person's face and maturity.`,

    // ANIME & MANGA HEROES - TOP POPULAR MISSING
    Гоку: `${baseSettings} A powerful ${
      gender === 'male' ? 'martial artist' : 'warrior'
    } in orange and blue martial arts gi with symbols. ${
      gender === 'male'
        ? 'Fighting stance ready for battle'
        : 'Powerful combat pose'
    }. Spiky black hair defying gravity. Orange gi with blue shirt underneath. Weighted boots and wristbands. Golden aura energy radiating around body. Confident battle-ready expression. Background with mountains and energy blasts. Bright, energetic lighting with golden ki energy effects. Dragon Ball aesthetic with powerful martial arts atmosphere.`,

    Наруто: `${baseSettings} A determined ${
      gender === 'male' ? 'ninja' : 'kunoichi'
    } in bright orange and black ninja outfit with spiral patterns. ${
      gender === 'male' ? 'Ninja action pose' : 'Shinobi ready stance'
    }. Spiky blonde hair with unique style. Orange jumpsuit with black accents. Ninja headband with leaf village symbol. Hand signs for jutsu casting. Blue eyes with determination. Background with Japanese village and cherry blossoms. Bright anime lighting with orange and blue colors. Ninja aesthetic with spirited energy.`,

    Луффи: `${baseSettings} A cheerful ${
      gender === 'male' ? 'pirate captain' : 'pirate'
    } in red vest and blue shorts with straw hat. ${
      gender === 'male' ? 'Carefree adventure pose' : 'Spirited pirate stance'
    }. Iconic straw hat with red ribbon. Red cardigan vest left open. Blue denim shorts. Rubber stretching arm extended dramatically. Wide grin and enthusiastic expression. Background with pirate ship and ocean waves. Bright adventure lighting with red and blue colors. One Piece pirate aesthetic with boundless energy.`,

    Ичиго: `${baseSettings} A fierce ${
      gender === 'male' ? 'soul reaper' : 'shinigami'
    } in black shihakusho with orange accents. ${
      gender === 'male' ? 'Sword-ready battle stance' : 'Spiritual warrior pose'
    }. Spiky orange hair in unique style. Black soul reaper robes with white trim. Large spiritual sword (zanpakuto) in hand. Orange spiritual energy (reiatsu) flowing around body. Serious, determined expression. Background with spirit world and floating petals. Dramatic lighting with orange and black colors. Bleach aesthetic with supernatural power.`,

    'Эдвард Элрик': `${baseSettings} A brilliant ${
      gender === 'male' ? 'alchemist' : 'alchemist'
    } in red coat with alchemical symbols. ${
      gender === 'male'
        ? 'Alchemical transmutation pose'
        : 'Determined scientist stance'
    }. Distinctive red coat with flame symbol. Long blonde hair in braid. Automail prosthetic arm visible. Hands performing alchemical transmutation. Blue electrical alchemy energy crackling. Confident but serious expression. Background with alchemical circles and laboratory equipment. Mystical lighting with blue alchemy energy. Fullmetal Alchemist aesthetic with scientific magic.`,

    // ================= MARVEL HEROES (MISSING) =================
    'Человек-муравей': `${baseSettings} A skilled ${
      gender === 'male' ? 'man' : 'woman'
    } in high-tech red and silver micro-suit with insect-inspired design. ${
      gender === 'male' ? 'Strategic shrinking pose' : 'Miniaturization stance'
    }. Helmet with specialized visor and communication equipment. Size-manipulation effects around body with shrinking/growing visual elements. Advanced technological accessories and utility belt. Background with molecular and size-scale effects. Dynamic lighting with red and silver tech colors. Quantum realm aesthetic with size-manipulation powers.`,

    'Блэк Пантер': `${baseSettings} A regal ${
      gender === 'male' ? 'king' : 'queen'
    } in sleek black vibranium suit with African-inspired patterns. ${
      gender === 'male' ? 'Wakandan royal stance' : 'Panther warrior pose'
    }. Cat-like mask with glowing white eyes. Silver tech elements and tribal geometric patterns. Retractable claws on fingertips. Background with Wakandan technology and African savanna. Purple and silver lighting with vibranium energy effects. Black Panther aesthetic with royal African heritage.`,

    Карающий: `${baseSettings} A vigilante ${
      gender === 'male' ? 'man' : 'woman'
    } in tactical black outfit with distinctive white skull emblem. ${
      gender === 'male' ? 'Justice-seeking stance' : 'Vigilante warrior pose'
    }. Military-grade tactical gear with ammunition belts and holsters. Dark expression under skull face paint or mask. Various weapons and tactical equipment visible. Background with urban nighttime setting and justice themes. Dark dramatic lighting with high contrast black and white. Punisher aesthetic with gritty vigilante atmosphere.`,

    'Призрачный гонщик': `${baseSettings} A supernatural ${
      gender === 'male' ? 'rider' : 'rider'
    } in leather jacket with flame effects and chains. ${
      gender === 'male'
        ? 'Hellfire vengeance pose'
        : 'Spirit of vengeance stance'
    }. Flaming skull head effect or flame-inspired helmet. Leather motorcycle jacket with spikes and chains. Hellfire effects surrounding the figure. Chain weapon or flaming motorcycle elements. Background with supernatural flames and gothic elements. Dramatic orange and red fire lighting. Ghost Rider aesthetic with supernatural hellfire powers.`,

    'Зимний солдат': `${baseSettings} A tactical ${
      gender === 'male' ? 'soldier' : 'operative'
    } in dark military gear with metal prosthetic arm. ${
      gender === 'male' ? 'Assassin ready stance' : 'Tactical operative pose'
    }. Distinctive silver/black metal prosthetic arm with red star. Military tactical outfit with strategic padding and gear. Long dark hair and intense expression. Sniper rifle or tactical weapons visible. Background with winter/Soviet elements. Cool blue and metallic lighting. Winter Soldier aesthetic with military precision.`,

    'Гвен Стейси': `${baseSettings} A heroic ${
      gender === 'male' ? 'spider-hero' : 'spider-woman'
    } in white and pink spider suit with hood design. ${
      gender === 'male' ? 'Web-slinging stance' : 'Spider-Gwen pose'
    }. White suit with pink/purple spider emblem and web patterns. Hooded mask design with large white eye lenses. Ballet shoes or web-shooters on wrists. Dynamic web-swinging pose. Background with alternate dimension cityscape. Pink and white lighting with web effects. Spider-Gwen aesthetic with punk rock style.`,

    Шторм: `${baseSettings} A powerful ${
      gender === 'male' ? 'weather master' : 'storm goddess'
    } in flowing white outfit with weather-control elements. ${
      gender === 'male' ? 'Elemental command pose' : 'Storm goddess stance'
    }. White flowing cape and outfit with silver accents. White/silver hair flowing with wind effects. Glowing white eyes with lightning energy. Lightning bolts and storm clouds surrounding figure. Background with tempest and weather phenomena. Dramatic blue and white lightning effects. Storm aesthetic with weather mastery powers.`,

    'Джин Грей': `${baseSettings} A powerful ${
      gender === 'male' ? 'telepath' : 'psychic'
    } in dark outfit with phoenix-inspired elements. ${
      gender === 'male' ? 'Psychic power stance' : 'Phoenix force pose'
    }. Green and gold outfit with X-Men styling. Red/auburn hair with fiery highlights. Telekinetic energy effects around hands and body. Phoenix firebird silhouette in background. Psychic energy aura and floating debris. Background with cosmic/psychic realm elements. Orange and gold psychic lighting. Jean Grey aesthetic with Phoenix power.`,

    Роуг: `${baseSettings} A strong ${
      gender === 'male' ? 'mutant' : 'mutant'
    } in green and yellow X-Men outfit with distinctive white-striped hair. ${
      gender === 'male'
        ? 'Power-absorbing stance'
        : 'Southern belle warrior pose'
    }. Green bodysuit with yellow accents and X-Men insignia. White streak through brown hair. Long gloves covering hands (power-dampening). Flight-ready pose with confident expression. Background with X-Men mansion and training facility. Green and yellow team lighting. Rogue aesthetic with power-absorption abilities.`,

    'Китти Прайд': `${baseSettings} A young ${
      gender === 'male' ? 'mutant' : 'mutant'
    } in blue and yellow X-Men training outfit. ${
      gender === 'male' ? 'Phasing power stance' : 'Shadowcat pose'
    }. Blue bodysuit with yellow X-Men accents. Short brown hair in practical style. Phasing effects showing partial transparency. Computer equipment or technological elements nearby. Youthful but determined expression. Background with X-Men academy and high-tech elements. Blue and yellow team lighting. Kitty Pryde aesthetic with phasing powers.`,

    Псайлок: `${baseSettings} A mysterious ${
      gender === 'male' ? 'ninja' : 'ninja'
    } in purple bodysuit with psychic blade effects. ${
      gender === 'male' ? 'Psychic warrior stance' : 'Psylocke combat pose'
    }. Form-fitting purple outfit with armor elements. Long dark hair with headband or hair accessories. Psychic energy blade extending from hand. Martial arts combat pose with ninja elements. Background with Japanese/mystical elements. Purple psychic energy lighting. Psylocke aesthetic with psychic ninja powers.`,

    Мистик: `${baseSettings} A shapeshifting ${
      gender === 'male' ? 'mutant' : 'mutant'
    } with blue skin and shape-changing abilities. ${
      gender === 'male' ? 'Transformation stance' : 'Mystique pose'
    }. Blue-scaled skin texture with yellow eyes. Minimal but strategic clothing. Shape-shifting effects showing transformation. Red/orange hair in distinctive style. Predatory and dangerous expression. Background with multiple identity silhouettes. Blue and yellow lighting with mystical effects. Mystique aesthetic with shapeshifting powers.`,

    'Эмма Фрост': `${baseSettings} A telepathic ${
      gender === 'male' ? 'telepath' : 'telepath'
    } in elegant white outfit with diamond-form capabilities. ${
      gender === 'male' ? 'Diamond form stance' : 'White Queen pose'
    }. White business outfit or X-Men costume. Platinum blonde hair in sophisticated style. Diamond crystalline skin transformation effects. Psychic energy aura around head and hands. Elegant but powerful posture. Background with luxury and psychic energy elements. White and crystalline lighting. Emma Frost aesthetic with diamond form and telepathy.`,

    Небула: `${baseSettings} A cybernetic ${
      gender === 'male' ? 'warrior' : 'warrior'
    } in blue and silver cyborg outfit with mechanical elements. ${
      gender === 'male' ? 'Cyborg combat stance' : 'Nebula warrior pose'
    }. Blue skin with visible cybernetic implants and prosthetics. Bald head with mechanical skull elements. High-tech weapons and gadgets. Cybernetic eye and facial modifications. Background with cosmic space and technology. Blue and silver metallic lighting. Nebula aesthetic with cyborg technology.`,

    'Капитан Картер': `${baseSettings} A heroic ${
      gender === 'male' ? 'super-soldier' : 'super-soldier'
    } in Union Jack-themed outfit with shield. ${
      gender === 'male' ? 'British hero stance' : 'Captain Carter pose'
    }. Red, white, and blue outfit with British flag elements. Round shield with Union Jack design. 1940s military-inspired uniform with modern touches. Strong, determined expression with period-appropriate hair. Background with WWII-era British elements. Patriotic red, white, and blue lighting. Captain Carter aesthetic with British super-soldier theme.`,

    // ================= DC UNIVERSE HEROES (MISSING) =================
    'Зелёный фонарь': `${baseSettings} A cosmic ${
      gender === 'male' ? 'lantern' : 'lantern'
    } in green and black space corps uniform. ${
      gender === 'male'
        ? 'Willpower manifestation stance'
        : 'Green Lantern pose'
    }. Green bodysuit with black accents and lantern corps insignia. Power ring creating green energy constructs. Green energy aura surrounding the figure. Various green light constructs (weapons, shields, tools). Background with space sector and cosmic elements. Bright green lantern lighting. Green Lantern aesthetic with willpower energy.`,

    Аквамен: `${baseSettings} A regal ${
      gender === 'male' ? 'ocean king' : 'ocean queen'
    } in orange and green Atlantean royal armor. ${
      gender === 'male' ? 'King of seas stance' : 'Atlantean royalty pose'
    }. Golden trident with five prongs and mystical powers. Orange and green scaled armor with Atlantean designs. Long flowing hair with oceanic elements. Aquatic creatures swimming nearby. Background with underwater Atlantis kingdom. Blue-green oceanic lighting with water effects. Aquaman aesthetic with oceanic monarchy.`,

    'Зелёная стрела': `${baseSettings} A skilled ${
      gender === 'male' ? 'archer' : 'archer'
    } in green hood and tactical archery gear. ${
      gender === 'male' ? 'Master archer stance' : 'Green Arrow pose'
    }. Green hooded outfit with practical archery equipment. Compound bow with specialized arrows. Quiver full of trick arrows with various effects. Precise aiming pose with focused expression. Background with urban cityscape and rooftops. Green and brown tactical lighting. Green Arrow aesthetic with archery expertise.`,

    Найтвинг: `${baseSettings} A acrobatic ${
      gender === 'male' ? 'hero' : 'hero'
    } in blue and black costume with bird motifs. ${
      gender === 'male' ? 'Acrobatic combat stance' : 'Nightwing pose'
    }. Blue bodysuit with black accents and stylized bird emblem. Dual escrima sticks or batons in hands. Athletic build with acrobatic flexibility. Domino mask covering eyes. Background with Blüdhaven cityscape at night. Blue and black dramatic lighting. Nightwing aesthetic with acrobatic skills.`,

    Дэфстроук: `${baseSettings} A tactical ${
      gender === 'male' ? 'mercenary' : 'mercenary'
    } in orange and blue military armor. ${
      gender === 'male' ? 'Master tactician stance' : 'Deathstroke combat pose'
    }. Orange and blue tactical armor with military design. Single-eye mask with targeting elements. Various weapons including sword, guns, and grenades. Enhanced physical capabilities pose. Background with military/mercenary elements. Orange and steel blue tactical lighting. Deathstroke aesthetic with military precision.`,

    Бэтгерл: `${baseSettings} A skilled ${
      gender === 'male' ? 'vigilante' : 'vigilante'
    } in purple and yellow bat-themed costume. ${
      gender === 'male' ? 'Bat-family stance' : 'Batgirl pose'
    }. Purple bodysuit with yellow bat-symbol and utility belt. Flowing red hair visible under or around cowl. Grappling hook and various bat-gadgets. Athletic pose showing martial arts training. Background with Gotham City rooftops at night. Purple and yellow bat-lighting. Batgirl aesthetic with detective skills.`,

    Кэтвумен: `${baseSettings} A sleek ${
      gender === 'male' ? 'cat burglar' : 'cat burglar'
    } in black leather cat suit with feline elements. ${
      gender === 'male' ? 'Cat-like prowling stance' : 'Catwoman pose'
    }. Form-fitting black leather outfit with cat ears and tail. Whip coiled at side or in action pose. Cat-like mask covering eyes and nose. Clawed gloves for climbing and combat. Background with Gotham rooftops and jewelry heist elements. Dark purple and black cat lighting. Catwoman aesthetic with feline agility.`,

    'Ядовитый плющ': `${baseSettings} A botanical ${
      gender === 'male' ? 'eco-terrorist' : 'eco-terrorist'
    } in green plant-themed outfit with nature powers. ${
      gender === 'male' ? 'Plant control stance' : 'Poison Ivy pose'
    }. Green bodysuit made of leaves and vines. Red hair with flower and leaf accessories. Plants and vines growing around and from the figure. Toxic kiss pose or plant manipulation gesture. Background with overgrown greenhouse and botanical elements. Green and red natural lighting. Poison Ivy aesthetic with plant control powers.`,

    Рейвен: `${baseSettings} A mystical ${
      gender === 'male' ? 'half-demon' : 'half-demon'
    } in dark blue hooded cloak with demonic elements. ${
      gender === 'male' ? 'Dark magic stance' : 'Raven pose'
    }. Dark blue hooded cloak covering most of body. Four glowing red eyes (demonic form) or normal eyes. Dark energy/shadow manipulation around hands. Levitating pose with mystical energy. Background with dark dimensions and mystical portals. Dark blue and red demonic lighting. Raven aesthetic with dark magic powers.`,

    Старфайр: `${baseSettings} A alien ${
      gender === 'male' ? 'warrior' : 'princess'
    } in purple outfit with energy projection abilities. ${
      gender === 'male' ? 'Energy projection stance' : 'Starfire pose'
    }. Purple bodysuit with alien design elements. Long red-orange hair flowing with energy. Green energy bolts firing from hands and eyes. Flight pose with energy trail effects. Joyful but powerful expression. Background with space and alien technology. Purple and green energy lighting. Starfire aesthetic with alien energy powers.`,

    Мера: `${baseSettings} A royal ${
      gender === 'male' ? 'hydromancer' : 'hydromancer'
    } in green and gold Atlantean royal outfit. ${
      gender === 'male' ? 'Water control stance' : 'Mera pose'
    }. Green and gold Atlantean armor with scale patterns. Red hair in elaborate royal style. Water manipulation effects around hands and body. Trident or hard-water constructs as weapons. Background with underwater palace and aquatic life. Blue-green oceanic lighting with water effects. Mera aesthetic with hydrokinetic powers.`,

    'Хищные птицы': `${baseSettings} A team ${
      gender === 'male' ? 'vigilante' : 'vigilante'
    } representing multiple heroines in coordinated outfits. ${
      gender === 'male' ? 'Team formation stance' : 'Birds of Prey pose'
    }. Mix of purple, black, and colorful tactical outfits. Various weapons including bow, batons, and martial arts gear. Group dynamic with individual fighting styles shown. Background with Gotham City and team headquarters. Mixed lighting highlighting team coordination. Birds of Prey aesthetic with female empowerment.`,

    'Черная канарейка': `${baseSettings} A sonic ${
      gender === 'male' ? 'hero' : 'hero'
    } in black leather outfit with sound wave elements. ${
      gender === 'male' ? 'Sonic scream stance' : 'Black Canary pose'
    }. Black leather jacket and tactical outfit. Blonde hair in dramatic wind-blown style. Sonic scream effects with visible sound waves. Hands positioned to channel sonic powers. Background with shattered glass and sound wave effects. Black and blue sonic lighting. Black Canary aesthetic with sonic powers.`,

    'Джессика Круз': `${baseSettings} A determined ${
      gender === 'male' ? 'Green Lantern' : 'Green Lantern'
    } in green and black lantern corps uniform with anxiety elements. ${
      gender === 'male' ? 'Overcoming fear stance' : 'Jessica Cruz pose'
    }. Green lantern uniform with personal touches and design elements. Power ring creating protective constructs. Green energy showing both power and protective barriers. Determined expression overcoming internal struggles. Background with Earth sector and personal growth elements. Bright green willpower lighting. Jessica Cruz aesthetic with courage over fear.`,

    // ================= ANIME HEROES (MISSING) =================
    Саитама: `${baseSettings} A bald ${
      gender === 'male' ? 'hero' : 'hero'
    } in simple yellow and red hero costume. ${
      gender === 'male' ? 'One punch ready stance' : 'One Punch pose'
    }. Completely bald head with simple facial features. Yellow jumpsuit with red gloves and cape. White cape flowing behind. Simple but confident pose. Understated but immense power aura. Background with city and hero association elements. Bright yellow and red heroic lighting. One Punch Man aesthetic with overwhelming simplicity.`,

    'Лайт Ягами': `${baseSettings} A intelligent ${
      gender === 'male' ? 'student' : 'student'
    } in school uniform with notebook and sinister aura. ${
      gender === 'male' ? 'Death Note writing stance' : 'Kira pose'
    }. Japanese school uniform or casual intelligent clothing. Death Note book in hand with dramatic shadows. Intense calculating expression with hidden malice. Shinigami silhouette or death symbols in background. Background with Japanese urban setting and justice themes. Dark dramatic lighting with red accents. Death Note aesthetic with moral complexity.`,

    Какаши: `${baseSettings} A skilled ${
      gender === 'male' ? 'ninja' : 'ninja'
    } in gray ninja outfit with face mask and headband. ${
      gender === 'male' ? 'Copy ninja stance' : 'Kakashi pose'
    }. Gray ninja vest and dark pants with tactical gear. Face mask covering lower face with visible gray hair. Konoha ninja headband covering one eye. Lightning chakra effects around hand (Chidori). Background with Hidden Leaf Village and training grounds. Blue lightning and silver ninja lighting. Naruto aesthetic with ninja mastery.`,

    Сасукэ: `${baseSettings} A brooding ${
      gender === 'male' ? 'ninja' : 'ninja'
    } in dark blue outfit with Uchiha clan symbols. ${
      gender === 'male' ? 'Sharingan power stance' : 'Sasuke pose'
    }. Dark blue high-collared shirt and white shorts or pants. Sharingan eye effect with red swirling pattern. Lightning chakra crackling around body. Dark hair in distinctive spiky style. Background with Uchiha clan elements and lightning effects. Red and blue dramatic ninja lighting. Naruto aesthetic with clan heritage.`,

    Вегета: `${baseSettings} A proud ${
      gender === 'male' ? 'Saiyan prince' : 'Saiyan princess'
    } in royal blue and white Saiyan armor. ${
      gender === 'male' ? 'Saiyan royal stance' : 'Vegeta pose'
    }. Blue and white Saiyan battle armor with royal elements. Distinctive flame-shaped black hair. Crossed arms in arrogant pose or energy attack position. Golden ki energy aura surrounding figure. Background with space and Saiyan planet elements. Golden and blue Saiyan energy lighting. Dragon Ball Z aesthetic with Saiyan pride.`,

    Пикколо: `${baseSettings} A wise ${
      gender === 'male' ? 'Namekian warrior' : 'Namekian warrior'
    } in purple and white martial arts outfit. ${
      gender === 'male' ? 'Namekian meditation stance' : 'Piccolo pose'
    }. Green skin with pink muscle patches and Namekian features. Purple gi with white cape and turban. Weighted training clothes or meditation pose. Energy beam charging from fingertips. Background with martial arts dojo and Earth elements. Green and purple Namekian lighting. Dragon Ball Z aesthetic with warrior wisdom.`,

    Натсу: `${baseSettings} A energetic ${
      gender === 'male' ? 'dragon slayer' : 'dragon slayer'
    } in dragon-themed outfit with fire magic. ${
      gender === 'male' ? 'Fire dragon stance' : 'Natsu pose'
    }. Open vest showing dragon scale scarf and flame patterns. Pink/salmon hair in spiky style. Fire magic effects surrounding hands and body. Dragon slayer magical aura. Background with Fairy Tail guild and magical elements. Orange and red fire magic lighting. Fairy Tail aesthetic with dragon slayer magic.`,

    'Эрен Йегер': `${baseSettings} A determined ${
      gender === 'male' ? 'titan shifter' : 'titan shifter'
    } in Survey Corps uniform with ODM gear. ${
      gender === 'male' ? 'Titan transformation stance' : 'Eren pose'
    }. Survey Corps green cloak and brown leather ODM gear. Titan transformation steam effects around body. Dual blades for titan combat. Intense expression with freedom-seeking eyes. Background with walls and titan battlefield. Green and brown military lighting with steam effects. Attack on Titan aesthetic with transformation power.`,

    'Леви Аккерман': `${baseSettings} A skilled ${
      gender === 'male' ? 'soldier' : 'soldier'
    } in Survey Corps uniform with superior combat abilities. ${
      gender === 'male' ? "Humanity's strongest stance" : 'Levi pose'
    }. Clean Survey Corps uniform with white cravat. ODM gear with spinning blade techniques. Short black hair in undercut style. Precise combat pose with dual blades. Background with urban titan combat zone. Steel blue and white precision lighting. Attack on Titan aesthetic with unmatched skill.`,

    'Сейлор Мун': `${baseSettings} A magical ${
      gender === 'male' ? 'guardian' : 'guardian'
    } in sailor fuku with moon and celestial elements. ${
      gender === 'male' ? 'Sailor guardian stance' : 'Sailor Moon pose'
    }. Blue and red sailor outfit with moon tiara and accessories. Blonde hair in distinctive twin buns with long tails. Moon stick or crystal heart compact in hand. Magical girl transformation sparkles around body. Background with moon, stars, and magical elements. Pink and blue magical lighting. Sailor Moon aesthetic with lunar magic.`,

    'Мику Хацунэ': `${baseSettings} A virtual ${
      gender === 'male' ? 'idol' : 'idol'
    } in turquoise outfit with digital/holographic elements. ${
      gender === 'male' ? 'Digital performance stance' : 'Hatsune Miku pose'
    }. Turquoise hair in distinctive twin-tail style. High-tech outfit with digital patterns and LED elements. Microphone or digital interface props. Holographic and digital effects surrounding figure. Background with concert stage and digital screens. Cyan and digital blue lighting effects. Vocaloid aesthetic with virtual idol performance.`,

    'Сакура Харуно': `${baseSettings} A medical ${
      gender === 'male' ? 'ninja' : 'ninja'
    } in pink and red ninja outfit with medical elements. ${
      gender === 'male' ? 'Medical ninjutsu stance' : 'Sakura pose'
    }. Pink hair in practical ninja style. Red outfit with medical ninja accessories. Healing chakra glowing from hands in green energy. Super strength pose with ground-breaking effects. Background with Konoha hospital and cherry blossoms. Pink and green medical chakra lighting. Naruto aesthetic with medical specialization.`,

    'Хината Хьюга': `${baseSettings} A gentle ${
      gender === 'male' ? 'ninja' : 'ninja'
    } in purple and cream Hyuga clan outfit. ${
      gender === 'male' ? 'Byakugan activation stance' : 'Hinata pose'
    }. Long dark hair in neat style with Hyuga clan elements. Purple and cream colored ninja outfit. Byakugan activated with pale eyes and visible veins. Gentle Fist martial arts pose. Background with Hyuga compound and traditional elements. Pale blue and purple Hyuga lighting. Naruto aesthetic with noble clan heritage.`,

    Цунадэ: `${baseSettings} A powerful ${
      gender === 'male' ? 'medical ninja' : 'medical ninja'
    } in green haori with gambling and medical elements. ${
      gender === 'male' ? 'Fifth Hokage stance' : 'Tsunade pose'
    }. Blonde hair in twin tails with green haori jacket. Medical ninja outfit with Hokage elements. Super strength chakra enhancement around fists. Healing jutsu effects or sake cup in hand. Background with Hokage office and medical facility. Green and gold medical lighting. Naruto aesthetic with legendary medical skills.`,

    Булма: `${baseSettings} A brilliant ${
      gender === 'male' ? 'scientist' : 'scientist'
    } in fashionable outfit with scientific gadgets. ${
      gender === 'male' ? 'Genius inventor stance' : 'Bulma pose'
    }. Stylish outfit changing colors (blue hair constant). Various scientific devices and dragon radar technology. Capsule Corp technology and inventions. Fashionable but practical scientist appearance. Background with laboratory and Capsule Corp elements. Blue and technological lighting. Dragon Ball aesthetic with scientific innovation.`,

    '18-й андроид': `${baseSettings} A powerful ${
      gender === 'male' ? 'android' : 'android'
    } in casual outfit with mechanical enhancements. ${
      gender === 'male' ? 'Android power stance' : 'Android 18 pose'
    }. Casual denim and striped shirt with blonde hair. Subtle mechanical elements suggesting android nature. Energy blast effects from hands. Cool, emotionless expression with hidden humanity. Background with futuristic city and mechanical elements. Blue and silver android lighting. Dragon Ball Z aesthetic with artificial being power.`,

    'Эрза Скарлет': `${baseSettings} A armored ${
      gender === 'male' ? 'knight' : 'knight'
    } in magical armor with weapon requip abilities. ${
      gender === 'male' ? 'Armor requip stance' : 'Erza pose'
    }. Various magical armors switching between different sets. Red hair in practical battle style. Multiple weapons appearing through requip magic. Serious warrior expression with tactical mind. Background with Fairy Tail guild and weapon storage. Red and silver armor lighting. Fairy Tail aesthetic with equipment magic.`,

    'Микаса Аккерман': `${baseSettings} A dedicated ${
      gender === 'male' ? 'soldier' : 'soldier'
    } in Survey Corps uniform with exceptional combat skills. ${
      gender === 'male' ? 'Elite soldier stance' : 'Mikasa pose'
    }. Survey Corps green cloak and ODM gear in perfect condition. Dark hair in practical combat style. Red scarf flowing in wind. Dual blades with perfect combat form. Background with titan battlefield and Eren protection elements. Red and green military lighting. Attack on Titan aesthetic with unwavering loyalty.`,

    'Рей Аянами': `${baseSettings} A mysterious ${
      gender === 'male' ? 'EVA pilot' : 'EVA pilot'
    } in school uniform or plug suit with ethereal elements. ${
      gender === 'male' ? 'Enigmatic presence stance' : 'Rei pose'
    }. Blue hair in short bob cut with red eyes. White and blue school uniform or EVA plug suit. Ethereal, emotionless expression with hidden depth. AT Field or angelic effects surrounding figure. Background with NERV facility and Angel elements. Blue and white ethereal lighting. Evangelion aesthetic with mysterious origins.`,

    'Асука Лэнгли': `${baseSettings} A confident ${
      gender === 'male' ? 'EVA pilot' : 'EVA pilot'
    } in red plug suit with German elements. ${
      gender === 'male' ? 'Competitive pilot stance' : 'Asuka pose'
    }. Red hair in twin tails with hair clips. Red EVA plug suit with Unit-02 elements. Confident, competitive expression with pilot pride. Progressive knife or EVA combat effects. Background with EVA Unit-02 and German military elements. Red and orange confident lighting. Evangelion aesthetic with pilot superiority.`,

    'Фэй Валентайн': `${baseSettings} A bounty ${
      gender === 'male' ? 'hunter' : 'hunter'
    } in yellow outfit with space cowboy elements. ${
      gender === 'male' ? 'Space bounty stance' : 'Faye pose'
    }. Yellow top and shorts with red jacket. Long purple hair with cigarette or drink. Blaster pistol and gambling elements. Seductive but dangerous pose with space cowboy attitude. Background with spaceship and casino elements. Yellow and purple jazz lighting. Cowboy Bebop aesthetic with space noir style.`,

    Нами: `${baseSettings} A skilled ${
      gender === 'male' ? 'navigator' : 'navigator'
    } in orange outfit with weather control abilities. ${
      gender === 'male' ? 'Weather manipulation stance' : 'Nami pose'
    }. Orange hair and outfit with nautical elements. Clima-Tact weather weapon creating storm effects. Navigation and treasure mapping tools. Confident navigator pose with weather magic. Background with ship navigation and treasure elements. Orange and blue weather lighting. One Piece aesthetic with navigation expertise.`,

    'Риас Гремори': `${baseSettings} A noble ${
      gender === 'male' ? 'devil' : 'devil'
    } in red and black devil outfit with aristocratic elements. ${
      gender === 'male' ? 'High-class devil stance' : 'Rias pose'
    }. Crimson red hair in elegant style. Red and black devil outfit with aristocratic design. Devil wings and magical circle effects. Confident noble expression with protective nature. Background with devil society and magic academy. Red and black noble lighting. High School DxD aesthetic with devil aristocracy.`,

    'Zero Two': `${baseSettings} A mysterious ${
      gender === 'male' ? 'klaxosaur hybrid' : 'klaxosaur hybrid'
    } in white and red pilot suit with horn elements. ${
      gender === 'male' ? 'Darling in the FranXX stance' : 'Zero Two pose'
    }. Pink hair with distinctive red horns. White pilot suit with red accents and 002 designation. Playful but dangerous expression with fanged smile. FranXX mecha elements and Klaxosaur effects. Background with futuristic dystopia and mecha elements. Pink and red hybrid lighting. Darling in the FranXX aesthetic with hybrid nature.`,

    'Нико Робин': `${baseSettings} A archaeological ${
      gender === 'male' ? 'scholar' : 'scholar'
    } in dark outfit with flower petal abilities. ${
      gender === 'male' ? 'Archaeological stance' : 'Robin pose'
    }. Black hair and dark sophisticated outfit. Flower-Flower Fruit effects with multiple arms sprouting. Ancient text or poneglyph elements. Calm, intellectual expression with dark past. Background with archaeological ruins and ancient knowledge. Purple and dark blue scholarly lighting. One Piece aesthetic with forbidden knowledge.`,

    Кая: `${baseSettings} A gentle village ${
      gender === 'male' ? 'doctor' : 'doctor'
    } in light medical outfit with healing elements. ${
      gender === 'male' ? 'Caring healer stance' : 'Kaya pose'
    }. Blonde hair in elegant style with kind expression. Light colored dress or medical outfit with nature elements. Healing herbs and medical tools around. Gentle caring expression with pure heart. Background with peaceful village and medical clinic. Soft green and white healing lighting. One Piece aesthetic with village doctor theme.`,

    // ================= SLAVIC/RUSSIAN HEROES (MISSING) =================
    'Алеша Попович': `${baseSettings} A clever young ${gender === 'male' ? 'bogatyr' : 'warrior'} in light Russian chainmail with bow and arrows. Background with Russian countryside.`,
    Перун: `${baseSettings} A thunder ${gender === 'male' ? 'god' : 'goddess'} in golden Slavic armor with lightning hammer. Lightning effects and stormy sky.`,
    Святогор: `${baseSettings} A gigantic ${gender === 'male' ? 'bogatyr' : 'warrior'} in massive earth-colored armor. Mountain background with stone elements.`,
    Берегиня: `${baseSettings} A protective spirit in flowing water dress with nature elements. Russian river and forest background.`,
    Русалка: `${baseSettings} A water spirit in flowing aquatic dress with long hair. Russian river with willows and moonlight.`,

    // ================= GAMES HEROES (MISSING) =================
    Кратос: `${baseSettings} A vengeful ${
      gender === 'male' ? 'god slayer' : 'god slayer'
    } in Spartan armor with godly weapons. ${
      gender === 'male' ? 'God of War stance' : 'Kratos pose'
    }. Red tattoo or body paint in swirling patterns. Blades of Chaos chained to forearms. Spartan warrior armor mixed with god-killing artifacts. Intense rage expression with scarred features. Background with Greek mythology and godly destruction. Red and bronze divine lighting. God of War aesthetic with mythological vengeance.`,

    'Геральт из Ривии': `${baseSettings} A professional ${
      gender === 'male' ? 'witcher' : 'witcher'
    } in leather armor with monster hunting gear. ${
      gender === 'male' ? 'Monster hunter stance' : 'Geralt pose'
    }. White hair in distinctive witcher style. Dark leather armor with silver studs and witcher medallion. Silver and steel swords for monster and human enemies. Witcher signs magic effects around hands. Background with fantasy monsters and medieval elements. Silver and amber witcher lighting. The Witcher aesthetic with professional monster hunting.`,

    'Мастер Чиф': `${baseSettings} A armored ${
      gender === 'male' ? 'super soldier' : 'super soldier'
    } in green MJOLNIR power armor. ${
      gender === 'male' ? 'Spartan warrior stance' : 'Master Chief pose'
    }. Green and orange MJOLNIR Mark VI power armor. Reflective golden visor hiding face. Assault rifle and Covenant energy weapons. Spartan augmentation enhanced physique. Background with Halo ring and Covenant technology. Green and orange UNSC lighting. Halo aesthetic with military sci-fi technology.`,

    Данте: `${baseSettings} A stylish ${
      gender === 'male' ? 'devil hunter' : 'devil hunter'
    } in red coat with demonic weapons. ${
      gender === 'male' ? 'Devil hunter stance' : 'Dante pose'
    }. Red leather trenchcoat with demonic heritage styling. White hair in stylish cut with dual pistols. Demonic sword and devil trigger transformation effects. Cocky confident expression with demon-fighting attitude. Background with gothic demons and stylish combat. Red and white stylish lighting. Devil May Cry aesthetic with demonic style.`,

    Субзиро: `${baseSettings} A cryomancer ${
      gender === 'male' ? 'ninja' : 'ninja'
    } in blue and black ice-themed outfit. ${
      gender === 'male' ? 'Cryomancer stance' : 'Sub-Zero pose'
    }. Blue and black ninja outfit with ice armor elements. Ice mask covering face with cold breath effects. Ice projectiles and freezing attacks. Cryomancer abilities creating ice and frost. Background with Lin Kuei temple and frozen elements. Blue and white ice lighting. Mortal Kombat aesthetic with ice powers.`,

    Скорпион: `${baseSettings} A vengeful ${
      gender === 'male' ? 'specter' : 'specter'
    } in yellow and black ninja outfit with flame elements. ${
      gender === 'male' ? 'Hell specter stance' : 'Scorpion pose'
    }. Yellow and black ninja outfit with skull motifs. Chain spear weapon with "Get over here!" pose. Hellfire effects and burning skull transformation. Vengeful spirit with flame-based attacks. Background with Netherrealm and hellish elements. Orange and yellow hellfire lighting. Mortal Kombat aesthetic with hellish vengeance.`,

    Рю: `${baseSettings} A disciplined ${
      gender === 'male' ? 'martial artist' : 'martial artist'
    } in white karate gi with fighting spirit. ${
      gender === 'male' ? 'Hadoken stance' : 'Ryu pose'
    }. White karate gi with red headband and belt. Hadoken energy ball charging between hands. Disciplined martial arts training pose. Shotokan karate fighting stance. Background with dojo and martial arts training. Blue and white ki energy lighting. Street Fighter aesthetic with martial arts mastery.`,

    Кен: `${baseSettings} A flashy ${
      gender === 'male' ? 'martial artist' : 'martial artist'
    } in red karate gi with flame techniques. ${
      gender === 'male' ? 'Shoryuken stance' : 'Ken pose'
    }. Red karate gi with blonde hair in ponytail. Flaming Shoryuken uppercut pose with fire effects. Flashy American martial arts style. Confident fighting stance with showmanship. Background with American urban setting. Red and orange flame lighting. Street Fighter aesthetic with American flair.`,

    Соник: `${baseSettings} A speedy ${
      gender === 'male' ? 'hedgehog' : 'hedgehog'
    } in blue with super speed elements. ${
      gender === 'male' ? 'Super speed stance' : 'Sonic pose'
    }. Blue hedgehog design with red shoes and white gloves. Speed blur effects and motion lines. Spin dash or running pose with attitude. Golden rings and speed boost elements. Background with Green Hill Zone and loop-de-loops. Blue and gold speed lighting. Sonic the Hedgehog aesthetic with super speed.`,

    Марио: `${baseSettings} A heroic ${
      gender === 'male' ? 'plumber' : 'plumber'
    } in red and blue plumber outfit with power-ups. ${
      gender === 'male' ? 'Power-up jump stance' : 'Mario pose'
    }. Red shirt, blue overalls, and distinctive red cap with M logo. Super Mushroom, Fire Flower, or Star power-up effects. Classic jumping pose with fist raised. Warp pipe and Super Mario world elements. Background with Mushroom Kingdom and castle. Red and blue heroic lighting. Super Mario aesthetic with power-up abilities.`,

    Линк: `${baseSettings} A courageous ${
      gender === 'male' ? 'hero' : 'hero'
    } in green tunic with Master Sword and shield. ${
      gender === 'male' ? 'Hero of Hyrule stance' : 'Link pose'
    }. Green tunic and cap with chainmail and leather accessories. Master Sword and Hylian Shield. Bow and arrows with various adventure gear. Triforce symbol glowing with courage energy. Background with Hyrule kingdom and adventure elements. Green and gold heroic lighting. Legend of Zelda aesthetic with heroic adventure.`,

    'Клауд Страйф': `${baseSettings} A brooding ${
      gender === 'male' ? 'SOLDIER' : 'SOLDIER'
    } in dark outfit with massive sword. ${
      gender === 'male' ? 'Buster Sword stance' : 'Cloud pose'
    }. Spiky blonde hair in distinctive Cloud style. Dark SOLDIER outfit with shoulder armor and straps. Massive Buster Sword nearly as tall as wielder. Limit Break energy effects and materia magic. Background with Midgar city and Mako energy. Blue and green Mako lighting. Final Fantasy VII aesthetic with SOLDIER power.`,

    Сефирот: `${baseSettings} A ethereal ${
      gender === 'male' ? 'SOLDIER' : 'SOLDIER'
    } in black outfit with angelic elements. ${
      gender === 'male' ? 'One-winged angel stance' : 'Sephiroth pose'
    }. Long silver hair flowing dramatically. Black leather outfit with silver details. Masamune katana with impossible length. Single black wing and angelic/demonic aura. Background with burning Nibelheim and meteor. Silver and black dramatic lighting. Final Fantasy VII aesthetic with fallen angel power.`,

    Спаун: `${baseSettings} A hellish ${
      gender === 'male' ? 'anti-hero' : 'anti-hero'
    } in demonic armor with chains and cape. ${
      gender === 'male' ? 'Hell-spawned stance' : 'Spawn pose'
    }. Black and red demonic armor with skull motifs. Flowing red cape with mind of its own. Chains wrapping around body as weapons. Glowing green eyes and necroplasm energy. Background with hellish landscape and urban decay. Red and green hellish lighting. Spawn aesthetic with hellish supernatural power.`,

    Альтаир: `${baseSettings} A master ${
      gender === 'male' ? 'assassin' : 'assassin'
    } in white hooded robes with hidden blade. ${
      gender === 'male' ? 'Eagle vision stance' : 'Altair pose'
    }. White assassin robes with hood covering face. Hidden blade extending from wrist gauntlet. Eagle feathers and Assassin insignia details. Parkour pose on Middle Eastern architecture. Background with Jerusalem during Crusades. White and gold ancient lighting. Assassin's Creed aesthetic with stealth mastery.`,

    Эцио: `${baseSettings} A charismatic ${
      gender === 'male' ? 'assassin' : 'assassin'
    } in Renaissance Italian assassin robes. ${
      gender === 'male' ? 'Renaissance master stance' : 'Ezio pose'
    }. Ornate Italian Renaissance assassin outfit with family colors. Dual hidden blades and Renaissance weapons. Confident expression with Italian charm. Eagle vision and parkour abilities. Background with Renaissance Italian architecture. Rich brown and gold Renaissance lighting. Assassin's Creed aesthetic with Renaissance mastery.`,

    'Алекс Мерсер': `${baseSettings} A powerful ${
      gender === 'male' ? 'shapeshifter' : 'shapeshifter'
    } in dark tactical outfit with biomass elements. ${
      gender === 'male' ? 'Prototype stance' : 'Alex Mercer pose'
    }. Black military jacket with viral veins glowing red. One arm morphing into biomass weapon. Dark hooded appearance with viral infection patterns. Athletic build with superhuman posture. Background with apocalyptic urban setting. Red and black viral lighting. Prototype aesthetic with shapeshifting mastery.`,

    'Лара Крофт': `${baseSettings} A adventurous ${
      gender === 'male' ? 'archaeologist' : 'archaeologist'
    } in practical expedition gear with dual pistols. ${
      gender === 'male' ? 'Tomb raider stance' : 'Lara Croft pose'
    }. Practical brown tank top and cargo pants. Dual pistols holstered at thighs. Rock climbing gear and archaeological tools. Athletic build with adventure-ready posture. Background with ancient tomb and treasure hunting. Brown and gold adventure lighting. Tomb Raider aesthetic with archaeological adventure.`,

    'Чун Ли': `${baseSettings} A strong ${
      gender === 'male' ? 'martial artist' : 'martial artist'
    } in blue qipao with combat elements. ${
      gender === 'male' ? 'Lightning legs stance' : 'Chun-Li pose'
    }. Blue qipao dress with combat modifications and white boots. Ox horns hairstyle with hair ribbons. Lightning Legs kick technique with motion blur. ICPO police elements and justice themes. Background with Chinese architecture and fighting tournament. Blue and white lightning lighting. Street Fighter aesthetic with Chinese martial arts.`,

    // Shortened for space efficiency - rare game characters
    'Соня Блейд': `${baseSettings} A military ${gender === 'male' ? 'operative' : 'operative'} in green Special Forces outfit. Background with military base.`,
    Китана: `${baseSettings} A royal ${gender === 'male' ? 'assassin' : 'assassin'} in blue Edenian outfit with fan weapons. Royal palace background.`,
    Джейд: `${baseSettings} A loyal ${gender === 'male' ? 'bodyguard' : 'bodyguard'} in green Edenian outfit with staff weapons.`,
    Милина: `${baseSettings} A savage ${gender === 'male' ? 'clone' : 'clone'} in pink outfit with Tarkatan teeth and sai weapons.`,
    'Трисс Меригольд': `${baseSettings} A sorceress in elegant blue robes with fire magic. Auburn hair and magical academy background.`,
    Йеннифэр: `${baseSettings} A powerful sorceress in black outfit with portal magic effects. Elegant style with magical authority.`,
    Элли: `${baseSettings} A survivor in post-apocalyptic gear with makeshift weapons. Overgrown ruins background.`,
    'Джилл Валентайн': `${baseSettings} A S.T.A.R.S. operative in blue uniform with anti-bioweapon gear. Raccoon City background.`,
    'Ада Вонг': `${baseSettings} A spy in elegant red dress with espionage gear. Corporate intrigue background.`,
    'Принцесса Зельда': `${baseSettings} A wise ${gender === 'male' ? 'prince' : 'princess'} in royal Hylian dress with Triforce power. Hyrule Castle background.`,
    'Самус Аран': `${baseSettings} A armored bounty hunter in orange Power Suit with arm cannon. Alien planet background.`,
    Байонетта: `${baseSettings} A stylish witch in black outfit with guns and magical hair. Clocktower background.`,
    Каратэ: `${baseSettings} A martial artist in white karate gi with colored belt. Traditional dojo background.`,
    'Тифа Локхарт': `${baseSettings} A strong fighter in dark outfit with martial arts gloves. 7th Heaven bar background.`,
    Аэрис: `${baseSettings} A gentle flower seller in pink dress with healing magic. Flower field and church background.`,

    // ================= MOVIES/TV HEROES (MISSING) =================
    'Джон Уик': `${baseSettings} A professional assassin in black suit with tactical precision. Continental Hotel background.`,
    Терминатор: `${baseSettings} A cybernetic assassin in dark outfit with red glowing eyes. Post-apocalyptic background.`,
    Хищник: `${baseSettings} A alien hunter with bio-mask and cloaking technology. Jungle hunting ground background.`,
    Селин: `${baseSettings} A vampire death dealer in black leather with dual pistols. Gothic architecture background.`,
    'Алиса Абернати': `${baseSettings} A enhanced survivor with T-virus abilities and tactical outfit. Umbrella Corp background.`,

    // ================= STAR WARS HEROES (MISSING) =================
    'Рэй Скайуокер': `${baseSettings} A powerful Jedi with lightsaber and Force abilities. Jakku desert background.`,
    'Принцесса Лея': `${baseSettings} A rebel leader in white senatorial dress with blaster. Rebel alliance background.`,
    'Ахсока Тано': `${baseSettings} A skilled former Jedi with dual white lightsabers. Clone Wars background.`,
    'Падме Амидала': `${baseSettings} A elegant senator in Naboo royal dress. Galactic Senate background.`,
    'Джайна Соло': `${baseSettings} A Jedi Master in robes with advanced lightsaber techniques. New Jedi Order background.`,

    // ================= DISNEY/FAIRY TALES HEROES (MISSING) =================
    Эльза: `${baseSettings} A magical ice ${gender === 'male' ? 'king' : 'queen'} in crystalline dress with snow powers. Ice palace background.`,
    Анна: `${baseSettings} A spirited ${gender === 'male' ? 'prince' : 'princess'} in Arendelle royal outfit. Norwegian kingdom background.`,
    Мулан: `${baseSettings} A brave warrior in Chinese armor with family sword. Great Wall of China background.`,
    Покахонтас: `${baseSettings} A nature-connected tribal leader in Native American outfit. Virginia wilderness background.`,
    Мерида: `${baseSettings} A rebellious Scottish archer with bow and curly red hair. Scottish highlands background.`,

    Моана: `${baseSettings} A brave ${
      gender === 'male' ? 'ocean voyager' : 'Polynesian princess'
    } in tropical island outfit with ocean-themed elements. ${
      gender === 'male' ? 'Adventurous seafarer stance' : 'Moana pose'
    }. Long curly dark hair flowing in ocean breeze. Tropical lei and island clothing. Heart of Te Fiti glowing in hand. Ocean waves responding to her call. Background with tropical Polynesian island, sailing boat, and ocean spirits. Bright tropical lighting with blue and gold ocean colors. Disney Moana aesthetic with oceanic magic.`,
  }

  // 🚨 СТРОГАЯ ВАЛИДАЦИЯ: проверяем есть ли промпт для героя
  const heroPrompt = heroPrompts[heroName]

  if (!heroPrompt) {
    // 🔥 CRITICAL ERROR: Герой в списке, но промпта нет!
    console.error(
      `🚨 [HERO VALIDATION ERROR] Hero "${heroName}" is in heroes list but has NO prompt!`,
      {
        heroName,
        gender,
        availablePrompts: Object.keys(heroPrompts).length,
        heroesListLength: AI_HEROES.male.length + AI_HEROES.female.length,
      }
    )

    // Возвращаем fallback с логированием
    return `${baseSettings} A confident ${
      gender === 'male' ? 'man' : 'woman'
    } in modern stylish outfit inspired by ${heroName}. Professional studio lighting with bright, warm tones. Clean background with subtle color effects matching ${heroName}'s signature palette. The person wears fashionable glasses and has a charismatic expression. High-quality portrait photography with premium aesthetic.`
  }

  // ✅ Промпт найден
  console.log(`✅ [HERO VALIDATION] Hero "${heroName}" has valid prompt`, {
    heroName,
    gender,
    promptLength: heroPrompt.length,
  })

  return heroPrompt
}

// In-flight guard for the free-superhero generation. The 3/month quota is
// checked at scene entry but the counter is incremented only AFTER generation,
// so concurrent hero-button taps (webhook mode dispatches each as a separate
// request) would all pass the stale entry gate and each generate a free paid
// image. This Map serializes taps per user. It is a Map with a timestamp (not a
// bare Set) so a missed release auto-expires and can never permanently lock a
// user out. Keyed by telegram_id; single process, so set/has are atomic vs
// concurrent taps before the first await.
const superheroGenInFlight = new Map<string, number>()
const SUPERHERO_INFLIGHT_TTL_MS = 180_000 // 3 min -- covers max generation time

/**
 * One button label per hero, for both places that draw hero buttons.
 *
 * There used to be two copies of this table inside two wizard steps, 33 entries
 * and 16, and they had drifted: one spelled a hero with the palette fallback and
 * the other with her own emoji, and only the first spelling was a key in the
 * handler's buttonToHeroMap, so the button the second one drew resolved to
 * nothing (#1721 added the missing key).
 *
 * Merging them is safe and was measured rather than assumed: the two tables
 * agree on every one of the 15 heroes they share, and of the 22 heroes the scene
 * actually offers exactly one renders differently -- she now gets her own emoji
 * instead of the generic fallback, and both spellings resolve.
 */
const HERO_BUTTON_TEXT: Record<string, { ru: string; en: string }> = {
  'Алая ведьма': { ru: '🌹 Алая ведьма', en: '🌹 Wanda Maximoff' },
  'Алёша Попович': { ru: '🎯 Алёша Попович', en: '🎯 Alyosha Popovich' },
  'Баба Яга': { ru: '🏠 Баба Яга', en: '🏠 Baba Yaga' },
  'Василиса Прекрасная': { ru: '👸 Василиса Прекрасная', en: '👸 Vasilisa' },
  'Гвен Стейси': { ru: '🕸️ Гвен Стейси', en: '🕸️ Gwen Stacy' },
  'Добрыня Никитич': { ru: '💉 Добрыня Никитич', en: '💉 Dobrynya Nikitich' },
  'Доктор Стрэндж': { ru: '🧿 Доктор Стрэндж', en: '🧿 Doctor Strange' },
  'Жар-птица': { ru: '🔥 Жар-птица', en: '🔥 Firebird' },
  'Железный человек': { ru: '🤖 Железный человек', en: '🤖 Iron Man' },
  'Звёздный лорд': { ru: '🚀 Звёздный лорд', en: '🚀 Star Lord' },
  'Иван-царевич': { ru: '🤴 Иван-царевич', en: '🤴 Ivan Tsarevich' },
  'Илья Муромец': { ru: '🛡️ Илья Муромец', en: '🛡️ Ilya Muromets' },
  'Капитан Америка': { ru: '🇦🇲 Капитан Америка', en: '🇦🇲 Captain America' },
  'Капитан Марвел': { ru: '⭐ Капитан Марвел', en: '⭐ Captain Marvel' },
  'Кастомный промпт': { ru: '✍️ Свой промпт', en: '✍️ Custom Prompt' },
  'Кощей Бессмертный': { ru: '💀 Кощей Бессмертный', en: '💀 Koschei' },
  'Красная Шапочка': { ru: '🧧 Красная Шапочка', en: '🧧 Red Hood' },
  'Лайт Ягами': { ru: '📓 Лайт Ягами', en: '📓 Light Yagami' },
  'Лара Крофт': { ru: '🗿 Лара Крофт', en: '🗿 Lara Croft' },
  'Леви Аккерман': { ru: '⚔️ Леви Аккерман', en: '⚔️ Levi Ackerman' },
  'Марья Моревна': { ru: '💂 Марья Моревна', en: '💂 Marya Morevna' },
  'Пеппи Длинныйчулок': { ru: '🦾 Пеппи Длинныйчулок', en: '🦾 Pippi' },
  'Сейлор Мун': { ru: '🌙 Сейлор Мун', en: '🌙 Sailor Moon' },
  'Серый Волк': { ru: '🐺 Серый Волк', en: '🐺 Grey Wolf' },
  'Скарлет Витч': { ru: '🔮 Скарлет Витч', en: '🔮 Scarlet Witch' },
  'Снежная Королева': { ru: '🌨️ Снежная Королева', en: '🌨️ Snow Queen' },
  'Соколиный глаз': { ru: '🏹 Соколиный глаз', en: '🏹 Hawkeye' },
  'Харли Квинн': { ru: '🎭 Харли Квинн', en: '🎭 Harley Quinn' },
  'Царевна-лягушка': { ru: '🐸 Царевна-лягушка', en: '🐸 Frog Princess' },
  'Человек-паук': { ru: '🕷️ Человек-паук', en: '🕷️ Spider-Man' },
  'Чудо-женщина': { ru: '⭐ Чудо-женщина', en: '⭐ Wonder Woman' },
  'Чёрная вдова': { ru: '🕷️ Чёрная вдова', en: '🕷️ Black Widow' },
  'Эдвард Элрик': { ru: '⚙️ Эдвард Элрик', en: '⚙️ Edward Elric' },
  'Эрен Йегер': { ru: '🧿 Эрен Йегер', en: '🧿 Eren Yeager' },
}

/** The label a hero is drawn with; falls back to the palette prefix. */
function getHeroButtonText(heroName: string, isRu: boolean): string {
  const t = HERO_BUTTON_TEXT[heroName]
  if (!t) return `\u{1F3A8} ${heroName}`
  return isRu ? t.ru : t.en
}

export const avatarTransformScene = new Scenes.WizardScene<MyContext>(
  ModeEnum.AvatarTransform,
  // Шаг 0: Объяснение ИИ Герои + выбор пола
  async ctx => {
    console.log(
      '🔴 [DEBUG avatarTransform] ========== STEP 0 ENTERED =========='
    )
    console.log('🔴 [DEBUG avatarTransform] telegramId:', ctx.from?.id)
    console.log(
      '🔴 [DEBUG avatarTransform] messageText:',
      ctx.message && 'text' in ctx.message ? ctx.message.text : 'N/A'
    )
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString() || 'unknown'

    logger.info(
      '[AvatarTransformScene] Starting explanation and gender selection',
      {
        telegramId,
        step: 'explanation_and_gender',
      }
    )

    // 🔗 ОБРАБОТКА РЕФЕРАЛЬНЫХ ССЫЛОК
    // Извлекаем invite code из команды /start если он есть
    let inviteCode = ''
    if (ctx.message && 'text' in ctx.message) {
      const messageText = ctx.message.text
      const { extractInviteCodeFromContext } = await import(
        '@/helpers/contextUtils'
      )
      inviteCode = extractInviteCodeFromContext(ctx)

      if (inviteCode) {
        ctx.session.inviteCode = inviteCode
        logger.info('[AvatarTransformScene] Referral code detected', {
          telegramId,
          inviteCode,
          step: 'referral_detected',
        })
      }
    }

    // 🛡️ ПРОВЕРЯЕМ ЛИМИТ ГЕНЕРАЦИЙ СУПЕРГЕРОЕВ (НОВАЯ СИСТЕМА)
    logger.info('[AvatarTransformScene] Checking superhero generation limits', {
      telegramId,
      step: 'checking_generation_limits',
    })

    /*
     * THE FIRST SCREEN A NEW PERSON SEES MUST SURVIVE A DATABASE HICCUP.
     *
     * Both checks below were awaited unprotected, in the opening step of the
     * only path every new arrival takes: /start -> CreateUserScene -> here.
     * A timeout, a slow pool, a transient error, and the step threw -- so the
     * free demo never appeared and the person's first impression of the product
     * was nothing at all.
     *
     * THE TRADE, said out loud because it is a real one. Both failures now fall
     * OPEN: the quota check that limits free generations to three a month, and
     * the legacy check that decides whether to create the user row. Falling
     * closed would deny the demo to everyone during any outage; falling open
     * costs, at worst, a few extra free images while the database is unwell.
     * 271 people have taken this demo and 44 arrived in August alone -- the
     * asymmetry is not close.
     *
     * The failure is loud in the log precisely because it is silent to the
     * person: a fail-open that nobody can see becomes a quota that quietly
     * stopped existing.
     */
    let generationCheck
    try {
      generationCheck = await checkSuperheroGenerationUsage(telegramId)
    } catch (error) {
      logger.error(
        '[AvatarTransformScene] generation-limit check failed; allowing the free demo anyway',
        {
          telegramId,
          error: error instanceof Error ? error.message : String(error),
          consequence:
            'the monthly free quota is not enforced for this request',
        }
      )
      generationCheck = {
        canGenerate: true,
        currentUsage: 0,
        maxUsage: 0,
        isAdmin: false,
        hasUnlimitedAccess: false,
        resetDate: null,
        reason: 'quota check unavailable',
        // Nothing was counted, so nothing is known. Access stays open (above);
        // the free generation does not.
        quotaKnown: false,
      } as Awaited<ReturnType<typeof checkSuperheroGenerationUsage>>
    }

    logger.info('[AvatarTransformScene] Generation limit check result', {
      telegramId,
      canGenerate: generationCheck.canGenerate,
      currentUsage: generationCheck.currentUsage,
      maxUsage: generationCheck.maxUsage,
      isAdmin: generationCheck.isAdmin,
      hasUnlimitedAccess: generationCheck.hasUnlimitedAccess,
      resetDate: generationCheck.resetDate,
      reason: generationCheck.reason,
      step: 'generation_limit_checked',
    })

    // 🔄 BACKWARD COMPATIBILITY: Также проверяем старую систему для создания пользователя
    const botName = ctx.botInfo?.username || 'AI_STARS_bot'
    let legacyUsageCheck
    try {
      legacyUsageCheck = await checkAvatarTransformUsage(
        telegramId,
        inviteCode || undefined,
        botName
      )
    } catch (error) {
      logger.error(
        '[AvatarTransformScene] legacy usage check failed; continuing to the demo',
        {
          telegramId,
          error: error instanceof Error ? error.message : String(error),
          consequence:
            'the user row may not have been created here; createUser runs elsewhere too',
        }
      )
      legacyUsageCheck = {
        canUse: true,
        isAdmin: false,
        hasUsedBefore: false,
      } as Awaited<ReturnType<typeof checkAvatarTransformUsage>>
    }

    logger.info(
      '[AvatarTransformScene] Legacy usage check (for user creation)',
      {
        telegramId,
        canUse: legacyUsageCheck.canUse,
        isAdmin: legacyUsageCheck.isAdmin,
        hasUsedBefore: legacyUsageCheck.hasUsedBefore,
        step: 'legacy_check_completed',
      }
    )

    // 📩 ОТПРАВЛЯЕМ УВЕДОМЛЕНИЕ РЕФЕРЕРУ при первом использовании с реферальным кодом
    if (
      inviteCode &&
      legacyUsageCheck.canUse &&
      !legacyUsageCheck.hasUsedBefore
    ) {
      try {
        const username =
          ctx.from?.username || ctx.from?.first_name || telegramId
        const { getReferalsCountAndUserData } = await import(
          '@/core/supabase/getReferalsCountAndUserData'
        )
        const { count } = await getReferalsCountAndUserData(inviteCode)

        await ctx.telegram.sendMessage(
          inviteCode,
          `🔗 Новый пользователь @${username} зарегистрировался по вашей ссылке.\n🆔 Уровень: ${
            count + 1
          }`
        )

        logger.info(
          '[AvatarTransformScene] Referral notification sent successfully',
          {
            telegramId,
            inviteCode,
            referralLevel: count + 1,
            step: 'referral_notification_sent',
          }
        )
      } catch (notificationError) {
        logger.warn(
          '[AvatarTransformScene] Could not send referral notification',
          {
            telegramId,
            inviteCode,
            error:
              notificationError instanceof Error
                ? notificationError.message
                : 'Unknown error',
            step: 'referral_notification_failed',
          }
        )
      }
    }

    // 🚫 ПРОВЕРЯЕМ ЛИМИТЫ ГЕНЕРАЦИИ (НОВАЯ СИСТЕМА)
    if (!generationCheck.canGenerate) {
      logger.info(
        '[AvatarTransformScene] User exceeded generation limit, showing limit info',
        {
          telegramId,
          currentUsage: generationCheck.currentUsage,
          maxUsage: generationCheck.maxUsage,
          resetDate: generationCheck.resetDate,
          reason: generationCheck.reason,
          step: 'generation_limit_exceeded',
        }
      )

      // Формируем сообщение в зависимости от статуса пользователя
      let resetInfo: string = ''

      if (generationCheck.resetDate) {
        const resetDate = new Date(generationCheck.resetDate)
        const resetDateString = resetDate.toLocaleDateString(
          isRu ? 'ru-RU' : 'en-US',
          {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }
        )
        resetInfo = isRu
          ? `\n📅 Лимит сбросится: ${resetDateString}`
          : `\n📅 Limit resets: ${resetDateString}`
      }

      // Используем новую helper функцию для формирования сообщения
      const limitMessage = getGenerationLimitMessage(
        isRu,
        generationCheck.hasUnlimitedAccess,
        generationCheck.currentUsage,
        generationCheck.maxUsage,
        generationCheck.resetDate,
        generationCheck.isAdmin,
        generationCheck.reason?.includes('NEUROTESTER')
          ? 'NEUROTESTER'
          : undefined
      )

      await ctx.reply(limitMessage, {
        parse_mode: 'HTML',
        /*
         * THE OFFER HAS TO BE INLINE, AND THIS IS THE ONE PLACE IT MATTERS MOST.
         *
         * This is the end of the free demo -- the single moment in the funnel
         * where a person has just been told what they get and what it costs.
         * The offer used to be a reply keyboard, and showMainMenu() four lines
         * below sends a greeting carrying remove_keyboard (deliberately: it is
         * what clears a stale wizard keyboard). So "Оформить подписку" was
         * wiped within a second of appearing, and what replaced it was the
         * generic "top up" follow-up two messages later, detached from the
         * reason for asking.
         *
         * An inline keyboard belongs to its own message and survives that
         * removal. go_to_subscription_scene is handled at BOT level in
         * registerCommands, not only inside menuScene, so the press still works
         * after the two scene.leave() calls below -- a scene-scoped handler
         * would have been swallowed here.
         */
        reply_markup: Markup.inlineKeyboard([
          [
            Markup.button.callback(
              isRu ? '💫 Оформить подписку' : '💫 Subscribe',
              'go_to_subscription_scene'
            ),
          ],
        ]).reply_markup,
      })

      // Возвращаемся в главное меню
      await ctx.scene.leave()
      await ctx.scene.leave()
      const { showMainMenu } = await import('@/navigation')
      await showMainMenu(ctx)
      return
    }

    // Логируем статус пользователя и оставшиеся генерации
    if (generationCheck.isAdmin) {
      logger.info('[AvatarTransformScene] Admin user - unlimited access', {
        telegramId,
        step: 'admin_access',
      })
    } else if (generationCheck.hasUnlimitedAccess) {
      logger.info('[AvatarTransformScene] User with unlimited access', {
        telegramId,
        reason: generationCheck.reason,
        step: 'unlimited_access',
      })
    } else {
      logger.info('[AvatarTransformScene] Regular user - generation allowed', {
        telegramId,
        step: 'first_usage',
      })
    }

    // 🎯 ЛИДMАГНЕТ: Делаем первое использование БЕСПЛАТНЫМ
    //
    // processBalanceOperation honours bypass_payment_check ONLY when
    // session.mode is ModeEnum.AvatarTransform. This scene never set
    // session.mode at all, so the flag always landed in the "bypass in a
    // non-AvatarTransform mode" branch: a SECURITY warning about the customer,
    // the flag deleted, and the full price charged. Every person the scene has
    // ever greeted with the free-demonstration promise below (line 1315) paid
    // for it. Setting the mode is what makes that sentence true.
    ctx.session.mode = ModeEnum.AvatarTransform

    // Only give the free one away against a quota we actually read. When the
    // count is unknown the person still generates (canGenerate stayed true
    // above) -- they just pay, instead of a database hiccup turning into
    // unlimited free paid generations.
    if (generationCheck.quotaKnown) {
      ctx.session.bypass_payment_check = true
    }

    logger.info(
      generationCheck.quotaKnown
        ? '[AvatarTransformScene] Lead magnet enabled - FREE transformation'
        : '[AvatarTransformScene] Lead magnet withheld - the quota could not be read; charging normally',
      {
        telegramId,
        step: 'lead_magnet_enabled',
        quotaKnown: generationCheck.quotaKnown,
        currentUsage: generationCheck.currentUsage,
        maxUsage: generationCheck.maxUsage,
      }
    )

    // Показываем объяснение ИИ Герои + выбор пола
    await ctx.reply(
      isRu
        ? `🎭 <b>ИИ ГЕРОИ - AI HEROES</b>\n\n🎨 Трансформируйтесь в любимого персонажа!\n\n🤖 <b>Наш ИИ превратит ваше фото в:</b>\n• Супергероев Marvel и DC\n• Персонажей аниме\n• Славянских героев\n• Игровых персонажей\n\n💫 <b>Это БЕСПЛАТНАЯ демонстрация возможностей!</b>\n🚀 <b>Полный доступ ко всем стилям - в подписке</b>\n\n👇 <b>Выберите пол для стиля персонажа:</b>`
        : `🎭 <b>AI HEROES</b>\n\n🎨 Transform into your favorite character!\n\n🤖 <b>Our AI will turn your photo into:</b>\n• Marvel and DC superheroes\n• Anime characters\n• Slavic heroes\n• Game characters\n\n💫 <b>This is a FREE demonstration!</b>\n🚀 <b>Full access to all styles - with subscription</b>\n\n👇 <b>Choose gender for character style:</b>`,
      {
        parse_mode: 'HTML',
        reply_markup: Markup.keyboard([
          [
            isRu ? '👨‍💼 Мужской образ' : '👨‍💼 Male style',
            isRu ? '👩‍💼 Женский образ' : '👩‍💼 Female style',
          ],
          [isRu ? 'Отмена' : 'Cancel', getMainMenuText(isRu)],
        ]).resize().reply_markup,
      }
    )

    return ctx.wizard.next()
  },
  // Шаг 1: Обработка выбора пола и показ выбора модели
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString() || 'unknown'

    if (!ctx.message || !('text' in ctx.message)) {
      return
    }

    const text = ctx.message.text

    // Обработка команд выхода из wizard
    if (text === '/menu' || text === '/cancel') {
      logger.info(
        '[AvatarTransformScene] User requested exit from gender selection',
        {
          telegramId,
          command: text,
        }
      )
      await ctx.scene.leave()
      await ctx.scene.leave()
      const { showMainMenu } = await import('@/navigation')
      await showMainMenu(ctx)
      return
    }

    // Игнорируем другие команды - они будут обработаны command handler'ом
    if (text.startsWith('/')) {
      logger.info(
        '[AvatarTransformScene] Ignoring command in gender selection',
        {
          telegramId,
          command: text,
        }
      )
      return
    }

    // Возврат в главное меню
    if (text === getMainMenuText(isRu)) {
      await ctx.reply(
        isRu ? '👋 Возвращаемся в главное меню' : '👋 Returning to main menu',
        { reply_markup: { remove_keyboard: true } }
      )
      await ctx.scene.leave()
      await ctx.scene.leave()
      const { showMainMenu } = await import('@/navigation')
      await showMainMenu(ctx)
      return
    }

    // Отмена
    if (text === (isRu ? 'Отмена' : 'Cancel')) {
      await ctx.reply(
        isRu
          ? '❌ Процесс отменён. Возвращаюсь в главное меню.'
          : '❌ Process cancelled. Returning to main menu.',
        { reply_markup: { remove_keyboard: true } }
      )
      await ctx.scene.leave()
      await ctx.scene.leave()
      const { showMainMenu } = await import('@/navigation')
      await showMainMenu(ctx)
      return
    }

    // Обработка выбора пола
    let gender: 'male' | 'female' | null = null

    if (text === (isRu ? '👨‍💼 Мужской образ' : '👨‍💼 Male style')) {
      gender = 'male'
      logger.info('[AvatarTransformScene] Male gender selected', { telegramId })
    } else if (text === (isRu ? '👩‍💼 Женский образ' : '👩‍💼 Female style')) {
      gender = 'female'
      logger.info('[AvatarTransformScene] Female gender selected', {
        telegramId,
      })
    }

    if (!gender) {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, выберите один из предложенных вариантов'
          : '❌ Please choose one of the suggested options'
      )
      return
    }

    // Сохраняем выбранный пол в сессии
    ctx.session.selectedGender = gender

    // Показываем выбор AI модели
    await ctx.reply(
      avatarModelCard(
        isRu,
        gender === 'male'
          ? isRu
            ? 'Мужской образ'
            : 'Male style'
          : isRu
            ? 'Женский образ'
            : 'Female style'
      ),
      {
        parse_mode: 'HTML',
        reply_markup: avatarModelKeyboard(isRu, true),
      }
    )

    return ctx.wizard.next()
  },
  // Шаг 2: Обработка выбора модели и получение фото пользователя
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString() || 'unknown'

    if (!ctx.message || !('text' in ctx.message)) {
      return
    }

    const text = ctx.message.text

    // Обработка команд выхода из wizard
    if (text === '/menu' || text === '/cancel') {
      logger.info(
        '[AvatarTransformScene] User requested exit from model selection',
        {
          telegramId,
          command: text,
        }
      )
      await ctx.scene.leave()
      await ctx.scene.leave()
      const { showMainMenu } = await import('@/navigation')
      await showMainMenu(ctx)
      return
    }

    // Игнорируем другие команды - они будут обработаны command handler'ом
    if (text.startsWith('/')) {
      logger.info(
        '[AvatarTransformScene] Ignoring command in model selection',
        {
          telegramId,
          command: text,
        }
      )
      return
    }

    // Отмена
    if (text === (isRu ? 'Отмена' : 'Cancel')) {
      await ctx.reply(
        isRu
          ? '❌ Процесс отменён. Возвращаюсь в главное меню.'
          : '❌ Process cancelled. Returning to main menu.',
        { reply_markup: { remove_keyboard: true } }
      )
      await ctx.scene.leave()
      await ctx.scene.leave()
      const { showMainMenu } = await import('@/navigation')
      await showMainMenu(ctx)
      return
    }

    // Возврат к выбору пола
    if (text === (isRu ? '🔙 Назад' : '🔙 Back')) {
      // Очищаем выбранный пол из сессии
      delete ctx.session.selectedGender

      // Показываем объяснение ИИ Герои + выбор пола заново
      await ctx.reply(
        isRu
          ? `🎭 <b>ИИ ГЕРОИ - AI HEROES</b>\n\n🎨 Трансформируйтесь в любимого персонажа!\n\n🤖 <b>Наш ИИ превратит ваше фото в:</b>\n• Супергероев Marvel и DC\n• Персонажей аниме\n• Славянских героев\n• Игровых персонажей\n\n💫 <b>Это БЕСПЛАТНАЯ демонстрация возможностей!</b>\n🚀 <b>Полный доступ ко всем стилям - в подписке</b>\n\n👇 <b>Выберите пол для стиля персонажа:</b>`
          : `🎭 <b>AI HEROES</b>\n\n🎨 Transform into your favorite character!\n\n🤖 <b>Our AI will turn your photo into:</b>\n• Marvel and DC superheroes\n• Anime characters\n• Slavic heroes\n• Game characters\n\n💫 <b>This is a FREE demonstration!</b>\n🚀 <b>Full access to all styles - with subscription</b>\n\n👇 <b>Choose gender for character style:</b>`,
        {
          parse_mode: 'HTML',
          reply_markup: Markup.keyboard([
            [
              isRu ? '👨‍💼 Мужской образ' : '👨‍💼 Male style',
              isRu ? '👩‍💼 Женский образ' : '👩‍💼 Female style',
            ],
            [getMainMenuText(isRu)],
          ]).resize().reply_markup,
        }
      )

      // Возвращаемся к шагу выбора пола (шаг 0, индекс 0)
      ctx.wizard.selectStep(0)
      return
    }

    // Обработка выбора модели
    const selectedModel = avatarModelFromButton(text)

    if (selectedModel) {
      logger.info('[AvatarTransformScene] Model selected from keyboard', {
        telegramId,
        selectedModel,
      })
    }

    if (!selectedModel) {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, выберите одну из предложенных моделей'
          : '❌ Please choose one of the suggested models'
      )
      return
    }

    // Сохраняем выбранную модель в сессии
    ctx.session.selectedModel = selectedModel

    logger.info('[AvatarTransformScene] Model selected, getting user photo', {
      telegramId,
      selectedModel,
      step: 'fetching_photo',
    })

    try {
      // Получаем URL фотографии пользователя
      const userPhotoUrl = await getUserPhotoUrl(ctx, ctx.from?.id || 0)

      logger.info('[AvatarTransformScene] Got user photo URL', {
        telegramId,
        photoUrl: userPhotoUrl ? 'obtained' : 'failed',
        step: 'photo_obtained',
      })

      const modelDisplayName = avatarModelDisplayName(selectedModel)

      const gender = ctx.session.selectedGender
      const genderDisplay =
        gender === 'male'
          ? isRu
            ? 'Мужской образ'
            : 'Male style'
          : isRu
            ? 'Женский образ'
            : 'Female style'

      // One card instead of three copies, and it knows whether a photo exists.
      // The "use my avatar" button is drawn only when the avatar was really
      // fetched: offering an action that cannot be carried out IS the
      // 🚨 INVALID_URL that kept reaching the owner. The text explains why the
      // button is missing.
      const hasPhoto = !!userPhotoUrl
      const actionCaption = avatarActionCaption({
        isRu,
        genderDisplay,
        modelDisplayName,
        hasPhoto,
      })
      const actionKeyboard = avatarActionKeyboard(isRu, hasPhoto)

      try {
        const photoSent =
          hasPhoto &&
          (await sendPhotoWithFallback(ctx, userPhotoUrl, {
            caption: actionCaption,
            parse_mode: 'HTML',
            reply_markup: actionKeyboard,
          }))

        // Если фото не удалось отправить, отправляем текстовое сообщение
        if (!photoSent) {
          // Only a real send failure is a fault. Having no avatar is not one,
          // and it does not belong in the log.
          if (hasPhoto) {
            logger.warn(
              '[AvatarTransformScene] Photo fallback failed, sending text message'
            )
          }

          await ctx.reply(actionCaption, {
            parse_mode: 'HTML',
            reply_markup: actionKeyboard,
          })
        }
      } catch (photoError) {
        logger.warn(
          '[AvatarTransformScene] Failed to send photo, falling back to text',
          {
            telegramId,
            error: photoError,
          }
        )

        // Fallback: если не удалось отправить фото, показываем текстовое сообщение
        await ctx.reply(actionCaption, {
          parse_mode: 'HTML',
          reply_markup: actionKeyboard,
        })
      }

      // Сохраняем URL в сессии.
      // kontextImageUrl is typed `string | undefined`; writing the null here
      // stored it for step 3, which handed the same null back to the sender at
      // the second call site. Clear the field instead of poisoning it.
      ctx.session.kontextImageUrl = userPhotoUrl ?? undefined
      return ctx.wizard.next()
    } catch (error) {
      logger.error('[AvatarTransformScene] Error in photo step:', error)
      await ctx.reply(
        isRu
          ? '❌ Произошла ошибка при обработке фотографии\n\n🔄 Попробуйте позже или обратитесь в поддержку'
          : '❌ An error occurred while processing the photo\n\n🔄 Please try again later or contact support'
      )
      return ctx.scene.leave()
    }
  },
  // Шаг 3: Обработка выбора действия (мой аватар или загрузить фото)
  // (нумерация исправлена: раньше здесь стоял второй «Шаг 2»)
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString() || 'unknown'

    if (!ctx.message || !('text' in ctx.message)) {
      return
    }

    const text = ctx.message.text

    // Обработка команд выхода из wizard
    if (text === '/menu' || text === '/cancel') {
      logger.info(
        '[AvatarTransformScene] User requested exit from action selection',
        {
          telegramId,
          command: text,
        }
      )
      await ctx.scene.leave()
      await ctx.scene.leave()
      const { showMainMenu } = await import('@/navigation')
      await showMainMenu(ctx)
      return
    }

    // Игнорируем другие команды - они будут обработаны command handler'ом
    if (text.startsWith('/')) {
      logger.info(
        '[AvatarTransformScene] Ignoring command in action selection',
        {
          telegramId,
          command: text,
        }
      )
      return
    }

    // Возврат к выбору модели (поддержка текста с/без эмодзи)
    if (
      text.includes('Назад к выбору модели') ||
      text.includes('Back to model selection')
    ) {
      // Очищаем выбранную модель из сессии
      delete ctx.session.selectedModel

      const gender = ctx.session.selectedGender
      const genderDisplay =
        gender === 'male'
          ? isRu
            ? 'Мужской образ'
            : 'Male style'
          : isRu
            ? 'Женский образ'
            : 'Female style'

      // Показываем выбор AI модели заново
      await ctx.reply(avatarModelCard(isRu, genderDisplay), {
        parse_mode: 'HTML',
        reply_markup: avatarModelKeyboard(isRu, false),
      })

      // Возвращаемся к шагу выбора модели (шаг 1, индекс 1)
      ctx.wizard.selectStep(1)
      return
    }

    // Пользователь хочет использовать свой аватар (поддержка текста с/без эмодзи)
    if (
      text.includes('Использовать мой аватар') ||
      text.includes('Use my avatar') ||
      text.includes('Создать магнетический образ') ||
      text.includes('Create magnetic look')
    ) {
      if (!ctx.session.kontextImageUrl) {
        await ctx.reply(
          isRu
            ? '❌ Извините, не удалось найти ваше фото\n\n🔄 Попробуйте загрузить новое'
            : '❌ Sorry, could not find your photo\n\n🔄 Try uploading a new one'
        )
        return
      }

      // У нас уже есть выбранный пол из шага 1, переходим к выбору героя
      const gender = ctx.session.selectedGender
      if (!gender) {
        await ctx.reply(
          isRu
            ? '❌ Ошибка: не выбран пол. Начните заново'
            : '❌ Error: gender not selected. Start over'
        )
        await ctx.scene.leave()
        await ctx.scene.leave()
        const { showMainMenu } = await import('@/navigation')
        await showMainMenu(ctx)
        return
      }

      // Helper function to create rows with 2 buttons each
      const createTwoButtonRows = (buttons: string[]): string[][] => {
        const rows: string[][] = []
        for (let i = 0; i < buttons.length; i += 2) {
          rows.push(buttons.slice(i, i + 2))
        }
        return rows
      }

      // Создаем кнопки для выбора героев ТОЛЬКО для выбранного пола
      const primaryHeroes = AI_HEROES[gender]

      // 🌍 ЛОКАЛИЗАЦИЯ КНОПОК ДЛЯ ГЕРОЕВ
      const heroButtonsList = primaryHeroes.map(hero =>
        getHeroButtonText(hero, isRu)
      )

      const heroButtons = [
        ...createTwoButtonRows(heroButtonsList),
        // Последний ряд - служебные кнопки
        [
          isRu ? '🎲 Случайный стиль' : '🎲 Random style',
          isRu ? '🔙 Назад' : '🔙 Back',
        ],
      ]

      logger.info('[AvatarTransformScene] Creating hero selection keyboard:', {
        gender,
        primaryHeroesCount: primaryHeroes.length,
        buttonsStructure: heroButtons,
      })

      try {
        await ctx.reply(
          isRu
            ? `🤖 <b>Демонстрация AI-возможностей</b>\n\n🎯 Сейчас я покажу вам как наш бот трансформирует людей!\n\n💡 <b>Выберите пример для демонстрации:</b>\n\n🌟 <b>Топ-10 стилей для ${
                gender === 'male' ? 'мужчин' : 'женщин'
              }:</b>\n${primaryHeroes
                .slice(0, 10) // Показываем первые 10 героев в описании
                .map(hero => `• Стиль "${hero}"`)
                .join(
                  '\n'
                )}\n\n✍️ <b>+ Кастомный промпт</b> - создайте свой уникальный стиль!\n\n💰 <b>В полной версии доступны ЛЮБЫЕ образы!</b>\n🚀 <b>Технология: ${ctx.session.selectedModel === 'seedream45' ? 'SeeDream-4.5' : 'FLUX Kontext Max'}</b>`
            : `🤖 <b>AI Capabilities Demonstration</b>\n\n🎯 Now I'll show you how our bot transforms people!\n\n💡 <b>Choose an example for demonstration:</b>\n\n🌟 <b>Top-10 styles for ${
                gender === 'male' ? 'men' : 'women'
              }:</b>\n${primaryHeroes
                .slice(0, 10) // Показываем первые 10 героев в описании
                .map(hero => `• "${hero}" style`)
                .join(
                  '\n'
                )}\n\n✍️ <b>+ Custom Prompt</b> - create your unique style!\n\n💰 <b>In full version ANY styles available!</b>\n🚀 <b>Technology: ${ctx.session.selectedModel === 'seedream45' ? 'SeeDream-4.5' : 'FLUX Kontext Max'}</b>`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              keyboard: heroButtons,
              resize_keyboard: true,
              one_time_keyboard: false,
            },
          }
        )

        logger.info(
          '[AvatarTransformScene] Hero selection message sent successfully!'
        )
      } catch (error) {
        logger.error(
          '[AvatarTransformScene] Failed to send hero selection message:',
          error
        )
      }

      return ctx.wizard.next() // Переходим к следующему шагу - выбору героя
    }

    // Пользователь хочет загрузить новое фото (поддержка текста с/без эмодзи)
    const uploadPhotoVariants = isRu
      ? [
          'Загрузить фото',
          'Загрузить другое фото',
          'Загрузить своё фото',
          'Upload photo',
          'Upload my photo',
        ]
      : [
          'Upload photo',
          'Upload different photo',
          'Upload my photo',
          'Загрузить фото',
          'Загрузить своё фото',
        ]

    if (uploadPhotoVariants.some(variant => text.includes(variant))) {
      await ctx.reply(
        isRu
          ? `📸 <b>Загрузка нового фото</b>\n\n💡 Отправьте мне фотографию, которую хотите преобразовать\n\n✨ <b>Рекомендации:</b>\n• Четкое фото лица\n• Хорошее освещение\n• Минимум 512x512 пикселей`
          : `📸 <b>Upload New Photo</b>\n\n💡 Send me the photo you would like to transform\n\n✨ <b>Recommendations:</b>\n• Clear face photo\n• Good lighting\n• Minimum 512x512 pixels`,
        { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
      )
      return ctx.wizard.selectStep(5) // Переходим к шагу загрузки фото (индекс 5)
    }
  },
  // Шаг 4: Обработка выбора героя и генерация
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString() || 'unknown'

    // 🔍 ПРОВЕРЯЕМ ТИП СООБЩЕНИЯ ПЕРЕД ПОЛУЧЕНИЕМ ТЕКСТА
    if (!ctx.message || !('text' in ctx.message)) {
      logger.warn('[AvatarTransformScene] No text message received', {
        telegramId,
        messageType: ctx.message ? 'non-text' : 'no-message',
      })
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, используйте кнопки для выбора\n\n💡 Для выхода отправьте /menu или /start'
          : '❌ Please use buttons for selection\n\n💡 To exit send /menu or /start'
      )
      return
    }

    const receivedText = ctx.message.text

    // Обработка команд выхода из wizard
    if (receivedText === '/menu' || receivedText === '/cancel') {
      logger.info('[AvatarTransformScene] User requested exit from wizard', {
        telegramId,
        command: receivedText,
      })
      await ctx.scene.leave()
      await ctx.scene.leave()
      const { showMainMenu } = await import('@/navigation')
      await showMainMenu(ctx)
      return
    }

    // Игнорируем другие команды (начинаются с /) - они будут обработаны command handler'ом
    if (receivedText.startsWith('/')) {
      logger.info('[AvatarTransformScene] Ignoring command in wizard', {
        telegramId,
        receivedText,
        step: 'hero_selection',
        reason: 'command_will_be_handled_by_command_handler',
      })
      return
    }

    logger.info('[AvatarTransformScene] Processing hero selection', {
      telegramId,
      receivedText,
      step: 'hero_selection',
    })

    // Проверяем кнопку "Назад"
    if (receivedText === (isRu ? '🔙 Назад' : '🔙 Back')) {
      logger.info(
        '[AvatarTransformScene] Back button pressed, returning to action selection',
        {
          telegramId,
          currentStep: ctx.wizard?.cursor ?? 0,
        }
      )

      const gender = ctx.session.selectedGender
      const selectedModel = ctx.session.selectedModel
      const modelDisplayName = avatarModelDisplayName(selectedModel)
      const genderDisplay =
        gender === 'male'
          ? isRu
            ? 'Мужской образ'
            : 'Male style'
          : isRu
            ? 'Женский образ'
            : 'Female style'

      // Показываем сообщение выбора действия заново
      const userPhotoUrl = ctx.session.kontextImageUrl

      // The same card as in the photo step: one definition for both places.
      const hasPhoto = !!userPhotoUrl
      const actionCaption = avatarActionCaption({
        isRu,
        genderDisplay,
        modelDisplayName,
        hasPhoto,
      })
      const actionKeyboard = avatarActionKeyboard(isRu, hasPhoto)

      try {
        const photoSent =
          hasPhoto &&
          (await sendPhotoWithFallback(ctx, userPhotoUrl, {
            caption: actionCaption,
            parse_mode: 'HTML',
            reply_markup: actionKeyboard,
          }))

        // Если фото не удалось отправить, отправляем текстовое сообщение
        if (!photoSent) {
          await ctx.reply(actionCaption, {
            parse_mode: 'HTML',
            reply_markup: actionKeyboard,
          })
        }
      } catch (photoError) {
        await ctx.reply(actionCaption, {
          parse_mode: 'HTML',
          reply_markup: actionKeyboard,
        })
      }

      // Возвращаемся к выбору действия (шаг 2, индекс 2)
      ctx.wizard.selectStep(2)
      return
    }

    // 🎯 ИНИЦИАЛИЗИРУЕМ ПЕРЕМЕННУЮ ДЛЯ ВЫБРАННОГО ГЕРОЯ
    let selectedHero: string | null = null

    // 🎲 Обработка случайного выбора
    if (receivedText === (isRu ? '🎲 Случайный стиль' : '🎲 Random style')) {
      // Случайный выбор из всех доступных героев
      const allHeroes = [...AI_HEROES.male, ...AI_HEROES.female]
      const randomHero = allHeroes[Math.floor(Math.random() * allHeroes.length)]
      selectedHero = randomHero

      logger.info('[AvatarTransformScene] Random hero selected', {
        telegramId,
        selectedHero: randomHero,
      })
    } else {
      // 🔍 ПАРСИНГ ВЫБРАННОГО ГЕРОЯ ИЗ ЛОКАЛИЗОВАННЫХ КНОПОК
      // Маппинг кнопок к именам героев (с уникальными эмодзи)
      const buttonToHeroMap: Record<string, string> = {
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
        '🏠 Baba Yaga': 'Баба Яга',
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
        // DC Universe
        '🚀 Супермен': 'Супермен',
        '🚀 Superman': 'Супермен',
        '🦇 Бэтмен': 'Бэтмен',
        '🦇 Batman': 'Бэтмен',
        '⚡ Флэш': 'Флэш',
        '⚡ Flash': 'Флэш',
        '⭐ Чудо-женщина': 'Чудо-женщина',
        '⭐ Wonder Woman': 'Чудо-женщина',
        '🎭 Харли Квинн': 'Харли Квинн',
        '🎭 Harley Quinn': 'Харли Квинн',
        '🃏 Джокер': 'Джокер',
        '🃏 Joker': 'Джокер',
        // Marvel дополнительные
        '💚 Халк': 'Халк',
        '💚 Hulk': 'Халк',
        '🔴 Дэдпул': 'Дэдпул',
        '🔴 Deadpool': 'Дэдпул',
        '🦾 Росомаха': 'Росомаха',
        '🦾 Wolverine': 'Росомаха',
        '🕷️ Чёрная вдова': 'Чёрная вдова',
        '🕷️ Black Widow': 'Чёрная вдова',
        // Anime популярные
        '🥋 Гоку': 'Гоку',
        '🥋 Goku': 'Гоку',
        '🍥 Наруто': 'Наруто',
        '🍥 Naruto': 'Наруто',
        '🎩 Луффи': 'Луффи',
        '🎩 Luffy': 'Луффи',
        '🌙 Сейлор Мун': 'Сейлор Мун',
        '🌙 Sailor Moon': 'Сейлор Мун',
        '⚙️ Эдвард Элрик': 'Эдвард Элрик',
        '⚙️ Edward Elric': 'Эдвард Элрик',
        '⚔️ Ичиго': 'Ичиго',
        '⚔️ Ichigo': 'Ичиго',
        '👊 Саитама': 'Саитама',
        '👊 Saitama': 'Саитама',
        '📓 Лайт Ягами': 'Лайт Ягами',
        '📓 Light Yagami': 'Лайт Ягами',
        '🐈 Какаши': 'Какаши',
        '🐈 Kakashi': 'Какаши',
        '⚡ Сасукэ': 'Сасукэ',
        '⚡ Sasuke': 'Сасукэ',
        '🔥 Вегета': 'Вегета',
        '🔥 Vegeta': 'Вегета',
        '🧿 Эрен Йегер': 'Эрен Йегер',
        '🧿 Eren Yeager': 'Эрен Йегер',
        '⚔️ Леви Аккерман': 'Леви Аккерман',
        '⚔️ Levi Ackerman': 'Леви Аккерман',
        // Games популярные
        '🗿 Лара Крофт': 'Лара Крофт',
        '🗿 Lara Croft': 'Лара Крофт',
        '🍄 Марио': 'Марио',
        '🍄 Mario': 'Марио',
        '💨 Соник': 'Соник',
        '💨 Sonic': 'Соник',
        // Дополнительные герои с 🎨 префиксом (все герои из AI_HEROES)
        '🎨 Пикколо': 'Пикколо',
        '🎨 Натсу': 'Натсу',
        '🎨 Веном': 'Веном',
        '🎨 Киборг': 'Киборг',
        '🎨 Локи': 'Локи',
        '🎨 Человек-муравей': 'Человек-муравей',
        '🎨 Блэк Пантер': 'Блэк Пантер',
        '🎨 Карающий': 'Карающий',
        '🎨 Призрачный гонщик': 'Призрачный гонщик',
        '🎨 Зимний солдат': 'Зимний солдат',
        '🎨 Халк': 'Халк',
        '🎨 Дэдпул': 'Дэдпул',
        '🎨 Росомаха': 'Росомаха',
        '🎨 Чёрная вдова': 'Чёрная вдова',
        '🎨 Человек-паук': 'Человек-паук',
        '🎨 Железный человек': 'Железный человек',
        '🎨 Капитан Америка': 'Капитан Америка',
        '🎨 Тор': 'Тор',
        '🎨 Доктор Стрэндж': 'Доктор Стрэндж',
        '🎨 Соколиный глаз': 'Соколиный глаз',
        '🎨 Звёздный лорд': 'Звёздный лорд',
        '🎨 Капитан Марвел': 'Капитан Марвел',
        '🎨 Скарлет Витч': 'Скарлет Витч',
        '🎨 Алая ведьма': 'Алая ведьма',
        '🎨 Гамора': 'Гамора',
        '🎨 Шури': 'Шури',
        '🎨 Валькирия': 'Валькирия',
        '🎨 Супермен': 'Супермен',
        '🎨 Бэтмен': 'Бэтмен',
        '🎨 Флэш': 'Флэш',
        '🎨 Джокер': 'Джокер',
        '🎨 Гоку': 'Гоку',
        '🎨 Наруто': 'Наруто',
        '🎨 Луффи': 'Луффи',
        '🎨 Ичиго': 'Ичиго',
        '🎨 Саитама': 'Саитама',
        '🎨 Эдвард Элрик': 'Эдвард Элрик',
        '🎨 Лайт Ягами': 'Лайт Ягами',
        '🎨 Какаши': 'Какаши',
        '🎨 Сасукэ': 'Сасукэ',
        '🎨 Вегета': 'Вегета',
        '🎨 Эрен Йегер': 'Эрен Йегер',
        '🎨 Леви Аккерман': 'Леви Аккерман',
        '🎨 Илья Муромец': 'Илья Муромец',
        '🎨 Добрыня Никитич': 'Добрыня Никитич',
        '🎨 Алёша Попович': 'Алёша Попович',
        '🎨 Перун': 'Перун',
        '🎨 Святогор': 'Святогор',
        '🎨 Иван-царевич': 'Иван-царевич',
        '🎨 Кощей Бессмертный': 'Кощей Бессмертный',
        '🎨 Серый Волк': 'Серый Волк',
        '🎨 Емеля': 'Емеля',
        '🎨 Гвен Стейси': 'Гвен Стейси',
        // The second hero-button generator in this file spells her with the
        // spider emoji, and only the fallback spelling above was a key here, so
        // that button resolved to nothing. Additive: a new key cannot change
        // how any existing button resolves.
        '🕸️ Гвен Стейси': 'Гвен Стейси',
        '🎨 Шторм': 'Шторм',
        '🎨 Джин Грей': 'Джин Грей',
        '🎨 Роуг': 'Роуг',
        '🎨 Китти Прайд': 'Китти Прайд',
        '🎨 Псайлок': 'Псайлок',
        '🎨 Мистик': 'Мистик',
        '🎨 Эмма Фрост': 'Эмма Фрост',
        '🎨 Небула': 'Небула',
        '🎨 Капитан Картер': 'Капитан Картер',
        '🎨 Зелёный фонарь': 'Зелёный фонарь',
        '🎨 Аквамен': 'Аквамен',
        '🎨 Шазам': 'Шазам',
        '🎨 Зелёная стрела': 'Зелёная стрела',
        '🎨 Найтвинг': 'Найтвинг',
        '🎨 Дэфстроук': 'Дэфстроук',
        '🎨 Супергёрл': 'Супергёрл',
        '🎨 Бэтгерл': 'Бэтгерл',
        '🎨 Кэтвумен': 'Кэтвумен',
        '🎨 Ядовитый плющ': 'Ядовитый плющ',
        '🎨 Рейвен': 'Рейвен',
        '🎨 Старфайр': 'Старфайр',
        '🎨 Мера': 'Мера',
        '🎨 Хищные птицы': 'Хищные птицы',
        '🎨 Черная канарейка': 'Черная канарейка',
        '🎨 Джессика Круз': 'Джессика Круз',
        '🎨 Мику Хацунэ': 'Мику Хацунэ',
        '🎨 Сакура Харуно': 'Сакура Харуно',
        '🎨 Хината Хьюга': 'Хината Хьюга',
        '🎨 Цунадэ': 'Цунадэ',
        '🎨 Булма': 'Булма',
        '🎨 18-й андроид': '18-й андроид',
        '🎨 Эрза Скарлет': 'Эрза Скарлет',
        '🎨 Микаса Аккерман': 'Микаса Аккерман',
        '🎨 Рей Аянами': 'Рей Аянами',
        '🎨 Асука Лэнгли': 'Асука Лэнгли',
        '🎨 Фэй Валентайн': 'Фэй Валентайн',
        '🎨 Нами': 'Нами',
        '🎨 Нико Робин': 'Нико Робин',
        '🎨 Кая': 'Кая',
        '🎨 Риас Гремори': 'Риас Гремори',
        '🎨 Zero Two': 'Zero Two',
        '🎨 Алеша Попович': 'Алеша Попович',
        '🎨 Берегиня': 'Берегиня',
        '🎨 Русалка': 'Русалка',
        '🎨 Кратос': 'Кратос',
        '🎨 Геральт из Ривии': 'Геральт из Ривии',
        '🎨 Мастер Чиф': 'Мастер Чиф',
        '🎨 Данте': 'Данте',
        '🎨 Субзиро': 'Субзиро',
        '🎨 Скорпион': 'Скорпион',
        '🎨 Рю': 'Рю',
        '🎨 Кен': 'Кен',
        '🎨 Линк': 'Линк',
        '🎨 Клауд Страйф': 'Клауд Страйф',
        '🎨 Сефирот': 'Сефирот',
        '🎨 Спаун': 'Спаун',
        '🎨 Альтаир': 'Альтаир',
        '🎨 Эцио': 'Эцио',
        '🎨 Алекс Мерсер': 'Алекс Мерсер',
        '🎨 Чун Ли': 'Чун Ли',
        '🎨 Соня Блейд': 'Соня Блейд',
        '🎨 Китана': 'Китана',
        '🎨 Джейд': 'Джейд',
        '🎨 Милина': 'Милина',
        '🎨 Трисс Меригольд': 'Трисс Меригольд',
        '🎨 Йеннифэр': 'Йеннифэр',
        '🎨 Элли': 'Элли',
        '🎨 Джилл Валентайн': 'Джилл Валентайн',
        '🎨 Ада Вонг': 'Ада Вонг',
        '🎨 Принцесса Зельда': 'Принцесса Зельда',
        '🎨 Самус Аран': 'Самус Аран',
        '🎨 Байонетта': 'Байонетта',
        '🎨 Каратэ': 'Каратэ',
        '🎨 Тифа Локхарт': 'Тифа Локхарт',
        '🎨 Аэрис': 'Аэрис',
        '🎨 Джон Уик': 'Джон Уик',
        '🎨 Терминатор': 'Терминатор',
        '🎨 Хищник': 'Хищник',
        '🎨 Селин': 'Селин',
        '🎨 Алиса Абернати': 'Алиса Абернати',
        '🎨 Рэй Скайуокер': 'Рэй Скайуокер',
        '🎨 Принцесса Лея': 'Принцесса Лея',
        '🎨 Ахсока Тано': 'Ахсока Тано',
        '🎨 Падме Амидала': 'Падме Амидала',
        '🎨 Джайна Соло': 'Джайна Соло',
        '🎨 Эльза': 'Эльза',
        '🎨 Анна': 'Анна',
        '🎨 Мулан': 'Мулан',
        '🎨 Покахонтас': 'Покахонтас',
        '🎨 Мерида': 'Мерида',
        // Custom prompt mappings
        '✍️ Свой промпт': 'Кастомный промпт',
        '✍️ Custom Prompt': 'Кастомный промпт',
      }

      selectedHero = buttonToHeroMap[receivedText]

      // 🔍 Логируем результат маппинга
      logger.info('[AvatarTransformScene] Button mapping check', {
        telegramId,
        receivedText,
        mappedHero: selectedHero,
        isInMap: !!buttonToHeroMap[receivedText],
      })

      // ✍️ Обработка кастомного промпта
      if (selectedHero === 'Кастомный промпт') {
        // Переходим к шагу ввода кастомного промпта
        await ctx.reply(
          isRu
            ? '✍️ <b>Введите ваш кастомный промпт</b>\n\n💡 <b>Описание стиля должно содержать:</b>\n• Название персонажа или стиля\n• Описание внешности\n• Цветовую гамму\n• Настроение/атмосферу\n\n📝 <b>Пример:</b>\n"Воин-самурай в черном доспехе с красными акцентами, держащий катану, на фоне заката"\n\n⚠️ <b>Промпт должен быть от 10 до 500 символов</b>'
            : '✍️ <b>Enter your custom prompt</b>\n\n💡 <b>Style description should include:</b>\n• Character or style name\n• Appearance description\n• Color scheme\n• Mood/atmosphere\n\n📝 <b>Example:</b>\n"Samurai warrior in black armor with red accents, holding katana, sunset background"\n\n⚠️ <b>Prompt should be 10-500 characters</b>',
          { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
        )
        // Переходим к новому шагу для ввода кастомного промпта
        return ctx.wizard.selectStep(5) // Новый шаг для кастомного промпта
      }

      if (!selectedHero) {
        logger.warn('[AvatarTransformScene] Invalid hero selection', {
          telegramId,
          receivedText,
        })
        await ctx.reply(
          isRu
            ? '❌ Неверный выбор. Пожалуйста, используйте кнопки.'
            : '❌ Invalid selection. Please use the buttons.'
        )
        return
      }

      // 🚨 КРИТИЧЕСКАЯ ВАЛИДАЦИЯ ГЕРОЯ С TYPESCRIPT
      const heroValidationResult =
        await HeroValidationService.safeHeroSelection(
          ctx,
          selectedHero,
          ctx.session.selectedGender || 'male'
        )

      if (
        !heroValidationResult.success ||
        heroValidationResult.shouldRedirect
      ) {
        logger.error(
          '[AvatarTransformScene] Hero validation failed - redirecting user',
          {
            telegramId,
            selectedHero,
            validationResult: heroValidationResult,
          }
        )
        // HeroValidationService уже обработал ошибку и перенаправил пользователя
        return
      }

      logger.info('[AvatarTransformScene] Hero selected', {
        telegramId,
        buttonText: receivedText,
        selectedHero,
      })
    }

    // ✅ ПРОВЕРЯЕМ ЧТО ГЕРОЙ ВЫБРАН
    if (!selectedHero) {
      logger.error('[AvatarTransformScene] No hero selected', { telegramId })
      await ctx.reply(
        isRu
          ? '❌ Ошибка выбора героя. Попробуйте снова.'
          : '❌ Hero selection error. Try again.'
      )
      return
    }

    // Сохраняем выбранного героя в сессии
    ctx.session.selectedHero = selectedHero

    const gender = ctx.session.selectedGender

    if (!gender) {
      logger.error('[AvatarTransformScene] No gender in session', {
        telegramId,
      })
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не выбран пол. Начните заново'
          : '❌ Error: gender not selected. Start over'
      )
      // 🛠️ ИСПРАВЛЕНИЕ: Полностью выходим из сцены перед переходом
      await ctx.scene.leave()
      await ctx.scene.leave()
      const { showMainMenu } = await import('@/navigation')
      await showMainMenu(ctx)
      return
    }

    // Отображаемое имя героя для пользователя
    const heroDisplayName = isRu
      ? selectedHero
      : selectedHero === 'Человек-паук'
        ? 'Spider-Man'
        : selectedHero === 'Железный человек'
          ? 'Iron Man'
          : selectedHero === 'Капитан Америка'
            ? 'Captain America'
            : selectedHero === 'Тор'
              ? 'Thor'
              : selectedHero === 'Доктор Стрэндж'
                ? 'Doctor Strange'
                : selectedHero === 'Соколиный глаз'
                  ? 'Hawkeye'
                  : selectedHero === 'Звёздный лорд'
                    ? 'Star Lord'
                    : selectedHero === 'Капитан Марвел'
                      ? 'Captain Marvel'
                      : selectedHero === 'Скарлет Витч'
                        ? 'Scarlet Witch'
                        : selectedHero === 'Алая ведьма'
                          ? 'Wanda Maximoff'
                          : selectedHero === 'Гамора'
                            ? 'Gamora'
                            : selectedHero === 'Шури'
                              ? 'Shuri'
                              : selectedHero === 'Валькирия'
                                ? 'Valkyrie'
                                : selectedHero

    // Сообщение перед генерацией
    await ctx.reply(
      isRu
        ? `🎬 <b>Запускаю AI Transformation Demo</b>\n\n🎭 <b>Выбранный стиль:</b> ${heroDisplayName}\n\n⚡ <b>Демонстрация возможностей бота</b>\nЭто лишь ОДНА из сотен возможностей бота!\n\n🚀 <b>Хотите больше? Получите подписку после демо!</b>\n\n⏳ <b>Генерирую ваше превращение...</b>`
        : `🎬 <b>Starting AI Transformation Demo</b>\n\n🎭 <b>Selected style:</b> ${heroDisplayName}\n\n⚡ <b>Bot capabilities demonstration</b>\nThis is just ONE of hundreds of bot possibilities!\n\n🚀 <b>Want more? Get subscription after demo!</b>\n\n⏳ <b>Generating your transformation...</b>`,
      { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
    )

    // In-flight + quota re-check right before the paid generation (see the
    // superheroGenInFlight comment above). Rejects a duplicate concurrent tap,
    // and stops a sequential tap that would exceed the now-incremented quota.
    const superheroNowMs = Date.now()
    const superheroInFlightSince = superheroGenInFlight.get(telegramId)
    if (
      superheroInFlightSince &&
      superheroNowMs - superheroInFlightSince < SUPERHERO_INFLIGHT_TTL_MS
    ) {
      await ctx.reply(
        isRu
          ? '⏳ Уже генерирую ваше превращение, подождите немного.'
          : '⏳ Already generating your transformation, please wait.'
      )
      return
    }
    superheroGenInFlight.set(telegramId, superheroNowMs)
    const superheroQuotaRecheck =
      await checkSuperheroGenerationUsage(telegramId)
    if (!superheroQuotaRecheck.canGenerate) {
      superheroGenInFlight.delete(telegramId)
      await ctx.reply(
        isRu
          ? '❌ Достигнут лимит бесплатных генераций.'
          : '❌ Free generation limit reached.'
      )
      return
    }

    try {
      // Генерируем изображение с выбранным героем
      const userPhotoUrl = ctx.session.kontextImageUrl

      if (!userPhotoUrl) {
        logger.error('[AvatarTransformScene] No user photo URL', { telegramId })
        await ctx.reply(
          isRu
            ? '❌ Ошибка: не найдено фото пользователя'
            : '❌ Error: user photo not found'
        )
        // 🛠️ ИСПРАВЛЕНИЕ: Полностью выходим из сцены перед переходом
        await ctx.scene.leave()
        await ctx.scene.leave()
        const { showMainMenu } = await import('@/navigation')
        await showMainMenu(ctx)
        return
      }

      const prompt = createMarvelPromptByGender(gender, selectedHero)

      logger.info('[AvatarTransformScene] Prompt generated for hero', {
        telegramId,
        selectedHero,
        gender,
        promptLength: prompt?.length,
        promptPreview: prompt?.substring(0, 150),
      })

      logger.info('[AvatarTransformScene] Starting image generation', {
        telegramId,
        selectedHero,
        gender,
        promptLength: prompt.length,
        contextExists: !!ctx,
        contextTelegramExists: !!ctx?.telegram,
      })

      // Проверяем наличие контекста перед вызовом
      if (!ctx || !ctx.telegram) {
        logger.error(
          '[AvatarTransformScene] Context is missing before generateNanoBanana',
          {
            telegramId,
            ctxExists: !!ctx,
            ctxTelegramExists: !!ctx?.telegram,
          }
        )
        await ctx.reply(
          isRu
            ? '❌ Ошибка контекста. Попробуйте еще раз через /start'
            : '❌ Context error. Please try again via /start'
        )
        await ctx.scene.leave()
        await ctx.scene.leave()
        const { showMainMenu } = await import('@/navigation')
        await showMainMenu(ctx)
        return
      }

      // 🌟 Используем выбранную модель для трансформации
      const selectedModel = ctx.session.selectedModel || 'flux-kontext' // По умолчанию FLUX Kontext

      console.log(
        '🔥🔥🔥 [AvatarTransformScene] BEFORE CALLING AI MODEL 🔥🔥🔥',
        {
          telegramId,
          selectedModel,
          promptLength: prompt?.length,
          hasImageUrl: !!userPhotoUrl,
          userPhotoUrl: userPhotoUrl ? redactBotToken(userPhotoUrl) : 'NO_URL',
          selectedHero,
        }
      )

      logger.info('[AvatarTransformScene] Calling AI model', {
        telegramId,
        selectedModel,
        promptLength: prompt?.length,
        hasImageUrl: !!userPhotoUrl,
      })

      // 🚀 COMPREHENSIVE AI GENERATION WITH FALLBACK LOGIC
      let result: string | null = null
      const attemptedModels: string[] = []
      /*
       * A FALLBACK CHAIN IS FOR BROKEN PROVIDERS, NOT FOR AN EMPTY WALLET.
       *
       * On 2026-09-15 at 08:56 one person with a balance of 0 tapped one
       * transform. Every model in the chain checks the same balance against the
       * same price, so the first refusal already decided the outcome -- and the
       * three retries after it produced four alerts in the owner's channel, one
       * of which carried the customer's whole prompt.
       *
       * This flag ends the chain at the first "no money" and makes the ending
       * honest. It is set only by `isBalanceRefusal`, which reads the wording
       * narrowly on purpose: a database that cannot ANSWER the balance question
       * is an outage, must not stop the chain, and must still page the owner.
       */
      let refusedForMoney = false

      // Define the priority order for models with fallback
      const modelPriority = avatarModelPriority(selectedModel)

      console.log('🎯 Starting AI generation with fallback logic:', {
        telegramId,
        selectedModel,
        modelPriority,
      })

      for (const modelToTry of modelPriority) {
        if (result) break // Success, no need to try other models

        try {
          attemptedModels.push(modelToTry)
          console.log(`🤖 Attempting generation with ${modelToTry}...`, {
            telegramId,
          })

          if (modelToTry === 'gpt-image-25') {
            console.log('🎨 Using GPT-Image-2.5...', { telegramId })
            const gptImageResult = await generateGptImage25({
              telegram_id: telegramId,
              promptText: prompt,
              inputImageUrl: userPhotoUrl,
              username: ctx.from?.username || 'unknown',
              is_ru: isRu,
              ctx,
              // Portrait, like every other model in this chain.
              aspect_ratio: '9:16',
              suppressUserErrors: true, // Don't show errors in fallback chain
            })

            if (gptImageResult) {
              result = 'success'
              console.log('✅ GPT-Image-2.5 generation successful!', {
                telegramId,
              })
              break
            }
          } else if (modelToTry === 'seedream45') {
            console.log('🎭 Using SeeDream-4.5...', { telegramId })
            const seedreamResult = await generateSeeDream45({
              telegram_id: telegramId,
              prompt: prompt,
              inputImageUrl: userPhotoUrl,
              username: ctx.from?.username || 'unknown',
              is_ru: isRu,
              ctx,
              size: '2K',
              aspect_ratio: '9:16',
              suppressUserErrors: true, // ✅ Don't show errors in fallback chain
            })

            if (seedreamResult?.image) {
              result = 'success'
              console.log('✅ SeeDream-4.5 generation successful!', {
                telegramId,
              })
              break
            }
          } else if (modelToTry === 'nano-banana') {
            console.log('🍌 Using Nano Banana...', { telegramId })
            const nanoBananaResult = await generateNanoBanana({
              telegram_id: telegramId,
              promptText: prompt,
              inputImageUrl: userPhotoUrl,
              username: ctx.from?.username || 'unknown',
              is_ru: isRu,
              ctx,
              promptStyle: 'headshot',
              suppressUserErrors: true, // ✅ Don't show errors in fallback chain
            })

            if (nanoBananaResult) {
              result = 'success'
              console.log('✅ Nano Banana generation successful!', {
                telegramId,
              })
              break
            }
          } else if (modelToTry === 'flux-kontext') {
            console.log('🤖 Using FLUX Kontext Max...', { telegramId })

            try {
              // Try new FLUX Kontext Max service first
              const fluxMaxResult = await generateFluxKontextMax({
                telegram_id: telegramId,
                prompt: prompt,
                inputImageUrl: userPhotoUrl,
                username: ctx.from?.username || 'unknown',
                is_ru: isRu,
                ctx,
                // Portrait, like the other two models in this same chain
                // (seedream45 above asks for '9:16'). 'match_input_image'
                // meant the shape of the INPUT picture, and the input here is
                // a square Telegram avatar: one and the same transformation
                // returned a square or a vertical frame depending on which
                // model answered first.
                aspect_ratio: '9:16',
                suppressUserErrors: true, // ✅ Don't show errors in fallback chain
              })

              if (fluxMaxResult?.image) {
                result = 'success'
                console.log('✅ FLUX Kontext Max generation successful!', {
                  telegramId,
                })
                break
              }
            } catch (fluxMaxError) {
              // The legacy service checks the same balance against the same
              // price, so retrying it after a money refusal cannot succeed --
              // it only produces the fourth alert, the one that shipped the
              // customer's prompt to the owner's channel. Hand it upward.
              if (isBalanceRefusal(fluxMaxError)) throw fluxMaxError

              console.log('⚠️ FLUX Kontext Max failed, trying legacy FLUX...', {
                telegramId,
              })

              // Fallback to legacy FLUX service
              const fluxLegacyResult = await generateFluxKontext({
                telegram_id: telegramId,
                prompt: prompt,
                inputImageUrl: userPhotoUrl,
                modelType: 'max',
                username: ctx.from?.username || 'unknown',
                is_ru: isRu,
                ctx,
                suppressUserErrors: true, // ✅ Don't show errors in fallback chain
              })

              if (fluxLegacyResult?.image) {
                result = 'success'
                console.log('✅ Legacy FLUX Kontext generation successful!', {
                  telegramId,
                })
                break
              }
            }
          }
        } catch (modelError) {
          console.error(`❌ ${modelToTry} generation failed:`, {
            telegramId,
            modelError:
              modelError instanceof Error ? modelError.message : 'Unknown',
            stack: modelError instanceof Error ? modelError.stack : undefined,
          })

          // Nothing further down the chain is cheaper or free: every model
          // reads the same balance. Stop, and say so honestly below.
          if (isBalanceRefusal(modelError)) {
            refusedForMoney = true
            logger.warn(
              '[AvatarTransformScene] stopped the fallback chain: the balance is short',
              {
                telegramId,
                model: modelToTry,
                skippedModels: modelPriority.slice(
                  modelPriority.indexOf(modelToTry) + 1
                ),
              }
            )
            break
          }

          // Continue to next model in fallback chain
          logger.warn(
            `[AvatarTransformScene] ${modelToTry} failed, trying next model`,
            {
              telegramId,
              error:
                modelError instanceof Error ? modelError.message : 'Unknown',
              attemptedModels,
              remainingModels: modelPriority.slice(
                modelPriority.indexOf(modelToTry) + 1
              ),
            }
          )
        }
      }

      // If all models failed
      if (!result) {
        /*
         * TWO ENDINGS, BECAUSE THERE ARE TWO REASONS.
         *
         * There used to be one: "all AI models are temporarily unavailable",
         * sent with `remove_keyboard`. For the person whose balance was short
         * that sentence was false in both halves -- the models were up, and the
         * only thing standing between them and the picture was a top-up they
         * were now given no way to make. It also paged the owner about a
         * working system.
         */
        if (refusedForMoney) {
          logger.warn('[AvatarTransformScene] refused: the balance is short', {
            telegramId,
            attemptedModels,
            selectedModel,
          })

          await ctx.reply(
            isRu
              ? '⭐ Недостаточно звезд на балансе для этой генерации. Пополните баланс — и я сразу сделаю картинку.'
              : '⭐ Not enough stars on your balance for this generation. Top up and I will make the image right away.',
            standardButtons(isRu)
          )

          await ctx.scene.leave()
          return
        }

        console.error('🚨 ALL AI MODELS FAILED!', {
          telegramId,
          attemptedModels,
          selectedModel,
        })

        logger.error('[AvatarTransformScene] All AI models failed', {
          telegramId,
          attemptedModels,
          selectedModel,
        })

        await ctx.reply(
          isRu
            ? '❌ Извините, все AI модели временно недоступны. Попробуйте позже или обратитесь в поддержку.'
            : '❌ Sorry, all AI models are temporarily unavailable. Please try later or contact support.',
          standardButtons(isRu)
        )

        await ctx.scene.leave()
        return
      }

      console.log(
        '🎯🎯🎯 [AvatarTransformScene] AFTER AI MODEL GENERATION 🎯🎯🎯',
        {
          telegramId,
          selectedModel,
          resultReceived: !!result,
        }
      )

      logger.info('[AvatarTransformScene] AI model generation completed', {
        telegramId,
        selectedModel,
        success: !!result,
      })

      // 🛡️ ЗАПИСЫВАЕМ ИСПОЛЬЗОВАНИЕ (НОВАЯ СИСТЕМА)
      // Увеличиваем счетчик генераций супергероев
      const incrementSuccess = await incrementSuperheroGeneration(telegramId)
      if (incrementSuccess) {
        logger.info(
          '[AvatarTransformScene] Generation count incremented successfully',
          {
            telegramId,
            step: 'generation_incremented',
          }
        )
      } else {
        logger.warn(
          '[AvatarTransformScene] Failed to increment generation count',
          {
            telegramId,
            step: 'generation_increment_failed',
          }
        )
      }

      // Release the per-user in-flight lock now that this generation's usage is
      // recorded; a later tap is re-checked against the incremented quota. On a
      // failure/early-exit path the lock is not deleted here but auto-expires
      // via SUPERHERO_INFLIGHT_TTL_MS, so a user is never permanently locked.
      superheroGenInFlight.delete(telegramId)

      // Также поддерживаем старую систему для совместимости
      await markAvatarTransformUsed(telegramId)
      logger.info('[AvatarTransformScene] Legacy usage marked for user', {
        telegramId,
      })

      // 🆕 ПОЛУЧАЕМ ОБНОВЛЕННЫЙ СТАТУС ПОСЛЕ ИНКРЕМЕНТА
      const updatedCheck = await checkSuperheroGenerationUsage(telegramId)

      // 🚀 ПОКАЗЫВАЕМ СООБЩЕНИЕ ОБ УСПЕШНОЙ ГЕНЕРАЦИИ
      const successMessage = getSuccessGenerationMessage(
        isRu,
        updatedCheck.hasUnlimitedAccess,
        updatedCheck.currentUsage,
        updatedCheck.maxUsage
      )

      await ctx.reply(
        `🎉 <b>${isRu ? 'Трансформация завершена!' : 'Transformation completed!'}</b>\n\n${successMessage}\n\n🎓 ${isRu ? 'Теперь посмотрите обучающее видео и узнайте больше о возможностях бота!' : "Now watch the educational video and learn more about the bot's features!"}`,
        {
          parse_mode: 'HTML',
          reply_markup: { remove_keyboard: true },
        }
      )

      // ВАЖНО: Полностью выходим из сцены, чтобы команда /start снова работала
      await ctx.scene.leave()

      // ПЕРЕХОДИМ К ГЛАВНОМУ МЕНЮ (не StartScene)
      await ctx.scene.leave()
      const { showMainMenu } = await import('@/navigation')
      await showMainMenu(ctx)

      logger.info(
        '[AvatarTransformScene] Successfully completed transformation and transitioned to StartScene',
        {
          telegramId,
          step: 'completed_transition_to_startscene',
        }
      )

      return // Завершаем выполнение
    } catch (error) {
      logger.error('[AvatarTransformScene] Generation error', {
        telegramId,
        error: String(error),
      })

      await ctx.reply(
        isRu
          ? '❌ <b>Ошибка генерации изображения</b>\n\nПопробуйте позже или обратитесь в поддержку'
          : '❌ <b>Image generation error</b>\n\nTry again later or contact support'
      )

      // 🛠️ ИСПРАВЛЕНИЕ: Полностью выходим из сцены перед переходом
      await ctx.scene.leave()
      await ctx.scene.leave()
      const { showMainMenu } = await import('@/navigation')
      await showMainMenu(ctx)
      return
    }
  },
  // Шаг 5: Обработка загруженной фотографии
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString() || 'unknown'

    if (!ctx.message || !('photo' in ctx.message)) {
      await ctx.reply(
        isRu
          ? '📸 Пожалуйста, отправьте фотографию\n\n💡 Или используйте /start чтобы начать заново'
          : '📸 Please send a photo\n\n💡 Or use /start to start over'
      )
      return
    }

    try {
      const photo = ctx.message.photo[ctx.message.photo.length - 1]
      const file = await ctx.telegram.getFile(photo.file_id)
      const photoUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${file.file_path}`

      // Сохраняем новое фото в сессии
      ctx.session.kontextImageUrl = photoUrl

      // Получаем пол из сессии
      const gender = ctx.session.selectedGender
      if (!gender) {
        await ctx.reply(
          isRu
            ? '❌ Ошибка: пол не выбран. Начните заново с /start'
            : '❌ Error: gender not selected. Start over with /start'
        )
        return
      }

      await ctx.reply(
        isRu
          ? '✅ *Фото получено!*\n\n🎨 Теперь выберите героя для трансформации'
          : '✅ *Photo received!*\n\n🎨 Now choose a hero for transformation'
      )

      // Показываем выбор героев сразу после загрузки фото (все 10 + кастомный)
      const primaryHeroes = AI_HEROES[gender]

      const createTwoButtonRows = (heroes: string[]): string[][] => {
        const rows = []
        for (let i = 0; i < heroes.length; i += 2) {
          if (i + 1 < heroes.length) {
            rows.push([heroes[i], heroes[i + 1]])
          } else {
            rows.push([heroes[i]])
          }
        }
        return rows
      }

      const heroButtonsList = primaryHeroes.map(hero =>
        getHeroButtonText(hero, isRu)
      )
      const heroButtons = [
        ...createTwoButtonRows(heroButtonsList),
        [
          isRu ? '🎲 Случайный стиль' : '🎲 Random style',
          isRu ? '🔙 Назад' : '🔙 Back',
        ],
      ]

      await ctx.reply(
        isRu
          ? `🤖 <b>Выберите героя для ${gender === 'male' ? 'мужской' : 'женской'} трансформации:</b>`
          : `🤖 <b>Choose a hero for ${gender === 'male' ? 'male' : 'female'} transformation:</b>`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            keyboard: heroButtons,
            resize_keyboard: true,
            one_time_keyboard: false,
          },
        }
      )

      // Переходим к шагу выбора героя (шаг 4, индекс 4)
      return ctx.wizard.selectStep(4)
    } catch (error) {
      logger.error(
        '[AvatarTransformScene] Error processing uploaded photo:',
        error
      )
      await ctx.reply(
        isRu
          ? '❌ *Ошибка обработки фото*\n\n🔄 Произошла ошибка при обработке фотографии\n💡 Попробуйте загрузить другое фото или используйте /start'
          : '❌ *Photo Processing Error*\n\n🔄 An error occurred while processing the photo\n💡 Try uploading another photo or use /start',
        { parse_mode: 'Markdown' }
      )
      // 🛠️ ИСПРАВЛЕНИЕ: Полностью выходим из сцены перед переходом
      await ctx.scene.leave()
      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.StartScene)
      return
    }
  },
  // Шаг 6: Обработка кастомного промпта
  async ctx => {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString() || 'unknown'

    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply(
        isRu
          ? '❌ Пожалуйста, отправьте текстовое сообщение с вашим промптом'
          : '❌ Please send a text message with your prompt'
      )
      return
    }

    const customPrompt = ctx.message.text.trim()

    // Обработка команд выхода из wizard
    if (customPrompt === '/menu' || customPrompt === '/cancel') {
      logger.info(
        '[AvatarTransformScene] User requested exit from custom prompt',
        {
          telegramId,
          command: customPrompt,
        }
      )
      await ctx.scene.leave()
      await ctx.scene.leave()
      const { showMainMenu } = await import('@/navigation')
      await showMainMenu(ctx)
      return
    }

    // Игнорируем другие команды - они будут обработаны command handler'ом
    if (customPrompt.startsWith('/')) {
      logger.info(
        '[AvatarTransformScene] Ignoring command in custom prompt step',
        {
          telegramId,
          command: customPrompt,
        }
      )
      return
    }

    // Валидация кастомного промпта
    if (customPrompt.length < 10) {
      await ctx.reply(
        isRu
          ? '❌ <b>Промпт слишком короткий</b>\n\n⚠️ Минимум 10 символов\n💡 Добавьте больше деталей о желаемом стиле'
          : '❌ <b>Prompt too short</b>\n\n⚠️ Minimum 10 characters\n💡 Add more details about desired style',
        { parse_mode: 'HTML' }
      )
      return
    }

    if (customPrompt.length > 500) {
      await ctx.reply(
        isRu
          ? '❌ <b>Промпт слишком длинный</b>\n\n⚠️ Максимум 500 символов\n💡 Сократите описание до основных деталей'
          : '❌ <b>Prompt too long</b>\n\n⚠️ Maximum 500 characters\n💡 Shorten description to key details',
        { parse_mode: 'HTML' }
      )
      return
    }

    // ✅ ИСПРАВЛЕНО: Восстанавливаем функционал кастомного промпта
    // Сохраняем кастомный промпт в сессии
    if (ctx.session) ctx.session.aiPhotoshopPrompt = customPrompt
    ctx.session.selectedHero = 'Кастомный промпт'

    const gender = ctx.session.selectedGender
    if (!gender) {
      logger.error('[AvatarTransformScene] No gender in session', {
        telegramId,
      })
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не выбран пол. Начните заново'
          : '❌ Error: gender not selected. Start over'
      )
      await ctx.scene.leave()
      await ctx.scene.leave()
      const { showMainMenu } = await import('@/navigation')
      await showMainMenu(ctx)
      return
    }

    // Подтверждение кастомного промпта
    await ctx.reply(
      isRu
        ? `✅ <b>Кастомный промпт принят!</b>\n\n📝 <b>Ваш промпт:</b>\n"${customPrompt}"\n\n🎬 <b>Запускаю AI трансформацию...</b>\n\n⏳ <b>Генерирую ваше превращение...</b>`
        : `✅ <b>Custom prompt accepted!</b>\n\n📝 <b>Your prompt:</b>\n"${customPrompt}"\n\n🎬 <b>Starting AI transformation...</b>\n\n⏳ <b>Generating your transformation...</b>`,
      { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
    )

    try {
      // Генерируем изображение с кастомным промптом
      const userPhotoUrl = ctx.session.kontextImageUrl
      if (!userPhotoUrl) {
        logger.error('[AvatarTransformScene] No user photo URL', { telegramId })
        await ctx.reply(
          isRu
            ? '❌ Ошибка: не найдено фото пользователя'
            : '❌ Error: user photo not found'
        )
        return
      }

      const selectedModel = ctx.session.selectedModel
      if (!selectedModel) {
        logger.error('[AvatarTransformScene] No selected model', { telegramId })
        await ctx.reply(
          isRu ? '❌ Ошибка: модель не выбрана' : '❌ Error: model not selected'
        )
        return
      }

      // Создаем промпт для кастомного стиля
      const baseSettings = `[Cinematic portrait photography. Medium shot. Aspect ratio 9:16. Professional studio lighting with dramatic effects]`
      const finalPrompt = `${baseSettings} A ${gender === 'male' ? 'man' : 'woman'} ${customPrompt}. High quality, professional lighting, detailed features, cinematic composition.`

      logger.info('[AvatarTransformScene] Custom prompt generation started', {
        telegramId,
        customPrompt,
        finalPrompt,
        selectedModel,
      })

      let generatedImageUrl: string | null = null

      // Выбираем сервис генерации в зависимости от модели
      if (selectedModel === 'seedream45') {
        const result = await generateSeeDream45({
          telegram_id: telegramId,
          prompt: finalPrompt,
          inputImageUrl: userPhotoUrl,
          username: ctx.from?.username || 'unknown',
          is_ru: isRu,
          ctx: ctx,
          aspect_ratio: '9:16',
        })
        generatedImageUrl =
          typeof result.image === 'string'
            ? result.image
            : result.image.toString()
      } else {
        const result = await generateFluxKontextMax({
          telegram_id: telegramId,
          prompt: finalPrompt,
          inputImageUrl: userPhotoUrl,
          username: ctx.from?.username || 'unknown',
          is_ru: isRu,
          ctx: ctx,
          // The prompt above (baseSettings) demands "Aspect ratio 9:16" while
          // the parameter asked for 16:9 -- two instructions arguing over one
          // picture, and the parameter won. The seedream45 branch next to it
          // always asked for '9:16': the frame depended on which model was
          // picked, not on the intent.
          aspect_ratio: '9:16',
        })
        generatedImageUrl =
          typeof result.image === 'string'
            ? result.image
            : result.image.toString()
      }

      if (generatedImageUrl) {
        // Отправляем результат
        await sendPhotoWithFallback(ctx, generatedImageUrl, {
          caption: isRu
            ? `🎨 <b>Ваш кастомный AI-образ готов!</b>\n\n✍️ <b>Промпт:</b> "${customPrompt}"\n\n🚀 <b>Понравилось?</b> Получите полный доступ к боту!\n💎 <b>Подписка открывает:</b>\n• Неограниченные трансформации\n• Все модели и стили\n• Приоритетная генерация\n\n💰 Нажмите /start для покупки подписки!`
            : `🎨 <b>Your custom AI image is ready!</b>\n\n✍️ <b>Prompt:</b> "${customPrompt}"\n\n🚀 <b>Like it?</b> Get full bot access!\n💎 <b>Subscription unlocks:</b>\n• Unlimited transformations\n• All models and styles\n• Priority generation\n\n💰 Press /start to purchase subscription!`,
          parse_mode: 'HTML',
          reply_markup: Markup.keyboard([
            [isRu ? '🔄 Еще трансформация' : '🔄 Another transformation'],
            [getMainMenuText(isRu)],
          ]).resize().reply_markup,
        })

        logger.info(
          '[AvatarTransformScene] Custom prompt transformation completed',
          {
            telegramId,
            customPrompt,
            generatedImageUrl,
          }
        )
      } else {
        throw new Error('Generation failed - no image URL returned')
      }
    } catch (error) {
      logger.error('[AvatarTransformScene] Custom prompt generation failed', {
        telegramId,
        error: error.message,
        customPrompt,
      })

      await ctx.reply(
        isRu
          ? '❌ <b>Ошибка генерации</b>\n\n🔄 Произошла ошибка при создании изображения\n💡 Попробуйте:\n• Упростить описание\n• Использовать другие слова\n• Попробовать позже\n\n🎯 Или выберите готовый стиль из меню'
          : '❌ <b>Generation Error</b>\n\n🔄 An error occurred while creating the image\n💡 Try to:\n• Simplify description\n• Use different words\n• Try again later\n\n🎯 Or choose a ready style from menu',
        {
          parse_mode: 'HTML',
          reply_markup: Markup.keyboard([
            [isRu ? '🎨 Выбрать готовый стиль' : '🎨 Choose ready style'],
            [getMainMenuText(isRu)],
          ]).resize().reply_markup,
        }
      )
    }

    // Выходим из сцены
    await ctx.scene.leave()
  }
)

export default avatarTransformScene
