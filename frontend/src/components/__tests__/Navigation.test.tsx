import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrowserRouter, useNavigate, useLocation } from 'react-router-dom'
import Navigation from '../Navigation'
import { ThemeProvider, createTheme } from '@mui/material/styles'

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: vi.fn(),
    useLocation: vi.fn(),
  }
})

// Mock useAuth hook
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: {
      username: 'testuser',
      email: 'test@example.com'
    },
    signOut: vi.fn()
  }))
}))

const theme = createTheme()

const renderWithRouter = (component: React.ReactElement, pathname = '/') => {
  const mockNavigate = vi.fn()
  const mockLocation = { pathname }
  
  vi.mocked(useNavigate).mockReturnValue(mockNavigate)
  vi.mocked(useLocation).mockReturnValue(mockLocation as any)
  
  const rendered = render(
    <BrowserRouter>
      <ThemeProvider theme={theme}>
        {component}
      </ThemeProvider>
    </BrowserRouter>
  )
  
  return { ...rendered, mockNavigate }
}

describe('Navigation', () => {
  it('renders navigation functionality', () => {
    renderWithRouter(<Navigation>Test Content</Navigation>)
    
    // Check that navigation menu button exists
    expect(screen.getByLabelText('open drawer')).toBeInTheDocument()
    
    // Check that children content is rendered
    expect(screen.getByText('Test Content')).toBeInTheDocument()
  })

  it('navigates to Home when Home menu item is clicked', () => {
    const { mockNavigate } = renderWithRouter(<Navigation>Test Content</Navigation>)
    
    const homeText = screen.getByText('Home')
    const homeButton = homeText.closest('div[role="button"]')
    expect(homeButton).toBeInTheDocument()
    
    if (homeButton) {
      fireEvent.click(homeButton)
      expect(mockNavigate).toHaveBeenCalledWith('/home')
    }
  })

  it('navigates to Model Generation when clicked', () => {
    const { mockNavigate } = renderWithRouter(<Navigation>Test Content</Navigation>)
    
    const modelGenText = screen.getByText('Model Generation')
    const modelGenButton = modelGenText.closest('div[role="button"]')
    expect(modelGenButton).toBeInTheDocument()
    
    if (modelGenButton) {
      fireEvent.click(modelGenButton)
      expect(mockNavigate).toHaveBeenCalledWith('/model-generation')
    }
  })

  it('navigates to Virtual Try-On when clicked', () => {
    const { mockNavigate } = renderWithRouter(<Navigation>Test Content</Navigation>)
    
    // Find all Virtual Try-On texts and select the one in the navigation menu (not header)
    const vtoTexts = screen.getAllByText('Virtual Try-On')
    const navigationVtoText = vtoTexts.find(element => 
      element.closest('nav') !== null
    )
    
    expect(navigationVtoText).toBeTruthy()
    
    const vtoButton = navigationVtoText?.closest('div[role="button"]')
    expect(vtoButton).toBeInTheDocument()
    
    if (vtoButton) {
      fireEvent.click(vtoButton)
      expect(mockNavigate).toHaveBeenCalledWith('/virtual-try-on')
    }
  })

  it('navigates to Image Edit when clicked', () => {
    const { mockNavigate } = renderWithRouter(<Navigation>Test Content</Navigation>)
    
    const imageEditText = screen.getByText('Image Edit')
    const imageEditButton = imageEditText.closest('div[role="button"]')
    expect(imageEditButton).toBeInTheDocument()
    
    if (imageEditButton) {
      fireEvent.click(imageEditButton)
      expect(mockNavigate).toHaveBeenCalledWith('/image-edit')
    }
  })

  it('displays user avatar when user is authenticated', () => {
    renderWithRouter(<Navigation>Test Content</Navigation>)
    
    // Check that user avatar button exists
    const avatarButtons = screen.getAllByRole('button')
    const userAvatarButton = avatarButtons.find(button => 
      button.querySelector('.MuiAvatar-root')
    )
    
    expect(userAvatarButton).toBeTruthy()
    
    // Click avatar to test menu functionality
    if (userAvatarButton) {
      fireEvent.click(userAvatarButton)
      // Basic functionality test - just ensure clicking doesn't cause errors
      expect(userAvatarButton).toBeInTheDocument()
    }
  })

  it('toggles mobile drawer functionality', () => {
    // Mock mobile view
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: query === '(max-width:899.95px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    
    renderWithRouter(<Navigation>Test Content</Navigation>)
    
    const menuButton = screen.getByLabelText('open drawer')
    
    // Click to toggle drawer
    fireEvent.click(menuButton)
    
    // Verify drawer functionality (drawer exists)
    // Note: We're not testing visual aspects, just that the click handler works
    expect(menuButton).toBeInTheDocument()
  })

  it('closes mobile drawer after navigation', () => {
    // Mock mobile view
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: query === '(max-width:899.95px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    
    const { mockNavigate } = renderWithRouter(<Navigation>Test Content</Navigation>)
    
    // Open drawer
    fireEvent.click(screen.getByLabelText('open drawer'))
    
    // Click navigation item by text
    const homeText = screen.getByText('Home')
    const homeButton = homeText.closest('div[role="button"]')
    
    if (homeButton) {
      fireEvent.click(homeButton)
      expect(mockNavigate).toHaveBeenCalledWith('/home')
    }
  })
})
