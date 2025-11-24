import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import axios from 'axios';
import { fetchAuthSession } from 'aws-amplify/auth';
import { usePromptEnhancement } from '../usePromptEnhancement';

// Mock axios
vi.mock('axios');
const mockAxios = axios as any;

// Mock aws-amplify/auth
vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: vi.fn(),
}));

const mockFetchAuthSession = fetchAuthSession as ReturnType<typeof vi.fn>;

describe('usePromptEnhancement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock environment variable
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() => usePromptEnhancement());

    expect(result.current.isEnhancing).toBe(false);
    expect(result.current.error).toBe(null);
    expect(typeof result.current.enhancePrompt).toBe('function');
  });

  it('should handle successful prompt enhancement', async () => {
    const mockResponse = {
      data: {
        original_prompt: 'test prompt',
        enhanced_prompt: 'enhanced test prompt with more details',
      },
    };
    
    const mockSession = {
      tokens: {
        idToken: {
          toString: () => 'mock-token',
        },
      },
    };

    mockFetchAuthSession.mockResolvedValue(mockSession);
    mockAxios.post.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => usePromptEnhancement());

    let enhancementResult;
    await act(async () => {
      enhancementResult = await result.current.enhancePrompt('test prompt', 'en');
    });

    expect(mockFetchAuthSession).toHaveBeenCalledTimes(1);
    expect(mockAxios.post).toHaveBeenCalledWith(
      'http://localhost:8000/enhance-prompt',
      { prompt: 'test prompt', language: 'en' },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock-token',
        },
      }
    );
    expect(enhancementResult).toEqual(mockResponse.data);
    expect(result.current.isEnhancing).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it('should handle enhancement without auth token', async () => {
    const mockResponse = {
      data: {
        original_prompt: 'test prompt',
        enhanced_prompt: 'enhanced test prompt',
      },
    };

    const mockSession = {
      tokens: null,
    };

    mockFetchAuthSession.mockResolvedValue(mockSession);
    mockAxios.post.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => usePromptEnhancement());

    let enhancementResult;
    await act(async () => {
      enhancementResult = await result.current.enhancePrompt('test prompt');
    });

    expect(mockAxios.post).toHaveBeenCalledWith(
      'http://localhost:8000/enhance-prompt',
      { prompt: 'test prompt', language: 'en' },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    expect(enhancementResult).toEqual(mockResponse.data);
  });

  it('should use default language when not provided', async () => {
    const mockResponse = {
      data: {
        original_prompt: 'test prompt',
        enhanced_prompt: 'enhanced test prompt',
      },
    };

    mockFetchAuthSession.mockResolvedValue({ tokens: null });
    mockAxios.post.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => usePromptEnhancement());

    await act(async () => {
      await result.current.enhancePrompt('test prompt');
    });

    expect(mockAxios.post).toHaveBeenCalledWith(
      'http://localhost:8000/enhance-prompt',
      { prompt: 'test prompt', language: 'en' },
      expect.any(Object)
    );
  });

  it('should handle API error with response data', async () => {
    const mockError = {
      response: {
        data: {
          detail: 'Invalid prompt format',
        },
      },
    };

    mockFetchAuthSession.mockResolvedValue({ tokens: null });
    mockAxios.post.mockRejectedValue(mockError);

    const { result } = renderHook(() => usePromptEnhancement());

    let enhancementResult;
    await act(async () => {
      enhancementResult = await result.current.enhancePrompt('test prompt');
    });

    expect(enhancementResult).toBe(null);
    expect(result.current.isEnhancing).toBe(false);
    expect(result.current.error).toBe('Invalid prompt format');
  });

  it('should handle network error', async () => {
    const mockError = new Error('Network error');

    mockFetchAuthSession.mockResolvedValue({ tokens: null });
    mockAxios.post.mockRejectedValue(mockError);

    const { result } = renderHook(() => usePromptEnhancement());

    let enhancementResult;
    await act(async () => {
      enhancementResult = await result.current.enhancePrompt('test prompt');
    });

    expect(enhancementResult).toBe(null);
    expect(result.current.isEnhancing).toBe(false);
    expect(result.current.error).toBe('Network error');
  });

  it('should handle error without message', async () => {
    const mockError = {};

    mockFetchAuthSession.mockResolvedValue({ tokens: null });
    mockAxios.post.mockRejectedValue(mockError);

    const { result } = renderHook(() => usePromptEnhancement());

    let enhancementResult;
    await act(async () => {
      enhancementResult = await result.current.enhancePrompt('test prompt');
    });

    expect(enhancementResult).toBe(null);
    expect(result.current.isEnhancing).toBe(false);
    expect(result.current.error).toBe('Failed to enhance prompt');
  });

  it('should set isEnhancing to true during enhancement', async () => {
    let resolveEnhancement: (value: any) => void;
    const enhancementPromise = new Promise((resolve) => {
      resolveEnhancement = resolve;
    });

    mockFetchAuthSession.mockResolvedValue({ tokens: null });
    mockAxios.post.mockReturnValue(enhancementPromise);

    const { result } = renderHook(() => usePromptEnhancement());

    // Start enhancement
    act(() => {
      result.current.enhancePrompt('test prompt');
    });

    expect(result.current.isEnhancing).toBe(true);
    expect(result.current.error).toBe(null);

    // Resolve enhancement
    await act(async () => {
      resolveEnhancement({
        data: {
          original_prompt: 'test prompt',
          enhanced_prompt: 'enhanced test prompt',
        },
      });
      await enhancementPromise;
    });

    expect(result.current.isEnhancing).toBe(false);
  });

  it('should handle auth session error', async () => {
    const mockAuthError = new Error('Auth session failed');
    mockFetchAuthSession.mockRejectedValue(mockAuthError);

    const { result } = renderHook(() => usePromptEnhancement());

    let enhancementResult;
    await act(async () => {
      enhancementResult = await result.current.enhancePrompt('test prompt');
    });

    expect(enhancementResult).toBe(null);
    expect(result.current.isEnhancing).toBe(false);
    expect(result.current.error).toBe('Auth session failed');
  });

  it('should use custom API base URL from environment', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://custom-api.example.com');

    const mockResponse = {
      data: {
        original_prompt: 'test prompt',
        enhanced_prompt: 'enhanced test prompt',
      },
    };

    mockFetchAuthSession.mockResolvedValue({ tokens: null });
    mockAxios.post.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => usePromptEnhancement());

    await act(async () => {
      await result.current.enhancePrompt('test prompt');
    });

    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://custom-api.example.com/enhance-prompt',
      expect.any(Object),
      expect.any(Object)
    );
  });
});
