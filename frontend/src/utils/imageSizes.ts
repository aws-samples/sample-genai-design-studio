// Image size presets for Nova Canvas and Nova 2
export interface ImageSize {
  width: number;
  height: number;
  ratio: string;
  category: 'square' | 'landscape' | 'portrait';
  label: string;
}

// Nova Canvas image size presets
export const NOVA_CANVAS_IMAGE_SIZE_PRESETS: ImageSize[] = [
  // Square (正方形)
  { width: 1024, height: 1024, ratio: '1:1', category: 'square', label: '1024 × 1024 (1:1)' },
  { width: 2048, height: 2048, ratio: '1:1', category: 'square', label: '2048 × 2048 (1:1)' },
  
  // Landscape (横長)
  { width: 1024, height: 336, ratio: '3:1', category: 'landscape', label: '1024 × 336 (3:1)' },
  { width: 1024, height: 512, ratio: '2:1', category: 'landscape', label: '1024 × 512 (2:1)' },
  { width: 1024, height: 576, ratio: '16:9', category: 'landscape', label: '1024 × 576 (16:9)' },
  { width: 1024, height: 627, ratio: '3:2', category: 'landscape', label: '1024 × 627 (3:2)' },
  { width: 1024, height: 816, ratio: '5:4', category: 'landscape', label: '1024 × 816 (5:4)' },
  { width: 1280, height: 720, ratio: '16:9', category: 'landscape', label: '1280 × 720 (16:9)' },
  { width: 2048, height: 512, ratio: '4:1', category: 'landscape', label: '2048 × 512 (4:1)' },
  { width: 2288, height: 1824, ratio: '5:4', category: 'landscape', label: '2288 × 1824 (5:4)' },
  { width: 2512, height: 1664, ratio: '3:2', category: 'landscape', label: '2512 × 1664 (3:2)' },
  { width: 2720, height: 1520, ratio: '16:9', category: 'landscape', label: '2720 × 1520 (16:9)' },
  { width: 2896, height: 1440, ratio: '2:1', category: 'landscape', label: '2896 × 1440 (2:1)' },
  { width: 3536, height: 1168, ratio: '3:1', category: 'landscape', label: '3536 × 1168 (3:1)' },
  { width: 4096, height: 1024, ratio: '4:1', category: 'landscape', label: '4096 × 1024 (4:1)' },
  
  // Portrait (縦長)
  { width: 336, height: 1024, ratio: '1:3', category: 'portrait', label: '336 × 1024 (1:3)' },
  { width: 512, height: 1024, ratio: '1:2', category: 'portrait', label: '512 × 1024 (1:2)' },
  { width: 512, height: 2048, ratio: '1:4', category: 'portrait', label: '512 × 2048 (1:4)' },
  { width: 576, height: 1024, ratio: '9:16', category: 'portrait', label: '576 × 1024 (9:16)' },
  { width: 672, height: 1024, ratio: '2:3', category: 'portrait', label: '672 × 1024 (2:3)' },
  { width: 720, height: 1280, ratio: '9:16', category: 'portrait', label: '720 × 1280 (9:16)' },
  { width: 816, height: 1024, ratio: '4:5', category: 'portrait', label: '816 × 1024 (4:5)' },
  { width: 1024, height: 4096, ratio: '1:4', category: 'portrait', label: '1024 × 4096 (1:4)' },
  { width: 1168, height: 3536, ratio: '1:3', category: 'portrait', label: '1168 × 3536 (1:3)' },
  { width: 1440, height: 2896, ratio: '1:2', category: 'portrait', label: '1440 × 2896 (1:2)' },
  { width: 1520, height: 2720, ratio: '9:16', category: 'portrait', label: '1520 × 2720 (9:16)' },
  { width: 1664, height: 2512, ratio: '2:3', category: 'portrait', label: '1664 × 2512 (2:3)' },
  { width: 1824, height: 2288, ratio: '4:5', category: 'portrait', label: '1824 × 2288 (4:5)' },
];

// Nova 2 Omni image size presets
export const NOVA2_IMAGE_SIZE_PRESETS: ImageSize[] = [
  // Landscape (横長)
  { width: 2880, height: 1440, ratio: '2:1', category: 'landscape', label: '2880 × 1440 (2:1)' },
  { width: 2704, height: 1520, ratio: '16:9', category: 'landscape', label: '2704 × 1520 (16:9)' },
  { width: 2496, height: 1664, ratio: '3:2', category: 'landscape', label: '2496 × 1664 (3:2)' },
  { width: 2352, height: 1760, ratio: '4:3', category: 'landscape', label: '2352 × 1760 (4:3)' },
  
  // Square (正方形)
  { width: 2048, height: 2048, ratio: '1:1', category: 'square', label: '2048 × 2048 (1:1)' },
  
  // Portrait (縦長)
  { width: 1440, height: 2880, ratio: '1:2', category: 'portrait', label: '1440 × 2880 (1:2)' },
  { width: 1760, height: 2352, ratio: '3:4', category: 'portrait', label: '1760 × 2352 (3:4)' },
  { width: 1664, height: 2496, ratio: '2:3', category: 'portrait', label: '1664 × 2496 (2:3)' },
  { width: 1520, height: 2704, ratio: '9:16', category: 'portrait', label: '1520 × 2704 (9:16)' },
];

// Default presets (for backward compatibility)
export const IMAGE_SIZE_PRESETS: ImageSize[] = NOVA_CANVAS_IMAGE_SIZE_PRESETS;

export const DEFAULT_SIZE_KEY = '1024x1024';
export const NOVA2_DEFAULT_SIZE_KEY = '2048x2048';

export const getSizeKey = (width: number, height: number): string => {
  return `${width}x${height}`;
};

export const getSizeFromKey = (key: string, presets: ImageSize[] = IMAGE_SIZE_PRESETS): ImageSize | undefined => {
  const [width, height] = key.split('x').map(Number);
  return presets.find(size => size.width === width && size.height === height);
};

export const groupSizesByCategory = (presets: ImageSize[] = IMAGE_SIZE_PRESETS) => {
  const grouped = {
    square: presets.filter(size => size.category === 'square'),
    landscape: presets.filter(size => size.category === 'landscape'),
    portrait: presets.filter(size => size.category === 'portrait'),
  };
  return grouped;
};

export const getImageSizePresetsForModel = (modelId: string): ImageSize[] => {
  return modelId === 'nova2' ? NOVA2_IMAGE_SIZE_PRESETS : NOVA_CANVAS_IMAGE_SIZE_PRESETS;
};

export const getDefaultSizeKeyForModel = (modelId: string): string => {
  return modelId === 'nova2' ? NOVA2_DEFAULT_SIZE_KEY : DEFAULT_SIZE_KEY;
};
