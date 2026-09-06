/**
 * Витрина шаблонов для мини-аппа.
 *
 * `GET /compositions` отвечает на вопрос «что вообще есть в бандле»: id,
 * размеры, длительность. Человеку в мини-аппе этого мало — ему нужно знать,
 * ЧТО это за шаблон, как он выглядит и какие поля заполнять. Эта витрина и
 * есть недостающий слой.
 *
 * Правило, купленное болью (см. /compositions выше по файлу): рукописный
 * список расходится с кодом. Поэтому витрина НЕ является источником правды о
 * существовании шаблона — сервер пересекает её с реальным списком из бандла и
 * отдаёт только те записи, которые действительно можно отрендерить.
 */

export interface TemplateField {
  /** Путь в inputProps: `brand.name` — вложенное поле. */
  key: string
  label: string
  kind: 'text' | 'media' | 'captions' | 'number' | 'list'
  required?: boolean
  hint?: string
  /**
   * ФОРМА ЗНАЧЕНИЯ СЛОВАМИ — для полей, где подписи мало.
   *
   * `reel_render` принимает `props` свободным объектом, а каталог называл
   * только ярлык поля. Модель, собирающая сплит, придумывала правдоподобную
   * форму — и придумала: в ленте лежит ролик с `segments: [{url, duration}]`
   * вместо `{type, startFrame, durationFrames}`. Отказ на входе теперь есть,
   * но отказ — половина ответа; вторая половина в том, чтобы форму не надо
   * было угадывать.
   */
  shape?: string
  /** Готовый пример значения. Пример короче любого описания. */
  example?: string
}

export interface TemplateCard {
  /** Должен совпадать с id композиции в src/Root.tsx. */
  id: string
  title: string
  tagline: string
  /** Полное описание канона — что можно и чего нельзя. */
  about: string
  /** Обложка-превью (публичный URL). */
  poster?: string
  /** Готовый пример рендера — чтобы человек увидел результат до траты денег. */
  sample?: string
  accent: string
  /** Поля, которые заполняет человек. Остальное берётся из defaultProps. */
  fields: TemplateField[]
  /** Чек-лист канона: показывается рядом с формой, чтобы не ломали стиль. */
  rules: string[]
}

const STORAGE =
  'https://yuukfqcsdhkyxegfwlcb.supabase.co/storage/v1/object/public/images/relaunch'

export const TEMPLATE_CARDS: TemplateCard[] = [
  {
    id: 'NoirReel',
    title: 'Нуар',
    tagline: 'Чёрно-белый смокинг, одно золотое пятно',
    about:
      'Строгий монохром: смокинг-тройка, бабочка, чёрные вайфареры. Единственный цвет в кадре — золотой значок на лацкане. Титры по одному слову, финальная карточка в дизайне главной t27.ai. Открывается крупным планом лица.',
    poster: `${STORAGE}/noir-close.jpg`,
    sample: `${STORAGE}/sample-noir.mp4`,
    accent: '#FFD700',
    fields: [
      {
        key: 'lipSyncVideo',
        label: 'Дорожка с говорящим лицом',
        kind: 'media',
        required: true,
        hint: 'Смонтированные планы липсинка, все на одном аудио',
      },
      { key: 'captions', label: 'Титры пословно', kind: 'captions' },
      { key: 'music', label: 'Музыка', kind: 'media', hint: 'Chill Memphis Phonk' },
      { key: 'brand.eyebrow', label: 'Надстрочник', kind: 'text' },
      { key: 'brand.name', label: 'Имя (золотом)', kind: 'text', required: true },
      { key: 'brand.cta', label: 'Кнопка-адрес', kind: 'text', required: true },
      { key: 'brand.sub', label: 'Подпись под кнопкой', kind: 'text' },
    ],
    rules: [
      'Футаж строго ч/б. Неон, цветные худи и наушники ломают канон.',
      'Золото — только имя и адрес. Третьего акцента нет.',
      'Начинать крупным планом лица.',
      'Резать планы по границам фраз, а не по метроному.',
    ],
  },
  {
    id: 'SplitTalkingHead',
    title: 'Сплит',
    tagline: 'Биролл сверху, говорящая голова снизу',
    about:
      'Ритм коротких видео: экран делится пополам, сверху идёт перебивка, снизу автор. Жёлтые титры по одному слову на линии стыка, жёсткие склейки без переходов.',
    poster: `${STORAGE}/hero-canon.jpg`,
    accent: '#FFFF00',
    fields: [
      { key: 'lipSyncVideo', label: 'Липсинк', kind: 'media', required: true },
      {
        key: 'segments',
        label: 'Сегменты и биролл',
        kind: 'list',
        required: true,
        /**
         * ФОРМА НАЗВАНА, потому что до сих пор её знал только код.
         *
         * Инструмент `reel_render` принимает `props` как свободный объект, а
         * каталог называл поле «Сегменты и биролл» — подпись, а не форма.
         * Модель, которую просят собрать сплит, придумывает правдоподобное:
         * в ленте лежит ролик (id 20) с `segments: [{url, duration}]`, и это
         * ровно то, что придумал бы человек на её месте.
         *
         * Дальше молчали все: Remotion схему сам не сверял, сервер props не
         * проверял, а композиция без `type` просто не считала панели — и
         * тридцать секунд липсинка заняли весь кадр. Ролик опубликовался и
         * лежал в ленте под именем «Сплит».
         *
         * Проверка теперь есть (render-server сверяет со схемой до рендера),
         * но отказ — это половина ответа. Вторая половина здесь: сказать
         * форму заранее, чтобы её не пришлось угадывать.
         */
        shape:
          '{ type: "split" | "fullscreen", startFrame: число, ' +
          'durationFrames: число, bRollUrl?: ссылка, caption?: строка }',
        example:
          '[{ "type": "fullscreen", "startFrame": 0, "durationFrames": 60 }, ' +
          '{ "type": "split", "startFrame": 60, "durationFrames": 120, ' +
          '"bRollUrl": "https://…/b.mp4" }]',
      },
      { key: 'captions', label: 'Титры пословно', kind: 'captions' },
      { key: 'backgroundMusic', label: 'Музыка', kind: 'media' },
      { key: 'ctaText', label: 'Призыв', kind: 'text' },
    ],
    rules: [
      'Ритм: полный экран 60 кадров, дальше пары сплит 120 + полный 45.',
      'Биролл должен быть 30 fps — при 24 первый кадр склейки чёрный.',
      'Титры по одному слову, иначе строка не читается на скорости.',
    ],
  },
  {
    id: 'TrinityBlogReel',
    title: 'Гравюра',
    tagline: 'Витрина измерений: барочная антиква, золото только заголовок',
    about:
      'Научная витрина блога. Матовый чёрный фон с зерном, кремово-серебряная гравюра, золотом — исключительно заголовок поста. Пять актов: шапка, заголовок, таблички с измеренными числами, вывод, колофон.',
    accent: '#C9A24B',
    fields: [
      { key: 'title', label: 'Заголовок (золотом)', kind: 'text', required: true },
      { key: 'subtitle', label: 'Подзаголовок', kind: 'text' },
      { key: 'dateline', label: 'Дата и время чтения', kind: 'text' },
      { key: 'plates', label: 'Таблички с числами', kind: 'list' },
      { key: 'lesson', label: 'Вывод', kind: 'text', required: true },
      { key: 'captions', label: 'Титры пословно', kind: 'captions' },
    ],
    rules: [
      'В таблички идут ТОЛЬКО измеренные числа. Выдуманное число обесценивает пост.',
      'Золото достаётся заголовку и никому больше.',
      'Фонк сюда не ставить — он принадлежит промо-контуру.',
    ],
  },
]

export const cardById = (id: string): TemplateCard | undefined =>
  TEMPLATE_CARDS.find(t => t.id === id)
