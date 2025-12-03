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

  it('renders the model selection dropdown', () => {
    renderModelGeneration()
    
    // Check for model selection label
    expect(screen.getByLabelText('Model Selection')).toBeInTheDocument()
    
    // The select should be a combobox role
    const selectElement = screen.getByRole('combobox', { name: /Model Selection/i })
    expect(selectElement).toBeInTheDocument()
  })

  it('has Nova 2 Omni selected by default', () => {
    renderModelGeneration()
    
    // Check the store state directly (MUI Select doesn't expose value in test environment)
    const state = useAppStore.getState()
    expect(state.modelGeneration.parameters.modelId).toBe('nova2')
    
    // Verify the select element exists
    const selectElement = screen.getByRole('combobox', { name: /Model Selection/i })
    expect(selectElement).toBeInTheDocument()
  })

  it('allows changing the model selection', async () => {
    renderModelGeneration()
    
    // Get the select element
    const selectElement = screen.getByRole('combobox', { name: /Model Selection/i })
    
    // Change to Nova Canvas
    fireEvent.mouseDown(selectElement)
    
    // Wait for the menu to appear and click on Nova Canvas option
    await waitFor(() => {
      const novaCanvasOption = screen.getByText('Nova Canvas')
      fireEvent.click(novaCanvasOption)
    })
    
    // Check the store state directly (MUI Select doesn't expose value in test environment)
    await waitFor(() => {
      const state = useAppStore.getState()
      expect(state.modelGeneration.parameters.modelId).toBe('amazon.nova-canvas-v1:0')
    })
  })

  it('sends model_id to API when generating with Nova 2 Omni (default)', async () => {
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
    
    // Check the store state directly (MUI Select doesn't expose value in test environment)
    const state = useAppStore.getState()
    expect(state.modelGeneration.parameters.modelId).toBe('nova2')
    
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
    
    // Change to Nova Canvas
    const selectElement = screen.getByRole('combobox', { name: /Model Selection/i })
    fireEvent.mouseDown(selectElement)
    
    await waitFor(() => {
      const novaCanvasOption = screen.getByText('Nova Canvas')
      fireEvent.click(novaCanvasOption)
    })
    
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

  it('renders the prompt input field', () => {
    renderModelGeneration()
    
    expect(screen.getByText('Text Prompt')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/e.g.,/)).toBeInTheDocument()
  })

  it('renders the generation parameters section', async () => {
    renderModelGeneration()
    
    expect(screen.getByText('Generation Parameters')).toBeInTheDocument()
    expect(screen.getAllByText(/Number of Images/).length).toBeGreaterThan(0)
    
    // CFG Scale should NOT be visible for Nova2 (default model)
    expect(screen.queryByText(/CFG Scale/)).not.toBeInTheDocument()
    
    // Change to Nova Canvas to see CFG Scale
    const selectElement = screen.getByRole('combobox', { name: /Model Selection/i })
    fireEvent.mouseDown(selectElement)
    
    await waitFor(() => {
      const novaCanvasOption = screen.getByText('Nova Canvas')
      fireEvent.click(novaCanvasOption)
    })
    
    // Now CFG Scale should be visible
    await waitFor(() => {
      expect(screen.getByText(/CFG Scale/)).toBeInTheDocument()
    })
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
