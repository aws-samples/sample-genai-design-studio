/**
 * Image utility functions for combining front and back garment images
 */

/**
 * Load an image file and return HTMLImageElement
 */
export const loadImage = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
};

/**
 * Convert canvas to File object
 */
export const canvasToFile = (canvas: HTMLCanvasElement, filename: string = 'combined-garment.png'): Promise<File> => {
  return new Promise<File>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], filename, { type: 'image/png' });
        resolve(file);
      }
    }, 'image/png');
  });
};

/**
 * Combine two images horizontally with black padding for different aspect ratios
 */
export const combineImagesHorizontally = async (
  frontImage: File,
  backImage: File
): Promise<File> => {
  const frontImg = await loadImage(frontImage);
  const backImg = await loadImage(backImage);

  // Determine target size (larger dimensions)
  const targetWidth = Math.max(frontImg.width, backImg.width);
  const targetHeight = Math.max(frontImg.height, backImg.height);

  // Create canvas for horizontal combination
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = targetWidth * 2;
  canvas.height = targetHeight;

  // Fill background with black
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Calculate center positions
  const frontX = (targetWidth - frontImg.width) / 2;
  const frontY = (targetHeight - frontImg.height) / 2;
  const backX = targetWidth + (targetWidth - backImg.width) / 2;
  const backY = (targetHeight - backImg.height) / 2;

  // Draw images centered in their respective areas
  ctx.drawImage(frontImg, frontX, frontY);
  ctx.drawImage(backImg, backX, backY);

  // Clean up object URLs
  URL.revokeObjectURL(frontImg.src);
  URL.revokeObjectURL(backImg.src);

  return await canvasToFile(canvas, 'combined-garment.png');
};
