/**
 * Clipboard utilities for image copy/paste functionality
 */

export interface ClipboardUtils {
  copyImageToClipboard: (base64Data: string) => Promise<boolean>;
  pasteImageFromClipboard: () => Promise<File | null>;
  isClipboardSupported: () => boolean;
}

/**
 * Check if Clipboard API is supported in the current browser
 */
export const isClipboardSupported = (): boolean => {
  return (
    typeof navigator !== 'undefined' &&
    'clipboard' in navigator &&
    typeof navigator.clipboard.write === 'function' &&
    typeof navigator.clipboard.read === 'function'
  );
};

/**
 * Convert base64 string to Blob
 */
const base64ToBlob = (base64Data: string, mimeType: string = 'image/png'): Blob => {
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
};

/**
 * Copy image to clipboard
 * @param base64Data - Base64 encoded image data (without data:image/png;base64, prefix)
 * @returns Promise<boolean> - Success status
 */
export const copyImageToClipboard = async (base64Data: string): Promise<boolean> => {
  if (!isClipboardSupported()) {
    console.warn('Clipboard API is not supported in this browser');
    return false;
  }

  try {
    // Convert base64 to blob
    const blob = base64ToBlob(base64Data, 'image/png');
    
    // Create ClipboardItem
    const clipboardItem = new ClipboardItem({
      'image/png': blob
    });
    
    // Write to clipboard
    await navigator.clipboard.write([clipboardItem]);
    return true;
  } catch (error) {
    console.error('Failed to copy image to clipboard:', error);
    return false;
  }
};

/**
 * Paste image from clipboard
 * @returns Promise<File | null> - File object or null if no image found
 */
export const pasteImageFromClipboard = async (): Promise<File | null> => {
  if (!isClipboardSupported()) {
    console.warn('Clipboard API is not supported in this browser');
    return null;
  }

  try {
    // Read from clipboard
    const clipboardItems = await navigator.clipboard.read();
    
    for (const clipboardItem of clipboardItems) {
      // Look for image types
      const imageTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
      
      for (const imageType of imageTypes) {
        if (clipboardItem.types.includes(imageType)) {
          const blob = await clipboardItem.getType(imageType);
          
          // Convert blob to File
          const file = new File([blob], `pasted-image.${imageType.split('/')[1]}`, {
            type: imageType,
            lastModified: Date.now()
          });
          
          return file;
        }
      }
    }
    
    // No image found in clipboard
    return null;
  } catch (error) {
    console.error('Failed to paste image from clipboard:', error);
    return null;
  }
};

/**
 * Check if clipboard contains image data
 * @returns Promise<boolean> - True if clipboard contains image data
 */
export const hasImageInClipboard = async (): Promise<boolean> => {
  if (!isClipboardSupported()) {
    return false;
  }

  try {
    const clipboardItems = await navigator.clipboard.read();
    const imageTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    
    for (const clipboardItem of clipboardItems) {
      if (imageTypes.some(type => clipboardItem.types.includes(type))) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Failed to check clipboard content:', error);
    return false;
  }
};

export const clipboardUtils: ClipboardUtils = {
  copyImageToClipboard,
  pasteImageFromClipboard,
  isClipboardSupported,
};
