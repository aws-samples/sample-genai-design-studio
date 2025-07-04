import React, { useState, useEffect } from 'react';
import { Alert, Snackbar } from '@mui/material';
import { WifiOff as OfflineIcon, Wifi as OnlineIcon } from '@mui/icons-material';

const OfflineIndicator: React.FC = () => {
  const [showOfflineAlert, setShowOfflineAlert] = useState(false);
  const [showOnlineAlert, setShowOnlineAlert] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setShowOnlineAlert(true);
      setTimeout(() => setShowOnlineAlert(false), 3000);
    };

    const handleOffline = () => {
      setShowOfflineAlert(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <>
      <Snackbar 
        open={showOfflineAlert} 
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert 
          severity="warning" 
          icon={<OfflineIcon />}
          onClose={() => setShowOfflineAlert(false)}
        >
          オフラインモードです。一部機能が制限される場合があります。
        </Alert>
      </Snackbar>

      <Snackbar 
        open={showOnlineAlert} 
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert 
          severity="success" 
          icon={<OnlineIcon />}
          onClose={() => setShowOnlineAlert(false)}
        >
          オンラインに復帰しました。
        </Alert>
      </Snackbar>
    </>
  );
};

export default OfflineIndicator;
