import { useState, useCallback } from 'react';
import { classifyGarment } from './api';

interface GarmentClassificationResult {
  garmentClass: string;
  confidence?: number;
}

interface UseGarmentClassificationReturn {
  classifyGarmentImage: (file: File, groupId?: string, userId?: string) => Promise<GarmentClassificationResult | null>;
  isClassifying: boolean;
  classificationError: string | null;
  clearError: () => void;
}

export const useGarmentClassification = (): UseGarmentClassificationReturn => {
  const [isClassifying, setIsClassifying] = useState(false);
  const [classificationError, setClassificationError] = useState<string | null>(null);

  const classifyGarmentImage = useCallback(async (file: File, groupId?: string, userId?: string): Promise<GarmentClassificationResult | null> => {
    setIsClassifying(true);
    setClassificationError(null);

    try {
      console.log('🔍 Starting garment classification for file:', file.name, 'Size:', file.size, 'Type:', file.type);
      const result = await classifyGarment(file, groupId, userId);
      console.log('✅ Classification API response:', result);
      
      // 新しいレスポンス構造に対応
      if (result && result.classification_result && result.classification_result.success && result.classification_result.result) {
        const classificationData = result.classification_result.result;
        const transformedResult: GarmentClassificationResult = {
          garmentClass: classificationData.category_name,
          confidence: classificationData.confidence
        };
        console.log('✅ Classification successful:', transformedResult);
        return transformedResult;
      } else {
        console.log('❌ Invalid classification response structure');
        return null;
      }
    } catch (error: any) {
      let errorMessage = 'Failed to classify garment';
      
      console.error('❌ Garment classification error details:', {
        error,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        code: error.code
      });
      
      // より詳細なエラーメッセージの抽出
      if (error.response) {
        // HTTP エラーレスポンス
        if (error.response.status === 404) {
          errorMessage = 'Garment classification endpoint not found (404). The /classify-garment API is not yet implemented on the backend.';
        } else if (error.response.status === 405) {
          errorMessage = 'Method not allowed (405). The /classify-garment endpoint may not support POST requests.';
        } else if (error.response.data?.detail) {
          errorMessage = error.response.data.detail;
        } else if (error.response.data?.message) {
          errorMessage = error.response.data.message;
        } else {
          errorMessage = `Server error: ${error.response.status} ${error.response.statusText}`;
        }
      } else if (error.message) {
        // ネットワークエラーやその他のエラー
        if (error.message.includes('CORS')) {
          errorMessage = 'CORS policy error: The backend needs to allow requests from this origin.';
        } else if (error.message.includes('Network Error')) {
          errorMessage = 'Network error: Unable to connect to the classification service.';
        } else {
          errorMessage = `Network error: ${error.message}`;
        }
      }
      
      setClassificationError(errorMessage);
      return null;
    } finally {
      setIsClassifying(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setClassificationError(null);
  }, []);

  return {
    classifyGarmentImage,
    isClassifying,
    classificationError,
    clearError,
  };
};
