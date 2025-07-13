import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Box,
  Paper,
  Button,
  ButtonGroup,
  Slider,
  Typography,
  Stack,
  IconButton,
  Tooltip,
} from '@mui/material';
import BrushIcon from '@mui/icons-material/Brush';
import EraseIcon from '@mui/icons-material/Clear';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import SaveIcon from '@mui/icons-material/Save';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';

interface ImagePaintEditorProps {
  imageUrl: string;
  onSave: (file: File) => void;
  onSaveMask?: (file: File) => void;
  height?: number;
  width?: number;
}

interface DrawingState {
  imageData: ImageData;
}

const ImagePaintEditor: React.FC<ImagePaintEditorProps> = ({
  imageUrl,
  onSaveMask,
  height = 600,
  width = 500,
}) => {
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const paintCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(25);
  const [brushColor] = useState('#000000');
  const [tool, setTool] = useState<'brush' | 'eraser'>('brush');
  const [history, setHistory] = useState<DrawingState[]>([]);
  const [historyStep, setHistoryStep] = useState(-1);

  // Store original image dimensions
  const [originalImageSize, setOriginalImageSize] = useState<{width: number; height: number}>({width: 0, height: 0});
  const [imagePosition, setImagePosition] = useState<{x: number; y: number; scale: number}>({x: 0, y: 0, scale: 1});

  // Load image onto base canvas
  useEffect(() => {
    const baseCanvas = baseCanvasRef.current;
    const paintCanvas = paintCanvasRef.current;
    if (!baseCanvas || !paintCanvas) return;

    const baseCtx = baseCanvas.getContext('2d');
    const paintCtx = paintCanvas.getContext('2d');
    if (!baseCtx || !paintCtx) return;

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      // Store original image dimensions
      setOriginalImageSize({
        width: image.width,
        height: image.height
      });
      
      // Clear base canvas
      baseCtx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
      
      // Calculate scaling to fit image while maintaining aspect ratio
      const scale = Math.min(baseCanvas.width / image.width, baseCanvas.height / image.height);
      const x = (baseCanvas.width - image.width * scale) / 2;
      const y = (baseCanvas.height - image.height * scale) / 2;
      
      // Store image position and scale for mask creation
      setImagePosition({x, y, scale});
      
      // Draw image on base canvas
      baseCtx.drawImage(image, x, y, image.width * scale, image.height * scale);
      
      // Clear paint canvas
      paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
      
      // Save initial state
      saveToHistory();
    };
    image.src = imageUrl;
  }, [imageUrl]);

  const saveToHistory = useCallback(() => {
    const paintCanvas = paintCanvasRef.current;
    if (!paintCanvas) return;

    const paintCtx = paintCanvas.getContext('2d');
    if (!paintCtx) return;

    const imageData = paintCtx.getImageData(0, 0, paintCanvas.width, paintCanvas.height);
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push({ imageData });
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  }, [history, historyStep]);

  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const paintCanvas = paintCanvasRef.current;
    if (!paintCanvas) return { x: 0, y: 0 };

    const rect = paintCanvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const pos = getMousePos(e);
    
    const paintCanvas = paintCanvasRef.current;
    if (!paintCanvas) return;

    const paintCtx = paintCanvas.getContext('2d');
    if (!paintCtx) return;

    paintCtx.beginPath();
    paintCtx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const paintCanvas = paintCanvasRef.current;
    if (!paintCanvas) return;

    const paintCtx = paintCanvas.getContext('2d');
    if (!paintCtx) return;

    const pos = getMousePos(e);

    paintCtx.lineWidth = brushSize;
    paintCtx.lineCap = 'round';
    paintCtx.lineJoin = 'round';

    if (tool === 'brush') {
      paintCtx.globalCompositeOperation = 'source-over';
      paintCtx.strokeStyle = brushColor;
    } else {
      // Eraser only affects the paint layer, not the base image
      paintCtx.globalCompositeOperation = 'destination-out';
    }

    paintCtx.lineTo(pos.x, pos.y);
    paintCtx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      saveToHistory();
    }
  };

  const undo = () => {
    if (historyStep > 0) {
      const paintCanvas = paintCanvasRef.current;
      if (!paintCanvas) return;

      const paintCtx = paintCanvas.getContext('2d');
      if (!paintCtx) return;

      const prevState = history[historyStep - 1];
      paintCtx.putImageData(prevState.imageData, 0, 0);
      setHistoryStep(historyStep - 1);
    }
  };

  const redo = () => {
    if (historyStep < history.length - 1) {
      const paintCanvas = paintCanvasRef.current;
      if (!paintCanvas) return;

      const paintCtx = paintCanvas.getContext('2d');
      if (!paintCtx) return;

      const nextState = history[historyStep + 1];
      paintCtx.putImageData(nextState.imageData, 0, 0);
      setHistoryStep(historyStep + 1);
    }
  };

  const clearCanvas = () => {
    const paintCanvas = paintCanvasRef.current;
    if (!paintCanvas) return;

    const paintCtx = paintCanvas.getContext('2d');
    if (!paintCtx) return;

    // Clear only the paint layer
    paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
    saveToHistory();
  };


  const saveMask = () => {
    const paintCanvas = paintCanvasRef.current;
    const baseCanvas = baseCanvasRef.current;
    if (!paintCanvas || !onSaveMask || !baseCanvas) return;

    // Create a mask canvas with original image dimensions
    // This ensures the mask matches the source image size exactly
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = originalImageSize.width;
    maskCanvas.height = originalImageSize.height;
    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) return;

    // Fill with white background
    maskCtx.fillStyle = 'white';
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

    // Get paint layer data
    const paintImageData = paintCanvas.getContext('2d')?.getImageData(0, 0, paintCanvas.width, paintCanvas.height);
    if (!paintImageData) return;

    // Create a temporary canvas to work with the paint data
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = paintCanvas.width;
    tempCanvas.height = paintCanvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    // Put the paint data on the temp canvas
    tempCtx.putImageData(paintImageData, 0, 0);

    // Draw only the area where the image is on the paint canvas
    // We need to map from paint canvas coordinates to original image coordinates
    maskCtx.fillStyle = 'black';
    
    // Apply the inverse transformation to map from canvas to original image
    const { x, y, scale } = imagePosition;
    
    // We need to draw the painted areas (black) onto our mask canvas that's sized to the original image
    maskCtx.drawImage(
      tempCanvas,             // source canvas with paint
      x, y,                   // source position (where image starts in the paint canvas)
      originalImageSize.width * scale,  // source width (scaled image width)
      originalImageSize.height * scale, // source height (scaled image height)
      0, 0,                   // destination position (top-left of original-sized mask)
      originalImageSize.width,         // destination width (original image width)
      originalImageSize.height         // destination height (original image height)
    );

    // Invert the colors so that painted areas (black) stay black
    // and non-painted areas become white
    const maskImageData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    const data = maskImageData.data;

    // Since we filled with white and drew black, we need to adjust 
    // so painted areas are black and non-painted are white
    for (let i = 0; i < data.length; i += 4) {
      // Check if the pixel is black (painted area)
      const isBlack = data[i] < 128 && data[i+1] < 128 && data[i+2] < 128;
      
      if (isBlack) {
        // Keep painted areas black
        data[i] = 0;      // R
        data[i + 1] = 0;  // G
        data[i + 2] = 0;  // B
      } else {
        // Make non-painted areas white
        data[i] = 255;    // R
        data[i + 1] = 255; // G
        data[i + 2] = 255; // B
      }
      data[i + 3] = 255;  // A - always fully opaque
    }

    maskCtx.putImageData(maskImageData, 0, 0);

    maskCanvas.toBlob((blob) => {
      if (blob) {
        console.log(`Created mask with dimensions: ${maskCanvas.width}x${maskCanvas.height}`);
        const file = new File([blob], 'paint-mask.png', { type: 'image/png' });
        onSaveMask(file);
      }
    }, 'image/png');
  };

  return (
    <Box>
      {/* Toolbar */}
      <Paper sx={{ p: 1, mb: 1 }}>
        <Stack spacing={2}>
          {/* Tool Selection */}
          <ButtonGroup variant="outlined">
            <Button
              startIcon={<BrushIcon />}
              variant={tool === 'brush' ? 'contained' : 'outlined'}
              onClick={() => setTool('brush')}
            >
              Brush
            </Button>
            <Button
              startIcon={<EraseIcon />}
              variant={tool === 'eraser' ? 'contained' : 'outlined'}
              onClick={() => setTool('eraser')}
            >
              Eraser
            </Button>
          </ButtonGroup>

          {/* Brush Settings and Action Buttons */}
          <Stack direction="row" spacing={2} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="body2" sx={{ minWidth: 80 }}>
              Brush Size:
            </Typography>
            <Slider
              value={brushSize}
              onChange={(_, value) => setBrushSize(value as number)}
              min={1}
              max={50}
              sx={{ width: 120 }}
              valueLabelDisplay="auto"
            />
            <Typography variant="body2">{brushSize}px</Typography>
            
            {/* Action Buttons */}
            <Tooltip title="Undo">
              <IconButton
                onClick={undo}
                disabled={historyStep <= 0}
                size="small"
              >
                <UndoIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Redo">
              <IconButton
                onClick={redo}
                disabled={historyStep >= history.length - 1}
                size="small"
              >
                <RedoIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Clear All Paint">
              <IconButton onClick={clearCanvas} size="small">
                <DeleteForeverIcon />
              </IconButton>
            </Tooltip>
            {onSaveMask && (
              <Button
                startIcon={<SaveIcon />}
                variant="contained"
                onClick={saveMask}
                size="small"
              >
                Save
              </Button>
            )}
          </Stack>
        </Stack>
      </Paper>

      {/* Canvas */}
      <Box sx={{ display: 'inline-block', position: 'relative' }}>
        <canvas
          ref={baseCanvasRef}
          width={width}
          height={height}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            border: '1px solid #ccc',
            zIndex: 1,
          }}
        />
        <canvas
          ref={paintCanvasRef}
          width={width}
          height={height}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            border: '1px solid #ccc',
            cursor: tool === 'brush' ? 'crosshair' : 'grab',
            zIndex: 2,
          }}
        />
      </Box>
    </Box>
  );
};

export default ImagePaintEditor;
