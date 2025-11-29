import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../i18n'
import ModelGeneration from '../ModelGeneration'
import * as api from '../../hooks/api'
import { useAppStore } from '../../stores/appStore'

// Mock the auth context
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { username: 'test-user' },
  }),
}))

// Mock the API functions
vi.mock('../../hooks/api', () => ({
  generateObjectNames: vi.fn(),
  getPresignedDownloadUrl: vi.fn(),
  downloadImageFromS3: vi.fn(),
  processNovaModel: vi.fn(),
}))

describe('ModelGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset the store to default state
    useAppStore.getState().resetModelGeneration()
  })

  const renderModelGeneration = () => {
    return render(
      <I18nextProvider i18n={i18n}>
        <ModelGeneration />
      </I18nextProvider>
    )
  }

  it('renders the model selection UI', () => {
    renderModelGeneration()
    
    // Check for model selection heading
    expect(screen.getByText('Model Selection')).toBeInTheDocument()
    
    // Check for Nova Canvas option
    expect(screen.getByText('Nova Canvas (Default)')).toBeInTheDocument()
    expect(screen.getByText('Standard image generation model')).toBeInTheDocument()
    
    // Check for Nova 2 option
    expect(screen.getByText('Nova 2')).toBeInTheDocument()
    expect(screen.getByText('Advanced multimodal model')).toBeInTheDocument()
  })

  it('has Nova Canvas selected by default', () => {
    renderModelGeneration()
    
    // Find the radio buttons
    const radioButtons = screen.getAllByRole('radio')
    expect(radioButtons).toHaveLength(2)
    
    // Nova Canvas should be checked by default
    expect(radioButtons[0]).toBeChecked()
    expect(radioButtons[1]).not.toBeChecked()
  })

  it('allows changing the model selection', () => {
    renderModelGeneration()
    
    // Find the radio buttons
    const radioButtons = screen.getAllByRole('radio')
    
    // Click on Nova 2
    fireEvent.click(radioButtons[1])
    
    // Nova 2 should now be checked
    expect(radioButtons[0]).not.toBeChecked()
    expect(radioButtons[1]).toBeChecked()
  })

  it('sends model_id to API when generating with Nova Canvas', async () => {
    const mockGenerateObjectNames = vi.mocked(api.generateObjectNames)
    const mockProcessNovaModel = vi.mocked(api.processNovaModel)
    
    mockGenerateObjectNames.mockResolvedValue({
      date_folder: '2025-01-15',
      timestamp: '1234567890',
      uid: 'test-uid',
    })
    
    mockProcessNovaModel.mockResolvedValue({
      status: 'accepted',
      object_names: ['test/image.png'],
    })
    
    renderModelGeneration()
    
    // Ensure Nova Canvas is selected (it's the default)
    const radioButtons = screen.getAllByRole('radio')
    expect(radioButtons[0]).toBeChecked()
    
    // Enter a prompt
    const promptInput = screen.getByPlaceholderText(/e.g.,/)
    fireEvent.change(promptInput, { target: { value: 'A beautiful landscape' } })
    
    // Click generate button
    const generateButton = screen.getByRole('button', { name: /Generate/i })
    fireEvent.click(generateButton)
    
    // Wait for API call
    await waitFor(() => {
      expect(mockProcessNovaModel).toHaveBeenCalledWith(
        expect.objectContaining({
          modelId: 'amazon.nova-canvas-v1:0',
          prompt: 'A beautiful landscape',
        })
      )
    })
  })

  it('sends model_id to API when generating with Nova 2', async () => {
    const mockGenerateObjectNames = vi.mocked(api.generateObjectNames)
    const mockProcessNovaModel = vi.mocked(api.processNovaModel)
    
    mockGenerateObjectNames.mockResolvedValue({
      date_folder: '2025-01-15',
      timestamp: '1234567890',
      uid: 'test-uid',
    })
    
    mockProcessNovaModel.mockResolvedValue({
      status: 'accepted',
      object_names: ['test/image.png'],
    })
    
    renderModelGeneration()
    
    // Select Nova 2
    const radioButtons = screen.getAllByRole('radio')
    fireEvent.click(radioButtons[1])
    
    // Enter a prompt
    const promptInput = screen.getByPlaceholderText(/e.g.,/)
    fireEvent.change(promptInput, { target: { value: 'A beautiful landscape' } })
    
    // Click generate button
    const generateButton = screen.getByRole('button', { name: /Generate/i })
    fireEvent.click(generateButton)
    
    // Wait for API call
    await waitFor(() => {
      expect(mockProcessNovaModel).toHaveBeenCalledWith(
        expect.objectContaining({
          modelId: 'nova2',
          prompt: 'A beautiful landscape',
        })
      )
    })
  })

  it('renders the prompt input field', () => {
    renderModelGeneration()
    
    expect(screen.getByText('Text Prompt')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/e.g.,/)).toBeInTheDocument()
  })

  it('renders the generation parameters section', () => {
    renderModelGeneration()
    
    expect(screen.getByText('Generation Parameters')).toBeInTheDocument()
    expect(screen.getAllByText(/Number of Images/).length).toBeGreaterThan(0)
    expect(screen.getByText(/CFG Scale/)).toBeInTheDocument()
  })

  it('disables generate button when prompt is empty', () => {
    renderModelGeneration()
    
    // The button should be disabled when prompt is empty
    const generateButton = screen.getByRole('button', { name: /Generate/i })
    
    // Check if the button has the disabled attribute or aria-disabled
    const isDisabled = generateButton.hasAttribute('disabled') || 
                       generateButton.getAttribute('aria-disabled') === 'true'
    
    expect(isDisabled).toBe(true)
  })

  it('enables generate button when prompt is entered', () => {
    renderModelGeneration()
    
    const promptInput = screen.getByPlaceholderText(/e.g.,/)
    fireEvent.change(promptInput, { target: { value: 'A beautiful landscape' } })
    
    const generateButton = screen.getByRole('button', { name: /Generate/i })
    expect(generateButton).not.toBeDisabled()
  })
})
