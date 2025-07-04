import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import ImageUpload from '../ImageUpload'

// Mock react-dropzone
vi.mock('react-dropzone', () => ({
  useDropzone: vi.fn((options) => {
    const mockGetRootProps = () => ({
      onClick: vi.fn(),
      onDrop: options?.onDrop,
    })
    const mockGetInputProps = () => ({
      type: 'file',
      accept: options?.accept,
    })
    
    return {
      getRootProps: mockGetRootProps,
      getInputProps: mockGetInputProps,
      isDragActive: false,
      open: vi.fn(),
      acceptedFiles: [],
      fileRejections: [],
      rootRef: { current: null },
      inputRef: { current: null },
      isFocused: false,
      isDragAccept: false,
      isDragReject: false,
      isFileDialogActive: false,
      draggedFiles: [],
    }
  }),
}))

describe('ImageUpload', () => {
  const mockOnImageUpload = vi.fn()
  
  beforeEach(() => {
    mockOnImageUpload.mockClear()
  })

  it('renders with label', () => {
    render(
      <ImageUpload 
        label="Test Image" 
        onImageUpload={mockOnImageUpload}
        uploadedImage={null}
      />
    )
    
    expect(screen.getByText('Test Image')).toBeInTheDocument()
  })

  it('shows upload prompt when no image is uploaded', () => {
    render(
      <ImageUpload 
        label="Test Image" 
        onImageUpload={mockOnImageUpload}
        uploadedImage={null}
      />
    )
    
    expect(screen.getByText('Test Imageをアップロード')).toBeInTheDocument()
    expect(screen.getByText('Image: JPEG, PNG, WebP / lower than 4.2M Pixel')).toBeInTheDocument()
  })

  it('shows mask editable text when allowMask is true', () => {
    render(
      <ImageUpload 
        label="Test Image" 
        onImageUpload={mockOnImageUpload}
        uploadedImage={null}
        allowMask={true}
      />
    )
    
    expect(screen.getByText('(mask editable)')).toBeInTheDocument()
  })

  it('does not show mask editable text when allowMask is false', () => {
    render(
      <ImageUpload 
        label="Test Image" 
        onImageUpload={mockOnImageUpload}
        uploadedImage={null}
        allowMask={false}
      />
    )
    
    expect(screen.queryByText('(mask editable)')).not.toBeInTheDocument()
  })

  it('displays uploaded image when provided', () => {
    const testImageUrl = 'https://example.com/test-image.jpg'
    
    const { container } = render(
      <ImageUpload 
        label="Test Image" 
        onImageUpload={mockOnImageUpload}
        uploadedImage={testImageUrl}
      />
    )
    
    const paper = container.querySelector('.MuiPaper-root')
    expect(paper).toHaveStyle({
      backgroundImage: `url(${testImageUrl})`
    })
    
    // Upload prompt should not be visible when image is uploaded
    expect(screen.queryByText('Test Imageをアップロード')).not.toBeInTheDocument()
  })

  it('uses custom height when provided', () => {
    const customHeight = 300
    
    const { container } = render(
      <ImageUpload 
        label="Test Image" 
        onImageUpload={mockOnImageUpload}
        uploadedImage={null}
        height={customHeight}
      />
    )
    
    const paper = container.querySelector('.MuiPaper-root')
    expect(paper).toHaveStyle({
      height: `${customHeight}px`
    })
  })

  it('uses default height when not provided', () => {
    const { container } = render(
      <ImageUpload 
        label="Test Image" 
        onImageUpload={mockOnImageUpload}
        uploadedImage={null}
      />
    )
    
    const paper = container.querySelector('.MuiPaper-root')
    expect(paper).toHaveStyle({
      height: '512px'
    })
  })

  it('calls onImageUpload when file is dropped', async () => {
    // Mock Image constructor for resolution validation
    const mockImage = {
      onload: null as any,
      onerror: null as any,
      width: 100,
      height: 100,
      _src: '',
      addEventListener: function(this: any, event: string) {
        if (event === 'load' && this.onload) {
          setTimeout(() => this.onload(), 0)
        }
      },
      removeEventListener: vi.fn(),
    }
    
    Object.defineProperty(mockImage, 'src', {
      get() {
        return this._src
      },
      set(value: string) {
        this._src = value
        if (this.onload) {
          setTimeout(() => this.onload(), 0)
        }
      }
    })
    
    ;(window as any).Image = vi.fn().mockImplementation(() => mockImage)

    // Re-mock useDropzone to simulate file drop
    const { useDropzone } = await import('react-dropzone')
    vi.mocked(useDropzone).mockImplementation((options) => {
      // Simulate dropping a file
      setTimeout(() => {
        const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
        if (options?.onDrop) {
          options.onDrop([mockFile], [], {} as any)
        }
      }, 100)
      
      return {
        getRootProps: <T extends any = any>() => ({} as T),
        getInputProps: <T extends any = any>() => ({} as T),
        isDragActive: false,
        open: vi.fn(),
        acceptedFiles: [],
        fileRejections: [],
        rootRef: { current: null as any },
        inputRef: { current: null as any },
        isFocused: false,
        isDragAccept: false,
        isDragReject: false,
        isFileDialogActive: false,
        draggedFiles: [],
      } as any
    })
    
    render(
      <ImageUpload 
        label="Test Image" 
        onImageUpload={mockOnImageUpload}
        uploadedImage={null}
      />
    )
    
    await waitFor(() => {
      expect(mockOnImageUpload).toHaveBeenCalledTimes(1)
      expect(mockOnImageUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test.jpg',
          type: 'image/jpeg'
        })
      )
    }, { timeout: 2000 })
  })

  it('shows drag active state', async () => {
    // Re-mock useDropzone to simulate drag active
    const { useDropzone } = await import('react-dropzone')
    vi.mocked(useDropzone).mockImplementation(() => ({
      getRootProps: <T extends any = any>() => ({} as T),
      getInputProps: <T extends any = any>() => ({} as T),
      isDragActive: true,
      open: vi.fn(),
      acceptedFiles: [],
      fileRejections: [],
      rootRef: { current: null as any },
      inputRef: { current: null as any },
      isFocused: false,
      isDragAccept: false,
      isDragReject: false,
      isFileDialogActive: false,
      draggedFiles: [],
    } as any))
    
    render(
      <ImageUpload 
        label="Test Image" 
        onImageUpload={mockOnImageUpload}
        uploadedImage={null}
      />
    )
    
    expect(screen.getByText('画像をここにドロップ')).toBeInTheDocument()
  })

  it('accepts only image files', async () => {
    let capturedAccept: any
    
    const { useDropzone } = await import('react-dropzone')
    vi.mocked(useDropzone).mockImplementation((options) => {
      capturedAccept = options?.accept
      return {
        getRootProps: <T extends any = any>() => ({} as T),
        getInputProps: <T extends any = any>() => ({} as T),
        isDragActive: false,
        open: vi.fn(),
        acceptedFiles: [],
        fileRejections: [],
        rootRef: { current: null as any },
        inputRef: { current: null as any },
        isFocused: false,
        isDragAccept: false,
        isDragReject: false,
        isFileDialogActive: false,
        draggedFiles: [],
      } as any
    })
    
    render(
      <ImageUpload 
        label="Test Image" 
        onImageUpload={mockOnImageUpload}
        uploadedImage={null}
      />
    )
    
    expect(capturedAccept).toEqual({
      'image/jpeg': ['.jpeg', '.jpg'],
      'image/png': ['.png'],
      'image/webp': ['.webp']
    })
  })
})
