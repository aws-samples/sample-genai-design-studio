import React from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Switch,
  Divider,
} from '@mui/material';

const Settings: React.FC = () => {
  const [settings, setSettings] = React.useState({
    darkMode: false,
    notifications: true,
    autoSave: true,
  });

  const handleToggle = (setting: keyof typeof settings) => {
    setSettings((prev) => ({
      ...prev,
      [setting]: !prev[setting],
    }));
  };

  return (
    <Container maxWidth="md">
      <Typography variant="h4" component="h1" gutterBottom>
        設定
      </Typography>

      <Paper sx={{ mt: 3 }}>
        <List>
          <ListItem>
            <ListItemText
              primary="ダークモード"
              secondary="アプリケーションの外観をダークテーマに変更します"
            />
            <ListItemSecondaryAction>
              <Switch
                edge="end"
                checked={settings.darkMode}
                onChange={() => handleToggle('darkMode')}
              />
            </ListItemSecondaryAction>
          </ListItem>
          <Divider />
          <ListItem>
            <ListItemText
              primary="通知"
              secondary="画像生成完了時に通知を受け取ります"
            />
            <ListItemSecondaryAction>
              <Switch
                edge="end"
                checked={settings.notifications}
                onChange={() => handleToggle('notifications')}
              />
            </ListItemSecondaryAction>
          </ListItem>
          <Divider />
          <ListItem>
            <ListItemText
              primary="自動保存"
              secondary="生成した画像を自動的に保存します"
            />
            <ListItemSecondaryAction>
              <Switch
                edge="end"
                checked={settings.autoSave}
                onChange={() => handleToggle('autoSave')}
              />
            </ListItemSecondaryAction>
          </ListItem>
        </List>
      </Paper>

      <Box sx={{ mt: 3 }}>
        <Typography variant="body2" color="text.secondary">
          設定は自動的に保存されます。
        </Typography>
      </Box>
    </Container>
  );
};

export default Settings;
