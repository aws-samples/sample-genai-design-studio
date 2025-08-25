import { z } from 'zod';

// Valid dimensions for Nova models
// Based on all dimensions used in IMAGE_SIZE_PRESETS
const VALID_DIMENSIONS = [
  256, 336, 512, 576, 627, 672, 720, 768, 816, 
  1024, 1168, 1280, 1440, 1520, 1536, 1664, 1792, 
  1824, 2048, 2288, 2512, 2720, 2896, 3536, 4096
];

// Image validation constants
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PIXELS = 4200000; // 4.2 million pixels

// Image file validation
export const imageFileSchema = z.custom<File>((file) => file instanceof File, {
  message: 'ファイルを選択してください',
}).refine((file) => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  return extension && ALLOWED_EXTENSIONS.includes(extension);
}, {
  message: `画像ファイルの拡張子は ${ALLOWED_EXTENSIONS.join(', ')} のいずれかである必要があります`,
}).refine((file) => {
  return file.type && ALLOWED_MIME_TYPES.includes(file.type);
}, {
  message: `画像ファイルのMIMEタイプは ${ALLOWED_MIME_TYPES.join(', ')} のいずれかである必要があります`,
});

// Async image resolution validation
export const validateImageResolution = async (file: File): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    
    reader.onload = (e) => {
      img.onload = () => {
        const pixels = img.width * img.height;
        if (pixels > MAX_PIXELS) {
          reject(new Error(`画像の解像度が最大値（${MAX_PIXELS.toLocaleString()}ピクセル）を超えています。現在: ${pixels.toLocaleString()}ピクセル`));
        } else {
          resolve(true);
        }
      };
      img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
      img.src = e.target?.result as string;
    };
    
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
    reader.readAsDataURL(file);
  });
};

// Common schemas
const nonEmptyString = z.string().min(1, '必須項目です');
const groupIdSchema = nonEmptyString;
const userIdSchema = nonEmptyString;

// Nova VTO Request Schema
export const novaVTORequestSchema = z.object({
  group_id: groupIdSchema,
  user_id: userIdSchema,
  source_image_object_name: nonEmptyString,
  reference_image_object_name: nonEmptyString,
  mask_image_object_name: z.string().optional(),
  mask_type: z.enum(['GARMENT', 'IMAGE', 'PROMPT']).default('GARMENT'),
  mask_prompt: z.string().optional().default(''),
  garment_class: z.enum(['UPPER_BODY', 'LOWER_BODY', 'FULL_BODY', 'SHOES']).default('UPPER_BODY'),
  long_sleeve_style: z.string().optional(),
  tucking_style: z.string().optional(),
  outer_layer_style: z.string().optional(),
  mask_shape: z.string().default('DEFAULT'),
  mask_shape_prompt: z.string().default('DEFAULT'),
  preserve_body_pose: z.string().default('DEFAULT'),
  preserve_hands: z.string().default('DEFAULT'),
  preserve_face: z.string().default('DEFAULT'),
  merge_style: z.string().optional(),
  return_mask: z.boolean().default(false),
  number_of_images: z.number().int().min(1).max(5).default(1),
  quality: z.enum(['standard', 'premium']).default('standard'),
  cfg_scale: z.number().min(1.0).max(10.0).default(6.5),
  seed: z.number().int().default(-1).refine((val) => {
    return val === -1 || (val >= 0 && val <= 2147483647);
  }, {
    message: 'シード値は-1または0から2147483647の間である必要があります',
  }),
}).refine((data) => {
  if (data.mask_type === 'IMAGE' && (!data.mask_image_object_name || data.mask_image_object_name.trim() === '')) {
    return false;
  }
  return true;
}, {
  message: 'マスクタイプがIMAGEの場合、マスク画像が必要です',
  path: ['mask_image_object_name'],
}).refine((data) => {
  if (data.mask_type === 'PROMPT' && (!data.mask_prompt || data.mask_prompt.trim() === '')) {
    return false;
  }
  return true;
}, {
  message: 'マスクタイプがPROMPTの場合、マスクプロンプトが必要です',
  path: ['mask_prompt'],
});

// Background Replacement Request Schema
export const backgroundReplacementRequestSchema = z.object({
  group_id: groupIdSchema,
  user_id: userIdSchema,
  prompt: z.string().min(1, 'プロンプトは必須です').max(1024, 'プロンプトは1024文字以内で入力してください'),
  input_image_object_name: nonEmptyString,
  mask_prompt: z.string().optional().default('people'),
  mask_image_object_name: z.string().optional(),
  model_id: z.string().default('amazon.nova-canvas-v1:0'),
  outPaintingMode: z.enum(['DEFAULT', 'PRECISE']).default('DEFAULT'),
  cfg_scale: z.number().min(1.1).max(10.0).default(6.5),
  number_of_images: z.number().int().min(1).max(5).default(1),
  height: z.number().refine((val) => VALID_DIMENSIONS.includes(val), {
    message: `高さは ${VALID_DIMENSIONS.join(', ')} のいずれかである必要があります`,
  }).default(512),
  width: z.number().refine((val) => VALID_DIMENSIONS.includes(val), {
    message: `幅は ${VALID_DIMENSIONS.join(', ')} のいずれかである必要があります`,
  }).default(512),
});

// Nova Model Request Schema
export const novaModelRequestSchema = z.object({
  group_id: groupIdSchema,
  user_id: userIdSchema,
  prompt: z.string().min(1, 'プロンプトは必須です').max(1024, 'プロンプトは1024文字以内で入力してください'),
  model_id: z.string().default('amazon.nova-canvas-v1:0'),
  cfg_scale: z.number().min(1.1).max(10.0).default(6.5),
  height: z.number().refine((val) => VALID_DIMENSIONS.includes(val), {
    message: `高さは ${VALID_DIMENSIONS.join(', ')} のいずれかである必要があります`,
  }).default(1024),
  width: z.number().refine((val) => VALID_DIMENSIONS.includes(val), {
    message: `幅は ${VALID_DIMENSIONS.join(', ')} のいずれかである必要があります`,
  }).default(1024),
  number_of_images: z.number().int().min(1).max(5).default(1),
});

// Type exports
export type NovaVTORequest = z.infer<typeof novaVTORequestSchema>;
export type BackgroundReplacementRequest = z.infer<typeof backgroundReplacementRequestSchema>;
export type NovaModelRequest = z.infer<typeof novaModelRequestSchema>;

// Validation helper functions
export const validateNovaVTORequest = (data: unknown): { success: boolean; data?: NovaVTORequest; error?: z.ZodError } => {
  const result = novaVTORequestSchema.safeParse(data);
  return {
    success: result.success,
    data: result.success ? result.data : undefined,
    error: result.success ? undefined : result.error,
  };
};

export const validateBackgroundReplacementRequest = (data: unknown): { success: boolean; data?: BackgroundReplacementRequest; error?: z.ZodError } => {
  const result = backgroundReplacementRequestSchema.safeParse(data);
  return {
    success: result.success,
    data: result.success ? result.data : undefined,
    error: result.success ? undefined : result.error,
  };
};

export const validateNovaModelRequest = (data: unknown): { success: boolean; data?: NovaModelRequest; error?: z.ZodError } => {
  const result = novaModelRequestSchema.safeParse(data);
  return {
    success: result.success,
    data: result.success ? result.data : undefined,
    error: result.success ? undefined : result.error,
  };
};

// Get validation error messages
export const getValidationErrors = (error: z.ZodError): Record<string, string> => {
  const errors: Record<string, string> = {};
  error.errors.forEach((err) => {
    const path = err.path.join('.');
    errors[path] = err.message;
  });
  return errors;
};
