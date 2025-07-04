import { describe, it, expect } from 'vitest';
import {
  imageFileSchema,
  novaModelRequestSchema,
  validateNovaVTORequest,
  validateBackgroundReplacementRequest,
  validateNovaModelRequest,
  getValidationErrors,
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

  it('should accept all valid extensions', () => {
    const extensions = ['jpg', 'jpeg', 'png', 'webp'];
    const mimeTypes = ['image/jpeg', 'image/jpeg', 'image/png', 'image/webp'];
    
    extensions.forEach((ext, index) => {
      const file = new File(['content'], `test.${ext}`, { type: mimeTypes[index] });
      expect(() => imageFileSchema.parse(file)).not.toThrow();
    });
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
