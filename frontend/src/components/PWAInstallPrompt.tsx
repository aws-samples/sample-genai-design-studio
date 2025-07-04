import React, { useState, useEffect } from 'react';
import { Box, Button, Card, CardContent, Typography, IconButton } from '@mui/material';
import { GetApp as InstallIcon, Close as CloseIcon } from '@mui/icons-material';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowInstallPrompt(true);
    };

    // Listen for app installed event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowInstallPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      console.log('Installation choice:', choiceResult.outcome);
    } catch (error) {
      console.error('Error during installation:', error);
    }

    setDeferredPrompt(null);
    setShowInstallPrompt(false);
  };

  const handleDismiss = () => {
    setShowInstallPrompt(false);
  };

  // Don't show if already installed or no prompt available
  if (isInstalled || !showInstallPrompt || !deferredPrompt) {
    return null;
  }

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 1000,
        maxWidth: 300,
      }}
    >
      <Card elevation={6}>
        <CardContent sx={{ pb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <Box sx={{ flex: 1, mr: 1 }}>
              <Typography variant="h6" component="h3" sx={{ fontSize: '1rem', mb: 1 }}>
                アプリをインストール
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Virtual Try-On Appをデスクトップアプリとしてインストールして、より快適にご利用いただけます。
              </Typography>
              <Button
                variant="contained"
                startIcon={<InstallIcon />}
                onClick={handleInstallClick}
                fullWidth
                size="small"
              >
                インストール
              </Button>
            </Box>
            <IconButton
              size="small"
              onClick={handleDismiss}
              sx={{ mt: -1, mr: -1 }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default PWAInstallPrompt;
