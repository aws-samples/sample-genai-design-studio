import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Modal,
  Box,
  IconButton,
  Typography,
  Fade,
  Backdrop,
} from '@mui/material';
import {
  Close as CloseIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  Download as DownloadIcon,
  ContentCopy as CopyIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  FitScreen as FitScreenIcon,
} from '@mui/icons-material';
import { copyImageToClipboard, isClipboardSupported } from '../utils/clipboard';

interface ImageData {
  base64?: string;
  error?: boolean;
  errorMessage?: string;
}

interface ImageModalProps {
  open: boolean;
  onClose: () => void;
  images: ImageData[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  downloadFileName?: string;
}

const ImageModal: React.FC<ImageModalProps> = ({
  open,
  onClose,
  images,
  currentIndex,
  onIndexChange,
  downloadFileName,
}) => {
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const imageRef = useRef<HTMLImageElement>(null);

  const currentImage = images[currentIndex];
  const src = currentImage?.base64 ? `data:image/png;base64,${currentImage.base64}` : undefined;

  // Define callbacks before useEffect to satisfy dependencies
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.5, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.5, 0.5));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  // Reset zoom and position when image changes or modal opens
  useEffect(() => {
    if (open) {
      setZoom(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [open, currentIndex]);

  // Auto-dismiss snackbar message after 3 seconds
  useEffect(() => {
    if (snackbarMessage) {
      const timer = setTimeout(() => {
        setSnackbarMessage('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [snackbarMessage]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          if (currentIndex > 0) {
            onIndexChange(currentIndex - 1);
          }
          break;
        case 'ArrowRight':
          if (currentIndex < images.length - 1) {
            onIndexChange(currentIndex + 1);
          }
          break;
        case '+':
        case '=':
          handleZoomIn();
          break;
        case '-':
          handleZoomOut();
          break;
        case '0':
          handleResetZoom();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, currentIndex, images.length, onClose, onIndexChange, handleZoomIn, handleZoomOut, handleResetZoom]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((prev) => Math.max(0.5, Math.min(5, prev + delta)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  }, [zoom, position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDownload = useCallback(() => {
    if (!src || !downloadFileName) return;
    const link = document.createElement('a');
    link.href = src;
    link.download = downloadFileName;
    link.click();
  }, [src, downloadFileName]);

  const handleCopy = useCallback(async () => {
    if (!currentImage?.base64) return;

    if (!isClipboardSupported()) {
      setSnackbarMessage('Clipboard API is not supported');
      return;
    }

    try {
      const success = await copyImageToClipboard(currentImage.base64);
      setSnackbarMessage(success ? 'Image copied to clipboard' : 'Failed to copy image');
    } catch (error) {
      console.error('Copy error:', error);
      setSnackbarMessage('Failed to copy image');
    }
  }, [currentImage]);

  const handlePrevImage = useCallback(() => {
    if (currentIndex > 0) {
      onIndexChange(currentIndex - 1);
    }
  }, [currentIndex, onIndexChange]);

  const handleNextImage = useCallback(() => {
    if (currentIndex < images.length - 1) {
      onIndexChange(currentIndex + 1);
    }
  }, [currentIndex, images.length, onIndexChange]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeAfterTransition
      slots={{ backdrop: Backdrop }}
      slotProps={{
        backdrop: {
          timeout: 500,
          sx: { backgroundColor: 'rgba(0, 0, 0, 0.9)' },
        },
      }}
    >
      <Fade in={open}>
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            outline: 'none',
          }}
          onClick={onClose}
        >
          {/* Top toolbar */}
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              p: 2,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)',
              zIndex: 1,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Typography variant="h6" sx={{ color: 'white', ml: 1 }}>
              {images.length > 1 ? `${currentIndex + 1} / ${images.length}` : 'Image'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <IconButton onClick={handleCopy} sx={{ color: 'white' }} title="Copy image">
                <CopyIcon />
              </IconButton>
              <IconButton onClick={handleDownload} sx={{ color: 'white' }} title="Download image">
                <DownloadIcon />
              </IconButton>
              <IconButton onClick={onClose} sx={{ color: 'white' }} title="Close (Esc)">
                <CloseIcon />
              </IconButton>
            </Box>
          </Box>

          {/* Bottom toolbar */}
          <Box
            sx={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              p: 2,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 2,
              background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)',
              zIndex: 1,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <IconButton onClick={handleZoomOut} sx={{ color: 'white' }} disabled={zoom <= 0.5} title="Zoom out (-)">
              <ZoomOutIcon />
            </IconButton>
            <Typography variant="body2" sx={{ color: 'white', minWidth: 60, textAlign: 'center' }}>
              {Math.round(zoom * 100)}%
            </Typography>
            <IconButton onClick={handleZoomIn} sx={{ color: 'white' }} disabled={zoom >= 5} title="Zoom in (+)">
              <ZoomInIcon />
            </IconButton>
            <IconButton onClick={handleResetZoom} sx={{ color: 'white' }} title="Fit to screen (0)">
              <FitScreenIcon />
            </IconButton>
          </Box>

          {/* Navigation arrows */}
          {images.length > 1 && (
            <>
              <IconButton
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrevImage();
                }}
                disabled={currentIndex === 0}
                sx={{
                  position: 'absolute',
                  left: 16,
                  color: 'white',
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                  },
                  '&.Mui-disabled': {
                    color: 'rgba(255, 255, 255, 0.3)',
                  },
                }}
                title="Previous image (←)"
              >
                <ChevronLeftIcon fontSize="large" />
              </IconButton>
              <IconButton
                onClick={(e) => {
                  e.stopPropagation();
                  handleNextImage();
                }}
                disabled={currentIndex === images.length - 1}
                sx={{
                  position: 'absolute',
                  right: 16,
                  color: 'white',
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                  },
                  '&.Mui-disabled': {
                    color: 'rgba(255, 255, 255, 0.3)',
                  },
                }}
                title="Next image (→)"
              >
                <ChevronRightIcon fontSize="large" />
              </IconButton>
            </>
          )}

          {/* Image container */}
          <Box
            onClick={(e) => e.stopPropagation()}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            sx={{
              maxWidth: '90%',
              maxHeight: '90%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
              userSelect: 'none',
            }}
          >
            {src && (
              <img
                ref={imageRef}
                src={src}
                alt="Enlarged view"
                style={{
                  maxWidth: zoom === 1 ? '100%' : 'none',
                  maxHeight: zoom === 1 ? '100%' : 'none',
                  transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
                  transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                  objectFit: 'contain',
                }}
                draggable={false}
              />
            )}
          </Box>

          {/* Snackbar message */}
          {snackbarMessage && (
            <Box
              sx={{
                position: 'absolute',
                bottom: 80,
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                color: 'white',
                px: 3,
                py: 1.5,
                borderRadius: 1,
                zIndex: 2,
              }}
            >
              <Typography variant="body2">{snackbarMessage}</Typography>
            </Box>
          )}
        </Box>
      </Fade>
    </Modal>
  );
};

export default ImageModal;
