// VTO Parameters
export interface VTOParameters {
  maskType: string;
  maskPrompt: string;
  garmentClass: string;
  longSleeveStyle: string;
  tuckingStyle: string;
  outerLayerStyle: string;
  maskShape: string;
  maskShapePrompt: string;
  preserveBodyPose: string;
  preserveHands: string;
  preserveFace: string;
  mergeStyle: string;
  returnMask: boolean;
  numberOfImages: number;
  quality: string;
  cfgScale: number;
  seed: number;
}

// Model Generation Parameters
export interface ModelGenerationParameters {
  prompt: string;
  modelId: string;
  cfgScale: number;
  height: number;
  width: number;
  numberOfImages: number;
}

// Background Replacement Parameters
export interface BackgroundReplacementParameters {
  prompt: string;
  maskPrompt: string;
  modelId: string;
  outPaintingMode: 'DEFAULT' | 'PRECISE';
  cfgScale: number;
  numberOfImages: number;
  height: number;
  width: number;
}

// Generated Image Type
export interface GeneratedImage {
  base64?: string;
  error?: boolean;
  errorMessage?: string;
}

// VTO State
export interface VTOState {
  // Images
  modelImageFile: File | null;
  garmentImageFile: File | null;
  maskImageFile: File | null;
  modelImage: string | null;
  garmentImage: string | null;
  maskImage: string | null;
  generatedImages: GeneratedImage[];
  selectedImageIndex: number;
  
  // Parameters
  parameters: VTOParameters;
  
  // Auto classification
  autoClassificationEnabled: boolean;
  isClassifying: boolean;
  classificationError: string | null;
  classificationSuccess: string | null;
  
  // Loading states
  isLoading: boolean;
  uploadProgress: boolean;
  processingProgress: boolean;
  downloadProgress: boolean;
  error: string | null;
}

// Model Generation State
export interface ModelGenerationState {
  // Generated images
  generatedImages: GeneratedImage[];
  selectedImageIndex: number;
  
  // Parameters
  parameters: ModelGenerationParameters;
  
  // Prompt Enhancement
  promptEnhancement: {
    originalPrompt: string;
    enhancedPrompt: string;
    isEnhancing: boolean;
    showEnhanced: boolean;
    error: string | null;
  };
  
  // Loading states
  isLoading: boolean;
  error: string | null;
}

// Background Replacement State
export interface BackgroundReplacementState {
  // Images
  sourceImageFile: File | null;
  maskImageFile: File | null;
  sourceImage: string | null;
  maskImage: string | null;
  generatedImages: GeneratedImage[];
  selectedImageIndex: number;
  
  // Parameters
  parameters: BackgroundReplacementParameters;
  
  // Loading states
  isLoading: boolean;
  uploadProgress: boolean;
  processingProgress: boolean;
  downloadProgress: boolean;
  error: string | null;
}

// Language Settings
export interface LanguageState {
  currentLanguage: 'en' | 'ja';
}

// Main App State
export interface AppState {
  vto: VTOState;
  modelGeneration: ModelGenerationState;
  backgroundReplacement: BackgroundReplacementState;
  language: LanguageState;
}
