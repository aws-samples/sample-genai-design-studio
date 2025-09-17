import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Switch,
  Button,
  Alert,
  Stack
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import ImageUpload from './ImageUpload';
import { combineImagesHorizontally } from '../utils/imageUtils';

interface GarmentUploadProps {
  onGarmentImageUpload: (file: File) => void;
  uploadedGarmentImage?: string | null;
}

const GarmentUpload: React.FC<GarmentUploadProps> = ({
  onGarmentImageUpload,
  uploadedGarmentImage
}) => {
  const { t } = useTranslation();
  const [isAutoCombineEnabled, setIsAutoCombineEnabled] = useState(false);
  const [frontImage, setFrontImage] = useState<File | null>(null);
  const [backImage, setBackImage] = useState<File | null>(null);
  const [frontImageUrl, setFrontImageUrl] = useState<string>('');
  const [backImageUrl, setBackImageUrl] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFrontImageUpload = (file: File) => {
    setFrontImage(file);
    setFrontImageUrl(URL.createObjectURL(file));
    setError(null);
  };

  const handleBackImageUpload = (file: File) => {
    setBackImage(file);
    setBackImageUrl(URL.createObjectURL(file));
    setError(null);
  };

  const handleSingleImageUpload = (file: File) => {
    onGarmentImageUpload(file);
  };

  const handleCombineImages = async () => {
    if (!frontImage || !backImage) {
      setError('Please upload both front and back images');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const combinedImage = await combineImagesHorizontally(frontImage, backImage);
      onGarmentImageUpload(combinedImage);
    } catch (err) {
      setError('Failed to combine images. Please try again.');
      console.error('Image combination error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleModeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const isEnabled = event.target.checked;
    setIsAutoCombineEnabled(isEnabled);
    
    // Reset state when switching modes
    setFrontImage(null);
    setBackImage(null);
    setFrontImageUrl('');
    setBackImageUrl('');
    setError(null);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="body2">
          Front & Back Images (Auto-combine)
        </Typography>
        <Switch
          checked={isAutoCombineEnabled}
          onChange={handleModeChange}
          size="small"
        />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {!isAutoCombineEnabled ? (
        <ImageUpload
          label="Garment Image"
          onImageUpload={handleSingleImageUpload}
          uploadedImage={uploadedGarmentImage || null}
          height={300}
        />
      ) : (
        <Box>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Box sx={{ flex: 1 }}>
              <ImageUpload
                label={t('images.frontImage')}
                onImageUpload={handleFrontImageUpload}
                uploadedImage={frontImageUrl || null}
                height={300}
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <ImageUpload
                label={t('images.backImage')}
                onImageUpload={handleBackImageUpload}
                uploadedImage={backImageUrl || null}
                height={300}
              />
            </Box>
          </Stack>

          {frontImage && backImage && (
            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <Button
                variant="contained"
                onClick={handleCombineImages}
                disabled={isProcessing}
                sx={{ minWidth: 200 }}
              >
                {isProcessing ? 'Combining Images...' : 'Combine & Upload'}
              </Button>
              <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>
                Images will be combined horizontally with black padding for different sizes
              </Typography>
            </Box>
          )}

          {uploadedGarmentImage && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Combined Image Preview:
              </Typography>
              <Paper
                sx={{
                  height: 200,
                  backgroundImage: `url(${uploadedGarmentImage})`,
                  backgroundSize: 'contain',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'center',
                  border: '1px solid #ddd'
                }}
              />
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};

export default GarmentUpload;
