import { create } from 'zustand';
import type {
  AppState,
  VTOState,
  ModelGenerationState,
  BackgroundReplacementState,
  ImageEditState,
  VTOParameters,
  ModelGenerationParameters,
  BackgroundReplacementParameters,
  ImageEditParameters,
  GeneratedImage,
  LanguageState,
} from '../types/store';
import i18n from '../i18n';

// Default VTO Parameters
const defaultVTOParameters: VTOParameters = {
  maskType: 'GARMENT',
  maskPrompt: '',
  garmentClass: 'UPPER_BODY',
  longSleeveStyle: '',
  tuckingStyle: '',
  outerLayerStyle: '',
  maskShape: 'DEFAULT',
  maskShapePrompt: 'DEFAULT',
  preserveBodyPose: 'DEFAULT',
  preserveHands: 'DEFAULT',
  preserveFace: 'DEFAULT',
  mergeStyle: 'BALANCED',
  returnMask: false,
  numberOfImages: 1,
  quality: 'standard',
  cfgScale: 6.5, // default value: 6.5
  seed: -1,
};

// Default Model Generation Parameters
const defaultModelGenerationParameters: ModelGenerationParameters = {
  prompt: '',
  modelId: 'nova2', // Changed default to Nova 2
  cfgScale: 6.5,
  height: 1024,
  width: 1024,
  numberOfImages: 1,
};

// Default Background Replacement Parameters
const defaultBackgroundReplacementParameters: BackgroundReplacementParameters = {
  prompt: '',
  maskPrompt: 'people',
  modelId: 'amazon.nova-canvas-v1:0',
  outPaintingMode: 'DEFAULT',
  cfgScale: 6.5,
  numberOfImages: 1,
  height: 1024,
  width: 1024,
};

// Default Image Edit Parameters
const defaultImageEditParameters: ImageEditParameters = {
  prompt: '',
  numberOfImages: 1,
};

// Default VTO State
const defaultVTOState: VTOState = {
  modelImageFile: null,
  garmentImageFile: null,
  maskImageFile: null,
  modelImage: null,
  garmentImage: null,
  maskImage: null,
  generatedImages: [],
  selectedImageIndex: 0,
  parameters: defaultVTOParameters,
  autoClassificationEnabled: true, // バックエンド実装完了により有効化
  isClassifying: false,
  classificationError: null,
  classificationSuccess: null,
  isLoading: false,
  uploadProgress: false,
  processingProgress: false,
  downloadProgress: false,
  error: null,
};

// Default Model Generation State
const defaultModelGenerationState: ModelGenerationState = {
  generatedImages: [],
  selectedImageIndex: 0,
  parameters: defaultModelGenerationParameters,
  promptEnhancement: {
    originalPrompt: '',
    enhancedPrompt: '',
    isEnhancing: false,
    showEnhanced: false,
    error: null,
  },
  isLoading: false,
  error: null,
};

// Default Background Replacement State
const defaultBackgroundReplacementState: BackgroundReplacementState = {
  sourceImageFile: null,
  maskImageFile: null,
  sourceImage: null,
  maskImage: null,
  generatedImages: [],
  selectedImageIndex: 0,
  parameters: defaultBackgroundReplacementParameters,
  isLoading: false,
  uploadProgress: false,
  processingProgress: false,
  downloadProgress: false,
  error: null,
};

// Default Image Edit State
const defaultImageEditState: ImageEditState = {
  sourceImageFile: null,
  sourceImage: null,
  sourceImageDimensions: null,
  generatedImages: [],
  selectedImageIndex: 0,
  parameters: defaultImageEditParameters,
  isLoading: false,
  uploadProgress: false,
  processingProgress: false,
  downloadProgress: false,
  error: null,
  sizeWarning: null,
};

// Default Language State
const defaultLanguageState: LanguageState = {
  currentLanguage: (localStorage.getItem('language') as 'en' | 'ja') || 'en',
};

interface AppStore extends AppState {
  // VTO Actions
  setVTOModelImage: (file: File | null, url: string | null) => void;
  setVTOGarmentImage: (file: File | null, url: string | null) => void;
  setVTOMaskImage: (file: File | null, url: string | null) => void;
  setVTOGeneratedImages: (images: GeneratedImage[]) => void;
  setVTOSelectedImageIndex: (index: number) => void;
  setVTOParameters: (parameters: Partial<VTOParameters>) => void;
  setVTOLoadingState: (loading: {
    isLoading?: boolean;
    uploadProgress?: boolean;
    processingProgress?: boolean;
    downloadProgress?: boolean;
    error?: string | null;
  }) => void;
  setVTOAutoClassificationEnabled: (enabled: boolean) => void;
  setVTOClassificationState: (state: {
    isClassifying?: boolean;
    classificationError?: string | null;
    classificationSuccess?: string | null;
  }) => void;
  resetVTO: () => void;

  // Model Generation Actions
  setModelGenerationImages: (images: GeneratedImage[]) => void;
  setModelGenerationSelectedImageIndex: (index: number) => void;
  setModelGenerationParameters: (parameters: Partial<ModelGenerationParameters>) => void;
  setModelGenerationLoadingState: (loading: {
    isLoading?: boolean;
    error?: string | null;
  }) => void;
  setModelGenerationPromptEnhancement: (enhancement: {
    originalPrompt?: string;
    enhancedPrompt?: string;
    isEnhancing?: boolean;
    showEnhanced?: boolean;
    error?: string | null;
  }) => void;
  resetModelGeneration: () => void;

  // Background Replacement Actions
  setBackgroundSourceImage: (file: File | null, url: string | null) => void;
  setBackgroundMaskImage: (file: File | null, url: string | null) => void;
  setBackgroundGeneratedImages: (images: GeneratedImage[]) => void;
  setBackgroundSelectedImageIndex: (index: number) => void;
  setBackgroundParameters: (parameters: Partial<BackgroundReplacementParameters>) => void;
  setBackgroundLoadingState: (loading: {
    isLoading?: boolean;
    uploadProgress?: boolean;
    processingProgress?: boolean;
    downloadProgress?: boolean;
    error?: string | null;
  }) => void;
  resetBackgroundReplacement: () => void;

  // Image Edit Actions
  setImageEditSourceImage: (file: File | null, url: string | null) => void;
  setImageEditSourceImageDimensions: (dimensions: { width: number; height: number } | null) => void;
  setImageEditSizeWarning: (warning: string | null) => void;
  setImageEditGeneratedImages: (images: GeneratedImage[]) => void;
  setImageEditSelectedImageIndex: (index: number) => void;
  setImageEditParameters: (parameters: Partial<ImageEditParameters>) => void;
  setImageEditLoadingState: (loading: {
    isLoading?: boolean;
    uploadProgress?: boolean;
    processingProgress?: boolean;
    downloadProgress?: boolean;
    error?: string | null;
  }) => void;
  resetImageEdit: () => void;

  // Language Actions
  setLanguage: (language: 'en' | 'ja') => void;

  // Global Actions
  resetAllStates: () => void;
}

export const useAppStore = create<AppStore>((set, _get) => ({
  // Initial State
  vto: defaultVTOState,
  modelGeneration: defaultModelGenerationState,
  backgroundReplacement: defaultBackgroundReplacementState,
  imageEdit: defaultImageEditState,
  language: defaultLanguageState,

  // VTO Actions
  setVTOModelImage: (file, url) =>
    set((state) => ({
      vto: {
        ...state.vto,
        modelImageFile: file,
        modelImage: url,
      },
    })),

  setVTOGarmentImage: (file, url) =>
    set((state) => ({
      vto: {
        ...state.vto,
        garmentImageFile: file,
        garmentImage: url,
      },
    })),

  setVTOMaskImage: (file, url) =>
    set((state) => ({
      vto: {
        ...state.vto,
        maskImageFile: file,
        maskImage: url,
      },
    })),

  setVTOGeneratedImages: (images) =>
    set((state) => ({
      vto: {
        ...state.vto,
        generatedImages: images,
      },
    })),

  setVTOSelectedImageIndex: (index) =>
    set((state) => ({
      vto: {
        ...state.vto,
        selectedImageIndex: index,
      },
    })),

  setVTOParameters: (parameters) =>
    set((state) => ({
      vto: {
        ...state.vto,
        parameters: {
          ...state.vto.parameters,
          ...parameters,
        },
      },
    })),

  setVTOLoadingState: (loading) =>
    set((state) => ({
      vto: {
        ...state.vto,
        ...loading,
      },
    })),

  setVTOAutoClassificationEnabled: (enabled) =>
    set((state) => ({
      vto: {
        ...state.vto,
        autoClassificationEnabled: enabled,
      },
    })),

  setVTOClassificationState: (classificationState) =>
    set((state) => ({
      vto: {
        ...state.vto,
        ...classificationState,
      },
    })),

  resetVTO: () =>
    set((_state) => ({
      vto: defaultVTOState,
    })),

  // Model Generation Actions
  setModelGenerationImages: (images) =>
    set((state) => ({
      modelGeneration: {
        ...state.modelGeneration,
        generatedImages: images,
      },
    })),

  setModelGenerationSelectedImageIndex: (index) =>
    set((state) => ({
      modelGeneration: {
        ...state.modelGeneration,
        selectedImageIndex: index,
      },
    })),

  setModelGenerationParameters: (parameters) =>
    set((state) => ({
      modelGeneration: {
        ...state.modelGeneration,
        parameters: {
          ...state.modelGeneration.parameters,
          ...parameters,
        },
      },
    })),

  setModelGenerationLoadingState: (loading) =>
    set((state) => ({
      modelGeneration: {
        ...state.modelGeneration,
        ...loading,
      },
    })),

  setModelGenerationPromptEnhancement: (enhancement) =>
    set((state) => ({
      modelGeneration: {
        ...state.modelGeneration,
        promptEnhancement: {
          ...state.modelGeneration.promptEnhancement,
          ...enhancement,
        },
      },
    })),

  resetModelGeneration: () =>
    set((_state) => ({
      modelGeneration: defaultModelGenerationState,
    })),

  // Background Replacement Actions
  setBackgroundSourceImage: (file, url) =>
    set((state) => ({
      backgroundReplacement: {
        ...state.backgroundReplacement,
        sourceImageFile: file,
        sourceImage: url,
      },
    })),

  setBackgroundMaskImage: (file, url) =>
    set((state) => ({
      backgroundReplacement: {
        ...state.backgroundReplacement,
        maskImageFile: file,
        maskImage: url,
      },
    })),

  setBackgroundGeneratedImages: (images) =>
    set((state) => ({
      backgroundReplacement: {
        ...state.backgroundReplacement,
        generatedImages: images,
      },
    })),

  setBackgroundSelectedImageIndex: (index) =>
    set((state) => ({
      backgroundReplacement: {
        ...state.backgroundReplacement,
        selectedImageIndex: index,
      },
    })),

  setBackgroundParameters: (parameters) =>
    set((state) => ({
      backgroundReplacement: {
        ...state.backgroundReplacement,
        parameters: {
          ...state.backgroundReplacement.parameters,
          ...parameters,
        },
      },
    })),

  setBackgroundLoadingState: (loading) =>
    set((state) => ({
      backgroundReplacement: {
        ...state.backgroundReplacement,
        ...loading,
      },
    })),

  resetBackgroundReplacement: () =>
    set((_state) => ({
      backgroundReplacement: defaultBackgroundReplacementState,
    })),

  // Image Edit Actions
  setImageEditSourceImage: (file, url) =>
    set((state) => ({
      imageEdit: {
        ...state.imageEdit,
        sourceImageFile: file,
        sourceImage: url,
      },
    })),

  setImageEditSourceImageDimensions: (dimensions) =>
    set((state) => ({
      imageEdit: {
        ...state.imageEdit,
        sourceImageDimensions: dimensions,
      },
    })),

  setImageEditSizeWarning: (warning) =>
    set((state) => ({
      imageEdit: {
        ...state.imageEdit,
        sizeWarning: warning,
      },
    })),

  setImageEditGeneratedImages: (images) =>
    set((state) => ({
      imageEdit: {
        ...state.imageEdit,
        generatedImages: images,
      },
    })),

  setImageEditSelectedImageIndex: (index) =>
    set((state) => ({
      imageEdit: {
        ...state.imageEdit,
        selectedImageIndex: index,
      },
    })),

  setImageEditParameters: (parameters) =>
    set((state) => ({
      imageEdit: {
        ...state.imageEdit,
        parameters: {
          ...state.imageEdit.parameters,
          ...parameters,
        },
      },
    })),

  setImageEditLoadingState: (loading) =>
    set((state) => ({
      imageEdit: {
        ...state.imageEdit,
        ...loading,
      },
    })),

  resetImageEdit: () =>
    set((_state) => ({
      imageEdit: defaultImageEditState,
    })),

  // Language Actions
  setLanguage: (language) =>
    set((state) => {
      localStorage.setItem('language', language);
      i18n.changeLanguage(language);
      return {
        ...state,
        language: {
          currentLanguage: language,
        },
      };
    }),

  // Global Actions
  resetAllStates: () =>
    set(() => ({
      vto: defaultVTOState,
      modelGeneration: defaultModelGenerationState,
      backgroundReplacement: defaultBackgroundReplacementState,
      imageEdit: defaultImageEditState,
    })),
}));
