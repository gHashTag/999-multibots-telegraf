/**
 * Поиск лица в кадре — один запрос к рендер-серверу.
 *
 * ПОЧЕМУ ОТДЕЛЬНЫЙ ФАЙЛ. Функция жила в `lib/agentApi.ts` — модуле на 444
 * строки про чат с агентом. Из всего модуля живой была только она:
 * `PropertiesPanel` звал `analyzeFace`, а остальное держалось на `ChatPanel`,
 * который не импортировался ничем, кроме собственного бочонка. Удалить чат
 * было нельзя, не вынув отсюда эту функцию.
 */

import { RENDER_URL as RENDER_SERVER_URL } from '../config';

export interface FaceAnalysisResult {
  success: boolean;
  faceDetected: boolean;
  faceBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
    confidence: number;
  };
  cropSettings?: {
    offsetX: number;
    offsetY: number;
    scale: number;
  };
  message?: string;
  error?: string;
}

/** Ищет лицо и возвращает параметры кадрирования под вертикаль. */
export async function analyzeFace(videoUrl: string): Promise<FaceAnalysisResult> {
  const response = await fetch(`${RENDER_SERVER_URL}/analyze-face`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl, shape: 'portrait' }),
  });

  if (!response.ok) {
    /**
     * Код и тело, а НЕ statusText: Railway отдаёт только HTTP/2, где
     * statusText пуст по спецификации. Прошлый текст ошибки был буквально
     * «Face analysis failed: » — сообщение без единого факта.
     */
    const body = await response.text().catch(() => '');
    throw new Error(
      `Поиск лица не удался: HTTP ${response.status}${body ? ` — ${body.slice(0, 200)}` : ''}`
    );
  }

  return response.json();
}
