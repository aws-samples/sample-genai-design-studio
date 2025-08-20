import { vi } from 'vitest';

export interface BrowserMockConfig {
  imageWidth?: number;
  imageHeight?: number;
  fileReaderResult?: string;
  imageData?: Uint8ClampedArray;
  shouldImageLoadFail?: boolean;
  shouldFileReaderFail?: boolean;
}

export function setupBrowserMocks(config?: BrowserMockConfig) {
  const {
    imageWidth = 1024,
    imageHeight = 768,
    fileReaderResult = 'data:image/png;base64,test',
    imageData = new Uint8ClampedArray([255, 255, 255, 255]),
    shouldImageLoadFail = false,
    shouldFileReaderFail = false
  } = config || {};

  // Mock Image constructor
  vi.stubGlobal('Image', vi.fn().mockImplementation(() => ({
    onload: null,
    onerror: null,
    width: imageWidth,
    height: imageHeight,
    set src(value: string) {
      setTimeout(() => {
        if (shouldImageLoadFail) {
          if (this.onerror) this.onerror();
        } else {
          if (this.onload) this.onload();
        }
      }, 0);
    }
  })));

  // Mock FileReader constructor
  vi.stubGlobal('FileReader', vi.fn().mockImplementation(() => ({
    onload: null,
    onerror: null,
    readAsDataURL() {
      setTimeout(() => {
        if (shouldFileReaderFail) {
          if (this.onerror) this.onerror();
        } else {
          if (this.onload) {
            this.onload({ target: { result: fileReaderResult } });
          }
        }
      }, 0);
    }
  })));

  // Mock document.createElement for canvas
  const originalDocument = globalThis.document;
  vi.stubGlobal('document', {
    ...originalDocument,
    createElement: vi.fn((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: vi.fn(() => ({
            drawImage: vi.fn(),
            getImageData: vi.fn(() => ({ data: imageData }))
          }))
        };
      }
      return originalDocument?.createElement?.(tagName) || {};
    })
  });
}

// Convenience functions for common test scenarios
export const setupValidImageMocks = () => setupBrowserMocks({
  imageWidth: 1024,
  imageHeight: 768
});

export const setupInvalidSizeMocks = () => setupBrowserMocks({
  imageWidth: 200,
  imageHeight: 200
});

export const setupLargeSizeMocks = () => setupBrowserMocks({
  imageWidth: 5000,
  imageHeight: 3000
});

export const setupHighPixelCountMocks = () => setupBrowserMocks({
  imageWidth: 3000,
  imageHeight: 1500
});

export const setupInvalidAspectRatioMocks = () => setupBrowserMocks({
  imageWidth: 2000,
  imageHeight: 400
});

export const setupSemiTransparentPNGMocks = () => setupBrowserMocks({
  imageData: new Uint8ClampedArray([
    255, 255, 255, 255, // Fully opaque white pixel
    255, 0, 0, 128,     // Semi-transparent red pixel (alpha = 128)
    0, 0, 0, 0          // Fully transparent black pixel
  ]),
  fileReaderResult: 'data:image/png;base64,test'
});

export const setupSemiTransparentWebPMocks = () => setupBrowserMocks({
  imageData: new Uint8ClampedArray([
    255, 255, 255, 200, // Semi-transparent white pixel (alpha = 200)
    0, 0, 0, 0          // Fully transparent black pixel
  ]),
  fileReaderResult: 'data:image/webp;base64,test'
});

export const setupOpaqueImageMocks = () => setupBrowserMocks({
  imageData: new Uint8ClampedArray([
    255, 255, 255, 255, // Fully opaque white pixel
    0, 0, 0, 0,         // Fully transparent black pixel
    255, 0, 0, 255      // Fully opaque red pixel
  ])
});