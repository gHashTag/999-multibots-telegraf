import { createServer, IncomingMessage } from "node:http";
import os from "node:os";
import { WebSocketServer, WebSocket } from "ws";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, renderStill, getCompositions } from "@remotion/renderer";
import path from "node:path";
import { authenticate, authMode } from "./auth";
import { TEMPLATE_CARDS } from "./src/templates/registry";
import fs from "node:fs";
import { randomUUID, createHmac } from "node:crypto";
import { execSync } from "node:child_process";
import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { transcribeVideo } from "./src/lib/transcribe";
import { detectFaceInVideo, detectFaceInImage, calculateCropSettings, loadModels } from "./src/lib/faceDetection";
import { Pool } from "pg";
// Inlined to avoid workspace dependency in Docker
const SERVICE_ENDPOINTS = {
  remotion: 'https://vibee-render-server.fly.dev',
  mcp: 'https://vibee-render-server.fly.dev',
  bridge: 'https://vibee-telegram-bridge.fly.dev',
  player: 'https://vibee-player.fly.dev',
} as const;

// Get video duration using ffprobe
function getVideoDuration(videoPath: string): number {
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      { encoding: 'utf-8' }
    ).trim();
    return parseFloat(result);
  } catch (error) {
    console.warn(`⚠️ Could not get video duration for ${videoPath}:`, error);
    return 0;
  }
}

const PORT = process.env.PORT || 3333;
const OUTPUT_DIR = process.env.OUTPUT_DIR || "./out";

// Optimal concurrency based on CPU cores (75% of available cores, min 2)
const OPTIMAL_CONCURRENCY = Math.max(2, Math.floor(os.cpus().length * 0.75));
console.log(`🔧 CPU cores: ${os.cpus().length}, using concurrency: ${OPTIMAL_CONCURRENCY}`);

// S3/Tigris Configuration
const S3_ENDPOINT = process.env.AWS_ENDPOINT_URL_S3 || "https://fly.storage.tigris.dev";
const S3_BUCKET = process.env.BUCKET_NAME || process.env.S3_BUCKET || "vibee-assets";
const S3_PUBLIC_URL = process.env.S3_PUBLIC_URL || `${S3_ENDPOINT}/${S3_BUCKET}`;

// MinIO (и большинство S3-совместимых хранилищ, кроме самого AWS) адресует
// бакет путём, а не поддоменом. Без forcePathStyle SDK пойдёт на
// https://<bucket>.bucket-production-8259.up.railway.app — такого хоста нет,
// и загрузка падает на DNS, а не на правах доступа, что уводит диагностику
// совсем не туда.
//
// Включается для любого своего эндпоинта; на настоящем AWS S3_ENDPOINT не
// задан, и поведение остаётся прежним. S3_FORCE_PATH_STYLE=false — аварийный
// выключатель, если хранилище всё-таки требует virtual-host.
const useCustomEndpoint = Boolean(process.env.AWS_ENDPOINT_URL_S3);
const forcePathStyle =
  process.env.S3_FORCE_PATH_STYLE === "false" ? false : useCustomEndpoint;

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "auto",
  endpoint: S3_ENDPOINT,
  forcePathStyle,
  credentials: process.env.AWS_ACCESS_KEY_ID ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  } : undefined,
});
console.log(
  `🪣 S3: endpoint=${S3_ENDPOINT} bucket=${S3_BUCKET} pathStyle=${forcePathStyle} creds=${
    process.env.AWS_ACCESS_KEY_ID ? "set" : "MISSING"
  }`
);

// PostgreSQL Configuration
const DATABASE_URL = process.env.DATABASE_URL;
let pgPool: Pool | null = null;

function getPool(): Pool {
  if (!pgPool) {
    if (!DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable not set');
    }
    pgPool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    console.log('✅ PostgreSQL pool created');
  }
  return pgPool;
}

// Telegram Notification Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_OWNER_ID = '144022504';
const TELEGRAM_RENDERS_GROUP = '-1002737186844';

// Send text message to Telegram
async function sendTelegramMessage(chatId: string, message: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN not set, skipping notification');
    return false;
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      })
    });
    const result = await response.json();
    if (!result.ok) {
      console.error('❌ Telegram sendMessage failed:', result);
      return false;
    }
    console.log(`📨 Telegram notification sent to ${chatId}`);
    return true;
  } catch (error) {
    console.error('❌ Telegram sendMessage error:', error);
    return false;
  }
}

// Send video to Telegram
async function sendTelegramVideo(chatId: string, videoUrl: string, caption: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN not set, skipping video notification');
    return false;
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        video: videoUrl,
        caption: caption,
        parse_mode: 'HTML'
      })
    });
    const result = await response.json();
    if (!result.ok) {
      console.error('❌ Telegram sendVideo failed:', result);
      // Fallback to message with link
      return sendTelegramMessage(chatId, `${caption}\n\n🔗 ${videoUrl}`);
    }
    console.log(`📹 Telegram video sent to ${chatId}`);
    return true;
  } catch (error) {
    console.error('❌ Telegram sendVideo error:', error);
    return false;
  }
}

// Auto-publish to community feed
const FEED_API_URL = process.env.FEED_API_URL || SERVICE_ENDPOINTS.mcp;

interface PublishToFeedParams {
  telegramId: number;
  creatorName: string;
  creatorAvatar?: string;
  projectName: string;
  videoUrl: string;
  templateSettings?: Record<string, unknown>;
  assets?: unknown[];
  tracks?: unknown[];
}

async function publishToFeed(params: PublishToFeedParams): Promise<boolean> {
  try {
    console.log(`📤 [Feed] Publishing to community feed: ${params.projectName}`);

    const response = await fetch(`${FEED_API_URL}/api/feed/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegram_id: params.telegramId,
        creator_name: params.creatorName,
        creator_avatar: params.creatorAvatar ?? null,
        name: params.projectName,
        description: `Created by ${params.creatorName}`,
        thumbnail_url: null,
        video_url: params.videoUrl,
        template_settings: JSON.stringify(params.templateSettings || {}),
        assets: JSON.stringify(params.assets || []),
        tracks: JSON.stringify(params.tracks || []),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [Feed] Publish failed: ${response.status} ${errorText}`);
      return false;
    }

    const result = await response.json();
    console.log(`✅ [Feed] Published to feed: ID=${result.id}`);
    return true;
  } catch (error) {
    console.error('❌ [Feed] Publish error:', error);
    return false;
  }
}

// Upload directory for temp files
const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

// Ensure directories exist
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Temp directory for pre-downloaded render assets (in public so Remotion can serve)
const RENDER_TEMP_DIR = path.join(process.cwd(), "public", "render-temp");
if (!fs.existsSync(RENDER_TEMP_DIR)) {
  fs.mkdirSync(RENDER_TEMP_DIR, { recursive: true });
}

/**
 * Pre-download S3 asset to temp directory for faster rendering
 * Also transcodes to H.264 if needed (iPhone HEVC videos don't work in Chrome)
 * Returns a file:// URL that Remotion can access directly
 */
async function preDownloadS3Asset(url: string): Promise<string> {
  let s3Key: string | null = null;

  if (url.includes('/s3/')) {
    const match = url.match(/\/s3\/(.+)$/);
    if (match) {
      s3Key = match[1];
    }
  }

  if (!s3Key) {
    return url;
  }

  const baseName = path.basename(s3Key, path.extname(s3Key));
  const downloadFilename = `${Date.now()}-${path.basename(s3Key)}`;
  const downloadPath = path.join(RENDER_TEMP_DIR, downloadFilename);

  // Output will always be .mp4 H.264
  const outputFilename = `${Date.now()}-${baseName}-h264.mp4`;
  const outputPath = path.join(RENDER_TEMP_DIR, outputFilename);

  console.log(`📥 Pre-downloading S3 asset: ${s3Key}`);

  try {
    // Download from S3
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
    });

    const response = await s3Client.send(command);
    const body = response.Body as NodeJS.ReadableStream;

    await new Promise<void>((resolve, reject) => {
      const file = fs.createWriteStream(downloadPath);
      body.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', reject);
    });

    const stats = fs.statSync(downloadPath);
    console.log(`✅ Downloaded ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // Transcode to H.264 (Chrome-compatible) using ffmpeg
    console.log(`🔄 Transcoding to H.264...`);
    try {
      execSync(
        `ffmpeg -i "${downloadPath}" -c:v libx264 -preset fast -crf 23 -c:a aac -movflags +faststart -y "${outputPath}"`,
        { stdio: 'pipe', timeout: 300000 }
      );

      // Remove original download
      fs.unlinkSync(downloadPath);

      const outputStats = fs.statSync(outputPath);
      console.log(`✅ Transcoded to ${(outputStats.size / 1024 / 1024).toFixed(2)} MB`);

      // Return HTTP URL for Remotion to access via render server
      return `http://0.0.0.0:${PORT}/render-temp/${outputFilename}`;
    } catch (transcodeError) {
      console.warn(`⚠️ Transcode failed, using original:`, transcodeError);
      // If transcode fails, use original via HTTP
      return `http://0.0.0.0:${PORT}/render-temp/${downloadFilename}`;
    }
  } catch (error) {
    console.error(`❌ Failed to pre-download:`, error);
    return url;
  }
}

// Bundle once at startup for better performance
let bundleLocation: string;

// Список композиций бандла, закэшированный на время жизни процесса: бандл после
// старта не меняется, а getCompositions поднимает headless-браузер — дёргать его
// на каждый POST /render дорого.
let compositionsCache: Awaited<ReturnType<typeof getCompositions>> | null = null;
async function knownCompositions() {
  if (!compositionsCache) compositionsCache = await getCompositions(bundleLocation);
  return compositionsCache;
}

async function initBundle() {
  console.log("📦 Creating Remotion bundle...");
  bundleLocation = await bundle({
    entryPoint: path.resolve("./src/index.ts"),
    webpackOverride: (config) => config,
  });
  console.log("✅ Bundle ready at:", bundleLocation);

  // Preload face detection models
  console.log("👤 Loading face detection models...");
  try {
    await loadModels();
    console.log("✅ Face detection models ready");
  } catch (error) {
    console.warn("⚠️ Face detection models failed to load:", error);
  }
}

// S3 Upload helper
async function uploadToS3(
  fileBuffer: Buffer,
  filename: string,
  contentType: string
): Promise<{ success: boolean; url?: string; key?: string; error?: string; signedUrl?: string; directUrl?: string }> {
  const key = `assets/${Date.now()}-${filename}`;

  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    }));

    // Generate presigned URL for public access (7 days)
    const signedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }),
      { expiresIn: 604800 } // 7 days
    );

    // Return proxy URL instead of direct S3 URL for browser compatibility (HEVC → H.264)
    const proxyUrl = `/s3/${key}`;
    const directUrl = `${S3_PUBLIC_URL}/${key}`;
    console.log(`✅ Uploaded to S3: ${directUrl} (signed: ${signedUrl.substring(0, 80)}...)`);
    return { success: true, url: proxyUrl, key, directUrl, signedUrl };
  } catch (error) {
    console.error("❌ S3 upload failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Upload failed"
    };
  }
}

// HLS Conversion and Tigris Upload
// Converts MP4 to HLS and uploads all segments to Tigris for global edge caching
interface HLSUploadResult {
  success: boolean;
  hlsUrl?: string;           // Master playlist URL on Tigris
  renditions?: Record<string, string>;  // Quality -> playlist URL
  error?: string;
}

async function convertToHLSAndUploadToTigris(
  videoPath: string,
  videoId: string,
  renditions: string[] = ["480p", "720p"]  // Default: 2 qualities for balance
): Promise<HLSUploadResult> {
  const tempHlsDir = path.join(OUTPUT_DIR, `hls-temp-${videoId}`);

  try {
    console.log(`🎬 [HLS] Starting conversion for ${videoId}...`);
    fs.mkdirSync(tempHlsDir, { recursive: true });

    // Rendition configurations
    const renditionConfigs: Record<string, { width: number; height: number; bitrate: number }> = {
      "360p": { width: 640, height: 360, bitrate: 800 },
      "480p": { width: 854, height: 480, bitrate: 1400 },
      "720p": { width: 1280, height: 720, bitrate: 2800 },
      "1080p": { width: 1920, height: 1080, bitrate: 5000 },
    };

    const renditionUrls: Record<string, string> = {};
    const uploadedKeys: string[] = [];

    // Create each rendition
    for (const quality of renditions) {
      const config = renditionConfigs[quality];
      if (!config) continue;

      const renditionDir = path.join(tempHlsDir, quality);
      fs.mkdirSync(renditionDir, { recursive: true });

      const playlistPath = path.join(renditionDir, "playlist.m3u8");

      // FFmpeg HLS command with optimized settings
      const ffmpegCmd = `ffmpeg -i "${videoPath}" ` +
        `-vf "scale=${config.width}:${config.height}" ` +
        `-c:v libx264 -preset fast -b:v ${config.bitrate}k ` +
        `-c:a aac -b:a 128k ` +
        `-hls_time 4 ` +           // 4 second segments for faster start
        `-hls_list_size 0 ` +
        `-hls_segment_filename "${renditionDir}/seg%03d.ts" ` +
        `-f hls "${playlistPath}" -y`;

      console.log(`🎬 [HLS] Creating ${quality} rendition...`);
      execSync(ffmpegCmd, { stdio: 'pipe', timeout: 300000 });

      // Upload all segment files to Tigris
      const files = fs.readdirSync(renditionDir);
      for (const file of files) {
        const filePath = path.join(renditionDir, file);
        const fileBuffer = fs.readFileSync(filePath);
        const key = `hls/${videoId}/${quality}/${file}`;
        const contentType = file.endsWith('.m3u8')
          ? 'application/vnd.apple.mpegurl'
          : 'video/mp2t';

        await s3Client.send(new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
          Body: fileBuffer,
          ContentType: contentType,
          CacheControl: 'public, max-age=31536000, immutable',  // 1 year cache
        }));

        uploadedKeys.push(key);
      }

      renditionUrls[quality] = `${S3_PUBLIC_URL}/hls/${videoId}/${quality}/playlist.m3u8`;
      console.log(`✅ [HLS] ${quality} uploaded: ${renditionUrls[quality]}`);
    }

    // Create and upload master playlist
    const masterPlaylist = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
    ];

    for (const quality of renditions) {
      const config = renditionConfigs[quality];
      if (!config || !renditionUrls[quality]) continue;

      masterPlaylist.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${config.bitrate * 1000},RESOLUTION=${config.width}x${config.height}`,
        `${quality}/playlist.m3u8`
      );
    }

    const masterPlaylistContent = masterPlaylist.join("\n");
    const masterKey = `hls/${videoId}/master.m3u8`;

    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: masterKey,
      Body: Buffer.from(masterPlaylistContent),
      ContentType: 'application/vnd.apple.mpegurl',
      CacheControl: 'public, max-age=3600',  // 1 hour for master (allows quality updates)
    }));

    const hlsUrl = `${S3_PUBLIC_URL}/${masterKey}`;
    console.log(`✅ [HLS] Master playlist uploaded: ${hlsUrl}`);

    // Cleanup temp directory
    fs.rmSync(tempHlsDir, { recursive: true, force: true });

    return {
      success: true,
      hlsUrl,
      renditions: renditionUrls,
    };
  } catch (error) {
    console.error(`❌ [HLS] Conversion failed:`, error);

    // Cleanup on error
    if (fs.existsSync(tempHlsDir)) {
      fs.rmSync(tempHlsDir, { recursive: true, force: true });
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "HLS conversion failed",
    };
  }
}

// List S3 assets
async function listS3Assets(prefix: string = "assets/"): Promise<{
  success: boolean;
  assets?: Array<{ key: string; url: string; size: number; lastModified: Date }>;
  error?: string;
}> {
  try {
    const response = await s3Client.send(new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: prefix,
    }));

    const assets = (response.Contents || []).map((obj) => ({
      key: obj.Key || "",
      url: `${S3_PUBLIC_URL}/${obj.Key}`,
      size: obj.Size || 0,
      lastModified: obj.LastModified || new Date(),
    }));

    return { success: true, assets };
  } catch (error) {
    console.error("❌ S3 list failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "List failed",
    };
  }
}

// Webhook callback with retry
async function sendWebhook(
  url: string,
  payload: WebhookPayload,
  secret?: string,
  retryCount = 0
): Promise<void> {
  const maxRetries = 3;
  const retryDelays = [0, 5000, 15000];

  try {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (secret) {
      const signature = createHmac("sha256", secret).update(body).digest("hex");
      headers["X-Vibee-Signature"] = `sha256=${signature}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    console.log(`✅ [Webhook] Sent to ${url}`);
  } catch (error) {
    console.error(`❌ [Webhook] Failed attempt ${retryCount + 1}:`, error);
    if (retryCount < maxRetries - 1) {
      const delay = retryDelays[retryCount + 1];
      console.log(`🔄 [Webhook] Retrying in ${delay}ms...`);
      setTimeout(() => sendWebhook(url, payload, secret, retryCount + 1), delay);
    }
  }
}

// Upload rendered file to S3
async function uploadRenderedFile(
  filePath: string,
  prefix: string = "renders/"
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const filename = path.basename(filePath);
    const key = `${prefix}${Date.now()}-${filename}`;

    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: "video/mp4",
    }));

    const url = `${S3_PUBLIC_URL}/${key}`;
    console.log(`✅ [S3] Uploaded rendered video: ${url}`);
    return { success: true, url };
  } catch (error) {
    console.error("❌ [S3] Failed to upload rendered file:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
}

// Convert simplified segments (seconds) to composition segments (frames)
function convertSegmentsToFrames(segments: SimplifiedSegment[], fps = 30) {
  return segments.map((seg) => ({
    type: seg.type,
    startFrame: Math.round(seg.startSeconds * fps),
    durationFrames: Math.round(seg.durationSeconds * fps),
    bRollUrl: seg.bRollUrl,
    bRollType: seg.bRollUrl?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? 'image' as const : 'video' as const,
    caption: '',
  }));
}

// Get content type from filename
function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const types: Record<string, string> = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  return types[ext] || "application/octet-stream";
}

interface RenderRequest {
  type: "video" | "still";
  compositionId: string;
  inputProps?: Record<string, unknown>;
  codec?: string;
  frame?: number;
  // User info for notifications
  userInfo?: {
    telegram_id: number;
    username?: string;
    first_name?: string;
    project_name?: string;
  };
  // Assets and tracks for feed remix
  assets?: unknown[];
  tracks?: unknown[];
}

interface RenderResponse {
  success: boolean;
  renderId?: string;
  outputPath?: string;
  outputUrl?: string;
  error?: string;
}

// Store render jobs for progress tracking
interface RenderJob {
  id: string;
  status: 'pending' | 'rendering' | 'completed' | 'failed';
  progress: number;
  outputUrl?: string;
  publicUrl?: string;  // S3 public URL for notifications
  error?: string;
  startedAt: Date;
  userInfo?: RenderRequest['userInfo'];
  // Assets and tracks for feed remix
  assets?: unknown[];
  tracks?: unknown[];
  inputProps?: Record<string, unknown>;
}

// Universal template render API types
interface TemplateRenderRequest {
  // Required
  compositionId: string;           // Template name: "SplitTalkingHead", "LipSyncMain", etc.

  // Common props (used by most templates)
  lipSyncVideo?: string;
  segments?: SimplifiedSegment[];
  captions?: Caption[];

  // Template-specific props (passed through as-is)
  props?: Record<string, unknown>;

  // Render options
  uploadToS3?: boolean;            // default: true
  s3Prefix?: string;               // default: "renders/"
  webhookUrl?: string;             // POST on completion
  webhookSecret?: string;          // HMAC signature

  // User info for notifications
  userInfo?: {
    telegram_id: number;
    username?: string;
    first_name?: string;
    project_name?: string;
  };
}

interface SimplifiedSegment {
  type: 'split' | 'fullscreen';
  startSeconds: number;
  durationSeconds: number;
  bRollUrl?: string;
}

interface Caption {
  text: string;
  startMs: number;
  endMs: number;
}

interface WebhookPayload {
  renderId: string;
  status: 'completed' | 'failed';
  publicUrl?: string;
  error?: string;
  renderTimeMs: number;
  timestamp: string;
}

const renderJobs = new Map<string, RenderJob>();

// Clean up old jobs after 1 hour
setInterval(() => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of renderJobs) {
    if (job.startedAt.getTime() < oneHourAgo) {
      renderJobs.delete(id);
    }
  }
}, 60 * 1000);

// Resolve media path to absolute file path
function resolveMediaPath(mediaPath: string): string {
  if (mediaPath.startsWith("http://") || mediaPath.startsWith("https://")) {
    return mediaPath; // Remote URL, can't process locally
  }
  if (mediaPath.startsWith("/") && !mediaPath.startsWith("//")) {
    return path.join(process.cwd(), "public", mediaPath);
  }
  return mediaPath;
}

// Start render asynchronously and return immediately
function startRenderAsync(req: RenderRequest): string {
  const renderId = randomUUID();

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
  });

  // Start render in background
  (async () => {
    const job = renderJobs.get(renderId)!;
    job.status = 'rendering';

    try {
      if (!bundleLocation) {
        throw new Error("Bundle not initialized");
      }

      // Prepare inputProps with auto face detection and dynamic duration
      const inputProps = { ...(req.inputProps || {}) } as Record<string, unknown>;
      const fps = 30;
      let durationInFrames: number | null = null;

      // Log segments if provided (for debugging preview/render sync)
      const segments = inputProps.segments as Array<{ type: string; startFrame: number; durationFrames: number; bRollUrl?: string }> | undefined;
      if (segments && segments.length > 0) {
        console.log(`📊 Received ${segments.length} segments from editor:`);
        segments.forEach((seg, i) => {
          console.log(`   [${i}] ${seg.type} @ frame ${seg.startFrame}, duration ${seg.durationFrames}${seg.bRollUrl ? `, bRoll: ${seg.bRollUrl.split('/').pop()}` : ''}`);
        });
      } else {
        console.log(`⚠️ No segments provided, composition will use default layout`);
      }

      // Get lipSyncVideo path for analysis
      let lipSyncVideo = inputProps.lipSyncVideo as string | undefined;

      // Pre-download S3 assets for faster rendering (avoids HTTP timeout in Chrome)
      if (lipSyncVideo && lipSyncVideo.includes('/s3/')) {
        console.log(`📥 Pre-downloading lipSyncVideo for render...`);
        lipSyncVideo = await preDownloadS3Asset(lipSyncVideo);
        inputProps.lipSyncVideo = lipSyncVideo;
      }

      if (lipSyncVideo) {
        const videoPath = resolveMediaPath(lipSyncVideo);

        if (fs.existsSync(videoPath)) {
          // 1. Get video duration dynamically
          const duration = getVideoDuration(videoPath);
          if (duration > 0) {
            durationInFrames = Math.ceil(duration * fps);
            console.log(`📏 Video duration: ${duration.toFixed(2)}s = ${durationInFrames} frames`);
          }

          // 2. Auto-load captions if not provided
          const captions = inputProps.captions as unknown[] | undefined;
          if (!captions || captions.length === 0) {
            // Try to find captions.json in the same directory
            const videoDir = path.dirname(videoPath);
            const captionsPath = path.join(videoDir, 'captions.json');
            if (fs.existsSync(captionsPath)) {
              try {
                const captionsData = JSON.parse(fs.readFileSync(captionsPath, 'utf-8'));
                inputProps.captions = captionsData;
                console.log(`📝 Auto-loaded ${captionsData.length} captions from: ${captionsPath}`);
              } catch (captionsError) {
                console.warn(`⚠️ Could not load captions from ${captionsPath}:`, captionsError);
              }
            }
          }

          // 3. Auto face detection (if not already provided)
          if (inputProps.faceOffsetX === undefined || inputProps.faceOffsetY === undefined) {
            console.log(`👤 Auto-detecting face in: ${videoPath}`);
            try {
              const faceBox = await detectFaceInVideo(videoPath);
              if (faceBox) {
                const crop = calculateCropSettings(faceBox, 'portrait');
                inputProps.faceOffsetX = crop.offsetX;
                inputProps.faceOffsetY = crop.offsetY;
                inputProps.faceScale = crop.scale;
                console.log(`✅ Face detected: offsetX=${crop.offsetX.toFixed(1)}, offsetY=${crop.offsetY.toFixed(1)}, scale=${crop.scale.toFixed(2)}`);
              } else {
                console.log(`⚠️ No face detected, using defaults`);
                inputProps.faceOffsetX = 0;
                inputProps.faceOffsetY = 0;
                inputProps.faceScale = 1;
              }
            } catch (faceError) {
              console.warn(`⚠️ Face detection failed:`, faceError);
              inputProps.faceOffsetX = 0;
              inputProps.faceOffsetY = 0;
              inputProps.faceScale = 1;
            }
          }
        } else {
          console.warn(`⚠️ Video file not found for analysis: ${videoPath}`);
        }
      }

      const composition = await selectComposition({
        serveUrl: bundleLocation,
        id: req.compositionId,
        inputProps,
        chromiumOptions: {
          enableMultiProcessOnLinux: true,
          disableWebSecurity: true,
          gl: null,  // Disable WebGL - no X11/display needed
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
          ],
        },
        timeoutInMilliseconds: 300000, // 5 minutes for slow video loading
      });

      // Override duration if we detected it from video
      if (durationInFrames && durationInFrames > 0) {
        console.log(`📏 Overriding composition duration: ${composition.durationInFrames} → ${durationInFrames}`);
        (composition as any).durationInFrames = durationInFrames;
      }

      if (req.type === "still") {
        const outputPath = path.join(OUTPUT_DIR, `${renderId}.png`);

        await renderStill({
          composition,
          serveUrl: bundleLocation,
          output: outputPath,
          inputProps,
          frame: req.frame || 0,
          chromiumOptions: {
            enableMultiProcessOnLinux: true,
            disableWebSecurity: true,
            gl: null,  // Disable WebGL - no X11/display needed
            headless: true,
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-gpu',
              '--disable-software-rasterizer',
              '--disable-dev-shm-usage',
              '--disable-accelerated-2d-canvas',
              '--no-first-run',
              '--no-zygote',
              '--single-process',
            ],
          },
          timeoutInMilliseconds: 300000, // 5 minutes for slow video loading
        });

        job.status = 'completed';
        job.progress = 100;
        job.outputUrl = `/renders/${renderId}.png`;
        return;
      }

      // Video render
      const codec = (req.codec || "h264") as "h264" | "h265" | "vp8" | "vp9" | "prores" | "gif";
      const ext = codec === "gif" ? "gif" : "mp4";
      const outputPath = path.join(OUTPUT_DIR, `${renderId}.${ext}`);

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
          gl: null,  // Disable WebGL - no X11/display needed
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
          ],
        },
        timeoutInMilliseconds: 300000, // 5 minutes for slow video loading
        onProgress: ({ progress }) => {
          const percent = Math.round(progress * 100);
          job.progress = percent;
          console.log(`🎬 Render ${renderId}: ${percent}%`);
        },
      });

      job.status = 'completed';
      job.progress = 100;
      job.outputUrl = `/renders/${renderId}.${ext}`;
      console.log(`✅ Render ${renderId} completed: ${job.outputUrl}`);

      // Upload to S3, convert to HLS, and send Telegram notification
      // Объявлено ДО try: запасная ветка публикации ниже находится после
      // catch, то есть вне этого блока. Пока объявление было внутри try,
      // та ветка падала с ReferenceError — а срабатывает она ровно тогда,
      // когда S3 недоступен, то есть в момент, когда запасной путь и нужен.
      const userInfo = job.userInfo;
      try {
        const videoBuffer = fs.readFileSync(outputPath);
        const uploadResult = await uploadToS3(videoBuffer, `render-${renderId}.${ext}`, ext === 'gif' ? 'image/gif' : 'video/mp4');

        if (uploadResult.success && uploadResult.signedUrl) {
          job.publicUrl = uploadResult.signedUrl;
          console.log(`📤 Uploaded MP4 to S3 with signed URL`);

          // Convert to HLS for smooth streaming (skip for GIFs)
          if (ext !== 'gif') {
            console.log(`🎬 [HLS] Starting automatic HLS conversion for ${renderId}...`);
            const hlsResult = await convertToHLSAndUploadToTigris(outputPath, renderId, ["480p", "720p"]);

            if (hlsResult.success && hlsResult.hlsUrl) {
              (job as any).hlsUrl = hlsResult.hlsUrl;
              (job as any).hlsRenditions = hlsResult.renditions;
              console.log(`✅ [HLS] Auto-conversion complete: ${hlsResult.hlsUrl}`);
            } else {
              console.warn(`⚠️ [HLS] Auto-conversion failed, MP4 still available`);
            }
          }

          // Send Telegram notification with video
          const renderTimeMs = Date.now() - job.startedAt.getTime();
          const renderTimeSec = Math.round(renderTimeMs / 1000);

          const hlsInfo = (job as any).hlsUrl ? `\n🎬 HLS: ✅` : '';
          const caption = userInfo
            ? `✅ <b>Рендер готов!</b>\n\n👤 ${userInfo.first_name || 'Unknown'} (@${userInfo.username || 'нет'})\n📹 ${userInfo.project_name || 'Untitled'}\n⏱ ${renderTimeSec}s${hlsInfo}`
            : `✅ <b>Рендер готов!</b>\n\n⏱ ${renderTimeSec}s${hlsInfo}`;

          await sendTelegramVideo(TELEGRAM_RENDERS_GROUP, uploadResult.signedUrl, caption);
          console.log(`📱 Telegram notification sent for render ${renderId}`);

          // Auto-publish to community feed
          if (userInfo && userInfo.telegram_id) {
            await publishToFeed({
              telegramId: userInfo.telegram_id,
              creatorName: userInfo.first_name || userInfo.username || 'Anonymous',
              projectName: userInfo.project_name || 'Vibee Reel',
              videoUrl: uploadResult.signedUrl,
              templateSettings: job.inputProps || {},
              assets: job.assets || [],
              tracks: job.tracks || [],
            });
          } else {
            console.warn(`⚠️ [Feed] Skipping publish - no user info for render ${renderId}`);
          }
        }
      } catch (uploadError) {
        console.error(`⚠️ S3 upload or notification failed for ${renderId}:`, uploadError);
        // Don't fail the render if upload/notification fails
      }

      // Fallback: auto-publish with render-server URL if S3 failed
      if (!job.publicUrl && userInfo && userInfo.telegram_id) {
        try {
          const fallbackUrl = `${SERVICE_ENDPOINTS.remotion}/renders/${renderId}.${ext}`;
          console.log(`📢 [Feed] Publishing with fallback URL (S3 unavailable): ${fallbackUrl}`);
          await publishToFeed({
            telegramId: userInfo.telegram_id,
            creatorName: userInfo.first_name || userInfo.username || 'Anonymous',
            projectName: userInfo.project_name || 'Vibee Reel',
            videoUrl: fallbackUrl,
            templateSettings: job.inputProps || {},
            assets: job.assets || [],
            tracks: job.tracks || [],
          });
        } catch (feedError) {
          console.error(`⚠️ [Feed] Fallback publish failed for ${renderId}:`, feedError);
        }
      }

    } catch (error) {
      console.error(`❌ Render ${renderId} failed:`, error);
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : "Unknown error";
    }
  })();

  return renderId;
}

// Simple HTTP server
const server = createServer(async (req, res) => {
  // Log all requests
  console.log(`📥 ${req.method} ${req.url}`);

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Filename, X-Api-Key, X-Telegram-Init-Data"
  );

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // Аутентификация. До этого сервис не проверял ничего: любой мог залить 100 МБ
  // в бакет и запускать рендеры, тратящие кредиты FAL / ElevenLabs / xAI.
  // Подробности механизмов — в ./auth.ts.
  const auth = authenticate(req);
  if (auth.wouldReject) {
    console.warn(
      `🔒 [auth] ${auth.allowed ? "ПРОПУЩЕНО (режим warn)" : "ОТКАЗ"} ${req.method} ${req.url} — ${auth.reason}`
    );
  }
  if (!auth.allowed) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "unauthorized",
        detail: auth.reason,
        hint: "send X-Api-Key (server to server) or X-Telegram-Init-Data (Mini App)",
      })
    );
    return;
  }

  // Health check
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", bundleReady: !!bundleLocation }));
    return;
  }

  // Notify: New lead (user login)
  if (req.url === "/api/notify/lead" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => {
      try {
        const { telegram_id, username, first_name } = JSON.parse(body);
        const message = `🐝 <b>Новый пользователь VIBEE!</b>\n\n👤 ${first_name || 'Unknown'}\n📱 @${username || 'нет'}\n🆔 ${telegram_id}`;
        await sendTelegramMessage(TELEGRAM_OWNER_ID, message);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (error) {
        console.error('Lead notification error:', error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: 'Failed to send notification' }));
      }
    });
    return;
  }

  // Notify: Render started
  if (req.url === "/api/notify/render-start" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => {
      try {
        const { telegram_id, username, first_name, project_name } = JSON.parse(body);
        const message = `🎬 <b>Рендер запущен</b>\n\n👤 ${first_name || 'Unknown'} (@${username || 'нет'})\n🆔 ${telegram_id}\n📹 ${project_name || 'Untitled'}`;
        await sendTelegramMessage(TELEGRAM_RENDERS_GROUP, message);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (error) {
        console.error('Render start notification error:', error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: 'Failed to send notification' }));
      }
    });
    return;
  }

  // ==============================================
  // AI Generation Endpoints
  // ==============================================
  const MCP_URL = process.env.MCP_URL || SERVICE_ENDPOINTS.mcp;
  const FAL_KEY = process.env.FAL_KEY;

  // Supported fal.ai image models
  const FAL_IMAGE_MODELS: Record<string, string> = {
    'fal-ai/flux-pro/v1.1-ultra': 'fal-ai/flux-pro/v1.1-ultra',
    'fal-ai/flux/dev': 'fal-ai/flux/dev',
    'fal-ai/nano-banana-pro': 'fal-ai/nano-banana-pro',
    'fal-ai/reve/text-to-image': 'fal-ai/reve/text-to-image',
  };

  // POST /api/generate/image - Generate image using FAL.ai (multiple models)
  if (req.url === "/api/generate/image" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => {
      try {
        if (!FAL_KEY) throw new Error("FAL_KEY not configured");

        const { model, prompt, width, height } = JSON.parse(body);
        console.log(`📷 [Generate] Photo: ${model}, prompt: "${prompt.substring(0, 50)}..."`);

        // Convert width/height to aspect ratio for FAL
        const getAspectRatio = (w: number, h: number): string => {
          if (w === h) return "1:1";
          if (w > h) return w / h >= 1.7 ? "16:9" : "4:3";
          return h / w >= 1.7 ? "9:16" : "3:4";
        };
        const aspectRatio = getAspectRatio(width || 1024, height || 1024);

        // Get model endpoint (default to nano-banana-pro)
        const modelEndpoint = FAL_IMAGE_MODELS[model] || 'fal-ai/nano-banana-pro';

        // Submit job to FAL queue
        const submitResponse = await fetch(`https://queue.fal.run/${modelEndpoint}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Key ${FAL_KEY}`,
          },
          body: JSON.stringify({
            prompt,
            aspect_ratio: aspectRatio,
            num_images: 1,
          }),
        });

        if (!submitResponse.ok) {
          const errorText = await submitResponse.text();
          throw new Error(`FAL submit failed: ${submitResponse.status} - ${errorText}`);
        }

        const submitResult = await submitResponse.json();
        const requestId = submitResult.request_id;
        console.log(`📷 [Generate] FAL request submitted: ${requestId}`);

        if (!requestId) {
          // Synchronous response - image is already ready
          const imageUrl = submitResult.images?.[0]?.url || submitResult.image?.url;
          if (imageUrl) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, url: imageUrl, id: Date.now().toString() }));
            return;
          }
          throw new Error("No image URL in response");
        }

        // Poll for completion (async queue mode)
        let imageUrl = null;
        for (let i = 0; i < 120; i++) { // Max 6 minutes (120 * 3s)
          await new Promise(r => setTimeout(r, 3000));

          // Check status
          const statusResponse = await fetch(
            `https://queue.fal.run/${modelEndpoint}/requests/${requestId}/status`,
            { headers: { "Authorization": `Key ${FAL_KEY}` } }
          );

          if (!statusResponse.ok) continue;
          const statusData = await statusResponse.json();
          const status = statusData.status;

          console.log(`📷 [Generate] FAL status: ${status}`);

          if (status === "COMPLETED") {
            // Get result
            const resultResponse = await fetch(
              `https://queue.fal.run/${modelEndpoint}/requests/${requestId}`,
              { headers: { "Authorization": `Key ${FAL_KEY}` } }
            );

            if (resultResponse.ok) {
              const resultData = await resultResponse.json();
              imageUrl = resultData.images?.[0]?.url || resultData.image?.url;
            }
            break;
          } else if (status === "FAILED") {
            throw new Error("FAL generation failed: " + (statusData.error || "Unknown error"));
          }
        }

        if (imageUrl) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, url: imageUrl, id: requestId }));
          return;
        }

        throw new Error("Image generation timeout");
      } catch (error) {
        console.error("❌ [Generate] Image error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Generation failed" }));
      }
    });
    return;
  }

  // POST /api/generate/video - Generate video using Kling/Veo3
  if (req.url === "/api/generate/video" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => {
      try {
        const { model, prompt, duration, aspect_ratio } = JSON.parse(body);
        console.log(`🎬 [Generate] Video: ${model}, duration: ${duration}`);

        // Determine which API to use based on model
        const isKling = model.startsWith("kling");
        const toolName = isKling ? "ai_kling_create_video" : "ai_kie_create_video";
        const mode = model.includes("pro") ? "pro" : "std";

        const mcpResponse = await fetch(`${MCP_URL}/mcp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "tools/call",
            params: {
              name: toolName,
              arguments: { prompt, mode, duration: duration.replace("s", ""), aspect_ratio },
            },
            id: Date.now(),
          }),
        });

        const mcpResult = await mcpResponse.json();
        if (mcpResult.error) throw new Error(mcpResult.error.message);

        const content = mcpResult.result?.content?.[0]?.text;
        if (!content) throw new Error("No result from MCP");

        const data = JSON.parse(content);
        if (!data.success) throw new Error(data.error || "Generation failed");

        // Poll for result (video generation is async)
        const taskId = data.data?.task_id;
        if (taskId) {
          let videoUrl = null;
          const pollTool = isKling ? "ai_kling_get_task" : "ai_kie_get_task";
          for (let i = 0; i < 100; i++) { // Max 5 minutes
            await new Promise(r => setTimeout(r, 3000));
            const statusResp = await fetch(`${MCP_URL}/mcp`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jsonrpc: "2.0",
                method: "tools/call",
                params: {
                  name: pollTool,
                  arguments: { task_id: taskId },
                },
                id: Date.now(),
              }),
            });
            const statusResult = await statusResp.json();
            const statusContent = statusResult.result?.content?.[0]?.text;
            if (statusContent) {
              const statusData = JSON.parse(statusContent);
              if (statusData.success && statusData.data?.status === "completed") {
                videoUrl = statusData.data.video_url || statusData.data.works?.[0]?.resource?.resource;
                break;
              }
            }
          }
          if (videoUrl) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, url: videoUrl, id: taskId }));
            return;
          }
        }

        throw new Error("Video generation timeout");
      } catch (error) {
        console.error("❌ [Generate] Video error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Generation failed" }));
      }
    });
    return;
  }

  // POST /api/generate/audio - Generate TTS using ElevenLabs (direct API call)
  if (req.url === "/api/generate/audio" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => {
      try {
        const { text, voice_id, speed } = JSON.parse(body);
        const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

        if (!ELEVENLABS_API_KEY) {
          throw new Error("ELEVENLABS_API_KEY not configured");
        }

        console.log(`🎤 [Generate] Audio: voice=${voice_id}, text="${text.substring(0, 50)}..."`);

        // Call ElevenLabs TTS API directly
        const ttsResponse = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`,
          {
            method: "POST",
            headers: {
              "xi-api-key": ELEVENLABS_API_KEY,
              "Content-Type": "application/json",
              "Accept": "audio/mpeg",
            },
            body: JSON.stringify({
              text,
              model_id: "eleven_multilingual_v2",
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
              },
            }),
          }
        );

        if (!ttsResponse.ok) {
          const errorText = await ttsResponse.text();
          throw new Error(`ElevenLabs TTS error: ${ttsResponse.status} - ${errorText}`);
        }

        // Get audio buffer
        const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());
        console.log(`✅ [Generate] Audio received: ${audioBuffer.length} bytes`);

        // Upload to S3
        const filename = `tts-${Date.now()}.mp3`;
        const uploadResult = await uploadToS3(audioBuffer, filename, "audio/mpeg");

        if (!uploadResult.success) {
          throw new Error(uploadResult.error || "Failed to upload audio to S3");
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          url: uploadResult.url,
          id: Date.now().toString(),
        }));
      } catch (error) {
        console.error("❌ [Generate] Audio error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : "Generation failed",
        }));
      }
    });
    return;
  }

  // GET /api/voices - Get available ElevenLabs voices
  if (req.url === "/api/voices" && req.method === "GET") {
    try {
      const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
      if (!ELEVENLABS_API_KEY) {
        throw new Error("ELEVENLABS_API_KEY not configured");
      }

      console.log(`🎤 [Voices] Fetching ElevenLabs voices...`);

      const response = await fetch("https://api.elevenlabs.io/v1/voices", {
        method: "GET",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.status}`);
      }

      const data = await response.json();
      const voices = data.voices || [];

      console.log(`✅ [Voices] Found ${voices.length} voices`);

      // Filter out voices that are not fine-tuned (professional clones need fine-tuning)
      const readyVoices = voices.filter((voice: any) => {
        // Premade voices always work
        if (voice.category === "premade") {
          return true;
        }

        // Check fine_tuning status for cloned voices
        if (voice.fine_tuning) {
          const state = voice.fine_tuning.fine_tuning_state;
          const isAllowed = voice.fine_tuning.is_allowed_to_fine_tune;

          // Log for debugging
          console.log(`🔍 [Voices] ${voice.name} (${voice.voice_id}): category=${voice.category}, state=${state}, isAllowed=${isAllowed}`);

          // Skip if fine-tuning is required but not complete
          if (state && state !== "fine_tuned" && state !== "not_started") {
            console.log(`⚠️ [Voices] Skipping ${voice.name}: not fine-tuned (state=${state})`);
            return false;
          }

          // Skip if not allowed to use (professional voices that need fine-tuning)
          if (isAllowed === false && state !== "fine_tuned") {
            console.log(`⚠️ [Voices] Skipping ${voice.name}: not allowed and not fine-tuned`);
            return false;
          }
        }
        return true;
      });

      console.log(`✅ [Voices] ${readyVoices.length} ready voices (filtered from ${voices.length})`);

      // Map to simplified format
      const simplifiedVoices = readyVoices.map((voice: any) => ({
        id: voice.voice_id,
        name: voice.name,
        category: voice.category || "custom",
        labels: voice.labels || {},
        preview_url: voice.preview_url,
      }));

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, voices: simplifiedVoices }));
    } catch (error) {
      console.error("❌ [Voices] Error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Failed to fetch voices" }));
    }
    return;
  }

  // POST /api/generate/lipsync - Generate lipsync video using fal.ai VEED Fabric
  if (req.url === "/api/generate/lipsync" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => {
      try {
        const { audio_url, image_url, resolution } = JSON.parse(body);
        console.log(`👄 [Generate] Lipsync via fal.ai VEED Fabric: resolution=${resolution || "720p"}`);

        const FAL_KEY = process.env.FAL_KEY;
        if (!FAL_KEY) throw new Error("FAL_KEY not configured");

        // Submit job to fal.ai queue
        const queueResponse = await fetch("https://queue.fal.run/veed/fabric-1.0", {
          method: "POST",
          headers: {
            "Authorization": `Key ${FAL_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            image_url,
            audio_url,
            resolution: resolution || "720p",
          }),
        });

        if (!queueResponse.ok) {
          const errorText = await queueResponse.text();
          throw new Error(`fal.ai queue error: ${queueResponse.status} ${errorText}`);
        }

        const queueResult = await queueResponse.json();
        const requestId = queueResult.request_id;
        console.log(`👄 [fal.ai] Job queued: ${requestId}`);

        // Poll for result
        let videoUrl = null;
        for (let i = 0; i < 120; i++) { // Max 10 minutes (5s intervals)
          await new Promise(r => setTimeout(r, 5000));

          const statusResponse = await fetch(`https://queue.fal.run/veed/fabric-1.0/requests/${requestId}/status`, {
            headers: { "Authorization": `Key ${FAL_KEY}` },
          });
          const statusData = await statusResponse.json();
          console.log(`👄 [fal.ai] Status: ${statusData.status}`);

          if (statusData.status === "COMPLETED") {
            // Get the result
            const resultResponse = await fetch(`https://queue.fal.run/veed/fabric-1.0/requests/${requestId}`, {
              headers: { "Authorization": `Key ${FAL_KEY}` },
            });
            const resultData = await resultResponse.json();
            videoUrl = resultData.video?.url;
            break;
          } else if (statusData.status === "FAILED") {
            throw new Error(`fal.ai job failed: ${statusData.error || "Unknown error"}`);
          }
        }

        if (videoUrl) {
          console.log(`👄 [fal.ai] Video ready: ${videoUrl}`);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, url: videoUrl, id: requestId }));
          return;
        }

        throw new Error("Lipsync generation timeout");
      } catch (error) {
        console.error("❌ [Generate] Lipsync error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Generation failed" }));
      }
    });
    return;
  }

  // Витрина шаблонов для мини-аппа: человеку нужен не только id композиции,
  // но и что это за шаблон, какие поля заполнять и по каким правилам канона.
  //
  // Витрина НЕ является источником правды о существовании шаблона: список
  // пересекается с реальным бандлом (тот же урок, что и у /compositions —
  // рукописный список неизбежно расходится с кодом). Наружу уходят только те
  // карточки, которые действительно можно отрендерить.
  if (req.url === "/templates" && req.method === "GET") {
    try {
      const comps = await knownCompositions();
      const byId = new Map(comps.map(c => [c.id, c]));
      const templates = TEMPLATE_CARDS.filter(t => byId.has(t.id)).map(t => {
        const c = byId.get(t.id)!;
        return {
          ...t,
          width: c.width,
          height: c.height,
          fps: c.fps,
          durationInFrames: c.durationInFrames,
        };
      });
      const missing = TEMPLATE_CARDS.filter(t => !byId.has(t.id)).map(t => t.id);
      if (missing.length) {
        console.warn("[templates] карточки без композиции в бандле:", missing.join(", "));
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ templates }));
    } catch (error) {
      console.error("Templates error:", error);
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "bundle not ready" }));
    }
    return;
  }

  // List compositions
  if (req.url === "/compositions" && req.method === "GET") {
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
      const comps = await knownCompositions();
      res.writeHead(200, { "Content-Type": "application/json" });
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
      );
    } catch (error) {
      console.error("Compositions error:", error);
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "bundle not ready" }));
    }
    return;
  }

  // Analyze face in video/image
  if (req.url === "/analyze-face" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => {
      try {
        const { videoUrl, imageUrl, shape = "portrait" } = JSON.parse(body);
        const mediaUrl = videoUrl || imageUrl;

        if (!mediaUrl) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "videoUrl or imageUrl is required" }));
          return;
        }

        console.log(`👤 Analyzing face in: ${mediaUrl}`);

        // Resolve path for local files
        let filePath = mediaUrl;
        if (mediaUrl.startsWith("/") && !mediaUrl.startsWith("//")) {
          filePath = path.join(process.cwd(), "public", mediaUrl);
        }

        // Detect face
        const isVideo = mediaUrl.endsWith(".mp4") || mediaUrl.endsWith(".webm") || mediaUrl.endsWith(".mov");
        const faceBox = isVideo
          ? await detectFaceInVideo(filePath)
          : await detectFaceInImage(filePath);

        if (!faceBox) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: true,
            faceDetected: false,
            message: "No face detected in media"
          }));
          return;
        }

        // Calculate crop settings
        const cropSettings = calculateCropSettings(faceBox, shape as "square" | "portrait" | "circle");

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          faceDetected: true,
          faceBox,
          cropSettings,
        }));
      } catch (error) {
        console.error("Face analysis error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          error: error instanceof Error ? error.message : "Face analysis failed"
        }));
      }
    });
    return;
  }

  // Upload asset to S3
  if (req.url === "/upload" && req.method === "POST") {
    const chunks: Buffer[] = [];

    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    req.on("end", async () => {
      try {
        const fileBuffer = Buffer.concat(chunks);
        const filename = (req.headers["x-filename"] as string) || `file-${Date.now()}`;
        const contentType = (req.headers["content-type"] as string) || getContentType(filename);

        if (fileBuffer.length === 0) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No file data received" }));
          return;
        }

        // Check file size (max 100MB)
        const maxSize = 100 * 1024 * 1024;
        if (fileBuffer.length > maxSize) {
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "File too large (max 100MB)" }));
          return;
        }

        const result = await uploadToS3(fileBuffer, filename, contentType);
        const statusCode = result.success ? 200 : 500;
        res.writeHead(statusCode, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (error) {
        console.error("Upload error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Upload failed" }));
      }
    });

    req.on("error", (error) => {
      console.error("Request error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Request error" }));
    });

    return;
  }

  // List S3 assets
  if (req.url === "/assets" && req.method === "GET") {
    const result = await listS3Assets();
    const statusCode = result.success ? 200 : 500;
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
    return;
  }


  // Serve rendered files
  if (req.url?.startsWith("/renders/") && req.method === "GET") {
    // Strip query string from URL
    const urlPath = req.url.split('?')[0];
    const filename = urlPath.replace("/renders/", "");
    const filePath = path.join(OUTPUT_DIR, filename);

    serveStaticFile(res, filePath);
    return;
  }

  // Serve public assets (with /public/ prefix)
  if (req.url?.startsWith("/public/") && req.method === "GET") {
    // Strip query string from URL
    const urlPath = req.url.split('?')[0];
    const filename = urlPath.replace("/public/", "");
    const filePath = path.join(process.cwd(), "public", filename);
    console.log(`📂 Request for public file: ${req.url} -> ${filePath}`);

    serveStaticFile(res, filePath);
    return;
  }

  // Serve public assets (without /public/ prefix - for editor compatibility)
  // Handles: /covers/*, /backgrounds/*, /lipsync/*, /music/*
  const publicPaths = ["/covers/", "/backgrounds/", "/lipsync/", "/music/", "/audio/", "/render-temp/"];
  const matchedPath = publicPaths.find(p => req.url?.startsWith(p));
  if (matchedPath && req.method === "GET") {
    // Strip query string from URL before building file path
    const urlPath = req.url!.split('?')[0];
    const filePath = path.join(process.cwd(), "public", urlPath);
    console.log(`📂 Request for public file (no prefix): ${req.url} -> ${filePath}`);

    serveStaticFile(res, filePath);
    return;
  }

  // S3 video proxy with HEVC → H.264 conversion for browser compatibility
  if (req.url?.startsWith("/s3/") && req.method === "GET") {
    const s3Key = decodeURIComponent(req.url.slice(4).split('?')[0]); // Remove /s3/ and query string, decode URL
    const ext = path.extname(s3Key).toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'].includes(ext);
    const isAudio = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.webm'].includes(ext);
    const isJson = ext === '.json';

    console.log(`🎬 S3 proxy request: ${s3Key} (image: ${isImage}, audio: ${isAudio}, json: ${isJson})`);

    // For images, audio, and JSON - serve directly from S3 without conversion
    if (isImage || isAudio || isJson) {
      try {
        const command = new GetObjectCommand({
          Bucket: S3_BUCKET,
          Key: s3Key,
        });
        const response = await s3Client.send(command);
        const contentType = response.ContentType || (isImage ? 'image/jpeg' : isAudio ? 'audio/mpeg' : 'application/json');

        res.writeHead(200, {
          "Content-Type": contentType,
          "Content-Length": response.ContentLength?.toString() || '',
          "Cache-Control": "public, max-age=31536000",
          "Access-Control-Allow-Origin": "*",
        });

        const body = response.Body as NodeJS.ReadableStream;
        body.pipe(res);
      } catch (error) {
        console.error(`❌ S3 proxy error for ${s3Key}:`, error);
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "File not found" }));
      }
      return;
    }

    // For videos - download, convert to H.264, cache
    const cacheDir = path.join(process.cwd(), "public", "video-cache");
    const cacheFilename = `${s3Key.replace(/\//g, '-').replace(/[^a-zA-Z0-9.-]/g, '_')}-h264.mp4`;
    const cachePath = path.join(cacheDir, cacheFilename);

    // Check cache first
    if (fs.existsSync(cachePath)) {
      console.log(`✅ Serving cached H.264 video: ${cachePath}`);
      serveStaticFile(res, cachePath);
      return;
    }

    // Download and convert
    try {
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }

      const tempPath = path.join(cacheDir, `temp-${Date.now()}.mp4`);

      // Download from S3
      console.log(`📥 Downloading from S3: ${s3Key}`);
      const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
      });
      const response = await s3Client.send(command);
      const body = response.Body as NodeJS.ReadableStream;

      await new Promise<void>((resolve, reject) => {
        const file = fs.createWriteStream(tempPath);
        body.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
        file.on('error', reject);
      });

      // Convert to H.264
      console.log(`🔄 Converting to H.264: ${cachePath}`);
      execSync(
        `ffmpeg -i "${tempPath}" -c:v libx264 -preset fast -crf 23 -c:a aac -movflags +faststart -y "${cachePath}"`,
        { stdio: 'pipe', timeout: 300000 }
      );

      // Remove temp file
      fs.unlinkSync(tempPath);

      console.log(`✅ Converted and cached: ${cachePath}`);
      serveStaticFile(res, cachePath);
    } catch (error) {
      console.error(`❌ S3 video proxy error:`, error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to process video" }));
    }
    return;
  }

  // Cache control by file type - JSON needs frequent updates, video/images can be cached
  function getCacheControl(filePath: string): string {
    // JSON files - no cache (captions.json changes frequently)
    if (filePath.endsWith('.json')) {
      return "public, max-age=0, must-revalidate";
    }
    // Video - 1 hour (balance between performance and freshness)
    if (/\.(mp4|webm|mov|avi)$/i.test(filePath)) {
      return "public, max-age=3600";
    }
    // Images - 1 day
    if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(filePath)) {
      return "public, max-age=86400";
    }
    // Default - 1 hour
    return "public, max-age=3600";
  }

  function serveStaticFile(res: any, filePath: string) {
    console.log(`📂 Serving file: ${filePath}`);
    if (fs.existsSync(filePath)) {
      console.log(`✅ File found: ${filePath}`);
      const stat = fs.statSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const contentType =
        ext === ".mp4"
          ? "video/mp4"
          : ext === ".mp3"
          ? "audio/mpeg"
          : ext === ".wav"
          ? "audio/wav"
          : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".png"
          ? "image/png"
          : ext === ".gif"
          ? "image/gif"
          : ext === ".json"
          ? "application/json"
          : "application/octet-stream";

      // Handle Range requests (essential for video seek)
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        
        if (start >= stat.size) {
          res.writeHead(416, {
            "Content-Range": `bytes */${stat.size}`,
          });
          return res.end();
        }

        const chunksize = end - start + 1;
        const file = fs.createReadStream(filePath, { start, end });
        
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize,
          "Content-Type": contentType,
          "Cache-Control": getCacheControl(filePath),
          "Access-Control-Allow-Origin": "*",
        });
        file.pipe(res);
        return;
      }

      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": stat.size,
        "Accept-Ranges": "bytes",
        "Cache-Control": getCacheControl(filePath),
        "Access-Control-Allow-Origin": "*",
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // Этот сервер намеренно не везёт каталог public/: те же ~500MB медиа уже
    // задеплоены вместе с редактором, и вторая копия здесь была бы чистым
    // дублированием. Значит запрос сюда за медиа — всегда ошибка вызывающего,
    // а не отсутствующий файл. Прошлый текст «File not found» это скрывал:
    // из него не было видно, ни почему файла нет, ни куда идти.
    const MEDIA_HINT = process.env.MEDIA_ORIGIN || "https://vibee-editor-production.up.railway.app";
    console.log(
      `❌ Media requested from the render server: ${filePath}\n` +
      `   Этот сервер не хранит public/. Правильный адрес: ${MEDIA_HINT}${req.url}\n` +
      `   В редакторе такие пути строит MEDIA_ORIGIN (player/src/lib/mediaUrl.ts), не RENDER_SERVER_URL.`
    );
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "This server does not host media",
        requested: req.url,
        serveFrom: `${MEDIA_HINT}${req.url}`,
        hint: "Use MEDIA_ORIGIN in the editor, not RENDER_SERVER_URL",
      })
    );
  }

  // SSE endpoint for render progress streaming
  //
  // Матчим ПУТЬ без строки запроса: подпись для EventSource приходит именно
  // параметром (?initData=...), потому что заголовки этот API ставить не
  // умеет. Регулярка по сырому req.url на такой ссылке не срабатывала, запрос
  // проваливался мимо маршрута и отвечал 404 — прогресс не приходил, а кнопка
  // «Экспорт» отжималась.
  const ssePath = (req.url || "").split("?")[0];
  const sseMatch = ssePath.match(/^\/render\/([^/]+)\/status$/);
  if (sseMatch && req.method === "GET") {
    const renderId = sseMatch[1];
    const job = renderJobs.get(renderId);

    if (!job) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Render job not found" }));
      return;
    }

    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    console.log(`[SSE] Client subscribed to render ${renderId}`);

    // Send initial status
    res.write(`data: ${JSON.stringify({
      status: job.status,
      progress: job.progress,
      outputUrl: job.outputUrl,
      hlsUrl: (job as any).hlsUrl,
      hlsRenditions: (job as any).hlsRenditions,
      error: job.error
    })}\n\n`);

    // Poll for updates every 500ms
    const interval = setInterval(() => {
      const currentJob = renderJobs.get(renderId);
      if (!currentJob) {
        res.write(`data: ${JSON.stringify({ status: 'not_found' })}\n\n`);
        clearInterval(interval);
        res.end();
        return;
      }

      res.write(`data: ${JSON.stringify({
        status: currentJob.status,
        progress: currentJob.progress,
        outputUrl: currentJob.outputUrl,
        error: currentJob.error
      })}\n\n`);

      // Close connection when job is done
      if (currentJob.status === 'completed' || currentJob.status === 'failed') {
        console.log(`[SSE] Render ${renderId} finished, closing SSE connection`);
        clearInterval(interval);
        res.end();
      }
    }, 500);

    // Clean up on client disconnect
    req.on("close", () => {
      console.log(`[SSE] Client disconnected from render ${renderId}`);
      clearInterval(interval);
    });

    return;
  }

  // Get render status (polling alternative to SSE)
  // Тот же приём: путь без query, иначе ?initData ломает совпадение.
  const statusMatch = (req.url || "").split("?")[0].match(/^\/render\/([^/]+)$/);
  if (statusMatch && req.method === "GET") {
    const renderId = statusMatch[1];
    const job = renderJobs.get(renderId);

    if (!job) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Render job not found" }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      id: job.id,
      status: job.status,
      progress: job.progress,
      outputUrl: job.outputUrl,
      hlsUrl: (job as any).hlsUrl,           // HLS streaming URL (Tigris CDN)
      hlsRenditions: (job as any).hlsRenditions,  // Available quality levels
      publicUrl: job.publicUrl,
      error: job.error,
    }));
    return;
  }

  // Universal template render endpoint
  if (req.url === "/render/template" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      try {
        const request: TemplateRenderRequest = JSON.parse(body);

        if (!request.compositionId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "compositionId is required" }));
          return;
        }

        const renderId = randomUUID();
        const fps = 30;
        const startTime = Date.now();

        // Create job entry
        renderJobs.set(renderId, {
          id: renderId,
          status: 'pending',
          progress: 0,
          startedAt: new Date(),
        });

        // Return immediately with job info
        res.writeHead(202, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          renderId,
          compositionId: request.compositionId,
          statusUrl: `/render/${renderId}`,
          sseUrl: `/render/${renderId}/status`,
          message: "Render started. Use SSE endpoint for progress updates.",
        }));

        // Start render in background
        (async () => {
          const job = renderJobs.get(renderId)!;
          job.status = 'rendering';

          try {
            if (!bundleLocation) {
              throw new Error("Bundle not initialized");
            }

            // Build input props from request
            const inputProps: Record<string, unknown> = {
              ...(request.props || {}),
            };

            let durationInFrames = 900; // 30 seconds default

            // Handle lipSyncVideo if provided (common for talking head templates)
            let lipSyncVideoPath = request.lipSyncVideo;

            // Pre-download S3 assets for faster rendering
            if (lipSyncVideoPath && lipSyncVideoPath.includes('/s3/')) {
              console.log(`📥 Pre-downloading lipSyncVideo for template render...`);
              lipSyncVideoPath = await preDownloadS3Asset(lipSyncVideoPath);
            }

            if (lipSyncVideoPath) {
              inputProps.lipSyncVideo = lipSyncVideoPath;

              const videoPath = resolveMediaPath(lipSyncVideoPath);
              if (fs.existsSync(videoPath)) {
                // Get video duration
                const duration = getVideoDuration(videoPath);
                if (duration > 0) {
                  durationInFrames = Math.ceil(duration * fps);
                  console.log(`📏 Video duration: ${duration.toFixed(2)}s = ${durationInFrames} frames`);
                }

                // Auto face detection (if not already provided)
                if (inputProps.faceOffsetX === undefined) {
                  try {
                    console.log(`👤 Auto-detecting face in: ${videoPath}`);
                    const faceBox = await detectFaceInVideo(videoPath);
                    if (faceBox) {
                      const crop = calculateCropSettings(faceBox, 'portrait');
                      inputProps.faceOffsetX = crop.offsetX;
                      inputProps.faceOffsetY = crop.offsetY;
                      inputProps.faceScale = crop.scale;
                      console.log(`✅ Face detected: offsetX=${crop.offsetX.toFixed(1)}, offsetY=${crop.offsetY.toFixed(1)}, scale=${crop.scale.toFixed(2)}`);
                    }
                  } catch (e) {
                    console.warn("⚠️ Face detection failed:", e);
                  }
                }
              }
            }

            // Handle segments (convert from seconds to frames)
            if (request.segments) {
              inputProps.segments = convertSegmentsToFrames(request.segments, fps);
            } else if (lipSyncVideoPath && !inputProps.segments) {
              // Default fullscreen segment for lipsync videos
              inputProps.segments = [{ type: 'fullscreen', startFrame: 0, durationFrames: durationInFrames, caption: '' }];
            }

            // Handle captions
            if (request.captions) {
              inputProps.captions = request.captions;
              inputProps.showCaptions = request.captions.length > 0;
            }

            // Apply template-specific defaults
            const templateDefaults: Record<string, Record<string, unknown>> = {
              SplitTalkingHead: {
                splitRatio: 0.5,
                musicVolume: 0.06,
                videoVolume: 1,  // LipSync video audio volume
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
            };

            const defaults = templateDefaults[request.compositionId] || {};
            for (const [key, value] of Object.entries(defaults)) {
              if (inputProps[key] === undefined) {
                inputProps[key] = value;
              }
            }

            console.log(`🎬 Rendering ${request.compositionId} with props:`, Object.keys(inputProps));

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
                args: [
                  '--no-sandbox',
                  '--disable-setuid-sandbox',
                  '--disable-gpu',
                  '--disable-software-rasterizer',
                  '--disable-dev-shm-usage',
                ],
              },
              timeoutInMilliseconds: 300000, // 5 minutes for slow video loading
            });

            // Override duration if we detected it
            if (durationInFrames > 0) {
              (composition as any).durationInFrames = durationInFrames;
            }

            // Render video
            const outputPath = path.join(OUTPUT_DIR, `${renderId}.mp4`);

            await renderMedia({
              composition,
              serveUrl: bundleLocation,
              codec: "h264",
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
                args: [
                  '--no-sandbox',
                  '--disable-setuid-sandbox',
                  '--disable-gpu',
                ],
              },
              timeoutInMilliseconds: 300000, // 5 minutes for slow video loading
              onProgress: ({ progress }) => {
                job.progress = Math.round(progress * 100);
              },
            });

            // Upload to S3 if enabled (default: true)
            let publicUrl: string | undefined;
            if (request.uploadToS3 !== false) {
              const uploadResult = await uploadRenderedFile(
                outputPath,
                request.s3Prefix || "renders/"
              );
              if (uploadResult.success) {
                publicUrl = uploadResult.url;
              }
            }

            // Update job status
            job.status = 'completed';
            job.progress = 100;
            job.outputUrl = publicUrl || `/renders/${renderId}.mp4`;

            const renderTimeMs = Date.now() - startTime;
            console.log(`✅ [Render] ${renderId} completed in ${renderTimeMs}ms`);

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
              );
            }

            // Send Telegram notification with video
            if (publicUrl) {
              const renderTimeSec = Math.round(renderTimeMs / 1000);
              const userInfo = request.userInfo;
              const caption = userInfo
                ? `✅ <b>Рендер готов!</b>\n\n👤 ${userInfo.first_name || 'Unknown'} (@${userInfo.username || 'нет'})\n📹 ${userInfo.project_name || 'Untitled'}\n⏱ ${renderTimeSec}s`
                : `✅ <b>Рендер готов!</b>\n\n⏱ ${renderTimeSec}s`;
              await sendTelegramVideo(TELEGRAM_RENDERS_GROUP, publicUrl, caption);

              // Auto-publish to community feed
              if (userInfo && userInfo.telegram_id) {
                await publishToFeed({
                  telegramId: userInfo.telegram_id,
                  creatorName: userInfo.first_name || userInfo.username || 'Anonymous',
                  projectName: userInfo.project_name || 'Vibee Reel',
                  videoUrl: publicUrl,
                  templateSettings: request.inputProps || request.props || {},
                  assets: (request as any).assets || [],
                  tracks: (request as any).tracks || [],
                });
              }
            }

          } catch (error) {
            console.error(`❌ [Render] ${renderId} failed:`, error);
            job.status = 'failed';
            job.error = error instanceof Error ? error.message : "Unknown error";

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
              );
            }
          }
        })();

      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
    return;
  }

  // Render endpoint - starts async render and returns immediately
  if (req.url === "/render" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      try {
        const renderReq: RenderRequest = JSON.parse(body);

        if (!renderReq.compositionId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "compositionId is required" }));
          return;
        }

        // Существует ли такая композиция — проверяется ЗДЕСЬ, а не в рендере.
        //
        // Раньше проверялось только что строка непустая. POST с
        // compositionId "TextOverlay" получал 202 и renderId, а падал через
        // ~15 секунд: "Could not find composition with ID TextOverlay".
        // Замерено. Клиент к тому моменту уже показал человеку прогресс.
        try {
          const available = (await knownCompositions()).map(c => c.id);
          if (!available.includes(renderReq.compositionId)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              error: `Unknown compositionId "${renderReq.compositionId}"`,
              available,
            }));
            return;
          }
        } catch (e) {
          // Бандл не готов — это не повод отвергать задачу: рендер всё равно
          // ждёт бандл сам. Пропускаем дальше, как было до проверки.
          console.warn("Composition check skipped:", e instanceof Error ? e.message : e);
        }

        // Start render asynchronously and return immediately
        const renderId = startRenderAsync(renderReq);
        console.log(`🎬 Started async render: ${renderId}`);

        res.writeHead(202, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          renderId,
          statusUrl: `/render/${renderId}`,
          sseUrl: `/render/${renderId}/status`,
          message: "Render started. Use SSE endpoint for progress updates.",
        }));
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
    return;
  }

  // ==============================================
  // HLS Streaming Endpoints (Video Optimization)
  // ==============================================

  const HLS_DIR = path.join(process.cwd(), "public", "hls");
  if (!fs.existsSync(HLS_DIR)) {
    fs.mkdirSync(HLS_DIR, { recursive: true });
  }

  // HLS conversion jobs storage
  interface HLSJob {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    playlistUrl?: string;
    renditionUrls?: Record<string, string>;
    duration?: number;
    error?: string;
    startedAt: Date;
  }
  const hlsJobs = new Map<string, HLSJob>();

  // POST /convert/hls - Convert MP4 to HLS
  if (req.url === "/convert/hls" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => {
      try {
        const { video_url, renditions = ["360p", "720p", "1080p"], segment_duration = 6 } = JSON.parse(body);

        if (!video_url) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "video_url is required" }));
          return;
        }

        const jobId = randomUUID();
        const videoId = `hls-${Date.now()}`;
        const hlsOutputDir = path.join(HLS_DIR, videoId);
        fs.mkdirSync(hlsOutputDir, { recursive: true });

        // Create job entry
        hlsJobs.set(jobId, {
          id: jobId,
          status: 'pending',
          progress: 0,
          startedAt: new Date(),
        });

        // Return immediately with job info
        res.writeHead(202, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          job_id: jobId,
          video_id: videoId,
          status_url: `/hls/status/${jobId}`,
          message: "HLS conversion started",
        }));

        // Start HLS conversion in background
        (async () => {
          const job = hlsJobs.get(jobId)!;
          job.status = 'processing';

          try {
            // Download video if it's a URL
            let inputPath = video_url;
            if (video_url.startsWith('http')) {
              const tempPath = path.join(hlsOutputDir, 'input.mp4');
              console.log(`📥 Downloading video for HLS conversion: ${video_url}`);

              const response = await fetch(video_url);
              const buffer = Buffer.from(await response.arrayBuffer());
              fs.writeFileSync(tempPath, buffer);
              inputPath = tempPath;
            }

            // Get video duration
            const duration = getVideoDuration(inputPath);
            job.duration = duration;

            // Rendition configurations
            const renditionConfigs: Record<string, { width: number; height: number; bitrate: number }> = {
              "360p": { width: 640, height: 360, bitrate: 800 },
              "480p": { width: 854, height: 480, bitrate: 1400 },
              "720p": { width: 1280, height: 720, bitrate: 2800 },
              "1080p": { width: 1920, height: 1080, bitrate: 5000 },
            };

            const renditionUrls: Record<string, string> = {};
            const totalRenditions = renditions.length;
            let completedRenditions = 0;

            // Create each rendition
            for (const quality of renditions) {
              const config = renditionConfigs[quality];
              if (!config) continue;

              const renditionDir = path.join(hlsOutputDir, quality);
              fs.mkdirSync(renditionDir, { recursive: true });

              const playlistPath = path.join(renditionDir, "playlist.m3u8");

              // FFmpeg HLS command
              const ffmpegCmd = `ffmpeg -i "${inputPath}" ` +
                `-vf "scale=${config.width}:${config.height}" ` +
                `-c:v libx264 -preset fast -b:v ${config.bitrate}k ` +
                `-c:a aac -b:a 128k ` +
                `-hls_time ${segment_duration} ` +
                `-hls_list_size 0 ` +
                `-hls_segment_filename "${renditionDir}/segment%03d.ts" ` +
                `-f hls "${playlistPath}"`;

              console.log(`🎬 Creating HLS ${quality}: ${ffmpegCmd.substring(0, 100)}...`);
              execSync(ffmpegCmd, { stdio: 'pipe', timeout: 600000 });

              renditionUrls[quality] = `/hls/${videoId}/${quality}/playlist.m3u8`;
              completedRenditions++;
              job.progress = Math.round((completedRenditions / totalRenditions) * 100);
            }

            // Create master playlist
            const masterPlaylist = [
              "#EXTM3U",
              "#EXT-X-VERSION:3",
            ];

            for (const quality of renditions) {
              const config = renditionConfigs[quality];
              if (!config || !renditionUrls[quality]) continue;

              masterPlaylist.push(
                `#EXT-X-STREAM-INF:BANDWIDTH=${config.bitrate * 1000},RESOLUTION=${config.width}x${config.height}`,
                `${quality}/playlist.m3u8`
              );
            }

            fs.writeFileSync(path.join(hlsOutputDir, "master.m3u8"), masterPlaylist.join("\n"));

            // Update job
            job.status = 'completed';
            job.progress = 100;
            job.playlistUrl = `/hls/${videoId}/master.m3u8`;
            job.renditionUrls = renditionUrls;

            console.log(`✅ HLS conversion completed: ${job.playlistUrl}`);

            // Clean up temp input
            if (video_url.startsWith('http') && fs.existsSync(path.join(hlsOutputDir, 'input.mp4'))) {
              fs.unlinkSync(path.join(hlsOutputDir, 'input.mp4'));
            }
          } catch (error) {
            console.error(`❌ HLS conversion failed:`, error);
            job.status = 'failed';
            job.error = error instanceof Error ? error.message : "Conversion failed";
          }
        })();

      } catch (error) {
        console.error("HLS conversion error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "HLS conversion failed" }));
      }
    });
    return;
  }

  // GET /hls/status/{job_id} - Check HLS conversion status
  const hlsStatusMatch = req.url?.match(/^\/hls\/status\/([^/]+)$/);
  if (hlsStatusMatch && req.method === "GET") {
    const jobId = hlsStatusMatch[1];
    const job = hlsJobs.get(jobId);

    if (!job) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "HLS job not found" }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: job.status,
      progress: job.progress,
      playlist_url: job.playlistUrl,
      rendition_urls: job.renditionUrls,
      duration: job.duration,
      error: job.error,
    }));
    return;
  }

  // GET /hls/{video_id}/master.m3u8 - Serve HLS master manifest
  // GET /hls/{video_id}/{quality}/playlist.m3u8 - Serve quality playlist
  // GET /hls/{video_id}/{quality}/*.ts - Serve segments
  if (req.url?.startsWith("/hls/") && req.method === "GET") {
    const hlsPath = req.url.slice(5); // Remove /hls/
    const filePath = path.join(HLS_DIR, hlsPath);

    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath);
      const contentType = ext === ".m3u8" ? "application/vnd.apple.mpegurl" : "video/mp2t";

      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
      });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "HLS file not found" }));
    }
    return;
  }

  // ==============================================
  // Video Optimization Endpoints
  // ==============================================

  // GET /video/{video_id}/metadata - Get video metadata for preloading
  const metadataMatch = req.url?.match(/^\/video\/([^/]+)\/metadata$/);
  if (metadataMatch && req.method === "GET") {
    const videoId = decodeURIComponent(metadataMatch[1]);

    try {
      // Find the video file
      let videoPath = "";
      const possiblePaths = [
        path.join(OUTPUT_DIR, `${videoId}.mp4`),
        path.join(process.cwd(), "public", videoId),
        path.join(HLS_DIR, videoId, "input.mp4"),
      ];

      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          videoPath = p;
          break;
        }
      }

      if (!videoPath) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Video not found" }));
        return;
      }

      // Get metadata using ffprobe
      const probeResult = execSync(
        `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,codec_name,bit_rate -show_entries format=duration,size -of json "${videoPath}"`,
        { encoding: 'utf-8', timeout: 30000 }
      );

      const probeData = JSON.parse(probeResult);
      const stream = probeData.streams?.[0] || {};
      const format = probeData.format || {};

      // Parse frame rate
      const fpsMatch = stream.r_frame_rate?.match(/(\d+)\/(\d+)/);
      const fps = fpsMatch ? parseInt(fpsMatch[1]) / parseInt(fpsMatch[2]) : 30;

      // Generate poster (first frame)
      const posterPath = path.join(OUTPUT_DIR, `${videoId}-poster.webp`);
      if (!fs.existsSync(posterPath)) {
        execSync(
          `ffmpeg -i "${videoPath}" -vframes 1 -f webp -q:v 80 "${posterPath}" -y`,
          { stdio: 'pipe', timeout: 30000 }
        );
      }

      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      });
      res.end(JSON.stringify({
        duration: parseFloat(format.duration) || 0,
        width: stream.width || 0,
        height: stream.height || 0,
        fps: Math.round(fps * 100) / 100,
        codec: stream.codec_name || "unknown",
        bitrate: parseInt(stream.bit_rate) || 0,
        poster_url: `/renders/${videoId}-poster.webp`,
        size_bytes: parseInt(format.size) || 0,
      }));
    } catch (error) {
      console.error("Metadata extraction error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to get metadata" }));
    }
    return;
  }

  // POST /video/{video_id}/poster - Generate poster image
  const posterMatch = req.url?.match(/^\/video\/([^/]+)\/poster$/);
  if (posterMatch && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => {
      try {
        const videoId = decodeURIComponent(posterMatch[1]);
        const { timestamp = 0, format = "webp", quality = 80 } = JSON.parse(body || "{}");

        // Find video
        const videoPath = path.join(OUTPUT_DIR, `${videoId}.mp4`);
        if (!fs.existsSync(videoPath)) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Video not found" }));
          return;
        }

        const posterFilename = `${videoId}-poster-${timestamp.toFixed(1)}.${format}`;
        const posterPath = path.join(OUTPUT_DIR, posterFilename);

        // Generate poster at specified timestamp
        execSync(
          `ffmpeg -ss ${timestamp} -i "${videoPath}" -vframes 1 -f ${format} -q:v ${quality} "${posterPath}" -y`,
          { stdio: 'pipe', timeout: 30000 }
        );

        const stats = fs.statSync(posterPath);

        // Get dimensions
        const probeResult = execSync(
          `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of json "${posterPath}"`,
          { encoding: 'utf-8', timeout: 10000 }
        );
        const probeData = JSON.parse(probeResult);
        const stream = probeData.streams?.[0] || {};

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          poster_url: `/renders/${posterFilename}`,
          width: stream.width || 0,
          height: stream.height || 0,
          size_bytes: stats.size,
        }));
      } catch (error) {
        console.error("Poster generation error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to generate poster" }));
      }
    });
    return;
  }

  // POST /video/optimize - Optimize video for web delivery
  if (req.url === "/video/optimize" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => {
      try {
        const {
          video_url,
          target_codec = "h264",
          quality = "balanced",
          max_bitrate
        } = JSON.parse(body);

        if (!video_url) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "video_url is required" }));
          return;
        }

        const videoId = `opt-${Date.now()}`;
        const outputPath = path.join(OUTPUT_DIR, `${videoId}.mp4`);

        // Download video if URL
        let inputPath = video_url;
        if (video_url.startsWith('http')) {
          const tempPath = path.join(OUTPUT_DIR, `temp-${videoId}.mp4`);
          const response = await fetch(video_url);
          const buffer = Buffer.from(await response.arrayBuffer());
          fs.writeFileSync(tempPath, buffer);
          inputPath = tempPath;
        }

        const originalStats = fs.statSync(inputPath);
        const originalSize = originalStats.size;

        // Quality presets
        const presets: Record<string, { preset: string; crf: number }> = {
          fast: { preset: "ultrafast", crf: 28 },
          balanced: { preset: "fast", crf: 23 },
          quality: { preset: "slow", crf: 18 },
        };
        const preset = presets[quality] || presets.balanced;

        // Build ffmpeg command
        let ffmpegCmd = `ffmpeg -i "${inputPath}" `;

        if (target_codec === "h264") {
          ffmpegCmd += `-c:v libx264 -preset ${preset.preset} -crf ${preset.crf} `;
        } else if (target_codec === "h265") {
          ffmpegCmd += `-c:v libx265 -preset ${preset.preset} -crf ${preset.crf} `;
        } else if (target_codec === "av1") {
          ffmpegCmd += `-c:v libaom-av1 -crf ${preset.crf} -cpu-used 4 `;
        }

        if (max_bitrate) {
          ffmpegCmd += `-maxrate ${max_bitrate}k -bufsize ${max_bitrate * 2}k `;
        }

        ffmpegCmd += `-c:a aac -b:a 128k -movflags +faststart -y "${outputPath}"`;

        console.log(`🔄 Optimizing video: ${quality} preset, ${target_codec} codec`);
        execSync(ffmpegCmd, { stdio: 'pipe', timeout: 600000 });

        const optimizedStats = fs.statSync(outputPath);
        const optimizedSize = optimizedStats.size;

        // Clean up temp file
        if (video_url.startsWith('http') && fs.existsSync(inputPath)) {
          fs.unlinkSync(inputPath);
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          optimized_url: `/renders/${videoId}.mp4`,
          original_size: originalSize,
          optimized_size: optimizedSize,
          compression_ratio: Math.round((1 - optimizedSize / originalSize) * 100) / 100,
          codec: target_codec,
        }));
      } catch (error) {
        console.error("Video optimization error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Video optimization failed" }));
      }
    });
    return;
  }

  // ==============================================
  // CDN Integration Endpoints
  // ==============================================

  // POST /cdn/upload - Upload video to CDN with optimized headers
  if (req.url === "/cdn/upload" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => {
      try {
        const {
          video_url,
          cache_ttl = 31536000,  // 1 year default
          immutable = true
        } = JSON.parse(body);

        if (!video_url) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "video_url is required" }));
          return;
        }

        // Download video
        let videoBuffer: Buffer;
        if (video_url.startsWith('http')) {
          const response = await fetch(video_url);
          videoBuffer = Buffer.from(await response.arrayBuffer());
        } else {
          const localPath = path.join(process.cwd(), "public", video_url);
          if (!fs.existsSync(localPath)) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Video not found" }));
            return;
          }
          videoBuffer = fs.readFileSync(localPath);
        }

        // Upload to S3 with CDN-optimized headers
        const filename = `cdn-${Date.now()}.mp4`;
        const key = `cdn/${filename}`;

        await s3Client.send(new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
          Body: videoBuffer,
          ContentType: "video/mp4",
          CacheControl: immutable
            ? `public, max-age=${cache_ttl}, immutable`
            : `public, max-age=${cache_ttl}`,
          Metadata: {
            'x-vibee-optimized': 'true',
            'x-vibee-cache-ttl': cache_ttl.toString(),
          },
        }));

        const cdnUrl = `${S3_PUBLIC_URL}/${key}`;

        // Simulate edge locations (in production, this would come from CDN API)
        const edgeLocations = ["us-east-1", "eu-west-1", "ap-southeast-1"];

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          cdn_url: cdnUrl,
          cache_status: "uploaded",
          edge_locations: edgeLocations,
          original_size: videoBuffer.length,
        }));

        console.log(`✅ CDN upload complete: ${cdnUrl}`);
      } catch (error) {
        console.error("CDN upload error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "CDN upload failed" }));
      }
    });
    return;
  }

  // GET /cdn/status/{video_id} - Get CDN cache status
  const cdnStatusMatch = req.url?.match(/^\/cdn\/status\/([^/]+)$/);
  if (cdnStatusMatch && req.method === "GET") {
    const videoId = decodeURIComponent(cdnStatusMatch[1]);

    try {
      // Check if file exists in CDN (S3)
      const key = `cdn/${videoId}.mp4`;

      // Try to get object metadata
      const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });

      try {
        const response = await s3Client.send(command);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          cached: true,
          edge_locations: ["us-east-1", "eu-west-1", "ap-southeast-1"],
          hit_rate: 0.85,  // Simulated
          bandwidth_saved: response.ContentLength || 0,
          ttl_remaining: 31536000,
        }));
      } catch {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          cached: false,
          edge_locations: [],
          hit_rate: 0,
          bandwidth_saved: 0,
          ttl_remaining: 0,
        }));
      }
    } catch (error) {
      console.error("CDN status error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to get CDN status" }));
    }
    return;
  }

  // DELETE /cdn/cache/{video_id} - Purge CDN cache
  const cdnPurgeMatch = req.url?.match(/^\/cdn\/cache\/([^/]+)$/);
  if (cdnPurgeMatch && req.method === "DELETE") {
    const videoId = decodeURIComponent(cdnPurgeMatch[1]);

    try {
      // In production, this would call CDN purge API
      // For S3, we just delete and re-upload would create new cache
      console.log(`🗑️ CDN cache purge requested for: ${videoId}`);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        purged: true,
        edge_locations_cleared: ["us-east-1", "eu-west-1", "ap-southeast-1"],
      }));
    } catch (error) {
      console.error("CDN purge error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "CDN purge failed" }));
    }
    return;
  }

  // ===============================
  // Feed & User Endpoints
  // ===============================

  // POST /api/feed/publish - Publish template to community feed
  if (req.url === "/api/feed/publish" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", async () => {
      try {
        const data = JSON.parse(body);
        const pool = await getPool();

        // Look up creator username from users table
        let creatorUsername = "";
        try {
          const userResult = await pool.query(
            `SELECT username FROM users WHERE telegram_id = $1 LIMIT 1`,
            [String(data.telegram_id)]
          );
          if (userResult.rows.length > 0) {
            creatorUsername = userResult.rows[0].username || "";
          }
        } catch (e) {
          console.warn("[Feed] Could not look up creator username:", e);
        }

        const result = await pool.query(
          `INSERT INTO public_templates (
            telegram_id, creator_name, creator_avatar, creator_username,
            name, description, thumbnail_url, video_url,
            template_settings, assets, tracks,
            parent_template_id, original_creator_id,
            is_public, likes_count, views_count, uses_count
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13, TRUE, 0, 0, 0)
          RETURNING id, created_at::text`,
          [
            String(data.telegram_id),
            data.creator_name || "Anonymous",
            data.creator_avatar || null,
            creatorUsername,
            data.name || "Untitled",
            data.description || null,
            data.thumbnail_url || null,
            data.video_url,
            data.template_settings || "{}",
            data.assets || "[]",
            data.tracks || "[]",
            data.parent_template_id || null,
            data.original_creator_id || null,
          ]
        );

        const row = result.rows[0];
        console.log(`✅ [Feed] Published template ID=${row.id} by ${data.creator_name}`);

        // Post to Telegram if requested
        if (data.post_to_telegram) {
          try {
            const bridgeUrl = SERVICE_ENDPOINTS.bridge;
            await fetch(`${bridgeUrl}/api/post-to-channel`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                video_url: data.video_url,
                caption: data.telegram_caption || `🎬 ${data.name}\n👤 ${data.creator_name}\n🔗 ${SERVICE_ENDPOINTS.player}/feed\n\n#vibee #reels #ai`,
                template_id: row.id,
              }),
            });
          } catch (e) {
            console.warn("[Feed] Telegram post failed:", e);
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          id: row.id,
          template: {
            id: row.id,
            telegram_id: data.telegram_id,
            creator_name: data.creator_name,
            creator_avatar: data.creator_avatar,
            creator_username: creatorUsername,
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
        }));
      } catch (error) {
        console.error("[Feed] Publish error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to publish template" }));
      }
    });
    return;
  }

  // GET /api/feed - Get public templates feed
  if (req.url?.startsWith("/api/feed") && req.method === "GET") {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    if (req.url?.match(/\/api\/feed\/\d+/)) {
      // GET /api/feed/:id - Get single template
      const id = req.url?.split("/").pop();
      const userId = url.searchParams.get("user_id");
      try {
        // getPool() внутри try: снаружи его синхронный throw при незаданном
        // DATABASE_URL уходил из async-обработчика и убивал процесс.
        const pool = await getPool();
        const query = `
          SELECT pt.id, pt.telegram_id, pt.creator_name, pt.creator_avatar,
          COALESCE(pt.creator_username, '') as creator_username, pt.name, pt.description,
          pt.thumbnail_url, pt.video_url, pt.template_settings::text, pt.assets::text,
          pt.tracks::text, pt.likes_count, pt.views_count, pt.uses_count,
          CASE WHEN tl.telegram_id IS NOT NULL THEN TRUE ELSE FALSE END as is_liked,
          pt.is_featured, pt.created_at::text, pt.parent_template_id, pt.original_creator_id
          FROM public_templates pt
          LEFT JOIN template_likes tl ON pt.id = tl.template_id AND tl.telegram_id = $2 AND tl.action = 'like'
          WHERE pt.id = $1 AND pt.is_public = TRUE AND pt.deleted_at IS NULL
        `;
        const result = await pool.query(query, [id, userId]);
        if (result.rows.length === 0) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Template not found" }));
          return;
        }
        const row = result.rows[0];
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          id: row.id, telegramId: row.telegram_id, creatorName: row.creator_name,
          creatorAvatar: row.creator_avatar, creatorUsername: row.creator_username,
          name: row.name, description: row.description, thumbnailUrl: row.thumbnail_url,
          videoUrl: row.video_url, templateSettings: row.template_settings,
          assets: row.assets, tracks: row.tracks, likesCount: row.likes_count || 0,
          viewsCount: row.views_count || 0, usesCount: row.uses_count || 0,
          isLiked: row.is_liked || false, isFeatured: row.is_featured || false,
          createdAt: row.created_at, parentTemplateId: row.parent_template_id,
          originalCreatorId: row.original_creator_id
        }));
      } catch (error) {
        console.error("Template error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to fetch template" }));
      }
      return;
    } else {
      // GET /api/feed - Get feed list
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const offset = parseInt(url.searchParams.get("offset") || "0");
      const userId = url.searchParams.get("user_id");
      const search = url.searchParams.get("search") || "";
      // Значение search раньше вклеивалось в SQL строкой:
      //   AND (pt.name ILIKE '%${search}%' ...)
      // тогда как limit/offset/userId в том же запросе биндились как $1/$2/$3.
      // Это была SQL-инъекция без аутентификации. Теперь search — тоже
      // параметр ($4), а % экранируются, чтобы пользовательский ввод не менял
      // семантику LIKE-шаблона.
      const searchFilter = search
        ? "AND (pt.name ILIKE $4 OR pt.description ILIKE $4)"
        : "";
      const searchPattern = search
        ? `%${search.replace(/([\\%_])/g, "\\$1")}%`
        : null;

      // Только фиксированные варианты: ORDER BY нельзя параметризовать, поэтому
      // подстановка допустима лишь из закрытого списка, что здесь и сделано.
      const orderBy = url.searchParams.get("sort") === "likes" ? "pt.likes_count DESC" : "pt.created_at DESC";

      try {
        // getPool() внутри try, а не перед ним. Он бросает синхронно, если
        // DATABASE_URL не задан, и снаружи try это исключение уходило из
        // async-обработчика как unhandled rejection — Node 20 в ответ убивает
        // процесс. Проверено в проде: два падения 18.08 в 15:09:16 и 15:09:19,
        // стек `at getPool (render-server.ts:84:13)`, клиент получил три 502.
        // То есть любой мог положить сервер одним GET /api/feed без авторизации.
        const pool = await getPool();
        const query = `
          SELECT pt.id, pt.telegram_id, pt.creator_name, pt.creator_avatar,
          COALESCE(pt.creator_username, '') as creator_username, pt.name, pt.description,
          pt.thumbnail_url, pt.video_url, pt.template_settings::text, pt.assets::text,
          pt.tracks::text, pt.likes_count, pt.views_count, pt.uses_count,
          CASE WHEN tl.telegram_id IS NOT NULL THEN TRUE ELSE FALSE END as is_liked,
          pt.is_featured, pt.created_at::text, pt.parent_template_id, pt.original_creator_id
          FROM public_templates pt
          LEFT JOIN template_likes tl ON pt.id = tl.template_id AND tl.telegram_id = $3 AND tl.action = 'like'
          WHERE pt.is_public = TRUE AND pt.deleted_at IS NULL ${searchFilter}
          ORDER BY ${orderBy} LIMIT $1 OFFSET $2
        `;
        const params: unknown[] = [limit, offset, userId];
        if (searchPattern !== null) params.push(searchPattern);
        const result = await pool.query(query, params);
        const templates = result.rows.map(row => ({
          id: row.id, telegramId: row.telegram_id, creatorName: row.creator_name,
          creatorAvatar: row.creator_avatar, creatorUsername: row.creator_username,
          name: row.name, description: row.description, thumbnailUrl: row.thumbnail_url,
          videoUrl: row.video_url, templateSettings: row.template_settings,
          assets: row.assets, tracks: row.tracks, likesCount: row.likes_count || 0,
          viewsCount: row.views_count || 0, usesCount: row.uses_count || 0,
          isLiked: row.is_liked || false, isFeatured: row.is_featured || false,
          createdAt: row.created_at, parentTemplateId: row.parent_template_id,
          originalCreatorId: row.original_creator_id
        }));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ templates }));
      } catch (error) {
        console.error("Feed error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to fetch feed" }));
      }
      return;
    }
  }

  // GET /api/assets/:telegram_id — история генераций пользователя.
  //
  // СВЯЗАННОСТЬ АССЕТОВ. Бот пишет каждую генерацию в таблицу `assets` из 21
  // места, но до сих пор её никто не читал: `select` по этой таблице нет ни в
  // редакторе, ни здесь — все три ссылки на неё были `.insert()`. То есть
  // пользователь генерировал в боте и не видел результат в мини-аппе, потому
  // что связи между ними просто не существовало. Это её недостающая половина.
  if (req.url?.startsWith("/api/assets/") && req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const telegram_id = url.pathname.split("/").pop();
    if (!telegram_id) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid telegram_id" }));
      return;
    }
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 200);
    const kind = url.searchParams.get("type"); // необязательный фильтр по модели

    try {
      const pool = await getPool();
      // telegram_id в этой таблице text — см. миграцию. Приводим явно, иначе
      // числовой параметр не сматчится и вернётся пустой список без ошибки.
      const params: unknown[] = [String(telegram_id), limit];
      let typeFilter = "";
      if (kind) {
        typeFilter = "AND type = $3";
        params.push(kind);
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
      );
      res.writeHead(200, { "Content-Type": "application/json" });
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
      );
    } catch (error) {
      console.error("Assets error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to fetch assets" }));
    }
    return;
  }

  // GET /api/users/id/:telegram_id
  if (req.url?.startsWith("/api/users/id/") && req.method === "GET") {
    const telegram_id = req.url?.split("/").pop();
    if (!telegram_id) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid telegram_id" }));
      return;
    }
    try {
      // getPool() внутри try: снаружи его синхронный throw при незаданном
      // DATABASE_URL уходил из async-обработчика и убивал процесс.
      const pool = await getPool();
      const query = `
        SELECT DISTINCT pt.telegram_id, pt.creator_name as first_name,
        pt.creator_avatar as avatar_url, pt.creator_username as username
        FROM public_templates pt WHERE pt.telegram_id = $1 LIMIT 1
      `;
      const result = await pool.query(query, [telegram_id]);
      if (result.rows.length === 0) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: null, telegramId: parseInt(telegram_id), username: null, firstName: null, lastName: "", avatarUrl: null }));
        return;
      }
      const row = result.rows[0];
      let avatarUrl = row.avatar_url;
      if (avatarUrl && avatarUrl.includes("t.me/")) {
        avatarUrl = `https://vibee-render-server.fly.dev/proxy/image?url=${encodeURIComponent(avatarUrl)}`;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: row.telegram_id, telegramId: row.telegram_id, username: row.username, firstName: row.first_name, lastName: "", avatarUrl }));
    } catch (error) {
      console.error("User error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to fetch user" }));
    }
    return;
  }

  // GET /api/users/:username - Get user profile by username
  if (req.url?.startsWith("/api/users/") && req.method === "GET" && !req.url?.includes("/id/")) {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const usernameIndex = pathParts.indexOf("api") + 2; // /api/users/:username
    const username = pathParts[usernameIndex];
    const viewerTelegramId = url.searchParams.get("user_id");

    if (!username) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Username is required" }));
      return;
    }

    try {
      // getPool() внутри try: снаружи его синхронный throw при незаданном
      // DATABASE_URL уходил из async-обработчика и убивал процесс.
      const pool = await getPool();
      // Try profiles table first, fallback to public_templates
      let profile = null;

      // Attempt 1: profiles table (may not exist)
      try {
        const profileQuery = `
          SELECT p.id, p.telegram_id, p.username, p.display_name, p.bio,
            p.avatar_url, p.cover_url, p.social_links, p.is_public, p.is_verified, p.created_at::text
          FROM profiles p
          WHERE LOWER(p.username) = LOWER($1)
          LIMIT 1
        `;
        const profileResult = await pool.query(profileQuery, [username]);
        if (profileResult.rows.length > 0) {
          const row = profileResult.rows[0];
          let socialLinks: unknown[] = [];
          if (row.social_links) {
            try { socialLinks = JSON.parse(row.social_links); } catch (_e) { socialLinks = []; }
          }
          let avatarUrl = row.avatar_url;
          if (avatarUrl && avatarUrl.includes("t.me/")) {
            avatarUrl = `https://vibee-render-server.fly.dev/proxy/image?url=${encodeURIComponent(avatarUrl)}`;
          }
          profile = {
            id: String(row.id), telegram_id: String(row.telegram_id), username: row.username,
            display_name: row.display_name, bio: row.bio, avatar_url: avatarUrl,
            cover_url: row.cover_url, social_links: socialLinks,
            is_public: row.is_public !== false, is_verified: row.is_verified || false,
            created_at: row.created_at,
          };
        }
      } catch (_e) {
        // profiles table doesn't exist, continue to fallback
        console.log("[Profile] profiles table not available, using public_templates fallback");
      }

      // Attempt 2: Build profile from public_templates
      if (!profile) {
        const fallbackQuery = `
          SELECT DISTINCT ON (pt.telegram_id)
            pt.telegram_id, pt.creator_name, pt.creator_avatar,
            COALESCE(pt.creator_username, '') as creator_username,
            MIN(pt.created_at)::text as created_at
          FROM public_templates pt
          WHERE LOWER(pt.creator_username) = LOWER($1)
          GROUP BY pt.telegram_id, pt.creator_name, pt.creator_avatar, pt.creator_username
          LIMIT 1
        `;
        const fallbackResult = await pool.query(fallbackQuery, [username]);
        if (fallbackResult.rows.length > 0) {
          const row = fallbackResult.rows[0];
          let avatarUrl = row.creator_avatar;
          if (avatarUrl && avatarUrl.includes("t.me/")) {
            avatarUrl = `https://vibee-render-server.fly.dev/proxy/image?url=${encodeURIComponent(avatarUrl)}`;
          }
          profile = {
            id: String(row.telegram_id), telegram_id: String(row.telegram_id),
            username: row.creator_username || username,
            display_name: row.creator_name, bio: null, avatar_url: avatarUrl,
            cover_url: null, social_links: [],
            is_public: true, is_verified: false,
            created_at: row.created_at,
          };
        }
      }

      if (!profile) {
        // Attempt 3: Check users table
        try {
          const usersQuery = `SELECT telegram_id, username FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1`;
          const usersResult = await pool.query(usersQuery, [username]);
          if (usersResult.rows.length > 0) {
            const row = usersResult.rows[0];
            profile = {
              id: String(row.telegram_id), telegram_id: String(row.telegram_id),
              username: row.username, display_name: row.username,
              bio: null, avatar_url: null, cover_url: null, social_links: [],
              is_public: true, is_verified: false, created_at: new Date().toISOString(),
            };
          }
        } catch (_e) {
          // users table doesn't exist either
        }
      }

      // Attempt 4: If user_id (telegram_id) provided, build profile from public_templates by telegram_id
      if (!profile && viewerTelegramId) {
        try {
          const tidQuery = `
            SELECT DISTINCT ON (pt.telegram_id)
              pt.telegram_id, pt.creator_name, pt.creator_avatar,
              COALESCE(pt.creator_username, '') as creator_username,
              MIN(pt.created_at)::text as created_at
            FROM public_templates pt
            WHERE pt.telegram_id = $1
            GROUP BY pt.telegram_id, pt.creator_name, pt.creator_avatar, pt.creator_username
            LIMIT 1
          `;
          const tidResult = await pool.query(tidQuery, [viewerTelegramId]);
          if (tidResult.rows.length > 0) {
            const row = tidResult.rows[0];
            let avatarUrl = row.creator_avatar;
            if (avatarUrl && avatarUrl.includes("t.me/")) {
              avatarUrl = `https://vibee-render-server.fly.dev/proxy/image?url=${encodeURIComponent(avatarUrl)}`;
            }
            profile = {
              id: String(row.telegram_id), telegram_id: String(row.telegram_id),
              username: row.creator_username || username,
              display_name: row.creator_name || username, bio: null, avatar_url: avatarUrl,
              cover_url: null, social_links: [],
              is_public: true, is_verified: false,
              created_at: row.created_at,
            };
            console.log(`[Profile] Found profile by telegram_id=${viewerTelegramId} for username=${username}`);
          }
        } catch (_e) {
          console.log("[Profile] Attempt 4 (telegram_id lookup) failed:", _e);
        }
      }

      // Attempt 5: If user_id provided but no templates exist, create minimal profile
      if (!profile && viewerTelegramId) {
        profile = {
          id: String(viewerTelegramId), telegram_id: String(viewerTelegramId),
          username: username, display_name: username,
          bio: null, avatar_url: null, cover_url: null, social_links: [],
          is_public: true, is_verified: false,
          created_at: new Date().toISOString(),
        };
        console.log(`[Profile] Created minimal profile for telegram_id=${viewerTelegramId}, username=${username}`);
      }

      if (!profile) {
        res.writeHead(404, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ error: "User not found" }));
        return;
      }

      // Get stats from public_templates
      const telegramId = profile.telegram_id;
      let templatesCount = 0, totalViews = 0, totalLikes = 0;
      try {
        const statsQuery = `
          SELECT COUNT(*) as templates_count,
            COALESCE(SUM(views_count), 0) as total_views,
            COALESCE(SUM(likes_count), 0) as total_likes
          FROM public_templates
          WHERE telegram_id = $1 AND is_public = TRUE AND deleted_at IS NULL
        `;
        const statsResult = await pool.query(statsQuery, [telegramId]);
        if (statsResult.rows.length > 0) {
          templatesCount = parseInt(statsResult.rows[0].templates_count) || 0;
          totalViews = parseInt(statsResult.rows[0].total_views) || 0;
          totalLikes = parseInt(statsResult.rows[0].total_likes) || 0;
        }
      } catch (_e) { /* stats not critical */ }

      const isOwnProfile = viewerTelegramId ? String(viewerTelegramId) === String(telegramId) : false;

      const fullProfile = {
        ...profile,
        followers_count: 0,
        following_count: 0,
        templates_count: templatesCount,
        total_views: totalViews,
        total_likes: totalLikes,
        is_following: false,
        is_own_profile: isOwnProfile,
      };

      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(fullProfile));
    } catch (error) {
      console.error("Profile error:", error);
      res.writeHead(500, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ error: "Failed to fetch profile" }));
    }
    return;
  }

  // GET /api/render-quota
  if (req.url?.startsWith("/api/render-quota") && req.method === "GET") {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const telegram_id = url.searchParams.get("telegram_id");
    if (!telegram_id) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "telegram_id required" }));
      return;
    }

    // Check if user is admin (owner)
    const isAdmin = telegram_id === TELEGRAM_OWNER_ID;

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      telegram_id: parseInt(telegram_id),
      quota_used: 0,
      quota_limit: isAdmin ? 999999 : 1000,  // Unlimited for admin
      quota_remaining: isAdmin ? 999999 : 1000,
      reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      is_admin: isAdmin  // IMPORTANT: Frontend needs this!
    }));
    return;
  }

  // POST /api/ai/generate-script
  if (req.url === "/api/ai/generate-script" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => {
      try {
        const { topic, niche, style, duration, language } = JSON.parse(body);
        if (!topic || topic.trim() === "") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "topic is required" }));
          return;
        }
        const XAI_API_KEY = process.env.XAI_API_KEY;
        if (!XAI_API_KEY) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "xAI API key not configured" }));
          return;
        }
        const lang = language || "English";
        const dur = duration || "30 seconds";
        const styl = style || "engaging and informative";
        const nich = niche ? ` in the ${niche} niche` : "";
        const systemPrompt = `You are a professional video script writer. Generate scripts for short-form videos.
Return ONLY valid JSON in this exact format:
{
  "voiceover": "spoken text for narration",
  "cover_prompt": "detailed image generation prompt for the thumbnail/cover",
  "broll_prompts": ["prompt1", "prompt2", "prompt3"],
  "captions": ["caption1", "caption2"]
}`;
        const userPrompt = `Create a ${dur} ${styl} video script about: ${topic}${nich}
Language: ${lang}

The script should be:
- Concise and engaging
- Suitable for short-form video (TikTok, Reels, YouTube Shorts)
- Include visual descriptions for b-roll
- Include catchy captions for text overlays

Return ONLY the JSON, no additional text.`;
        const XAI_TIMEOUT_MS = parseInt(process.env.API_TIMEOUT_MS || "60000", 10);
        const MAX_RETRIES = 3;
        let response: Response | null = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            response = await fetch("https://api.x.ai/v1/chat/completions", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${XAI_API_KEY}` },
              body: JSON.stringify({
                model: "grok-beta",
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
                temperature: 0.7, max_tokens: 2000
              }),
              signal: AbortSignal.timeout(XAI_TIMEOUT_MS),
            });

            if (response.status === 429) {
              const retryAfter = response.headers.get("retry-after");
              const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.min(1000 * Math.pow(2, attempt + 1), 30000);
              console.warn(`⚠️ xAI rate limited (429), attempt ${attempt + 1}/${MAX_RETRIES + 1}, waiting ${delay}ms...`);
              if (attempt < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
              }
            }

            if (response.ok) break;
          } catch (fetchError: unknown) {
            const errMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
            if (errMsg.includes("abort") || errMsg.includes("timeout")) {
              console.error(`⚠️ xAI request timed out after ${XAI_TIMEOUT_MS}ms, attempt ${attempt + 1}/${MAX_RETRIES + 1}`);
            } else {
              console.error(`⚠️ xAI fetch error, attempt ${attempt + 1}/${MAX_RETRIES + 1}:`, fetchError);
            }
            if (attempt < MAX_RETRIES) {
              const delay = Math.min(1000 * Math.pow(2, attempt + 1), 30000);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
            res.writeHead(502, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: `xAI API unreachable: ${errMsg}` }));
            return;
          }
        }

        if (!response || !response.ok) {
          const errorText = response ? await response.text() : "No response after retries";
          console.error("xAI API error:", errorText);
          const statusCode = response?.status === 429 ? 429 : 500;
          res.writeHead(statusCode, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: statusCode === 429 ? "Rate limit exceeded, please try again later" : "Failed to generate script" }));
          return;
        }
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "No response from AI" }));
          return;
        }
        let jsonContent = content.trim();
        if (jsonContent.startsWith("```json")) jsonContent = jsonContent.slice(7);
        else if (jsonContent.startsWith("```")) jsonContent = jsonContent.slice(3);
        if (jsonContent.endsWith("```")) jsonContent = jsonContent.slice(0, -3);
        jsonContent = jsonContent.trim();
        let scriptData;
        try {
          scriptData = JSON.parse(jsonContent);
        } catch {
          const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            scriptData = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error("Failed to parse JSON");
          }
        }
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({
          success: true, voiceover: scriptData.voiceover || "", cover_prompt: scriptData.cover_prompt || "",
          broll_prompts: scriptData.broll_prompts || [], captions: scriptData.captions || []
        }));
      } catch (error) {
        console.error("Script generation error:", error);
        const errorMsg = error instanceof Error ? error.message : "Internal server error";
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: errorMsg }));
      }
    });
    return;
  }

  // GET /proxy/image - Proxy for Telegram images (CORS workaround)
  if (req.url?.startsWith("/proxy/image") && req.method === "GET") {
    const url = new URL(req.url || "", `http://${req.headers.host}`).searchParams.get("url");
    if (!url) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Missing url parameter");
      return;
    }
    try {
      const proxyRes = await fetch(url);
      const data = await proxyRes.arrayBuffer();
      res.writeHead(proxyRes.status || 200, {
        "Content-Type": proxyRes.headers.get("content-type") || "image/jpeg",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400"
      });
      res.end(Buffer.from(data));
    } catch (error) {
      console.error("Proxy error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to fetch image" }));
    }
    return;
  }

  // 404 for everything else
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

// ===============================
// WebSocket Server for Real-Time Sync
// ===============================

const wss = new WebSocketServer({ server });
const wsClients = new Set<WebSocket>();

interface WSMessage {
  type: string;
  payload?: unknown;
  clientId?: string;
}

wss.on("connection", (ws: WebSocket) => {
  const clientId = randomUUID();
  wsClients.add(ws);
  console.log(`[WS] Client connected: ${clientId} (total: ${wsClients.size})`);

  // Send welcome message with client ID
  ws.send(JSON.stringify({ type: "connected", payload: { clientId } }));

  ws.on("message", (data: Buffer) => {
    try {
      const msg: WSMessage = JSON.parse(data.toString());
      msg.clientId = clientId;

      console.log(`[WS] Message from ${clientId}: ${msg.type}`);

      // Broadcast to all OTHER clients (exclude sender)
      broadcastWS(msg, ws);
    } catch (error) {
      console.error("[WS] Failed to parse message:", error);
    }
  });

  ws.on("close", () => {
    wsClients.delete(ws);
    console.log(`[WS] Client disconnected: ${clientId} (total: ${wsClients.size})`);
  });

  ws.on("error", (error) => {
    console.error(`[WS] Client error: ${clientId}`, error);
    wsClients.delete(ws);
  });
});

function broadcastWS(message: WSMessage, exclude?: WebSocket) {
  const data = JSON.stringify(message);
  let sent = 0;

  wsClients.forEach((client) => {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(data);
      sent++;
    }
  });

  if (sent > 0) {
    console.log(`[WS] Broadcast ${message.type} to ${sent} clients`);
  }
}

// Export broadcast for use in handlers
export { broadcastWS };

// Start server
async function main() {
  await initBundle();

  server.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`🚀 Remotion render server running on 0.0.0.0:${PORT}`);
    console.log(
      `🔒 Auth: mode=${authMode()} apiKey=${process.env.RENDER_API_KEY ? "set" : "MISSING"} ` +
      `botToken=${process.env.TELEGRAM_BOT_TOKEN ? "set" : "MISSING"}`
    );
    console.log(`📍 HTTP Endpoints:`);
    console.log(`   GET  /health       - Health check`);
    console.log(`   GET  /compositions - List compositions`);
    console.log(`   POST /render       - Render video/still`);
    console.log(`   POST /render/template - Universal template API (S3 + webhook)`);
    console.log(`   GET  /renders/:id  - Download rendered file`);
    console.log(`   POST /upload       - Upload asset to S3`);
    console.log(`   GET  /assets       - List S3 assets`);
    console.log(`   POST /transcribe   - Transcribe audio to captions (RU/EN)`);
    console.log(`🔌 WebSocket: ws://0.0.0.0:${PORT} (real-time sync)`);
    console.log(`📦 S3 Bucket: ${S3_BUCKET}`);
  });
}

main().catch(console.error);
