// ETIMEDOUT AggregateError на fetch к api.replicate.com (витки №121/173):
// undici первым пробует IPv6, в этой сети он чёрной дырой — таймаут.
// IPv4-first лечит; curl работал, потому что резолвил иначе.
import { KIE_MODELS } from './src/agent/kie-models'
import { РАЗРЕШЕНИЕ_ЛИПСИНКА, поляМоделей } from './src/agent/kie-web-provider'
// Голоса и вход того провайдера, который реально отдаёт mp3. См. модуль:
// экран показывал чужие голоса, а выбор до провайдера не доходил.
import {
  ГОЛОСА_MINIMAX,
  входМиниМакс,
  имяДляElevenLabs,
  скоростьРечи,
} from './src/agent/minimax-voices'
import * as dns from 'node:dns'
import {
  запустить as startKieJob, // cyrillic-ok
  состояниеЗадания as getKieJobState, // cyrillic-ok
} from './src/agent/kie-run'
import {
  reviewedKieModel,
  РАЗРЕШЕНИЕ_ВИДЕО,
  kieInputFor,
} from './src/agent/kie-web-provider'
import {
  downloadBoundedMediaToFile,
  isPublicInternetAddress,
  resolvePublicAddress,
} from './src/lib/remoteMediaDuration'
import { handleAuthRouteSafely } from './session-routes'
import { ensureAuthTables, pollRevocations } from './session-store'
import {
  readRenderQuota,
  reserveRenderQuota,
  refundRenderQuota,
} from './render-quota'
import {
  startJob,
  recordInto,
  attachStore,
  getJobDurable,
  listJobsDurable,
} from './generate-jobs'
import { handleProjectRoute } from './project-routes'
;(dns as any).setDefaultResultOrder?.('ipv4first')

import { createServer, IncomingMessage } from 'node:http'
import { isIP } from 'node:net'
import { pipeline } from 'node:stream/promises'
import {
  handleMcp,
  handleMcpCard,
  handleAgentChat,
  handleAgentHistory,
  handleAgentKeys,
  chatIdentity,
  resolveIdentity,
  readBody,
} from './src/agent/routes'
// A2A: the open protocol for external agents. Imported here because this file
// is the only place that mounts routes, and until now nothing imported it at
// all -- see the block comment at the mount site.
import { handleA2A, handleA2ACard } from './src/agent/a2a'
import { loadVisiblePrivateProfileCounts } from './src/profile/privateCounts'
import os from 'node:os'
import { WebSocketServer, WebSocket } from 'ws'
import { bundle } from '@remotion/bundler'
import {
  renderMedia,
  selectComposition,
  renderStill,
  getCompositions,
} from '@remotion/renderer'
import path from 'node:path'
import {
  authenticate,
  authMode,
  verifyTelegramInitData,
  verifiedTelegramId,
} from './auth'
import { z } from 'zod'
import { TEMPLATE_CARDS } from './src/templates/registry'
import { SplitTalkingHeadSchema } from './src/compositions/SplitTalkingHead'

/**
 * Композиции, чью заявку сверяем со схемой перед рендером.
 *
 * Список, а не «сверять всё»: у части композиций схемы нет вовсе, и
 * отсутствие проверки должно быть ВИДНО здесь, а не выясняться по тому, что
 * ролик вышел не тем. Появилась схема — появилась строка.
 */
const ПРОВЕРЯЕМЫЕ_КОМПОЗИЦИИ: Record<string, z.ZodType> = {
  SplitTalkingHead: SplitTalkingHeadSchema,
}

import {
  credits as kieCredits,
  generateImage as kieGenerateImage,
  T2I_MODEL as KIE_T2I_MODEL,
} from './src/kie-image'
import { runImageChain } from './src/image-chain'
import fs from 'node:fs'
import { randomUUID, createHmac, createHash } from 'node:crypto'
import { execSync, execFileSync, spawn } from 'node:child_process'

/**
 * Валидация URL для серверного fetch. Правило: только http/https; для
 * адресов, пришедших ОТ КЛИЕНТА (webhook), приватные/зацикленные хосты
 * запрещены — иначе любой запрос превращается в зонд внутренней сети
 * (SSRF). Для адресов из ENV оператора (сервис-в-сервис, напр. MCP_URL)
 * приватные допустимы: внутренние контейнеры — легальная топология.
 */
function assertFetchable(
  url: string,
  opts: { allowPrivate?: boolean } = {}
): URL {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    throw new Error(`некорректный URL: ${String(url).slice(0, 60)}`)
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new Error(`только http/https, получено ${u.protocol}`)
  }
  if (!opts.allowPrivate) {
    const h = u.hostname.toLowerCase()
    const literal = h.startsWith('[') && h.endsWith(']') ? h.slice(1, -1) : h
    const priv =
      h === 'localhost' ||
      h.endsWith('.localhost') ||
      (isIP(literal) !== 0 && !isPublicInternetAddress(literal))
    if (priv) {
      throw new Error('приватные и зацикленные адреса запрещены')
    }
  }
  return u
}

async function runExplicitKieJob(
  model: string,
  input: Record<string, unknown>,
  options: { attempts?: number; intervalMs?: number } = {}
): Promise<{ url: string; taskId: string }> {
  const started = await startKieJob(model, input)
  if (!started.taskId) {
    throw new Error(started['отказ'] || 'Kie.ai не принял задачу')
  }

  const attempts = options.attempts ?? 100
  const intervalMs = options.intervalMs ?? 3_000
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, intervalMs))
    const state = await getKieJobState(started.taskId)
    if (state.url) return { url: state.url, taskId: started.taskId }
    if (state['отказ']) throw new Error(state['отказ'])
  }

  throw new Error(
    `Kie.ai ещё выполняет задачу ${started.taskId}; повторная генерация может списать кредиты снова`
  )
}

/**
 * Аргумент для ffmpeg/ffprobe, пришедший из данных (путь, число, имя):
 * не может начинаться с дефиса — иначе «значение» станет опцией
 * (option injection). Литералы в массивах аргументов не оборачиваем.
 */
function ffArg(v: string | number): string {
  const s = String(v)
  /**
   * Белый список символов + запрет ведущего дефиса: значение физически
   * не может сформировать опцию ffmpeg (--flag / -f) или shell-метасимвол.
   *
   * ДЕФИС РАЗРЕШЁН ВНУТРИ, ЗАПРЕЩЁН В НАЧАЛЕ. Раньше его не было в списке
   * вовсе — и это убивало липсинк ЦЕЛИКОМ, всегда. Проба медиа создаёт
   * каталог через `mkdtempSync(path.join(os.tmpdir(), 'vibee-media-probe-'))`,
   * то есть дефис в пути есть ПО ПОСТРОЕНИЮ, а не по стечению обстоятельств.
   * Отказ выглядел как придирка к чужой ссылке — «аргумент не прошёл белый
   * список: /tmp/vibee-media-probe-o106Kt/audio.bin», — хотя ссылка была
   * наша собственная и безупречная.
   *
   * Защита при этом не ослабла: опцией ffmpeg аргумент делает ИМЕННО
   * ведущий дефис, и он по-прежнему отклоняется. Дефис в середине пути —
   * обычный символ имени файла.
   */
  if (
    s.startsWith('-') ||
    !/^[A-Za-z0-9_.\/:%+= ][A-Za-z0-9_.\/:%+= -]*$/.test(s)
  ) {
    throw new Error(`аргумент не прошёл белый список: ${s.slice(0, 40)}`)
  }
  return s
}

/**
 * Соединить root + имя файла с гарантией, что результат остаётся ВНУТРИ
 * root: имя — только безопасные символы без ведущей точки/дефиса, итог
 * обязан начинаться на resolve(root)+sep. Единственная точка сборки
 * путей для файлов из внешних источников (S3-ключи и т.п.).
 */
function safeJoin(rootDir: string, filename: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(filename)) {
    throw new Error(`недопустимое имя файла: ${filename.slice(0, 40)}`)
  }
  const resolved = path.resolve(rootDir, filename)
  const root = path.resolve(rootDir)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('путь вышел за пределы рабочей папки')
  }
  return resolved
}

/**
 * Запуск ffmpeg/ffprobe. Граница функции: массив аргументов собирается
 * вызывающим из проверенных ffArg-значений; здесь только имя бинарника
 * и режимы. stdio pipe — ffmpeg не пишет в наш терминал.
 */
function runFfmpeg(args: string[], timeoutMs = 300000): void {
  execFileSync('ffmpeg', args, { stdio: 'pipe', timeout: timeoutMs })
}

function runFfprobeText(args: string[], timeoutMs = 30000): string {
  return execFileSync('ffprobe', args, {
    encoding: 'utf-8',
    timeout: timeoutMs,
  })
}

/**
 * Ответ JSON единым местом: тип всегда application/json; сериализация
 * только здесь. nosniff запрещает браузеру угадывать тип ответа —
 * даже если в данных окажется разметка, она не будет исполнена как HTML.
 */
/**
 * Лишние сегменты пути — это 404, а НЕ родительский ресурс.
 *
 * ПОЧЕМУ ЭТО ОТДЕЛЬНАЯ ФУНКЦИЯ. Маршруты здесь сопоставляются через
 * `startsWith`, и такой матчер ловит не только свой путь, но и всё, что
 * начинается с него. Один раз это уже стоило дорого: `/api/users/:username/
 * templates` не существовал, запрос попадал в обработчик профиля и получал
 * КАРТОЧКУ ПРОФИЛЯ с кодом 200. Клиент читал `data.templates`, видел
 * undefined и показывал «Пока нет видео» — профиль ни у кого не показывал
 * работы, и ни логи, ни консоль об этом не сообщали.
 *
 * Замер 2026-08-26 показал ещё три таких пути: `/api/feed/чепуха` отдавал
 * всю ленту, `/api/users/id/:id/чепуха` — пользователя из одних null,
 * `/api/users/:username/чепуха` — профиль. Каждый из них — заготовленная
 * ловушка для следующего подпути, который кто-нибудь добавит.
 *
 * Возвращает true и САМ отвечает 404, если сегментов больше ожидаемого.
 */
/**
 * Ключ ElevenLabs — с проверкой формы, а не только наличия.
 *
 * ЧТО СЛУЧИЛОСЬ. В переменной лежал ИДЕНТИФИКАТОР ключа вместо самого ключа.
 * ElevenLabs отвечал на это 400 с внятным текстом:
 *
 *   "API key ID used as API key - only valid API keys can be used.
 *    API keys start with 'sk_' and are shown when the key is created."
 *
 * А наружу уходило «ElevenLabs API error: 400» — тело ответа выбрасывалось.
 * По такому сообщению нельзя понять ни причину, ни что делать; список
 * голосов и озвучка (платная, 6 токенов) просто не работали, и почему —
 * снаружи было не видно.
 *
 * Проверка формы стоит одну строку и отвечает ДО сетевого запроса: ключ,
 * не начинающийся с `sk_`, не заработает никогда.
 */
/** Ответ /api/providers живёт минуту: за ним пять чужих сервисов. */
let providersCache: { at: number; data: Record<string, unknown> } | null = null

function elevenLabsKey(): string {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) {
    throw new Error(
      'ELEVENLABS_API_KEY не задан. Ключ создаётся в кабинете ElevenLabs ' +
        '(Profile → API Keys) и начинается с «sk_».'
    )
  }
  if (!key.startsWith('sk_')) {
    throw new Error(
      'ELEVENLABS_API_KEY хранит НЕ КЛЮЧ, а его идентификатор: настоящий ключ ' +
        `начинается с «sk_», а этот — с «${key.slice(0, 3)}». ElevenLabs на такой ` +
        'отвечает 400 (invalid_api_key). Ключ показывается один раз при создании ' +
        'или ротации в кабинете ElevenLabs — его и нужно положить в переменную.'
    )
  }
  return key
}

function rejectExtraSegments(
  req: IncomingMessage,
  // Тот же тип, что у sendJson рядом: пространство имён http сюда не
  // импортировано, только IncomingMessage из 'node:http'.
  res: any,
  expected: number
): boolean {
  const pathname = (req.url || '').split('?')[0]
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length <= expected) return false
  sendJson(res, 404, {
    error: 'Not found',
    detail:
      `Путь «${pathname}» длиннее, чем умеет этот маршрут. ` +
      'Лишние сегменты не игнорируются: иначе ответ 200 приходил бы не на тот запрос.',
  })
  return true
}

function sendJson(res: any, code: number, obj: unknown): void {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(JSON.stringify(obj))
}

/**
 * The verified viewer id for feed personalization (is_liked / is_starred).
 * Reading user_id from the query string let any caller pass ?user_id=<victim>
 * and learn which posts that victim liked or starred — an unauthenticated
 * cross-user disclosure, since /api/feed is on the public GET list. The id must
 * come from the signed Telegram initData instead; an anonymous or unverified
 * caller gets null, so the LEFT JOINs match nothing and every row reads as
 * not-liked.
 */
function verifiedViewerId(req: IncomingMessage): string | null {
  return chatIdentity(req, verifiedTelegramId(req))
}

/**
 * Stable owner for recoverable generation jobs.
 *
 * A native/web user is identified by the same verified session or Telegram
 * signature used by billing. Internal tools arrive with X-Api-Key after the
 * global auth gate has already validated it; they still need a non-empty,
 * non-secret namespace so one service caller cannot list another caller's
 * jobs. Only a SHA-256 digest is retained in memory/storage.
 */
function generationOwnerId(req: IncomingMessage): string | null {
  const viewer = verifiedViewerId(req)
  if (viewer) return viewer
  const rawInternalKey = req.headers['x-api-key']
  const internalKey = Array.isArray(rawInternalKey)
    ? rawInternalKey[0]
    : rawInternalKey
  if (!internalKey?.trim()) return null
  return `service:${createHash('sha256').update(internalKey).digest('hex')}`
}

/**
 * Прокси-картинки: скачать изображение Telegram. assertFetchable отсекает
 * не-http(s) и приватные адреса; белый список оставляет только хосты
 * Telegram. Не-изображение — ошибка: прокси не является транслятором
 * произвольного контента.
 */
async function fetchTelegramImage(url: string): Promise<{
  status: number
  contentType: string
  data: Buffer
}> {
  const target = assertFetchable(url)
  const host = target.hostname.toLowerCase()
  const telegramOnly =
    host === 't.me' ||
    host.endsWith('.t.me') ||
    host === 'telegram.org' ||
    host.endsWith('.telegram.org')
  if (!telegramOnly) {
    throw new Error('прокси принимает только адреса Telegram')
  }
  const r = await fetch(target)
  const contentType = r.headers.get('content-type') || ''
  if (!contentType.startsWith('image/')) {
    throw new Error('по адресу не изображение')
  }
  return {
    status: r.status,
    contentType,
    data: Buffer.from(await r.arrayBuffer()),
  }
}
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import {
  boundedUploadTransform,
  UploadConcurrencyGate,
  UploadTooLargeError,
} from './src/lib/boundedUpload'
import {
  captionsFromCharacterAlignment,
  type CharacterAlignment,
  type TimedCaption,
} from './src/lib/timedCaptions'
/**
 * РАСПОЗНАВАНИЕ ЛИЦА ГРУЗИТСЯ ЛЕНИВО, и это не оптимизация.
 *
 * Здесь стоял обычный импорт, и он тянул `@vladmandic/face-api`, а тот —
 * `@tensorflow/tfjs-node`, которого в зависимостях нет. Сервер не поднимался
 * ВООБЩЕ: продакшн стоял больше часа, каждая сборка падала на старте, и всё
 * влитое за это время не существовало для людей.
 *
 * Настоящий дефект — не пропавший модуль, а то, что ОДНА функция оказалась
 * условием запуска всего сервиса. Лента, чат агента, оплата и рендер к
 * распознаванию лица отношения не имеют и обязаны работать без него.
 *
 * Ленивый импорт делает отказ ЛОКАЛЬНЫМ: не работает распознавание — падает
 * только оно, и говорит почему. Остальное живёт.
 */
type FaceApi = typeof import('./src/lib/faceDetection')
let faceApiPromise: Promise<FaceApi> | null = null
let faceApiReady: FaceApi | null = null

/**
 * Модуль грузится ОДИН раз и переиспользуется: `import()` кэшируется, но
 * промис держим сами, чтобы два одновременных запроса не начали загрузку
 * дважды и не удвоили ожидание на холодном старте.
 */
/**
 * ОТСУТСТВИЕ МОДУЛЯ — СОСТОЯНИЕ СЕРВИСА, А НЕ СОБЫТИЕ КАДРА.
 *
 * Ленивый импорт (eb4e1a0) убрал верный дефект: одна необязательная функция
 * была условием запуска всего сервиса, и падал он целиком. Но отказ при этом
 * переехал со старта на КАЖДЫЙ вызов и стал молчаливым — issue #960.
 *
 * Разница, которую здесь и вводим:
 *
 *   модуля нет в образе  → отказывает каждый вызов одинаково. Это состояние,
 *                          и объявлять его надо ОДИН РАЗ и громко, а не
 *                          ловить заново на каждом ролике.
 *   лицо не найдено      → нормальный исход для конкретного кадра, ему
 *                          и место в тихом умолчании.
 *
 * До этой правки оба схлопывались в один catch, и различить их по логу было
 * нельзя. Флаг ниже читает ответ рендера, чтобы человек, получивший ролик без
 * кадрирования, узнал об этом от нас, а не по виду результата.
 */
let faceApiНедоступен: string | null = null

/** Почему кадрирование по лицу недоступно, или null если доступно. */
export function faceCroppingUnavailable(): string | null {
  return faceApiНедоступен
}

function faceApi(): Promise<FaceApi> {
  faceApiPromise ??= import('./src/lib/faceDetection')
    .catch((e: unknown) => {
      // Один раз на процесс: повторять на каждый ролик значит утопить лог и
      // всё равно не сказать ничего нового.
      if (!faceApiНедоступен) {
        faceApiНедоступен = String(e).slice(0, 200)
        console.error(
          '❌ [face] Кадрирование по лицу НЕДОСТУПНО во всём процессе: ' +
            faceApiНедоступен +
            '\n   Каждый рендер пойдёт без кадрирования. Это состояние сервиса,' +
            ' а не сбой конкретного ролика.'
        )
      }
      throw e
    })
    .then(m => {
      faceApiReady = m
      return m
    })
  return faceApiPromise
}

const detectFaceInVideo: FaceApi['detectFaceInVideo'] = async (...a) =>
  (await faceApi()).detectFaceInVideo(...a)
const detectFaceInImage: FaceApi['detectFaceInImage'] = async (...a) =>
  (await faceApi()).detectFaceInImage(...a)
/**
 * Загруженный модуль, когда он уже есть.
 *
 * `calculateCropSettings` синхронна и чиста — она считает по найденной рамке.
 * Делать её async значило бы менять все места вызова ради ничего.
 *
 * Первая версия лезла в `promise.value` — поля, которого у Promise нет: она
 * бросала бы ВСЕГДА. Держим ссылку явно, заполняя её в момент загрузки.
 */
const calculateCropSettings: FaceApi['calculateCropSettings'] = (...a) => {
  if (!faceApiReady) {
    // Сюда попадают только после detectFace, который модуль и грузит. Если
    // всё же попали — говорим прямо, а не считаем по пустому месту.
    throw new Error(
      'calculateCropSettings вызван до detectFaceIn* — модуль не загружен'
    )
  }
  return faceApiReady.calculateCropSettings(...a)
}
import { Pool } from 'pg'
import { creditStarsPayment } from './src/stars-credit'
import {
  ENV_NAMES,
  MARK_POSTED,
  readChannelConfig,
} from './src/channel-delivery'
import {
  spendByTid,
  refundByTid,
  TOKEN_PRICES,
  модельныеЦены,
  посекунднаяМодель,
  длинуЗадаётЧеловек,
  длинуЗадаётФайл,
  посекундныеМодели,
  посекундныеПоФайлу,
  познаковаяМодель,
  познаковыеМодели,
  тысячиЗнаковКОплате,
  секундыКОплате,
  PER_SECOND_OPS,
  владелец,
} from './src/agent/billing-shared'
import { lipSyncVideoOf, templateDurationInFrames } from './src/render-duration'
/**
 * Адреса сервисов. Inlined, чтобы не тянуть workspace-зависимость в Docker.
 *
 * ВСЕ ЧЕТЫРЕ значения указывали на fly.dev — площадку, с которой проект ушёл
 * на Railway. Проверено 24.08.2026 запросом, а не чтением:
 *
 *   vibee-telegram-bridge.fly.dev   NXDOMAIN — хоста НЕ СУЩЕСТВУЕТ
 *   vibee-player.fly.dev            NXDOMAIN — хоста НЕ СУЩЕСТВУЕТ
 *   vibee-render-server.fly.dev     DNS есть, но это тоже мёртвая площадка
 *
 * В этом же файле уже стояли комментарии «fly.dev мёртв давно» — то есть про
 * это знали и чинили точечно (см. проксирование ниже), а сами константы
 * остались. Так и живёт: одно место починено, источник — нет.
 *
 * Что заменено на живое (Railway, проверено HTTP 200):
 *   remotion / mcp — этот же сервис; свой адрес берём из переменной, а не
 *     угадываем: сервис может стоять за своим доменом.
 *   player — адрес мини-аппа, он попадает В ТЕКСТ ПОСТА как ссылка «смотреть
 *     ленту». То есть мёртвый player давал мёртвую ссылку читателю.
 *
 * bridge заменить НЕ НА ЧТО: хоста нет, и в Railway сервиса-моста тоже нет.
 * Оставлен как есть и помечен — см. обработчик post_to_telegram, где отказ
 * больше не молчит.
 */
/**
 * Собственный домен проекта — то, что видит человек в подписи поста.
 *
 * Отдельно от SERVICE_ENDPOINTS.player НАМЕРЕННО: player — это служебный адрес
 * мини-аппа, по которому ходит код (сейчас домен Railway). А в тексте поста
 * должен стоять адрес бренда, а не адрес инфраструктуры.
 *
 * Замер 24.08.2026: t27.ai отвечает 200, но отдаёт научный сайт TRINITY
 * (GitHub Pages), а НЕ ленту рилсов — поэтому `/feed` там даёт 404, и путь к
 * ленте сюда не дописывается.
 *
 * Решено вести ленту на app.t27.ai. Домен ЕЩЁ НЕ СУЩЕСТВУЕТ (NXDOMAIN), и
 * поставить его умолчанием значило бы положить в каждый пост мёртвую ссылку —
 * ровно то, что чинилось в PR #666. Поэтому умолчание остаётся живым t27.ai,
 * а переключение — одна переменная CANONICAL_SITE=app.t27.ai, когда DNS
 * настроен и домен отвечает.
 */
const CANONICAL_SITE = process.env.CANONICAL_SITE || 't27.ai'

const SERVICE_ENDPOINTS = {
  remotion:
    process.env.PUBLIC_URL || 'https://vibee-render-production.up.railway.app',
  mcp:
    process.env.PUBLIC_URL || 'https://vibee-render-production.up.railway.app',
  // dead-domain-ok: замены нет, отказ теперь виден в ответе публикации
  bridge:
    process.env.TELEGRAM_BRIDGE_URL || 'https://vibee-telegram-bridge.fly.dev',
  /**
   * Собственный домен, а не служебный адрес Railway: этот URL уходит ЛЮДЯМ —
   * в подпись поста в канале. Замер 2026-08-26: app.t27.ai отдаёт 200 и тот
   * же бандл (index-D06s1d0l.js), что и адрес Railway, а /feed на нём тоже
   * 200. Раньше домена не существовало, поэтому в постах стоял служебный
   * адрес — технически живой и нечитаемый для человека.
   */
  player: process.env.PLAYER_URL || 'https://app.t27.ai',
} as const

/**
 * Публикация готового ролика в Telegram-канал — НАПРЯМУЮ через Bot API.
 *
 * Почему не через «мост». Раньше здесь стоял запрос к
 * vibee-telegram-bridge.fly.dev — отдельному сервису, которого НЕ СУЩЕСТВУЕТ
 * (NXDOMAIN, проверено запросом). Ни один ролик за всё время в канал не ушёл,
 * а публикация при этом отвечала успехом.
 *
 * Поднимать мост заново не нужно: у этого сервиса УЖЕ есть токены ботов
 * (BOT_TOKEN_1..12 в переменных Railway), а Telegram принимает ссылку на видео
 * прямо в sendVideo — скачивать и перезаливать не требуется. Лишний сервис в
 * цепочке — это ещё одно место, которое может тихо умереть, как и умерло.
 *
 * НАЗНАЧЕНИЕ КАНАЛА — РЕШЕНИЕ ВЛАДЕЛЬЦА, не догадка кода. Пока переменные не
 * заданы, функция ничего не отправляет и честно говорит об этом. Выбрать
 * канал «по умолчанию» значило бы начать публиковать от чужого имени в чужое
 * место — это делается по явному указанию, а не по инициативе.
 *
 *   TELEGRAM_CHANNEL_ID         @имя_канала или -100…
 *   TELEGRAM_CHANNEL_BOT_TOKEN  токен бота, от имени которого постим
 */
async function postReelToChannel(input: {
  videoUrl?: string
  caption: string
}): Promise<{ posted: boolean; error?: string }> {
  const chatId = process.env.TELEGRAM_CHANNEL_ID
  const token = process.env.TELEGRAM_CHANNEL_BOT_TOKEN

  if (!chatId || !token) {
    const missing = [
      !chatId && 'TELEGRAM_CHANNEL_ID',
      !token && 'TELEGRAM_CHANNEL_BOT_TOKEN',
    ]
      .filter(Boolean)
      .join(' и ')
    // Не ошибка сервиса, а незаданная настройка — и говорим именно так,
    // чтобы читающий понял, что чинить, а не пошёл искать поломку.
    return { posted: false, error: `канал не настроен: не задано ${missing}` }
  }
  if (!input.videoUrl) {
    return {
      posted: false,
      error: 'нечего публиковать: у ролика нет video_url',
    }
  }

  // Telegram режет подпись на 1024 символах и отвечает отказом, если длиннее.
  const caption = input.caption.slice(0, 1024)

  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        video: input.videoUrl,
        caption,
        supports_streaming: true,
      }),
    })
    const body = (await r.json().catch(() => ({}))) as {
      ok?: boolean
      description?: string
    }
    // SUCCESS SPEAKS TOO. A delivered reel used to leave no trace anywhere --
    // not in the logs, not in the database -- so "delivered", "refused" and
    // "never attempted" looked identical, and the proof that the channel worked
    // was the ABSENCE of an error line. That monitor cannot tell a live channel
    // from one nobody is writing to.
    if (r.ok && body.ok) {
      console.log(`[Feed] Опубликовано в канал ${chatId}`)
      return { posted: true }
    }
    // description от Telegram информативен («chat not found», «bot was blocked»)
    // — отдаём его как есть, он полезнее нашего пересказа.
    const why = body.description || `HTTP ${r.status}`
    console.error(`[Feed] Публикация в канал ${chatId} НЕ состоялась: ${why}`)
    return { posted: false, error: `Telegram отказал: ${why}` }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e)
    console.error(
      `[Feed] Публикация в канал ${chatId} НЕ состоялась: ${reason}`
    )
    return { posted: false, error: `Telegram недоступен: ${reason}` }
  }
}

/**
 * THE DELIVERY MARK -- ONE LEDGER FOR BOTH PATHS.
 *
 * NOTHING has ever written template_settings.tg_posted_at: the live path above
 * returned {posted:true} and left no trace, and the only code that stamped the
 * mark sat in a script with no caller. Measured against production on
 * 2026-08-31: 37 of the owner's 37 feed rows carry no mark, including the ones
 * already visible in the channel. Until the mark exists, any drain of the queue
 * starts from the beginning and repeats everything subscribers have seen.
 *
 * Written where the outcome is known, and a failure to write it does NOT fail
 * the publication: the feed row is useful on its own. A failed stamp is loud in
 * the log, because its cost is a possible repeat post rather than silence.
 */
async function markDeliveredToChannel(id: number): Promise<void> {
  try {
    await getPool().query(MARK_POSTED, [id])
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    console.error(
      `[Feed] метка доставки НЕ записана (id ${id}): ${why} — рилс может уйти в канал повторно`
    )
  }
}

// Get video duration using ffprobe
function getVideoDuration(videoPath: string): number {
  try {
    // execFileSync без шелла: путь с пробелом/кавычкой — аргумент, а не код
    const result = execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        ffArg(videoPath),
      ],
      { encoding: 'utf-8' }
    ).trim()
    return parseFloat(result)
  } catch (error) {
    console.warn(`⚠️ Could not get video duration for ${videoPath}:`, error)
    return 0
  }
}

const MAX_LIPSYNC_SECONDS = 10

/**
 * Потолок длины для моделей, которым присылают готовый РОЛИК (сегодня один
 * `topaz/video-upscale`).
 *
 * Смысл тот же, что у липсинка: провайдер берёт за каждую секунду, и без
 * предела один длинный файл стоит нам сколько угодно. Шестьдесят секунд —
 * длина рилса, ради которого всё это и делается; за ней начинается работа,
 * о цене которой надо договариваться отдельно, а не узнавать по счёту.
 */
const MAX_UPSCALE_SECONDS = 60

async function measuredRemoteDuration(rawUrl: string): Promise<number> {
  const safeUrl = assertFetchable(rawUrl)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibee-media-probe-'))
  const file = path.join(dir, 'audio.bin')
  try {
    await downloadBoundedMediaToFile(safeUrl, file)
    const output = runFfprobeText([
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      ffArg(file),
    ]).trim()
    const duration = Number(output)
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('audio duration is unavailable')
    }
    return duration
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

const PORT = process.env.PORT || 3333
const OUTPUT_DIR = process.env.OUTPUT_DIR || './out'

// Optimal concurrency based on CPU cores (75% of available cores, min 2)
/**
 * Конкурентность рендера по РЕАЛЬНОЙ доле контейнера, а не по ядрам хоста.
 *
 * os.cpus() внутри контейнера отдаёт ядра ХОСТА — на Railway это 48. Отсюда
 * получалось 36 параллельных вкладок Chrome, каждая со своими процессами
 * ffmpeg/ffprobe. Контейнеру столько процессов не выделено, и рендер падал на
 * ровном месте:
 *
 *   spawn .../ffprobe EAGAIN
 *
 * EAGAIN на spawn — это не «файл битый» и не «кодек не тот», это упёрлись в
 * лимит процессов. Симптом со стороны человека: экспорт доходит до ~38% и
 * обрывается.
 *
 * Настоящую долю CPU знает cgroup: v2 пишет её в cpu.max («квота период»),
 * v1 — в cpu.cfs_quota_us / cpu.cfs_period_us. Если квоты нет (голое железо),
 * возвращаемся к ядрам, но всё равно упираемся в потолок: больше восьми
 * вкладок Chrome не ускоряют рендер, а лишь приближают тот же EAGAIN.
 */
function containerCpuCount(): number {
  try {
    const v2 = fs.readFileSync('/sys/fs/cgroup/cpu.max', 'utf-8').trim()
    const [quota, period] = v2.split(/\s+/)
    if (quota && quota !== 'max') {
      const n = Number(quota) / Number(period || 100000)
      if (Number.isFinite(n) && n > 0) return n
    }
  } catch {
    /* не cgroup v2 — пробуем v1 */
  }
  try {
    const q = Number(
      fs.readFileSync('/sys/fs/cgroup/cpu/cpu.cfs_quota_us', 'utf-8').trim()
    )
    const p = Number(
      fs.readFileSync('/sys/fs/cgroup/cpu/cpu.cfs_period_us', 'utf-8').trim()
    )
    if (q > 0 && p > 0) return q / p
  } catch {
    /* квоты нет — считаем по ядрам */
  }
  return os.cpus().length
}

const CONCURRENCY_CEILING = Number(process.env.RENDER_CONCURRENCY_MAX || 4)
const cpuShare = containerCpuCount()
const OPTIMAL_CONCURRENCY = Math.max(
  1,
  Math.min(CONCURRENCY_CEILING, Math.floor(cpuShare))
)
console.log(
  `🔧 CPU: ядер у хоста ${os.cpus().length}, доля контейнера ${cpuShare.toFixed(2)}, ` +
    `конкурентность ${OPTIMAL_CONCURRENCY} (потолок ${CONCURRENCY_CEILING})`
)

// S3/Tigris Configuration
const S3_ENDPOINT =
  process.env.AWS_ENDPOINT_URL_S3 || 'https://fly.storage.tigris.dev'
const S3_BUCKET =
  process.env.BUCKET_NAME || process.env.S3_BUCKET || 'vibee-assets'
const S3_PUBLIC_URL = process.env.S3_PUBLIC_URL || `${S3_ENDPOINT}/${S3_BUCKET}`

// MinIO (и большинство S3-совместимых хранилищ, кроме самого AWS) адресует
// бакет путём, а не поддоменом. Без forcePathStyle SDK пойдёт на
// https://<bucket>.bucket-production-8259.up.railway.app — такого хоста нет,
// и загрузка падает на DNS, а не на правах доступа, что уводит диагностику
// совсем не туда.
//
// Включается для любого своего эндпоинта; на настоящем AWS S3_ENDPOINT не
// задан, и поведение остаётся прежним. S3_FORCE_PATH_STYLE=false — аварийный
// выключатель, если хранилище всё-таки требует virtual-host.
const useCustomEndpoint = Boolean(process.env.AWS_ENDPOINT_URL_S3)
const forcePathStyle =
  process.env.S3_FORCE_PATH_STYLE === 'false' ? false : useCustomEndpoint

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'auto',
  endpoint: S3_ENDPOINT,
  forcePathStyle,
  credentials: process.env.AWS_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      }
    : undefined,
})
console.log(
  `🪣 S3: endpoint=${S3_ENDPOINT} bucket=${S3_BUCKET} pathStyle=${forcePathStyle} creds=${
    process.env.AWS_ACCESS_KEY_ID ? 'set' : 'MISSING'
  }`
)

// PostgreSQL Configuration
const DATABASE_URL = process.env.DATABASE_URL
let pgPool: Pool | null = null

function getPool(): Pool {
  if (!pgPool) {
    if (!DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable not set')
    }
    pgPool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
    console.log('✅ PostgreSQL pool created')
  }
  return pgPool
}

const SESSION_REVOCATION_POLL_MS = 5_000

/**
 * Keep the synchronous access-token verifier consistent across replicas.
 *
 * A logout writes PostgreSQL immediately, but another Railway replica cannot
 * see the in-memory revokeNow() call. The initial read happens before listen,
 * and the short poll keeps every replica within the documented revocation
 * window. If sessions are enabled but their database cannot be read, startup
 * fails closed instead of accepting tokens with a stale/empty revocation set.
 */
async function startSessionRevocationSync(): Promise<void> {
  const signingKey = process.env.SESSION_SIGNING_KEY || ''
  const deployed =
    !!process.env.RAILWAY_GIT_COMMIT_SHA || !!process.env.RAILWAY_ENVIRONMENT
  if (signingKey.length < 32) {
    if (deployed) {
      throw new Error(
        'SESSION_SIGNING_KEY is required for deployed browser authentication'
      )
    }
    return
  }

  const pool = getPool()
  await ensureAuthTables(pool)
  await pollRevocations(pool)

  const timer = setInterval(() => {
    void pollRevocations(pool).catch(() => {
      console.error('[session] revocation sync failed')
    })
  }, SESSION_REVOCATION_POLL_MS)
  timer.unref()
}

// Telegram Notification Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_OWNER_ID = '144022504'
const TELEGRAM_RENDERS_GROUP = '-1002737186844'

// Send text message to Telegram
async function sendTelegramMessage(
  chatId: string,
  message: string
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN not set, skipping notification')
    return false
  }
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
        }),
      }
    )
    const result = await response.json()
    if (!result.ok) {
      console.error('❌ Telegram sendMessage failed:', result)
      return false
    }
    console.log(`📨 Telegram notification sent to ${chatId}`)
    return true
  } catch (error) {
    console.error('❌ Telegram sendMessage error:', error)
    return false
  }
}

// Send video to Telegram
async function sendTelegramVideo(
  chatId: string,
  videoUrl: string,
  caption: string
): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN not set, skipping video notification')
    return false
  }
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          video: videoUrl,
          caption: caption,
          parse_mode: 'HTML',
        }),
      }
    )
    const result = await response.json()
    if (!result.ok) {
      console.error('❌ Telegram sendVideo failed:', result)
      // Fallback to message with link
      return sendTelegramMessage(chatId, `${caption}\n\n🔗 ${videoUrl}`)
    }
    console.log(`📹 Telegram video sent to ${chatId}`)
    return true
  } catch (error) {
    console.error('❌ Telegram sendVideo error:', error)
    return false
  }
}

/**
 * Запись строки ленты. ЕДИНСТВЕННОЕ место, которое пишет в public_templates.
 *
 * Раньше путей было два, и оба вели через СЕТЬ к этому же процессу:
 *   1. HTTP-обработчик POST /api/feed/publish — рабочий;
 *   2. publishToFeed() после рендера — делал fetch на FEED_API_URL, а тот по
 *      умолчанию равен SERVICE_ENDPOINTS.mcp, то есть адресу самого сервера,
 *      захардкоженному на мёртвый https://vibee-render-server.fly.dev.
 *
 * Дефекта там было два, независимых, и оба молчали:
 *   - хост мёртв (curl обрывается на рукопожатии TLS, HTTP-кода нет вовсе),
 *     поэтому fetch всегда падал в catch и возвращал false;
 *   - даже с правильным адресом запрос получил бы 401: publishToFeed слал
 *     только Content-Type, а POST /api/feed/publish не входит в публичные
 *     маршруты. То есть «просто прописать FEED_API_URL» не помогло бы.
 *
 * Итог: за всё время ни одна запись ленты не была создана рендером. Три
 * карточки, которые там лежат, — ручной засев (разброс времени создания
 * 1.05 секунды, видео на storage Supabase, а не в бакете рендера).
 *
 * Сетевой вызов самого себя убран. Один процесс, один пул, прямой вызов.
 */
async function publishTemplateRow(data: Record<string, any>): Promise<{
  id: number
  created_at: string
  updated: boolean
  creator_username: string
}> {
  const pool = await getPool()

  /**
   * ВИДИМОСТЬ РЕШАЕТ ВЫЗЫВАЮЩИЙ.
   *
   * В таблицу ведёт одна дверь, и зовут её двое: веб — по нажатию человека,
   * агент — сам. Владелец просил, чтобы в ленте появлялось только одобренное,
   * а функция ставила `is_public = TRUE` обоим одинаково.
   *
   * Умолчание TRUE намеренно: все прежние вызывающие поля не передают, и
   * менять их поведение молча значило бы спрятать чужие посты без спроса.
   * Скрытым публикует тот, кто явно об этом просит.
   */
  const видимость = data.is_public !== false

  let creatorUsername = ''
  try {
    const userResult = await pool.query(
      `SELECT username FROM users WHERE telegram_id = $1 LIMIT 1`,
      [String(data.telegram_id)]
    )
    if (userResult.rows.length > 0) {
      creatorUsername = userResult.rows[0].username || ''
    }
  } catch (e) {
    console.warn('[Feed] Could not look up creator username:', e)
  }

  /**
   * jsonb-поля принимаются и объектом, и строкой с JSON.
   *
   * Драйвер сам сериализует объект, поэтому УЖЕ сериализованная строка
   * попадала в jsonb как JSON-скаляр «строка», а не как объект: клиенту
   * приходил template_settings строкой, и compositionId читался как
   * undefined — карточку из ленты нельзя было применить к себе.
   * Поймано на живой публикации трёх канонических шаблонов.
   */
  const asJson = (v: unknown, fallback: string): string => {
    if (v == null) return fallback
    if (typeof v === 'string') {
      try {
        JSON.parse(v)
        return v // уже валидный JSON — повторно не кодируем
      } catch {
        return fallback
      }
    }
    return JSON.stringify(v)
  }

  const settingsJson = asJson(data.template_settings, '{}')
  const assetsJson = asJson(data.assets, '[]')
  const tracksJson = asJson(data.tracks, '[]')

  /**
   * Повторная публикация шаблона с тем же именем ОБНОВЛЯЕТ запись.
   * Метода удаления у ленты нет, поэтому автор, поправивший описание или
   * образец, иначе получал две карточки одного шаблона и не мог убрать
   * старую.
   */
  const requestedTemplateId = Number(data.template_id)
  const editsExistingTemplate =
    Number.isSafeInteger(requestedTemplateId) && requestedTemplateId > 0
  const existing = editsExistingTemplate
    ? await pool.query(
        `SELECT id FROM public_templates
         WHERE id = $1 AND telegram_id = $2 LIMIT 1`,
        [requestedTemplateId, String(data.telegram_id)]
      )
    : await pool.query(
        `SELECT id FROM public_templates
         WHERE telegram_id = $1 AND name = $2 LIMIT 1`,
        [String(data.telegram_id), data.name || 'Untitled']
      )

  // A supplied remote id means "edit this exact template". Falling back to
  // INSERT on a missing/not-owned id would turn an authorization failure or a
  // stale editor into a duplicate post, so this path is deliberately strict.
  if (editsExistingTemplate && existing.rows.length === 0) {
    throw new Error('template not found for verified owner')
  }

  if (existing.rows.length > 0) {
    const upd = await pool.query(
      `UPDATE public_templates
       SET creator_name = $2, creator_avatar = $3, creator_username = $4,
           name = $5, description = $6, thumbnail_url = $7, video_url = $8,
           template_settings = $9::jsonb, assets = $10::jsonb, tracks = $11::jsonb,
           -- ВИДИМОСТЬ РЕШАЕТ ВЫЗЫВАЮЩИЙ, А НЕ ЭТА ФУНКЦИЯ.
           --
           -- Здесь стояло безусловное TRUE, и это верно для
           -- нажатия человека — но ту же дверь зовёт АГЕНТ, сам, без спроса.
           -- Владелец просил обратного: пост в ленте только с одобрения.
           --
           -- Снятая публикация возвращается, если её публикуют заново. Без
           -- этой строки upsert по имени обновил бы скрытую запись и она
           -- осталась бы невидимой: человек нажал «опубликовать», получил
           -- «готово» и не увидел ничего.
           is_public = $13,
           deleted_at = NULL
       WHERE id = $1 AND telegram_id = $12
       RETURNING id, created_at::text`,
      [
        existing.rows[0].id,
        data.creator_name || 'Anonymous',
        data.creator_avatar || null,
        creatorUsername,
        data.name || 'Untitled',
        data.description || null,
        data.thumbnail_url || null,
        data.video_url,
        settingsJson,
        assetsJson,
        tracksJson,
        String(data.telegram_id),
        видимость,
      ]
    )
    const row = upd.rows[0]
    console.log(
      `✅ [Feed] Updated template ID=${row.id} by ${data.creator_name}`
    )
    return {
      id: row.id,
      created_at: row.created_at,
      updated: true,
      creator_username: creatorUsername,
    }
  }

  const result = await pool.query(
    `INSERT INTO public_templates (
      telegram_id, creator_name, creator_avatar, creator_username,
      name, description, thumbnail_url, video_url,
      template_settings, assets, tracks,
      parent_template_id, original_creator_id,
      is_public, likes_count, views_count, uses_count
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13, $14, 0, 0, 0)
    RETURNING id, created_at::text`,
    [
      String(data.telegram_id),
      data.creator_name || 'Anonymous',
      data.creator_avatar || null,
      creatorUsername,
      data.name || 'Untitled',
      data.description || null,
      data.thumbnail_url || null,
      data.video_url,
      settingsJson,
      assetsJson,
      tracksJson,
      data.parent_template_id || null,
      data.original_creator_id || null,
      видимость,
    ]
  )

  const row = result.rows[0]
  console.log(
    `✅ [Feed] Published template ID=${row.id} by ${data.creator_name}`
  )
  return {
    id: row.id,
    created_at: row.created_at,
    updated: false,
    creator_username: creatorUsername,
  }
}

// Auto-publish to community feed

interface PublishToFeedParams {
  telegramId: number
  creatorName: string
  creatorAvatar?: string
  projectName: string
  videoUrl: string
  templateSettings?: Record<string, unknown>
  assets?: unknown[]
  tracks?: unknown[]
}

/**
 * Кадр из ролика для обложки ленты.
 *
 * `thumbnail_url` стоял здесь ЖЁСТКИМ `null` — у всех опубликованных роликов
 * до одного. В профиле это выглядело как двадцать чёрных карточек со
 * счётчиками просмотров: данные есть, показать нечего. Ролик при этом
 * существует и содержит нужный кадр — его просто никто не доставал.
 *
 * Кадр берём на ЧЕТВЕРТИ ролика, а не на первой секунде.
 *
 * Сначала здесь стояла первая секунда — из соображения, что нулевой кадр часто
 * чёрный. Соображение верное, выбор — нет: сняли кадр из настоящего ролика и
 * посмотрели на него. На первой секунде оказалась ТИТУЛЬНАЯ КАРТОЧКА —
 * «TRINITY S³AI, 1 min» мелким текстом на чёрном, то есть обложка, по которой
 * невозможно отличить один ролик от другого. На четверти — заголовок ролика
 * золотом во весь кадр, по которому он узнаётся сразу.
 *
 * Четверть, а не фиксированная секунда, потому что ролики разной длины: у
 * тридцатисекундного это 7 с (после заставки), у шестисекундного — 1.5 с
 * (после плавного появления). Одно правило обслуживает оба случая.
 *
 * Длительность спрашиваем у самого файла; если не ответил — отступаем на
 * секунду: это по-прежнему лучше нулевого кадра.
 *
 * Отказ здесь НЕ отменяет публикацию. Ролик без обложки хуже ролика с
 * обложкой, но несравнимо лучше ролика, который не опубликовался: обложка —
 * украшение записи, а не её условие.
 */
async function обложкаИзРолика(videoUrl: string): Promise<string | null> {
  const дир = fs.mkdtempSync(path.join(os.tmpdir(), 'vibee-poster-'))
  const кадр = path.join(дир, 'poster.jpg')
  try {
    let момент = 1
    try {
      const длит = parseFloat(
        runFfprobeText([
          '-v',
          'error',
          '-show_entries',
          'format=duration',
          '-of',
          'csv=p=0',
          ffArg(videoUrl),
        ]).trim()
      )
      if (Number.isFinite(длит) && длит > 0) момент = Math.max(1, длит / 4)
    } catch {
      /* длительность неизвестна — остаётся секунда */
    }
    runFfmpeg(
      [
        '-ss',
        ffArg(момент.toFixed(2)),
        '-i',
        ffArg(videoUrl),
        '-frames:v',
        '1',
        '-vf',
        'scale=540:-2',
        '-q:v',
        '4',
        '-y',
        ffArg(кадр),
      ],
      60_000
    )
    if (!fs.existsSync(кадр)) return null
    const загружено = await uploadToS3(
      fs.readFileSync(кадр),
      `poster-${Date.now()}.jpg`,
      'image/jpeg'
    )
    // `url` необязателен в типе результата: пустая строка и undefined
    // означают «файла нет», и обе обязаны стать null, а не «».
    return загружено.success && загружено.url ? загружено.url : null
  } catch (e) {
    console.warn('[Feed] обложку снять не вышло:', e)
    return null
  } finally {
    try {
      fs.rmSync(дир, { recursive: true, force: true })
    } catch {
      /* временная папка — не повод ронять публикацию */
    }
  }
}

async function publishToFeed(params: PublishToFeedParams): Promise<boolean> {
  try {
    console.log(`📤 [Feed] Publishing to community feed: ${params.projectName}`)
    const row = await publishTemplateRow({
      telegram_id: params.telegramId,
      creator_name: params.creatorName,
      creator_avatar: params.creatorAvatar ?? null,
      name: params.projectName,
      description: `Created by ${params.creatorName}`,
      thumbnail_url: await обложкаИзРолика(params.videoUrl),
      video_url: params.videoUrl,
      // Объекты, а НЕ строки: publishTemplateRow сам приводит их к jsonb.
      // Раньше здесь стоял JSON.stringify, и значение уезжало в базу
      // JSON-скаляром «строка» — карточку нельзя было применить к себе.
      template_settings: params.templateSettings || {},
      assets: params.assets || [],
      tracks: params.tracks || [],
    })
    console.log(`✅ [Feed] Published to feed: ID=${row.id}`)
    return true
  } catch (error) {
    console.error('❌ [Feed] Publish error:', error)
    return false
  }
}

// Upload directory for temp files
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads'

// Ensure directories exist
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

// Temp directory for pre-downloaded render assets (in public so Remotion can serve)
const RENDER_TEMP_DIR = path.join(process.cwd(), 'public', 'render-temp')
if (!fs.existsSync(RENDER_TEMP_DIR)) {
  fs.mkdirSync(RENDER_TEMP_DIR, { recursive: true })
}

/**
 * Pre-download S3 asset to temp directory for faster rendering
 * Also transcodes to H.264 if needed (iPhone HEVC videos don't work in Chrome)
 * Returns a file:// URL that Remotion can access directly
 */
async function preDownloadS3Asset(url: string): Promise<string> {
  let s3Key: string | null = null

  if (url.includes('/s3/')) {
    const match = url.match(/\/s3\/(.+)$/)
    if (match) {
      s3Key = match[1]
    }
  }

  if (!s3Key) {
    return url
  }

  const baseName = path.basename(s3Key, path.extname(s3Key))
  const downloadFilename = `${Date.now()}-${path.basename(s3Key)}`
  const downloadPath = path.join(RENDER_TEMP_DIR, downloadFilename)

  // Output will always be .mp4 H.264
  const outputFilename = `${Date.now()}-${baseName}-h264.mp4`
  const outputPath = path.join(RENDER_TEMP_DIR, outputFilename)

  console.log(`📥 Pre-downloading S3 asset: ${s3Key}`)

  try {
    // Download from S3
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
    })

    const response = await s3Client.send(command)
    const body = response.Body as NodeJS.ReadableStream

    await new Promise<void>((resolve, reject) => {
      const file = fs.createWriteStream(downloadPath)
      body.pipe(file)
      file.on('finish', () => {
        file.close()
        resolve()
      })
      file.on('error', reject)
    })

    const stats = fs.statSync(downloadPath)
    console.log(`✅ Downloaded ${(stats.size / 1024 / 1024).toFixed(2)} MB`)

    // Transcode to H.264 (Chrome-compatible) using ffmpeg
    console.log(`🔄 Transcoding to H.264...`)
    try {
      execFileSync(
        'ffmpeg',
        [
          '-i',
          ffArg(downloadPath),
          '-c:v',
          'libx264',
          '-preset',
          'fast',
          '-crf',
          '23',
          '-c:a',
          'aac',
          '-movflags',
          '+faststart',
          '-y',
          ffArg(outputPath),
        ],
        { stdio: 'pipe', timeout: 300000 }
      )

      // Remove original download
      fs.unlinkSync(downloadPath)

      const outputStats = fs.statSync(outputPath)
      console.log(
        `✅ Transcoded to ${(outputStats.size / 1024 / 1024).toFixed(2)} MB`
      )

      // Return HTTP URL for Remotion to access via render server
      return `http://0.0.0.0:${PORT}/render-temp/${outputFilename}`
    } catch (transcodeError) {
      console.warn(`⚠️ Transcode failed, using original:`, transcodeError)
      // If transcode fails, use original via HTTP
      return `http://0.0.0.0:${PORT}/render-temp/${downloadFilename}`
    }
  } catch (error) {
    console.error(`❌ Failed to pre-download:`, error)
    return url
  }
}

// Bundle once at startup for better performance
let bundleLocation: string

// Список композиций бандла, закэшированный на время жизни процесса: бандл после
// старта не меняется, а getCompositions поднимает headless-браузер — дёргать его
// на каждый POST /render дорого.
let compositionsCache: Awaited<ReturnType<typeof getCompositions>> | null = null
async function knownCompositions() {
  if (!compositionsCache)
    compositionsCache = await getCompositions(bundleLocation)
  return compositionsCache
}

/**
 * Имя и аватар бота по его id — для white-label шапки мини-аппа.
 *
 * Токен ищем среди тех же переменных, что и проверка подписи: у бота, чьей
 * подписью пришли данные, токен на сервере обязан быть, иначе подпись бы не
 * сошлась.
 *
 * Кэш на процесс: getMe и getUserProfilePhotos на каждый заход — лишние два
 * круга к Telegram, а имя бота меняется в лучшем случае раз в жизни.
 */
const brandingCache = new Map<
  string,
  { title: string; username: string; avatarUrl: string | null }
>()

async function getBotBranding(botId: string) {
  const cached = brandingCache.get(botId)
  if (cached) return cached

  const tokens: string[] = []
  const push = (t?: string) => {
    const v = (t || '').trim()
    if (v && !tokens.includes(v)) tokens.push(v)
  }
  push(process.env.TELEGRAM_BOT_TOKEN)
  for (let i = 1; i <= 20; i++) push(process.env[`BOT_TOKEN_${i}`])

  const token = tokens.find(t => t.split(':')[0] === botId)
  if (!token) throw new Error(`токена бота ${botId} нет на сервере`)

  const me = await fetch(`https://api.telegram.org/bot${token}/getMe`).then(
    r => r.json() as any
  )
  if (!me?.ok) throw new Error(`getMe: ${me?.description || 'отказ'}`)

  let avatarUrl: string | null = null
  try {
    const photos = await fetch(
      `https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${botId}&limit=1`
    ).then(r => r.json() as any)
    const fileId = photos?.result?.photos?.[0]?.slice(-1)?.[0]?.file_id
    if (fileId) {
      const file = await fetch(
        `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`
      ).then(r => r.json() as any)
      if (file?.ok?.valueOf() && file.result?.file_path) {
        // Ссылка на файл содержит токен, поэтому наружу отдаём её через свой
        // прокси-маршрут, а не напрямую.
        avatarUrl = `/branding/avatar/${botId}`
      }
    }
  } catch (e) {
    console.warn('[branding] аватар не получен:', e)
  }

  const brand = {
    title: me.result.first_name as string,
    username: me.result.username as string,
    avatarUrl,
  }
  brandingCache.set(botId, brand)
  return brand
}

/**
 * Отпечаток исходников композиций — чтобы устаревший образ был ВИДЕН снаружи.
 *
 * Зачем это вообще. 24.08.2026 сервис перезапустился на старом образе и
 * несколько минут пёк ролики прежним бандлом — уже после того, как правка
 * была в main и проверена живым рендером. Снаружи отличить свежий бандл от
 * старого было нечем: /health отдавал только `status` и `bundleReady`, а оба
 * равно бодры и у правильного образа, и у протухшего. Причину пришлось
 * восстанавливать по совпадению времён в журнале деплоев.
 *
 * Почему хеш исходников, а не номер коммита: коммит пришлось бы получать от
 * Railway (переменных RAILWAY_GIT_* у сервиса нет) или прокидывать через
 * build-arg, то есть зависеть от механизма, который сам может отвалиться
 * молча. Хеш сервер считает по файлам, которые у него РЕАЛЬНО лежат, и
 * ответ означает ровно то, что нужно: «вот из этих исходников я рисую».
 *
 * Сверять — тем же расчётом, а не похожим:
 *   node .claude/loop-opus/render-fingerprint.mjs --compare
 *
 * Рецепт нарочно вынесен в скрипт, а не записан сюда шелл-строкой: в хеш
 * входят и ИМЕНА файлов (переименование композиции меняет вывод рендера не
 * меньше правки её тела), и повторить это конвейером из cat нельзя — при
 * первой же попытке я написал в комментарий рецепт, который дал бы другое
 * число. Две реализации одного правила расходятся молча.
 *
 * Совпало с полем `compositions` в /health — образ свежий. Разошлось —
 * сервис крутит не тот код, и никакой зелёный статус деплоя этого не отменяет.
 */
let compositionsFingerprint: string | null = null

/**
 * Когда поднялся ЭТОТ экземпляр. Вместе с отпечатком отвечает на второй
 * вопрос происшествия: «сервис перезапускался или всё это время был один?»
 * По журналу деплоев это восстанавливается плохо — статусы SKIPPED и REMOVED
 * не говорят, какой образ в итоге обслуживал запрос.
 */
const startedAtIso = new Date().toISOString()

function computeCompositionsFingerprint(): string | null {
  try {
    const dir = path.resolve('./src/compositions')
    if (!fs.existsSync(dir)) return null
    const files = fs
      .readdirSync(dir)
      .filter(f => f.endsWith('.tsx') || f.endsWith('.ts'))
      .sort() // порядок обязан быть устойчивым, иначе хеш «меняется» сам по себе
    if (files.length === 0) return null
    const h = createHash('sha1')
    for (const f of files) {
      // Имя в хеш тоже: переименование композиции меняет вывод рендера
      // ничуть не меньше, чем правка её тела.
      h.update(f)
      h.update(fs.readFileSync(path.join(dir, f)))
    }
    return `${h.digest('hex').slice(0, 12)}+${files.length}`
  } catch (e) {
    // Молча вернуть null нельзя: отсутствие отпечатка неотличимо от
    // «не смог посчитать», а это разные вещи для того, кто диагностирует.
    console.warn('[fingerprint] не посчитан:', (e as Error).message)
    return null
  }
}

async function initBundle() {
  compositionsFingerprint = computeCompositionsFingerprint()
  console.log(
    `🔖 Отпечаток композиций: ${compositionsFingerprint ?? 'НЕ ПОСЧИТАН'}`
  )
  console.log('📦 Creating Remotion bundle...')
  bundleLocation = await bundle({
    entryPoint: path.resolve('./src/index.ts'),
    // @vibee/atoms приходит в node_modules симлинком на ../packages: без
    // symlinks:false webpack резолвит его по реальному пути и ищет jotai
    // оттуда, поднимаясь до корня репо, где jotai нет. С флагом резолв идёт
    // от симлинка — и находит jotai рядом, в node_modules рендера.
    webpackOverride: config => {
      config.resolve = { ...config.resolve, symlinks: false }
      return config
    },
  })
  console.log('✅ Bundle ready at:', bundleLocation)

  // Preload face detection models
  console.log('👤 Loading face detection models...')
  try {
    // Прогрев моделей — не повод ронять запуск: если распознавание не
    // собралось, всё остальное обязано работать.
    try {
      await (await faceApi()).loadModels()
    } catch (e) {
      console.warn(
        '[face] распознавание лица недоступно:',
        String(e).slice(0, 200)
      )
    }
    console.log('✅ Face detection models ready')
  } catch (error) {
    console.warn('⚠️ Face detection models failed to load:', error)
  }
}

// S3 Upload helper
type UploadedAsset = {
  success: boolean
  url?: string
  key?: string
  error?: string
  signedUrl?: string
  directUrl?: string
}

async function uploadedAssetResult(key: string): Promise<UploadedAsset> {
  const signedUrl = await getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }),
    { expiresIn: 604800 }
  )
  /**
   * Proxy URL is ABSOLUTE, not root-relative.
   *
   * This built `/s3/${key}`, which resolves only for a client sitting on this
   * same origin -- a browser page served by this server. The iOS app fed it
   * straight into a URL and got nothing: /api/generate/audio answered 200 with
   * a body nobody could fetch, so voice looked broken in the app while the
   * endpoint itself was healthy.
   *
   * Video and image return absolute links by other paths, which is why only
   * voice showed the symptom -- and why it read as "the voice provider is
   * down" rather than "the URL has no host".
   *
   * The proxy itself stays: it is what transcodes HEVC to H.264 on the way out.
   * Only the host is added, from PUBLIC_URL -- the same variable and fallback
   * already used for the remotion and mcp URLs above.
   */
  const PUBLIC_BASE = (
    process.env.PUBLIC_URL || 'https://vibee-render-production.up.railway.app'
  ).replace(/\/+$/, '')
  const proxyUrl = `${PUBLIC_BASE}/s3/${key}`
  const directUrl = `${S3_PUBLIC_URL}/${key}`
  // Signed URLs are credentials. Log the stable object key only.
  console.log(`✅ Uploaded to S3: ${key}`)
  return { success: true, url: proxyUrl, key, directUrl, signedUrl }
}

async function uploadToS3(
  fileBuffer: Buffer,
  filename: string,
  contentType: string
): Promise<UploadedAsset> {
  const key = `assets/${Date.now()}-${filename}`

  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
      })
    )

    return await uploadedAssetResult(key)
  } catch (error) {
    console.error('❌ S3 upload failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    }
  }
}

const uploadConcurrency = new UploadConcurrencyGate(2)

async function uploadRequestToS3(
  req: IncomingMessage,
  filename: string,
  contentType: string,
  maxBytes: number
): Promise<UploadedAsset> {
  const key = `assets/${Date.now()}-${filename}`
  const { stream, receivedBytes } = boundedUploadTransform(maxBytes)
  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'vibee-upload-')
  )
  const tempFile = path.join(tempDir, 'payload')
  let uploader: Upload | undefined

  try {
    await pipeline(
      req,
      stream,
      fs.createWriteStream(tempFile, { flags: 'wx', mode: 0o600 })
    )
    if (receivedBytes() === 0) throw new Error('empty upload')
    uploader = new Upload({
      client: s3Client,
      params: {
        Bucket: S3_BUCKET,
        Key: key,
        Body: fs.createReadStream(tempFile),
        ContentLength: receivedBytes(),
        ContentType: contentType,
      },
      queueSize: 1,
      partSize: 5 * 1024 * 1024,
      leavePartsOnError: false,
    })
    await uploader.done()
    return await uploadedAssetResult(key)
  } catch (error) {
    await uploader?.abort().catch(() => undefined)
    throw error
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true })
  }
}

// HLS Conversion and Tigris Upload
// Converts MP4 to HLS and uploads all segments to Tigris for global edge caching
interface HLSUploadResult {
  success: boolean
  hlsUrl?: string // Master playlist URL on Tigris
  renditions?: Record<string, string> // Quality -> playlist URL
  error?: string
}

async function convertToHLSAndUploadToTigris(
  videoPath: string,
  videoId: string,
  renditions: string[] = ['480p', '720p'] // Default: 2 qualities for balance
): Promise<HLSUploadResult> {
  const tempHlsDir = path.join(OUTPUT_DIR, `hls-temp-${videoId}`)

  try {
    console.log(`🎬 [HLS] Starting conversion for ${videoId}...`)
    fs.mkdirSync(tempHlsDir, { recursive: true })

    // Rendition configurations
    const renditionConfigs: Record<
      string,
      { width: number; height: number; bitrate: number }
    > = {
      '360p': { width: 640, height: 360, bitrate: 800 },
      '480p': { width: 854, height: 480, bitrate: 1400 },
      '720p': { width: 1280, height: 720, bitrate: 2800 },
      '1080p': { width: 1920, height: 1080, bitrate: 5000 },
    }

    const renditionUrls: Record<string, string> = {}
    const uploadedKeys: string[] = []

    // Create each rendition
    for (const quality of renditions) {
      const config = renditionConfigs[quality]
      if (!config) continue

      const renditionDir = path.join(tempHlsDir, quality)
      fs.mkdirSync(renditionDir, { recursive: true })

      const playlistPath = path.join(renditionDir, 'playlist.m3u8')

      // FFmpeg HLS: аргументы массивом — никакого шелла, никакой интерполяции
      console.log(`🎬 [HLS] Creating ${quality} rendition...`)
      execFileSync(
        'ffmpeg',
        [
          '-i',
          ffArg(videoPath),
          '-vf',
          `scale=${ffArg(config.width)}:${ffArg(config.height)}`,
          '-c:v',
          'libx264',
          '-preset',
          'fast',
          '-b:v',
          `${ffArg(config.bitrate)}k`,
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-hls_time',
          '4',
          '-hls_list_size',
          '0',
          '-hls_segment_filename',
          ffArg(path.join(renditionDir, 'seg%03d.ts')),
          '-f',
          'hls',
          ffArg(playlistPath),
          '-y',
        ],
        { stdio: 'pipe', timeout: 300000 }
      )

      // Upload all segment files to Tigris
      const files = fs.readdirSync(renditionDir)
      for (const file of files) {
        const filePath = path.join(renditionDir, file)
        const fileBuffer = fs.readFileSync(filePath)
        const key = `hls/${videoId}/${quality}/${file}`
        const contentType = file.endsWith('.m3u8')
          ? 'application/vnd.apple.mpegurl'
          : 'video/mp2t'

        await s3Client.send(
          new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
            Body: fileBuffer,
            ContentType: contentType,
            CacheControl: 'public, max-age=31536000, immutable', // 1 year cache
          })
        )

        uploadedKeys.push(key)
      }

      renditionUrls[quality] =
        `${S3_PUBLIC_URL}/hls/${videoId}/${quality}/playlist.m3u8`
      console.log(`✅ [HLS] ${quality} uploaded: ${renditionUrls[quality]}`)
    }

    // Create and upload master playlist
    const masterPlaylist = ['#EXTM3U', '#EXT-X-VERSION:3']

    for (const quality of renditions) {
      const config = renditionConfigs[quality]
      if (!config || !renditionUrls[quality]) continue

      masterPlaylist.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${config.bitrate * 1000},RESOLUTION=${config.width}x${config.height}`,
        `${quality}/playlist.m3u8`
      )
    }

    const masterPlaylistContent = masterPlaylist.join('\n')
    const masterKey = `hls/${videoId}/master.m3u8`

    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: masterKey,
        Body: Buffer.from(masterPlaylistContent),
        ContentType: 'application/vnd.apple.mpegurl',
        CacheControl: 'public, max-age=3600', // 1 hour for master (allows quality updates)
      })
    )

    const hlsUrl = `${S3_PUBLIC_URL}/${masterKey}`
    console.log(`✅ [HLS] Master playlist uploaded: ${hlsUrl}`)

    // Cleanup temp directory
    fs.rmSync(tempHlsDir, { recursive: true, force: true })

    return {
      success: true,
      hlsUrl,
      renditions: renditionUrls,
    }
  } catch (error) {
    console.error(`❌ [HLS] Conversion failed:`, error)

    // Cleanup on error
    if (fs.existsSync(tempHlsDir)) {
      fs.rmSync(tempHlsDir, { recursive: true, force: true })
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'HLS conversion failed',
    }
  }
}

// List S3 assets
async function listS3Assets(prefix: string = 'assets/'): Promise<{
  success: boolean
  assets?: Array<{ key: string; url: string; size: number; lastModified: Date }>
  error?: string
}> {
  try {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: prefix,
      })
    )

    const assets = (response.Contents || []).map(obj => ({
      key: obj.Key || '',
      url: `${S3_PUBLIC_URL}/${obj.Key}`,
      size: obj.Size || 0,
      lastModified: obj.LastModified || new Date(),
    }))

    return { success: true, assets }
  } catch (error) {
    console.error('❌ S3 list failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'List failed',
    }
  }
}

// Webhook callback with retry
async function sendWebhook(
  url: string,
  payload: WebhookPayload,
  secret?: string,
  retryCount = 0
): Promise<void> {
  const maxRetries = 3
  const retryDelays = [0, 5000, 15000]

  try {
    // Webhook URL приходит от клиента: только публичные http/https-хосты.
    // SSRF-зонд внутренней сети отсекается здесь, до fetch.
    const target = assertFetchable(url)
    const body = JSON.stringify(payload)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (secret) {
      const signature = createHmac('sha256', secret).update(body).digest('hex')
      headers['X-Vibee-Signature'] = `sha256=${signature}`
    }

    const response = await fetch(target, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    console.log(`✅ [Webhook] Sent to ${url}`)
  } catch (error) {
    console.error(`❌ [Webhook] Failed attempt ${retryCount + 1}:`, error)
    if (retryCount < maxRetries - 1) {
      const delay = retryDelays[retryCount + 1]
      console.log(`🔄 [Webhook] Retrying in ${delay}ms...`)
      setTimeout(() => sendWebhook(url, payload, secret, retryCount + 1), delay)
    }
  }
}

// Upload rendered file to S3
async function uploadRenderedFile(
  filePath: string,
  prefix: string = 'renders/'
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const fileBuffer = fs.readFileSync(filePath)
    const filename = path.basename(filePath)
    const key = `${prefix}${Date.now()}-${filename}`

    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: fileBuffer,
        ContentType: 'video/mp4',
      })
    )

    const url = `${S3_PUBLIC_URL}/${key}`
    console.log(`✅ [S3] Uploaded rendered video: ${url}`)
    return { success: true, url }
  } catch (error) {
    console.error('❌ [S3] Failed to upload rendered file:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    }
  }
}

// Convert simplified segments (seconds) to composition segments (frames)
function convertSegmentsToFrames(segments: SimplifiedSegment[], fps = 30) {
  return segments.map(seg => ({
    type: seg.type,
    startFrame: Math.round(seg.startSeconds * fps),
    durationFrames: Math.round(seg.durationSeconds * fps),
    bRollUrl: seg.bRollUrl,
    bRollType: seg.bRollUrl?.match(/\.(jpg|jpeg|png|gif|webp)$/i)
      ? ('image' as const)
      : ('video' as const),
    caption: '',
  }))
}

// Get content type from filename
function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  const types: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  }
  return types[ext] || 'application/octet-stream'
}

interface RenderRequest {
  type: 'video' | 'still'
  compositionId: string
  inputProps?: Record<string, unknown>
  codec?: string
  frame?: number
  // User info for notifications
  userInfo?: {
    telegram_id: number
    username?: string
    first_name?: string
    project_name?: string
  }
  // Assets and tracks for feed remix
  assets?: unknown[]
  tracks?: unknown[]
}

interface RenderResponse {
  success: boolean
  renderId?: string
  outputPath?: string
  outputUrl?: string
  error?: string
}

// Store render jobs for progress tracking
interface RenderJob {
  id: string
  status: 'pending' | 'rendering' | 'completed' | 'failed'
  progress: number
  outputUrl?: string
  publicUrl?: string // S3 public URL for notifications
  error?: string
  startedAt: Date
  userInfo?: RenderRequest['userInfo']
  // Assets and tracks for feed remix
  assets?: unknown[]
  tracks?: unknown[]
  inputProps?: Record<string, unknown>
}

// Universal template render API types
interface TemplateRenderRequest {
  // Required
  compositionId: string // Template name: "SplitTalkingHead", "LipSyncMain", etc.

  // Common props (used by most templates)
  lipSyncVideo?: string
  segments?: SimplifiedSegment[]
  captions?: Caption[]

  // Template-specific props (passed through as-is)
  props?: Record<string, unknown>
  inputProps?: Record<string, unknown>

  // Render options
  uploadToS3?: boolean // default: true
  s3Prefix?: string // default: "renders/"
  webhookUrl?: string // POST on completion
  webhookSecret?: string // HMAC signature

  // User info for notifications
  userInfo?: {
    telegram_id: number
    username?: string
    first_name?: string
    project_name?: string
  }
}

interface SimplifiedSegment {
  type: 'split' | 'fullscreen'
  startSeconds: number
  durationSeconds: number
  bRollUrl?: string
}

interface Caption {
  text: string
  startMs: number
  endMs: number
}

interface WebhookPayload {
  renderId: string
  status: 'completed' | 'failed'
  publicUrl?: string
  error?: string
  renderTimeMs: number
  timestamp: string
}

const renderJobs = new Map<string, RenderJob>()

/**
 * One attempt at wiring the durable job store, not one per request.
 *
 * Repeating getPool() on every request would repeat its synchronous throw on
 * every request too, turning a missing DATABASE_URL from a quiet degradation
 * into a per-request cost.
 */
let storeAttached = false
function attachStoreOnce(): void {
  if (storeAttached) return
  storeAttached = true
  attachStore(getPool() as never)
}

/**
 * What one charge TOOK and what it LEFT.
 *
 * Both numbers already exist at the moment of the charge: billing-shared.ts
 * returns them from the very `UPDATE ... RETURNING balance` that moves the
 * money. They were discarded here, so no success response could state a
 * price, and the only place a person ever saw one was the 402 refusal, baked
 * into prose -- the price was known only to whoever ran out of it.
 *
 * `balance` is deliberately the SAME wire name GET /api/balance already uses
 * for the same quantity. One name for one number: a second name for the
 * remaining balance is a second source of truth, and they drift.
 */
type Receipt = { charged?: number; balance?: number }

/**
 * Charge the Mini App user for a generation, or refuse it.
 *
 * The two callers of /api/generate/* are not equal:
 *   - the AGENT (tools.ts) arrives with X-Api-Key and has ALREADY paid at the
 *     tool layer, so charging here would double-charge it;
 *   - the MINI APP arrives with a Telegram signature and, until this, paid
 *     NOTHING -- every user generated for free, past the price and past the
 *     limit.
 *
 * Prices come from src/agent/billing-shared.ts, the same table the agent tools
 * use, so the two paths cannot drift apart. Nothing is invented here.
 *
 * FAILS CLOSED. If the pool is unreachable the generation is refused rather
 * than given away, matching requireInternalKey's rule in the bot ("a route that
 * cannot check does not open"). DATABASE_URL is set on this service, so this is
 * an outage path, not the normal one.
 *
 * getPool() throws SYNCHRONOUSLY, hence the try around it: unguarded it escapes
 * the async handler and Node kills the process -- a one-request DoS.
 */
async function chargeMiniAppUser(
  req: IncomingMessage,
  op: string,
  quantity = 1,
  /** Выбранная модель (`kie/<id>`): цена берётся её, а не общая по виду. */
  modelId?: string
): Promise<
  | { ok: true; tid?: string; receipt: Receipt }
  | { ok: false; status: number; reason: string }
> {
  // Server-to-server: already paid at the tool layer. Key off the VALIDATED
  // auth decision, not the raw header: authenticate() only returns via
  // 'api-key' when X-Api-Key timing-safe-matches RENDER_API_KEY, whereas a
  // WRONG X-Api-Key falls through to the initData/session branches (auth.ts
  // does not reject it). So `req.headers['x-api-key']` present-but-invalid used
  // to skip billing for any signed Mini App user who added a junk header ->
  // free generation past the paywall. This mirrors the auth.via === 'api-key'
  // gate already used for render-owner actions elsewhere in this file.
  // Empty receipt, not a zero one: this caller paid at the tool layer and the
  // amount it paid is not known here. Stating 0 would be a lie; stating
  // nothing keeps the agent's response shape exactly as it was.
  if (authenticate(req).via === 'api-key') return { ok: true, receipt: {} }

  const tid = verifiedViewerId(req)
  if (!tid) {
    // Auth is enforced upstream; an unsigned caller should never reach here.
    return { ok: false, status: 401, reason: 'no verified telegram id' }
  }

  try {
    const pool = getPool()
    const spent = await spendByTid(pool as never, tid, op, quantity, modelId)
    if (!spent.ok) {
      return {
        ok: false,
        status: 402,
        // A field name of billing-shared.ts's public return type; renaming that
        // shared API to satisfy this gate would touch the agent tools too.
        reason: spent.причина || 'not enough tokens', // cyrillic-ok: shared API field
      }
    }
    // The ONE place a charge becomes public numbers. Field names on the left
    // are the wire; on the right they are billing-shared.ts's public return
    // type, renaming which would touch the agent tools too.
    return {
      ok: true,
      tid,
      receipt: { charged: spent.списано, balance: spent.осталось }, // cyrillic-ok: shared API field
    }
  } catch (e) {
    console.error('[токены] списание невозможно, генерация отклонена:', e)
    return { ok: false, status: 503, reason: 'billing unavailable' }
  }
}

/** Give the tokens back when the provider did not deliver. */
/**
 * Возврат должен зеркалить списание — И ЦЕНОЙ, И КОЛИЧЕСТВОМ.
 *
 * `modelId` не был параметром вовсе, поэтому возврат считался по виду работы,
 * а списание по модели: из 36 пар совпадали две. `quantity` терялся отдельно —
 * маршрут видео умножает списание на секунды, а возвращал за одну.
 */
async function refundMiniAppUser(
  tid: string | undefined,
  op: string,
  quantity = 1,
  modelId?: string
): Promise<void> {
  if (!tid) return
  try {
    await refundByTid(getPool() as never, tid, op, quantity, modelId)
  } catch (e) {
    console.error('[токены] возврат не прошёл:', e)
  }
}

/** Кэш RSS-блога t27.ai для GET /api/blog (см. обработчик ниже). */
let blogCache: { at: number; data: unknown } | null = null

// Clean up old jobs after 1 hour
setInterval(() => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000
  for (const [id, job] of renderJobs) {
    if (job.startedAt.getTime() < oneHourAgo) {
      renderJobs.delete(id)
    }
  }
}, 60 * 1000)

// Resolve media path to absolute file path
function resolveMediaPath(mediaPath: string): string {
  if (mediaPath.startsWith('http://') || mediaPath.startsWith('https://')) {
    return mediaPath // Remote URL, can't process locally
  }
  if (mediaPath.startsWith('/') && !mediaPath.startsWith('//')) {
    return path.join(process.cwd(), 'public', mediaPath)
  }
  return mediaPath
}

// Start render asynchronously and return immediately
function startRenderAsync(
  req: RenderRequest,
  onFailure?: () => Promise<void>
): string {
  const renderId = randomUUID()

  // Create job entry with userInfo for notifications
  renderJobs.set(renderId, {
    id: renderId,
    status: 'pending',
    progress: 0,
    startedAt: new Date(),
    userInfo: req.userInfo,
    // Store assets and tracks for feed remix
    assets: req.assets,
    tracks: req.tracks,
    inputProps: req.inputProps,
  })

  // Start render in background
  ;(async () => {
    const job = renderJobs.get(renderId)!
    job.status = 'rendering'

    try {
      if (!bundleLocation) {
        throw new Error('Bundle not initialized')
      }

      // Prepare inputProps with auto face detection and dynamic duration
      const inputProps = { ...(req.inputProps || {}) } as Record<
        string,
        unknown
      >
      const fps = 30
      let durationInFrames: number | null = null

      // Log segments if provided (for debugging preview/render sync)
      const segments = inputProps.segments as
        | Array<{
            type: string
            startFrame: number
            durationFrames: number
            bRollUrl?: string
          }>
        | undefined
      if (segments && segments.length > 0) {
        console.log(`📊 Received ${segments.length} segments from editor:`)
        segments.forEach((seg, i) => {
          console.log(
            `   [${i}] ${seg.type} @ frame ${seg.startFrame}, duration ${seg.durationFrames}${seg.bRollUrl ? `, bRoll: ${seg.bRollUrl.split('/').pop()}` : ''}`
          )
        })
      } else {
        console.log(
          `⚠️ No segments provided, composition will use default layout`
        )
      }

      // Get lipSyncVideo path for analysis
      let lipSyncVideo = inputProps.lipSyncVideo as string | undefined

      // Pre-download S3 assets for faster rendering (avoids HTTP timeout in Chrome)
      if (lipSyncVideo && lipSyncVideo.includes('/s3/')) {
        console.log(`📥 Pre-downloading lipSyncVideo for render...`)
        lipSyncVideo = await preDownloadS3Asset(lipSyncVideo)
        inputProps.lipSyncVideo = lipSyncVideo
      }

      if (lipSyncVideo) {
        const videoPath = resolveMediaPath(lipSyncVideo)

        if (fs.existsSync(videoPath)) {
          // 1. Get video duration dynamically
          const duration = getVideoDuration(videoPath)
          if (duration > 0) {
            durationInFrames = Math.ceil(duration * fps)
            console.log(
              `📏 Video duration: ${duration.toFixed(2)}s = ${durationInFrames} frames`
            )
          }

          // 2. Auto-load captions if not provided
          const captions = inputProps.captions as unknown[] | undefined
          if (!captions || captions.length === 0) {
            // Try to find captions.json in the same directory
            const videoDir = path.dirname(videoPath)
            const captionsPath = path.join(videoDir, 'captions.json')
            if (fs.existsSync(captionsPath)) {
              try {
                const captionsData = JSON.parse(
                  fs.readFileSync(captionsPath, 'utf-8')
                )
                inputProps.captions = captionsData
                console.log(
                  `📝 Auto-loaded ${captionsData.length} captions from: ${captionsPath}`
                )
              } catch (captionsError) {
                console.warn(
                  `⚠️ Could not load captions from ${captionsPath}:`,
                  captionsError
                )
              }
            }
          }

          // 3. Auto face detection (if not already provided)
          if (
            inputProps.faceOffsetX === undefined ||
            inputProps.faceOffsetY === undefined
          ) {
            console.log(`👤 Auto-detecting face in: ${videoPath}`)
            try {
              const faceBox = await detectFaceInVideo(videoPath)
              if (faceBox) {
                const crop = calculateCropSettings(faceBox, 'portrait')
                inputProps.faceOffsetX = crop.offsetX
                inputProps.faceOffsetY = crop.offsetY
                inputProps.faceScale = crop.scale
                console.log(
                  `✅ Face detected: offsetX=${crop.offsetX.toFixed(1)}, offsetY=${crop.offsetY.toFixed(1)}, scale=${crop.scale.toFixed(2)}`
                )
              } else {
                console.log(`⚠️ No face detected, using defaults`)
                inputProps.faceOffsetX = 0
                inputProps.faceOffsetY = 0
                inputProps.faceScale = 1
              }
            } catch (faceError) {
              /**
               * Тихо ТОЛЬКО когда причина разовая.
               *
               * Если модуль недоступен во всём процессе, это уже объявлено
               * громко и один раз при первом импорте — повторять на каждом
               * ролике незачем. Но само задание обязано унести признак с
               * собой: человек получает ролик и должен узнать, что кадр
               * собран без лица, ОТ НАС, а не по виду результата.
               */
              if (faceCroppingUnavailable()) {
                inputProps.faceCroppingUnavailable = faceCroppingUnavailable()
              } else {
                console.warn(`⚠️ Face detection failed:`, faceError)
              }
              inputProps.faceOffsetX = 0
              inputProps.faceOffsetY = 0
              inputProps.faceScale = 1
            }
          }
        } else {
          console.warn(`⚠️ Video file not found for analysis: ${videoPath}`)
        }
      }

      /*
       * ФОРМА ЗАЯВКИ ПРОВЕРЯЕТСЯ ДО РЕНДЕРА.
       *
       * Схема композиции описана в `SplitTalkingHead.tsx` и до сих пор НИКЕМ
       * не применялась: Remotion сам её не сверяет, а props приходили сюда
       * как есть. Схема была документацией, а не проверкой.
       *
       * Что это стоило, замерено на живом ролике (лента, id 20, 30 секунд).
       * Его `segments` — это `[{url, duration}]` в трёх штуках, а
       * `SegmentSchema` требует `{type, startFrame, durationFrames}`. Ни у
       * одного нет `type`, поэтому `isSplit` ложно, панели не считаются, слой
       * биролла не рисуется — и `lipSyncVideo` растянут на весь кадр все
       * тридцать секунд. Композиция называется «сплит» и сделала не сплит.
       *
       * Отказ ДО рендера, а не картинка не о том: рендер стоит минут и денег,
       * а заявка неверной формы не станет верной ни при каких настройках.
       * Причина называет ПОЛЕ — «неверная форма» заставляет угадывать.
       */
      const проверка = ПРОВЕРЯЕМЫЕ_КОМПОЗИЦИИ[req.compositionId]
      if (проверка) {
        const r = проверка.safeParse(inputProps)
        if (!r.success) {
          const где = r.error.issues
            .slice(0, 4)
            .map(i => `${i.path.join('.') || '(корень)'}: ${i.message}`)
            .join('; ')
          throw new Error(
            `заявка не проходит схему ${req.compositionId}: ${где}`
          )
        }
      }

      const composition = await selectComposition({
        serveUrl: bundleLocation,
        id: req.compositionId,
        inputProps,
        chromiumOptions: {
          enableMultiProcessOnLinux: true,
          disableWebSecurity: true,
          gl: null, // Disable WebGL - no X11/display needed
          headless: true,
          // Флагов Chrome здесь БЫТЬ НЕ МОЖЕТ: ChromiumOptions в Remotion 4.0.388 не
          // знает поля args, и весь список (--no-sandbox, --disable-dev-shm-usage и
          // прочие) молча игнорировался. Он выглядел как защита от нехватки памяти,
          // которой на самом деле не было. Нехватку процессов лечим конкурентностью
          // по доле контейнера — см. containerCpuCount() выше.
        },
        timeoutInMilliseconds: 300000, // 5 minutes for slow video loading
      })

      // Override duration if we detected it from video
      if (durationInFrames && durationInFrames > 0) {
        console.log(
          `📏 Overriding composition duration: ${composition.durationInFrames} → ${durationInFrames}`
        )
        ;(composition as any).durationInFrames = durationInFrames
      }

      if (req.type === 'still') {
        const outputPath = path.join(OUTPUT_DIR, `${renderId}.png`)

        await renderStill({
          composition,
          serveUrl: bundleLocation,
          output: outputPath,
          inputProps,
          frame: req.frame || 0,
          chromiumOptions: {
            enableMultiProcessOnLinux: true,
            disableWebSecurity: true,
            gl: null, // Disable WebGL - no X11/display needed
            headless: true,
            // Флагов Chrome здесь БЫТЬ НЕ МОЖЕТ: ChromiumOptions в Remotion 4.0.388 не
            // знает поля args, и весь список (--no-sandbox, --disable-dev-shm-usage и
            // прочие) молча игнорировался. Он выглядел как защита от нехватки памяти,
            // которой на самом деле не было. Нехватку процессов лечим конкурентностью
            // по доле контейнера — см. containerCpuCount() выше.
          },
          timeoutInMilliseconds: 300000, // 5 minutes for slow video loading
        })

        job.status = 'completed'
        job.progress = 100
        job.outputUrl = `/renders/${renderId}.png`
        return
      }

      // Video render
      const codec = (req.codec || 'h264') as
        | 'h264'
        | 'h265'
        | 'vp8'
        | 'vp9'
        | 'prores'
        | 'gif'
      const ext = codec === 'gif' ? 'gif' : 'mp4'
      const outputPath = path.join(OUTPUT_DIR, `${renderId}.${ext}`)

      await renderMedia({
        composition,
        serveUrl: bundleLocation,
        codec,
        outputLocation: outputPath,
        inputProps,
        concurrency: OPTIMAL_CONCURRENCY,
        audioCodec: 'aac', // AAC is standard for MP4, supported by all players
        audioBitrate: '256k', // High quality audio (Instagram/TikTok re-encode anyway)
        chromiumOptions: {
          enableMultiProcessOnLinux: true,
          disableWebSecurity: true,
          gl: null, // Disable WebGL - no X11/display needed
          headless: true,
          // Флагов Chrome здесь БЫТЬ НЕ МОЖЕТ: ChromiumOptions в Remotion 4.0.388 не
          // знает поля args, и весь список (--no-sandbox, --disable-dev-shm-usage и
          // прочие) молча игнорировался. Он выглядел как защита от нехватки памяти,
          // которой на самом деле не было. Нехватку процессов лечим конкурентностью
          // по доле контейнера — см. containerCpuCount() выше.
        },
        timeoutInMilliseconds: 300000, // 5 minutes for slow video loading
        onProgress: ({ progress }) => {
          const percent = Math.round(progress * 100)
          job.progress = percent
          console.log(`🎬 Render ${renderId}: ${percent}%`)
        },
      })

      job.status = 'completed'
      job.progress = 100
      job.outputUrl = `/renders/${renderId}.${ext}`
      console.log(`✅ Render ${renderId} completed: ${job.outputUrl}`)

      // Upload to S3, convert to HLS, and send Telegram notification
      // Объявлено ДО try: запасная ветка публикации ниже находится после
      // catch, то есть вне этого блока. Пока объявление было внутри try,
      // та ветка падала с ReferenceError — а срабатывает она ровно тогда,
      // когда S3 недоступен, то есть в момент, когда запасной путь и нужен.
      const userInfo = job.userInfo
      try {
        const videoBuffer = fs.readFileSync(outputPath)
        const uploadResult = await uploadToS3(
          videoBuffer,
          `render-${renderId}.${ext}`,
          ext === 'gif' ? 'image/gif' : 'video/mp4'
        )

        if (uploadResult.success && uploadResult.signedUrl) {
          job.publicUrl = uploadResult.signedUrl
          console.log(`📤 Uploaded MP4 to S3 with signed URL`)

          // Convert to HLS for smooth streaming (skip for GIFs)
          if (ext !== 'gif') {
            console.log(
              `🎬 [HLS] Starting automatic HLS conversion for ${renderId}...`
            )
            const hlsResult = await convertToHLSAndUploadToTigris(
              outputPath,
              renderId,
              ['480p', '720p']
            )

            if (hlsResult.success && hlsResult.hlsUrl) {
              ;(job as any).hlsUrl = hlsResult.hlsUrl
              ;(job as any).hlsRenditions = hlsResult.renditions
              console.log(
                `✅ [HLS] Auto-conversion complete: ${hlsResult.hlsUrl}`
              )
            } else {
              console.warn(
                `⚠️ [HLS] Auto-conversion failed, MP4 still available`
              )
            }
          }

          // Send Telegram notification with video
          const renderTimeMs = Date.now() - job.startedAt.getTime()
          const renderTimeSec = Math.round(renderTimeMs / 1000)

          const hlsInfo = (job as any).hlsUrl ? `\n🎬 HLS: ✅` : ''
          const caption = userInfo
            ? `✅ <b>Рендер готов!</b>\n\n👤 ${userInfo.first_name || 'Unknown'} (@${userInfo.username || 'нет'})\n📹 ${userInfo.project_name || 'Untitled'}\n⏱ ${renderTimeSec}s${hlsInfo}`
            : `✅ <b>Рендер готов!</b>\n\n⏱ ${renderTimeSec}s${hlsInfo}`

          await sendTelegramVideo(
            TELEGRAM_RENDERS_GROUP,
            uploadResult.signedUrl,
            caption
          )
          console.log(`📱 Telegram notification sent for render ${renderId}`)

          // Auto-publish to community feed
          if (userInfo && userInfo.telegram_id) {
            await publishToFeed({
              telegramId: userInfo.telegram_id,
              creatorName:
                userInfo.first_name || userInfo.username || 'Anonymous',
              projectName: userInfo.project_name || 'Vibee Reel',
              videoUrl: uploadResult.signedUrl,
              templateSettings: job.inputProps || {},
              assets: job.assets || [],
              tracks: job.tracks || [],
            })
          } else {
            console.warn(
              `⚠️ [Feed] Skipping publish - no user info for render ${renderId}`
            )
          }
        }
      } catch (uploadError) {
        console.error(
          `⚠️ S3 upload or notification failed for ${renderId}:`,
          uploadError
        )
        // Don't fail the render if upload/notification fails
      }

      // Fallback: auto-publish with render-server URL if S3 failed
      if (!job.publicUrl && userInfo && userInfo.telegram_id) {
        try {
          const fallbackUrl = `${SERVICE_ENDPOINTS.remotion}/renders/${renderId}.${ext}`
          console.log(
            `📢 [Feed] Publishing with fallback URL (S3 unavailable): ${fallbackUrl}`
          )
          await publishToFeed({
            telegramId: userInfo.telegram_id,
            creatorName:
              userInfo.first_name || userInfo.username || 'Anonymous',
            projectName: userInfo.project_name || 'Vibee Reel',
            videoUrl: fallbackUrl,
            templateSettings: job.inputProps || {},
            assets: job.assets || [],
            tracks: job.tracks || [],
          })
        } catch (feedError) {
          console.error(
            `⚠️ [Feed] Fallback publish failed for ${renderId}:`,
            feedError
          )
        }
      }
    } catch (error) {
      console.error(`❌ Render ${renderId} failed:`, error)
      job.status = 'failed'
      job.error = error instanceof Error ? error.message : 'Unknown error'
      await onFailure?.()
    }
  })()

  return renderId
}

/**
 * A path safe to write into the log, which is NOT the same as the path.
 *
 * The cashier's webhook carries its secret in the PATH -- that secret is the
 * whole guard: past it, the body is trusted and `invoice_payload` credits stars
 * as the single source of truth. The request logger ran before any auth and
 * printed the path verbatim, so every pre-checkout and every successful payment
 * wrote STARS_WEBHOOK_SECRET into stdout. Anyone able to read the service log
 * could then POST a forged successful_payment with any amount, any telegram_id
 * and a charge id of their choosing -- the idempotency key comes from the same
 * body -- and mint tokens for as long as they liked.
 *
 * Stripping the query is not enough, because this secret is not in the query.
 *
 * The mask is deliberately NARROW rather than "hide anything long": that is the
 * only route in this file that puts a secret in the path (grep for a comparison
 * of a path segment against a *_SECRET), and a broad redactor would quietly
 * blind the log to real paths, which is its own kind of harm.
 */
export function redactedForLog(url: string | undefined): string {
  const path = (url || '/').split('?')[0]
  return path.replace(
    /^(\/api\/telegram\/stars-wh\/).+$/,
    '$1<secret-redacted>'
  )
}

// Simple HTTP server
const server = createServer(async (req, res) => {
  // Log all requests
  const requestPath = redactedForLog(req.url)
  console.log(`📥 ${req.method} ${requestPath}`)

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS'
  )
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Filename, X-Api-Key, X-Agent-Key, X-Telegram-Init-Data'
  )

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  // Аутентификация. До этого сервис не проверял ничего: любой мог залить 100 МБ
  // в бакет и запускать рендеры, тратящие кредиты FAL / ElevenLabs / xAI.
  // Подробности механизмов — в ./auth.ts.
  const auth = authenticate(req)
  if (auth.wouldReject) {
    console.warn(
      `🔒 [auth] ${auth.allowed ? 'ПРОПУЩЕНО (режим warn)' : 'ОТКАЗ'} ${req.method} ${requestPath} — ${auth.reason}`
    )
  }
  if (!auth.allowed) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        error: 'unauthorized',
        detail: auth.reason,
        hint: 'send X-Api-Key (server to server) or X-Telegram-Init-Data (Mini App)',
      })
    )
    return
  }

  // Health check
  /**
   * GET /api/providers — что из платного работает ПРЯМО СЕЙЧАС.
   *
   * ЗАЧЕМ. Обход провайдеров 2026-08-26 показал: у FAL кончился баланс
   * («User is locked. Reason: Exhausted balance»), ключ ElevenLabs хранит
   * идентификатор вместо ключа, ключ OpenAI отвергается. Две платные функции
   * из четырёх не работали, а продукт об этом не сообщал НИЧЕГО: агент
   * по-прежнему называл цены за услуги, которых не оказывает, и человек
   * узнавал правду, только потратив токены.
   *
   * Ключ бывает валиден по форме и мёртв по балансу — из кода этого не
   * видно, ни одна сборка и ни один тест такого не поймают. Отвечает на это
   * только живой запрос, и вот он.
   *
   * КЭШ НА МИНУТУ. Проверка ходит к пяти чужим сервисам; без кэша любой
   * опрос страницы превращался бы в пять внешних запросов. Минуты хватает,
   * чтобы увидеть починку почти сразу и не устроить чужим API поток.
   */
  if (req.url?.split('?')[0] === '/api/providers' && req.method === 'GET') {
    const now = Date.now()
    if (providersCache && now - providersCache.at < 60_000) {
      sendJson(res, 200, { ...providersCache.data, изКэша: true })
      return
    }
    // Проверки идут ПАРАЛЛЕЛЬНО и с коротким таймаутом: пять
    // последовательных запросов к чужим сервисам — это секунды ожидания на
    // ровном месте, а страница здоровья должна отвечать быстро.
    const ping = async (
      name: string,
      run: () => Promise<{ ok: boolean; детали: string }>
    ) => {
      try {
        const r = await Promise.race([
          run(),
          new Promise<{ ok: boolean; детали: string }>((_, rej) =>
            setTimeout(() => rej(new Error('таймаут 8с')), 8000)
          ),
        ])
        return { провайдер: name, ...r }
      } catch (e) {
        return {
          провайдер: name,
          ok: false,
          детали: e instanceof Error ? e.message : String(e),
        }
      }
    }
    const head = async (url: string, headers: Record<string, string>) => {
      const r = await fetch(url, { headers })
      // Тело — вместе с кодом: именно в нём чужой сервис объясняет причину.
      const body = r.ok ? '' : (await r.text().catch(() => '')).slice(0, 200)
      return {
        ok: r.ok,
        детали: r.ok ? `HTTP ${r.status}` : `HTTP ${r.status} ${body}`,
      }
    }
    const key = (n: string) => process.env[n] || ''
    const результаты = await Promise.all([
      ping('FAL — картинки', async () => {
        if (!key('FAL_KEY')) return { ok: false, детали: 'FAL_KEY не задан' }
        const r = await fetch('https://queue.fal.run/fal-ai/flux/schnell', {
          method: 'POST',
          headers: {
            Authorization: `Key ${key('FAL_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ prompt: 'ping' }),
        })
        const body = (await r.text().catch(() => '')).slice(0, 200)
        return { ok: r.ok, детали: `HTTP ${r.status} ${r.ok ? '' : body}` }
      }),
      ping('ElevenLabs — озвучка', async () => {
        const k = key('ELEVENLABS_API_KEY')
        if (!k) return { ok: false, детали: 'ELEVENLABS_API_KEY не задан' }
        if (!k.startsWith('sk_')) {
          return {
            ok: false,
            детали:
              'в переменной идентификатор ключа, а не ключ: настоящий начинается с «sk_»',
          }
        }
        return head('https://api.elevenlabs.io/v1/voices', { 'xi-api-key': k })
      }),
      ping('Replicate', async () =>
        key('REPLICATE_API_TOKEN')
          ? head('https://api.replicate.com/v1/account', {
              Authorization: `Bearer ${key('REPLICATE_API_TOKEN')}`,
            })
          : { ok: false, детали: 'REPLICATE_API_TOKEN не задан' }
      ),
      ping('Kie.ai — media pipeline', async () => {
        if (!key('KIE_AI_API_KEY')) {
          return { ok: false, детали: 'KIE_AI_API_KEY не задан' } // cyrillic-ok
        }
        const balance = await kieCredits()
        return balance == null
          ? { ok: false, детали: 'credit endpoint не подтвердил доступ' } // cyrillic-ok
          : { ok: true, детали: 'ключ принят; баланс доступен серверу' } // cyrillic-ok
      }),
      // OpenAI НЕ обязателен: агент работает на z.ai, запасной путь — тоже
      // z.ai лёгкой моделью. Отчёт про OpenAI остаётся, но его отказ не
      // означает, что что-то сломано, — поэтому он помечен как
      // необязательный и не учитывается в счётчике «работает N из M».
      ping('OpenAI (не обязателен)', async () =>
        key('OPENAI_API_KEY')
          ? head('https://api.openai.com/v1/models?limit=1', {
              Authorization: `Bearer ${key('OPENAI_API_KEY')}`,
            })
          : { ok: false, детали: 'не задан — и не нужен, агент на z.ai' }
      ),
      ping('GLM — агент', async () =>
        key('GLM_API_KEY')
          ? head('https://api.z.ai/api/coding/paas/v4/models', {
              Authorization: `Bearer ${key('GLM_API_KEY')}`,
            })
          : { ok: false, детали: 'GLM_API_KEY не задан' }
      ),
    ])
    // Счётчик считает только ОБЯЗАТЕЛЬНЫХ: иначе «работает 2 из 5» пугало бы
    // отказом того, на кого продукт не опирается.
    const обязательные = результаты.filter(
      r => !r.провайдер.includes('не обязателен')
    )
    const data = {
      проверено: new Date().toISOString(),
      работает: обязательные.filter(r => r.ok).length,
      всего: обязательные.length,
      провайдеры: результаты,
    }
    providersCache = { at: now, data }
    sendJson(res, 200, data)
    return
  }

  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        status: 'ok',
        bundleReady: !!bundleLocation,
        // Из каких исходников этот экземпляр рисует. Разошёлся с репозиторием
        // — крутится не тот образ, сколько бы деплой ни рапортовал SUCCESS.
        compositions: compositionsFingerprint,
        /**
         * Коммит, из которого собран этот экземпляр.
         *
         * ЗАЧЕМ. Рендер-сервис не разворачивался семнадцать минут, и заметил
         * я это случайно — ждал свой маршрут и не дождался. Всё влитое после
         * поломки лежало на main и не существовало для людей, а снаружи
         * отличить «выложено» от «зелёный мерж» было НЕЧЕМ.
         *
         * Railway кладёт коммит в RAILWAY_GIT_COMMIT_SHA. Если его нет —
         * говорим `unknown`, а не молчим: проверяющий должен видеть разницу
         * между «отстали» и «нечем сверить».
         */
        version: (process.env.RAILWAY_GIT_COMMIT_SHA || 'unknown').slice(0, 7),
        /**
         * Which enforcement mode the guard is actually in.
         *
         * WHY. `mode()` defaults to 'warn' when RENDER_AUTH_MODE is unset
         * (auth.ts:31), so a missing variable makes the global guard permissive
         * — and until now that fact appeared in exactly one place: a line
         * printed to the server log at startup. From outside the process there
         * was no way to tell an enforcing deployment from a fail-open one, so
         * #902 could not even be measured, let alone fixed with evidence.
         *
         * No secret is exposed: this is the mode name, never the key. The value
         * does become uninteresting once production is fail-closed by
         * construction — which is what #902 asks for, and what this field makes
         * checkable from the outside.
         */
        authMode: authMode(),
        startedAt: startedAtIso,
      })
    )
    return
  }

  // Notify: New lead (user login)
  if (req.url === '/api/notify/lead' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => {
      body += chunk
    })
    req.on('end', async () => {
      try {
        const { telegram_id, username, first_name } = JSON.parse(body)
        const message = `🐝 <b>Новый пользователь VIBEE!</b>\n\n👤 ${first_name || 'Unknown'}\n📱 @${username || 'нет'}\n🆔 ${telegram_id}`
        await sendTelegramMessage(TELEGRAM_OWNER_ID, message)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch (error) {
        console.error('Lead notification error:', error)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({ ok: false, error: 'Failed to send notification' })
        )
      }
    })
    return
  }

  // Notify: Render started
  if (req.url === '/api/notify/render-start' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => {
      body += chunk
    })
    req.on('end', async () => {
      try {
        const { telegram_id, username, first_name, project_name } =
          JSON.parse(body)
        const message = `🎬 <b>Рендер запущен</b>\n\n👤 ${first_name || 'Unknown'} (@${username || 'нет'})\n🆔 ${telegram_id}\n📹 ${project_name || 'Untitled'}`
        await sendTelegramMessage(TELEGRAM_RENDERS_GROUP, message)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch (error) {
        console.error('Render start notification error:', error)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({ ok: false, error: 'Failed to send notification' })
        )
      }
    })
    return
  }

  // ==============================================
  // AI Generation Endpoints
  // ==============================================
  const MCP_URL = process.env.MCP_URL || SERVICE_ENDPOINTS.mcp
  const FAL_KEY = process.env.FAL_KEY

  /**
   * Fallback-генерация картинки через Replicate (flux-schnell).
   *
   * Основной путь — FAL, но его баланс кончается в самый неподходящий
   * момент, а агенту нельзя отвечать «производство недоступно», когда в
   * окружении лежит живой ключ Replicate. Prefer: wait держит запрос до
   * готовности — flux-schnell отдаёт картинку за секунды, отдельная
   * очередь не нужна.
   */
  async function generateImageViaReplicate(
    prompt: string,
    aspectRatio: string
  ): Promise<string> {
    const REPLICATE_TOKEN =
      process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY
    if (!REPLICATE_TOKEN) throw new Error('REPLICATE token not configured')

    const response = await fetch(
      'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${REPLICATE_TOKEN}`,
          Prefer: 'wait',
        },
        body: JSON.stringify({
          input: { prompt, aspect_ratio: aspectRatio, output_format: 'jpg' },
        }),
      }
    )
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Replicate failed: ${response.status} - ${text}`)
    }
    let data = await response.json()
    // Prefer: wait не гарантирует готовность: официальный модельный эндпоинт
    // может ответить «processing» раньше, чем flux соберёт картинку. Дожидаемся
    // сами, опрашивая предсказание.
    let predictionUrl: string | null = data?.urls?.get ?? null
    const deadline = Date.now() + 180_000
    while (
      predictionUrl &&
      data.output == null &&
      !data.error &&
      Date.now() < deadline
    ) {
      await new Promise(r => setTimeout(r, 2500))
      const poll = await fetch(predictionUrl, {
        headers: { Authorization: `Bearer ${REPLICATE_TOKEN}` },
      })
      if (!poll.ok) break
      data = await poll.json()
    }
    const output = data.output
    const url = Array.isArray(output) ? output[0] : output
    if (typeof url !== 'string') {
      throw new Error('Replicate did not return an image URL')
    }
    return url
  }

  /**
   * TTS via Replicate when ElevenLabs is unavailable (the key stored in the env
   * var is an identifier, not an sk_ key). minimax/speech-02-turbo is
   * multilingual (Russian included) and Replicate is paid. Returns an audio
   * URL; the caller downloads it and puts it in S3 like the ElevenLabs path, so
   * the link does not expire.
   */
  async function generateAudioViaReplicate(
    text: string,
    /**
     * ВЫБОР ЧЕЛОВЕКА ДОХОДИТ ДО ТОГО, КТО ОЗВУЧИВАЕТ.
     *
     * Функция принимала ОДИН текст, а голос и скорость с экрана оставались в
     * теле запроса к маршруту и дальше не шли. Эта нога — та, что реально
     * отдаёт mp3 (ElevenLabs недоступен: ключ в переменной хранит не ключ, а
     * его идентификатор), поэтому выбор голоса не значил ничего: три попытки
     * разными голосами стоили трижды и давали один и тот же файл.
     */
    выбор: { voice?: unknown; speed?: unknown } = {}
  ): Promise<string> {
    const REPLICATE_TOKEN =
      process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY
    if (!REPLICATE_TOKEN) throw new Error('REPLICATE token not configured')
    const response = await fetch(
      'https://api.replicate.com/v1/models/minimax/speech-02-turbo/predictions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${REPLICATE_TOKEN}`,
        },
        body: JSON.stringify({ input: входМиниМакс(text, выбор) }),
      }
    )
    if (!response.ok) {
      throw new Error(
        `Replicate TTS failed: ${response.status} - ${await response.text()}`
      )
    }
    let data = await response.json()
    const predictionUrl: string | null = data?.urls?.get ?? null
    const deadline = Date.now() + 120_000
    while (
      predictionUrl &&
      data.output == null &&
      !data.error &&
      Date.now() < deadline
    ) {
      await new Promise(r => setTimeout(r, 2000))
      const poll = await fetch(predictionUrl, {
        headers: { Authorization: `Bearer ${REPLICATE_TOKEN}` },
      })
      if (!poll.ok) break
      data = await poll.json()
    }
    if (data.error) {
      throw new Error(
        `Replicate TTS error: ${String(data.error).slice(0, 120)}`
      )
    }
    let out = Array.isArray(data.output) ? data.output[0] : data.output
    if (out && typeof out === 'object') {
      out = out.audio || out.audio_url || out.url
    }
    if (typeof out !== 'string') {
      throw new Error('Replicate did not return an audio URL')
    }
    return out
  }

  /**
   * Third leg of the poster chain: Kie, the only provider with a funded
   * balance (FAL answers 403 "Exhausted balance", measured 2026-08-31).
   *
   * Third and not first on purpose. Replicate flux-schnell costs about $0.003
   * an image against Kie's 4 credits ($0.02), and those credits are the same
   * purse that pays for talking heads at 18 credits a second -- one poster is
   * a fifth of a second of face. Kie is here because it is the leg that is
   * KNOWN funded when the cheaper two are not, not because it is the one to
   * reach for first.
   */
  async function generateImageViaKie(
    prompt: string,
    aspectRatio: string
  ): Promise<string> {
    const r = await kieGenerateImage({ prompt, aspectRatio })
    if (!r.ok) throw new Error(`Kie: ${r.reason}`)
    return r.url
  }

  // Supported fal.ai image models
  const FAL_IMAGE_MODELS: Record<string, string> = {
    'fal-ai/flux-pro/v1.1-ultra': 'fal-ai/flux-pro/v1.1-ultra',
    'fal-ai/flux/dev': 'fal-ai/flux/dev',
    'fal-ai/nano-banana-pro': 'fal-ai/nano-banana-pro',
    'fal-ai/reve/text-to-image': 'fal-ai/reve/text-to-image',
  }

  /**
   * FAL, start to finish, as ONE function that either returns a URL or throws.
   *
   * Before this it was inlined in the route, and the shape of that inlining is
   * what made the chain a lie: only a SUBMIT-time rejection reached the
   * fallback. Once FAL accepted the job, a FAILED status or an exhausted poll
   * threw straight past every other provider into the 500. A restored but
   * flaky FAL balance would therefore have been WORSE than today's hard 403,
   * because a 403 at least happens at submit time. As a function that throws,
   * every one of its failures is just another entry in `tried`.
   */
  async function generateImageViaFal(
    prompt: string,
    aspectRatio: string,
    modelEndpoint: string
  ): Promise<string> {
    if (!FAL_KEY) throw new Error('FAL_KEY not configured')

    const submitResponse = await fetch(
      `https://queue.fal.run/${modelEndpoint}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Key ${FAL_KEY}`,
        },
        body: JSON.stringify({
          prompt,
          aspect_ratio: aspectRatio,
          num_images: 1,
        }),
      }
    ).catch(e => {
      throw new Error(`FAL unreachable: ${String(e)}`)
    })

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text()
      throw new Error(
        `FAL submit failed: ${submitResponse.status} - ${errorText.slice(0, 300)}`
      )
    }

    const submitResult = await submitResponse.json()
    const requestId = submitResult.request_id

    if (!requestId) {
      // Synchronous response - image is already ready
      const imageUrl = submitResult.images?.[0]?.url || submitResult.image?.url
      if (typeof imageUrl === 'string') return imageUrl
      throw new Error('No image URL in response')
    }

    console.log(`📷 [Generate] FAL request submitted: ${requestId}`)

    // Poll for completion (async queue mode). Max 6 minutes (120 * 3s).
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 3000))

      const statusResponse = await fetch(
        `https://queue.fal.run/${modelEndpoint}/requests/${requestId}/status`,
        { headers: { Authorization: `Key ${FAL_KEY}` } }
      )
      if (!statusResponse.ok) continue
      const statusData = await statusResponse.json()
      const status = statusData.status
      console.log(`📷 [Generate] FAL status: ${status}`)

      if (status === 'COMPLETED') {
        const resultResponse = await fetch(
          `https://queue.fal.run/${modelEndpoint}/requests/${requestId}`,
          { headers: { Authorization: `Key ${FAL_KEY}` } }
        )
        if (!resultResponse.ok) {
          throw new Error(`FAL result unreadable: ${resultResponse.status}`)
        }
        const resultData = await resultResponse.json()
        const imageUrl = resultData.images?.[0]?.url || resultData.image?.url
        if (typeof imageUrl === 'string') return imageUrl
        throw new Error('FAL completed without an image URL')
      }
      if (status === 'FAILED') {
        throw new Error(
          'FAL generation failed: ' + (statusData.error || 'Unknown error')
        )
      }
    }
    throw new Error('Image generation timeout')
  }

  // POST /api/generate/image - ordered provider chain, see the handler body
  if (req.url === '/api/generate/image' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => {
      body += chunk
    })
    req.on('end', async () => {
      // Declared BEFORE the try: the refund in catch must know whether we
      // charged, and a const inside the try is not visible there.
      let billedTid: string | undefined
      // Модель нужна ВОЗВРАТУ: он считает ту же цену, что списание,
      // а `model` объявлена внутри try и из catch не видна.
      let requestedModel: string | undefined
      // What the charge took and left. Spread into EVERY success body below:
      // whichever provider ends up delivering, the person is told the price of
      // the thing they just received.
      let receipt: Receipt = {}
      // Declared BEFORE the try for the same reason billedTid is: the failure
      // body must carry every provider's refusal, and the catch cannot see a
      // const that lives inside the try.
      const tried: { provider: string; error: string }[] = []
      try {
        // No `if (!FAL_KEY) throw` here any more. That line ran BEFORE the two
        // `!FAL_KEY` fallback guards below it, so the whole "no key -> use the
        // other provider" path was unreachable dead code: removing the FAL key
        // to force the fallback produced a 500 and a refund. A missing key is
        // now just the first entry in `tried`.
        const { model, prompt, width, height, image_url } = JSON.parse(body)
        requestedModel = typeof model === 'string' ? model : undefined
        console.log(
          `📷 [Generate] Photo: ${model}, prompt: "${prompt.substring(0, 50)}..."`
        )

        // Charge BEFORE spending the provider's money.
        const billed = await chargeMiniAppUser(req, 'image_generate', 1, model)
        if (!billed.ok) {
          res.writeHead(billed.status, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: billed.reason }))
          return
        }
        billedTid = billed.tid

        /*
         * ЗАДАЧА РЕГИСТРИРУЕТСЯ, ЧТОБЫ ОБРЫВ НЕ СЪЕДАЛ ОПЛАЧЕННОЕ.
         *
         * `startJob` звали только видео и липсинк, а приложение спрашивает
         * оборванный результат для ВСЕХ видов (`API.последнееЗадание`). Для
         * картинки и звука отвечать было нечем: заблокированный телефон или
         * тридцатисекундный потолок прокси терял генерацию, за которую уже
         * заплачено провайдеру — файл существует, деньги потрачены, найти
         * некому.
         *
         * Владельца требуем мягко: нет проверенного владельца — просто не
         * заводим задачу. Жёсткий 401, как у видео, сломал бы вызовы, которые
         * сегодня работают по ключу агента.
         */
        const ownerКартинки = generationOwnerId(req)
        if (ownerКартинки) {
          recordInto(startJob('image', ownerКартинки, typeof prompt === 'string' ? prompt : undefined), res)
        }
        receipt = billed.receipt

        // Convert width/height to aspect ratio. Every value it can emit is in
        // the list google/nano-banana validates against, so the Kie leg needs
        // no mapping layer.
        const getAspectRatio = (w: number, h: number): string => {
          if (w === h) return '1:1'
          if (w > h) return w / h >= 1.7 ? '16:9' : '4:3'
          return h / w >= 1.7 ? '9:16' : '3:4'
        }
        const aspectRatio = getAspectRatio(width || 1024, height || 1024)

        // An explicit provider selection is a contract, not a hint. Do not
        // silently spend money at another provider when Kie rejects it.
        if (typeof model === 'string' && model.startsWith('kie/')) {
          const kieModel = reviewedKieModel('image', model)!
          /*
           * ИСХОДНИК ПЕРЕДАЁТСЯ ПОД ТРЕМЯ ИМЕНАМИ — так его называют разные
           * модели: `image_urls` (seedream, grok), `image_url` (topaz),
           * `image` (recraft). Лишнее не уйдёт: `kieInputFor` берёт из
           * доступного РОВНО поля контракта, остальное отбрасывает.
           *
           * Без этого пять моделей «правки» были в каталоге и не работали
           * никогда: экран честно писал «нужно: фото», а послать его не мог.
           */
          const outcome = await kieGenerateImage({
            prompt,
            aspectRatio,
            model: kieModel,
            imageUrl: typeof image_url === 'string' ? image_url : undefined,
          })
          if (!outcome.ok) throw new Error(outcome.reason)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              success: true,
              url: outcome.url,
              id: outcome.taskId,
              provider: model,
              tried,
              ...receipt,
            })
          )
          return
        }

        // Get model endpoint (default to nano-banana-pro)
        const modelEndpoint =
          FAL_IMAGE_MODELS[model] || 'fal-ai/nano-banana-pro'

        /**
         * THE CHAIN, IN ORDER, EVERY REFUSAL RECORDED.
         *
         * Order is by price among providers verified working on 2026-08-31:
         * FAL first (the account the product is built on, currently 403), then
         * Replicate flux-schnell at about $0.003, then Kie google/nano-banana
         * at 4 credits ($0.02) -- the only purse known to be funded, and the
         * same purse the talking heads spend from at 18 credits a second, which
         * is why the funded one is last and not first.
         *
         * The ordering and the record-keeping live in src/image-chain.ts, and
         * they live there so that image-chain.test.ts can drive them with fake
         * legs. Inlined here they were untestable, and untested is how the
         * fallback came to only ever fire on a submit-time refusal.
         *
         * `tried` ships in the HTTP response, success or failure. A caller that
         * gets a poster has to be able to see it cost the third provider; a
         * caller that gets nothing has to be able to see all three reasons
         * without shell access to the container. The image layer was dead for
         * weeks precisely because its failure existed nowhere a person looked.
         */
        const outcome = await runImageChain(
          [
            {
              name: `fal/${modelEndpoint}`,
              run: () =>
                generateImageViaFal(prompt, aspectRatio, modelEndpoint),
            },
            {
              name: 'replicate/flux-schnell',
              run: () => generateImageViaReplicate(prompt, aspectRatio),
            },
            {
              name: `kie/${KIE_T2I_MODEL}`,
              run: () => generateImageViaKie(prompt, aspectRatio),
            },
          ],
          { log: line => console.warn(`📷 [Generate] ${line}`) }
        )
        tried.push(...outcome.tried)

        if (outcome.ok) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              success: true,
              url: outcome.url,
              id: `${outcome.provider.replace(/\W+/g, '-')}-${Date.now()}`,
              provider: outcome.provider,
              tried,
              ...receipt,
            })
          )
          return
        }

        throw new Error(
          `no image provider delivered: ${tried
            .map(t => `${t.provider} — ${t.error}`)
            .join(' | ')}`
        )
      } catch (error) {
        console.error('❌ [Generate] Image error:', error)
        // Nothing was delivered, so the tokens go back.
        await refundMiniAppUser(billedTid, 'image_generate', 1, requestedModel)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Generation failed',
            tried,
          })
        )
      }
    })
    return
  }

  /**
   * Fallback-видео через Replicate (seedance-1-lite).
   *
   * Прежний путь звал внешний MCP с инструментами ai_kling_create_video —
   * которых не существует ни в одном сервисе проекта: video_generate много
   * месяцев отвечал 500 на любой запрос. Пока у проекта нет собственного
   * видео-MCP, честным путём является Replicate, как у картинок.
   */
  async function generateVideoViaReplicate(
    prompt: string,
    durationSec: number,
    aspectRatio: string
  ): Promise<string> {
    const REPLICATE_TOKEN =
      process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY
    if (!REPLICATE_TOKEN) throw new Error('REPLICATE token not configured')

    const create = await fetch(
      // wan-2.5-t2v-fast стабильно падал E002 на стороне Replicate
      // (проверено прямым curl 24.08); seedance-1-lite принимает те же поля.
      'https://api.replicate.com/v1/models/bytedance/seedance-1-lite/predictions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${REPLICATE_TOKEN}`,
        },
        body: JSON.stringify({
          input: {
            prompt,
            duration: durationSec >= 8 ? 10 : 5,
            aspect_ratio: aspectRatio || '9:16',
            resolution: '720p',
          },
        }),
      }
    )
    if (!create.ok) {
      throw new Error(
        `Replicate video failed: ${create.status} - ${await create.text()}`
      )
    }
    let data = await create.json()
    let predictionUrl: string | null = data?.urls?.get ?? null
    // Видео тяжелее картинки: даём модели до 8 минут.
    const deadline = Date.now() + 480_000
    while (
      predictionUrl &&
      data.output == null &&
      !data.error &&
      data.status !== 'succeeded' &&
      data.status !== 'failed' &&
      Date.now() < deadline
    ) {
      await new Promise(r => setTimeout(r, 5000))
      const poll = await fetch(predictionUrl, {
        headers: { Authorization: `Bearer ${REPLICATE_TOKEN}` },
      })
      if (!poll.ok) break
      data = await poll.json()
    }
    if (data.error)
      throw new Error(`Replicate video: ${String(data.error).slice(0, 200)}`)
    const output = data.output
    const url = Array.isArray(output) ? output[0] : output
    if (typeof url !== 'string') {
      throw new Error(`Replicate video not ready (${data.status || 'timeout'})`)
    }
    // Ссылка replicate.delivery живёт ограниченное время — забираем файл в
    // наше S3, как у картинок: иначе лента через час показывает пустоту.
    try {
      // Санитайзер отсекает не-http(s) и приватные/зацикленные адреса:
      // URL приходит из ответа внешнего API (SSRF-гвард, как у webhook).
      const videoUrl = assertFetchable(url)
      const vid = await fetch(videoUrl)
      if (vid.ok) {
        const bytes = Buffer.from(await vid.arrayBuffer())
        // В наше S3 — напрямую в процессе, без HTTP-вызова самому себе:
        // тот же uploadToS3, что стоит за /upload.
        const up = await uploadToS3(
          bytes,
          `agent-video-${Date.now()}.mp4`,
          'video/mp4'
        )
        if (up.success && up.directUrl) return up.directUrl
      }
    } catch (e) {
      console.warn(
        '🎬 [Generate] S3-перекладка видео не удалась, отдаю прямую ссылку:',
        String(e).slice(0, 120)
      )
    }
    return url
  }

  // POST /api/generate/video - Generate video (MCP Kling/Veo3 → Replicate fallback)
  if (req.url === '/api/generate/video' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => {
      body += chunk
    })
    req.on('end', async () => {
      // Before the try: the refund path in catch must see it.
      let billedTid: string | undefined
      // Before the try for a second reason as well: the Replicate fallback
      // ANSWERS from inside the catch, and that answer is as charged as any
      // other. A `const` next to the charge would leave that one success body
      // silent about the money.
      let receipt: Receipt = {}
      let requestedModel: string | undefined
      // Секунды объявлены СНАРУЖИ try: возврат живёт в catch и без этого
      // отдавал бы одну секунду там, где списал десять.
      let секунды = 1
      // Длина в сетке провайдера — одна на счёт и на заказ.
      let длинаРолика = 6
      try {
        const { model, prompt, duration, aspect_ratio, image_url, video_url } =
          JSON.parse(body)
        requestedModel = typeof model === 'string' ? model : undefined
        console.log(`🎬 [Generate] Video: ${model}, duration: ${duration}`)

        /*
         * СЧИТАЕМ СЕКУНДЫ, ЕСЛИ МОДЕЛЬ ПРОДАЁТСЯ ПО СЕКУНДАМ.
         *
         * Здесь стояла единица для ВСЕХ видеомоделей, а восемь из двенадцати
         * тарифицируются посекундно: `kling/v3-turbo` стоит $0.09 в секунду,
         * и десятисекундный ролик обходится в $0.90 при списании 36 токенов.
         * Каждое такое видео было убытком, и тем большим, чем длиннее.
         *
         * Признак берётся из единицы цены KieAI, а не из списка видов: внутри
         * «видео» единицы РАЗНЫЕ (8 «за секунду», 4 «за ролик»), поэтому
         * пометка на виде не может быть верной в принципе.
         */
        /*
         * ОДНА ДЛИНА И ДЛЯ СЧЁТА, И ДЛЯ ЗАКАЗА. `duration` читался дважды и
         * по-разному: счёт брал сырое значение, провайдеру уходила сетка
         * 6/10. Без `duration` списывали секунду и покупали шесть.
         */
        длинаРолика = секундыКОплате(duration) <= 6 ? 6 : 10
        /*
         * Посекундно — только когда длину задаём МЫ. У четырёх видеомоделей
         * контракт просит один `prompt`: длительность до провайдера не
         * доходит, и умножать счёт на неё значит брать за незаказанное.
         */
        const контракт = KIE_MODELS.find(
          (м: { id: string; needs?: string[] }) =>
            м.id === String(model ?? '').replace(/^kie\//, '')
        )?.needs
        /*
         * ДВА РАЗНЫХ СЛУЧАЯ, КОТОРЫЕ ЗДЕСЬ БЫЛИ ОДНИМ.
         *
         * Длину задаёт человек (`duration` в контракте) — умножаем на чип: то
         * же число уходит провайдеру, счёт совпадает с заказом.
         *
         * Длину задаёт присланный ФАЙЛ (`video_url`) — чип до провайдера не
         * доходит вовсе, и умножать на него значит брать за то, чего никто не
         * заказывал: один и тот же ролик стоил 96 или 160 токенов от
         * положения переключателя. При этом KieAI считает нам НАСТОЯЩУЮ длину
         * — выше минуты это убыток без предела.
         *
         * Замер, как на липсинке: скачиваем с ограничением, спрашиваем
         * ffprobe, ставим потолок. Замер идёт ДО списания — иначе неудачный
         * замер оставил бы списанные деньги без работы.
         */
        if (посекунднаяМодель(model) && длинуЗадаётФайл(контракт)) {
          const источник =
            typeof video_url === 'string' && video_url
              ? video_url
              : typeof image_url === 'string'
                ? image_url
                : ''
          if (!источник) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                success: false,
                error: 'video_url is required for this model',
              })
            )
            return
          }
          const измерено = await measuredRemoteDuration(источник)
          if (измерено > MAX_UPSCALE_SECONDS) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                success: false,
                error: `video must be ${MAX_UPSCALE_SECONDS} seconds or shorter`,
              })
            )
            return
          }
          секунды = Math.ceil(измерено)
        } else {
          секунды =
            посекунднаяМодель(model) && длинуЗадаётЧеловек(контракт)
              ? длинаРолика
              : 1
        }

        // Charge BEFORE spending the provider's money.
        const billed = await chargeMiniAppUser(
          req,
          'video_generate',
          секунды,
          model
        )
        if (!billed.ok) {
          res.writeHead(billed.status, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: billed.reason }))
          return
        }
        billedTid = billed.tid
        receipt = billed.receipt

        /**
         * Record the job BEFORE the provider is called.
         *
         * Measured on production: this route answers after ~54 seconds, in a
         * single synchronous response, and the client waits in one fetch with
         * no timeout. A phone locking or a proxy's 30-second cap loses a
         * generation already paid for at the provider — the file exists, the
         * money is spent, and nobody can find it.
         *
         * The id is minted first so the answer has somewhere to land even if
         * the caller is gone by the time it arrives.
         */
        const jobOwner = generationOwnerId(req)
        if (!jobOwner) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({ success: false, error: 'verified owner required' })
          )
          return
        }
        const job = startJob('video', jobOwner, prompt)
        recordInto(job, res)

        if (typeof model === 'string' && model.startsWith('kie/')) {
          const kieModel = reviewedKieModel('video', model)!
          const вход = kieInputFor(kieModel, {
            prompt,
            aspect_ratio: aspect_ratio || '9:16',
            mode: 'normal',
            // Та же величина, что оплачена выше.
            duration: String(длинаРолика),
            resolution: РАЗРЕШЕНИЕ_ВИДЕО,
            /*
             * ИСХОДНИК ДЛЯ ВИДЕО. `kling/v2-1-pro` оживляет КАРТИНКУ,
             * `topaz/video-upscale` увеличивает ГОТОВОЕ ВИДЕО — разные файлы
             * под разными именами. Обе модели лежали в каталоге и не работали
             * никогда: экран писал «нужно: фото», а послать его не мог.
             *
             * Пустые значения не подставляем: `kieInputFor` вернёт null, и
             * человек получит честный отказ вместо заявки без обязательного
             * поля.
             */
            ...(typeof image_url === 'string' && image_url
              ? { image_url }
              : {}),
            ...(typeof video_url === 'string' && video_url
              ? { video_url }
              : {}),
          })
          if (!вход) {
            // ЕДИНСТВЕННЫЙ ранний выход ПОСЛЕ списания, который не бросает, —
            // поэтому catch с возвратами сюда не доходил, и деньги оставались
            // у нас за работу, которую даже не начали.
            await refundMiniAppUser(
              billedTid,
              'video_generate',
              секунды,
              requestedModel
            )
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                success: false,
                error: `модель ${kieModel} просит поля, которых у нас нет`,
              })
            )
            return
          }
          const result = await runExplicitKieJob(kieModel, вход)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              success: true,
              url: result.url,
              id: result.taskId,
              provider: model,
              ...receipt,
            })
          )
          return
        }

        // Determine which API to use based on model
        const isKling = model.startsWith('kling')
        const toolName = isKling
          ? 'ai_kling_create_video'
          : 'ai_kie_create_video'
        const mode = model.includes('pro') ? 'pro' : 'std'

        // MCP_URL задаёт оператор (ENV): приватные хосты легальны для
        // сервис-в-сервис топологии, но протокол всё равно только http/https.
        const mcpTarget = assertFetchable(`${MCP_URL}/mcp`, {
          allowPrivate: true,
        })
        const mcpResponse = await fetch(mcpTarget, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: toolName,
              arguments: {
                prompt,
                mode,
                duration: duration.replace('s', ''),
                aspect_ratio,
              },
            },
            id: Date.now(),
          }),
        })

        const mcpResult = await mcpResponse.json()
        if (mcpResult.error) throw new Error(mcpResult.error.message)

        const content = mcpResult.result?.content?.[0]?.text
        if (!content) throw new Error('No result from MCP')

        const data = JSON.parse(content)
        if (!data.success) throw new Error(data.error || 'Generation failed')

        // Poll for result (video generation is async)
        const taskId = data.data?.task_id
        if (taskId) {
          let videoUrl = null
          const pollTool = isKling ? 'ai_kling_get_task' : 'ai_kie_get_task'
          for (let i = 0; i < 100; i++) {
            // Max 5 minutes
            await new Promise(r => setTimeout(r, 3000))
            const statusResp = await fetch(
              assertFetchable(`${MCP_URL}/mcp`, { allowPrivate: true }),
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  method: 'tools/call',
                  params: {
                    name: pollTool,
                    arguments: { task_id: taskId },
                  },
                  id: Date.now(),
                }),
              }
            )
            const statusResult = await statusResp.json()
            const statusContent = statusResult.result?.content?.[0]?.text
            if (statusContent) {
              const statusData = JSON.parse(statusContent)
              if (
                statusData.success &&
                statusData.data?.status === 'completed'
              ) {
                videoUrl =
                  statusData.data.video_url ||
                  statusData.data.works?.[0]?.resource?.resource
                break
              }
            }
          }
          if (videoUrl) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                success: true,
                url: videoUrl,
                id: taskId,
                ...receipt,
              })
            )
            return
          }
        }

        throw new Error('Video generation timeout')
      } catch (error) {
        if (requestedModel?.startsWith('kie/')) {
          console.error('❌ [Generate] Explicit Kie video error:', error)
          // Секунды и модель — те же, что при списании: без них возврат
          // за десятисекундный ролик отдавал одну секунду по цене вида.
          await refundMiniAppUser(
            billedTid,
            'video_generate',
            секунды,
            requestedModel
          )
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              success: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Kie.ai generation failed',
            })
          )
          return
        }
        // MCP-путь исторически ведёт в никуда (см. комментарий у helper).
        // Прежде чем отдать ошибку, пробуем Replicate — как у картинок.
        console.warn(
          '🎬 [Generate] Video MCP недоступен:',
          String(error).slice(0, 140),
          '— включаю Replicate fallback'
        )
        try {
          const b = JSON.parse(body || '{}')
          const videoUrl = await generateVideoViaReplicate(
            String(b.prompt || ''),
            parseInt(String(b.duration || '5'), 10) || 5,
            String(b.aspect_ratio || '9:16')
          )
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              success: true,
              url: videoUrl,
              id: `replicate-${Date.now()}`,
              provider: 'replicate/seedance-1-lite',
              ...receipt,
            })
          )
        } catch (fallbackError) {
          console.error('❌ [Generate] Video error:', fallbackError)
          // Both the primary path and the Replicate fallback failed: nothing
          // was delivered, so the tokens go back.
          // Секунды и модель — те же, что при списании: без них возврат
          // за десятисекундный ролик отдавал одну секунду по цене вида.
          await refundMiniAppUser(
            billedTid,
            'video_generate',
            секунды,
            requestedModel
          )
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              success: false,
              error:
                fallbackError instanceof Error
                  ? fallbackError.message
                  : 'Generation failed',
            })
          )
        }
      }
    })
    return
  }

  /**
   * GET /api/balance — сколько токенов ОСТАЛОСЬ.
   *
   * Такого маршрута не было вовсе, и это не пробел в документации, а дыра в
   * продукте: приложение списывает из `user_tokens`, а прочитать оттуда
   * остаток не могло НИКАК. В Профиле показывались пакеты «10 / 50 / 150» —
   * это ВИТРИНА, цены на покупку, — и человек читал их как свой счёт. Узнать
   * настоящий остаток можно было единственным способом: нажать
   * «Сгенерировать» и получить отказ «нужно 20, есть 16» — то есть уже выбрав
   * модель и дождавшись ответа сервера.
   *
   * Цены отдаём тем же ответом. Клиенту нужно СРАВНИТЬ остаток со стоимостью
   * шага ещё до нажатия; иначе он либо повторит нашу таблицу у себя (два
   * источника одной правды, разъедутся при первой правке), либо снова узнает
   * цену от ошибки.
   *
   * Личность — из подписи initData, не из параметра. `verifiedTelegramId`
   * возвращает id только если подпись сошлась ключом бота, поэтому чужой
   * баланс так не прочитать.
   */
  if (req.url?.split('?')[0] === '/api/balance' && req.method === 'GET') {
    /**
     * ЛИЧНОСТЬ БЕРЁМ ИЗ ЛЮБОГО СПОСОБА, КОТОРЫЙ ЕЁ ЗНАЕТ.
     *
     * Сначала маршрут спрашивал только `verifiedTelegramId` — подпись
     * initData. Для мини-аппа верно, для iOS-приложения бесполезно: оно шлёт
     * `Authorization: Bearer` (сессия) или `X-Agent-Key`, а заголовка с
     * подписью у него нет вовсе. Замер на симуляторе: в Профиле вместо числа
     * вечно крутился индикатор — запрос не мог пройти в принципе.
     *
     * `authenticate()` возвращает `telegramId` и для сессии, и для ключа
     * агента — оба знают, ЧЕЙ это запрос (auth.ts). Подпись остаётся вторым
     * источником, для мини-аппа. Ключ сервера безличен и сюда не подходит:
     * без личности отдавать нечего.
     */
    const auth = authenticate(req)
    const tid = auth.telegramId || verifiedTelegramId(req)
    if (!tid) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          success: false,
          error: 'no identity: need a session, an agent key or signed initData',
        })
      )
      return
    }
    try {
      const pool = getPool()
      const r = await pool.query(
        `SELECT balance FROM user_tokens WHERE telegram_id = $1`,
        [tid]
      )
      // Нет строки — это НОЛЬ, а не ошибка: строка заводится при первом
      // списании (ensureRow), и до него человек просто ещё ничего не тратил.
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          success: true,
          balance: Number(r.rows[0]?.balance ?? 0),
          prices: TOKEN_PRICES,
          /**
           * Цены ПО МОДЕЛЯМ — то, что списывают на самом деле.
           *
           * `prices` выше — по ВИДУ работы, а `chargeMiniAppUser` берёт цену
           * выбранной модели и только при её отсутствии падает на вид. Клиент
           * же называл сумму по виду, и расхождение замерено:
           *   картинка 1 против 8, липсинк 3 против 6 — отказ ПОСЛЕ нажатия;
           *   видео   20 против 5 — запрет того, что человеку по карману.
           */
          modelPrices: модельныеЦены(),
          /**
           * Какие МОДЕЛИ считаются посекундно. `perSecond` ниже помечает виды
           * работы, и для видео такая пометка невозможна: половина моделей
           * вида берёт за секунду, половина за ролик.
           */
          perSecondModels: посекундныеМодели(),
          /**
           * Какие из них считаются ПО ЗАМЕРУ присланного файла. Точной суммы
           * до нажатия здесь не знает никто — длину задаёт файл, — и клиент
           * обязан назвать цену секунды, а не выдуманный итог. Без этого
           * приложение множило цену на чип длительности, который до
           * провайдера не доходит.
           */
          perSecondFromFile: посекундныеПоФайлу(),
          /**
           * Какие поля модель ДЕЙСТВИТЕЛЬНО получит. Экран показывает чип
           * только под то, что доедет: у десяти видеомоделей из двенадцати
           * контракт — один `prompt`, а «Длительность» и «Кадр» предлагались
           * всем подряд и не меняли ничего.
           */
          modelFields: поляМоделей(),
          /**
           * Какие модели считаются ЗА ТЫСЯЧУ ЗНАКОВ. Сервер уже так и
           * списывает, а экран об этом молчал: человек узнавал сумму только
           * из чека, потому что цена растёт с длиной текста, а подпись
           * обещала одно число.
           */
          perThousandCharsModels: познаковыеМодели(),
          /**
           * ОСВОБОЖДЁН ЛИ ЭТОТ КОШЕЛЁК ОТ СПИСАНИЯ.
           *
           * С владельца (ADMIN_IDS) не списывают — `chargeMiniAppUser`
           * возвращает «списано: 0» и в базу не пишет. А приложение сверяло
           * остаток с ценой и гасило кнопку: единственный счёт, с которого
           * НИКОГДА не берут, оказался единственным, кому запрещали работать.
           *
           * Признак приходит с сервера, а не выводится приложением из своего
           * списка: второй список админов разошёлся бы с первым молча.
           */
          exempt: владелец(tid),
          // Какие из этих цен — за секунду. Без этого клиент держит свой
          // список и расходится с нами молча.
          perSecond: PER_SECOND_OPS,
        })
      )
    } catch (e) {
      console.error('❌ /api/balance:', e)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: 'balance unavailable' }))
    }
    return
  }

  /**
   * POST /api/feed/backfill-thumbnails — обложки для УЖЕ опубликованных роликов.
   *
   * `thumbnail_url` перестал быть жёстким `null` при публикации, но это лечит
   * только БУДУЩИЕ ролики. Двадцать уже опубликованных остаются чёрными
   * карточками навсегда — а именно их человек и видит у себя в профиле.
   * Правка, которая не касается существующих данных, для владельца этих данных
   * выглядит как отсутствие правки.
   *
   * ПРЕДЕЛ НА ВЫЗОВ. Каждая обложка — это скачивание ролика и прогон ffmpeg;
   * пустить их все одним запросом значит связать процесс на минуты и словить
   * тот же обрыв соединения, что и у липсинка. Двадцать за раз, повторный
   * вызов продолжает с того места — операция идемпотентна по построению,
   * потому что берёт только строки С ПУСТОЙ обложкой.
   *
   * ТОЛЬКО ВЛАДЕЛЕЦ. Это массовая правка чужих записей и трата процессорного
   * времени; личность берётся из подписи или сессии, а список — из `ADMIN_IDS`,
   * той же переменной, что решает вопрос оплаты.
   */
  if (req.url?.split('?')[0] === '/api/feed/backfill-thumbnails' && req.method === 'POST') {
    const кто = generationOwnerId(req)
    if (!кто || !владелец(кто)) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: 'owners only' }))
      return
    }
    try {
      const pool = getPool()
      const строки = await pool.query(
        `SELECT id, video_url FROM public_templates
          WHERE (thumbnail_url IS NULL OR thumbnail_url = '')
            AND video_url IS NOT NULL AND video_url <> ''
          ORDER BY created_at DESC
          LIMIT 20`
      )
      let сделано = 0
      const неудачи: string[] = []
      for (const р of строки.rows) {
        const обложка = await обложкаИзРолика(String(р.video_url))
        if (!обложка) {
          неудачи.push(String(р.id))
          continue
        }
        await pool.query(
          `UPDATE public_templates SET thumbnail_url = $2 WHERE id = $1`,
          [р.id, обложка]
        )
        сделано += 1
      }
      /**
       * СКОЛЬКО ОСТАЛОСЬ — обязательная часть ответа, а не украшение.
       *
       * Предел в 20 строк на вызов правильный: каждая обложка — это
       * скачивание ролика и ffmpeg. Неправильным был ОТВЕТ: «рассмотрено 20,
       * сделано 20» звучит как «готово», и на этом останавливаешься. В ленте
       * было 47 записей; двадцать закрылись, двадцать три остались чёрными, и
       * узнал я об этом только потому, что заглянул за первую страницу —
       * то есть проверил ровно то окно, которое сам же и заполнил.
       *
       * Теперь ответ называет остаток. Ноль в нём — единственное честное
       * основание считать работу законченной.
       */
      const ост = await pool.query(
        `SELECT count(*)::int AS n FROM public_templates
          WHERE (thumbnail_url IS NULL OR thumbnail_url = '')
            AND video_url IS NOT NULL AND video_url <> ''`
      )
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          success: true,
          рассмотрено: строки.rows.length,
          сделано,
          неудачи,
          осталось: ост.rows[0]?.n ?? 0,
        })
      )
    } catch (e) {
      console.error('❌ backfill-thumbnails:', e)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: 'backfill failed' }))
    }
    return
  }

  // POST /api/generate/audio - Generate TTS using ElevenLabs (direct API call)
  if (req.url === '/api/generate/audio' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => {
      body += chunk
    })
    req.on('end', async () => {
      // Before the try: the refund path in catch must see it.
      let billedTid: string | undefined
      // Модель нужна ВОЗВРАТУ: он считает ту же цену, что списание,
      // а `model` объявлена внутри try и из catch не видна.
      let requestedModel: string | undefined
      // Same charge, two possible providers below (KieAI, then ElevenLabs or
      // Replicate). Whoever delivers, the price stated is the one taken.
      let receipt: Receipt = {}
      // Сколько тысяч знаков оплачено — снаружи try по той же причине,
      // что и модель: возврат живёт в catch.
      let оплаченныеТысячи = 1
      try {
        const { text, voice_id, voice_name, speed, model } = JSON.parse(body)
        requestedModel = typeof model === 'string' ? model : undefined

        /**
         * ПРОВЕРКА ДО ЖУРНАЛА, А НЕ ПОСЛЕ.
         *
         * Строкой ниже стояло `text.substring(0, 50)` в логе — до всякой
         * валидации. Запрос без `text` не получал внятного отказа, а ронял
         * обработчик, и наружу уходило «Cannot read properties of undefined
         * (reading 'substring')». Человек в приложении читал внутреннюю
         * ошибку JavaScript вместо «не хватает текста».
         *
         * Обиднее всего, что падало в ЛОГЕ: строке, которая ничего не делает
         * для ответа и существует только для чтения глазами.
         */
        if (typeof text !== 'string' || text.trim() === '') {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              success: false,
              error: 'text is required: send the words to speak',
            })
          )
          return
        }

        console.log(
          `🎤 [Generate] Audio: voice=${voice_id}, text="${text.substring(0, 50)}..."`
        )

        /*
         * СЧИТАЕМ ЗНАКИ, ЕСЛИ МОДЕЛЬ ПРОДАЁТСЯ ПО ЗНАКАМ.
         *
         * Обе живые TTS-модели тарифицируются за 1000 знаков, а списывалась
         * единица независимо от длины, и предела длины на маршруте не было
         * вовсе. Текст в 20 000 знаков обходился в двадцать цен и приносил
         * одну — чем длиннее озвучка, тем больше убыток, без потолка.
         */
        /*
         * СЧЁТ ЗНАКОВ БЕЗУСЛОВЕН, А НЕ ПО ИМЕНИ МОДЕЛИ.
         *
         * Проверка `познаковаяМодель(model)` делала измерение ДОБРОВОЛЬНЫМ:
         * запрос без `model` оставлял множитель единицей, и 20 000 знаков
         * стоили 12 токенов вместо 480. Дыру открыл я сам, закрывая соседнюю.
         *
         * Условие и не нужно: все ноги этого маршрута — KieAI ElevenLabs,
         * прямой ElevenLabs, Replicate — тарифицируются провайдером за знаки.
         */
        оплаченныеТысячи = тысячиЗнаковКОплате(text)

        // Charge BEFORE spending the provider's money.
        const billed = await chargeMiniAppUser(
          req,
          'audio_generate',
          оплаченныеТысячи,
          model
        )
        if (!billed.ok) {
          res.writeHead(billed.status, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: billed.reason }))
          return
        }
        billedTid = billed.tid

        /*
         * ЗАДАЧА РЕГИСТРИРУЕТСЯ, ЧТОБЫ ОБРЫВ НЕ СЪЕДАЛ ОПЛАЧЕННОЕ.
         *
         * `startJob` звали только видео и липсинк, а приложение спрашивает
         * оборванный результат для ВСЕХ видов (`API.последнееЗадание`). Для
         * картинки и звука отвечать было нечем: заблокированный телефон или
         * тридцатисекундный потолок прокси терял генерацию, за которую уже
         * заплачено провайдеру — файл существует, деньги потрачены, найти
         * некому.
         *
         * Владельца требуем мягко: нет проверенного владельца — просто не
         * заводим задачу. Жёсткий 401, как у видео, сломал бы вызовы, которые
         * сегодня работают по ключу агента.
         */
        const ownerЗвука = generationOwnerId(req)
        if (ownerЗвука) {
          recordInto(startJob('audio', ownerЗвука, typeof text === 'string' ? text : undefined), res)
        }
        receipt = billed.receipt

        if (typeof model === 'string' && model.startsWith('kie/')) {
          /**
           * ОТКАЗ KIE НЕ ЗАВЕРШАЕТ ЗАПРОС — переходим на запасной путь ниже.
           *
           * Раньше `runExplicitKieJob` бросал прямо наружу, и человек получал
           * 500 «Internal Error, Please try again later» — дословный ответ
           * KieAI. Замер: единственная разрешённая для звука модель
           * `elevenlabs/text-to-speech-multilingual-v2` отвечает этой ошибкой
           * стабильно, а путь ниже (ElevenLabs → Replicate) в ту же секунду
           * отдаёт готовый mp3. То есть озвучка была технически доступна и
           * недоступна на практике: приложение всегда шлёт `kie/…`.
           *
           * Правило уже сформулировано двумя строками ниже — «провайдер лёг,
           * идём к следующему, симметрично картинкам». KIE просто в нём не
           * участвовал.
           *
           * ДЕНЬГИ. Списание произошло выше. Отдать результат запасным путём
           * ЧЕСТНЕЕ, чем вернуть отказ и возврат: человек платил за озвучку,
           * а не за конкретного подрядчика, и получает именно её. Кто
           * исполнил на самом деле — сказано в `provider` ответа, не выдумано.
           */
          try {
            const kieModel = reviewedKieModel('audio', model)!
            const result = await runExplicitKieJob(kieModel, {
              text,
              /*
               * ИМЯ — ТОЛЬКО ТО, ЧТО ЭТОТ ПРОВАЙДЕР УЗНАЕТ.
               *
               * Здесь стояло «взять `voice_name` как есть», и это было верно,
               * пока список голосов был от ElevenLabs. Теперь он от MiniMax:
               * приходит «Максим — уверенный», а нога ждёт «Rachel». Чужая
               * строка даёт отказ на ПЕРВОЙ ноге — то есть удлиняет путь до
               * звука ради имени, которого здесь не поймут.
               */
              voice: имяДляElevenLabs(voice_name) ?? 'Rachel',
              stability: 0.5,
              similarity_boost: 0.75,
              style: 0,
              speed: Number.isFinite(Number(speed)) ? Number(speed) : 1,
              timestamps: false,
              previous_text: '',
              next_text: '',
              language_code: '',
            })
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                success: true,
                url: result.url,
                id: result.taskId,
                provider: model,
                ...receipt,
              })
            )
            return
          } catch (kieError) {
            // Не глушим: причина отказа KieAI должна остаться в логе, иначе
            // «почему-то всегда Replicate» станет загадкой на месяц.
            console.warn(
              `⚠️ Kie.ai TTS отказал (${model}), идём запасным путём:`,
              kieError instanceof Error ? kieError.message : kieError
            )
          }
        }

        // ElevenLabs is the primary path; if it is unavailable (the key stored
        // is an identifier, not an sk_ key, OR the API errors) fall back to
        // Replicate TTS. Symmetric with images (FAL dead -> Replicate).
        let audioBuffer: Buffer
        let timedCaptions: TimedCaption[] | undefined
        let audioProvider = 'elevenlabs'
        try {
          const ELEVENLABS_API_KEY = elevenLabsKey() // throws if not an sk_ key
          const ttsResponse = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}/with-timestamps`,
            {
              method: 'POST',
              headers: {
                'xi-api-key': ELEVENLABS_API_KEY,
                'Content-Type': 'application/json',
                Accept: 'application/json',
              },
              body: JSON.stringify({
                text,
                model_id: 'eleven_multilingual_v2',
                /*
                 * СКОРОСТЬ ПЕРЕДАЁТСЯ И ЗДЕСЬ.
                 *
                 * Ползунок терялся на ВСЕХ трёх ногах; две уже починены, а
                 * эта осталась бы мёртвой ровно до того дня, когда почините
                 * ключ ElevenLabs, — и слайдер снова перестал бы значить
                 * что-либо, без единой правки в коде.
                 *
                 * Поле документировано провайдером как `speed` внутри
                 * `voice_settings`: double, по умолчанию 1
                 * (elevenlabs.io/docs/api-reference/text-to-speech/convert,
                 * снято 06.09.2026). Границ там НЕ УКАЗАНО, поэтому свои не
                 * выдумываем, а берём ту же, что умеет породить наш ползунок
                 * (0.5–2.0 в вебе, три значения в приложении): за её
                 * пределами значение прийти не может, и обещать провайдеру
                 * то, чего он не обещал, не приходится.
                 *
                 * Единицу не шлём: это и есть значение по умолчанию.
                 */
                voice_settings: {
                  stability: 0.5,
                  similarity_boost: 0.75,
                  ...(скоростьРечи(speed) != null &&
                  скоростьРечи(speed) !== 1
                    ? { speed: скоростьРечи(speed) }
                    : {}),
                },
              }),
            }
          )
          if (!ttsResponse.ok) {
            throw new Error(
              `ElevenLabs TTS error: ${ttsResponse.status} - ${await ttsResponse.text()}`
            )
          }
          const timedSpeech = (await ttsResponse.json()) as {
            audio_base64?: unknown
            alignment?: CharacterAlignment
            normalized_alignment?: CharacterAlignment
          }
          if (
            typeof timedSpeech.audio_base64 !== 'string' ||
            timedSpeech.audio_base64.length === 0
          ) {
            throw new Error('ElevenLabs timestamp response has no audio')
          }
          audioBuffer = Buffer.from(timedSpeech.audio_base64, 'base64')
          timedCaptions = captionsFromCharacterAlignment(
            timedSpeech.normalized_alignment ?? timedSpeech.alignment!
          )
        } catch (elevenErr) {
          console.warn(
            `🎤 [Generate] ElevenLabs unavailable (${String(elevenErr).slice(0, 120)}), switching to Replicate TTS`
          )
          const audioUrl = await generateAudioViaReplicate(text, {
            // `voice_id` — то, что прислал клиент; чужой идентификатор
            // `входМиниМакс` отбросит сам, а не отправит провайдеру.
            voice: voice_id,
            speed,
          })
          const dl = await fetch(audioUrl)
          if (!dl.ok) {
            throw new Error(`Replicate audio download failed: ${dl.status}`)
          }
          audioBuffer = Buffer.from(await dl.arrayBuffer())
          audioProvider = 'replicate/minimax-speech-02-turbo'
        }
        console.log(
          `✅ [Generate] Audio received: ${audioBuffer.length} bytes (${audioProvider})`
        )

        // Upload to S3
        const filename = `tts-${Date.now()}.mp3`
        const uploadResult = await uploadToS3(
          audioBuffer,
          filename,
          'audio/mpeg'
        )

        if (!uploadResult.success) {
          throw new Error(uploadResult.error || 'Failed to upload audio to S3')
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            success: true,
            url: uploadResult.url,
            provider: audioProvider,
            id: Date.now().toString(),
            ...(timedCaptions && timedCaptions.length > 0
              ? { timed_captions: timedCaptions }
              : {}),
            ...receipt,
          })
        )
      } catch (error) {
        console.error('❌ [Generate] Audio error:', error)
        // Nothing was delivered, so the tokens go back.
        // Той же величиной, что списали: возврат за одну тысячу там, где
        // взяли двадцать, — это конфискация девятнадцати.
        await refundMiniAppUser(
          billedTid,
          'audio_generate',
          оплаченныеТысячи,
          requestedModel
        )
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Generation failed',
          })
        )
      }
    })
    return
  }

  // GET /api/voices - Get available ElevenLabs voices
  if (req.url === '/api/voices' && req.method === 'GET') {
    try {
      const ELEVENLABS_API_KEY = elevenLabsKey()
      console.log(`🎤 [Voices] Fetching ElevenLabs voices...`)

      const response = await fetch('https://api.elevenlabs.io/v1/voices', {
        method: 'GET',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        // Тело — вместе с кодом. Именно в теле ElevenLabs объясняет, что не
        // так; без него «error: 400» не говорит ничего и чинить нечего.
        const detail = await response.text().catch(() => '')
        throw new Error(
          `ElevenLabs ответил ${response.status}${detail ? `: ${detail.slice(0, 400)}` : ''}`
        )
      }

      const data = await response.json()
      const voices = data.voices || []

      console.log(`✅ [Voices] Found ${voices.length} voices`)

      // Filter out voices that are not fine-tuned (professional clones need fine-tuning)
      const readyVoices = voices.filter((voice: any) => {
        // Premade voices always work
        if (voice.category === 'premade') {
          return true
        }

        // Check fine_tuning status for cloned voices
        if (voice.fine_tuning) {
          const state = voice.fine_tuning.fine_tuning_state
          const isAllowed = voice.fine_tuning.is_allowed_to_fine_tune

          // Log for debugging
          console.log(
            `🔍 [Voices] ${voice.name} (${voice.voice_id}): category=${voice.category}, state=${state}, isAllowed=${isAllowed}`
          )

          // Skip if fine-tuning is required but not complete
          if (state && state !== 'fine_tuned' && state !== 'not_started') {
            console.log(
              `⚠️ [Voices] Skipping ${voice.name}: not fine-tuned (state=${state})`
            )
            return false
          }

          // Skip if not allowed to use (professional voices that need fine-tuning)
          if (isAllowed === false && state !== 'fine_tuned') {
            console.log(
              `⚠️ [Voices] Skipping ${voice.name}: not allowed and not fine-tuned`
            )
            return false
          }
        }
        return true
      })

      console.log(
        `✅ [Voices] ${readyVoices.length} ready voices (filtered from ${voices.length})`
      )

      // Map to simplified format
      const simplifiedVoices = readyVoices.map((voice: any) => ({
        id: voice.voice_id,
        name: voice.name,
        category: voice.category || 'custom',
        labels: voice.labels || {},
        preview_url: voice.preview_url,
      }))

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          success: true,
          voices: simplifiedVoices,
          provider: 'elevenlabs',
        })
      )
    } catch (error) {
      console.error('❌ [Voices] Error:', error)
      /**
       * ОТКАЗ ElevenLabs НЕ ОСТАВЛЯЕТ ЭКРАН БЕЗ ГОЛОСОВ — потому что звук всё
       * равно будет сделан, только другим провайдером.
       *
       * Здесь стоял 500, и это был не сбой, а ПОСТОЯННОЕ состояние: замер на
       * боевом сервере даёт «ELEVENLABS_API_KEY хранит НЕ КЛЮЧ, а его
       * идентификатор». Веб на отказе подставлял три запасных имени — `sarah`,
       * `rachel`, `josh`, — которые не являются идентификаторами голоса нигде.
       * Человек выбирал из трёх выдуманных и получал голос MiniMax по
       * умолчанию.
       *
       * Отдаём голоса ТОЙ ноги, которая доедет: маршрут озвучки падает с
       * ElevenLabs на Replicate minimax, и её голоса провайдер понимает
       * дословно. Порядок здесь тот же, что в маршруте, — одна правда о том,
       * кто озвучивает.
       *
       * Починят ключ — первая ветка снова ответит своими голосами, и этот код
       * менять не придётся.
       */
      if (ГОЛОСА_MINIMAX.length > 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            success: true,
            voices: ГОЛОСА_MINIMAX,
            provider: 'replicate/minimax-speech-02-turbo',
            // Причина не прячется: без неё «почему голоса другие» станет
            // загадкой на месяц, как уже было с «почему всегда Replicate».
            note:
              error instanceof Error
                ? `ElevenLabs недоступен: ${error.message.slice(0, 200)}`
                : 'ElevenLabs недоступен',
          })
        )
        return
      }
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to fetch voices',
        })
      )
    }
    return
  }

  // POST /api/generate/lipsync - Generate lipsync video using fal.ai VEED Fabric
  if (req.url === '/api/generate/lipsync' && req.method === 'POST') {
    let body = ''
    let billedTid: string | undefined
    let billedSeconds = 0
    // The receipt matters MOST here: lipsync is charged per second of audio,
    // so the sum taken depends on a duration the caller does not know before
    // pressing. The button can promise a per-second rate; only the answer can
    // state what was actually taken.
    let receipt: Receipt = {}
    // Модель нужна ВОЗВРАТУ: он считает ту же цену, что списание.
    let requestedModel: string | undefined
    req.on('data', chunk => {
      body += chunk
    })
    req.on('end', async () => {
      try {
        const { audio_url, image_url, resolution, model } = JSON.parse(
          body
        ) as Record<string, string | undefined>
        requestedModel = typeof model === 'string' ? model : undefined
        if (!audio_url || !image_url) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              success: false,
              error: 'audio_url and image_url are required',
            })
          )
          return
        }

        // Both provider inputs must be public HTTP(S) resources. The audio is
        // downloaded locally for a trusted duration measurement; the image is
        // fetched by the provider, but accepting a private-network URL would
        // still turn this paid route into a blind network probe.
        const safeImageUrl = assertFetchable(image_url)
        await resolvePublicAddress(safeImageUrl.hostname)
        const duration = await measuredRemoteDuration(audio_url)
        if (duration > MAX_LIPSYNC_SECONDS) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              success: false,
              error: `lipsync audio must be ${MAX_LIPSYNC_SECONDS} seconds or shorter`,
            })
          )
          return
        }
        billedSeconds = Math.ceil(duration)

        /**
         * ЗАДАЧА ЗАВОДИТСЯ И ДЛЯ ЛИПСИНКА — иначе опрашивать нечего.
         *
         * Липсинк идёт минутами, и Railway рвёт соединение раньше, чем KieAI
         * отвечает: замер дал 502 «upstream error» на настоящем запросе,
         * который при повторе с длинным ожиданием вернул готовый ролик. То
         * есть работа ДЕЛАЕТСЯ и оплачивается, а результат теряется по дороге
         * — худший из возможных исходов, потому что деньги списаны.
         *
         * Маршрут опроса `GET /api/generate/jobs/<id>` существовал и работал,
         * но заводило задачу только видео. Теперь и липсинк: оборванное
         * соединение перестаёт означать потерянный результат — его можно
         * забрать по id.
         *
         * `recordInto` перехватывает ответ и сам проставляет задаче исход,
         * поэтому ни одна ветка ниже не нуждается в правке.
         */
        const липсинкOwner = generationOwnerId(req)
        if (липсинкOwner) {
          const задача = startJob('lipsync', липсинкOwner, String(image_url))
          recordInto(задача, res)
        }

        const billed = await chargeMiniAppUser(
          req,
          'lipsync_generate',
          billedSeconds,
          model
        )
        if (!billed.ok) {
          res.writeHead(billed.status, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: billed.reason }))
          return
        }
        billedTid = billed.tid
        receipt = billed.receipt

        /**
         * KieAI ПЕРВЫМ, fal.ai запасным — и это не предпочтение, а замер.
         *
         * Маршрут знал одного провайдера, и когда у fal.ai кончился баланс,
         * липсинк перестал работать целиком: «User is locked. Reason:
         * Exhausted balance». При этом приложение показывало ПЯТЬ живых
         * липсинк-моделей KieAI с ценами — каталог знал про них, а маршрут
         * нет, и выбор человека уходил в никуда.
         *
         * Та же ошибка уже была у сценария (см. ПРОВАЙДЕРЫ выше): экран
         * считал вид рабочим по наличию моделей, а запрос до них не доходил.
         * Здесь она чинится тем же способом.
         *
         * Имя модели сверяется с реестром внутри `запустить`: чужую строку
         * туда не пропустят, а значит вызывающий не выберет, за что платить.
         */
        /*
         * `veed/fabric-1` УБРАН — он не мог быть выбран никогда.
         *
         * Список нужен, чтобы взять запасную модель, когда клиент прислал
         * своё имя и оно допуск не прошло. Но допуск отсеивает всё, чему
         * KieAI не назвал себестоимость, а семейства veed в прайсе нет
         * вовсе, — значит `requestedKieModel` не мог оказаться этой строкой
         * ни при каком запросе.
         *
         * Мёртвая строка в перечне читается как «эту модель мы обслуживаем»
         * — так она и попала в витрину веба, где стоила целой вкладки: там
         * списывали, потом отказывали, потом возвращали.
         *
         * `volcengine/video-to-video-lip-sync` убран по ДРУГОЙ причине, и её
         * стоит назвать: маршрут не умеет передать ни `mode`, ни `video_url`,
         * которых просит её контракт. Это записано отдельно и давно
         * («остаётся скрытой: ей нужен ещё `mode`, чьих допустимых значений
         * мы не мерили»), но список об этом не знал.
         *
         * Тест теперь прогоняет КАЖДОЕ имя отсюда через тот же допуск —
         * догадка «наверное, работает» больше не проходит.
         */
        const KIE_LIPSYNC = [
          'infinitalk/from-audio',
          'omnihuman-1-5',
          'kling/ai-avatar-standard',
        ]
        const explicitKie = model?.startsWith('kie/') ?? false
/*
         * ГОЛОЕ ИМЯ НЕ ВЫБИРАЕТ МОДЕЛЬ. Было `: model`: строка без префикса
         * `kie/` миновала допуск и попадала в список липсинка, а цена
         * считалась ПО ПРЕФИКСУ — убери четыре символа, и OmniHuman работал
         * за 60 токенов вместо 540.
         */
        const requestedKieModel = explicitKie
          ? reviewedKieModel('lipsync', model)!
          : undefined
        if (process.env.KIE_AI_API_KEY) {
          const selectedKieModel =
            requestedKieModel && KIE_LIPSYNC.includes(requestedKieModel)
              ? requestedKieModel
              : KIE_LIPSYNC[0]
          /**
           * `prompt` ОБЯЗАТЕЛЕН, хотя по смыслу липсинку он не нужен.
           *
           * Без него KieAI отвечает «prompt is required» и код 500 — а мой
           * первый вариант это проглатывал и тихо уходил в fal.ai, из-за чего
           * правка выглядела не подействовавшей. Проверено прямым запросом:
           * с полем задание создаётся, без него нет.
           *
           * Значение нейтральное: описание тут ничего не задаёт, губы ведёт
           * звук. Пустая строка не годится — она и есть «не передан».
           */
          try {
            const result = await runExplicitKieJob(
              selectedKieModel,
              {
                image_url,
                audio_url,
                /*
                 * РАЗРЕШЕНИЕ ЗАДАЁМ МЫ, а не клиент: у InfiniteTalk 720p
                 * стоит вчетверо дороже 480p ($0.06 против $0.015 в
                 * секунду по живому прайсу), а цена в каталоге взята с
                 * дешёвой строки. Веб слал 720p по умолчанию — и мы
                 * платили вчетверо, взяв как за 480p.
                 */
                resolution: РАЗРЕШЕНИЕ_ЛИПСИНКА,
                prompt: 'person speaking naturally',
              },
              { attempts: 60, intervalMs: 5_000 }
            )
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                success: true,
                url: result.url,
                id: result.taskId,
                provider: `kie/${selectedKieModel}`,
                ...receipt,
              })
            )
            return
          } catch (kieError) {
            if (explicitKie) throw kieError
            console.warn(
              `⚠️ [Lipsync] KieAI не справился (${String(kieError).slice(0, 160)}), пробуем fal.ai`
            )
          }
        } else if (explicitKie) {
          throw new Error('KIE_AI_API_KEY не задан в сервисе')
        }
        console.log(
          `👄 [Generate] Lipsync via fal.ai VEED Fabric: resolution=${РАЗРЕШЕНИЕ_ЛИПСИНКА}`
        )

        const FAL_KEY = process.env.FAL_KEY
        if (!FAL_KEY) throw new Error('FAL_KEY not configured')

        // Submit job to fal.ai queue
        const queueResponse = await fetch(
          'https://queue.fal.run/veed/fabric-1.0',
          {
            method: 'POST',
            headers: {
              Authorization: `Key ${FAL_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              image_url,
              audio_url,
              // Та же ставка, что у ноги KieAI: цену назначаем мы, значит и
              // разрешение выбираем мы. Прежнее умолчание 720p делало
              // запасную ногу дороже основной при одинаковом счёте.
              resolution: РАЗРЕШЕНИЕ_ЛИПСИНКА,
            }),
          }
        )

        if (!queueResponse.ok) {
          const errorText = await queueResponse.text()
          throw new Error(
            `fal.ai queue error: ${queueResponse.status} ${errorText}`
          )
        }

        const queueResult = await queueResponse.json()
        const requestId = queueResult.request_id
        console.log(`👄 [fal.ai] Job queued: ${requestId}`)

        // Poll for result
        let videoUrl = null
        for (let i = 0; i < 120; i++) {
          // Max 10 minutes (5s intervals)
          await new Promise(r => setTimeout(r, 5000))

          const statusResponse = await fetch(
            `https://queue.fal.run/veed/fabric-1.0/requests/${requestId}/status`,
            {
              headers: { Authorization: `Key ${FAL_KEY}` },
            }
          )
          const statusData = await statusResponse.json()
          console.log(`👄 [fal.ai] Status: ${statusData.status}`)

          if (statusData.status === 'COMPLETED') {
            // Get the result
            const resultResponse = await fetch(
              `https://queue.fal.run/veed/fabric-1.0/requests/${requestId}`,
              {
                headers: { Authorization: `Key ${FAL_KEY}` },
              }
            )
            const resultData = await resultResponse.json()
            videoUrl = resultData.video?.url
            break
          } else if (statusData.status === 'FAILED') {
            throw new Error(
              `fal.ai job failed: ${statusData.error || 'Unknown error'}`
            )
          }
        }

        if (videoUrl) {
          console.log(`👄 [fal.ai] Video ready: ${videoUrl}`)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              success: true,
              url: videoUrl,
              id: requestId,
              ...receipt,
            })
          )
          return
        }

        throw new Error('Lipsync generation timeout')
      } catch (error) {
        console.error('❌ [Generate] Lipsync error:', error)
        await refundMiniAppUser(
          billedTid,
          'lipsync_generate',
          billedSeconds || 1,
          requestedModel
        )
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Generation failed',
          })
        )
      }
    })
    return
  }

  /**
   * Аватар бота через себя: прямая ссылка Telegram на файл содержит ТОКЕН
   * бота, и отдавать её в браузер нельзя — это утечка учётных данных.
   */
  const avatarMatch = (req.url || '')
    .split('?')[0]
    .match(/^\/branding\/avatar\/(\d+)$/)
  if (avatarMatch && req.method === 'GET') {
    const botId = avatarMatch[1]
    try {
      const tokens: string[] = []
      const push = (t?: string) => {
        const v = (t || '').trim()
        if (v && !tokens.includes(v)) tokens.push(v)
      }
      push(process.env.TELEGRAM_BOT_TOKEN)
      for (let i = 1; i <= 20; i++) push(process.env[`BOT_TOKEN_${i}`])
      const token = tokens.find(t => t.split(':')[0] === botId)
      if (!token) throw new Error('нет токена')

      const photos = await fetch(
        `https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${botId}&limit=1`
      ).then(r => r.json() as any)
      const fileId = photos?.result?.photos?.[0]?.slice(-1)?.[0]?.file_id
      if (!fileId) throw new Error('аватара нет')
      const file = await fetch(
        `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`
      ).then(r => r.json() as any)
      const img = await fetch(
        `https://api.telegram.org/file/bot${token}/${file.result.file_path}`
      )
      const buf = Buffer.from(await img.arrayBuffer())
      res.writeHead(200, {
        'Content-Type': img.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      })
      res.end(buf)
    } catch (e) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'avatar not available' }))
    }
    return
  }

  /**
   * Брендирование мини-аппа под бота, из которого его открыли (white label).
   *
   * Приложение продаётся вместе с ботами, поэтому в шапке должно стоять имя и
   * аватар КОНКРЕТНОГО бота, а не «VIBEE». Какой это бот, честно знает только
   * подпись initData: она сделана токеном именно того бота, и verify возвращает
   * его id. Брать бренд из параметра URL было бы нельзя — его подделает кто
   * угодно.
   *
   * Имя и аватар берём у самого Telegram (getMe + getUserProfilePhotos) и
   * держим в памяти: getMe на каждый заход мини-аппа — лишний круг к API.
   */
  if (req.url?.split('?')[0] === '/branding' && req.method === 'GET') {
    const auth = authenticate(req)
    const initData =
      (req.headers['x-telegram-init-data'] as string | undefined) ||
      (req.headers['x-telegram-initdata'] as string | undefined) ||
      ''
    const verified = initData
      ? verifyTelegramInitData(initData)
      : { ok: false as const }

    if (!auth.allowed || !('botId' in verified) || !verified.botId) {
      // Без подтверждённой подписи бренд неизвестен — отдаём дефолт, а не
      // выдумываем. Пустой ответ заставил бы клиент гадать.
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ branded: false }))
      return
    }

    try {
      const brand = await getBotBranding(verified.botId)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ branded: true, ...brand }))
    } catch (e) {
      console.warn('[branding] не удалось получить бренд бота:', e)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ branded: false }))
    }
    return
  }

  // Витрина шаблонов для мини-аппа: человеку нужен не только id композиции,
  // но и что это за шаблон, какие поля заполнять и по каким правилам канона.
  //
  // Витрина НЕ является источником правды о существовании шаблона: список
  // пересекается с реальным бандлом (тот же урок, что и у /compositions —
  // рукописный список неизбежно расходится с кодом). Наружу уходят только те
  // карточки, которые действительно можно отрендерить.
  if (req.url === '/templates' && req.method === 'GET') {
    try {
      const comps = await knownCompositions()
      const byId = new Map(comps.map(c => [c.id, c]))
      const templates = TEMPLATE_CARDS.filter(t => byId.has(t.id)).map(t => {
        const c = byId.get(t.id)!
        return {
          ...t,
          width: c.width,
          height: c.height,
          fps: c.fps,
          durationInFrames: c.durationInFrames,
        }
      })
      const missing = TEMPLATE_CARDS.filter(t => !byId.has(t.id)).map(t => t.id)
      if (missing.length) {
        console.warn(
          '[templates] карточки без композиции в бандле:',
          missing.join(', ')
        )
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ templates }))
    } catch (error) {
      console.error('Templates error:', error)
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'bundle not ready' }))
    }
    return
  }

  // List compositions
  if (req.url === '/compositions' && req.method === 'GET') {
    // Список берётся ИЗ БАНДЛА, а не из захардкоженного массива.
    //
    // Раньше здесь лежали шесть записей: TextOverlay, VideoIntro, DynamicVideo,
    // LipSyncMain, LipSyncBusiness, SplitTalkingHead. В src/Root.tsx
    // зарегистрирована РОВНО ОДНА — SplitTalkingHead. Пяти из шести не
    // существует.
    //
    // Клиент выбирал шаблон из этого списка, POST /render принимался с
    // success:true и renderId, и только потом задача падала с
    // "Could not find composition with ID TextOverlay". Проверено запросом.
    // getCompositions читает тот же бандл, которым рендерит, поэтому список
    // не может разойтись с реальностью.
    try {
      const comps = await knownCompositions()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          compositions: comps.map(c => ({
            id: c.id,
            width: c.width,
            height: c.height,
            fps: c.fps,
            durationInFrames: c.durationInFrames,
          })),
        })
      )
    } catch (error) {
      console.error('Compositions error:', error)
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'bundle not ready' }))
    }
    return
  }

  // Analyze face in video/image
  if (req.url === '/analyze-face' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => {
      body += chunk
    })
    req.on('end', async () => {
      try {
        const { videoUrl, imageUrl, shape = 'portrait' } = JSON.parse(body)
        const mediaUrl = videoUrl || imageUrl

        if (!mediaUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'videoUrl or imageUrl is required' }))
          return
        }

        console.log(`👤 Analyzing face in: ${mediaUrl}`)

        // Resolve path for local files
        let filePath = mediaUrl
        if (mediaUrl.startsWith('/') && !mediaUrl.startsWith('//')) {
          filePath = path.join(process.cwd(), 'public', mediaUrl)
        } else {
          /**
           * Anything not a local path is handed to ffmpeg (or canvas) as an
           * INPUT URL, and they fetch it themselves. Without this check the
           * body decided what the server connects to, which is the same SSRF
           * shape assertFetchable already guards everywhere else here: the
           * cloud metadata address and the private ranges are one POST away.
           * Public media keeps working -- the editor sends S3 links.
           */
          assertFetchable(mediaUrl)
        }

        // Detect face
        const isVideo =
          mediaUrl.endsWith('.mp4') ||
          mediaUrl.endsWith('.webm') ||
          mediaUrl.endsWith('.mov')
        const faceBox = isVideo
          ? await detectFaceInVideo(filePath)
          : await detectFaceInImage(filePath)

        if (!faceBox) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              success: true,
              faceDetected: false,
              message: 'No face detected in media',
            })
          )
          return
        }

        // Calculate crop settings
        const cropSettings = calculateCropSettings(
          faceBox,
          shape as 'square' | 'portrait' | 'circle'
        )

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            success: true,
            faceDetected: true,
            faceBox,
            cropSettings,
          })
        )
      } catch (error) {
        console.error('Face analysis error:', error)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error:
              error instanceof Error ? error.message : 'Face analysis failed',
          })
        )
      }
    })
    return
  }

  // Upload asset to S3
  if (req.url === '/upload' && req.method === 'POST') {
    const maxSize = 100 * 1024 * 1024
    const declaredSize = Number(req.headers['content-length'])
    if (Number.isFinite(declaredSize) && declaredSize > maxSize) {
      res.writeHead(413, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'File too large (max 100MB)' }))
      req.resume()
      return
    }
    const releaseUpload = uploadConcurrency.tryAcquire()
    if (!releaseUpload) {
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': '5',
      })
      res.end(JSON.stringify({ error: 'Upload capacity is busy' }))
      req.resume()
      return
    }

    const заголовокИмени =
      (req.headers['x-filename'] as string) || `file-${Date.now()}`
    /*
     * Имя приходит percent-кодированным: значение HTTP-заголовка обязано быть
     * Latin-1, а имена бывают русские. Старые клиенты шлют его сырым, поэтому
     * неудачное декодирование — не ошибка, а «прислали как есть».
     */
    let rawFilename = заголовокИмени
    try {
      rawFilename = decodeURIComponent(заголовокИмени)
    } catch {
      rawFilename = заголовокИмени
    }
    const filename =
      path
        .basename(rawFilename)
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .slice(0, 160) || `file-${Date.now()}`
    const contentType =
      (req.headers['content-type'] as string) || getContentType(filename)

    void (async () => {
      try {
        const result = await uploadRequestToS3(
          req,
          filename,
          contentType,
          maxSize
        )
        const statusCode = result.success ? 200 : 500
        res.writeHead(statusCode, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      } catch (error) {
        if (error instanceof UploadTooLargeError) {
          res.writeHead(413, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'File too large (max 100MB)' }))
          return
        }
        if (error instanceof Error && error.message === 'empty upload') {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'No file data received' }))
          return
        }
        console.error('Upload error:', error)
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Upload failed' }))
        }
      } finally {
        releaseUpload()
      }
    })()

    return
  }

  // List S3 assets
  if (req.url === '/assets' && req.method === 'GET') {
    const result = await listS3Assets()
    const statusCode = result.success ? 200 : 500
    res.writeHead(statusCode, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(result))
    return
  }

  // Serve rendered files
  if (req.url?.startsWith('/renders/') && req.method === 'GET') {
    // Strip query string from URL
    const urlPath = req.url.split('?')[0]
    const filename = urlPath.replace('/renders/', '')
    const filePath = path.join(OUTPUT_DIR, filename)

    serveStaticFile(res, filePath)
    return
  }

  // Serve public assets (with /public/ prefix)
  if (req.url?.startsWith('/public/') && req.method === 'GET') {
    // Strip query string from URL
    const urlPath = req.url.split('?')[0]
    const filename = urlPath.replace('/public/', '')
    const filePath = path.join(process.cwd(), 'public', filename)
    console.log(`📂 Request for public file: ${req.url} -> ${filePath}`)

    serveStaticFile(res, filePath)
    return
  }

  // Serve public assets (without /public/ prefix - for editor compatibility)
  // Handles: /covers/*, /backgrounds/*, /lipsync/*, /music/*
  const publicPaths = [
    '/covers/',
    '/backgrounds/',
    '/lipsync/',
    '/music/',
    '/audio/',
    '/render-temp/',
  ]
  const matchedPath = publicPaths.find(p => req.url?.startsWith(p))
  if (matchedPath && req.method === 'GET') {
    // Strip query string from URL before building file path
    const urlPath = req.url!.split('?')[0]
    const filePath = path.join(process.cwd(), 'public', urlPath)
    console.log(
      `📂 Request for public file (no prefix): ${req.url} -> ${filePath}`
    )

    serveStaticFile(res, filePath)
    return
  }

  // S3 video proxy with HEVC → H.264 conversion for browser compatibility
  if (req.url?.startsWith('/s3/') && req.method === 'GET') {
    const s3Key = decodeURIComponent(req.url.slice(4).split('?')[0]) // Remove /s3/ and query string, decode URL
    const ext = path.extname(s3Key).toLowerCase()
    const isImage = [
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.webp',
      '.svg',
      '.bmp',
    ].includes(ext)
    const isAudio = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.webm'].includes(
      ext
    )
    const isJson = ext === '.json'

    console.log(
      `🎬 S3 proxy request: ${s3Key} (image: ${isImage}, audio: ${isAudio}, json: ${isJson})`
    )

    // For images, audio, and JSON - serve directly from S3 without conversion
    if (isImage || isAudio || isJson) {
      try {
        const command = new GetObjectCommand({
          Bucket: S3_BUCKET,
          Key: s3Key,
        })
        const response = await s3Client.send(command)
        const contentType =
          response.ContentType ||
          (isImage ? 'image/jpeg' : isAudio ? 'audio/mpeg' : 'application/json')

        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': response.ContentLength?.toString() || '',
          'Cache-Control': 'public, max-age=31536000',
          'Access-Control-Allow-Origin': '*',
        })

        const body = response.Body as NodeJS.ReadableStream
        body.pipe(res)
      } catch (error) {
        console.error(`❌ S3 proxy error for ${s3Key}:`, error)
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'File not found' }))
      }
      return
    }

    // For videos - download, convert to H.264, cache
    const cacheDir = path.join(process.cwd(), 'public', 'video-cache')
    const cacheFilename = `${s3Key.replace(/\//g, '-').replace(/[^a-zA-Z0-9.-]/g, '_')}-h264.mp4`
    const cachePath = path.join(cacheDir, cacheFilename)

    // Check cache first
    if (fs.existsSync(cachePath)) {
      console.log(`✅ Serving cached H.264 video: ${cachePath}`)
      serveStaticFile(res, cachePath)
      return
    }

    // Download and convert
    try {
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true })
      }

      const tempPath = path.join(cacheDir, `temp-${Date.now()}.mp4`)

      // Download from S3
      console.log(`📥 Downloading from S3: ${s3Key}`)
      const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
      })
      const response = await s3Client.send(command)
      const body = response.Body as NodeJS.ReadableStream

      await new Promise<void>((resolve, reject) => {
        const file = fs.createWriteStream(tempPath)
        body.pipe(file)
        file.on('finish', () => {
          file.close()
          resolve()
        })
        file.on('error', reject)
      })

      // Convert to H.264
      console.log(`🔄 Converting to H.264: ${cachePath}`)
      execFileSync(
        'ffmpeg',
        [
          '-i',
          ffArg(tempPath),
          '-c:v',
          'libx264',
          '-preset',
          'fast',
          '-crf',
          '23',
          '-c:a',
          'aac',
          '-movflags',
          '+faststart',
          '-y',
          ffArg(cachePath),
        ],
        { stdio: 'pipe', timeout: 300000 }
      )

      // Remove temp file
      fs.unlinkSync(tempPath)

      console.log(`✅ Converted and cached: ${cachePath}`)
      serveStaticFile(res, cachePath)
    } catch (error) {
      console.error(`❌ S3 video proxy error:`, error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Failed to process video' }))
    }
    return
  }

  // Cache control by file type - JSON needs frequent updates, video/images can be cached
  function getCacheControl(filePath: string): string {
    // JSON files - no cache (captions.json changes frequently)
    if (filePath.endsWith('.json')) {
      return 'public, max-age=0, must-revalidate'
    }
    // Video - 1 hour (balance between performance and freshness)
    if (/\.(mp4|webm|mov|avi)$/i.test(filePath)) {
      return 'public, max-age=3600'
    }
    // Images - 1 day
    if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(filePath)) {
      return 'public, max-age=86400'
    }
    // Default - 1 hour
    return 'public, max-age=3600'
  }

  function serveStaticFile(res: any, filePath: string) {
    console.log(`📂 Serving file: ${filePath}`)
    if (fs.existsSync(filePath)) {
      console.log(`✅ File found: ${filePath}`)
      const stat = fs.statSync(filePath)
      const ext = path.extname(filePath).toLowerCase()
      const contentType =
        ext === '.mp4'
          ? 'video/mp4'
          : ext === '.mp3'
            ? 'audio/mpeg'
            : ext === '.wav'
              ? 'audio/wav'
              : ext === '.jpg' || ext === '.jpeg'
                ? 'image/jpeg'
                : ext === '.png'
                  ? 'image/png'
                  : ext === '.gif'
                    ? 'image/gif'
                    : ext === '.json'
                      ? 'application/json'
                      : 'application/octet-stream'

      // Handle Range requests (essential for video seek)
      const range = req.headers.range
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-')
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1

        if (start >= stat.size) {
          res.writeHead(416, {
            'Content-Range': `bytes */${stat.size}`,
          })
          return res.end()
        }

        const chunksize = end - start + 1
        const file = fs.createReadStream(filePath, { start, end })

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': contentType,
          'Cache-Control': getCacheControl(filePath),
          'Access-Control-Allow-Origin': '*',
        })
        file.pipe(res)
        return
      }

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stat.size,
        'Accept-Ranges': 'bytes',
        'Cache-Control': getCacheControl(filePath),
        'Access-Control-Allow-Origin': '*',
      })
      fs.createReadStream(filePath).pipe(res)
      return
    }

    // Этот сервер намеренно не везёт каталог public/: те же ~500MB медиа уже
    // задеплоены вместе с редактором, и вторая копия здесь была бы чистым
    // дублированием. Значит запрос сюда за медиа — всегда ошибка вызывающего,
    // а не отсутствующий файл. Прошлый текст «File not found» это скрывал:
    // из него не было видно, ни почему файла нет, ни куда идти.
    const MEDIA_HINT =
      process.env.MEDIA_ORIGIN ||
      'https://vibee-editor-production.up.railway.app'
    console.log(
      `❌ Media requested from the render server: ${filePath}\n` +
        `   Этот сервер не хранит public/. Правильный адрес: ${MEDIA_HINT}${req.url}\n` +
        `   В редакторе такие пути строит MEDIA_ORIGIN (player/src/lib/mediaUrl.ts), не RENDER_SERVER_URL.`
    )
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        error: 'This server does not host media',
        requested: req.url,
        serveFrom: `${MEDIA_HINT}${req.url}`,
        hint: 'Use MEDIA_ORIGIN in the editor, not RENDER_SERVER_URL',
      })
    )
  }

  // SSE endpoint retained for authenticated non-browser clients. The player
  // uses header-authenticated polling because EventSource cannot attach auth
  // headers and credentials are never accepted in query strings.
  const ssePath = (req.url || '').split('?')[0]
  const sseMatch = ssePath.match(/^\/render\/([^/]+)\/status$/)
  if (sseMatch && req.method === 'GET') {
    const renderId = sseMatch[1]
    const job = renderJobs.get(renderId)

    if (!job) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Render job not found' }))
      return
    }

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    })

    console.log(`[SSE] Client subscribed to render ${renderId}`)

    // Send initial status
    res.write(
      `data: ${JSON.stringify({
        status: job.status,
        progress: job.progress,
        outputUrl: job.outputUrl,
        hlsUrl: (job as any).hlsUrl,
        hlsRenditions: (job as any).hlsRenditions,
        error: job.error,
      })}\n\n`
    )

    // Poll for updates every 500ms
    const interval = setInterval(() => {
      const currentJob = renderJobs.get(renderId)
      if (!currentJob) {
        res.write(`data: ${JSON.stringify({ status: 'not_found' })}\n\n`)
        clearInterval(interval)
        res.end()
        return
      }

      res.write(
        `data: ${JSON.stringify({
          status: currentJob.status,
          progress: currentJob.progress,
          outputUrl: currentJob.outputUrl,
          error: currentJob.error,
        })}\n\n`
      )

      // Close connection when job is done
      if (currentJob.status === 'completed' || currentJob.status === 'failed') {
        console.log(`[SSE] Render ${renderId} finished, closing SSE connection`)
        clearInterval(interval)
        res.end()
      }
    }, 500)

    // Clean up on client disconnect
    req.on('close', () => {
      console.log(`[SSE] Client disconnected from render ${renderId}`)
      clearInterval(interval)
    })

    return
  }

  // Get render status (polling alternative to SSE)
  // Тот же приём: путь без query, иначе ?initData ломает совпадение.
  const statusMatch = (req.url || '').split('?')[0].match(/^\/render\/([^/]+)$/)
  if (statusMatch && req.method === 'GET') {
    const renderId = statusMatch[1]
    const job = renderJobs.get(renderId)

    if (!job) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Render job not found' }))
      return
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        id: job.id,
        status: job.status,
        progress: job.progress,
        outputUrl: job.outputUrl,
        hlsUrl: (job as any).hlsUrl, // HLS streaming URL (Tigris CDN)
        hlsRenditions: (job as any).hlsRenditions, // Available quality levels
        publicUrl: job.publicUrl,
        error: job.error,
      })
    )
    return
  }

  // Universal template render endpoint
  if (req.url === '/render/template' && req.method === 'POST') {
    const renderOwner = chatIdentity(req, verifiedTelegramId(req))
    if (!renderOwner && auth.via !== 'api-key') {
      sendJson(res, 401, { error: 'verified identity required' })
      return
    }

    let body = ''
    req.on('data', chunk => {
      body += chunk.toString()
    })

    req.on('end', async () => {
      const isAdmin = renderOwner === TELEGRAM_OWNER_ID
      let quotaReserved = false
      let quotaPeriod: string | null = null
      try {
        const request: TemplateRenderRequest = JSON.parse(body)

        if (!request.compositionId) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'compositionId is required' }))
          return
        }

        if (
          renderOwner &&
          request.userInfo?.telegram_id != null &&
          String(request.userInfo.telegram_id) !== renderOwner
        ) {
          sendJson(res, 403, { error: 'render owner mismatch' })
          return
        }

        if (renderOwner) {
          let reservation: Awaited<ReturnType<typeof reserveRenderQuota>>
          try {
            reservation = await reserveRenderQuota(
              getPool(),
              renderOwner,
              isAdmin
            )
          } catch {
            sendJson(res, 503, { error: 'render quota unavailable' })
            return
          }
          if (!reservation.allowed) {
            sendJson(res, 429, {
              error: 'render quota exhausted',
              free_remaining: 0,
            })
            return
          }
          quotaReserved = true
          quotaPeriod = reservation.periodStart
        }

        const renderId = randomUUID()
        const fps = 30
        const startTime = Date.now()

        // Create job entry
        renderJobs.set(renderId, {
          id: renderId,
          status: 'pending',
          progress: 0,
          startedAt: new Date(),
        })

        // Return immediately with job info
        res.writeHead(202, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            success: true,
            renderId,
            compositionId: request.compositionId,
            statusUrl: `/render/${renderId}`,
            sseUrl: `/render/${renderId}/status`,
            message: 'Render started. Use SSE endpoint for progress updates.',
          })
        )

        // Start render in background
        ;(async () => {
          const job = renderJobs.get(renderId)!
          job.status = 'rendering'

          try {
            if (!bundleLocation) {
              throw new Error('Bundle not initialized')
            }

            // Build input props from request
            const inputProps: Record<string, unknown> = {
              ...(request.props || {}),
            }

            /**
             * null means "nothing was measured, keep calculateMetadata's
             * answer". It used to be 900 and it used to be applied
             * unconditionally, which is how a 3.2-second clip was published as
             * a 30-second freeze-frame (feed id 20). See src/render-duration.ts.
             */
            let measuredDurationInFrames: number | null = null

            /**
             * Read the clip from `props` too, not only from the top level.
             *
             * reel_render (src/agent/tools.ts:1032) sends ONLY
             * {compositionId, props}, so this whole block -- duration
             * detection, face cropping, the default segment -- was dead code
             * for every render the agent has ever started.
             */
            let lipSyncVideoPath = lipSyncVideoOf(request)

            // Pre-download S3 assets for faster rendering
            if (lipSyncVideoPath && lipSyncVideoPath.includes('/s3/')) {
              console.log(
                `📥 Pre-downloading lipSyncVideo for template render...`
              )
              lipSyncVideoPath = await preDownloadS3Asset(lipSyncVideoPath)
            }

            if (lipSyncVideoPath) {
              inputProps.lipSyncVideo = lipSyncVideoPath

              const videoPath = resolveMediaPath(lipSyncVideoPath)
              if (fs.existsSync(videoPath)) {
                // Get video duration
                const duration = getVideoDuration(videoPath)
                measuredDurationInFrames = templateDurationInFrames({
                  measuredSeconds: duration,
                  fps,
                })
                if (measuredDurationInFrames) {
                  console.log(
                    `📏 Video duration: ${duration.toFixed(2)}s = ${measuredDurationInFrames} frames`
                  )
                }

                // Auto face detection (if not already provided)
                if (inputProps.faceOffsetX === undefined) {
                  try {
                    console.log(`👤 Auto-detecting face in: ${videoPath}`)
                    const faceBox = await detectFaceInVideo(videoPath)
                    if (faceBox) {
                      const crop = calculateCropSettings(faceBox, 'portrait')
                      inputProps.faceOffsetX = crop.offsetX
                      inputProps.faceOffsetY = crop.offsetY
                      inputProps.faceScale = crop.scale
                      console.log(
                        `✅ Face detected: offsetX=${crop.offsetX.toFixed(1)}, offsetY=${crop.offsetY.toFixed(1)}, scale=${crop.scale.toFixed(2)}`
                      )
                    }
                  } catch (e) {
                    // Та же развилка, что и у первого обработчика: недоступность
                    // модуля уже объявлена один раз и должна уехать в задание,
                    // а разовый сбой распознавания — просто в лог.
                    if (faceCroppingUnavailable()) {
                      inputProps.faceCroppingUnavailable =
                        faceCroppingUnavailable()
                    } else {
                      console.warn('⚠️ Face detection failed:', e)
                    }
                  }
                }
              }
            }

            // Handle segments (convert from seconds to frames)
            if (request.segments) {
              inputProps.segments = convertSegmentsToFrames(
                request.segments,
                fps
              )
            } else if (lipSyncVideoPath && !inputProps.segments) {
              /**
               * Default fullscreen segment. When nothing was measured this
               * used to be exactly 900 frames; a segment longer than the
               * composition is harmless (SplitTalkingHead falls back to
               * fullscreen for any frame no segment covers), a segment SHORTER
               * than it silently truncates the b-roll rhythm. So an unmeasured
               * clip gets a deliberately generous cover rather than a guess
               * that could cut the reel short.
               */
              inputProps.segments = [
                {
                  type: 'fullscreen',
                  startFrame: 0,
                  durationFrames: measuredDurationInFrames ?? 30 * 60 * fps,
                  caption: '',
                },
              ]
            }

            // Handle captions
            if (request.captions) {
              inputProps.captions = request.captions
              inputProps.showCaptions = request.captions.length > 0
            }

            // Apply template-specific defaults
            const templateDefaults: Record<string, Record<string, unknown>> = {
              SplitTalkingHead: {
                splitRatio: 0.5,
                musicVolume: 0.06,
                videoVolume: 1, // LipSync video audio volume
                captionColor: '#FFFF00',
                captionStyle: {},
                faceOffsetX: 0,
                faceOffsetY: 0,
                faceScale: 1,
              },
              LipSyncMain: {
                musicVolume: 0.06,
              },
              LipSyncBusiness: {
                musicVolume: 0.06,
              },
            }

            const defaults = templateDefaults[request.compositionId] || {}
            for (const [key, value] of Object.entries(defaults)) {
              if (inputProps[key] === undefined) {
                inputProps[key] = value
              }
            }

            console.log(
              `🎬 Rendering ${request.compositionId} with props:`,
              Object.keys(inputProps)
            )

            // Select composition
            const composition = await selectComposition({
              serveUrl: bundleLocation,
              id: request.compositionId,
              inputProps,
              chromiumOptions: {
                enableMultiProcessOnLinux: true,
                disableWebSecurity: true,
                gl: null,
                headless: true,
                // Флагов Chrome здесь БЫТЬ НЕ МОЖЕТ: ChromiumOptions в Remotion 4.0.388 не
                // знает поля args, и весь список (--no-sandbox, --disable-dev-shm-usage и
                // прочие) молча игнорировался. Он выглядел как защита от нехватки памяти,
                // которой на самом деле не было. Нехватку процессов лечим конкурентностью
                // по доле контейнера — см. containerCpuCount() выше.
              },
              timeoutInMilliseconds: 300000, // 5 minutes for slow video loading
            })

            /**
             * Override ONLY what was measured here. Anything else is already
             * on the composition, put there by calculateMetadata, which reads
             * the video's real metadata (over http as well as from disk).
             * Overwriting it with a constant is what produced the freeze-frame.
             */
            if (measuredDurationInFrames) {
              console.log(
                `📏 Overriding composition duration: ${composition.durationInFrames} → ${measuredDurationInFrames}`
              )
              ;(composition as any).durationInFrames = measuredDurationInFrames
            } else {
              console.log(
                `📏 Duration from calculateMetadata: ${composition.durationInFrames} frames (nothing measured locally)`
              )
            }

            // Render video
            const outputPath = path.join(OUTPUT_DIR, `${renderId}.mp4`)

            await renderMedia({
              composition,
              serveUrl: bundleLocation,
              codec: 'h264',
              outputLocation: outputPath,
              inputProps,
              concurrency: OPTIMAL_CONCURRENCY,
              audioCodec: 'aac', // AAC is standard for MP4
              audioBitrate: '256k', // High quality audio
              chromiumOptions: {
                enableMultiProcessOnLinux: true,
                disableWebSecurity: true,
                gl: null,
                headless: true,
                // Флагов Chrome здесь БЫТЬ НЕ МОЖЕТ: ChromiumOptions в Remotion 4.0.388 не
                // знает поля args, и весь список (--no-sandbox, --disable-dev-shm-usage и
                // прочие) молча игнорировался. Он выглядел как защита от нехватки памяти,
                // которой на самом деле не было. Нехватку процессов лечим конкурентностью
                // по доле контейнера — см. containerCpuCount() выше.
              },
              timeoutInMilliseconds: 300000, // 5 minutes for slow video loading
              onProgress: ({ progress }) => {
                job.progress = Math.round(progress * 100)
              },
            })

            // Upload to S3 if enabled (default: true)
            let publicUrl: string | undefined
            if (request.uploadToS3 !== false) {
              const uploadResult = await uploadRenderedFile(
                outputPath,
                request.s3Prefix || 'renders/'
              )
              if (uploadResult.success) {
                publicUrl = uploadResult.url
              }
            }

            // Update job status
            job.status = 'completed'
            job.progress = 100
            job.outputUrl = publicUrl || `/renders/${renderId}.mp4`

            const renderTimeMs = Date.now() - startTime
            console.log(
              `✅ [Render] ${renderId} completed in ${renderTimeMs}ms`
            )

            // Send webhook if configured
            if (request.webhookUrl) {
              sendWebhook(
                request.webhookUrl,
                {
                  renderId,
                  status: 'completed',
                  publicUrl,
                  renderTimeMs,
                  timestamp: new Date().toISOString(),
                },
                request.webhookSecret
              )
            }

            // Send Telegram notification with video
            if (publicUrl) {
              const renderTimeSec = Math.round(renderTimeMs / 1000)
              const userInfo = request.userInfo
              const caption = userInfo
                ? `✅ <b>Рендер готов!</b>\n\n👤 ${userInfo.first_name || 'Unknown'} (@${userInfo.username || 'нет'})\n📹 ${userInfo.project_name || 'Untitled'}\n⏱ ${renderTimeSec}s`
                : `✅ <b>Рендер готов!</b>\n\n⏱ ${renderTimeSec}s`
              await sendTelegramVideo(
                TELEGRAM_RENDERS_GROUP,
                publicUrl,
                caption
              )

              // Auto-publish to community feed
              if (userInfo && userInfo.telegram_id) {
                await publishToFeed({
                  telegramId: userInfo.telegram_id,
                  creatorName:
                    userInfo.first_name || userInfo.username || 'Anonymous',
                  projectName: userInfo.project_name || 'Vibee Reel',
                  videoUrl: publicUrl,
                  templateSettings: request.inputProps || request.props || {},
                  assets: (request as any).assets || [],
                  tracks: (request as any).tracks || [],
                })
              }
            }
          } catch (error) {
            console.error(`❌ [Render] ${renderId} failed:`, error)
            job.status = 'failed'
            job.error = error instanceof Error ? error.message : 'Unknown error'
            if (quotaReserved && renderOwner) {
              await refundRenderQuota(
                getPool(),
                renderOwner,
                isAdmin,
                quotaPeriod
              )
            }

            // Send failure webhook
            if (request.webhookUrl) {
              sendWebhook(
                request.webhookUrl,
                {
                  renderId,
                  status: 'failed',
                  error: job.error,
                  renderTimeMs: Date.now() - startTime,
                  timestamp: new Date().toISOString(),
                },
                request.webhookSecret
              )
            }
          }
        })()
      } catch (error) {
        if (quotaReserved && renderOwner) {
          await refundRenderQuota(getPool(), renderOwner, isAdmin, quotaPeriod)
        }
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON' }))
      }
    })
    return
  }

  // Render endpoint - starts async render and returns immediately
  if (req.url === '/render' && req.method === 'POST') {
    const renderOwner = chatIdentity(req, verifiedTelegramId(req))
    if (!renderOwner && auth.via !== 'api-key') {
      sendJson(res, 401, { error: 'verified identity required' })
      return
    }
    let body = ''
    req.on('data', chunk => {
      body += chunk.toString()
    })

    req.on('end', async () => {
      try {
        const renderReq: RenderRequest = JSON.parse(body)

        if (!renderReq.compositionId) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'compositionId is required' }))
          return
        }

        // Существует ли такая композиция — проверяется ЗДЕСЬ, а не в рендере.
        //
        // Раньше проверялось только что строка непустая. POST с
        // compositionId "TextOverlay" получал 202 и renderId, а падал через
        // ~15 секунд: "Could not find composition with ID TextOverlay".
        // Замерено. Клиент к тому моменту уже показал человеку прогресс.
        try {
          const available = (await knownCompositions()).map(c => c.id)
          if (!available.includes(renderReq.compositionId)) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                error: `Unknown compositionId "${renderReq.compositionId}"`,
                available,
              })
            )
            return
          }
        } catch (e) {
          // Бандл не готов — это не повод отвергать задачу: рендер всё равно
          // ждёт бандл сам. Пропускаем дальше, как было до проверки.
          console.warn(
            'Composition check skipped:',
            e instanceof Error ? e.message : e
          )
        }

        const isAdmin = renderOwner === TELEGRAM_OWNER_ID
        let quotaPeriod: string | null = null
        if (renderOwner) {
          let reservation: Awaited<ReturnType<typeof reserveRenderQuota>>
          try {
            reservation = await reserveRenderQuota(
              getPool(),
              renderOwner,
              isAdmin
            )
          } catch {
            sendJson(res, 503, { error: 'render quota unavailable' })
            return
          }
          if (!reservation.allowed) {
            sendJson(res, 429, {
              error: 'render quota exhausted',
              free_remaining: 0,
            })
            return
          }
          quotaPeriod = reservation.periodStart
        }

        // Start render asynchronously and return immediately. Failed renders
        // restore the reservation; successful ones were already counted at
        // admission, so a client cannot skip accounting by omitting a log call.
        const renderId = startRenderAsync(
          renderReq,
          renderOwner
            ? () =>
                refundRenderQuota(getPool(), renderOwner, isAdmin, quotaPeriod)
            : undefined
        )
        console.log(`🎬 Started async render: ${renderId}`)

        res.writeHead(202, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            success: true,
            renderId,
            statusUrl: `/render/${renderId}`,
            sseUrl: `/render/${renderId}/status`,
            message: 'Render started. Use SSE endpoint for progress updates.',
          })
        )
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON' }))
      }
    })
    return
  }

  // ==============================================
  // HLS Streaming Endpoints (Video Optimization)
  // ==============================================

  const HLS_DIR = path.join(process.cwd(), 'public', 'hls')
  if (!fs.existsSync(HLS_DIR)) {
    fs.mkdirSync(HLS_DIR, { recursive: true })
  }

  // HLS conversion jobs storage
  interface HLSJob {
    id: string
    status: 'pending' | 'processing' | 'completed' | 'failed'
    progress: number
    playlistUrl?: string
    renditionUrls?: Record<string, string>
    duration?: number
    error?: string
    startedAt: Date
  }
  const hlsJobs = new Map<string, HLSJob>()

  // POST /convert/hls - Convert MP4 to HLS
  if (req.url === '/convert/hls' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => {
      body += chunk
    })
    req.on('end', async () => {
      try {
        const {
          video_url,
          renditions = ['360p', '720p', '1080p'],
          segment_duration = 6,
        } = JSON.parse(body)

        if (!video_url) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'video_url is required' }))
          return
        }

        const jobId = randomUUID()
        const videoId = `hls-${Date.now()}`
        const hlsOutputDir = path.join(HLS_DIR, videoId)
        fs.mkdirSync(hlsOutputDir, { recursive: true })

        // Create job entry
        hlsJobs.set(jobId, {
          id: jobId,
          status: 'pending',
          progress: 0,
          startedAt: new Date(),
        })

        // Return immediately with job info
        res.writeHead(202, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            success: true,
            job_id: jobId,
            video_id: videoId,
            status_url: `/hls/status/${jobId}`,
            message: 'HLS conversion started',
          })
        )

        // Start HLS conversion in background
        ;(async () => {
          const job = hlsJobs.get(jobId)!
          job.status = 'processing'

          try {
            // Download video if it's a URL
            let inputPath = video_url
            if (video_url.startsWith('http')) {
              const tempPath = path.join(hlsOutputDir, 'input.mp4')
              console.log(
                `📥 Downloading video for HLS conversion: ${video_url}`
              )

              const response = await fetch(video_url)
              const buffer = Buffer.from(await response.arrayBuffer())
              fs.writeFileSync(tempPath, buffer)
              inputPath = tempPath
            }

            // Get video duration
            const duration = getVideoDuration(inputPath)
            job.duration = duration

            // Rendition configurations
            const renditionConfigs: Record<
              string,
              { width: number; height: number; bitrate: number }
            > = {
              '360p': { width: 640, height: 360, bitrate: 800 },
              '480p': { width: 854, height: 480, bitrate: 1400 },
              '720p': { width: 1280, height: 720, bitrate: 2800 },
              '1080p': { width: 1920, height: 1080, bitrate: 5000 },
            }

            const renditionUrls: Record<string, string> = {}
            const totalRenditions = renditions.length
            let completedRenditions = 0

            // Create each rendition
            for (const quality of renditions) {
              const config = renditionConfigs[quality]
              if (!config) continue

              const renditionDir = path.join(hlsOutputDir, quality)
              fs.mkdirSync(renditionDir, { recursive: true })

              const playlistPath = path.join(renditionDir, 'playlist.m3u8')

              console.log(`🎬 [HLS ${quality}] запуск ffmpeg`)
              execFileSync(
                'ffmpeg',
                [
                  '-i',
                  ffArg(inputPath),
                  '-vf',
                  `scale=${ffArg(config.width)}:${ffArg(config.height)}`,
                  '-c:v',
                  'libx264',
                  '-preset',
                  'fast',
                  '-b:v',
                  `${ffArg(config.bitrate)}k`,
                  '-c:a',
                  'aac',
                  '-b:a',
                  '128k',
                  '-hls_time',
                  ffArg(String(segment_duration)),
                  '-hls_list_size',
                  '0',
                  '-hls_segment_filename',
                  ffArg(path.join(renditionDir, 'segment%03d.ts')),
                  '-f',
                  'hls',
                  ffArg(playlistPath),
                ],
                { stdio: 'pipe', timeout: 600000 }
              )

              renditionUrls[quality] =
                `/hls/${videoId}/${quality}/playlist.m3u8`
              completedRenditions++
              job.progress = Math.round(
                (completedRenditions / totalRenditions) * 100
              )
            }

            // Create master playlist
            const masterPlaylist = ['#EXTM3U', '#EXT-X-VERSION:3']

            for (const quality of renditions) {
              const config = renditionConfigs[quality]
              if (!config || !renditionUrls[quality]) continue

              masterPlaylist.push(
                `#EXT-X-STREAM-INF:BANDWIDTH=${config.bitrate * 1000},RESOLUTION=${config.width}x${config.height}`,
                `${quality}/playlist.m3u8`
              )
            }

            fs.writeFileSync(
              path.join(hlsOutputDir, 'master.m3u8'),
              masterPlaylist.join('\n')
            )

            // Update job
            job.status = 'completed'
            job.progress = 100
            job.playlistUrl = `/hls/${videoId}/master.m3u8`
            job.renditionUrls = renditionUrls

            console.log(`✅ HLS conversion completed: ${job.playlistUrl}`)

            // Clean up temp input
            if (
              video_url.startsWith('http') &&
              fs.existsSync(path.join(hlsOutputDir, 'input.mp4'))
            ) {
              fs.unlinkSync(path.join(hlsOutputDir, 'input.mp4'))
            }
          } catch (error) {
            console.error(`❌ HLS conversion failed:`, error)
            job.status = 'failed'
            job.error =
              error instanceof Error ? error.message : 'Conversion failed'
          }
        })()
      } catch (error) {
        console.error('HLS conversion error:', error)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'HLS conversion failed' }))
      }
    })
    return
  }

  // GET /hls/status/{job_id} - Check HLS conversion status
  const hlsStatusMatch = req.url?.match(/^\/hls\/status\/([^/]+)$/)
  if (hlsStatusMatch && req.method === 'GET') {
    const jobId = hlsStatusMatch[1]
    const job = hlsJobs.get(jobId)

    if (!job) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'HLS job not found' }))
      return
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        status: job.status,
        progress: job.progress,
        playlist_url: job.playlistUrl,
        rendition_urls: job.renditionUrls,
        duration: job.duration,
        error: job.error,
      })
    )
    return
  }

  // GET /hls/{video_id}/master.m3u8 - Serve HLS master manifest
  // GET /hls/{video_id}/{quality}/playlist.m3u8 - Serve quality playlist
  // GET /hls/{video_id}/{quality}/*.ts - Serve segments
  if (req.url?.startsWith('/hls/') && req.method === 'GET') {
    const hlsPath = req.url.slice(5) // Remove /hls/
    const filePath = path.join(HLS_DIR, hlsPath)

    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath)
      const contentType =
        ext === '.m3u8' ? 'application/vnd.apple.mpegurl' : 'video/mp2t'

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      })
      fs.createReadStream(filePath).pipe(res)
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'HLS file not found' }))
    }
    return
  }

  // ==============================================
  // Video Optimization Endpoints
  // ==============================================

  // GET /video/{video_id}/metadata - Get video metadata for preloading
  const metadataMatch = req.url?.match(/^\/video\/([^/]+)\/metadata$/)
  if (metadataMatch && req.method === 'GET') {
    const videoId = decodeURIComponent(metadataMatch[1])

    try {
      // Find the video file
      let videoPath = ''
      const possiblePaths = [
        path.join(OUTPUT_DIR, `${videoId}.mp4`),
        path.join(process.cwd(), 'public', videoId),
        path.join(HLS_DIR, videoId, 'input.mp4'),
      ]

      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          videoPath = p
          break
        }
      }

      if (!videoPath) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Video not found' }))
        return
      }

      // Get metadata using ffprobe
      const probeResult = execFileSync(
        'ffprobe',
        [
          '-v',
          'error',
          '-select_streams',
          'v:0',
          '-show_entries',
          'stream=width,height,r_frame_rate,codec_name,bit_rate',
          '-show_entries',
          'format=duration,size',
          '-of',
          'json',
          ffArg(videoPath),
        ],
        { encoding: 'utf-8', timeout: 30000 }
      )

      const probeData = JSON.parse(probeResult)
      const stream = probeData.streams?.[0] || {}
      const format = probeData.format || {}

      // Parse frame rate
      const fpsMatch = stream.r_frame_rate?.match(/(\d+)\/(\d+)/)
      const fps = fpsMatch ? parseInt(fpsMatch[1]) / parseInt(fpsMatch[2]) : 30

      // Generate poster (first frame)
      const posterPath = path.join(OUTPUT_DIR, `${videoId}-poster.webp`)
      if (!fs.existsSync(posterPath)) {
        execFileSync(
          'ffmpeg',
          [
            '-i',
            ffArg(videoPath),
            '-vframes',
            '1',
            '-f',
            'webp',
            '-q:v',
            '80',
            ffArg(posterPath),
            '-y',
          ],
          { stdio: 'pipe', timeout: 30000 }
        )
      }

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      })
      res.end(
        JSON.stringify({
          duration: parseFloat(format.duration) || 0,
          width: stream.width || 0,
          height: stream.height || 0,
          fps: Math.round(fps * 100) / 100,
          codec: stream.codec_name || 'unknown',
          bitrate: parseInt(stream.bit_rate) || 0,
          poster_url: `/renders/${videoId}-poster.webp`,
          size_bytes: parseInt(format.size) || 0,
        })
      )
    } catch (error) {
      console.error('Metadata extraction error:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Failed to get metadata' }))
    }
    return
  }

  // POST /video/{video_id}/poster - Generate poster image
  const posterMatch = req.url?.match(/^\/video\/([^/]+)\/poster$/)
  if (posterMatch && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => {
      body += chunk
    })
    req.on('end', async () => {
      try {
        const videoId = decodeURIComponent(posterMatch[1])
        const {
          timestamp = 0,
          format = 'webp',
          quality = 80,
        } = JSON.parse(body || '{}')

        // Find video
        const videoPath = path.join(OUTPUT_DIR, `${videoId}.mp4`)
        if (!fs.existsSync(videoPath)) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Video not found' }))
          return
        }

        // Клиентские timestamp/format/quality — числа и два формата на выбор.
        // Всё, что не число/не из списка, отбрасываем ДО ffmpeg: аргументы
        // теперь массив, но мусор в них всё равно не нужен.
        const ts = Number.isFinite(Number(timestamp)) ? Number(timestamp) : 0
        const fmt = format === 'png' ? 'png' : 'webp'
        const q = Math.min(Math.max(Math.round(Number(quality) || 80), 1), 100)

        const posterFilename = `${videoId}-poster-${ts.toFixed(1)}.${fmt}`
        const posterPath = path.join(OUTPUT_DIR, posterFilename)

        // Generate poster at specified timestamp
        execFileSync(
          'ffmpeg',
          [
            '-ss',
            ffArg(String(ts)),
            '-i',
            ffArg(videoPath),
            '-vframes',
            '1',
            '-f',
            fmt,
            '-q:v',
            ffArg(String(q)),
            ffArg(posterPath),
            '-y',
          ],
          { stdio: 'pipe', timeout: 30000 }
        )

        const stats = fs.statSync(posterPath)

        // Get dimensions
        const probeResult = execFileSync(
          'ffprobe',
          [
            '-v',
            'error',
            '-select_streams',
            'v:0',
            '-show_entries',
            'stream=width,height',
            '-of',
            'json',
            ffArg(posterPath),
          ],
          { encoding: 'utf-8', timeout: 10000 }
        )
        const probeData = JSON.parse(probeResult)
        const stream = probeData.streams?.[0] || {}

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            poster_url: `/renders/${posterFilename}`,
            width: stream.width || 0,
            height: stream.height || 0,
            size_bytes: stats.size,
          })
        )
      } catch (error) {
        console.error('Poster generation error:', error)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Failed to generate poster' }))
      }
    })
    return
  }

  // POST /video/optimize - Optimize video for web delivery
  if (req.url === '/video/optimize' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => {
      body += chunk
    })
    req.on('end', async () => {
      try {
        const {
          video_url,
          target_codec = 'h264',
          quality = 'balanced',
          max_bitrate,
        } = JSON.parse(body)

        if (!video_url) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'video_url is required' }))
          return
        }

        const videoId = `opt-${Date.now()}`
        const outputPath = path.join(OUTPUT_DIR, `${videoId}.mp4`)

        // Download video if URL. video_url приходит от клиента — только
        // публичные http/https хосты (SSRF), как у webhook.
        let inputPath = video_url
        if (video_url.startsWith('http')) {
          const tempPath = path.join(OUTPUT_DIR, `temp-${videoId}.mp4`)
          const response = await fetch(assertFetchable(video_url))
          const buffer = Buffer.from(await response.arrayBuffer())
          fs.writeFileSync(tempPath, buffer)
          inputPath = tempPath
        }

        const originalStats = fs.statSync(inputPath)
        const originalSize = originalStats.size

        // Quality presets
        const presets: Record<string, { preset: string; crf: number }> = {
          fast: { preset: 'ultrafast', crf: 28 },
          balanced: { preset: 'fast', crf: 23 },
          quality: { preset: 'slow', crf: 18 },
        }
        const preset = presets[quality] || presets.balanced

        // Кодек — белый список, битрейт — целое число: оба приходят от
        // клиента и раньше попадали в командную строку.
        const codecArgs: Record<string, string[]> = {
          h264: [
            '-c:v',
            'libx264',
            '-preset',
            preset.preset,
            '-crf',
            String(preset.crf),
          ],
          h265: [
            '-c:v',
            'libx265',
            '-preset',
            preset.preset,
            '-crf',
            String(preset.crf),
          ],
          av1: [
            '-c:v',
            'libaom-av1',
            '-crf',
            String(preset.crf),
            '-cpu-used',
            '4',
          ],
        }
        const codec = codecArgs[target_codec] || codecArgs.h264

        const bitrateArgs: string[] = []
        if (Number.isFinite(Number(max_bitrate)) && Number(max_bitrate) > 0) {
          const br = Math.round(Number(max_bitrate))
          bitrateArgs.push('-maxrate', `${br}k`, '-bufsize', `${br * 2}k`)
        }

        console.log(
          `🔄 Optimizing video: ${quality} preset, ${target_codec} codec`
        )
        execFileSync(
          'ffmpeg',
          [
            '-i',
            ffArg(inputPath),
            ...codec,
            ...bitrateArgs,
            '-c:a',
            'aac',
            '-b:a',
            '128k',
            '-movflags',
            '+faststart',
            '-y',
            ffArg(outputPath),
          ],
          { stdio: 'pipe', timeout: 600000 }
        )

        const optimizedStats = fs.statSync(outputPath)
        const optimizedSize = optimizedStats.size

        // Clean up temp file
        if (video_url.startsWith('http') && fs.existsSync(inputPath)) {
          fs.unlinkSync(inputPath)
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            optimized_url: `/renders/${videoId}.mp4`,
            original_size: originalSize,
            optimized_size: optimizedSize,
            compression_ratio:
              Math.round((1 - optimizedSize / originalSize) * 100) / 100,
            codec: target_codec,
          })
        )
      } catch (error) {
        console.error('Video optimization error:', error)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Video optimization failed' }))
      }
    })
    return
  }

  // ==============================================
  // CDN Integration Endpoints
  // ==============================================

  // POST /cdn/upload - Upload video to CDN with optimized headers
  if (req.url === '/cdn/upload' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => {
      body += chunk
    })
    req.on('end', async () => {
      try {
        const {
          video_url,
          cache_ttl = 31536000, // 1 year default
          immutable = true,
        } = JSON.parse(body)

        if (!video_url) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'video_url is required' }))
          return
        }

        // Download video
        let videoBuffer: Buffer
        if (video_url.startsWith('http')) {
          const response = await fetch(video_url)
          videoBuffer = Buffer.from(await response.arrayBuffer())
        } else {
          const localPath = path.join(process.cwd(), 'public', video_url)
          if (!fs.existsSync(localPath)) {
            res.writeHead(404, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Video not found' }))
            return
          }
          videoBuffer = fs.readFileSync(localPath)
        }

        // Upload to S3 with CDN-optimized headers
        const filename = `cdn-${Date.now()}.mp4`
        const key = `cdn/${filename}`

        await s3Client.send(
          new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
            Body: videoBuffer,
            ContentType: 'video/mp4',
            CacheControl: immutable
              ? `public, max-age=${cache_ttl}, immutable`
              : `public, max-age=${cache_ttl}`,
            Metadata: {
              'x-vibee-optimized': 'true',
              'x-vibee-cache-ttl': cache_ttl.toString(),
            },
          })
        )

        const cdnUrl = `${S3_PUBLIC_URL}/${key}`

        // Simulate edge locations (in production, this would come from CDN API)
        const edgeLocations = ['us-east-1', 'eu-west-1', 'ap-southeast-1']

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            cdn_url: cdnUrl,
            cache_status: 'uploaded',
            edge_locations: edgeLocations,
            original_size: videoBuffer.length,
          })
        )

        console.log(`✅ CDN upload complete: ${cdnUrl}`)
      } catch (error) {
        console.error('CDN upload error:', error)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'CDN upload failed' }))
      }
    })
    return
  }

  // GET /cdn/status/{video_id} - Get CDN cache status
  const cdnStatusMatch = req.url?.match(/^\/cdn\/status\/([^/]+)$/)
  if (cdnStatusMatch && req.method === 'GET') {
    const videoId = decodeURIComponent(cdnStatusMatch[1])

    try {
      // Check if file exists in CDN (S3)
      const key = `cdn/${videoId}.mp4`

      // Try to get object metadata
      const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key })

      try {
        const response = await s3Client.send(command)

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            cached: true,
            edge_locations: ['us-east-1', 'eu-west-1', 'ap-southeast-1'],
            hit_rate: 0.85, // Simulated
            bandwidth_saved: response.ContentLength || 0,
            ttl_remaining: 31536000,
          })
        )
      } catch {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            cached: false,
            edge_locations: [],
            hit_rate: 0,
            bandwidth_saved: 0,
            ttl_remaining: 0,
          })
        )
      }
    } catch (error) {
      console.error('CDN status error:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Failed to get CDN status' }))
    }
    return
  }

  // DELETE /cdn/cache/{video_id} - Purge CDN cache
  const cdnPurgeMatch = req.url?.match(/^\/cdn\/cache\/([^/]+)$/)
  if (cdnPurgeMatch && req.method === 'DELETE') {
    const videoId = decodeURIComponent(cdnPurgeMatch[1])

    try {
      // In production, this would call CDN purge API
      // For S3, we just delete and re-upload would create new cache
      console.log(`🗑️ CDN cache purge requested for: ${videoId}`)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          purged: true,
          edge_locations_cleared: ['us-east-1', 'eu-west-1', 'ap-southeast-1'],
        })
      )
    } catch (error) {
      console.error('CDN purge error:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'CDN purge failed' }))
    }
    return
  }

  // ===============================
  // Feed & User Endpoints
  // ===============================

  // POST /api/feed/publish - Publish template to community feed
  /**
   * ЖДУТ ОДОБРЕНИЯ — СВОИ СКРЫТЫЕ ПОСТЫ.
   *
   * Единственное место, где запись без `is_public = TRUE` вообще видна. Все
   * остальные чтения фильтруют по нему — и лента, и профиль, и карточка, —
   * поэтому без этого маршрута скрытая публикация была бы невидима И АВТОРУ:
   * одобрять негде, работа автопилота исчезает молча.
   *
   * Только СВОИ: владелец берётся из подписи, а не из строки запроса. Иначе
   * чужие неодобренные черновики читал бы кто угодно по номеру.
   */
  /**
   * SOUL ЧЕЛОВЕКА — ПУБЛИЧНО, ПО ИМЕНИ.
   *
   * SOUL.md — это то, кем человек себя считает и что ему интересно. Владелец
   * решил, что он открыт: на нём строится знакомство людей друг с другом и
   * агентов a2a с людьми. Закрытый SOUL связывать никого не может.
   *
   * Читается БЕЗ подписи — как и профиль рядом. Правка по-прежнему требует
   * личности: открыт на чтение не значит открыт на запись.
   *
   * Отдаём text/markdown, а не HTML: это исходник, который читают и агенты, и
   * человек, и превращать его в разметку на сервере значило бы решить за
   * читателя, как он выглядит.
   */
  if (req.url?.startsWith('/api/soul/') && req.method === 'GET') {
    const имя = decodeURIComponent(req.url.slice('/api/soul/'.length).split('?')[0])
    if (!имя) {
      sendJson(res, 400, { success: false, error: 'username is required' })
      return
    }
    try {
      const pool = await getPool()
      const r = await pool.query(
        `SELECT us.content, us.updated_at::text AS updated_at,
                p.username, p.telegram_id
           FROM profiles p
           LEFT JOIN user_soul us ON us.telegram_id = p.telegram_id::text
          WHERE p.username = $1
          LIMIT 1`,
        [имя]
      )
      if (r.rows.length === 0) {
        sendJson(res, 404, { success: false, error: 'not found' })
        return
      }
      sendJson(res, 200, {
        success: true,
        username: r.rows[0].username,
        // Пустой SOUL — это НЕ ошибка: человек его ещё не написал. Пустая
        // строка и «нет такого человека» — разные ответы, и путать их значит
        // отправлять агента искать несуществующее.
        soul: r.rows[0].content ?? '',
        updatedAt: r.rows[0].updated_at ?? null,
      })
    } catch (e) {
      sendJson(res, 500, { success: false, error: String(e) })
    }
    return
  }

  /**
   * ОБЛОЖКА ПРОФИЛЯ ИЗ АВАТАРКИ И SOUL — ПО НАЖАТИЮ.
   *
   * Владелец решил: обложку делаем за наш счёт, но ТОЛЬКО тому, кто нажал.
   * Автоматически каждому — это расход на всех сразу, включая тех, кто её
   * никогда не увидит; по нажатию платим ровно за желающих.
   *
   * Промпт собирается из двух вещей, которые уже есть: аватарки Telegram
   * (лицо, чтобы обложка была про человека) и его SOUL.md (о чём он). Ничего
   * не выдумываем: пустой SOUL даёт нейтральную обложку, а не сочинённую
   * биографию.
   *
   * С кошелька человека НЕ СПИСЫВАЕМ — это подарок платформы, и списание
   * здесь противоречило бы решению владельца. Ограничитель — раз в сутки:
   * без него одна кнопка превращается в кран.
   */
  if (req.url === '/api/profile/cover' && req.method === 'POST') {
    const кто = chatIdentity(req, verifiedTelegramId(req))
    if (!кто) {
      sendJson(res, 401, { success: false, error: 'unauthorized' })
      return
    }
    try {
      const pool = await getPool()
      const п = await pool.query(
        `SELECT username, avatar_url, cover_updated_at::text AS updated
           FROM profiles WHERE telegram_id = $1 LIMIT 1`,
        [String(кто)]
      )
      if (п.rows.length === 0) {
        sendJson(res, 404, { success: false, error: 'profile not found' })
        return
      }
      const было = п.rows[0].updated ? Date.parse(п.rows[0].updated) : 0
      if (было && Date.now() - было < 24 * 60 * 60 * 1000) {
        // Отказ НАЗЫВАЕТ срок: «нельзя» без «когда можно» человек читает как
        // поломку и жмёт снова.
        sendJson(res, 429, {
          success: false,
          error: 'обложку можно обновлять раз в сутки',
        })
        return
      }

      const s = await pool.query(
        `SELECT content FROM user_soul WHERE telegram_id = $1`,
        [String(кто)]
      )
      const soul = String(s.rows[0]?.content ?? '').slice(0, 1200)
      const аватар = п.rows[0].avatar_url as string | null

      /*
       * Лицо — ИСХОДНИКОМ, а не словами. Описать чужое лицо текстом значит
       * выдумать его; модель правки берёт саму аватарку и делает из неё фон.
       * Нет аватарки — генерируем без исходника, по одному SOUL.
       */
      const prompt =
        'Wide cinematic cover banner for a personal profile, 16:9, ' +
        'dark elegant background, no text, no logos, no faces of other people. ' +
        (soul.trim()
          ? `Mood and subject from this description of the person: ${soul}`
          : 'Neutral abstract technological mood.')

      const результат = await kieGenerateImage({
        prompt,
        aspectRatio: '16:9',
        ...(аватар ? { imageUrl: аватар } : {}),
      })
      if (!результат.ok) {
        // Причина от провайдера уходит НАРУЖУ: «не получилось» без причины
        // человек читает как поломку приложения и жмёт снова.
        sendJson(res, 502, { success: false, error: результат.reason })
        return
      }
      await pool.query(
        `UPDATE profiles
            SET cover_url = $2, cover_updated_at = now()
          WHERE telegram_id = $1`,
        [String(кто), результат.url]
      )
      sendJson(res, 200, { success: true, coverUrl: результат.url })
    } catch (e) {
      sendJson(res, 500, { success: false, error: String(e) })
    }
    return
  }

  if (
    (req.url || '').split('?')[0] === '/api/feed/pending' &&
    req.method === 'GET'
  ) {
    /*
     * ПУТЬ, А НЕ ВЕСЬ АДРЕС.
     *
     * Здесь стояло `req.url === '/api/feed/pending'`, а `req.url` несёт и
     * строку запроса. Любой параметр — и сравнение не совпадало, запрос
     * проваливался ниже, к общему сторожу ленты, и получал 404 «лента такого
     * не обслуживает». Маршрут был не сломан, а НЕДОСТИЖИМ по части
     * обращений, и выглядело это как «раздела нет».
     *
     * Нашлось живой проверкой цепочки одобрения, а не чтением: веб зовёт без
     * параметров и работал.
     */
    /*
     * ЛИЧНОСТЬ — ПОДПИСЬ ИЛИ ВНУТРЕННИЙ КЛЮЧ С ЯВНЫМ telegram_id.
     *
     * Второй путь не для удобства: без него ни агент, ни проверка до раздела
     * не доходят — пускала только подпись мини-аппа. Приём тот же, что у
     * `DELETE /api/feed/:id` рядом: один способ на два маршрута.
     */
    const внутренний = new URL(req.url || '', 'http://x').searchParams
    const кто =
      chatIdentity(req, verifiedTelegramId(req)) ||
      внутренний.get('telegram_id')
    if (!кто) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unauthorized' }))
      return
    }
    try {
      const pool = await getPool()
      const r = await pool.query(
        `SELECT id, name, description, thumbnail_url, video_url,
                created_at::text
           FROM public_templates
          WHERE telegram_id = $1 AND is_public = FALSE AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT 50`,
        [String(кто)]
      )
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, templates: r.rows }))
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: false, error: String(e) }))
    }
    return
  }

  /**
   * ОДОБРИТЬ — сделать свой скрытый пост видимым.
   *
   * `telegram_id = $2` в условии, а не проверка после выборки: иначе чужой
   * пост можно было бы открыть, зная его номер. Тот же приём, что у удаления
   * рядом.
   */
  if (req.url === '/api/feed/approve' && req.method === 'POST') {
    const кто = chatIdentity(req, verifiedTelegramId(req))
    if (!кто) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unauthorized' }))
      return
    }
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString()
    })
    req.on('end', async () => {
      try {
        const { id } = JSON.parse(body || '{}')
        if (!id) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: 'id is required' }))
          return
        }
        const pool = await getPool()
        const r = await pool.query(
          `UPDATE public_templates
              SET is_public = TRUE
            WHERE id = $1 AND telegram_id = $2 AND deleted_at IS NULL
            RETURNING id`,
          [id, String(кто)]
        )
        if (r.rows.length === 0) {
          // Не «нашли, но чужой» и не «нет такого» по отдельности: разделив
          // их, мы дали бы способ проверять существование чужих постов.
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: 'not found' }))
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, id: r.rows[0].id }))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: String(e) }))
      }
    })
    return
  }

  if (req.url === '/api/feed/publish' && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString()
    })
    req.on('end', async () => {
      try {
        const data = JSON.parse(body)

        // The owner of the post is the VERIFIED caller, never the body's claim.
        //
        // publishTemplateRow keys the upsert on data.telegram_id and re-stamps
        // creator_username from that user's row. Left to the body, any signed-in
        // mini-app user could POST another user's telegram_id + name and
        // overwrite their feed post — video, thumbnail, description — force it
        // public (is_public = TRUE) and resurrect one they had removed
        // (deleted_at = NULL), all still carrying the victim's real @username.
        //
        // The route is not public (isPublic returns false for POST
        // /api/feed/publish), so the global guard already required a credential:
        // a Telegram signature or the internal X-Api-Key. A signed caller is
        // pinned to their own id here. The internal render->self call carries
        // the key, not a signature, so chatIdentity is null for it — and only
        // then is the body's telegram_id trusted, exactly as the sibling
        // DELETE /api/feed/:id does it.
        const signer = chatIdentity(req, verifiedTelegramId(req))
        const owner = signer
          ? String(signer)
          : data.telegram_id
            ? String(data.telegram_id)
            : null
        if (!owner) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              error: 'unauthorized',
              detail: 'need a Telegram signature or the internal key',
            })
          )
          return
        }
        data.telegram_id = owner

        // Тот же код, что и у автопубликации после рендера. Раньше SQL был
        // написан здесь второй раз, а рендер ходил сюда по сети к самому себе.
        const row = await publishTemplateRow(data)

        /**
         * Публикация в Telegram-канал.
         *
         * Отказ БОЛЬШЕ НЕ МОЛЧИТ. Раньше здесь стоял `catch` с одним
         * `console.warn`, а ответ всё равно уходил `success: true`. Человеку
         * в мини-аппе галочка «Также опубликовать в Telegram» подтверждала
         * успех, которого не было: адрес моста — `vibee-telegram-bridge.fly.dev`,
         * и он отвечает NXDOMAIN, то есть хоста не существует вовсе.
         *
         * Сколько это стоило: за всё время ни один ролик не ушёл в канал, а
         * лента внутри приложения набрала 22 просмотра на 12 роликов. Продукт
         * производил контент, которого никто не видел, и об этом ничего не
         * сообщал.
         *
         * Публикацию в ленту при этом НЕ роняем: запись в базе уже сделана и
         * она полезна сама по себе. Меняется только честность ответа — он
         * теперь говорит, что именно получилось, а что нет.
         */
        let telegram: { posted: boolean; error?: string } | undefined
        /*
         * СКРЫТЫЙ ПОСТ В КАНАЛ НЕ УХОДИТ.
         *
         * Иначе одобрение не значило бы ничего: в ленте пусто, а подписчики
         * канала ролик уже увидели. Скрытая публикация — это «подождите
         * одобрения», и ждать должны ВСЕ витрины, а не только одна.
         *
         * Канал получит ролик при одобрении — там же, где пост становится
         * видимым.
         */
        if (data.post_to_telegram && data.is_public !== false) {
          telegram = await postReelToChannel({
            videoUrl: data.video_url,
            caption:
              data.telegram_caption ||
              // Подпись поста — ТОЛЬКО по-русски: канал русскоязычный, и
              // английские хвосты в нём читаются как чужой шаблон. Прежняя
              // строка была наполовину английской (#vibee #reels #ai) и вела
              // на служебный адрес Railway вместо собственного домена.
              `🎬 ${data.name}\n\n👤 ${data.creator_name}\n🔗 ${CANONICAL_SITE}\n\n#рилс #нейросети #TrinityS3AI`,
          })
          // The mark goes on ONLY after Telegram confirms: a stamp that
          // survives a failed send drops the reel from the queue for ever.
          if (telegram.posted) await markDeliveredToChannel(row.id)
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            success: true,
            id: row.id,
            updated: row.updated,
            // Присутствует, только если публикацию в канал ПРОСИЛИ. Клиент по
            // этому полю понимает, показывать ли человеку «опубликовано в
            // Telegram» или «в ленту добавлено, в канал не ушло».
            telegram,
            template: {
              id: row.id,
              telegram_id: data.telegram_id,
              creator_name: data.creator_name,
              creator_avatar: data.creator_avatar,
              creator_username: row.creator_username,
              name: data.name,
              description: data.description,
              thumbnail_url: data.thumbnail_url,
              video_url: data.video_url,
              template_settings: data.template_settings,
              assets: data.assets,
              tracks: data.tracks,
              likes_count: 0,
              views_count: 0,
              uses_count: 0,
              is_liked: false,
              is_featured: false,
              created_at: row.created_at,
              parent_template_id: data.parent_template_id,
              original_creator_id: data.original_creator_id,
            },
          })
        )
      } catch (error) {
        console.error('[Feed] Publish error:', error)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: 'Failed to publish' }))
      }
    })
    return
  }

  // ── Агент: чат мини-аппа и MCP для любого внешнего агента ──────────────
  // GET /mcp публичен намеренно: агент, которому дали голый адрес, первым
  // делом делает GET, и «405» стоит ему витка, ничего не объяснив.
  if (req.url?.split('?')[0] === '/mcp' && req.method === 'GET') {
    handleMcpCard(res)
    return
  }

  /**
   * A2A — the door for EXTERNAL agents, and it was never mounted.
   *
   * src/agent/a2a.ts is 403 lines of protocol 0.3.0: message/send, a streaming
   * message/stream over SSE, tasks/get, tasks/cancel, the agent card, and a
   * metadata path that calls a named tool DIRECTLY with no model in the loop.
   * Written, typed, deployed -- and all three of its exports were referenced
   * ZERO times here. The only importer in the package was a2a-local.ts, whose
   * first line says it must not be committed and which production does not run.
   *
   * From outside the defect was invisible, because on this server a missing
   * route and a protected route answer identically: the global guard replies
   * 401 before routing, so POST /a2a and GET /deliberately-no-such-path return
   * the same body. Measured 2026-08-31. That is why the reachability test in
   * auth-public.test.ts reads the SOURCE instead of asking the network.
   *
   * THE CARD IS PUBLIC BY CONSTRUCTION (see PUBLIC_EXACT in auth.ts).
   * Discovery is the first step of A2A: a platform fetches the card BEFORE it
   * has any credential, to learn who we are. Nothing in it is secret -- the
   * same names the public MCP card already hands out. Authentication belongs on
   * message/send, which does the work and spends money, and it is there:
   * handleA2A resolves identity itself, exactly as handleMcp does.
   */
  {
    const a2aPath = req.url?.split('?')[0]
    if (
      req.method === 'GET' &&
      (a2aPath === '/.well-known/agent-card.json' ||
        a2aPath === '/.well-known/agent.json')
    ) {
      // The card advertises where to send tasks, so the base must be the
      // address the OUTSIDE world can reach -- the same one every other
      // outward-facing link uses, not the container's loopback.
      handleA2ACard(res, SERVICE_ENDPOINTS.remotion)
      return
    }
    if (a2aPath === '/a2a' && req.method === 'POST') {
      await handleA2A(req, res, getPool)
      return
    }
  }
  /**
   * Маршруты входа для нативного клиента.
   *
   * Стоят ПЕРВЫМИ среди маршрутов: их задача — выдать личность, а не
   * потребовать её. Поставить их ниже значило бы попасть под общий гвард,
   * который как раз и требует того, чего у клиента ещё нет.
   *
   * Обработчик сам решает, его ли адрес, и возвращает false, если нет —
   * та же форма, что у соседей по каскаду.
   */
  /**
   * Where a lost generation is found again.
   *
   * Two routes, both GET, both behind the normal guard: a job carries a prompt
   * and a paid-for url, so it is as personal as a profile. Ownership is
   * enforced inside listJobs, not here — a check that lives next to the data
   * cannot be forgotten by the next caller.
   */
  if (req.url?.startsWith('/api/generate/jobs') && req.method === 'GET') {
    /**
     * Attach the store lazily, and inside a try.
     *
     * `getPool()` throws SYNCHRONOUSLY when DATABASE_URL is unset. Outside a
     * try that escapes an async handler and Node kills the process -- a
     * one-request denial of service, already paid for once in this file's
     * history. A server with no database keeps working memory-only, which is
     * exactly what it did before this table existed.
     */
    try {
      attachStoreOnce()
    } catch {
      // Memory-only. The generation itself never depended on this.
    }

    const id = req.url
      .split('?')[0]
      .replace('/api/generate/jobs', '')
      .replace(/^\//, '')
    const who = generationOwnerId(req)
    if (!who) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'verified owner required' }))
      return
    }
    if (id) {
      const job = await getJobDurable(id)
      // A job that is not yours answers exactly like a job that does not
      // exist. Distinguishing them would let someone enumerate other people's
      // ids by watching which ones say "forbidden".
      if (!job || (job.owner && job.owner !== who)) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'нет такого задания' }))
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(job))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ jobs: await listJobsDurable(who) }))
    return
  }

  if (await handleAuthRouteSafely(req, res, getPool)) return

  /**
   * Projects: the person's timeline, held by the SERVER rather than by
   * localStorage.
   *
   * Placed next to the login routes on purpose — they are its first consumer:
   * the native editor opened a hardcoded demo because there was nobody to ask
   * for a project. No route on this server had the word project in it at all
   * (`grep -c projects render-server.ts` was 0; a live GET /api/projects
   * answered 404).
   *
   * They are NOT in PUBLIC_EXACT and must not be: projects are private, and
   * the shared guard already passes `Authorization: Bearer` on its third
   * branch. The handler checks identity again in its own words, because in
   * warn mode the guard lets everyone through and cannot be relied on as a
   * defence.
   */
  if (await handleProjectRoute(req, res, getPool)) return

  if (req.url?.split('?')[0] === '/mcp' && req.method === 'POST') {
    await handleMcp(req, res, getPool)
    return
  }
  if (req.url?.split('?')[0] === '/api/agent/chat' && req.method === 'POST') {
    // Identity: the mini-app signature OR an agent key (the connector used for
    // testing). telegram_id is never taken from the body -- otherwise anyone
    // could publish under someone else's name. resolveIdentity rather than
    // chatIdentity: a key issued through /api/agent/keys lives in the database,
    // and without reading it the key would not work -- while the issue response
    // promises exactly that way to connect.
    const who = await resolveIdentity(req, getPool)
    if (!who) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          error: 'не удалось определить пользователя',
          detail:
            'нужна подпись Telegram (X-Telegram-Init-Data) или ключ агента (X-Agent-Key)',
        })
      )
      return
    }
    await handleAgentChat(req, res, String(who), getPool)
    return
  }

  /*
   * GET /api/agent/history — ОДИН разговор на обе поверхности.
   *
   * Личность определяется тем же resolveIdentity, что и у чата: маршруты,
   * читающие одно и то же, обязаны опознавать одинаково, иначе рано или
   * поздно один пустит туда, куда второй не пускает.
   */
  if (req.url?.split('?')[0] === '/api/agent/history' && req.method === 'GET') {
    const who = await resolveIdentity(req, getPool)
    if (!who) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          error: 'не удалось определить пользователя',
          detail:
            'нужна подпись Telegram (X-Telegram-Init-Data) или ключ агента (X-Agent-Key)',
        })
      )
      return
    }
    await handleAgentHistory(req, res, String(who), getPool)
    return
  }

  /**
   * Self-service agent keys -- the route its own handler documents.
   *
   * handleAgentKeys has been sitting in routes.ts exported and CALLED BY
   * NOBODY: the endpoints in its JSDoc did not exist on this server, while
   * a2a.ts tells a caller in an error message to "get a key in the mini app
   * (POST /api/agent/keys)". People were being sent to an address that
   * returned 404. An exported function nobody imports is valid TypeScript, so
   * nothing complained.
   *
   * IDENTITY FROM THE SIGNATURE ONLY, deliberately not chatIdentity: that
   * accepts an agent key too, and minting keys with a key lets one leaked key
   * breed more. Issuing a credential requires the human's own Telegram
   * signature.
   */
  if (req.url?.split('?')[0].startsWith('/api/agent/keys')) {
    const owner = verifiedTelegramId(req)
    if (!owner) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          error: 'не удалось определить пользователя',
          detail:
            'ключи выдаются только по подписи мини-аппа (X-Telegram-Init-Data)',
        })
      )
      return
    }
    await handleAgentKeys(req, res, String(owner), getPool)
    return
  }

  /**
   * Маршруты ленты, которых на сервере НЕ БЫЛО ВОВСЕ.
   *
   * Клиент звал пять адресов, обработчик существовал у двух. Остальные три
   * попадали в общий префиксный матчер `startsWith("/api/feed")` и получали
   * в ответ… весь список ленты с кодом 200. То есть лайк «срабатывал»,
   * просмотр «засчитывался», Remix «открывался» — и ни одно действие не
   * доходило до базы, а клиент не видел ошибки, потому что ответ был 200.
   *
   * Проверено живым запросом: GET /api/feed/stats отдавал байт-в-байт то же
   * тело, что GET /api/feed (sha256 совпал), поэтому счётчики на лендинге
   * читались как нули через `|| 0`.
   */
  {
    const feedUrl = new URL(req.url || '', `http://${req.headers.host}`)
    const feedPath = feedUrl.pathname

    // ============================================================
    // STARS-КАССА: покупка токенов звёздами Telegram.
    //
    // Поток: мини-апп зовёт POST /api/tokens/invoice → мы создаём
    // invoice-ссылку через Bot API (валюта XTR) → Telegram.WebApp.
    // openInvoice(link) → Telegram шлёт боту pre_checkout_query и
    // successful_payment на наш вебхук → вебхук пополняет user_tokens.
    // Верификация серверная: клиентскому «оплатил» не верим.
    //
    // ФЕЯ СПИТ ДО ТОКЕНА КАССИРА: нужен ОТДЕЛЬНЫЙ бот (токен в
    // TOKENS_PAYMENT_BOT_TOKEN) — боты 1..12 заняты polling бэкенда,
    // setWebhook на них конфликтует. Владелец даёт токен — фея проснётся.
    // ============================================================
    {
      const PACKS: Record<
        string,
        { tokens: number; stars: number; title: string }
      > = {
        '10': { tokens: 10, stars: 15, title: '10 токенов Trinity' },
        '50': { tokens: 50, stars: 65, title: '50 токенов Trinity' },
        '150': { tokens: 150, stars: 175, title: '150 токенов Trinity' },
      }
      const PAY_BOT = process.env.TOKENS_PAYMENT_BOT_TOKEN || ''

      if (feedPath === '/api/tokens/packs' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            ok: true,
            включено: !!PAY_BOT,
            пакеты: Object.entries(PACKS).map(([id, p]) => ({
              id,
              токенов: p.tokens,
              звёзд: p.stars,
            })),
            подсказка: PAY_BOT
              ? 'открой invoice и оплати звёздами'
              : 'касса ждёт токен бота-кассира от владельца',
          })
        )
        return
      }

      if (feedPath === '/api/tokens/invoice' && req.method === 'POST') {
        const who = chatIdentity(req, verifiedTelegramId(req))
        if (!who) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              ok: false,
              error: 'нужна подпись или ключ агента',
            })
          )
          return
        }
        if (!PAY_BOT) {
          res.writeHead(503, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              ok: false,
              error: 'касса не настроена: TOKENS_PAYMENT_BOT_TOKEN не задан',
            })
          )
          return
        }
        try {
          const body = JSON.parse((await readBody(req)) || '{}')
          const pack = PACKS[String(body.pack)]
          if (!pack) throw new Error('неизвестный пакет')
          const tg = await fetch(
            `https://api.telegram.org/bot${PAY_BOT}/createInvoiceLink`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: pack.title,
                description: 'Токены для генераций в Trinity S³AI',
                payload: `tokens:${pack.tokens}:${who}`,
                currency: 'XTR',
                prices: [{ label: pack.title, amount: pack.stars }],
              }),
            }
          )
          const tgd = await tg.json()
          if (!tgd.ok)
            throw new Error('Bot API: ' + JSON.stringify(tgd).slice(0, 200))
          // Pending-чек: verify потом ищет звёзд-транзакцию от этого
          // человека на эту сумму после этого момента (вебхук-независимо).
          try {
            const pool = await getPool()
            await pool.query(
              `CREATE TABLE IF NOT EXISTS token_invoices (
                 id serial PRIMARY KEY,
                 telegram_id text NOT NULL,
                 tokens int NOT NULL,
                 stars int NOT NULL,
                 created_at timestamptz NOT NULL DEFAULT now(),
                 redeemed boolean NOT NULL DEFAULT false
               )`
            )
            await pool.query(
              `INSERT INTO token_invoices (telegram_id, tokens, stars)
               VALUES ($1, $2, $3)`,
              [who, pack.tokens, pack.stars]
            )
          } catch (e) {
            console.warn(
              '[STARS] pending-чек не записался:',
              String(e).slice(0, 120)
            )
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, link: tgd.result }))
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: String(e).slice(0, 300) }))
        }
        return
      }

      // POST /api/tokens/verify — вебхук-независимое подтверждение оплаты.
      //
      // Вебхук кассира периодически слетает (процессы бэкеда забирают
      // бота в polling), поэтому опираемся на первоисточник: Bot API
      // getStarTransactions. Клиент зовёт verify после «paid»; сервер
      // ищет звёзд-транзакцию от этого человека на сумму пакета после
      // создания инвойса и зачитывает её один раз (UNIQUE-пометка).
      if (feedPath === '/api/tokens/verify' && req.method === 'POST') {
        const who = chatIdentity(req, verifiedTelegramId(req))
        if (!who) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({ ok: false, error: 'нужна подпись или ключ' })
          )
          return
        }
        try {
          const pool = await getPool()
          await pool.query(
            `CREATE TABLE IF NOT EXISTS token_invoices (
               id serial PRIMARY KEY,
               telegram_id text NOT NULL,
               tokens int NOT NULL,
               stars int NOT NULL,
               created_at timestamptz NOT NULL DEFAULT now(),
               redeemed boolean NOT NULL DEFAULT false
             )`
          )
          const pend = await pool.query(
            `SELECT id, tokens, stars, created_at FROM token_invoices
             WHERE telegram_id = $1 AND redeemed = FALSE
             ORDER BY created_at DESC LIMIT 10`,
            [who]
          )
          if (!pend.rows.length) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                ok: false,
                причина: 'неоплаченных инвойсов нет',
              })
            )
            return
          }
          const st = await fetch(
            `https://api.telegram.org/bot${PAY_BOT}/getStarTransactions?limit=100`
          ).then(r => r.json())
          const txs = st?.result?.transactions || []
          // Exclude transactions already tied to this user's redeemed invoices:
          // otherwise one Stars payment could settle several invoices of the
          // same amount across separate calls.
          const usedTxIds = new Set(
            (
              await pool.query(
                `SELECT star_tx_id FROM token_invoices
                 WHERE telegram_id = $1 AND star_tx_id IS NOT NULL`,
                [who]
              )
            ).rows.map((r: any) => String(r.star_tx_id))
          )
          // Гасим самый свежий подходящий pending: сумма совпала,
          // транзакция новее инвойса, от этого пользователя.
          for (const row of pend.rows) {
            const invoiceMs = new Date(row.created_at).getTime()
            const match = txs.find((t: any) => {
              // t.date is Unix SECONDS (Bot API StarTransaction.date). Compared as
              // NUMBERS: it used to be Date.parse(t.date*1000), but Date.parse
              // expects a string and got milliseconds, so it returned NaN, and
              // `NaN > X` is always false. That is why the fallback verification
              // never credited anything, ever.
              const txMs = Number(t.date) * 1000
              return (
                !usedTxIds.has(String(t.id)) &&
                Number(t.amount) === row.stars &&
                t.source?.user?.id === Number(who) &&
                txMs > invoiceMs - 60_000
              )
            })
            if (match) {
              const upd = await pool.query(
                `UPDATE token_invoices SET redeemed = TRUE, star_tx_id = $2
                 WHERE id = $1 AND redeemed = FALSE RETURNING id`,
                [row.id, match.id]
              )
              if (upd.rows.length) {
                /*
                 * ОДИН ЗАМОК НА ОБА ПУТИ ЗАЧИСЛЕНИЯ.
                 *
                 * Здесь стоял свой INSERT в user_tokens, а у пути бота —
                 * creditStarsPayment. Замки были РАЗНЫЕ: тут
                 * `token_invoices.redeemed`, там `star_payments.charge_id`.
                 * Общего ключа нет, значит первая же реальная продажа
                 * зачислилась бы ДВАЖДЫ: мини-апп зовёт verify сразу по
                 * `status === 'paid'` (Chat.tsx), а боту тот же платёж
                 * приезжает опросом. Не гонка — оба срабатывают наверняка.
                 *
                 * Дефект был спящим, пока вебхук кассира не работал и verify
                 * оставался единственным путём. Починка приёма апдейтов его
                 * РАЗБУДИЛА бы — поэтому чинится здесь же.
                 *
                 * Ключ общий и он не выдуман: Telegram документирует, что
                 * `StarTransaction.id` совпадает с
                 * `SuccessfulPayment.telegram_payment_charge_id` для входящих
                 * оплат. Значит обе стороны кладут в star_payments один и тот
                 * же идентификатор, и второй по счёту получает конфликт по
                 * первичному ключу и не начисляет.
                 *
                 * `token_invoices.redeemed` выше остаётся: это отметка «счёт
                 * погашен», отдельная от «деньги зачислены».
                 */
                await creditStarsPayment(pool, {
                  chargeId: String(match.id),
                  telegramId: String(who),
                  amount: row.tokens,
                })
                const bal = await pool.query(
                  `SELECT balance FROM user_tokens WHERE telegram_id = $1`,
                  [who]
                )
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(
                  JSON.stringify({
                    ok: true,
                    зачислено_токенов: row.tokens,
                    баланс: bal.rows[0].balance,
                  })
                )
                return
              }
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              ok: false,
              причина: 'оплаты пока не видно — попробуй через минуту',
            })
          )
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: String(e).slice(0, 300) }))
        }
        return
      }

      /*
       * ЗАЧИСЛЕНИЕ ЗВЁЗД: СЛУЖЕБНЫЙ МАРШРУТ ДЛЯ БОТА, А НЕ ВЕБХУК TELEGRAM.
       *
       * Здесь стоял `POST /api/telegram/stars-wh/<секрет>` — вебхук кассира.
       * Он не работал ни одним из трёх своих участков, и все три молчали:
       *
       *  1. Общий гвард (auth.ts) закрывает всё, что не названо публичным.
       *     Telegram приходит без X-Api-Key и получал 401 — измерено боем
       *     06.09.2026. Секрет в пути задумывался как аутентификация, но до
       *     обработчика запрос не доходил вовсе.
       *  2. `upd.successful_payment` читалось на ВЕРХНЕМ уровне апдейта, где
       *     его не бывает: Telegram кладёт оплату в `update.message.
       *     successful_payment`. Ветка зачисления не сработала бы никогда.
       *  3. Вебхук ставился с `allowed_updates`, где `successful_payment` —
       *     несуществующий тип апдейта; Telegram его выбрасывал, и оплата не
       *     доставлялась сюда в принципе.
       *
       * Три независимых отказа на одном пути — признак того, что путь не
       * проверялся ни разу. Проверить его и нельзя было, не заплатив: тесты
       * закрывали `creditStarsPayment`, а не проводку до неё.
       *
       * Теперь апдейты Telegram принимает ОДИН приёмник — опрос в сервисе
       * бота (как у остальных десяти ботов). Бот сам подтверждает
       * pre_checkout и сам разбирает payload; покупку токенов мини-приложения
       * (`tokens:<сумма>:<id>`) он переправляет сюда, потому что леджер
       * `user_tokens` живёт в базе ЭТОГО сервиса, а не в Supabase бота.
       *
       * Аутентификация — общий гвард, тот же X-Api-Key, которым бот уже
       * ходит в /api/star-paid. Маршрут намеренно НЕ внесён ни в один
       * публичный список: без ключа он отвечает 401, и это проверено тестом.
       */
      const путьЗачисления = (req.url || '').split('?')[0]
      if (путьЗачисления === '/api/stars/credit' && req.method === 'POST') {
        /*
         * ТОЛЬКО КЛЮЧ СЕРВЕРА. Общего гварда здесь НЕДОСТАТОЧНО.
         *
         * Гвард отвечает на вопрос «пускать ли», и says «да» пяти разным
         * способам: ключ сервера, ключ агента, сессия приложения, подпись
         * мини-аппа. Подпись есть у КАЖДОГО, кто открыл мини-апп, — иначе он
         * не смог бы им пользоваться. А этот маршрут начисляет токены, беря
         * сумму и получателя ИЗ ТЕЛА запроса.
         *
         * То есть с одним лишь общим гвардом любой пользователь мини-аппа мог
         * бы прислать сюда {"amount": 999999} и получить токены, за которыми
         * стоят реальные счета FAL, ElevenLabs и OpenAI. Найдено ревью через
         * час после выкладки — моей же правкой и открыто.
         *
         * Здесь нужен не «кто-то опознанный», а «наш сервер». Тот же приём
         * уже применён в этом файле (см. проверку via === 'api-key' у
         * внутренней квитанции).
         */
        if (authenticate(req).via !== 'api-key') {
          res.writeHead(403, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              ok: false,
              error: 'этот маршрут принимает только ключ сервера',
            })
          )
          return
        }
        try {
          const тело = JSON.parse((await readBody(req)) || '{}')
          const сумма = Number(тело.amount)
          const amount = Number.isFinite(сумма) ? сумма : 0
          const tid = String(тело.telegramId || '')
          /*
           * Ключ идемпотентности берётся из самого платежа.
           * `telegram_payment_charge_id` уникален на платёж, и повтор вызова
           * (бот перезапустился между зачислением и фиксацией offset опроса)
           * конфликтует по первичному ключу и не зачисляет второй раз.
           */
          const chargeId = String(тело.chargeId || '')
          /*
           * Пустой chargeId ОТВЕРГАЕТСЯ, а не принимается «как есть».
           *
           * creditStarsPayment без ключа зачисляет БЕЗ дедупликации (его
           * собственная ветка `no charge id — credited without dedup`). То
           * есть повтор вызова начислил бы токены второй раз — ровно то, от
           * чего ключ и защищает. Лучше отказать и разобраться, чем молча
           * начислить дважды.
           */
          if (!(amount > 0) || !tid || !chargeId) {
            /*
             * 400, а НЕ 200. Прежний обработчик отвечал 200 на что угодно,
             * потому что Telegram повторяет доставку на любой не-200. Здесь
             * вызывающий — наш бот, и молчаливое «ок» на кривое тело
             * означало бы потерянную оплату без единой записи в журнале.
             */
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                ok: false,
                error: 'нужны положительный amount, telegramId и chargeId',
              })
            )
            return
          }
          // Логика вынесена в src/stars-credit.ts, чтобы её можно было
          // проверить, не тратя денег, — см. stars-credit.test.ts.
          const pool = await getPool()
          const outcome = await creditStarsPayment(pool, {
            chargeId,
            telegramId: tid,
            amount,
          })
          console.log(
            outcome.credited
              ? `[STARS] +${amount} to ${tid} (${outcome.reason})`
              : `[STARS] not credited for ${tid}: ${outcome.reason}`
          )
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, ...outcome }))
        } catch (e) {
          console.error('[STARS] credit error:', e)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: String(e).slice(0, 300) }))
        }
        return
      }
    }

    // GET /api/blog — прокси RSS-блога t27.ai.
    //
    // Блог живёт на сайте (https://t27.ai/rss.xml), а мини-апп — тут: RSS с
    // чужого домена браузер не прочтёт из-за CORS, поэтому читаем сами и
    // отдаём готовый JSON. Публичен как и сам блог. Кэш 10 минут: RSS
    // обновляется редко, а дёргать сайт на каждый заход ленты незачем.
    if (feedPath === '/api/blog' && req.method === 'GET') {
      if (blogCache && Date.now() - blogCache.at < 10 * 60 * 1000) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(blogCache.data))
        return
      }
      try {
        // Потолок ожидания: t27.ai (GitHub Pages) бывает медленным (замер
        // 7.2с, виток №157) — без потолка зависший fetch держал запрос, а
        // витковый зонд с -m 15 получал пустоту и ложный FAIL.
        const rssResponse = await fetch('https://t27.ai/rss.xml', {
          headers: { 'User-Agent': 'vibee-render-blog-proxy' },
          signal: AbortSignal.timeout(30_000),
        })
        if (!rssResponse.ok)
          throw new Error(`t27.ai RSS: HTTP ${rssResponse.status}`)
        const xml = await rssResponse.text()
        const pick = (block: string, tag: string): string => {
          const m = block.match(
            new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
          )
          if (!m) return ''
          //CDATA и базовые entity — декодируем сразу, иначе текст блога
          //приходит в UI с &quot; и &amp; вместо кавычек и амперсандов
          const decode = (s: string) =>
            s
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#39;|&apos;/g, "'")
              .replace(/&amp;/g, '&')
          return decode(
            m[1]
              .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
              .replace(/<[^>]+>/g, '')
          ).trim()
        }
        const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
          .slice(0, 30)
          .map(([, block]) => ({
            title: pick(block, 'title'),
            link: pick(block, 'link'),
            pubDate: pick(block, 'pubDate'),
            description: pick(block, 'description'),
          }))
          .filter(it => it.title && it.link)
        const data = {
          ok: true,
          title: pick(xml, 'title'),
          description: pick(xml, 'description'),
          items,
        }
        blogCache = { at: Date.now(), data }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(data))
      } catch (error) {
        console.error('[Blog] RSS error:', error)
        // Кэш просроченный всё же лучше пустоты: отдаём, если есть.
        if (blogCache) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(blogCache.data))
          return
        }
        res.writeHead(502, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({ ok: false, error: 'Failed to load blog feed' })
        )
      }
      return
    }

    // GET /api/feed/stats — сводка для лендинга.
    // Объявлен ДО общего GET-матчера, иначе тот перехватит путь по префиксу.
    if (feedPath === '/api/feed/stats' && req.method === 'GET') {
      try {
        const pool = await getPool()
        const r = await pool.query(`
          SELECT COUNT(DISTINCT telegram_id)::int AS creators_count,
                 COUNT(*)::int                    AS reels_count,
                 COALESCE(SUM(views_count), 0)::int AS total_views,
                 COALESCE(SUM(likes_count), 0)::int AS total_likes
          FROM public_templates
          WHERE is_public = TRUE AND deleted_at IS NULL
        `)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(r.rows[0]))
      } catch (error) {
        console.error('[Feed] stats error:', error)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Failed to load feed stats' }))
      }
      return
    }

    const action = feedPath.match(/^\/api\/feed\/(\d+)\/(like|view|use)$/)
    if (action && req.method === 'POST') {
      const templateId = action[1]
      const kind = action[2]
      // The body is drained but not read: identity comes from the signature
      // and the reel id from the URL. Draining lets the stream reach 'end'.
      req.on('data', () => {})
      req.on('end', async () => {
        try {
          // The liker is the VERIFIED caller, never the body.
          //
          // like writes a per-user row (template_likes keyed by telegram_id).
          // The body used to decide it, so any signed-in user could set
          // telegram_id to someone else's id and forge a like on their behalf
          // or remove theirs. The mini-app already signs this request (apiFetch
          // attaches X-Telegram-Init-Data, and the route is not public, so the
          // guard rejects an unsigned caller before here), so the body's
          // telegram_id was redundant for legit callers and unsafe otherwise.
          // view/use are anonymous counters and take no identity — the body is
          // drained and ignored.
          const who = chatIdentity(req, verifiedTelegramId(req))
          const telegramId = who ? String(who) : null
          const pool = await getPool()

          if (kind === 'view') {
            // Просмотр никого не идентифицирует и не требует входа.
            const r = await pool.query(
              `UPDATE public_templates SET views_count = views_count + 1
               WHERE id = $1 AND is_public = TRUE AND deleted_at IS NULL
               RETURNING views_count`,
              [templateId]
            )
            if (!r.rows.length) {
              res.writeHead(404, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'not_found' }))
              return
            }
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                success: true,
                views_count: r.rows[0].views_count,
              })
            )
            return
          }

          if (kind === 'like') {
            if (!telegramId) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'telegram_id_required' }))
              return
            }
            // Переключатель, а не счётчик: повторное нажатие снимает лайк.
            // Считаем ПО ТАБЛИЦЕ, а не инкрементом, иначе двойной запрос
            // (ретрай сети, двойной тап) навсегда разъезжается с истиной.
            const existing = await pool.query(
              `SELECT action FROM template_likes WHERE template_id = $1 AND telegram_id = $2 LIMIT 1`,
              [templateId, telegramId]
            )
            const liked =
              existing.rows.length > 0 && existing.rows[0].action === 'like'
            const next = liked ? 'unlike' : 'like'
            if (existing.rows.length > 0) {
              await pool.query(
                `UPDATE template_likes SET action = $3 WHERE template_id = $1 AND telegram_id = $2`,
                [templateId, telegramId, next]
              )
            } else {
              await pool.query(
                `INSERT INTO template_likes (template_id, telegram_id, action) VALUES ($1, $2, $3)`,
                [templateId, telegramId, next]
              )
            }
            const cnt = await pool.query(
              `UPDATE public_templates SET likes_count =
                 (SELECT COUNT(*) FROM template_likes WHERE template_id = $1 AND action = 'like')
               WHERE id = $1 RETURNING likes_count`,
              [templateId]
            )
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                success: true,
                is_liked: next === 'like',
                likes_count: cnt.rows[0]?.likes_count ?? 0,
              })
            )
            return
          }

          // kind === "use" — Remix. Возвращаем ПОЛНУЮ запись со слоями:
          // без assets и tracks редактор откроется пустым, и «сеть
          // коллабораций» превращается в кнопку, которая ничего не даёт.
          const cnt = await pool.query(
            `UPDATE public_templates SET uses_count = uses_count + 1
             WHERE id = $1 AND is_public = TRUE AND deleted_at IS NULL
             RETURNING id, telegram_id, creator_name, creator_avatar,
                       COALESCE(creator_username, '') AS creator_username,
                       name, description, thumbnail_url, video_url,
                       template_settings::text, assets::text, tracks::text,
                       likes_count, views_count, uses_count, is_featured,
                       created_at::text, parent_template_id, original_creator_id`,
            [templateId]
          )
          if (!cnt.rows.length) {
            res.writeHead(404, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'not_found' }))
            return
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, template: cnt.rows[0] }))
        } catch (error) {
          console.error(`[Feed] ${kind} error:`, error)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Action failed' }))
        }
      })
      return
    }

    // ⭐ ЗВЕЗДА ВМЕСТО ЛАЙКА. Лайк был бесплатным жестом; звезда —
    // Telegram Stars, которая падает автору на баланс. Контур:
    //   1. POST /api/feed/:id/star  — инвойс на 1⭐ (XTR), строка pending
    //   2. клиент открывает openInvoice, человек платит в Telegram
    //   3. бот ловит successful_payment (payload feedstar-*) и зовёт
    //      POST /api/star-paid (сервер-сервер ключ) — строка → paid,
    //      stars_count у ролика растёт; автору бот пишет звёзды на баланс
    //   4. клиент пингует GET /api/feed/:id/star?payload= и видит paid
    const starMatch = feedPath.match(/^\/api\/feed\/(\d+)\/star$/)
    if (starMatch && req.method === 'POST') {
      // Кто шлёт звезду: подпись мини-аппа или ключ агента. НЕ из тела —
      // иначе можно было бы дарить звёзды от чужого имени.
      const who = chatIdentity(req, verifiedTelegramId(req))
      if (!who) {
        sendJson(res, 401, {
          error: 'не удалось определить пользователя',
          detail: 'нужна подпись Telegram или ключ агента',
        })
        return
      }
      const templateId = starMatch[1]
      try {
        const pool = await getPool()
        await pool.query(
          `CREATE TABLE IF NOT EXISTS template_stars (
             id bigserial PRIMARY KEY,
             template_id bigint NOT NULL,
             from_telegram_id text NOT NULL,
             to_telegram_id text NOT NULL,
             amount int NOT NULL DEFAULT 1,
             status text NOT NULL DEFAULT 'pending',
             invoice_payload text UNIQUE NOT NULL,
             created_at timestamptz NOT NULL DEFAULT now(),
             paid_at timestamptz
           )`
        )
        await pool.query(
          `ALTER TABLE public_templates
             ADD COLUMN IF NOT EXISTS stars_count int NOT NULL DEFAULT 0`
        )
        const t = await pool.query(
          `SELECT telegram_id, name FROM public_templates
            WHERE id = $1 AND is_public = TRUE AND deleted_at IS NULL`,
          [templateId]
        )
        if (!t.rows.length) {
          sendJson(res, 404, { error: 'not_found' })
          return
        }
        const author = String(t.rows[0].telegram_id)
        const reelName = String(t.rows[0].name || '').slice(0, 64)
        if (author === String(who)) {
          sendJson(res, 400, {
            error: 'свой ролик звёздами не награждают — подождите зрителей',
          })
          return
        }
        const payload = `feedstar-${randomUUID()}`
        await pool.query(
          `INSERT INTO template_stars
             (template_id, from_telegram_id, to_telegram_id, amount, status, invoice_payload)
           VALUES ($1, $2, $3, 1, 'pending', $4)`,
          [templateId, String(who), author, payload]
        )
        if (!TELEGRAM_BOT_TOKEN) {
          sendJson(res, 503, {
            error: 'TELEGRAM_BOT_TOKEN не задан: звёзды недоступны',
          })
          return
        }
        // Инвойс Stars: provider_token пуст (XTR), хост фиксированный.
        const invResp = await fetch(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/createInvoiceLink`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: 'Звезда автору',
              description: `«${reelName}» — звезда падает автору на баланс`,
              payload,
              provider_token: '',
              currency: 'XTR',
              amount: 1,
            }),
          }
        )
        const inv = (await invResp.json()) as {
          ok: boolean
          result?: string
          description?: string
        }
        // Наружу отдаём только инвойс-ссылку штатного вида t.me/$…;
        // любые другие поля ответа Telegram остаются в логе сервера.
        const invoiceUrl =
          inv.result && /^https:\/\/t\.me\/\$[A-Za-z0-9_-]+$/.test(inv.result)
            ? inv.result
            : null
        if (!inv.ok || !invoiceUrl) {
          console.error('[star] createInvoiceLink failed:', inv.description)
          sendJson(res, 502, { error: 'Telegram не выдал инвойс для звезды' })
          return
        }
        sendJson(res, 200, { invoice_url: invoiceUrl, payload })
      } catch (error) {
        console.error('[star] create error:', error)
        sendJson(res, 500, { error: 'star_create_failed' })
      }
      return
    }

    // Статус звезды: клиент пингует после закрытия инвойса.
    if (starMatch && req.method === 'GET') {
      const payload = new URL(
        req.url || '/',
        'http://localhost'
      ).searchParams.get('payload')
      if (!payload) {
        sendJson(res, 400, { error: 'payload_required' })
        return
      }
      try {
        const pool = await getPool()
        const r = await pool.query(
          `SELECT ts.status, pt.stars_count
             FROM template_stars ts
             JOIN public_templates pt ON pt.id = ts.template_id
            WHERE ts.invoice_payload = $1`,
          [payload]
        )
        if (!r.rows.length) {
          sendJson(res, 404, { error: 'not_found' })
          return
        }
        sendJson(res, 200, {
          status: r.rows[0].status,
          stars_count: r.rows[0].stars_count ?? 0,
        })
      } catch (error) {
        console.error('[star] status error:', error)
        sendJson(res, 500, { error: 'star_status_failed' })
      }
      return
    }
  }

  // POST /api/star-paid — бот сообщил об оплаченной звезде.
  // Только сервер-сервер: ключ RENDER_API_KEY в X-Api-Key; подписи initData
  // здесь недостаточно — внутренний вход не для людей.
  if (req.url?.split('?')[0] === '/api/star-paid' && req.method === 'POST') {
    const key = (req.headers['x-api-key'] as string | undefined) || ''
    const expected = process.env.RENDER_API_KEY || ''
    if (!expected || key !== expected) {
      sendJson(res, 401, { error: 'internal_only' })
      return
    }
    let body: any
    try {
      body = JSON.parse(await readBody(req))
    } catch {
      sendJson(res, 400, { error: 'bad_json' })
      return
    }
    const payload = String(body.payload || '')
    if (!payload.startsWith('feedstar-')) {
      sendJson(res, 400, { error: 'bad_payload' })
      return
    }
    try {
      const pool = await getPool()
      // pending→paid ровно один раз: повторный вебхук не начислит дважды.
      const upd = await pool.query(
        `UPDATE template_stars
            SET status = 'paid', paid_at = now()
          WHERE invoice_payload = $1 AND status = 'pending'
          RETURNING template_id, to_telegram_id, from_telegram_id, amount`,
        [payload]
      )
      if (!upd.rows.length) {
        // уже оплачено или не найдено — идемпотентно отвечаем ok
        sendJson(res, 200, { ok: true, paid: false })
        return
      }
      const row = upd.rows[0]
      await pool.query(
        `UPDATE public_templates SET stars_count = stars_count + $2
          WHERE id = $1`,
        [row.template_id, row.amount]
      )
      sendJson(res, 200, {
        ok: true,
        paid: true,
        template_id: String(row.template_id),
        to_telegram_id: row.to_telegram_id,
        from_telegram_id: row.from_telegram_id,
        amount: row.amount,
      })
    } catch (error) {
      console.error('[star-paid] error:', error)
      sendJson(res, 500, { error: 'star_paid_failed' })
    }
    return
  }

  if (req.url?.startsWith('/api/feed') && req.method === 'GET') {
    /*
     * Третий сегмент у ленты — либо `stats`, либо ЧИСЛОВОЙ id. Всё прочее
     * это 404, а не «вот вам вся лента».
     *
     * СЧЁТА СЕГМЕНТОВ ЗДЕСЬ НЕ ХВАТАЕТ, и я на этом уже ошибся: у
     * `/api/feed/чепуха` ровно столько же сегментов, сколько у
     * `/api/feed/17` и `/api/feed/stats`. Проверка «не больше трёх»
     * пропускала мусор, и правка выглядела сделанной, пока живой запрос к
     * проду не показал ту же самую ленту в ответе.
     *
     * ОСТОРОЖНО: глубже есть настоящий маршрут GET /api/feed/:id/star —
     * он обрабатывается ВЫШЕ (starMatch) и возвращает сам, поэтому сюда не
     * доходит.
     */
    {
      const seg = (req.url || '').split('?')[0].split('/').filter(Boolean)
      const tail = seg[2]
      if (
        seg.length > 3 ||
        (tail !== undefined && tail !== 'stats' && !/^\d+$/.test(tail))
      ) {
        sendJson(res, 404, {
          error: 'Not found',
          detail:
            `Путь «${(req.url || '').split('?')[0]}» лента не обслуживает. ` +
            'Есть /api/feed, /api/feed/:id (число) и /api/feed/stats.',
        })
        return
      }
    }
    const url = new URL(req.url || '', `http://${req.headers.host}`)
    // Схема звёзд создаётся лениво, но читать ленту обязаны и ДО первой
    // звезды: GET делает LEFT JOIN по template_stars и SELECT stars_count —
    // без таблицы/колонки лента падает 500 на свежей базе (так и случилось
    // в проде 24.08: таблицу создавал только POST /:id/star, до которого
    // дело не дошло). IF NOT EXISTS — идемпотентно, дальше это no-op.
    try {
      const pool = await getPool()
      await pool.query(
        `CREATE TABLE IF NOT EXISTS template_stars (
           id bigserial PRIMARY KEY,
           template_id bigint NOT NULL,
           from_telegram_id text NOT NULL,
           to_telegram_id text NOT NULL,
           amount int NOT NULL DEFAULT 1,
           status text NOT NULL DEFAULT 'pending',
           invoice_payload text UNIQUE NOT NULL,
           created_at timestamptz NOT NULL DEFAULT now(),
           paid_at timestamptz
         )`
      )
      await pool.query(
        `ALTER TABLE public_templates
           ADD COLUMN IF NOT EXISTS stars_count int NOT NULL DEFAULT 0`
      )
    } catch (e) {
      console.warn('[feed] stars schema ensure failed:', e)
    }
    if (req.url?.match(/\/api\/feed\/\d+/)) {
      // GET /api/feed/:id - Get single template
      // pathname, а НЕ req.url. `req.url.split("/").pop()` отдавал id ВМЕСТЕ
      // со строкой запроса: для /api/feed/3?user_id=42 получалось "3?user_id=42",
      // Postgres не мог привести это к integer и маршрут падал в 500 при
      // ЛЮБОМ параметре. А user_id клиент шлёт всегда, когда человек вошёл.
      const id = url.pathname.split('/').pop()
      const userId = verifiedViewerId(req) // was url query — see verifiedViewerId
      try {
        // getPool() внутри try: снаружи его синхронный throw при незаданном
        // DATABASE_URL уходил из async-обработчика и убивал процесс.
        const pool = await getPool()
        const query = `
          SELECT pt.id, pt.telegram_id, pt.creator_name, pt.creator_avatar,
          COALESCE(pt.creator_username, '') as creator_username, pt.name, pt.description,
          pt.thumbnail_url, pt.video_url, pt.template_settings::text, pt.assets::text,
          pt.tracks::text, pt.likes_count, pt.views_count, pt.uses_count,
          COALESCE(pt.stars_count, 0) as stars_count,
          CASE WHEN tl.telegram_id IS NOT NULL THEN TRUE ELSE FALSE END as is_liked,
          CASE WHEN tst.id IS NOT NULL THEN TRUE ELSE FALSE END as is_starred,
          pt.is_featured, pt.created_at::text, pt.parent_template_id, pt.original_creator_id
          FROM public_templates pt
          LEFT JOIN template_likes tl ON pt.id = tl.template_id AND tl.telegram_id = $2 AND tl.action = 'like'
          LEFT JOIN template_stars tst ON tst.template_id = pt.id AND tst.from_telegram_id = $2 AND tst.status = 'paid'
          WHERE pt.id = $1 AND pt.is_public = TRUE AND pt.deleted_at IS NULL
        `
        const result = await pool.query(query, [id, userId])
        if (result.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Template not found' }))
          return
        }
        const row = result.rows[0]
        sendJson(res, 200, {
          id: row.id,
          telegramId: row.telegram_id,
          creatorName: row.creator_name,
          creatorAvatar: row.creator_avatar,
          creatorUsername: row.creator_username,
          name: row.name,
          description: row.description,
          thumbnailUrl: row.thumbnail_url,
          videoUrl: row.video_url,
          templateSettings: row.template_settings,
          assets: row.assets,
          tracks: row.tracks,
          likesCount: row.likes_count || 0,
          viewsCount: row.views_count || 0,
          usesCount: row.uses_count || 0,
          starsCount: row.stars_count || 0,
          isStarred: row.is_starred || false,
          isLiked: row.is_liked || false,
          isFeatured: row.is_featured || false,
          createdAt: row.created_at,
          parentTemplateId: row.parent_template_id,
          originalCreatorId: row.original_creator_id,
        })
      } catch (error) {
        console.error('Template error:', error)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Failed to fetch template' }))
      }
      return
    } else {
      // GET /api/feed - Get feed list
      const limit = parseInt(url.searchParams.get('limit') || '20')
      // Клиент шлёт page, а читался только offset — пагинация не работала
      // вовсе. Проверено живыми запросами: ?page=0|1|2&limit=1 давали одну и
      // ту же запись, а ?offset=1&limit=1 — следующую. Принимаем оба, offset
      // главнее (он точнее), page переводится в offset.
      const pageParam = url.searchParams.get('page')
      const offsetParam = url.searchParams.get('offset')
      const limitSafe =
        Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 20
      const offset =
        offsetParam !== null
          ? Math.max(0, parseInt(offsetParam) || 0)
          : Math.max(0, (parseInt(pageParam || '0') || 0) * limitSafe)
      const userId = verifiedViewerId(req) // was url query — see verifiedViewerId
      const search = url.searchParams.get('search') || ''
      // Значение search раньше вклеивалось в SQL строкой:
      //   AND (pt.name ILIKE '%${search}%' ...)
      // тогда как limit/offset/userId в том же запросе биндились как $1/$2/$3.
      // Это была SQL-инъекция без аутентификации. Теперь search — тоже
      // параметр ($4), а % экранируются, чтобы пользовательский ввод не менял
      // семантику LIKE-шаблона.
      const searchFilter = search
        ? 'AND (pt.name ILIKE $4 OR pt.description ILIKE $4)'
        : ''
      const searchPattern = search
        ? `%${search.replace(/([\\%_])/g, '\\$1')}%`
        : null

      // Только фиксированные варианты: ORDER BY нельзя параметризовать, поэтому
      // подстановка допустима лишь из закрытого списка, что здесь и сделано.
      // Клиент шлёт recent|popular, сервер понимал только likes — вкладка
      // «Popular» не сортировала ничего и молча отдавала то же, что «Recent».
      // ORDER BY параметризовать нельзя, поэтому подстановка только из
      // закрытого списка.
      const sortParam = url.searchParams.get('sort')
      const orderBy =
        sortParam === 'likes' || sortParam === 'popular'
          ? 'pt.likes_count DESC, pt.created_at DESC'
          : 'pt.created_at DESC'

      try {
        // getPool() внутри try, а не перед ним. Он бросает синхронно, если
        // DATABASE_URL не задан, и снаружи try это исключение уходило из
        // async-обработчика как unhandled rejection — Node 20 в ответ убивает
        // процесс. Проверено в проде: два падения 18.08 в 15:09:16 и 15:09:19,
        // стек `at getPool (render-server.ts:84:13)`, клиент получил три 502.
        // То есть любой мог положить сервер одним GET /api/feed без авторизации.
        const pool = await getPool()
        const query = `
          SELECT pt.id, pt.telegram_id, pt.creator_name, pt.creator_avatar,
          COALESCE(pt.creator_username, '') as creator_username, pt.name, pt.description,
          pt.thumbnail_url, pt.video_url, pt.template_settings::text, pt.assets::text,
          pt.tracks::text, pt.likes_count, pt.views_count, pt.uses_count,
          COALESCE(pt.stars_count, 0) as stars_count,
          CASE WHEN tl.telegram_id IS NOT NULL THEN TRUE ELSE FALSE END as is_liked,
          CASE WHEN tst.id IS NOT NULL THEN TRUE ELSE FALSE END as is_starred,
          pt.is_featured, pt.created_at::text, pt.parent_template_id, pt.original_creator_id
          FROM public_templates pt
          LEFT JOIN template_likes tl ON pt.id = tl.template_id AND tl.telegram_id = $3 AND tl.action = 'like'
          LEFT JOIN template_stars tst ON tst.template_id = pt.id AND tst.from_telegram_id = $3 AND tst.status = 'paid'
          WHERE pt.is_public = TRUE AND pt.deleted_at IS NULL ${searchFilter}
            /*
             * ОДИН РОЛИК НА ШАБЛОН, А НЕ ВСЕ СНЯТЫЕ ПО НЕМУ.
             *
             * Лента показывала каждую генерацию отдельной карточкой. Замер
             * по живым данным: 47 записей — это ТРИ композиции
             * (TrinityBlogReel 43, SplitTalkingHead 2, NoirReel 1) и одна
             * без композиции. То есть сорок три карточки подряд были одним и
             * тем же шаблоном с разным текстом — это спам, а не витрина.
             *
             * Берём САМУЮ СВЕЖУЮ запись каждой композиции. Записи без
             * композиции остаются собой: сгруппировать их не по чему, а
             * прятать — значит терять.
             *
             * DISTINCT ON тут не годится: он требует своего порядка
             * сортировки, а лента сортируется по лайкам либо по дате, и
             * порядок задаётся снаружи.
             */
            AND (
              pt.template_settings->>'compositionId' IS NULL
              OR pt.id = (
                SELECT MAX(p2.id) FROM public_templates p2
                 WHERE p2.is_public = TRUE AND p2.deleted_at IS NULL
                   AND p2.template_settings->>'compositionId'
                       = pt.template_settings->>'compositionId'
              )
            )
          ORDER BY ${orderBy} LIMIT $1 OFFSET $2
        `
        const params: unknown[] = [limitSafe, offset, userId]
        if (searchPattern !== null) params.push(searchPattern)
        const result = await pool.query(query, params)
        const templates = result.rows.map(row => ({
          id: row.id,
          telegramId: row.telegram_id,
          creatorName: row.creator_name,
          creatorAvatar: row.creator_avatar,
          creatorUsername: row.creator_username,
          name: row.name,
          description: row.description,
          thumbnailUrl: row.thumbnail_url,
          videoUrl: row.video_url,
          templateSettings: row.template_settings,
          assets: row.assets,
          tracks: row.tracks,
          likesCount: row.likes_count || 0,
          viewsCount: row.views_count || 0,
          usesCount: row.uses_count || 0,
          starsCount: row.stars_count || 0,
          isStarred: row.is_starred || false,
          isLiked: row.is_liked || false,
          isFeatured: row.is_featured || false,
          createdAt: row.created_at,
          parentTemplateId: row.parent_template_id,
          originalCreatorId: row.original_creator_id,
        }))
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ templates }))
      } catch (error) {
        console.error('Feed error:', error)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Failed to fetch feed' }))
      }
      return
    }
  }

  // POST /api/assets — сохранить фото в профиль аватара.
  //
  // Настройки аватара: человек грузит фото ОДИН раз, и дальше весь контент
  // (липсинк, будущие генерации) делается от него. Таблица assets уже
  // связывает файлы с telegram_id; тип avatar_photo отличает «лицо человека»
  // от сгенерированных файлов. Личность — как у агента: подпись initData
  // или ключ агента; telegram_id из тела не принимается никогда.
  if (req.url?.split('?')[0] === '/api/assets' && req.method === 'POST') {
    const who = chatIdentity(req, verifiedTelegramId(req))
    if (!who) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          error: 'не удалось определить пользователя',
          detail:
            'нужна подпись Telegram (X-Telegram-Init-Data) или ключ агента (X-Agent-Key)',
        })
      )
      return
    }
    let body: any
    try {
      body = JSON.parse(await readBody(req))
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'тело запроса не разобрано как JSON' }))
      return
    }
    const url: string = String(body.url ?? '')
    // Только http(s)-ссылки: файл уже должен лежать в хранилище (клиент
    // грузит через /upload). Принять произвольную строку значило бы
    // записать в профиль мусор, который галерея потом отфильтрует.
    if (!/^https?:\/\//.test(url)) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({ error: 'нужна http(s)-ссылка на файл в поле url' })
      )
      return
    }
    const type: string =
      typeof body.type === 'string' && body.type ? body.type : 'avatar_photo'
    try {
      const pool = await getPool()
      // NOT NULL-колонки (storage_path, trigger_word) получают пустую
      // строку — тот же приём, что у бота в saveVideoUrlToSupabase.
      const r = await pool.query(
        `INSERT INTO assets (type, trigger_word, telegram_id, storage_path,
                             public_url, text, bot_name)
         VALUES ($1, '', $2, '', $3, NULL, 'miniapp')
         RETURNING id, created_at::text`,
        [type, String(who), url]
      )
      res.writeHead(201, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          ok: true,
          id: r.rows[0]?.id,
          createdAt: r.rows[0]?.created_at,
        })
      )
    } catch (error) {
      console.error('[POST /api/assets] error:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'не удалось сохранить файл' }))
    }
    return
  }

  // DELETE /api/assets?id=… — убрать фото из профиля аватара.
  //
  // Удалять можно ТОЛЬКО свои строки типа avatar_photo: генерации — это
  // история, её стирать нельзя; чужие строки — нельзя тем более. Владелец
  // определяется так же, как в POST: подпись или ключ агента.
  // DELETE /api/feed/:id — снять СВОЮ публикацию из ленты.
  //
  // ЗАЧЕМ ЭТОТ МАРШРУТ ПОЯВИЛСЯ ТОЛЬКО СЕЙЧАС. Кнопка с корзиной на своей
  // карточке в мини-аппе есть давно: она открывает подтверждение, показывает
  // крутилку и зовёт `DELETE /api/feed/:id`. Обработчика по этому адресу не
  // существовало вовсе, а клиент вдобавок слал `X-Telegram-Id` там, где
  // сервер требует подпись. То есть кнопка не работала НИ РАЗУ с момента,
  // как её нарисовали, и человек видел только исчезающую крутилку.
  //
  // Это НЕ удаление: ставится `deleted_at`. Просмотры и лайки целы, а
  // повторная публикация того же ролика возвращает запись (upsert по имени
  // сбрасывает `deleted_at`). Необратимых кнопок в ленте нет.
  //
  // Здесь же ЕДИНСТВЕННАЯ реализация: инструмент агента `feed_unpublish`
  // ходит сюда по HTTP, а не пишет в таблицу сам. Две двери в одну таблицу
  // в этом файле уже расходились молча — второй раз не повторяем.
  const feedDeleteMatch = req.url?.split('?')[0]?.match(/^\/api\/feed\/(\d+)$/)
  if (feedDeleteMatch && req.method === 'DELETE') {
    /**
     * Владелец: подпись мини-аппа, ключ агента — или `?telegram_id=` для
     * вызова сервер-серверу. Последнее не дыра: общий гвард пропускает такой
     * запрос только с верным `X-Api-Key`, то есть параметр читается лишь у
     * того, кто и так уже доверенный. Ровно так владельца передаёт соседний
     * `/api/feed/publish` — держим один приём, а не два.
     */
    const внутренний = new URL(req.url || '/', 'http://localhost').searchParams
    const who =
      chatIdentity(req, verifiedTelegramId(req)) ||
      внутренний.get('telegram_id')
    if (!who) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          error: 'не удалось определить пользователя',
          detail:
            'нужна подпись Telegram (X-Telegram-Init-Data) или ключ агента (X-Agent-Key)',
        })
      )
      return
    }
    const id = feedDeleteMatch[1]
    try {
      const pool = getPool()
      // Владение проверяется В ТОМ ЖЕ UPDATE: между «проверил» и «снял»
      // не остаётся промежутка, в который что-то могло измениться.
      const upd = await pool.query(
        `UPDATE public_templates
            SET deleted_at = now()
          WHERE id = $1 AND telegram_id = $2 AND deleted_at IS NULL
          RETURNING id, name`,
        [id, String(who)]
      )
      if (upd.rows.length) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            снято: true,
            id: String(upd.rows[0].id),
            название: upd.rows[0].name,
          })
        )
        return
      }
      // Три разных отказа, и человеку важно знать, какой именно: «ничего не
      // произошло» — худший из возможных ответов.
      const было = await pool.query(
        `SELECT telegram_id, deleted_at FROM public_templates WHERE id = $1`,
        [id]
      )
      if (!было.rows.length) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({ снято: false, error: 'такой записи в ленте нет' })
        )
      } else if (String(было.rows[0].telegram_id) !== String(who)) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            снято: false,
            error: 'это чужая публикация — снять нельзя',
          })
        )
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({ снято: false, error: 'эта публикация уже снята' })
        )
      }
    } catch (e) {
      // getPool() бросает СИНХРОННО — вне try это уронило бы процесс целиком.
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          снято: false,
          error: `не удалось снять: ${String(e).slice(0, 160)}`,
        })
      )
    }
    return
  }

  if (req.url?.split('?')[0] === '/api/assets' && req.method === 'DELETE') {
    const who = chatIdentity(req, verifiedTelegramId(req))
    if (!who) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          error: 'не удалось определить пользователя',
          detail:
            'нужна подпись Telegram (X-Telegram-Init-Data) или ключ агента (X-Agent-Key)',
        })
      )
      return
    }
    // База URL нужна только чтобы разобрать query; заголовок Host в ней
    // не участвует — его содержимое чужое, тянуть его в разбор незачем.
    const query = new URL(req.url || '/', 'http://localhost').searchParams
    const rawId = parseInt(query.get('id') || '', 10)
    if (!Number.isInteger(rawId) || rawId <= 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'нужен корректный id в ?id=' }))
      return
    }
    try {
      const pool = await getPool()
      // rowCount 0 = не нашлось СВОЕЙ avatar_photo с таким id; сообщаем
      // именно это, а не «удалено», иначе клиент поверит в успех.
      const r = await pool.query(
        `DELETE FROM assets
          WHERE id = $1 AND telegram_id = $2 AND type = 'avatar_photo'`,
        [rawId, String(who)]
      )
      if ((r.rowCount ?? 0) === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error:
              'не найдено: можно удалять только свои фото из профиля аватара',
          })
        )
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    } catch (error) {
      console.error('[DELETE /api/assets] error:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'не удалось удалить файл' }))
    }
    return
  }

  // GET /api/assets/:telegram_id — история генераций пользователя.
  //
  // СВЯЗАННОСТЬ АССЕТОВ. Бот пишет каждую генерацию в таблицу `assets` из 21
  // места, но до сих пор её никто не читал: `select` по этой таблице нет ни в
  // редакторе, ни здесь — все три ссылки на неё были `.insert()`. То есть
  // пользователь генерировал в боте и не видел результат в мини-аппе, потому
  // что связи между ними просто не существовало. Это её недостающая половина.
  if (req.url?.startsWith('/api/assets/') && req.method === 'GET') {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const telegram_id = url.pathname.split('/').pop()
    if (!telegram_id) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid telegram_id' }))
      return
    }
    // ЛИЧНАЯ ИСТОРИЯ — только своя. Общий гвард пропускает этот префикс
    // (хендлеры здесь проверяют сами), поэтому сверяем подписанта/ключ
    // агента с запрошенным id. До этой правки проверялась лишь валидность
    // подписи: подписанный человек мог подставить ЧУЖОЙ id в путь.
    const who = chatIdentity(req, verifiedTelegramId(req))
    if (!who || String(who) !== String(telegram_id)) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          error: 'история доступна только её владельцу',
          detail:
            'подпись Telegram или ключ агента должны совпадать с telegram_id в пути',
        })
      )
      return
    }
    const limit = Math.min(
      parseInt(url.searchParams.get('limit') || '50', 10) || 50,
      200
    )
    const kind = url.searchParams.get('type') // необязательный фильтр по модели

    try {
      const pool = await getPool()
      // telegram_id в этой таблице text — см. миграцию. Приводим явно, иначе
      // числовой параметр не сматчится и вернётся пустой список без ошибки.
      const params: unknown[] = [String(telegram_id), limit]
      let typeFilter = ''
      if (kind) {
        typeFilter = 'AND type = $3'
        params.push(kind)
      }
      const result = await pool.query(
        `SELECT id, type, public_url, text, bot_name, created_at::text
           FROM assets
          WHERE telegram_id = $1
            -- Строки без играбельной ссылки бесполезны для галереи. В проде
            -- таких 13: они появились до фикса записи и починить их нечем.
            AND public_url LIKE 'http%'
            ${typeFilter}
          ORDER BY created_at DESC
          LIMIT $2`,
        params
      )
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          assets: result.rows.map(r => ({
            id: r.id,
            type: r.type,
            url: r.public_url,
            prompt: r.text,
            botName: r.bot_name,
            createdAt: r.created_at,
          })),
        })
      )
    } catch (error) {
      console.error('Assets error:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Failed to fetch assets' }))
    }
    return
  }

  // POST /api/users/sync-from-telegram — синк профиля из данных Telegram.
  //
  // Раньше профиль показывал автора ПОСЛЕДНЕГО ПОСТА (fallback на
  // public_templates): имя и аватар из Telegram никуда не сохранялись —
  // автологин заполнял только userAtom в памяти клиента. Теперь подпись
  // initData (или dev-ключ владельца) даёт серверу verified id + user,
  // и профиль upsert'ится по-настоящему: users + profiles.
  if (
    req.url?.split('?')[0] === '/api/users/sync-from-telegram' &&
    req.method === 'POST'
  ) {
    try {
      const pool = await getPool()
      let tgId = ''
      let firstName = ''
      let lastName = ''
      let username = ''
      let photoUrl: string | null = null

      const initRaw = (req.headers['x-telegram-init-data'] as string) || ''
      // The signature is CHECKED before anything in initData is believed.
      //
      // This route is on the public list in auth.ts, so the global guard does
      // not look at it — the handler is the only thing standing here. It used
      // to parse this header straight into `tgId` and then run
      // `UPDATE users ... WHERE telegram_id = $1`, so a forged
      // x-telegram-init-data naming someone else's id was enough to rewrite
      // their username, first name and profile. No key, no session, no
      // signature.
      //
      // verifiedTelegramId() reads this very header and verifies it
      // (auth.ts:413); the check was simply not used here. An unverified
      // header is now treated as no header at all, which drops through to the
      // key-owner branch below rather than trusting the caller's word.
      if (initRaw && verifyTelegramInitData(initRaw).ok) {
        const params = new URLSearchParams(initRaw)
        try {
          const u = JSON.parse(params.get('user') || '{}')
          tgId = String(u.id ?? '')
          firstName = String(u.first_name ?? '')
          lastName = String(u.last_name ?? '')
          username = String(u.username ?? '')
          photoUrl = u.photo_url ?? null
        } catch {
          /* повреждённый user — ответим честной ошибкой ниже */
        }
      }
      // Browser/app sessions may read the profile that the verified Login
      // Widget already persisted, but they may not rewrite Telegram-owned
      // attributes from a client JSON body.
      if (!tgId) {
        const sessionOwner = chatIdentity(req, null)
        if (sessionOwner) {
          const existing = await pool.query(
            `SELECT telegram_id, username, display_name, avatar_url
               FROM profiles WHERE telegram_id = $1 LIMIT 1`,
            [sessionOwner]
          )
          if (!existing.rows.length) {
            sendJson(res, 404, { error: 'verified profile not found' })
            return
          }
          const row = existing.rows[0]
          sendJson(res, 200, {
            ok: true,
            telegram_id: String(row.telegram_id),
            username: row.username || null,
            display_name: row.display_name || 'Автор',
            avatar_url: row.avatar_url || null,
          })
          return
        }
      }
      if (!tgId) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: 'нужна проверенная подпись Telegram или сессия приложения',
          })
        )
        return
      }
      const display = [firstName, lastName].filter(Boolean).join(' ') || 'Автор'
      // profiles может не существовать вовсе (на этой базе её нет) —
      // создаём по канону профиля; затем UNIQUE по telegram_id для upsert.
      await pool.query(
        `CREATE TABLE IF NOT EXISTS profiles (
           id serial PRIMARY KEY,
           telegram_id text,
           username text,
           display_name text,
           bio text DEFAULT '',
           avatar_url text,
           cover_url text,
           -- Когда обложку сгенерировали в последний раз. Ограничитель «раз в
           -- сутки» держится на этой колонке: без неё одна кнопка становится
           -- краном, а платит за него платформа.
           cover_updated_at timestamptz,
           social_links jsonb DEFAULT '[]',
           is_public boolean DEFAULT TRUE,
           is_verified boolean DEFAULT FALSE,
           created_at timestamptz DEFAULT now()
         )`
      )
      await pool
        .query(
          `CREATE UNIQUE INDEX IF NOT EXISTS profiles_tg_uniq ON profiles (telegram_id)`
        )
        .catch(async () => {
          await pool.query(
            `DELETE FROM profiles p USING profiles q
             WHERE p.telegram_id = q.telegram_id AND p.id < q.id`
          )
          await pool.query(
            `CREATE UNIQUE INDEX IF NOT EXISTS profiles_tg_uniq ON profiles (telegram_id)`
          )
        })
      // users: telegram_id не уникален в этой базе (PK id, uniq user_id) —
      // честный update-then-insert вместо ON CONFLICT.
      {
        const upd = await pool.query(
          `UPDATE users SET username = $2, first_name = $3
           WHERE telegram_id = $1 RETURNING id`,
          [tgId, username || null, display]
        )
        if (!upd.rows.length) {
          await pool.query(
            `INSERT INTO users (telegram_id, username, first_name)
             VALUES ($1, $2, $3)`,
            [tgId, username || null, display]
          )
        }
      }
      await pool
        .query(
          `INSERT INTO profiles (telegram_id, username, display_name, avatar_url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (telegram_id)
         DO UPDATE SET username = EXCLUDED.username,
                       display_name = EXCLUDED.display_name,
                       avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url)`,
          [tgId, username || null, display, photoUrl]
        )
        .catch(async e => {
          // profiles может не иметь telegram_id-конфликта/колонок — чиним схему
          // один раз и повторяем upsert.
          if (
            String(e).includes('does not exist') ||
            String(e).includes('constraint')
          ) {
            await pool.query(
              `CREATE TABLE IF NOT EXISTS profiles (
               id serial PRIMARY KEY,
               telegram_id text UNIQUE,
               username text,
               display_name text,
               bio text DEFAULT '',
               avatar_url text,
               cover_url text,
           -- Когда обложку сгенерировали в последний раз. Ограничитель «раз в
           -- сутки» держится на этой колонке: без неё одна кнопка становится
           -- краном, а платит за него платформа.
           cover_updated_at timestamptz,
               social_links jsonb DEFAULT '[]',
               is_public boolean DEFAULT TRUE,
               is_verified boolean DEFAULT FALSE,
               created_at timestamptz DEFAULT now()
             )`
            )
            await pool.query(
              `INSERT INTO profiles (telegram_id, username, display_name, avatar_url)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (telegram_id)
             DO UPDATE SET username = EXCLUDED.username,
                           display_name = EXCLUDED.display_name,
                           avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url)`,
              [tgId, username || null, display, photoUrl]
            )
          } else {
            throw e
          }
        })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          ok: true,
          telegram_id: tgId,
          username: username || null,
          display_name: display,
          avatar_url: photoUrl,
        })
      )
    } catch (error) {
      console.error('[sync-from-telegram] error:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Sync failed' }))
    }
    return
  }

  // GET /api/users/id/:telegram_id
  if (req.url?.startsWith('/api/users/id/') && req.method === 'GET') {
    // Ровно /api/users/id/:telegram_id. Раньше /api/users/id/42/что-угодно
    // брал последний сегмент как telegram_id и отдавал пользователя из
    // одних null с кодом 200 — хуже, чем 404: выглядит как живая запись.
    if (rejectExtraSegments(req, res, 4)) return
    const telegram_id = req.url?.split('?')[0].split('/').pop()
    if (!telegram_id) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid telegram_id' }))
      return
    }
    try {
      // getPool() внутри try: снаружи его синхронный throw при незаданном
      // DATABASE_URL уходил из async-обработчика и убивал процесс.
      const pool = await getPool()
      const query = `
        SELECT DISTINCT pt.telegram_id, pt.creator_name as first_name,
        pt.creator_avatar as avatar_url, pt.creator_username as username
        FROM public_templates pt WHERE pt.telegram_id = $1 LIMIT 1
      `
      const result = await pool.query(query, [telegram_id])
      if (result.rows.length === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            id: null,
            telegramId: parseInt(telegram_id),
            username: null,
            firstName: null,
            lastName: '',
            avatarUrl: null,
          })
        )
        return
      }
      const row = result.rows[0]
      let avatarUrl = row.avatar_url
      if (avatarUrl && avatarUrl.includes('t.me/')) {
        // fly.dev мёртв давно: проксируем своим путём, он публичен.
        const self =
          process.env.SELF_URL ||
          'https://vibee-render-production.up.railway.app'
        avatarUrl = `${self}/proxy/image?url=${encodeURIComponent(avatarUrl)}`
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          id: row.telegram_id,
          telegramId: row.telegram_id,
          username: row.username,
          firstName: row.first_name,
          lastName: '',
          avatarUrl,
        })
      )
    } catch (error) {
      console.error('User error:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Failed to fetch user' }))
    }
    return
  }

  /**
   * GET /api/users/:username/templates — работы человека.
   *
   * МАРШРУТА НЕ БЫЛО ВОВСЕ. Запрос попадал в обработчик профиля ниже: тот
   * ловит всё, что начинается на `/api/users/`, берёт вторую часть пути и
   * отдаёт КАРТОЧКУ ПРОФИЛЯ с кодом 200. Клиент читал `data.templates`,
   * получал undefined и показывал «Пока нет видео» — при том, что в том же
   * ответе лежало `templates_count: 17`.
   *
   * То есть профиль НИ У КОГО не показывал работы, а выглядело это как
   * «человек ничего не выложил». Ошибки не было ни в логах, ни в консоли:
   * ответ 200, просто не тот.
   */
  if (
    req.method === 'GET' &&
    /^\/api\/users\/[^/]+\/templates$/.test(req.url?.split('?')[0] || '')
  ) {
    const url = new URL(req.url || '', `http://${req.headers.host}`)
    const username = decodeURIComponent(url.pathname.split('/')[3] || '')
    const page = Math.max(
      0,
      parseInt(url.searchParams.get('page') || '0', 10) || 0
    )
    const limit = Math.min(
      50,
      Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10) || 20)
    )
    try {
      // getPool() внутри try: его синхронный throw иначе уходит из
      // async-обработчика и убивает процесс.
      const pool = await getPool()
      const result = await pool.query(
        `SELECT pt.id, pt.telegram_id, pt.creator_name, pt.creator_avatar,
                COALESCE(pt.creator_username, '') AS creator_username,
                pt.name, pt.description, pt.thumbnail_url, pt.video_url,
                pt.likes_count, pt.views_count, pt.uses_count,
                COALESCE(pt.stars_count, 0) AS stars_count,
                pt.is_featured, pt.created_at::text,
                /*
                 * ПО КАКОМУ ШАБЛОНУ СНЯТ РОЛИК.
                 *
                 * Профиль отдавал только сами ролики, и вкладка «Шаблоны»
                 * показывала 46 карточек подряд. Шаблонов при этом ТРИ —
                 * замер по живой ленте: TrinityBlogReel 43, SplitTalkingHead
                 * 2, NoirReel 1 и один без композиции. Сгруппировать было не
                 * по чему: признак лежит в настройках шаблона, а они сюда не
                 * попадал.
                 *
                 * Отдаём ОДНО поле, а не весь блок настроек: он весит
                 * килобайты на строку (пропсы, плашки, тексты), а для
                 * группировки нужен только идентификатор композиции.
                 */
                pt.template_settings->>'compositionId' AS composition_id
         FROM public_templates pt
         LEFT JOIN profiles p ON p.telegram_id = pt.telegram_id
         WHERE pt.is_public = TRUE AND pt.deleted_at IS NULL
           AND (pt.creator_username = $1 OR p.username = $1)
         ORDER BY pt.created_at DESC
         LIMIT $2 OFFSET $3`,
        [username, limit, page * limit]
      )
      /**
       * СКОЛЬКО РОЛИКОВ У КАЖДОГО ШАБЛОНА — ПО ВСЕМ, А НЕ ПО СТРАНИЦЕ.
       *
       * Профиль отдаёт по 20 записей, и заголовок группы считал загруженные:
       * у шаблона с 43 роликами стояло «20». Неверное число хуже
       * отсутствующего — по нему принимают решение.
       *
       * Отдельным запросом, а не окном по выборке: страница уже урезана
       * `LIMIT`, и посчитать по ней целое нельзя в принципе.
       */
      const counts = await pool.query(
        `SELECT COALESCE(pt.template_settings->>'compositionId', '') AS k,
                COUNT(*)::int AS n
           FROM public_templates pt
           LEFT JOIN profiles p ON p.telegram_id = pt.telegram_id
          WHERE pt.is_public = TRUE AND pt.deleted_at IS NULL
            AND (pt.creator_username = $1 OR p.username = $1)
          GROUP BY 1`,
        [username]
      )
      sendJson(res, 200, {
        compositionCounts: Object.fromEntries(
          counts.rows.map(r => [r.k, r.n])
        ),
        templates: result.rows.map(row => ({
          id: row.id,
          telegramId: row.telegram_id,
          creatorName: row.creator_name,
          creatorAvatar: row.creator_avatar,
          creatorUsername: row.creator_username,
          name: row.name,
          description: row.description,
          thumbnailUrl: row.thumbnail_url,
          videoUrl: row.video_url,
          likesCount: row.likes_count || 0,
          viewsCount: row.views_count || 0,
          usesCount: row.uses_count || 0,
          starsCount: row.stars_count || 0,
          isFeatured: row.is_featured || false,
          createdAt: row.created_at,
          compositionId: row.composition_id || null,
        })),
      })
    } catch (error) {
      console.error('User templates error:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Failed to fetch user templates' }))
    }
    return
  }

  // PUT /api/users/:username - Update only the verified owner's profile.
  if (req.url?.startsWith('/api/users/') && req.method === 'PUT') {
    if (rejectExtraSegments(req, res, 3)) return
    const url = new URL(req.url || '', `http://${req.headers.host}`)
    const username = url.pathname.split('/').filter(Boolean)[2] || ''
    const ownerId = chatIdentity(req, verifiedTelegramId(req))
    if (!ownerId) {
      sendJson(res, 401, { error: 'verified identity required' })
      return
    }
    let body: Record<string, unknown>
    try {
      body = JSON.parse((await readBody(req)) || '{}')
    } catch {
      sendJson(res, 400, { error: 'invalid JSON body' })
      return
    }

    const present = (key: string) =>
      Object.prototype.hasOwnProperty.call(body, key)
    const nullableText = (key: string, max: number) => {
      const value = body[key]
      if (value === null || value === undefined) return null
      if (typeof value !== 'string' || value.length > max)
        throw new Error(`invalid ${key}`)
      return value.trim()
    }

    try {
      const displayName = nullableText('display_name', 100)
      const bio = nullableText('bio', 500)
      const avatarUrl = nullableText('avatar_url', 2048)
      if (present('is_public') && typeof body.is_public !== 'boolean')
        throw new Error('invalid is_public')
      if (avatarUrl && !/^https?:\/\//i.test(avatarUrl))
        throw new Error('invalid avatar_url')

      let socialLinks: unknown[] | null = null
      if (present('social_links')) {
        const raw = body.social_links
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (!Array.isArray(parsed) || parsed.length > 10)
          throw new Error('invalid social_links')
        const allowed = new Set([
          'telegram',
          'instagram',
          'twitter',
          'youtube',
          'tiktok',
          'website',
        ])
        socialLinks = parsed.map(item => {
          if (!item || typeof item !== 'object')
            throw new Error('invalid social_links')
          const link = item as Record<string, unknown>
          const platform = String(link.platform || '')
          const href = String(link.url || '')
          if (
            !allowed.has(platform) ||
            href.length > 2048 ||
            !/^https?:\/\//i.test(href)
          ) {
            throw new Error('invalid social_links')
          }
          return {
            platform,
            url: href,
            ...(typeof link.label === 'string' && link.label.length <= 100
              ? { label: link.label }
              : {}),
          }
        })
      }

      const pool = await getPool()
      const result = await pool.query(
        `UPDATE profiles
            SET display_name = CASE WHEN $3 THEN $4 ELSE display_name END,
                bio = CASE WHEN $5 THEN $6 ELSE bio END,
                avatar_url = CASE WHEN $7 THEN $8 ELSE avatar_url END,
                is_public = CASE WHEN $9 THEN $10 ELSE is_public END,
                social_links = CASE WHEN $11 THEN $12::jsonb ELSE social_links END
          WHERE telegram_id = $1 AND LOWER(username) = LOWER($2)
          RETURNING id, telegram_id, username, display_name, bio, avatar_url,
                    cover_url, social_links, is_public, is_verified,
                    created_at::text`,
        [
          ownerId,
          username,
          present('display_name'),
          displayName,
          present('bio'),
          bio,
          present('avatar_url'),
          avatarUrl,
          present('is_public'),
          present('is_public') ? body.is_public : null,
          present('social_links'),
          JSON.stringify(socialLinks || []),
        ]
      )
      if (!result.rows.length) {
        sendJson(res, 404, { error: 'profile not found for verified owner' })
        return
      }
      const row = result.rows[0]
      const statsResult = await pool.query(
        `SELECT COUNT(*) AS templates_count,
                COALESCE(SUM(views_count), 0) AS total_views,
                COALESCE(SUM(likes_count), 0) AS total_likes
           FROM public_templates
          WHERE telegram_id = $1 AND is_public = TRUE AND deleted_at IS NULL`,
        [ownerId]
      )
      const stats = statsResult.rows[0] || {}
      sendJson(res, 200, {
        profile: {
          ...row,
          social_links: row.social_links || [],
          followers_count: 0,
          following_count: 0,
          templates_count: parseInt(stats.templates_count, 10) || 0,
          total_views: parseInt(stats.total_views, 10) || 0,
          total_likes: parseInt(stats.total_likes, 10) || 0,
          is_following: false,
          is_own_profile: true,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message.startsWith('invalid ')) {
        sendJson(res, 400, { error: message })
      } else {
        console.error('[profile-update] failed')
        sendJson(res, 500, { error: 'profile update failed' })
      }
    }
    return
  }

  // GET /api/users/:username - Get user profile by username
  if (
    req.url?.startsWith('/api/users/') &&
    req.method === 'GET' &&
    !req.url?.includes('/id/')
  ) {
    // Ровно /api/users/:username. Подпути обрабатываются ВЫШЕ (сейчас это
    // /templates); всё остальное — 404, а не карточка профиля с кодом 200.
    if (rejectExtraSegments(req, res, 3)) return
    const url = new URL(req.url || '', `http://${req.headers.host}`)
    const pathParts = url.pathname.split('/').filter(Boolean)
    const usernameIndex = pathParts.indexOf('api') + 2 // /api/users/:username
    const username = pathParts[usernameIndex]
    // Ownership comes only from a verified Mini App signature, app session,
    // or owner-bound agent key. A query parameter is not an identity proof.
    const viewerTelegramId = chatIdentity(req, verifiedTelegramId(req))

    if (!username) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Username is required' }))
      return
    }

    try {
      // getPool() внутри try: снаружи его синхронный throw при незаданном
      // DATABASE_URL уходил из async-обработчика и убивал процесс.
      const pool = await getPool()
      // Try profiles table first, fallback to public_templates
      let profile = null
      let privateProfileHidden = false

      // Attempt 1: profiles table (may not exist)
      try {
        const profileQuery = `
          SELECT p.id, p.telegram_id, p.username, p.display_name, p.bio,
            p.avatar_url, p.cover_url, p.social_links, p.is_public, p.is_verified, p.created_at::text
          FROM profiles p
          WHERE LOWER(p.username) = LOWER($1)
          LIMIT 1
        `
        const profileResult = await pool.query(profileQuery, [username])
        if (profileResult.rows.length > 0) {
          const row = profileResult.rows[0]
          let socialLinks: unknown[] = []
          if (row.social_links) {
            try {
              socialLinks = JSON.parse(row.social_links)
            } catch (_e) {
              socialLinks = []
            }
          }
          let avatarUrl = row.avatar_url
          if (avatarUrl && avatarUrl.includes('t.me/')) {
            const self =
              process.env.SELF_URL ||
              'https://vibee-render-production.up.railway.app'
            avatarUrl = `${self}/proxy/image?url=${encodeURIComponent(avatarUrl)}`
          }
          profile = {
            id: String(row.id),
            telegram_id: String(row.telegram_id),
            username: row.username,
            display_name: row.display_name,
            bio: row.bio,
            avatar_url: avatarUrl,
            cover_url: row.cover_url,
            social_links: socialLinks,
            is_public: row.is_public !== false,
            is_verified: row.is_verified || false,
            created_at: row.created_at,
          }

          // Enforce is_public: a profile marked private is visible only to its
          // verified owner. The flag was computed but never enforced, so a private
          // profile's telegram_id/bio/cover/social_links were returned to any
          // unauthenticated caller of this public GET. Drop it so the private
          // fields fall through to the public-only fallbacks (then a 404).
          if (
            row.is_public === false &&
            String(viewerTelegramId ?? '') !== String(row.telegram_id)
          ) {
            privateProfileHidden = true
            profile = null
          }
        }
      } catch (_e) {
        // profiles table doesn't exist, continue to fallback
        console.log(
          '[Profile] profiles table not available, using public_templates fallback'
        )
      }

      // Attempt 2: Build profile from public_templates
      if (!profile && !privateProfileHidden) {
        const fallbackQuery = `
          SELECT DISTINCT ON (pt.telegram_id)
            pt.telegram_id, pt.creator_name, pt.creator_avatar,
            COALESCE(pt.creator_username, '') as creator_username,
            MIN(pt.created_at)::text as created_at
          FROM public_templates pt
          WHERE LOWER(pt.creator_username) = LOWER($1) AND pt.deleted_at IS NULL
          GROUP BY pt.telegram_id, pt.creator_name, pt.creator_avatar, pt.creator_username
          LIMIT 1
        `
        const fallbackResult = await pool.query(fallbackQuery, [username])
        if (fallbackResult.rows.length > 0) {
          const row = fallbackResult.rows[0]
          let avatarUrl = row.creator_avatar
          if (avatarUrl && avatarUrl.includes('t.me/')) {
            avatarUrl = `${process.env.SELF_URL || 'https://vibee-render-production.up.railway.app'}/proxy/image?url=${encodeURIComponent(avatarUrl)}`
          }
          profile = {
            id: String(row.telegram_id),
            telegram_id: String(row.telegram_id),
            username: row.creator_username || username,
            display_name: row.creator_name,
            bio: null,
            avatar_url: avatarUrl,
            cover_url: null,
            social_links: [],
            is_public: true,
            is_verified: false,
            created_at: row.created_at,
          }
        }
      }

      if (!profile && !privateProfileHidden) {
        // Attempt 3: Check users table
        try {
          const usersQuery = `SELECT telegram_id, username FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1`
          const usersResult = await pool.query(usersQuery, [username])
          if (usersResult.rows.length > 0) {
            const row = usersResult.rows[0]
            profile = {
              id: String(row.telegram_id),
              telegram_id: String(row.telegram_id),
              username: row.username,
              display_name: row.username,
              bio: null,
              avatar_url: null,
              cover_url: null,
              social_links: [],
              is_public: true,
              is_verified: false,
              created_at: new Date().toISOString(),
            }
          }
        } catch (_e) {
          // users table doesn't exist either
        }
      }

      if (!profile) {
        res.writeHead(404, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        })
        res.end(JSON.stringify({ error: 'User not found' }))
        return
      }

      // Get stats from public_templates
      const telegramId = profile.telegram_id
      let templatesCount = 0,
        totalViews = 0,
        totalLikes = 0
      try {
        const statsQuery = `
          SELECT COUNT(*) as templates_count,
            COALESCE(SUM(views_count), 0) as total_views,
            COALESCE(SUM(likes_count), 0) as total_likes
          FROM public_templates
          WHERE telegram_id = $1 AND is_public = TRUE AND deleted_at IS NULL
        `
        const statsResult = await pool.query(statsQuery, [telegramId])
        if (statsResult.rows.length > 0) {
          templatesCount = parseInt(statsResult.rows[0].templates_count) || 0
          totalViews = parseInt(statsResult.rows[0].total_views) || 0
          totalLikes = parseInt(statsResult.rows[0].total_likes) || 0
        }
      } catch (_e) {
        /* stats not critical */
      }

      const isOwnProfile = viewerTelegramId
        ? String(viewerTelegramId) === String(telegramId)
        : false
      const privateCounts = await loadVisiblePrivateProfileCounts(
        pool,
        String(telegramId),
        viewerTelegramId
      )

      const fullProfile = {
        ...profile,
        followers_count: 0,
        following_count: 0,
        templates_count: templatesCount,
        total_views: totalViews,
        total_likes: totalLikes,
        is_following: false,
        is_own_profile: isOwnProfile,
        ...(privateCounts ?? {}),
      }

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      })
      res.end(JSON.stringify(fullProfile))
    } catch (error) {
      console.error('Profile error:', error)
      res.writeHead(500, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      })
      res.end(JSON.stringify({ error: 'Failed to fetch profile' }))
    }
    return
  }

  // GET /api/render-quota
  if (req.url?.startsWith('/api/render-quota') && req.method === 'GET') {
    const verifiedId = chatIdentity(req, verifiedTelegramId(req))
    if (!verifiedId) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'verified identity required' }))
      return
    }

    // Admin is decided by the VERIFIED caller, never by the query parameter.
    // The client syncs user.is_admin from this response, so trusting ?telegram_id
    // let anyone claim the owner's id and be shown the admin UI.
    const isAdmin = verifiedId === TELEGRAM_OWNER_ID

    // Field names must match the shared RenderQuota type the client reads
    // (packages/vibee-atoms/src/types.ts): total_renders / free_remaining /
    // subscription. It used to answer quota_used/quota_limit/quota_remaining,
    // which no reader knows: canRenderAtom evaluated `undefined > 0` and DENIED
    // every non-admin user, logRenderAtom computed NaN, and the header rendered
    // "undefined renders used".
    //
    try {
      sendJson(
        res,
        200,
        await readRenderQuota(await getPool(), verifiedId, isAdmin)
      )
    } catch {
      sendJson(res, 503, { error: 'render quota unavailable' })
    }
    return
  }

  // POST /api/ai/generate-script
  /**
   * ПЕРЕВОД SOUL НА АНГЛИЙСКИЙ — ОДНИМ НАЖАТИЕМ.
   *
   * SOUL открыт и по нему знакомятся; знакомятся не только по-русски.
   * Переписывать его вручную второй раз — работа, которую человек делать не
   * станет, и открытый профиль останется читаемым половине.
   *
   * Возвращаем ТЕКСТ, а не сохраняем: перевод — это черновик, и решает
   * человек. Молча заменить чужие слова о себе нельзя даже переводом.
   *
   * Тот же список провайдеров, что у сценария: заводить второй значило бы
   * получить второй набор ключей и второе место, где они кончаются.
   */
  if (req.url === '/api/soul/translate' && req.method === 'POST') {
    const кто = chatIdentity(req, verifiedTelegramId(req))
    if (!кто) {
      sendJson(res, 401, { success: false, error: 'unauthorized' })
      return
    }
    let body = ''
    req.on('data', (c: Buffer) => {
      body += c.toString()
    })
    req.on('end', async () => {
      try {
        const { text } = JSON.parse(body || '{}')
        const исходник = String(text ?? '').slice(0, 8000)
        if (!исходник.trim()) {
          sendJson(res, 400, { success: false, error: 'текст пуст' })
          return
        }
        const провайдер = ПЕРВЫЙ_ЖИВОЙ_ПРОВАЙДЕР()
        if (!провайдер) {
          // Причина названа: «не получилось» человек читает как поломку и
          // жмёт снова, а ключа от этого не появится.
          sendJson(res, 503, {
            success: false,
            error: 'ни один провайдер текста не подключён',
          })
          return
        }
        const о = await fetch(провайдер.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${провайдер.key}`,
          },
          body: JSON.stringify({
            model: провайдер.model,
            messages: [
              {
                role: 'system',
                content:
                  'Translate the user\'s SOUL.md into natural English. ' +
                  'Keep the markdown structure and heading levels exactly. ' +
                  'Do not add, drop or soften anything: this is what a person ' +
                  'says about themselves. Answer with the translation only.',
              },
              { role: 'user', content: исходник },
            ],
          }),
        })
        if (!о.ok) {
          sendJson(res, 502, {
            success: false,
            error: `${провайдер.имя}: HTTP ${о.status}`,
          })
          return
        }
        const д = (await о.json()) as {
          choices?: { message?: { content?: string } }[]
        }
        const перевод = д.choices?.[0]?.message?.content?.trim()
        if (!перевод) {
          sendJson(res, 502, {
            success: false,
            error: `${провайдер.имя} вернул пустой ответ`,
          })
          return
        }
        // Кто перевёл — в ответе: выбор мог не сбыться, и разница между
        // «выбрал» и «ответил» должна читаться, а не угадываться по стилю.
        sendJson(res, 200, {
          success: true,
          text: перевод,
          provider: провайдер.имя,
          model: провайдер.model,
        })
      } catch (e) {
        sendJson(res, 500, { success: false, error: String(e) })
      }
    })
    return
  }

  /**
   * Первый провайдер текста, у которого есть ключ.
   *
   * Список тот же, что у сценария, и живёт он там же — здесь только выбор
   * первого живого. Вторая копия списка разошлась бы с первой на первой же
   * правке: это уже случалось с ценами, с голосами и со списком моделей.
   */
  const ПЕРВЫЙ_ЖИВОЙ_ПРОВАЙДЕР = () => {
    const все = [
      {
        имя: 'xAI',
        url: 'https://api.x.ai/v1/chat/completions',
        key: process.env.XAI_API_KEY,
        model: 'grok-beta',
      },
      {
        имя: 'z.ai',
        url: 'https://api.z.ai/api/coding/paas/v4/chat/completions',
        key: process.env.GLM_API_KEY,
        model: 'glm-5.3',
      },
      {
        имя: 'KieAI',
        url: 'https://api.kie.ai/v1/chat/completions',
        key: process.env.KIE_AI_API_KEY,
        model: 'gpt-5-2',
      },
    ]
    return все.find((п): п is typeof п & { key: string } => Boolean(п.key))
  }

  if (req.url === '/api/ai/generate-script' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => {
      body += chunk
    })
    req.on('end', async () => {
      try {
        const {
          topic,
          niche,
          style,
          duration,
          language,
          model: requestedModel,
        } = JSON.parse(body) as Record<string, string | undefined>
        if (!topic || topic.trim() === '') {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({ success: false, error: 'topic is required' })
          )
          return
        }
        /**
         * Кто напишет сценарий. xAI, если его ключ есть; иначе KieAI.
         *
         * ПОЧЕМУ ПОЯВИЛСЯ ЗАПАСНОЙ ПУТЬ. Раньше здесь стоял безусловный отказ
         * «xAI API key not configured», и он был правдой: переменной у сервиса
         * нет вовсе. Но правдой перестало быть следствие — что сценарий
         * написать нечем. Обе точки OpenAI-совместимы, ключ KieAI работает, и
         * три его модели проверены живым запросом ИМЕННО ЭТОЙ задачей: им
         * отправили тот же системный запрос и разобрали ответ как JSON с
         * полями voiceover, cover_prompt, broll_prompts и captions.
         *
         * Список моделей закрытый намеренно. Из 32 чат-моделей прайса ключу
         * доступны три; остальные отвечают «The model is not supported».
         * Пропустить имя из запроса без проверки значило бы отдать чужой
         * строке выбор того, за что списываются деньги.
         */
        /**
         * Провайдеры сценария — ТАБЛИЦЕЙ, а не лестницей тернарников.
         *
         * Их стало трое, и вложенные `?:` тут же перестали читаться. Но дело
         * не только в опрятности: выбор идёт ОТ МОДЕЛИ. Человек в приложении
         * тычет в «GLM-5.3», а не в «z.ai», и маршрут обязан по имени модели
         * найти, к кому идти. Лестница же выбирала провайдера первой и лишь
         * потом смотрела на модель — при таком порядке выбор glm-5.3 молча
         * уехал бы в KieAI и вернул чужую модель.
         *
         * ПРО ОТДЕЛЬНЫЙ АДРЕС У z.ai. Кодинг-план живёт НЕ на общей точке
         * `/api/paas/v4`, а на своей: `/api/coding/paas/v4`. Общая на том же
         * ключе отвечает «Insufficient balance», и по этому ответу легко
         * заключить, что ключ пустой, хотя пуст лишь другой кошелёк. Проверено
         * обеими точками подряд.
         */
        const ПРОВАЙДЕРЫ = [
          {
            имя: 'xAI',
            url: 'https://api.x.ai/v1/chat/completions',
            key: process.env.XAI_API_KEY,
            модели: ['grok-beta'],
          },
          {
            имя: 'z.ai',
            url: 'https://api.z.ai/api/coding/paas/v4/chat/completions',
            key: process.env.GLM_API_KEY,
            модели: ['glm-5.3'],
          },
          {
            имя: 'KieAI',
            url: 'https://api.kie.ai/v1/chat/completions',
            key: process.env.KIE_AI_API_KEY,
            модели: ['gpt-5-2', 'gemini-3-pro', 'gemini-2.5-flash'],
          },
        ].filter((п): п is typeof п & { key: string } => Boolean(п.key))

        // Имя модели из запроса сверяется со списком, а не подставляется:
        // иначе вызывающий сам решал бы, за что списываются деньги.
        const поПросьбе = requestedModel // cyrillic-ok
          ? ПРОВАЙДЕРЫ.find(п => п.модели.includes(requestedModel)) // cyrillic-ok
          : undefined
        const выбран = поПросьбе ?? ПРОВАЙДЕРЫ[0]
        const провайдер = выбран
          ? {
              url: выбран.url,
              key: выбран.key,
              model: поПросьбе ? requestedModel! : выбран.модели[0], // cyrillic-ok
              имя: выбран.имя,
            }
          : null

        if (!провайдер) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              success: false,
              error:
                'no script provider configured: set XAI_API_KEY, GLM_API_KEY or KIE_AI_API_KEY',
            })
          )
          return
        }
        const lang = language || 'English'
        const dur = duration || '30 seconds'
        const styl = style || 'engaging and informative'
        const nich = niche ? ` in the ${niche} niche` : ''
        const systemPrompt = `You are a professional video script writer. Generate scripts for short-form videos.
Return ONLY valid JSON in this exact format:
{
  "voiceover": "spoken text for narration",
  "cover_prompt": "detailed image generation prompt for the thumbnail/cover",
  "broll_prompts": ["prompt1", "prompt2", "prompt3"],
  "captions": ["caption1", "caption2"]
}`
        const userPrompt = `Create a ${dur} ${styl} video script about: ${topic}${nich}
Language: ${lang}

The script should be:
- Concise and engaging
- Suitable for short-form video (TikTok, Reels, YouTube Shorts)
- Include visual descriptions for b-roll
- Include catchy captions for text overlays

Return ONLY the JSON, no additional text.`
        const XAI_TIMEOUT_MS = parseInt(
          process.env.API_TIMEOUT_MS || '60000',
          10
        )
        const MAX_RETRIES = 3
        let response: Response | null = null

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            response = await fetch(провайдер.url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${провайдер.key}`,
              },
              body: JSON.stringify({
                model: провайдер.model,
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userPrompt },
                ],
                temperature: 0.7,
                max_tokens: 2000,
              }),
              signal: AbortSignal.timeout(XAI_TIMEOUT_MS),
            })

            if (response.status === 429) {
              const retryAfter = response.headers.get('retry-after')
              const delay = retryAfter
                ? parseInt(retryAfter, 10) * 1000
                : Math.min(1000 * Math.pow(2, attempt + 1), 30000)
              console.warn(
                `⚠️ ${провайдер.имя} rate limited (429), attempt ${attempt + 1}/${MAX_RETRIES + 1}, waiting ${delay}ms...`
              )
              if (attempt < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, delay))
                continue
              }
            }

            if (response.ok) break
          } catch (fetchError: unknown) {
            const errMsg =
              fetchError instanceof Error
                ? fetchError.message
                : String(fetchError)
            if (errMsg.includes('abort') || errMsg.includes('timeout')) {
              console.error(
                `⚠️ ${провайдер.имя} request timed out after ${XAI_TIMEOUT_MS}ms, attempt ${attempt + 1}/${MAX_RETRIES + 1}`
              )
            } else {
              console.error(
                `⚠️ ${провайдер.имя} fetch error, attempt ${attempt + 1}/${MAX_RETRIES + 1}:`,
                fetchError
              )
            }
            if (attempt < MAX_RETRIES) {
              const delay = Math.min(1000 * Math.pow(2, attempt + 1), 30000)
              await new Promise(resolve => setTimeout(resolve, delay))
              continue
            }
            res.writeHead(502, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                success: false,
                error: `xAI API unreachable: ${errMsg}`,
              })
            )
            return
          }
        }

        if (!response || !response.ok) {
          const errorText = response
            ? await response.text()
            : 'No response after retries'
          console.error('xAI API error:', errorText)
          const statusCode = response?.status === 429 ? 429 : 500
          res.writeHead(statusCode, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              success: false,
              error:
                statusCode === 429
                  ? 'Rate limit exceeded, please try again later'
                  : 'Failed to generate script',
            })
          )
          return
        }
        const data = await response.json()
        const content = data.choices?.[0]?.message?.content
        if (!content) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({ success: false, error: 'No response from AI' })
          )
          return
        }
        let jsonContent = content.trim()
        if (jsonContent.startsWith('```json'))
          jsonContent = jsonContent.slice(7)
        else if (jsonContent.startsWith('```'))
          jsonContent = jsonContent.slice(3)
        if (jsonContent.endsWith('```')) jsonContent = jsonContent.slice(0, -3)
        jsonContent = jsonContent.trim()
        let scriptData
        try {
          scriptData = JSON.parse(jsonContent)
        } catch {
          const jsonMatch = jsonContent.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            scriptData = JSON.parse(jsonMatch[0])
          } else {
            throw new Error('Failed to parse JSON')
          }
        }
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        })
        res.end(
          JSON.stringify({
            success: true,
            voiceover: scriptData.voiceover || '',
            cover_prompt: scriptData.cover_prompt || '',
            broll_prompts: scriptData.broll_prompts || [],
            captions: scriptData.captions || [],
            /**
             * КТО ОТВЕТИЛ НА САМОМ ДЕЛЕ.
             *
             * Выбор модели может НЕ СБЫТЬСЯ: список провайдеров отсеивается
             * по наличию ключа, и `выбран = поПросьбе ?? ПРОВАЙДЕРЫ[0]`
             * молча берёт первого попавшегося. То есть человек выбирает
             * GLM-5.3, а отвечает другая модель — и в ответе об этом не было
             * ни слова.
             *
             * То же правило, что у озвучки: `provider` там называет ногу,
             * которая реально сделала звук. Разница между «выбрал» и
             * «ответил» должна быть видна, а не выясняться по стилю текста.
             */
            model: провайдер.model,
            provider: провайдер.имя,
          })
        )
      } catch (error) {
        console.error('Script generation error:', error)
        const errorMsg =
          error instanceof Error ? error.message : 'Internal server error'
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: errorMsg }))
      }
    })
    return
  }

  // GET /proxy/image - Proxy for Telegram images (CORS workaround)
  if (req.url?.startsWith('/proxy/image') && req.method === 'GET') {
    const url = new URL(
      req.url || '',
      `http://${req.headers.host}`
    ).searchParams.get('url')
    if (!url) {
      res.writeHead(400, { 'Content-Type': 'text/plain' })
      res.end('Missing url parameter')
      return
    }
    try {
      // Картинка скачивается в кэш-файл и отдаётся файловым сервизером.
      // В пути файла — НИ одного фрагмента клиентского или удалённого
      // ввода: только случайный uuid и фиксированное расширение.
      // Аватары Telegram — JPEG; content-type проверяется внутри
      // fetchTelegramImage до записи.
      const img = await fetchTelegramImage(url)
      const cachePath = path.join(OUTPUT_DIR, `tgimg-${randomUUID()}.jpg`)
      fs.writeFileSync(cachePath, img.data)
      serveStaticFile(res, cachePath)
    } catch (error) {
      console.error('Proxy error:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Failed to fetch image' }))
    }
    return
  }

  // 404 for everything else
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

// ===============================
// WebSocket Server for Real-Time Sync
// ===============================

/**
 * BOUNDS ON A CHANNEL NOBODY AUTHENTICATES.
 *
 * This socket is deliberately outside the HTTP auth guard: a browser cannot put
 * headers on `new WebSocket(url)`, and the editor connects cross-origin, so
 * authenticating it needs a ticket or a subprotocol -- a design decision, not a
 * patch, and it is left to the owner. What does NOT need that decision is the
 * cost an anonymous peer can impose while we wait for it:
 *
 *   maxPayload -- the ws default is 100 MB per frame. Every message this editor
 *     actually sends is a control message (an asset record, an item update, a
 *     frame number, a chunk of agent text): kilobytes. 4 MB is three orders of
 *     magnitude of headroom and still 25x tighter than the default;
 *   MAX_WS_CLIENTS -- the set only ever shrank on 'close'/'error', so anyone
 *     could grow it without limit. A handful of editors is the real load;
 *   the ping sweep -- a half-open TCP connection may never emit either event,
 *     so without liveness checks dead peers accumulate forever. Browsers answer
 *     ping frames in the protocol layer, so a live client cannot be reaped;
 *   the bufferedAmount check in broadcastWS -- send() to a stalled peer queues
 *     in OUR memory. Skipping a client that is already megabytes behind drops
 *     messages it cannot read anyway instead of buying its backlog.
 *
 * All four refuse or bound; none of them can reject a well-behaved client.
 */
const WS_MAX_PAYLOAD_BYTES = 4 * 1024 * 1024
const MAX_WS_CLIENTS = 200
const WS_PING_INTERVAL_MS = 30_000
/** Past this backlog a peer is not reading; queueing more only costs us. */
const WS_MAX_BUFFERED_BYTES = 8 * 1024 * 1024

const wss = new WebSocketServer({
  server,
  maxPayload: WS_MAX_PAYLOAD_BYTES,
})
const wsClients = new Set<WebSocket>()
/** Answered the last ping? Absent means "never seen", which is not yet dead. */
const wsAlive = new WeakMap<WebSocket, boolean>()

interface WSMessage {
  type: string
  payload?: unknown
  clientId?: string
}

wss.on('connection', (ws: WebSocket) => {
  const clientId = randomUUID()

  if (wsClients.size >= MAX_WS_CLIENTS) {
    // 1013 Try Again Later: an honest refusal, not a silent drop.
    console.warn(
      `[WS] Refused ${clientId}: at capacity (${wsClients.size}/${MAX_WS_CLIENTS})`
    )
    ws.close(1013, 'server at capacity')
    return
  }

  wsClients.add(ws)
  wsAlive.set(ws, true)
  ws.on('pong', () => wsAlive.set(ws, true))
  console.log(`[WS] Client connected: ${clientId} (total: ${wsClients.size})`)

  // Send welcome message with client ID
  ws.send(JSON.stringify({ type: 'connected', payload: { clientId } }))

  ws.on('message', (data: Buffer) => {
    try {
      const msg: WSMessage = JSON.parse(data.toString())
      msg.clientId = clientId

      console.log(`[WS] Message from ${clientId}: ${msg.type}`)

      // Broadcast to all OTHER clients (exclude sender)
      broadcastWS(msg, ws)
    } catch (error) {
      console.error('[WS] Failed to parse message:', error)
    }
  })

  ws.on('close', () => {
    wsClients.delete(ws)
    console.log(
      `[WS] Client disconnected: ${clientId} (total: ${wsClients.size})`
    )
  })

  ws.on('error', error => {
    console.error(`[WS] Client error: ${clientId}`, error)
    wsClients.delete(ws)
  })
})

/**
 * Reap peers that stopped answering.
 *
 * unref() so this timer never keeps the process alive on its own -- the same
 * rule the other background timers here follow.
 */
const wsPingTimer = setInterval(() => {
  for (const client of wsClients) {
    if (wsAlive.get(client) === false) {
      // Missed a whole interval: the socket is open only in our bookkeeping.
      wsClients.delete(client)
      client.terminate()
      continue
    }
    wsAlive.set(client, false)
    try {
      client.ping()
    } catch {
      // A socket that cannot even be pinged is gone; drop it rather than
      // carrying it until some OS timeout decides.
      wsClients.delete(client)
    }
  }
}, WS_PING_INTERVAL_MS)
wsPingTimer.unref()

function broadcastWS(message: WSMessage, exclude?: WebSocket) {
  const data = JSON.stringify(message)
  let sent = 0

  wsClients.forEach(client => {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      // A peer this far behind is not reading. Queueing more into our own
      // memory does not help it and does hurt everyone sharing this process.
      if (client.bufferedAmount > WS_MAX_BUFFERED_BYTES) return
      client.send(data)
      sent++
    }
  })

  if (sent > 0) {
    console.log(`[WS] Broadcast ${message.type} to ${sent} clients`)
  }
}

// Export broadcast for use in handlers
export { broadcastWS }

// Start server
async function main() {
  await startSessionRevocationSync()
  await initBundle()

  /**
   * Attach the job store BEFORE the first request, not on the first read.
   *
   * attachStoreOnce lived in exactly one place: inside GET /api/generate/jobs.
   * The WRITE path never called it, so on a fresh process the store's pool was
   * still null when a job was created, persist() took its `if (!pool) return`
   * and the row was never written. The durable table only began filling once
   * somebody happened to LIST jobs -- and a client that never lists (the iOS
   * app polls a job by id) never triggered it at all.
   *
   * That inverts the module's whole purpose: it exists so a paid generation
   * survives a restart, and a deploy mid-job is exactly when the in-memory Map
   * dies. Charged, no durable record, nothing to recover from.
   *
   * Wrapped, because getPool() throws SYNCHRONOUSLY when DATABASE_URL is unset
   * and a server without a database must keep running memory-only -- the same
   * reason the call site at the jobs route is wrapped.
   */
  try {
    attachStoreOnce()
  } catch {
    // Memory-only. Generation itself never depended on the store.
  }

  /**
   * The content autopilot, supervised, when AUTOPILOT_LOOP=1.
   *
   * The factory stood still for 51 hours and the reason was not one bug but
   * three: it billed itself, its stall alarm could not fire, and -- found last
   * -- the script could not even start. The last gap is that nothing SCHEDULES
   * it: no crontab, no launchd, no service. A laptop that sleeps is not a
   * scheduler, so it runs here, where the render it needs already lives.
   *
   * A CHILD PROCESS, not a setInterval: the script is a side-effecting module
   * that starts its own daemon at import time, and a crash inside it must not
   * take the web server down. If it dies we respawn after a minute instead of
   * hot-looping.
   *
   * Off by default -- publishing is a deliberate act, not a side effect of
   * booting a render service.
   */
  if (process.env.AUTOPILOT_LOOP === '1') {
    const startAutopilot = () => {
      const child = spawn(
        path.join(__dirname, 'node_modules/.bin/tsx'),
        ['scripts/agent-autopilot.ts'],
        {
          cwd: __dirname,
          stdio: 'inherit',
          env: {
            ...process.env,
            // Talk to ourselves over loopback: no DNS, no TLS, no egress.
            SELF_URL:
              process.env.AUTOPILOT_SELF_URL || `http://127.0.0.1:${PORT}`,
            LOOP_DIR: process.env.LOOP_DIR || path.join(__dirname, 'loop'),
          },
        }
      )
      child.on('exit', code => {
        console.log(`[autopilot] child exited (${code}) — respawn in 60s`)
        setTimeout(startAutopilot, 60_000)
      })
    }
    console.log('🤖 Autopilot: supervised child starting (AUTOPILOT_LOOP=1)')
    startAutopilot()
  }

  server.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🚀 Remotion render server running on 0.0.0.0:${PORT}`)
    console.log(
      `🔒 Auth: mode=${authMode()} apiKey=${process.env.RENDER_API_KEY ? 'set' : 'MISSING'} ` +
        `botToken=${process.env.TELEGRAM_BOT_TOKEN ? 'set' : 'MISSING'}`
    )
    /**
     * A RUNTIME WITNESS for the channel.
     *
     * A variable NAME is the one thing neither types nor tests can check: any
     * name compiles, and a test that mocks the environment sets whatever name
     * the code reads. Only the DEPLOY can disagree, and this line is where that
     * disagreement is visible at a glance in the boot log -- instead of a day
     * later, as a channel that quietly received nothing.
     */
    const chCfg = readChannelConfig()
    console.log(
      `📣 Channel: token=${chCfg.token ? `set (${chCfg.tokenFrom})` : `MISSING (${ENV_NAMES.token.join('|')})`} ` +
        `chat=${chCfg.chatId ? `set (${chCfg.chatIdFrom})` : `MISSING (${ENV_NAMES.chatId.join('|')})`} ` +
        `cap=${chCfg.maxPerRun}/прогон ${chCfg.maxPerDay}/сутки`
    )
    console.log(`📍 HTTP Endpoints:`)
    console.log(`   GET  /health       - Health check`)
    console.log(`   GET  /compositions - List compositions`)
    console.log(`   POST /render       - Render video/still`)
    console.log(
      `   POST /render/template - Universal template API (S3 + webhook)`
    )
    console.log(`   GET  /renders/:id  - Download rendered file`)
    console.log(`   POST /upload       - Upload asset to S3`)
    console.log(`   GET  /assets       - List S3 assets`)
    console.log(`🔌 WebSocket: ws://0.0.0.0:${PORT} (real-time sync)`)
    console.log(`📦 S3 Bucket: ${S3_BUCKET}`)

    /*
     * ЗДЕСЬ РЕНДЕР КАЖДЫЕ 10 МИНУТ СТАВИЛ КАССИРУ ВЕБХУК — И ГЛУШИЛ БОТА.
     *
     * Замысел: сосед по общему main сбивает вебхук своим deleteWebhook на
     * каждом рестарте, значит будем возвращать его периодически. Логика
     * самовосстановления верная — неверен был выбор победителя в споре.
     *
     * Пока вебхук стоит, Telegram не отдаёт апдейты опросом (409), а сам
     * вебхук был разрешён только на `pre_checkout_query`: имя
     * `successful_payment` — поле внутри `message`, а не тип апдейта, и
     * Telegram его молча выбрасывал. Плюс маршрут закрыт общим гвардом и
     * отвечал Telegram 401. То есть этот блок круглосуточно возвращал
     * систему в состояние «бот молчит и ничего не продаёт».
     *
     * Приём апдейтов теперь один на все одиннадцать ботов — опрос в сервисе
     * бота. Оплаты приходят туда же: клуб и тарифы бот зачисляет сам, а
     * покупку токенов мини-приложения (payload `tokens:<сумма>:<id>`)
     * переправляет сюда на POST /api/stars/credit — тем же ключом, которым
     * уже ходит postStarPaid. Каждый леджер пишет его хозяин.
     *
     * Ничего не ставим и не удаляем: удаление делает сервис бота на старте,
     * а два сервиса, дёргающие один вебхук, — это и был исходный спор.
     */
  })
}

main().catch(console.error)
