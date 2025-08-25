import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import Home from '../Home'

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('Home', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  const renderHome = () => {
    return render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    )
  }

  it('renders the main title', () => {
    renderHome()
    
    expect(screen.getByRole('heading', { level: 1, name: 'GenAI Design Studio' })).toBeInTheDocument()
  })

  it('renders Virtual Try-On feature card', () => {
    renderHome()
    
    expect(screen.getByRole('heading', { level: 2, name: 'Virtual Try-On' })).toBeInTheDocument()
    expect(screen.getByText('Create realistic virtual try-on images by combining garment images with model images')).toBeInTheDocument()
  })

  it('renders Model Generation feature card', () => {
    renderHome()
    
    expect(screen.getByRole('heading', { level: 2, name: 'Model Generation' })).toBeInTheDocument()
    expect(screen.getByText('Generate high-quality model images from text prompts to use as the foundation for virtual try-on experiences')).toBeInTheDocument()
  })

  it('renders Background Replacement feature card', () => {
    renderHome()
    
    expect(screen.getByRole('heading', { level: 2, name: 'Background Replacement' })).toBeInTheDocument()
    expect(screen.getByText('Replace backgrounds in model images with text prompts')).toBeInTheDocument()
  })

  it('navigates to Virtual Try-On page when card is clicked', () => {
    renderHome()
    
    const vtoCardHeading = screen.getByRole('heading', { level: 2, name: 'Virtual Try-On' })
    const vtoCard = vtoCardHeading.closest('.MuiCardActionArea-root')
    expect(vtoCard).toBeInTheDocument()
    
    if (vtoCard) {
      fireEvent.click(vtoCard)
    }
    
    expect(mockNavigate).toHaveBeenCalledWith('/virtual-try-on')
  })

  it('navigates to Model Generation page when card is clicked', () => {
    renderHome()
    
    const modelGenCardHeading = screen.getByRole('heading', { level: 2, name: 'Model Generation' })
    const modelGenCard = modelGenCardHeading.closest('.MuiCardActionArea-root')
    expect(modelGenCard).toBeInTheDocument()
    
    if (modelGenCard) {
      fireEvent.click(modelGenCard)
    }
    
    expect(mockNavigate).toHaveBeenCalledWith('/model-generation')
  })

  it('navigates to Background Replacement page when card is clicked', () => {
    renderHome()
    
    const bgReplacementCardHeading = screen.getByRole('heading', { level: 2, name: 'Background Replacement' })
    const bgReplacementCard = bgReplacementCardHeading.closest('.MuiCardActionArea-root')
    expect(bgReplacementCard).toBeInTheDocument()
    
    if (bgReplacementCard) {
      fireEvent.click(bgReplacementCard)
    }
    
    expect(mockNavigate).toHaveBeenCalledWith('/background-replacement')
  })

  it('renders icons for each feature', () => {
    const { container } = renderHome()
    
    // Check for SVG icons
    const icons = container.querySelectorAll('svg')
    expect(icons.length).toBeGreaterThanOrEqual(2)
  })

  it('renders cards in a grid layout', () => {
    const { container } = renderHome()
    
    // Check that all feature cards are rendered
    const cards = container.querySelectorAll('.MuiCard-root')
    expect(cards).toHaveLength(3)
    
    // Check that cards are properly rendered
    expect(cards[0]).toBeInTheDocument()
    expect(cards[1]).toBeInTheDocument()
    
    // Check that they have the same parent container (grid layout)
    const firstCardParent = cards[0].parentElement
    const secondCardParent = cards[1].parentElement
    expect(firstCardParent).toBeTruthy()
    expect(secondCardParent).toBeTruthy()
    expect(firstCardParent).toBe(secondCardParent)
  })
})
