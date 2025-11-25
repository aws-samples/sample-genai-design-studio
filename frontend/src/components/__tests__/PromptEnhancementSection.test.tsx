import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n';
import PromptEnhancementSection from '../PromptEnhancementSection';
import { usePromptEnhancement } from '../../hooks/usePromptEnhancement';
import { useAppStore } from '../../stores/appStore';

// Mock the hooks
vi.mock('../../hooks/usePromptEnhancement');
vi.mock('../../stores/appStore');

// Mock react-i18next with hoisted function
const mockUseTranslation = vi.hoisted(() => vi.fn());
vi.mock('react-i18next', async () => {
  const actual = await vi.importActual('react-i18next');
  return {
    ...actual,
    useTranslation: mockUseTranslation,
  };
});

const mockUsePromptEnhancement = vi.mocked(usePromptEnhancement);
const mockUseAppStore = vi.mocked(useAppStore);

// Test wrapper component
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <I18nextProvider i18n={i18n}>
    {children}
  </I18nextProvider>
);

describe('PromptEnhancementSection', () => {
  const mockOnPromptChange = vi.fn();
  const mockEnhancePrompt = vi.fn();
  const mockSetModelGenerationPromptEnhancement = vi.fn();

  const defaultPromptEnhancement = {
    isEnhancing: false,
    showEnhanced: false,
    enhancedPrompt: '',
    originalPrompt: '',
    error: null,
  };

  const defaultStoreState = {
    modelGeneration: {
      promptEnhancement: defaultPromptEnhancement,
    },
    setModelGenerationPromptEnhancement: mockSetModelGenerationPromptEnhancement,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default translation mock
    mockUseTranslation.mockReturnValue({
      t: (key: string) => {
        // Return actual English translations for common keys
        const translations: Record<string, string> = {
          'modelGeneration.enhancePrompt': 'Enhance Prompt',
          'modelGeneration.enhancing': 'Enhancing...',
          'modelGeneration.enhancedPrompt': 'Enhanced Prompt',
          'modelGeneration.edit': 'Edit',
          'modelGeneration.save': 'Save',
          'modelGeneration.cancel': 'Cancel',
          'modelGeneration.useOriginal': 'Use Original',
          'modelGeneration.useThis': 'Use This',
          'modelGeneration.retry': 'Retry',
          'modelGeneration.enhancementError': 'Failed to enhance prompt. Please try again.',
        };
        return translations[key] || key;
      },
      i18n: { language: 'en' },
    });
    
    mockUsePromptEnhancement.mockReturnValue({
      enhancePrompt: mockEnhancePrompt,
      isEnhancing: false,
      error: null,
    });

    mockUseAppStore.mockReturnValue(defaultStoreState);
  });

  it('renders enhance button with correct text', () => {
    render(
      <TestWrapper>
        <PromptEnhancementSection
          currentPrompt="test prompt"
          onPromptChange={mockOnPromptChange}
        />
      </TestWrapper>
    );

    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.getByText('Enhance Prompt')).toBeInTheDocument();
  });

  it('disables enhance button when prompt is empty', () => {
    render(
      <TestWrapper>
        <PromptEnhancementSection
          currentPrompt=""
          onPromptChange={mockOnPromptChange}
        />
      </TestWrapper>
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('disables enhance button when prompt is only whitespace', () => {
    render(
      <TestWrapper>
        <PromptEnhancementSection
          currentPrompt="   "
          onPromptChange={mockOnPromptChange}
        />
      </TestWrapper>
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('shows loading state when enhancing', () => {
    mockUseAppStore.mockReturnValue({
      ...defaultStoreState,
      modelGeneration: {
        promptEnhancement: {
          ...defaultPromptEnhancement,
          isEnhancing: true,
        },
      },
    });

    render(
      <TestWrapper>
        <PromptEnhancementSection
          currentPrompt="test prompt"
          onPromptChange={mockOnPromptChange}
        />
      </TestWrapper>
    );

    expect(screen.getByText('Enhancing...')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('calls enhance prompt when button is clicked', async () => {
    mockEnhancePrompt.mockResolvedValue({
      enhanced_prompt: 'enhanced test prompt',
    });

    render(
      <TestWrapper>
        <PromptEnhancementSection
          currentPrompt="test prompt"
          onPromptChange={mockOnPromptChange}
        />
      </TestWrapper>
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(mockSetModelGenerationPromptEnhancement).toHaveBeenCalledWith({
      isEnhancing: true,
      error: null,
      originalPrompt: 'test prompt',
    });

    await waitFor(() => {
      expect(mockEnhancePrompt).toHaveBeenCalledWith('test prompt', 'en');
    });
  });

  it('shows enhanced prompt result', () => {
    mockUseAppStore.mockReturnValue({
      ...defaultStoreState,
      modelGeneration: {
        promptEnhancement: {
          ...defaultPromptEnhancement,
          showEnhanced: true,
          enhancedPrompt: 'This is an enhanced prompt with more details',
        },
      },
    });

    render(
      <TestWrapper>
        <PromptEnhancementSection
          currentPrompt="test prompt"
          onPromptChange={mockOnPromptChange}
        />
      </TestWrapper>
    );

    expect(screen.getByText('Enhanced Prompt')).toBeInTheDocument();
    expect(screen.getByText('This is an enhanced prompt with more details')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Use Original')).toBeInTheDocument();
    expect(screen.getByText('Use This')).toBeInTheDocument();
  });

  it('shows error state', () => {
    mockUseAppStore.mockReturnValue({
      ...defaultStoreState,
      modelGeneration: {
        promptEnhancement: {
          ...defaultPromptEnhancement,
          showEnhanced: true,
          error: 'Enhancement failed',
        },
      },
    });

    render(
      <TestWrapper>
        <PromptEnhancementSection
          currentPrompt="test prompt"
          onPromptChange={mockOnPromptChange}
        />
      </TestWrapper>
    );

    expect(screen.getByText('Enhancement failed')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('handles use enhanced prompt', () => {
    mockUseAppStore.mockReturnValue({
      ...defaultStoreState,
      modelGeneration: {
        promptEnhancement: {
          ...defaultPromptEnhancement,
          showEnhanced: true,
          enhancedPrompt: 'enhanced prompt',
        },
      },
    });

    render(
      <TestWrapper>
        <PromptEnhancementSection
          currentPrompt="test prompt"
          onPromptChange={mockOnPromptChange}
        />
      </TestWrapper>
    );

    const useThisButton = screen.getByText('Use This');
    fireEvent.click(useThisButton);

    expect(mockOnPromptChange).toHaveBeenCalledWith('enhanced prompt');
    expect(mockSetModelGenerationPromptEnhancement).toHaveBeenCalledWith({
      showEnhanced: false,
      originalPrompt: '',
      enhancedPrompt: '',
      error: null,
    });
  });

  it('handles use original prompt', () => {
    mockUseAppStore.mockReturnValue({
      ...defaultStoreState,
      modelGeneration: {
        promptEnhancement: {
          ...defaultPromptEnhancement,
          showEnhanced: true,
          enhancedPrompt: 'enhanced prompt',
        },
      },
    });

    render(
      <TestWrapper>
        <PromptEnhancementSection
          currentPrompt="test prompt"
          onPromptChange={mockOnPromptChange}
        />
      </TestWrapper>
    );

    const useOriginalButton = screen.getByText('Use Original');
    fireEvent.click(useOriginalButton);

    expect(mockSetModelGenerationPromptEnhancement).toHaveBeenCalledWith({
      showEnhanced: false,
      originalPrompt: '',
      enhancedPrompt: '',
      error: null,
    });
  });

  it('handles edit mode', () => {
    mockUseAppStore.mockReturnValue({
      ...defaultStoreState,
      modelGeneration: {
        promptEnhancement: {
          ...defaultPromptEnhancement,
          showEnhanced: true,
          enhancedPrompt: 'enhanced prompt',
        },
      },
    });

    render(
      <TestWrapper>
        <PromptEnhancementSection
          currentPrompt="test prompt"
          onPromptChange={mockOnPromptChange}
        />
      </TestWrapper>
    );

    const editButton = screen.getByText('Edit');
    fireEvent.click(editButton);

    expect(screen.getByDisplayValue('enhanced prompt')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('handles save edit', () => {
    mockUseAppStore.mockReturnValue({
      ...defaultStoreState,
      modelGeneration: {
        promptEnhancement: {
          ...defaultPromptEnhancement,
          showEnhanced: true,
          enhancedPrompt: 'enhanced prompt',
        },
      },
    });

    render(
      <TestWrapper>
        <PromptEnhancementSection
          currentPrompt="test prompt"
          onPromptChange={mockOnPromptChange}
        />
      </TestWrapper>
    );

    // Enter edit mode
    const editButton = screen.getByText('Edit');
    fireEvent.click(editButton);

    // Modify the text
    const textField = screen.getByDisplayValue('enhanced prompt');
    fireEvent.change(textField, { target: { value: 'modified enhanced prompt' } });

    // Save changes
    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);

    expect(mockSetModelGenerationPromptEnhancement).toHaveBeenCalledWith({
      enhancedPrompt: 'modified enhanced prompt',
    });
  });

  it('handles cancel edit', () => {
    mockUseAppStore.mockReturnValue({
      ...defaultStoreState,
      modelGeneration: {
        promptEnhancement: {
          ...defaultPromptEnhancement,
          showEnhanced: true,
          enhancedPrompt: 'enhanced prompt',
        },
      },
    });

    render(
      <TestWrapper>
        <PromptEnhancementSection
          currentPrompt="test prompt"
          onPromptChange={mockOnPromptChange}
        />
      </TestWrapper>
    );

    // Enter edit mode
    const editButton = screen.getByText('Edit');
    fireEvent.click(editButton);

    // Cancel edit
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    // Should return to view mode
    expect(screen.getByText('enhanced prompt')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('handles retry on error', async () => {
    mockUseAppStore.mockReturnValue({
      ...defaultStoreState,
      modelGeneration: {
        promptEnhancement: {
          ...defaultPromptEnhancement,
          showEnhanced: true,
          error: 'Enhancement failed',
        },
      },
    });

    render(
      <TestWrapper>
        <PromptEnhancementSection
          currentPrompt="test prompt"
          onPromptChange={mockOnPromptChange}
        />
      </TestWrapper>
    );

    const retryButton = screen.getByText('Retry');
    fireEvent.click(retryButton);

    expect(mockSetModelGenerationPromptEnhancement).toHaveBeenCalledWith({
      isEnhancing: true,
      error: null,
      originalPrompt: 'test prompt',
    });
  });

  it('uses Japanese language when i18n is set to ja', async () => {
    // Mock Japanese translation
    mockUseTranslation.mockReturnValue({
      t: (key: string) => {
        const translations: Record<string, string> = {
          'modelGeneration.enhancePrompt': 'プロンプトを改善',
          'modelGeneration.enhancing': '改善中...',
          'modelGeneration.enhancedPrompt': '改善されたプロンプト',
          'modelGeneration.edit': '編集',
          'modelGeneration.save': '保存',
          'modelGeneration.cancel': 'キャンセル',
          'modelGeneration.useOriginal': '元のプロンプトを使用',
          'modelGeneration.useThis': 'これを使用',
          'modelGeneration.retry': '再試行',
          'modelGeneration.enhancementError': 'プロンプトの改善に失敗しました。もう一度お試しください。',
        };
        return translations[key] || key;
      },
      i18n: { language: 'ja' },
    });

    mockEnhancePrompt.mockResolvedValue({
      enhanced_prompt: 'enhanced test prompt',
    });

    render(
      <TestWrapper>
        <PromptEnhancementSection
          currentPrompt="test prompt"
          onPromptChange={mockOnPromptChange}
        />
      </TestWrapper>
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockEnhancePrompt).toHaveBeenCalledWith('test prompt', 'ja');
    });
  });

  it('handles enhancement success', async () => {
    mockEnhancePrompt.mockResolvedValue({
      enhanced_prompt: 'enhanced test prompt',
    });

    render(
      <TestWrapper>
        <PromptEnhancementSection
          currentPrompt="test prompt"
          onPromptChange={mockOnPromptChange}
        />
      </TestWrapper>
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockSetModelGenerationPromptEnhancement).toHaveBeenCalledWith({
        isEnhancing: false,
        showEnhanced: true,
        enhancedPrompt: 'enhanced test prompt',
      });
    });
  });

  it('handles enhancement failure', async () => {
    mockEnhancePrompt.mockResolvedValue(null);

    render(
      <TestWrapper>
        <PromptEnhancementSection
          currentPrompt="test prompt"
          onPromptChange={mockOnPromptChange}
        />
      </TestWrapper>
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockSetModelGenerationPromptEnhancement).toHaveBeenCalledWith({
        isEnhancing: false,
        showEnhanced: true,
        error: 'Failed to enhance prompt. Please try again.',
      });
    });
  });
});
