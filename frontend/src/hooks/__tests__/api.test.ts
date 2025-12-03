import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generateObjectNames,
  fileToBase64,
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
  uploadFileToS3,
  downloadImageFromS3,
  processNovaVTO,
  processNovaModel,
  downloadFromS3,
  classifyGarment
} from '../api'

// Environment variables are loaded from .env.test file automatically by Vitest
// No need to mock import.meta.env as it will use the actual environment variables

// Mock axios module with hoisted functions
const mockApiClient = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  interceptors: {
    request: {
      use: vi.fn()
    }
  }
}))

const mockAxios = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  create: vi.fn(() => mockApiClient),
}))

vi.mock('axios', () => ({
  default: mockAxios,
}))

describe('API hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generateObjectNames', () => {
    it('calls the correct endpoint with params', async () => {
      const mockResponse = {
        data: {
          date_folder: '2024-01-01',
          timestamp: '123456789',
          uid: 'test-uid',
        },
      }
      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await generateObjectNames('seller123', 'item456')

      expect(mockApiClient.get).toHaveBeenCalledWith('/utils/get/objectname', {
        params: {
          group_id: 'seller123',
          user_id: 'item456',
        },
      })
      expect(result).toEqual(mockResponse.data)
    })

    it('throws error when API call fails', async () => {
      const mockError = new Error('API Error')
      mockApiClient.get.mockRejectedValue(mockError)

      await expect(generateObjectNames('seller123', 'item456')).rejects.toThrow('API Error')
    })
  })

  describe('fileToBase64', () => {
    it('converts file to base64 string', async () => {
      const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' })
      const mockBase64 = 'dGVzdCBjb250ZW50'
      
      // Mock FileReader
      const mockFileReader = {
        readAsDataURL: vi.fn(),
        onload: null as any,
        onerror: null as any,
        result: `data:text/plain;base64,${mockBase64}`,
      }
      
      vi.stubGlobal('FileReader', vi.fn(() => mockFileReader))
      
      const promise = fileToBase64(mockFile)
      
      // Simulate successful read
      setTimeout(() => {
        if (mockFileReader.onload) {
          mockFileReader.onload()
        }
      }, 0)
      
      const result = await promise
      expect(result).toBe(mockBase64)
    })

    it('rejects when FileReader fails', async () => {
      const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' })
      const mockError = new Error('Read error')
      
      // Mock FileReader
      const mockFileReader = {
        readAsDataURL: vi.fn(),
        onload: null as any,
        onerror: null as any,
      }
      
      vi.stubGlobal('FileReader', vi.fn(() => mockFileReader))
      
      const promise = fileToBase64(mockFile)
      
      // Simulate error
      setTimeout(() => {
        if (mockFileReader.onerror) {
          mockFileReader.onerror(mockError)
        }
      }, 0)
      
      await expect(promise).rejects.toEqual(mockError)
    })
  })

  describe('getPresignedUploadUrl', () => {
    it('calls the correct endpoint with default expiration', async () => {
      const mockResponse = {
        data: { url: 'https://s3.amazonaws.com/presigned-upload-url' },
      }
      mockApiClient.post.mockResolvedValue(mockResponse)

      const result = await getPresignedUploadUrl('test-object')

      expect(mockApiClient.post).toHaveBeenCalledWith('/utils/s3url/upload', {
        object_name: 'test-object',
        expiration: 900,
      })
      expect(result).toEqual(mockResponse.data)
    })

    it('calls the correct endpoint with custom expiration', async () => {
      const mockResponse = {
        data: { url: 'https://s3.amazonaws.com/presigned-upload-url' },
      }
      mockApiClient.post.mockResolvedValue(mockResponse)

      const result = await getPresignedUploadUrl('test-object', 1800)

      expect(mockApiClient.post).toHaveBeenCalledWith('/utils/s3url/upload', {
        object_name: 'test-object',
        expiration: 1800,
      })
      expect(result).toEqual(mockResponse.data)
    })
  })

  describe('getPresignedDownloadUrl', () => {
    it('calls the correct endpoint', async () => {
      const mockResponse = {
        data: { url: 'https://s3.amazonaws.com/presigned-download-url' },
      }
      mockApiClient.post.mockResolvedValue(mockResponse)

      const result = await getPresignedDownloadUrl('test-object')

      expect(mockApiClient.post).toHaveBeenCalledWith('/utils/s3url/download', {
        object_name: 'test-object',
        expiration: 900,
      })
      expect(result).toEqual(mockResponse.data)
    })
  })

  describe('uploadFileToS3', () => {
    it('uploads file successfully', async () => {
      const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' })
      const mockUrl = 'https://s3.amazonaws.com/presigned-upload-url'
      
      mockAxios.put.mockResolvedValue({ status: 200 })

      const result = await uploadFileToS3(mockFile, mockUrl)

      expect(mockAxios.put).toHaveBeenCalledWith(mockUrl, mockFile, {
        headers: {
          'Content-Type': 'text/plain',
        },
      })
      expect(result).toBe(true)
    })

    it('returns false for non-200 status', async () => {
      const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' })
      const mockUrl = 'https://s3.amazonaws.com/presigned-upload-url'
      
      mockAxios.put.mockResolvedValue({ status: 403 })

      const result = await uploadFileToS3(mockFile, mockUrl)

      expect(result).toBe(false)
    })
  })

  describe('downloadImageFromS3', () => {
    it('downloads and converts image to base64', async () => {
      const mockUrl = 'https://s3.amazonaws.com/presigned-download-url'
      const mockBlob = new Blob(['image data'], { type: 'image/jpeg' })
      const mockBase64 = 'data:image/jpeg;base64,aW1hZ2UgZGF0YQ=='
      
      mockAxios.get.mockResolvedValue({ data: mockBlob })
      
      // Mock FileReader
      const mockFileReader = {
        readAsDataURL: vi.fn(),
        onloadend: null as any,
        onerror: null as any,
        result: mockBase64,
      }
      
      vi.stubGlobal('FileReader', vi.fn(() => mockFileReader))
      
      const promise = downloadImageFromS3(mockUrl)
      
      // Simulate successful read
      setTimeout(() => {
        if (mockFileReader.onloadend) {
          mockFileReader.onloadend()
        }
      }, 0)
      
      const result = await promise
      
      expect(mockAxios.get).toHaveBeenCalledWith(mockUrl, {
        responseType: 'blob',
      })
      expect(result).toBe(mockBase64)
    })
  })

  describe('processNovaVTO', () => {
    it('calls the correct endpoint with all parameters', async () => {
      const mockResponse = {
        data: { status: 'success', object_names: ['output1.jpg'] },
      }
      mockApiClient.post.mockResolvedValue(mockResponse)

      const params = {
        groupId: 'seller123',
        userId: 'item456',
        dateFolder: '2024-01-01',
        timestamp: '123456789',
        uid: 'test-uid',
        objectNames: ['model.jpg', 'garment.jpg'],
        sourceImageObjectName: 'model.jpg',
        referenceImageObjectName: 'garment.jpg',
        maskType: 'GARMENT',
        garmentClass: 'UPPER_BODY',
        numberOfImages: 2,
        quality: 'premium',
        cfgScale: 5.0,
        seed: 42,
      }

      const result = await processNovaVTO(params)

      expect(mockApiClient.post).toHaveBeenCalledWith('/vto/nova/process', {
        group_id: 'seller123',
        user_id: 'item456',
        date_folder: '2024-01-01',
        timestamp: '123456789',
        uid: 'test-uid',
        object_names: ['model.jpg', 'garment.jpg'],
        source_image_object_name: 'model.jpg',
        reference_image_object_name: 'garment.jpg',
        mask_image_object_name: undefined,
        mask_type: 'GARMENT',
        mask_prompt: '',
        garment_class: 'UPPER_BODY',
        long_sleeve_style: undefined,
        tucking_style: undefined,
        outer_layer_style: undefined,
        mask_shape: 'DEFAULT',
        mask_shape_prompt: 'DEFAULT',
        preserve_body_pose: 'DEFAULT',
        preserve_hands: 'DEFAULT',
        preserve_face: 'DEFAULT',
        merge_style: undefined,
        return_mask: false,
        number_of_images: 2,
        quality: 'premium',
        cfg_scale: 5.0,
        seed: 42,
      })
      expect(result).toEqual(mockResponse.data)
    })

    it('uses default values when optional parameters are not provided', async () => {
      const mockResponse = {
        data: { status: 'success' },
      }
      mockApiClient.post.mockResolvedValue(mockResponse)

      const params = {
        groupId: 'seller123',
        userId: 'item456',
        dateFolder: '2024-01-01',
        timestamp: '123456789',
        uid: 'test-uid',
        objectNames: ['model.jpg', 'garment.jpg'],
        sourceImageObjectName: 'model.jpg',
        referenceImageObjectName: 'garment.jpg',
      }

      await processNovaVTO(params)

      const callArgs = mockApiClient.post.mock.calls[0][1]
      expect(callArgs.mask_type).toBe('GARMENT')
      expect(callArgs.garment_class).toBe('UPPER_BODY')
      expect(callArgs.number_of_images).toBe(1)
      expect(callArgs.quality).toBe('standard')
      expect(callArgs.cfg_scale).toBe(6.5)
      expect(callArgs.seed).toBe(-1)
    })
  })

  describe('processNovaModel', () => {
    it('calls the correct endpoint with all parameters', async () => {
      const mockResponse = {
        data: { status: 'success', object_names: ['generated1.jpg'] },
      }
      mockApiClient.post.mockResolvedValue(mockResponse)

      const params = {
        groupId: 'seller123',
        userId: 'item456',
        dateFolder: '2024-01-01',
        timestamp: '123456789',
        uid: 'test-uid',
        objectNames: ['output.jpg'],
        prompt: 'A beautiful landscape',
        modelId: 'amazon.nova-pro-v1:0',
        cfgScale: 10.0,
        height: 512,
        width: 512,
        numberOfImages: 3,
      }

      const result = await processNovaModel(params)

      expect(mockApiClient.post).toHaveBeenCalledWith('/vto/nova/model', {
        group_id: 'seller123',
        user_id: 'item456',
        date_folder: '2024-01-01',
        timestamp: '123456789',
        uid: 'test-uid',
        object_names: ['output.jpg'],
        prompt: 'A beautiful landscape',
        model_id: 'amazon.nova-pro-v1:0',
        cfg_scale: 10.0,
        height: 512,
        width: 512,
        number_of_images: 3,
      })
      expect(result).toEqual(mockResponse.data)
    })

    it('uses default values when optional parameters are not provided', async () => {
      const mockResponse = {
        data: { status: 'success' },
      }
      mockApiClient.post.mockResolvedValue(mockResponse)

      const params = {
        groupId: 'seller123',
        userId: 'item456',
        dateFolder: '2024-01-01',
        timestamp: '123456789',
        uid: 'test-uid',
        objectNames: ['output.jpg'],
        prompt: 'A test prompt',
      }

      await processNovaModel(params)

      const callArgs = mockApiClient.post.mock.calls[0][1]
      expect(callArgs.model_id).toBe('nova2') // Changed default to Nova 2 Omni
      expect(callArgs.cfg_scale).toBe(6.5) // change 8.0 to 6.5
      expect(callArgs.height).toBe(1024)
      expect(callArgs.width).toBe(1024)
      expect(callArgs.number_of_images).toBe(1)
    })
  })

  describe('downloadFromS3', () => {
    it('calls the correct endpoint with bucket name', async () => {
      const mockResponse = {
        data: { content: 'file content' },
      }
      mockApiClient.get.mockResolvedValue(mockResponse)

      const result = await downloadFromS3('test-object.jpg')

      expect(mockApiClient.get).toHaveBeenCalledWith('/utils/get/data', {
        params: {
          object_name: 'test-object.jpg',
          bucket_name: import.meta.env.VITE_VTO_BUCKET || 'vto-app-local',
        },
      })
      expect(result).toEqual(mockResponse.data)
    })
  })

  describe('classifyGarment', () => {
    it('calls the correct endpoint with form data', async () => {
      const mockResponse = {
        data: {
          classification_result: {
            success: true,
            result: {
              category_name: 'UPPER_BODY',
              confidence: 0.95
            }
          }
        }
      }
      mockApiClient.post.mockResolvedValue(mockResponse)

      // Mock FileReader
      const mockBase64 = 'dGVzdA=='
      const mockFileReader = {
        readAsDataURL: vi.fn(),
        onload: null as any,
        onerror: null as any,
        result: `data:image/jpeg;base64,${mockBase64}`,
      }
      
      vi.stubGlobal('FileReader', vi.fn(() => mockFileReader))

      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
      
      const promise = classifyGarment(mockFile)
      
      // Simulate successful FileReader
      setTimeout(() => {
        if (mockFileReader.onload) {
          mockFileReader.onload()
        }
      }, 0)
      
      const result = await promise

      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/vto/classify-garment',
        {
          group_id: 'default_group',
          user_id: 'default_user',
          image_base64: mockBase64
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
      expect(result).toEqual(mockResponse.data)
    })

    it('throws error when API call fails', async () => {
      const mockError = new Error('Classification failed')
      mockApiClient.post.mockRejectedValue(mockError)

      // Mock FileReader
      const mockBase64 = 'dGVzdA=='
      const mockFileReader = {
        readAsDataURL: vi.fn(),
        onload: null as any,
        onerror: null as any,
        result: `data:image/jpeg;base64,${mockBase64}`,
      }
      
      vi.stubGlobal('FileReader', vi.fn(() => mockFileReader))

      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
      
      const promise = classifyGarment(mockFile)
      
      // Simulate successful FileReader
      setTimeout(() => {
        if (mockFileReader.onload) {
          mockFileReader.onload()
        }
      }, 0)

      await expect(promise).rejects.toThrow('Classification failed')
    })
  })
})
