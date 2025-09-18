import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useGarmentClassification } from '../useGarmentClassification';
import { classifyGarment } from '../api';

// Mock the API function
vi.mock('../api', () => ({
  classifyGarment: vi.fn(),
}));

const mockClassifyGarment = classifyGarment as ReturnType<typeof vi.fn>;

describe('useGarmentClassification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useGarmentClassification());

    expect(result.current.isClassifying).toBe(false);
    expect(result.current.classificationError).toBe(null);
    expect(typeof result.current.classifyGarmentImage).toBe('function');
    expect(typeof result.current.clearError).toBe('function');
  });

  it('should handle successful classification', async () => {
    const mockApiResponse = {
      classification_result: {
        success: true,
        result: {
          category_name: 'UPPER_BODY',
          confidence: 0.95
        }
      }
    };
    mockClassifyGarment.mockResolvedValue(mockApiResponse);

    const { result } = renderHook(() => useGarmentClassification());
    const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

    let classificationResult;
    await act(async () => {
      classificationResult = await result.current.classifyGarmentImage(mockFile);
    });

    expect(mockClassifyGarment).toHaveBeenCalledWith(mockFile, undefined, undefined);
    expect(classificationResult).toEqual({ garmentClass: 'UPPER_BODY', confidence: 0.95 });
    expect(result.current.isClassifying).toBe(false);
    expect(result.current.classificationError).toBe(null);
  });

  it('should handle classification error', async () => {
    const mockError = new Error('Classification failed');
    mockClassifyGarment.mockRejectedValue(mockError);

    const { result } = renderHook(() => useGarmentClassification());
    const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

    let classificationResult;
    await act(async () => {
      classificationResult = await result.current.classifyGarmentImage(mockFile);
    });

    expect(mockClassifyGarment).toHaveBeenCalledWith(mockFile, undefined, undefined);
    expect(classificationResult).toBe(null);
    expect(result.current.isClassifying).toBe(false);
    expect(result.current.classificationError).toBe('Network error: Classification failed');
  });

  it('should handle API error with response data', async () => {
    const mockError = {
      response: {
        data: {
          detail: 'Invalid image format'
        }
      }
    };
    mockClassifyGarment.mockRejectedValue(mockError);

    const { result } = renderHook(() => useGarmentClassification());
    const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

    let classificationResult;
    await act(async () => {
      classificationResult = await result.current.classifyGarmentImage(mockFile);
    });

    expect(classificationResult).toBe(null);
    expect(result.current.classificationError).toBe('Invalid image format');
  });

  it('should clear error', () => {
    const { result } = renderHook(() => useGarmentClassification());

    // Set an error first
    act(() => {
      result.current.clearError();
    });

    expect(result.current.classificationError).toBe(null);
  });

  it('should set isClassifying to true during classification', async () => {
    let resolveClassification: (value: any) => void;
    const classificationPromise = new Promise((resolve) => {
      resolveClassification = resolve;
    });
    mockClassifyGarment.mockReturnValue(classificationPromise);

    const { result } = renderHook(() => useGarmentClassification());
    const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

    // Start classification
    act(() => {
      result.current.classifyGarmentImage(mockFile);
    });

    expect(result.current.isClassifying).toBe(true);

    // Resolve classification
    await act(async () => {
      resolveClassification({
        classification_result: {
          success: true,
          result: {
            category_name: 'UPPER_BODY',
            confidence: 0.95
          }
        }
      });
      await classificationPromise;
    });

    expect(result.current.isClassifying).toBe(false);
  });
});
