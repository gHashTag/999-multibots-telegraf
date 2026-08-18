/**
 * Super-Resolution - WebGL-based video upscaling
 *
 * Research (2025):
 * - ABUV paper: Joint bitrate + super-resolution for mobile
 * - Strategy: Load 360p video, upscale to 720p on GPU
 * - Saves 75% bandwidth with minimal quality loss for B-roll
 *
 * Uses simple bicubic/lanczos upscaling via WebGL
 * (Full neural SR would require TensorFlow.js which is heavy)
 *
 * @see https://www.sciencedirect.com/science/article/abs/pii/S1389128624008260
 */

// WebGL shaders for high-quality upscaling
const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;

  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

// Bicubic interpolation shader (better than bilinear)
const FRAGMENT_SHADER = `
  precision mediump float;

  uniform sampler2D u_image;
  uniform vec2 u_textureSize;
  varying vec2 v_texCoord;

  // Bicubic interpolation weight
  float cubic(float x) {
    float a = -0.5;
    float absX = abs(x);
    float absX2 = absX * absX;
    float absX3 = absX2 * absX;

    if (absX <= 1.0) {
      return (a + 2.0) * absX3 - (a + 3.0) * absX2 + 1.0;
    } else if (absX <= 2.0) {
      return a * absX3 - 5.0 * a * absX2 + 8.0 * a * absX - 4.0 * a;
    }
    return 0.0;
  }

  vec4 bicubicSample(vec2 coord) {
    vec2 texelSize = 1.0 / u_textureSize;
    vec2 texelCoord = coord * u_textureSize - 0.5;
    vec2 f = fract(texelCoord);
    texelCoord = floor(texelCoord);

    vec4 result = vec4(0.0);
    float weightSum = 0.0;

    for (int y = -1; y <= 2; y++) {
      for (int x = -1; x <= 2; x++) {
        vec2 offset = vec2(float(x), float(y));
        float weight = cubic(f.x - float(x)) * cubic(f.y - float(y));
        vec2 sampleCoord = (texelCoord + offset + 0.5) * texelSize;

        // Clamp to valid texture coordinates
        sampleCoord = clamp(sampleCoord, vec2(0.0), vec2(1.0));

        result += texture2D(u_image, sampleCoord) * weight;
        weightSum += weight;
      }
    }

    return result / weightSum;
  }

  void main() {
    gl_FragColor = bicubicSample(v_texCoord);
  }
`;

interface SuperResolutionConfig {
  inputWidth: number;
  inputHeight: number;
  outputWidth: number;
  outputHeight: number;
}

class SuperResolutionProcessor {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private framebuffer: WebGLFramebuffer | null = null;
  private outputTexture: WebGLTexture | null = null;
  private config: SuperResolutionConfig | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.initShaders();
  }

  private initShaders(): void {
    const gl = this.gl;

    // Compile vertex shader
    const vertexShader = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vertexShader, VERTEX_SHADER);
    gl.compileShader(vertexShader);

    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      console.error('[SR] Vertex shader error:', gl.getShaderInfoLog(vertexShader));
      return;
    }

    // Compile fragment shader
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fragmentShader, FRAGMENT_SHADER);
    gl.compileShader(fragmentShader);

    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      console.error('[SR] Fragment shader error:', gl.getShaderInfoLog(fragmentShader));
      return;
    }

    // Link program
    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error('[SR] Program link error:', gl.getProgramInfoLog(this.program));
      return;
    }

    // Setup geometry (full-screen quad)
    const positions = new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1,
    ]);
    const texCoords = new Float32Array([
      0, 1, 1, 1, 0, 0,
      0, 0, 1, 1, 1, 0,
    ]);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const positionLoc = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

    const texCoordLoc = gl.getAttribLocation(this.program, 'a_texCoord');
    gl.enableVertexAttribArray(texCoordLoc);
    gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0);

    // Create texture
    this.texture = gl.createTexture();
  }

  /**
   * Configure upscaling dimensions
   */
  configure(config: SuperResolutionConfig): void {
    this.config = config;

    const gl = this.gl;

    // Setup output framebuffer
    this.framebuffer = gl.createFramebuffer();
    this.outputTexture = gl.createTexture();

    gl.bindTexture(gl.TEXTURE_2D, this.outputTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      config.outputWidth,
      config.outputHeight,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.outputTexture,
      0
    );
  }

  /**
   * Upscale a video frame
   */
  upscale(source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap): ImageData | null {
    if (!this.program || !this.config) return null;

    const gl = this.gl;
    const { inputWidth, inputHeight, outputWidth, outputHeight } = this.config;

    // Upload source to texture
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Render to framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, outputWidth, outputHeight);

    gl.useProgram(this.program);

    // Set uniforms
    const textureSizeLoc = gl.getUniformLocation(this.program, 'u_textureSize');
    gl.uniform2f(textureSizeLoc, inputWidth, inputHeight);

    // Draw
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Read pixels
    const pixels = new Uint8Array(outputWidth * outputHeight * 4);
    gl.readPixels(0, 0, outputWidth, outputHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    return new ImageData(new Uint8ClampedArray(pixels), outputWidth, outputHeight);
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    const gl = this.gl;

    if (this.texture) gl.deleteTexture(this.texture);
    if (this.outputTexture) gl.deleteTexture(this.outputTexture);
    if (this.framebuffer) gl.deleteFramebuffer(this.framebuffer);
    if (this.program) gl.deleteProgram(this.program);
  }
}

/**
 * Check if super-resolution is supported
 */
export function isSuperResolutionSupported(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    return gl !== null;
  } catch {
    return false;
  }
}

/**
 * Initialize super-resolution processor
 */
export function initSuperResolution(
  outputCanvas: HTMLCanvasElement
): SuperResolutionProcessor | null {
  const gl = outputCanvas.getContext('webgl2');

  if (!gl) {
    console.log('[SR] WebGL2 not supported, skipping super-resolution');
    return null;
  }

  console.log('[SR] Initialized WebGL2 super-resolution processor');
  return new SuperResolutionProcessor(gl);
}

/**
 * Quality selection with super-resolution consideration
 */
export function selectQualityWithSR(
  bandwidth: number,
  srAvailable: boolean
): { quality: '360p' | '720p' | '1080p'; upscale: boolean } {
  // If SR available and low bandwidth, use 360p + upscale
  if (srAvailable && bandwidth < 5_000_000) {
    return { quality: '360p', upscale: true };
  }

  // Medium bandwidth: 720p
  if (bandwidth < 15_000_000) {
    return { quality: '720p', upscale: false };
  }

  // High bandwidth: 1080p
  return { quality: '1080p', upscale: false };
}

export { SuperResolutionProcessor };
export default initSuperResolution;
