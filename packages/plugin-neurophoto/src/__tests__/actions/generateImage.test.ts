/**
 * Tests for Generate Image Action
 * Testing the main image generation functionality
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { generateImageAction } from '../../actions/generateImage';

describe('Generate Image Action', () => {
  let mockRuntime: any;
  let mockCallback: any;
  let mockService: any;

  beforeEach(() => {
    // Mock Replicate Service
    mockService = {
      generateImage: mock(() =>
        Promise.resolve({
          success: true,
          imageUrls: ['https://replicate.delivery/test-image.jpg'],
          metadata: {
            prompt: 'test prompt',
            model: 'black-forest-labs/flux-schnell',
            generationTime: 15000,
          },
        })
      ),
    };

    // Mock Runtime
    mockRuntime = {
      getService: mock((name: string) => {
        if (name === 'replicate') {
          return mockService;
        }
        return null;
      }),
      getSetting: mock((key: string) => {
        if (key === 'REPLICATE_API_KEY') return 'test-key';
        if (key === 'DEFAULT_MODEL') return 'black-forest-labs/flux-schnell';
        return null;
      }),
    };

    // Mock Callback
    mockCallback = mock(() => Promise.resolve());
  });

  describe('validate()', () => {
    test('should validate /neurophoto command', async () => {
      const message = {
        content: { text: '/neurophoto beautiful sunset' },
        userId: 'test-user',
        roomId: 'test-room',
      };

      const isValid = await generateImageAction.validate(mockRuntime, message as any);
      expect(isValid).toBe(true);
    });

    test('should validate Russian "нейрофото" command', async () => {
      const message = {
        content: { text: 'нейрофото красивый закат' },
        userId: 'test-user',
        roomId: 'test-room',
      };

      const isValid = await generateImageAction.validate(mockRuntime, message as any);
      expect(isValid).toBe(true);
    });

    test('should validate natural language commands', async () => {
      const messages = [
        { content: { text: 'создай изображение кота' } },
        { content: { text: 'нарисуй дом' } },
        { content: { text: 'generate image of a car' } },
      ];

      for (const message of messages) {
        const isValid = await generateImageAction.validate(
          mockRuntime,
          message as any
        );
        expect(isValid).toBe(true);
      }
    });

    test('should not validate unrelated messages', async () => {
      const message = {
        content: { text: 'hello, how are you?' },
        userId: 'test-user',
        roomId: 'test-room',
      };

      const isValid = await generateImageAction.validate(mockRuntime, message as any);
      expect(isValid).toBe(false);
    });
  });

  describe('handler()', () => {
    test('should generate image successfully', async () => {
      const message = {
        content: { text: '/neurophoto beautiful sunset over ocean' },
        userId: 'test-user',
        roomId: 'test-room',
      };

      const result = await generateImageAction.handler(
        mockRuntime,
        message as any,
        {},
        {},
        mockCallback
      );

      // Check result
      expect(result.success).toBe(true);
      expect(result.data?.imageUrls).toBeDefined();
      expect(result.data?.imageUrls?.length).toBeGreaterThan(0);

      // Check callback was called
      expect(mockCallback).toHaveBeenCalled();
      const calls = mockCallback.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(2); // "generating" + result

      // Check service was called
      expect(mockService.generateImage).toHaveBeenCalled();
    });

    test('should reject prompts that are too short', async () => {
      const message = {
        content: { text: '/neurophoto ab' },
        userId: 'test-user',
        roomId: 'test-room',
      };

      const result = await generateImageAction.handler(
        mockRuntime,
        message as any,
        {},
        {},
        mockCallback
      );

      expect(result.success).toBe(false);
      expect(mockCallback).toHaveBeenCalled();

      const errorCall = mockCallback.mock.calls[0][0];
      expect(errorCall.text).toContain('Пожалуйста, опишите');
    });

    test('should extract prompt correctly from different commands', async () => {
      const testCases = [
        {
          input: '/neurophoto sunset over mountains',
          expected: 'sunset over mountains',
        },
        {
          input: 'нейрофото красивый закат',
          expected: 'красивый закат',
        },
        {
          input: 'создай изображение кота в космосе',
          expected: 'кота в космосе',
        },
      ];

      for (const { input, expected } of testCases) {
        mockCallback.mockClear();
        mockService.generateImage.mockClear();

        const message = {
          content: { text: input },
          userId: 'test-user',
          roomId: 'test-room',
        };

        await generateImageAction.handler(
          mockRuntime,
          message as any,
          {},
          {},
          mockCallback
        );

        const serviceCall = mockService.generateImage.mock.calls[0][0];
        expect(serviceCall.prompt).toBe(expected);
      }
    });

    test('should handle service errors gracefully', async () => {
      // Mock service to fail
      mockService.generateImage = mock(() =>
        Promise.resolve({
          success: false,
          error: 'API rate limit exceeded',
        })
      );

      const message = {
        content: { text: '/neurophoto test image' },
        userId: 'test-user',
        roomId: 'test-room',
      };

      const result = await generateImageAction.handler(
        mockRuntime,
        message as any,
        {},
        {},
        mockCallback
      );

      expect(result.success).toBe(false);
      expect(mockCallback).toHaveBeenCalled();

      // Find error message in callbacks
      const errorCall = mockCallback.mock.calls.find((call: any) =>
        call[0].text?.includes('❌')
      );
      expect(errorCall).toBeDefined();
    });

    test('should handle missing service', async () => {
      // Mock runtime without service
      const noServiceRuntime = {
        ...mockRuntime,
        getService: mock(() => null),
      };

      const message = {
        content: { text: '/neurophoto test' },
        userId: 'test-user',
        roomId: 'test-room',
      };

      const result = await generateImageAction.handler(
        noServiceRuntime,
        message as any,
        {},
        {},
        mockCallback
      );

      expect(result.success).toBe(false);
      expect(mockCallback).toHaveBeenCalled();
    });
  });

  describe('examples', () => {
    test('should have valid example conversations', () => {
      expect(generateImageAction.examples).toBeDefined();
      expect(Array.isArray(generateImageAction.examples)).toBe(true);
      expect(generateImageAction.examples!.length).toBeGreaterThan(0);

      // Check structure of first example
      const firstExample = generateImageAction.examples![0];
      expect(Array.isArray(firstExample)).toBe(true);
      expect(firstExample.length).toBe(2); // User message + agent response
    });
  });
});
