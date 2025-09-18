// Image upload related types
export interface ImageUploadProps {
  label: string;
  onImageUpload: (file: File) => void;
  uploadedImage: string | null;
  height?: number;
  allowMask?: boolean;
  isMaskImage?: boolean;
}

// VTO (Virtual Try-On) related types
export interface VTOState {
  modelImageFile: File | null;
  garmentImageFile: File | null;
  modelImage: string | null;
  garmentImage: string | null;
  generatedImages: string[];
  isLoading: boolean;
  uploadProgress: boolean;
  processingProgress: boolean;
  downloadProgress: boolean;
  error: string | null;
  // Auto classification properties
  autoClassificationEnabled: boolean;
  isClassifying: boolean;
  classificationError: string | null;
  classificationSuccess: string | null;
}

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

// Nova Model generation related types
export interface NovaModelState {
  generatedImages: string[];
  prompt: string;
  modelId: string;
  cfgScale: number;
  height: number;
  width: number;
  numberOfImages: number;
  isLoading: boolean;
  error: string | null;
}

// API response types
export interface ObjectNamesResponse {
  date_folder: string;
  timestamp: string;
  uid: string;
}

export interface PresignedUrlResponse {
  url: string;
}

export interface ProcessResponse {
  status: string;
  object_names?: string[];
}
