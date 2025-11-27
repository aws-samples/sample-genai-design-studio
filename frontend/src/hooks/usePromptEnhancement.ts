import { useState } from 'react';
import axios from 'axios';
import { fetchAuthSession } from 'aws-amplify/auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(async (config) => {
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (error) {
    console.error('Error getting auth token:', error);
  }
  
  return config;
}, (error) => {
  return Promise.reject(error);
});

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
      const response = await apiClient.post<EnhancePromptResponse>(
        '/enhance-prompt',
        { prompt, language } as EnhancePromptRequest
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
