import React, { useState } from 'react';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import ImagePaintEditor from './ImagePaintEditor';

interface MaskCreatorProps {
  sourceImage: string | null;
  onMaskSave: (file: File) => void;
  buttonText?: string;
  buttonVariant?: 'contained' | 'outlined';
  disabled?: boolean;
  fullWidth?: boolean;
  startIcon?: React.ReactNode;
  size?: 'small' | 'medium' | 'large';
}

const MaskCreator: React.FC<MaskCreatorProps> = ({
  sourceImage,
  onMaskSave,
  buttonText = 'Create Mask Image',
  buttonVariant = 'outlined',
  disabled = false,
  fullWidth = false,
  startIcon = <EditIcon />,
  size = 'medium',
}) => {
  const [isPaintEditorOpen, setIsPaintEditorOpen] = useState(false);

  const handleOpenPaintEditor = () => {
    if (sourceImage) {
      setIsPaintEditorOpen(true);
    }
  };

  const handleClosePaintEditor = () => {
    setIsPaintEditorOpen(false);
  };

  const handleMaskSave = (file: File) => {
    onMaskSave(file);
    setIsPaintEditorOpen(false);
  };

  // Dummy onSave function for ImagePaintEditor (not used in mask creation)
  const handlePaintedImageSave = (_file: File) => {
    // This is not used in mask creation, but required by ImagePaintEditor
  };

  return (
    <>
      <Button
        variant={buttonVariant}
        startIcon={startIcon}
        onClick={handleOpenPaintEditor}
        disabled={disabled || !sourceImage}
        fullWidth={fullWidth}
        size={size}
      >
        {buttonText}
      </Button>

      <Dialog
        open={isPaintEditorOpen}
        onClose={handleClosePaintEditor}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            height: '90vh',
            maxHeight: '90vh',
          }
        }}
      >
        <DialogTitle>Create Mask Image</DialogTitle>
        <DialogContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {sourceImage && (
            <ImagePaintEditor
              imageUrl={sourceImage}
              onSave={handlePaintedImageSave}
              onSaveMask={handleMaskSave}
              width={500}
              height={600}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClosePaintEditor}>
            Cancel
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default MaskCreator;
