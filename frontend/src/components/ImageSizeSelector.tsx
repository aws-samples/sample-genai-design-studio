import React from 'react';
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ListSubheader,
  Box,
  Typography,
  Chip,
} from '@mui/material';
import { getImageSizePresetsForModel, groupSizesByCategory, getSizeKey } from '../utils/imageSizes';

interface ImageSizeSelectorProps {
  width: number;
  height: number;
  onSizeChange: (width: number, height: number) => void;
  label?: string;
  fullWidth?: boolean;
  modelId?: string; // Add modelId prop to determine which presets to use
}

const ImageSizeSelector: React.FC<ImageSizeSelectorProps> = ({
  width,
  height,
  onSizeChange,
  label = "Image Size",
  fullWidth = true,
  modelId = 'amazon.nova-canvas-v1:0', // Default to Canvas
}) => {
  const currentSizeKey = getSizeKey(width, height);
  const imagePresets = getImageSizePresetsForModel(modelId);
  const groupedSizes = groupSizesByCategory(imagePresets);
  
  // Find current size info for display
  const currentSize = imagePresets.find(size => 
    size.width === width && size.height === height
  );

  const handleChange = (event: any) => {
    const sizeKey = event.target.value;
    const [newWidth, newHeight] = sizeKey.split('x').map(Number);
    onSizeChange(newWidth, newHeight);
  };

  return (
    <Box>
      <FormControl fullWidth={fullWidth}>
        <InputLabel>{label}</InputLabel>
        <Select
          value={currentSizeKey}
          onChange={handleChange}
          label={label}
        >
          {/* Square sizes */}
          <ListSubheader>
            <Box display="flex" alignItems="center" gap={1}>
              <Typography variant="body2" fontWeight="bold">
                Square (正方形)
              </Typography>
              <Chip label="1:1" size="small" variant="outlined" />
            </Box>
          </ListSubheader>
          {groupedSizes.square.map((size) => (
            <MenuItem key={getSizeKey(size.width, size.height)} value={getSizeKey(size.width, size.height)}>
              {size.label}
            </MenuItem>
          ))}

          {/* Landscape sizes */}
          <ListSubheader>
            <Box display="flex" alignItems="center" gap={1}>
              <Typography variant="body2" fontWeight="bold">
                Landscape (横長)
              </Typography>
              <Chip label="Wide" size="small" variant="outlined" />
            </Box>
          </ListSubheader>
          {groupedSizes.landscape.map((size) => (
            <MenuItem key={getSizeKey(size.width, size.height)} value={getSizeKey(size.width, size.height)}>
              {size.label}
            </MenuItem>
          ))}

          {/* Portrait sizes */}
          <ListSubheader>
            <Box display="flex" alignItems="center" gap={1}>
              <Typography variant="body2" fontWeight="bold">
                Portrait (縦長)
              </Typography>
              <Chip label="Tall" size="small" variant="outlined" />
            </Box>
          </ListSubheader>
          {groupedSizes.portrait.map((size) => (
            <MenuItem key={getSizeKey(size.width, size.height)} value={getSizeKey(size.width, size.height)}>
              {size.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      
      {/* Display current size info */}
      {currentSize && (
        <Box mt={1} display="flex" gap={1} alignItems="center">
          <Chip 
            label={currentSize.category.charAt(0).toUpperCase() + currentSize.category.slice(1)} 
            size="small" 
            color="primary" 
            variant="outlined" 
          />
          <Typography variant="caption" color="textSecondary">
            {width} × {height} pixels ({currentSize.ratio})
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default ImageSizeSelector;
