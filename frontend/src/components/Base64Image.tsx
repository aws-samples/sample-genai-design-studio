import React, { useState } from 'react';
import { Box, CircularProgress, Typography, IconButton, Snackbar, Alert } from '@mui/material';
import type { SxProps, Theme } from '@mui/material';
import { Image as ImageIcon, ErrorOutline as ErrorIcon, Download as DownloadIcon, ContentCopy as CopyIcon } from '@mui/icons-material';
import { copyImageToClipboard, isClipboardSupported } from '../utils/clipboard';

interface Base64ImageProps {
  className?: string;
  imageBase64?: string;
  loading?: boolean;
  error?: boolean;
  errorMessage?: string;
  downloadFileName?: string;
  clickable?: boolean;
  onClick?: () => void;
  sx?: SxProps<Theme>;
}

const Base64Image: React.FC<Base64ImageProps> = (props) => {
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState<'success' | 'error'>('success');

  const src = props.imageBase64 ? `data:image/png;base64,${props.imageBase64}` : undefined;

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!src || !props.downloadFileName) return;

    const link = document.createElement('a');
    link.href = src;
    link.download = props.downloadFileName;
    link.click();
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!props.imageBase64) return;

    if (!isClipboardSupported()) {
      setSnackbarMessage('Clipboard API is not supported in this browser');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }

    try {
      const success = await copyImageToClipboard(props.imageBase64);
      if (success) {
        setSnackbarMessage('Image copied to clipboard');
        setSnackbarSeverity('success');
      } else {
        setSnackbarMessage('Failed to copy image to clipboard');
        setSnackbarSeverity('error');
      }
      setSnackbarOpen(true);
    } catch (error) {
      console.error('Copy error:', error);
      setSnackbarMessage('Failed to copy image to clipboard');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  const handleClick = () => {
    if (props.clickable && props.onClick) {
      props.onClick();
    }
  };

  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  return (
    <Box
      className={props.className}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid #e0e0e0',
        borderRadius: 1,
        backgroundColor: '#f5f5f5',
        cursor: props.clickable ? 'pointer' : 'default',
        position: 'relative',
        overflow: 'hidden',
        '&:hover': props.clickable ? {
          backgroundColor: '#eeeeee',
        } : {},
        ...props.sx,
      }}
      onClick={handleClick}
    >
      {props.error ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', p: 2 }}>
          <ErrorIcon sx={{ fontSize: '2rem', color: '#f44336' }} />
          <Typography variant="body2" color="error" sx={{ mt: 1 }}>
            Error
          </Typography>
          {props.errorMessage && (
            <Typography variant="caption" color="error" sx={{ mt: 0.5, textAlign: 'center' }}>
              {props.errorMessage}
            </Typography>
          )}
        </Box>
      ) : !props.imageBase64 ? (
        props.loading ? (
          <CircularProgress size={24} />
        ) : (
          <ImageIcon sx={{ fontSize: '3rem', color: '#bdbdbd' }} />
        )
      ) : (
        <>
          <img
            src={src}
            alt="Generated"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
          {props.downloadFileName && !props.clickable && (
            <Box
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
                display: 'flex',
                gap: 0.5,
              }}
            >
              {/* Copy Button */}
              <IconButton
                onClick={handleCopy}
                sx={{
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  color: 'white',
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                  },
                  width: 32,
                  height: 32,
                }}
                size="small"
                title="Copy image to clipboard"
              >
                <CopyIcon fontSize="small" />
              </IconButton>
              
              {/* Download Button */}
              <IconButton
                onClick={handleDownload}
                sx={{
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  color: 'white',
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                  },
                  width: 32,
                  height: 32,
                }}
                size="small"
                title="Download image"
              >
                <DownloadIcon fontSize="small" />
              </IconButton>
            </Box>
          )}
        </>
      )}
      
      {/* Snackbar for copy feedback */}
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

export default Base64Image;
