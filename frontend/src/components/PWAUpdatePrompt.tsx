import React, { useState, useEffect } from 'react';
import { Button, Snackbar, Alert } from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';

const PWAUpdatePrompt: React.FC = () => {
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    // Service Worker registration check
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        // Check for waiting service worker
        if (registration.waiting) {
          setWaitingWorker(registration.waiting);
          setShowUpdatePrompt(true);
        }

        // Listen for new service worker
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setWaitingWorker(newWorker);
                setShowUpdatePrompt(true);
              }
            });
          }
        });

        // Listen for messages from service worker
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'SW_UPDATE_AVAILABLE') {
            setShowUpdatePrompt(true);
          }
        });
      });
    }
  }, []);

  const handleUpdateClick = () => {
    if (waitingWorker) {
      // Tell the waiting service worker to skip waiting
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      
      // Reload the page to use the new service worker
      window.location.reload();
    } else {
      // Fallback: just reload the page
      window.location.reload();
    }
  };

  const handleDismiss = () => {
    setShowUpdatePrompt(false);
  };

  if (!showUpdatePrompt) {
    return null;
  }

  return (
    <Snackbar 
      open={showUpdatePrompt} 
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      onClose={handleDismiss}
    >
      <Alert 
        severity="info" 
        action={
          <Button 
            color="inherit" 
            size="small" 
            startIcon={<RefreshIcon />}
            onClick={handleUpdateClick}
          >
            更新
          </Button>
        }
        onClose={handleDismiss}
      >
        新しいバージョンが利用可能です。更新してください。
      </Alert>
    </Snackbar>
  );
};

export default PWAUpdatePrompt;
