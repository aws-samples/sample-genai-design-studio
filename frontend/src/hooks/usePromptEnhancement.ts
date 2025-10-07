import { useState } from 'react';
import axios from 'axios';
import { fetchAuthSession } from 'aws-amplify/auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

interface EnhancePromptRequest {
  prompt: string;
  language?: string;
}

interface EnhancePromptResponse {
  original_prompt: string;
  enhanced_prompt: string;
}

export const usePromptEnhancement = () => {
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enhancePrompt = async (prompt: string, language: string = 'en'): Promise<EnhancePromptResponse | null> => {
    setIsEnhancing(true);
    setError(null);

    try {
      // 認証トークンを取得
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      const response = await axios.post<EnhancePromptResponse>(
        `${API_BASE_URL}/enhance-prompt`,
        { prompt, language } as EnhancePromptRequest,
        {
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
          },
        }
      );

      setIsEnhancing(false);
      return response.data;
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to enhance prompt';
      setError(errorMessage);
      setIsEnhancing(false);
      return null;
    }
  };

  return {
    enhancePrompt,
    isEnhancing,
    error,
  };
};
