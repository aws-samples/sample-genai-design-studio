import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { usePromptEnhancement } from '../usePromptEnhancement';

// Mock axios module with hoisted functions
const mockApiClient = vi.hoisted(() => ({
  post: vi.fn(),
  interceptors: {
    request: {
      use: vi.fn()
    }
  }
}))

const mockAxios = vi.hoisted(() => ({
  create: vi.fn(() => mockApiClient),
}))

vi.mock('axios', () => ({
  default: mockAxios,
}))

// Mock aws-amplify/auth
const mockFetchAuthSession = vi.fn();
vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: mockFetchAuthSession,
}))

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
    mockApiClient.post.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => usePromptEnhancement());

    let enhancementResult;
    await act(async () => {
      enhancementResult = await result.current.enhancePrompt('test prompt', 'en');
    });

    expect(mockFetchAuthSession).toHaveBeenCalledTimes(1);
    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/enhance-prompt',
      { prompt: 'test prompt', language: 'en' }
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
    mockApiClient.post.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => usePromptEnhancement());

    let enhancementResult;
    await act(async () => {
      enhancementResult = await result.current.enhancePrompt('test prompt');
    });

    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/enhance-prompt',
      { prompt: 'test prompt', language: 'en' }
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
    mockApiClient.post.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => usePromptEnhancement());

    await act(async () => {
      await result.current.enhancePrompt('test prompt');
    });

    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/enhance-prompt',
      { prompt: 'test prompt', language: 'en' }
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
    mockApiClient.post.mockRejectedValue(mockError);

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
    mockApiClient.post.mockRejectedValue(mockError);

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
    mockApiClient.post.mockRejectedValue(mockError);

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
    mockApiClient.post.mockReturnValue(enhancementPromise);

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
    mockApiClient.post.mockResolvedValue({
      data: {
        original_prompt: 'test prompt',
        enhanced_prompt: 'enhanced test prompt',
      },
    });

    const { result } = renderHook(() => usePromptEnhancement());

    let enhancementResult;
    await act(async () => {
      enhancementResult = await result.current.enhancePrompt('test prompt');
    });

    expect(enhancementResult).toBe(null);
    expect(result.current.isEnhancing).toBe(false);
    expect(result.current.error).toBe('Auth session failed');
    expect(mockApiClient.post).not.toHaveBeenCalled();
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
    mockApiClient.post.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => usePromptEnhancement());

    await act(async () => {
      await result.current.enhancePrompt('test prompt');
    });

    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/enhance-prompt',
      { prompt: 'test prompt', language: 'en' }
    );
  });
});
