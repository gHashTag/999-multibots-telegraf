/**
 * Transcription Library using whisper.cpp CLI
 *
 * Provides audio transcription using Whisper.cpp directly
 * Supports Russian and other languages
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

// S3 client for downloading videos
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'auto',
  endpoint: process.env.AWS_ENDPOINT_URL_S3 || 'https://fly.storage.tigris.dev',
  credentials: process.env.AWS_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      }
    : undefined,
});

const S3_BUCKET = process.env.BUCKET_NAME || process.env.S3_BUCKET || 'vibee-assets';

// Type definitions
export interface Caption {
  text: string;
  startMs: number;
  endMs: number;
  timestampMs: number;
  confidence: number;
}

export interface Segment {
  type: 'split' | 'fullscreen';
  startFrame: number;
  durationFrames: number;
  caption: string;
  bRollUrl?: string;
  bRollType?: 'video' | 'image';
}

export interface TranscriptionResult {
  captions: Caption[];
  segments: Segment[];
}

interface WhisperToken {
  timestamps: { from: string; to: string };
  offsets: { from: number; to: number };
  text: string;
}

/**
 * Download file from URL to local path
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  console.log(`Downloading: ${url} -> ${destPath}`);

  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);

    protocol
      .get(url, (response) => {
        console.log(`Download response: ${response.statusCode} ${response.statusMessage}`);

        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            console.log(`Redirecting to: ${redirectUrl}`);
            file.close();
            fs.unlinkSync(destPath);
            return downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
          }
        }

        // Check for errors
        if (response.statusCode !== 200) {
          file.close();
          fs.unlink(destPath, () => {});
          reject(new Error(`Download failed: HTTP ${response.statusCode} ${response.statusMessage}`));
          return;
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          const stats = fs.statSync(destPath);
          console.log(`Downloaded ${stats.size} bytes to ${destPath}`);
          resolve();
        });
      })
      .on('error', (err) => {
        console.error(`Download error: ${err.message}`);
        fs.unlink(destPath, () => {});
        reject(err);
      });
  });
}

/**
 * Extract audio from video as 16KHz WAV
 */
function extractAudio(videoPath: string): string {
  const audioPath = `/tmp/whisper_audio_${Date.now()}.wav`;

  console.log(`Extracting audio from video: ${videoPath}`);

  // Check if video file exists and has size
  const stats = fs.statSync(videoPath);
  console.log(`Video file size: ${stats.size} bytes`);

  if (stats.size === 0) {
    throw new Error(`Video file is empty: ${videoPath}`);
  }

  try {
    execSync(
      `ffmpeg -i "${videoPath}" -ar 16000 -ac 1 -y "${audioPath}"`,
      { stdio: 'pipe', timeout: 120000 }
    );
  } catch (err: unknown) {
    const error = err as { stderr?: Buffer; message?: string };
    const stderr = error.stderr?.toString() || error.message || 'Unknown error';
    console.error('FFmpeg error:', stderr);
    throw new Error(`FFmpeg failed: ${stderr}`);
  }

  return audioPath;
}

/**
 * Parse whisper JSON output and combine tokens into words
 */
function parseWhisperOutput(jsonPath: string): Caption[] {
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const tokens: WhisperToken[] = data.transcription || [];

  const captions: Caption[] = [];
  let currentWord = '';
  let wordStart = 0;
  let wordEnd = 0;

  for (const token of tokens) {
    const text = token.text;

    // Skip empty tokens and punctuation-only
    if (!text || text.trim() === '' || /^[.,!?;:\-"'()]+$/.test(text.trim())) {
      if (currentWord.trim()) {
        captions.push({
          text: currentWord.trim(),
          startMs: wordStart,
          endMs: wordEnd,
          timestampMs: wordStart,
          confidence: 1,
        });
        currentWord = '';
      }
      continue;
    }

    // Check if this token starts with space (new word)
    if (text.startsWith(' ') && currentWord.trim()) {
      captions.push({
        text: currentWord.trim(),
        startMs: wordStart,
        endMs: wordEnd,
        timestampMs: wordStart,
        confidence: 1,
      });
      currentWord = text.trim();
      wordStart = token.offsets.from;
      wordEnd = token.offsets.to;
    } else {
      if (!currentWord) {
        wordStart = token.offsets.from;
      }
      currentWord += text;
      wordEnd = token.offsets.to;
    }
  }

  // Don't forget the last word
  if (currentWord.trim()) {
    captions.push({
      text: currentWord.trim(),
      startMs: wordStart,
      endMs: wordEnd,
      timestampMs: wordStart,
      confidence: 1,
    });
  }

  return captions;
}

/**
 * Convert captions to SplitTalkingHead segments
 */
function captionsToSegments(captions: Caption[], fps: number): Segment[] {
  const brollVideos = [
    '/backgrounds/business/00.mp4',
    '/backgrounds/business/01.mp4',
    '/backgrounds/business/02.mp4',
    '/backgrounds/business/03.mp4',
    '/backgrounds/business/04.mp4',
  ];

  return captions.map((caption, i) => {
    const type: 'split' | 'fullscreen' = i % 3 === 0 ? 'fullscreen' : 'split';

    const startFrame = Math.floor((caption.startMs / 1000) * fps);
    const endFrame = Math.floor((caption.endMs / 1000) * fps);
    const durationFrames = Math.max(endFrame - startFrame, fps);

    return {
      type,
      startFrame,
      durationFrames,
      caption: caption.text.toUpperCase(),
      bRollUrl: type === 'split' ? brollVideos[i % brollVideos.length] : undefined,
      bRollType: 'video' as const,
    };
  });
}

/**
 * Transcribe video to captions using Whisper.cpp CLI
 */
export async function transcribeVideo(
  videoPathOrUrl: string,
  language: string = 'ru',
  fps: number = 30
): Promise<TranscriptionResult> {
  const whisperDir = path.join(process.cwd(), 'whisper.cpp');

  // Select model based on language
  const modelPath = language === 'en'
    ? path.join(whisperDir, 'models/ggml-small.en.bin')
    : path.join(whisperDir, 'models/ggml-small.bin');

  // Check if Whisper and model exist
  if (!fs.existsSync(whisperDir)) {
    throw new Error('Whisper.cpp not installed. Run: git clone https://github.com/ggerganov/whisper.cpp');
  }

  if (!fs.existsSync(modelPath)) {
    throw new Error(`Model not found: ${modelPath}. Run: cd whisper.cpp && bash models/download-ggml-model.sh small`);
  }

  // Handle URLs - download to temp file
  let videoPath = videoPathOrUrl;
  let isTemp = false;

  // Handle /s3/ proxy URLs - download from S3
  if (videoPathOrUrl.startsWith('/s3/')) {
    const s3Key = videoPathOrUrl.slice(4); // Remove /s3/ prefix
    const ext = path.extname(s3Key) || '.mp4';
    videoPath = `/tmp/whisper_video_${Date.now()}${ext}`;
    isTemp = true;

    console.log(`Downloading from S3: ${s3Key}...`);
    try {
      const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
      });
      const response = await s3Client.send(command);
      const body = response.Body as Readable;

      await new Promise<void>((resolve, reject) => {
        const file = fs.createWriteStream(videoPath);
        body.pipe(file);
        file.on('finish', () => {
          file.close();
          const stats = fs.statSync(videoPath);
          console.log(`Downloaded ${stats.size} bytes from S3 to ${videoPath}`);
          resolve();
        });
        file.on('error', reject);
      });
    } catch (error) {
      console.error('S3 download error:', error);
      throw new Error(`Failed to download from S3: ${s3Key}`);
    }
  }
  // Handle HTTP/HTTPS URLs
  else if (videoPathOrUrl.startsWith('http://') || videoPathOrUrl.startsWith('https://')) {
    const ext = path.extname(new URL(videoPathOrUrl).pathname) || '.mp4';
    videoPath = `/tmp/whisper_video_${Date.now()}${ext}`;
    isTemp = true;

    console.log(`Downloading video from ${videoPathOrUrl}...`);
    await downloadFile(videoPathOrUrl, videoPath);
  }

  // Handle local paths in public directory
  if (videoPath.startsWith('/') && !videoPath.startsWith('/Users') && !videoPath.startsWith('/app') && !videoPath.startsWith('/tmp')) {
    videoPath = path.join(process.cwd(), 'public', videoPath);
  }

  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  let audioPath: string | null = null;
  const jsonOutput = `/tmp/whisper_output_${Date.now()}`;

  try {
    // Extract audio
    audioPath = extractAudio(videoPath);

    console.log(`Transcribing with language: ${language}...`);

    // Run whisper.cpp CLI (cmake builds to ./build/bin/whisper-cli)
    const whisperBin = fs.existsSync(path.join(whisperDir, 'build/bin/whisper-cli'))
      ? './build/bin/whisper-cli'
      : './main';

    console.log(`Using whisper binary: ${whisperBin}`);

    try {
      execSync(
        `cd "${whisperDir}" && ${whisperBin} -m "${modelPath}" -f "${audioPath}" -l ${language} -ml 3 -oj --output-file "${jsonOutput}"`,
        { stdio: 'pipe', timeout: 300000 }
      );
    } catch (err: unknown) {
      const error = err as { stderr?: Buffer; message?: string };
      const stderr = error.stderr?.toString() || error.message || 'Unknown error';
      console.error('Whisper error:', stderr);
      throw new Error(`Whisper failed: ${stderr}`);
    }

    // Parse output
    const captions = parseWhisperOutput(`${jsonOutput}.json`);
    const segments = captionsToSegments(captions, fps);

    console.log(`Found ${captions.length} captions`);

    return { captions, segments };
  } finally {
    // Cleanup temp files
    if (audioPath && fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }
    if (fs.existsSync(`${jsonOutput}.json`)) {
      fs.unlinkSync(`${jsonOutput}.json`);
    }
    if (isTemp && fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }
  }
}
