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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import BrushIcon from '@mui/icons-material/Brush';
import EraseIcon from '@mui/icons-material/Clear';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import SaveIcon from '@mui/icons-material/Save';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import CropFreeIcon from '@mui/icons-material/CropFree';
import PaletteIcon from '@mui/icons-material/Palette';
import FormatColorFillIcon from '@mui/icons-material/FormatColorFill';
import FloodFill from 'q-floodfill';

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
  const [brushColor, setBrushColor] = useState('#FF0000');
  const [maskOpacity, setMaskOpacity] = useState(0.7);
  const [tool, setTool] = useState<'brush' | 'eraser' | 'rectangle' | 'fill'>('brush');
  const [isSelectingRect, setIsSelectingRect] = useState(false);
  const [rectStart, setRectStart] = useState<{x: number; y: number} | null>(null);
  const [rectEnd, setRectEnd] = useState<{x: number; y: number} | null>(null);
  const [history, setHistory] = useState<DrawingState[]>([]);
  const [historyStep, setHistoryStep] = useState(-1);

  // Store original image dimensions
  const [originalImageSize, setOriginalImageSize] = useState<{width: number; height: number}>({width: 0, height: 0});
  const [imagePosition, setImagePosition] = useState<{x: number; y: number; scale: number}>({x: 0, y: 0, scale: 1});

  // Predefined mask colors
  const maskColors = [
    { name: 'Red', value: '#FF0000' },
    { name: 'Green', value: '#00FF00' },
    { name: 'Blue', value: '#0000FF' },
    { name: 'Yellow', value: '#FFFF00' },
    { name: 'Magenta', value: '#FF00FF' },
    { name: 'Cyan', value: '#00FFFF' },
    { name: 'Orange', value: '#FF8000' },
    { name: 'Purple', value: '#8000FF' },
    { name: 'Black', value: '#000000' },
  ];

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

  // Change all existing mask colors when brush color changes
  const changeMaskColor = useCallback((newColor: string) => {
    const paintCanvas = paintCanvasRef.current;
    if (!paintCanvas) return;

    const paintCtx = paintCanvas.getContext('2d');
    if (!paintCtx) return;

    const imageData = paintCtx.getImageData(0, 0, paintCanvas.width, paintCanvas.height);
    const data = imageData.data;

    // Convert hex color to RGB
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : null;
    };

    const newRgb = hexToRgb(newColor);
    if (!newRgb) return;

    // Change color of all non-transparent pixels
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0) { // If pixel is not transparent
        data[i] = newRgb.r;     // Red
        data[i + 1] = newRgb.g; // Green
        data[i + 2] = newRgb.b; // Blue
        // Keep original alpha value
      }
    }

    paintCtx.putImageData(imageData, 0, 0);
    saveToHistory();
  }, [saveToHistory]);

  // Median filter for noise reduction
  const medianFilter = useCallback((imageData: ImageData) => {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const newData = new Uint8ClampedArray(data);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const centerIndex = (y * width + x) * 4;
        
        // Collect alpha values from 3x3 neighborhood
        const alphaValues = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const neighborIndex = ((y + dy) * width + (x + dx)) * 4;
            alphaValues.push(data[neighborIndex + 3]);
          }
        }
        
        // Sort and get median
        alphaValues.sort((a, b) => a - b);
        const medianAlpha = alphaValues[4]; // Middle value of 9 elements
        
        // Apply median alpha value
        if (medianAlpha > 0) {
          // If median is opaque, use current brush color
          const hexToRgb = (hex: string) => {
            const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return match ? [
              parseInt(match[1], 16),
              parseInt(match[2], 16),
              parseInt(match[3], 16)
            ] : [255, 0, 0];
          };
          
          const [r, g, b] = hexToRgb(brushColor);
          newData[centerIndex] = r;
          newData[centerIndex + 1] = g;
          newData[centerIndex + 2] = b;
          newData[centerIndex + 3] = 255;
        } else {
          // If median is transparent, make pixel transparent
          newData[centerIndex] = 0;
          newData[centerIndex + 1] = 0;
          newData[centerIndex + 2] = 0;
          newData[centerIndex + 3] = 0;
        }
      }
    }
    
    // Copy result back to original data
    for (let i = 0; i < data.length; i++) {
      data[i] = newData[i];
    }
    
    return imageData;
  }, [brushColor]);

  // Flood fill using q-floodfill library
  const handleFloodFill = useCallback((startX: number, startY: number) => {
    const paintCanvas = paintCanvasRef.current;
    if (!paintCanvas) return;

    const paintCtx = paintCanvas.getContext('2d');
    if (!paintCtx) return;

    // Round coordinates to integers
    const x = Math.floor(startX);
    const y = Math.floor(startY);

    // Boundary check
    if (x < 0 || x >= paintCanvas.width || y < 0 || y >= paintCanvas.height) return;

    const imageData = paintCtx.getImageData(0, 0, paintCanvas.width, paintCanvas.height);
    
    const floodFill = new FloodFill(imageData);
    floodFill.fill(brushColor, x, y, 0);

    // Apply median filter to reduce noise
    medianFilter(imageData);

    paintCtx.putImageData(imageData, 0, 0);
    saveToHistory();
  }, [brushColor, medianFilter, saveToHistory]);

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
    const pos = getMousePos(e);
    
    if (tool === 'fill') {
      handleFloodFill(pos.x, pos.y);
      return;
    }
    
    if (tool === 'rectangle') {
      setIsSelectingRect(true);
      setRectStart(pos);
      setRectEnd(pos);
      return;
    }
    
    setIsDrawing(true);
    const paintCanvas = paintCanvasRef.current;
    if (!paintCanvas) return;

    const paintCtx = paintCanvas.getContext('2d');
    if (!paintCtx) return;

    paintCtx.beginPath();
    paintCtx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePos(e);
    
    if (tool === 'rectangle' && isSelectingRect) {
      setRectEnd(pos);
      return;
    }
    
    if (!isDrawing) return;

    const paintCanvas = paintCanvasRef.current;
    if (!paintCanvas) return;

    const paintCtx = paintCanvas.getContext('2d');
    if (!paintCtx) return;

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
    if (tool === 'rectangle' && isSelectingRect && rectStart && rectEnd) {
      // 矩形を描画
      const paintCanvas = paintCanvasRef.current;
      if (paintCanvas) {
        const paintCtx = paintCanvas.getContext('2d');
        if (paintCtx) {
          paintCtx.globalCompositeOperation = 'source-over';
          paintCtx.fillStyle = brushColor;
          
          const x = Math.min(rectStart.x, rectEnd.x);
          const y = Math.min(rectStart.y, rectEnd.y);
          const width = Math.abs(rectEnd.x - rectStart.x);
          const height = Math.abs(rectEnd.y - rectStart.y);
          
          paintCtx.fillRect(x, y, width, height);
          saveToHistory();
        }
      }
      setIsSelectingRect(false);
      setRectStart(null);
      setRectEnd(null);
      return;
    }
    
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

    // ステップ1: 元の画像と同じサイズの新しいキャンバスを作成
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = originalImageSize.width;
    maskCanvas.height = originalImageSize.height;
    const maskCtx = maskCanvas.getContext('2d', { alpha: false }); // アルファチャンネルを無効化
    if (!maskCtx) return;

    // ステップ2: マスクキャンバスを白で初期化（非マスク部分）
    maskCtx.fillStyle = 'white';
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

    // ステップ3: ペイントデータを取得
    const paintCtx = paintCanvas.getContext('2d');
    if (!paintCtx) return;
    
    // ステップ4: ペイントキャンバスを直接使わず、ピクセルごとに新しいマスク画像を作成
    // これにより、座標変換が正確に行われる
    
    // 元の画像の実際の表示サイズとオフセットを取得
    const { x, y, scale } = imagePosition;

    // ステップ5: ペイントキャンバス全体のピクセルデータを取得
    const paintImageData = paintCtx.getImageData(0, 0, paintCanvas.width, paintCanvas.height);
    
    // ステップ6: 座標変換を行いながら、元の画像サイズに合わせたマスク画像を作成
    // RGB形式でアルファチャンネルなしの最終キャンバスを作成
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = originalImageSize.width;
    finalCanvas.height = originalImageSize.height;
    const finalCtx = finalCanvas.getContext('2d', { alpha: false });
    if (!finalCtx) return;
    
    // 最終キャンバスを白で初期化
    finalCtx.fillStyle = 'white';
    finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
    
    // ペイントキャンバス上の各ピクセルから元の画像サイズへの変換処理
    for (let destY = 0; destY < maskCanvas.height; destY++) {
      for (let destX = 0; destX < maskCanvas.width; destX++) {
        // 元の画像座標から、ペイントキャンバス上の座標に変換
        const sourceX = Math.round(x + destX * scale);
        const sourceY = Math.round(y + destY * scale);
        
        // ペイントキャンバスの範囲内かチェック
        if (
          sourceX >= 0 && 
          sourceX < paintCanvas.width && 
          sourceY >= 0 && 
          sourceY < paintCanvas.height
        ) {
          // ペイントキャンバス上のピクセル位置を計算
          const sourcePos = (sourceY * paintCanvas.width + sourceX) * 4;
          
          // ペイントされていないかチェック（アルファ値がほぼ0）
          if (paintImageData.data[sourcePos + 3] > 20) {
            // ペイントされた領域は黒（マスク対象）にする
            finalCtx.fillStyle = 'black';
            finalCtx.fillRect(destX, destY, 1, 1);
          }
        }
      }
    }
    
    // JPEGとして保存（アルファチャンネルを完全に排除）してから、PNGに変換
    finalCanvas.toBlob((jpegBlob) => {
      if (jpegBlob) {
        // JPEGからPNGに変換（アルファチャンネルなし）
        const img = new Image();
        img.onload = () => {
          const pngCanvas = document.createElement('canvas');
          pngCanvas.width = originalImageSize.width;
          pngCanvas.height = originalImageSize.height;
          const pngCtx = pngCanvas.getContext('2d', { alpha: false });
          if (!pngCtx) return;
          
          pngCtx.drawImage(img, 0, 0);
          
          pngCanvas.toBlob((pngBlob) => {
            if (pngBlob) {
              console.log(`Created mask with dimensions: ${pngCanvas.width}x${pngCanvas.height} (no alpha channel)`);
              const file = new File([pngBlob], 'paint-mask.png', { type: 'image/png' });
              onSaveMask(file);
            }
          }, 'image/png');
        };
        img.src = URL.createObjectURL(jpegBlob);
      }
    }, 'image/jpeg', 1.0);
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
              startIcon={<CropFreeIcon />}
              variant={tool === 'rectangle' ? 'contained' : 'outlined'}
              onClick={() => setTool('rectangle')}
            >
              Rectangle
            </Button>
            <Button
              startIcon={<FormatColorFillIcon />}
              variant={tool === 'fill' ? 'contained' : 'outlined'}
              onClick={() => setTool('fill')}
            >
              Fill
            </Button>
            <Button
              startIcon={<EraseIcon />}
              variant={tool === 'eraser' ? 'contained' : 'outlined'}
              onClick={() => setTool('eraser')}
            >
              Eraser
            </Button>

            {/* Mask Color Selection */}
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Mask Color</InputLabel>
              <Select
                value={brushColor}
                onChange={(e) => {
                  const newColor = e.target.value;
                  setBrushColor(newColor);
                  changeMaskColor(newColor);
                }}
                label="Mask Color"
                startAdornment={<PaletteIcon sx={{ mr: 1, color: brushColor }} />}
              >
                {maskColors.map((color) => (
                  <MenuItem key={color.value} value={color.value}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 16,
                          height: 16,
                          backgroundColor: color.value,
                          border: '1px solid #ccc',
                          borderRadius: 1,
                        }}
                      />
                      {color.name}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </ButtonGroup>

          {/* Brush Size and Opacity - Vertical Layout */}
          <Stack direction="column" spacing={1}>
            <Stack direction="row" spacing={2} alignItems="center">
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
            </Stack>

            <Stack direction="row" spacing={2} alignItems="center">
              <Typography variant="body2" sx={{ minWidth: 80 }}>
                Opacity:
              </Typography>
              <Slider
                value={maskOpacity}
                onChange={(_, value) => setMaskOpacity(value as number)}
                min={0.1}
                max={1}
                step={0.1}
                sx={{ width: 120 }}
                valueLabelDisplay="auto"
                valueLabelFormat={(value) => `${Math.round(value * 100)}%`}
              />
              <Typography variant="body2">{Math.round(maskOpacity * 100)}%</Typography>
            </Stack>
          </Stack>

          {/* Action Buttons */}
          <Stack direction="row" spacing={1} alignItems="center">
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
            cursor: tool === 'brush' ? 'crosshair' : tool === 'rectangle' ? 'crosshair' : tool === 'fill' ? 'pointer' : 'grab',
            zIndex: 2,
            opacity: maskOpacity,
          }}
        />
        {/* Rectangle selection overlay */}
        {isSelectingRect && rectStart && rectEnd && (
          <div
            style={{
              position: 'absolute',
              left: Math.min(rectStart.x, rectEnd.x),
              top: Math.min(rectStart.y, rectEnd.y),
              width: Math.abs(rectEnd.x - rectStart.x),
              height: Math.abs(rectEnd.y - rectStart.y),
              border: '2px dashed #ff0000',
              backgroundColor: 'rgba(255, 0, 0, 0.1)',
              pointerEvents: 'none',
              zIndex: 3,
            }}
          />
        )}
      </Box>
    </Box>
  );
};

export default ImagePaintEditor;
