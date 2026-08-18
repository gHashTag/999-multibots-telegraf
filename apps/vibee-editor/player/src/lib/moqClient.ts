/**
 * MoQ Client - Media over QUIC (Future Implementation)
 *
 * Research (2025):
 * - MoQ achieves <300ms end-to-end latency
 * - WINK MoQ: 200-300ms production latency
 * - Facebook experimental: <60ms under perfect conditions
 *
 * Current Status:
 * - Chrome/Firefox: WebTransport supported
 * - Safari: NOT SUPPORTED (no WebTransport)
 *
 * Strategy:
 * - Use MoQ when WebTransport available
 * - Fallback to LL-HLS for Safari
 *
 * @see https://www.nanocosmos.net/blog/media-over-quic-moq/
 * @see https://arxiv.org/abs/2505.21769
 */

interface MoQClientConfig {
  url: string;
  authToken?: string;
  timeout?: number;
}

interface MoQStream {
  id: string;
  readable: ReadableStream<Uint8Array>;
  close: () => void;
}

type TransportState = 'connecting' | 'connected' | 'closed' | 'failed';

/**
 * Check if WebTransport is supported
 */
export function isWebTransportSupported(): boolean {
  return 'WebTransport' in window;
}

/**
 * Check if MoQ can be used (WebTransport + not Safari)
 */
export function isMoQSupported(): boolean {
  if (!isWebTransportSupported()) {
    return false;
  }

  // Check if Safari (Safari doesn't support WebTransport as of 2025)
  const ua = navigator.userAgent.toLowerCase();
  const isSafari = ua.includes('safari') && !ua.includes('chrome');

  if (isSafari) {
    console.log('[MoQ] Safari detected, WebTransport not supported');
    return false;
  }

  return true;
}

/**
 * MoQ Client (Placeholder Implementation)
 *
 * This is a placeholder for future MoQ protocol support.
 * Full implementation will require:
 * 1. WebTransport connection management
 * 2. MoQ protocol framing
 * 3. Media segment handling
 * 4. ABR adaptation
 */
class MoQClient {
  private config: MoQClientConfig;
  private transport: any | null = null; // WebTransport when available
  private state: TransportState = 'closed';
  private streams: Map<string, MoQStream> = new Map();

  constructor(config: MoQClientConfig) {
    this.config = config;
  }

  /**
   * Connect to MoQ server
   */
  async connect(): Promise<boolean> {
    if (!isMoQSupported()) {
      console.log('[MoQ] WebTransport not supported, cannot connect');
      return false;
    }

    try {
      this.state = 'connecting';

      // @ts-expect-error WebTransport types may not be available
      this.transport = new WebTransport(this.config.url);

      await this.transport.ready;
      this.state = 'connected';

      console.log('[MoQ] Connected to', this.config.url);

      // Handle connection close
      this.transport.closed.then(() => {
        this.state = 'closed';
        console.log('[MoQ] Connection closed');
      }).catch((err: Error) => {
        this.state = 'failed';
        console.error('[MoQ] Connection failed:', err);
      });

      return true;
    } catch (error) {
      this.state = 'failed';
      console.error('[MoQ] Failed to connect:', error);
      return false;
    }
  }

  /**
   * Subscribe to a media track
   */
  async subscribe(trackId: string): Promise<MoQStream | null> {
    if (this.state !== 'connected' || !this.transport) {
      console.log('[MoQ] Not connected, cannot subscribe');
      return null;
    }

    try {
      // Create unidirectional stream for receiving media
      const stream = await this.transport.createUnidirectionalStream();

      // Send subscribe request (MoQ protocol)
      const writer = stream.writable.getWriter();
      const subscribeMsg = this.encodeSubscribeMessage(trackId);
      await writer.write(subscribeMsg);
      writer.releaseLock();

      // Create stream wrapper
      const moqStream: MoQStream = {
        id: trackId,
        readable: stream.readable,
        close: () => stream.close(),
      };

      this.streams.set(trackId, moqStream);

      console.log('[MoQ] Subscribed to track:', trackId);
      return moqStream;
    } catch (error) {
      console.error('[MoQ] Subscribe failed:', error);
      return null;
    }
  }

  /**
   * Unsubscribe from a media track
   */
  unsubscribe(trackId: string): void {
    const stream = this.streams.get(trackId);
    if (stream) {
      stream.close();
      this.streams.delete(trackId);
      console.log('[MoQ] Unsubscribed from track:', trackId);
    }
  }

  /**
   * Close connection
   */
  close(): void {
    // Close all streams
    for (const stream of this.streams.values()) {
      stream.close();
    }
    this.streams.clear();

    // Close transport
    if (this.transport) {
      this.transport.close();
      this.transport = null;
    }

    this.state = 'closed';
  }

  /**
   * Get connection state
   */
  getState(): TransportState {
    return this.state;
  }

  /**
   * Encode MoQ subscribe message (placeholder)
   */
  private encodeSubscribeMessage(trackId: string): Uint8Array {
    // MoQ protocol encoding (simplified placeholder)
    // Real implementation would follow MoQ draft spec
    const encoder = new TextEncoder();
    return encoder.encode(JSON.stringify({
      type: 'subscribe',
      trackId,
    }));
  }
}

/**
 * Create video stream with automatic fallback
 *
 * Strategy:
 * 1. Try MoQ first (fastest, <300ms latency)
 * 2. Fallback to LL-HLS (Safari, legacy browsers)
 */
export async function createVideoStream(url: string): Promise<{
  type: 'moq' | 'll-hls' | 'hls';
  url: string;
  client?: MoQClient;
}> {
  // Try MoQ first
  if (isMoQSupported()) {
    const moqUrl = url.replace(/\.(mp4|m3u8)$/, '.moq');
    const client = new MoQClient({ url: moqUrl });

    const connected = await client.connect();
    if (connected) {
      console.log('[Stream] Using MoQ transport (<300ms latency)');
      return { type: 'moq', url: moqUrl, client };
    }
  }

  // Fallback to LL-HLS
  const llHlsUrl = url.replace('.mp4', '.m3u8');

  // Check if LL-HLS available
  try {
    const response = await fetch(llHlsUrl, { method: 'HEAD' });
    if (response.ok) {
      console.log('[Stream] Using LL-HLS transport');
      return { type: 'll-hls', url: llHlsUrl };
    }
  } catch {
    // LL-HLS not available
  }

  // Final fallback: regular HLS or direct MP4
  console.log('[Stream] Using standard HLS/MP4');
  return { type: 'hls', url };
}

/**
 * Get transport info for debugging
 */
export function getTransportInfo(): {
  webTransportSupported: boolean;
  moqSupported: boolean;
  recommendedTransport: 'moq' | 'll-hls' | 'hls';
} {
  const webTransportSupported = isWebTransportSupported();
  const moqSupported = isMoQSupported();

  return {
    webTransportSupported,
    moqSupported,
    recommendedTransport: moqSupported ? 'moq' : 'll-hls',
  };
}

export { MoQClient };
export default createVideoStream;
