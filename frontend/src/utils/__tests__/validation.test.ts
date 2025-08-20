import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  imageFileSchema,
  novaModelRequestSchema,
  validateNovaVTORequest,
  validateBackgroundReplacementRequest,
  validateNovaModelRequest,
  getValidationErrors,
  validateImageResolution,
  validateMaskImage,
  validateImageColorDepth,
} from '../validation';


describe('Image File Validation', () => {
  it('should validate valid image file', () => {
    const validFile = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
    expect(() => imageFileSchema.parse(validFile)).not.toThrow();
  });

  it('should reject invalid file extension', () => {
    const invalidFile = new File(['content'], 'test.txt', { type: 'text/plain' });
    expect(() => imageFileSchema.parse(invalidFile)).toThrowError(/拡張子/);
  });

  it('should reject invalid MIME type', () => {
    const invalidFile = new File(['content'], 'test.jpg', { type: 'text/plain' });
    expect(() => imageFileSchema.parse(invalidFile)).toThrowError(/MIMEタイプ/);
  });

  it('should accept WebP files', () => {
    const webpFile = new File(['content'], 'test.webp', { type: 'image/webp' });
    expect(() => imageFileSchema.parse(webpFile)).not.toThrow();
  });

  it('should accept all valid extensions', () => {
    const extensions = ['jpg', 'jpeg', 'png', 'webp'];
    const mimeTypes = ['image/jpeg', 'image/jpeg', 'image/png', 'image/webp'];

    extensions.forEach((ext, index) => {
      const file = new File(['content'], `test.${ext}`, { type: mimeTypes[index] });
      expect(() => imageFileSchema.parse(file)).not.toThrow();
    });
  });
});

// Helper function to create a mock image file with specific dimensions
const createMockImageFile = (width: number, height: number, type: string = 'image/png'): File => {
  // Create a canvas with the specified dimensions
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  // Fill with a solid color
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgb(255, 255, 255)';
    ctx.fillRect(0, 0, width, height);
  }

  // Convert to blob and create file
  return new Promise<File>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], 'test.png', { type });
        resolve(file);
      }
    }, type);
  }) as any; // Type assertion for test purposes
};

// Helper function to create a mock image with alpha channel
const createMockImageWithAlpha = (hasTransparentPixels: boolean, type: string = 'image/png'): File => {
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 100;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Fill with solid color first
    ctx.fillStyle = 'rgb(255, 255, 255)';
    ctx.fillRect(0, 0, 100, 100);

    if (hasTransparentPixels) {
      // Add some semi-transparent pixels
      const imageData = ctx.getImageData(0, 0, 100, 100);
      const data = imageData.data;

      // Make some pixels semi-transparent (alpha = 128)
      for (let i = 0; i < 400; i += 4) { // First 100 pixels
        data[i + 3] = 128; // Set alpha to 128 (semi-transparent)
      }

      ctx.putImageData(imageData, 0, 0);
    }
  }

  return new Promise<File>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], 'test.png', { type });
        resolve(file);
      }
    }, type);
  }) as any;
};

describe('Image Resolution Validation', () => {
  let originalImage: typeof Image;
  let originalFileReader: typeof FileReader;

  beforeEach(() => {
    // Save original constructors
    originalImage = global.Image;
    originalFileReader = global.FileReader;
  });

  afterEach(() => {
    // Always restore original constructors
    global.Image = originalImage;
    global.FileReader = originalFileReader;
  });

  const mockImageAndFileReader = (width: number, height: number) => {
    global.Image = class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = width;
      height = height;

      set src(value: string) {
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 0);
      }
    } as any;

    global.FileReader = class MockFileReader {
      onload: ((event: any) => void) | null = null;
      onerror: (() => void) | null = null;

      readAsDataURL() {
        setTimeout(() => {
          if (this.onload) {
            this.onload({ target: { result: 'data:image/png;base64,test' } });
          }
        }, 0);
      }
    } as any;
  };

  it('should accept valid image dimensions', async () => {
    mockImageAndFileReader(1024, 768);

    const file = new File(['content'], 'test.png', { type: 'image/png' });
    await expect(validateImageResolution(file)).resolves.toBe(true);
  });

  it('should reject images with dimensions too small', async () => {
    mockImageAndFileReader(200, 200); // Below minimum of 320

    const file = new File(['content'], 'test.png', { type: 'image/png' });
    await expect(validateImageResolution(file)).rejects.toThrow(/320ピクセル以上/);
  });

  it('should reject images with dimensions too large', async () => {
    mockImageAndFileReader(5000, 3000); // Above maximum of 4096

    const file = new File(['content'], 'test.png', { type: 'image/png' });
    await expect(validateImageResolution(file)).rejects.toThrow(/4096ピクセル以下/);
  });

  it('should reject images with too many pixels', async () => {
    mockImageAndFileReader(3000, 1500); // 3000 * 1500 = 4,500,000 pixels (exceeds 4,194,304)

    const file = new File(['content'], 'test.png', { type: 'image/png' });
    await expect(validateImageResolution(file)).rejects.toThrow(/総ピクセル数が最大値/);
  });

  it('should reject images with invalid aspect ratio', async () => {
    mockImageAndFileReader(2000, 400); // Aspect ratio 2000:400 = 5:1 (exceeds 4:1 limit, but meets min dimension)

    const file = new File(['content'], 'test.png', { type: 'image/png' });
    await expect(validateImageResolution(file)).rejects.toThrow(/アスペクト比は1:4から4:1の範囲内/);
  });
});

describe('Image Color Depth Validation', () => {
  let originalImage: typeof Image;
  let originalFileReader: typeof FileReader;
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    // Save original constructors
    originalImage = global.Image;
    originalFileReader = global.FileReader;
    originalCreateElement = global.document?.createElement;
  });

  afterEach(() => {
    // Always restore original constructors
    global.Image = originalImage;
    global.FileReader = originalFileReader;
    if (global.document && originalCreateElement) {
      global.document.createElement = originalCreateElement;
    }
  });

  const mockImageFileReaderAndCanvas = (imageData: Uint8ClampedArray, fileType: string = 'image/png') => {
    global.Image = class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 100;
      height = 100;

      set src(value: string) {
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 0);
      }
    } as any;

    global.FileReader = class MockFileReader {
      onload: ((event: any) => void) | null = null;
      onerror: (() => void) | null = null;

      readAsDataURL() {
        setTimeout(() => {
          if (this.onload) {
            this.onload({ target: { result: `data:${fileType};base64,test` } });
          }
        }, 0);
      }
    } as any;

    // Mock canvas and context
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({ data: imageData }))
      }))
    };

    global.document.createElement = vi.fn((tagName) => {
      if (tagName === 'canvas') {
        return mockCanvas as any;
      }
      return {} as any;
    });
  };

  it('should accept JPEG images (no alpha channel)', async () => {
    mockImageFileReaderAndCanvas(
      new Uint8ClampedArray([255, 255, 255, 255]), // Any data is fine for JPEG
      'image/jpeg'
    );

    const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' });
    await expect(validateImageColorDepth(file)).resolves.toBe(true);
  });

  it('should accept PNG images with fully opaque pixels', async () => {
    const opaquePixels = new Uint8ClampedArray([
      255, 255, 255, 255, // Fully opaque white pixel
      0, 0, 0, 0,         // Fully transparent black pixel
      255, 0, 0, 255      // Fully opaque red pixel
    ]);

    mockImageFileReaderAndCanvas(opaquePixels, 'image/png');

    const file = new File(['content'], 'test.png', { type: 'image/png' });
    await expect(validateImageColorDepth(file)).resolves.toBe(true);
  });

  it('should reject PNG images with semi-transparent pixels', async () => {
    const semiTransparentPixels = new Uint8ClampedArray([
      255, 255, 255, 255, // Fully opaque white pixel
      255, 0, 0, 128,     // Semi-transparent red pixel (alpha = 128)
      0, 0, 0, 0          // Fully transparent black pixel
    ]);

    mockImageFileReaderAndCanvas(semiTransparentPixels, 'image/png');

    const file = new File(['content'], 'test.png', { type: 'image/png' });
    await expect(validateImageColorDepth(file)).rejects.toThrow(/PNG画像のアルファチャンネルに透明または半透明のピクセル/);
  });

  it('should reject WebP images with semi-transparent pixels', async () => {
    const semiTransparentPixels = new Uint8ClampedArray([
      255, 255, 255, 200, // Semi-transparent white pixel (alpha = 200)
      0, 0, 0, 0          // Fully transparent black pixel
    ]);

    mockImageFileReaderAndCanvas(semiTransparentPixels, 'image/webp');

    const file = new File(['content'], 'test.webp', { type: 'image/webp' });
    await expect(validateImageColorDepth(file)).rejects.toThrow(/WebP画像のアルファチャンネルに透明または半透明のピクセル/);
  });
});

describe('Mask Image Validation', () => {
  let originalImage: typeof Image;
  let originalFileReader: typeof FileReader;

  beforeEach(() => {
    originalImage = global.Image;
    originalFileReader = global.FileReader;
  });

  afterEach(() => {
    global.Image = originalImage;
    global.FileReader = originalFileReader;
  });

  const mockMaskImageValidation = (width: number, height: number) => {
    global.Image = class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = width;
      height = height;

      set src(value: string) {
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 0);
      }
    } as any;

    global.FileReader = class MockFileReader {
      onload: ((event: any) => void) | null = null;
      onerror: (() => void) | null = null;

      readAsDataURL() {
        setTimeout(() => {
          if (this.onload) {
            this.onload({ target: { result: 'data:image/png;base64,test' } });
          }
        }, 0);
      }
    } as any;
  };

  it('should use same validation as regular images', async () => {
    mockMaskImageValidation(1024, 768);

    const file = new File(['content'], 'mask.png', { type: 'image/png' });
    await expect(validateMaskImage(file)).resolves.toBe(true);
  });

  it('should reject mask images with invalid dimensions', async () => {
    mockMaskImageValidation(100, 100); // Below minimum

    const file = new File(['content'], 'mask.png', { type: 'image/png' });
    await expect(validateMaskImage(file)).rejects.toThrow(/320ピクセル以上/);
  });
});

describe('Nova VTO Request Validation', () => {
  const validRequest = {
    group_id: 'test-group',
    user_id: 'test-user',
    source_image_object_name: 'source.png',
    reference_image_object_name: 'reference.png',
    mask_type: 'GARMENT',
    garment_class: 'UPPER_BODY',
    number_of_images: 1,
    quality: 'standard',
    cfg_scale: 3.0,
    seed: -1,
  };

  it('should validate valid VTO request', () => {
    const result = validateNovaVTORequest(validRequest);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('should reject invalid mask type', () => {
    const invalidRequest = { ...validRequest, mask_type: 'INVALID' };
    const result = validateNovaVTORequest(invalidRequest);
    expect(result.success).toBe(false);
  });

  it('should reject when IMAGE mask type without mask image', () => {
    const invalidRequest = { ...validRequest, mask_type: 'IMAGE' };
    const result = validateNovaVTORequest(invalidRequest);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain('マスク画像が必要');
  });

  it('should reject when PROMPT mask type without mask prompt', () => {
    const invalidRequest = { ...validRequest, mask_type: 'PROMPT' };
    const result = validateNovaVTORequest(invalidRequest);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain('マスクプロンプトが必要');
  });

  it('should validate seed value constraints', () => {
    // Valid seed values
    const validSeeds = [-1, 0, 1000, 2147483647];
    validSeeds.forEach(seed => {
      const request = { ...validRequest, seed };
      const result = validateNovaVTORequest(request);
      expect(result.success).toBe(true);
    });

    // Invalid seed values
    const invalidSeeds = [-2, 2147483648];
    invalidSeeds.forEach(seed => {
      const request = { ...validRequest, seed };
      const result = validateNovaVTORequest(request);
      expect(result.success).toBe(false);
    });
  });

  it('should validate number_of_images constraints', () => {
    // Valid values
    [1, 2, 3, 4, 5].forEach(num => {
      const request = { ...validRequest, number_of_images: num };
      const result = validateNovaVTORequest(request);
      expect(result.success).toBe(true);
    });

    // Invalid values
    [0, 6, -1].forEach(num => {
      const request = { ...validRequest, number_of_images: num };
      const result = validateNovaVTORequest(request);
      expect(result.success).toBe(false);
    });
  });
});

describe('Background Replacement Request Validation', () => {
  const validRequest = {
    group_id: 'test-group',
    user_id: 'test-user',
    prompt: 'A beautiful sunset',
    input_image_object_name: 'input.png',
    cfg_scale: 5.0,
    number_of_images: 1,
    height: 512,
    width: 512,
  };

  it('should validate valid background replacement request', () => {
    const result = validateBackgroundReplacementRequest(validRequest);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('should reject invalid dimensions', () => {
    const invalidRequest = { ...validRequest, width: 500 }; // Invalid dimension
    const result = validateBackgroundReplacementRequest(invalidRequest);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain('幅は');
  });

  it('should validate prompt length', () => {
    // Valid prompt
    const shortPrompt = { ...validRequest, prompt: 'Test' };
    expect(validateBackgroundReplacementRequest(shortPrompt).success).toBe(true);

    // Empty prompt
    const emptyPrompt = { ...validRequest, prompt: '' };
    expect(validateBackgroundReplacementRequest(emptyPrompt).success).toBe(false);

    // Too long prompt (over 1024 characters)
    const longPrompt = { ...validRequest, prompt: 'a'.repeat(1025) };
    expect(validateBackgroundReplacementRequest(longPrompt).success).toBe(false);
  });

  it('should validate CFG scale constraints', () => {
    // Valid values
    [1.1, 5.5, 10.0].forEach(scale => {
      const request = { ...validRequest, cfg_scale: scale };
      const result = validateBackgroundReplacementRequest(request);
      expect(result.success).toBe(true);
    });

    // Invalid values
    [1.0, 0.9, 10.1, -1].forEach(scale => {
      const request = { ...validRequest, cfg_scale: scale };
      const result = validateBackgroundReplacementRequest(request);
      expect(result.success).toBe(false);
    });
  });

  it('should validate number_of_images constraints', () => {
    // Valid values
    [1, 2, 3, 4, 5].forEach(num => {
      const request = { ...validRequest, number_of_images: num };
      const result = validateBackgroundReplacementRequest(request);
      expect(result.success).toBe(true);
    });

    // Invalid values
    [0, 6, -1].forEach(num => {
      const request = { ...validRequest, number_of_images: num };
      const result = validateBackgroundReplacementRequest(request);
      expect(result.success).toBe(false);
    });
  });

  it('should validate all valid dimensions', () => {
    const validDimensions = [256, 512, 768, 1024, 1280, 1536, 1792, 2048];
    validDimensions.forEach(dimension => {
      const request = { ...validRequest, width: dimension, height: dimension };
      const result = validateBackgroundReplacementRequest(request);
      expect(result.success).toBe(true);
    });
  });

  it('should validate outPaintingMode options', () => {
    const validModes = ['DEFAULT', 'PRECISE'];
    validModes.forEach(mode => {
      const request = { ...validRequest, outPaintingMode: mode };
      const result = validateBackgroundReplacementRequest(request);
      expect(result.success).toBe(true);
    });
  });

  it('should validate optional mask_prompt', () => {
    // Valid with mask_prompt
    const withMaskPrompt = { ...validRequest, mask_prompt: 'person face' };
    expect(validateBackgroundReplacementRequest(withMaskPrompt).success).toBe(true);

    // Valid without mask_prompt (should use default)
    const withoutMaskPrompt = { ...validRequest };
    expect(validateBackgroundReplacementRequest(withoutMaskPrompt).success).toBe(true);
  });

  it('should validate optional mask_image_object_name', () => {
    // Valid with mask image
    const withMaskImage = { ...validRequest, mask_image_object_name: 'mask.png' };
    expect(validateBackgroundReplacementRequest(withMaskImage).success).toBe(true);

    // Valid without mask image
    const withoutMaskImage = { ...validRequest };
    expect(validateBackgroundReplacementRequest(withoutMaskImage).success).toBe(true);
  });
});

describe('Nova Model Request Validation', () => {
  const validRequest = {
    group_id: 'test-group',
    user_id: 'test-user',
    prompt: 'A beautiful landscape',
    cfg_scale: 8.0,
    height: 1024,
    width: 1024,
    number_of_images: 1,
  };

  it('should validate valid model request', () => {
    const result = validateNovaModelRequest(validRequest);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('should validate CFG scale constraints', () => {
    // Valid values
    [1.1, 5.5, 10.0].forEach(scale => {
      const request = { ...validRequest, cfg_scale: scale };
      const result = validateNovaModelRequest(request);
      expect(result.success).toBe(true);
    });

    // Invalid values
    [1.0, 0.9, 10.1, -1].forEach(scale => {
      const request = { ...validRequest, cfg_scale: scale };
      const result = validateNovaModelRequest(request);
      expect(result.success).toBe(false);
    });
  });

  it('should validate all valid dimensions', () => {
    const validDimensions = [256, 512, 768, 1024, 1280, 1536, 1792, 2048];
    validDimensions.forEach(dimension => {
      const request = { ...validRequest, width: dimension, height: dimension };
      const result = validateNovaModelRequest(request);
      expect(result.success).toBe(true);
    });
  });
});

describe('Validation Error Handling', () => {
  it('should get validation errors in correct format', () => {
    const invalidRequest = {
      group_id: '',
      user_id: '',
      prompt: '',
    };

    const result = novaModelRequestSchema.safeParse(invalidRequest);
    if (!result.success) {
      const errors = getValidationErrors(result.error);
      expect(errors['group_id']).toBe('必須項目です');
      expect(errors['user_id']).toBe('必須項目です');
      expect(errors['prompt']).toBe('プロンプトは必須です');
    }
  });
});
