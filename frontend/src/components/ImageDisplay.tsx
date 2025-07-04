import React from 'react';
import { Box, Typography } from '@mui/material';
import Base64Image from './Base64Image';

interface ImageData {
  base64?: string;
  error?: boolean;
  errorMessage?: string;
}

interface ImageDisplayProps {
  images: ImageData[];
  selectedImageIndex: number;
  onSelectImage: (index: number) => void;
  loading?: boolean;
  title?: string;
  emptyMessage?: string;
  loadingMessage?: string;
  downloadFileName?: string;
}

const ImageDisplay: React.FC<ImageDisplayProps> = ({
  images,
  selectedImageIndex,
  onSelectImage,
  loading = false,
  title = "Generated Images",
  emptyMessage = "Generated images will appear here",
  loadingMessage = "画像を生成中...",
  downloadFileName,
}) => {
  return (
    <Box sx={{ flex: { xs: 1, lg: 2 }, maxWidth: { lg: '67%' } }}>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      
      {/* メイン画像表示エリア */}
      <Box
        sx={{
          height: { xs: 400, lg: 600 },
          border: '1px solid #ccc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fafafa',
          borderRadius: 1,
          mb: 2,
        }}
      >
        {images.length === 0 && !loading && (
          <Typography variant="body2" color="textSecondary">
            {emptyMessage}
          </Typography>
        )}
        {loading && images.length === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Base64Image loading={true} />
            <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
              {loadingMessage}
            </Typography>
          </Box>
        )}
        {images.length > 0 && (
          <Base64Image
            imageBase64={images[selectedImageIndex]?.base64}
            loading={loading}
            error={images[selectedImageIndex]?.error}
            errorMessage={images[selectedImageIndex]?.errorMessage}
            downloadFileName={downloadFileName}
            sx={{
              width: '100%',
              height: '100%',
              minHeight: '240px',
              minWidth: '240px',
              maxWidth: '512px',
            }}
          />
        )}
      </Box>

      {/* サムネイル画像表示エリア */}
      {images.length > 1 && (
        <Box sx={{ mb: 2, display: 'flex', flexDirection: 'row', justifyContent: 'center', gap: 1 }}>
          {images.map((image, idx) => (
            <Base64Image
              key={idx}
              imageBase64={image.base64}
              loading={loading}
              error={image.error}
              clickable
              onClick={() => onSelectImage(idx)}
              sx={{
                width: 60,
                height: 60,
                border: idx === selectedImageIndex ? '2px solid #1976d2' : '1px solid #e0e0e0',
                '&:hover': {
                  border: '2px solid #1976d2',
                },
              }}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};

export default ImageDisplay;
