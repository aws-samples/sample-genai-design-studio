import React, { useState } from 'react';
import { Box, Typography, Paper, Alert, IconButton, Snackbar } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import { useDropzone } from 'react-dropzone';
import type { ImageUploadProps } from '../types';
import { imageFileSchema, validateImageResolution } from '../utils/validation';
import { pasteImageFromClipboard, isClipboardSupported } from '../utils/clipboard';

const ImageUpload: React.FC<ImageUploadProps> = ({ 
  label, 
  onImageUpload, 
  uploadedImage, 
  height = 512,
  allowMask = false 
}) => {
  const [error, setError] = useState<string | null>(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');

  const validateAndUploadImage = async (file: File) => {
    setError(null);
    
    try {
      // Validate file format and MIME type
      imageFileSchema.parse(file);
      
      // Validate image resolution
      await validateImageResolution(file);
      
      // If all validations pass, upload the image
      onImageUpload(file);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('画像のアップロードに失敗しました');
      }
    }
  };

  const handlePaste = async () => {
    if (!isClipboardSupported()) {
      setSnackbarMessage('Clipboard API is not supported in this browser');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }

    try {
      const pastedFile = await pasteImageFromClipboard();
      if (pastedFile) {
        await validateAndUploadImage(pastedFile);
        setSnackbarMessage('Image pasted from clipboard');
        setSnackbarSeverity('success');
        setSnackbarOpen(true);
      } else {
        setSnackbarMessage('No image found in clipboard');
        setSnackbarSeverity('error');
        setSnackbarOpen(true);
      }
    } catch (error) {
      console.error('Paste error:', error);
      setSnackbarMessage('Failed to paste image from clipboard');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'image/jpeg': ['.jpeg', '.jpg'],
      'image/png': ['.png'],
      'image/webp': ['.webp']
    },
    maxFiles: 1,
    onDrop: async (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        await validateAndUploadImage(acceptedFiles[0]);
      }
    },
    onDropRejected: (fileRejections) => {
      if (fileRejections.length > 0) {
        setError('サポートされていないファイル形式です。JPEG、PNG、WebPのみ対応しています。');
      }
    }
  });

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="h6">
          {label}
        </Typography>
        {isClipboardSupported() && (
          <IconButton
            onClick={handlePaste}
            size="small"
            sx={{
              color: 'primary.main',
              '&:hover': {
                backgroundColor: 'primary.light',
                color: 'white',
              },
            }}
            title="Paste image from clipboard"
          >
            <ContentPasteIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Paper
        {...getRootProps()}
        sx={{
          height: height,
          border: '2px dashed #ccc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          backgroundColor: isDragActive ? '#f5f5f5' : 'transparent',
          backgroundImage: uploadedImage ? `url(${uploadedImage})` : 'none',
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
        }}
      >
        <input {...getInputProps()} />
        {!uploadedImage && (
          <Box textAlign="center">
            <CloudUploadIcon sx={{ fontSize: 48, color: '#ccc', mb: 2 }} />
            <Typography variant="body2" color="textSecondary">
              {isDragActive ? '画像をここにドロップ' : `${label}をアップロード`}
            </Typography>
            <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
              Image: JPEG, PNG, WebP / lower than 4.2M Pixel
            </Typography>
            {allowMask && (
              <Typography variant="caption" color="textSecondary">
                (mask editable)
              </Typography>
            )}
          </Box>
        )}
      </Paper>
      
      {/* Snackbar for paste feedback */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleSnackbarClose} severity={snackbarSeverity}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ImageUpload;
