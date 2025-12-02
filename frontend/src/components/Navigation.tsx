import React, { useState } from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  AppBar,
  Toolbar,
  Typography,
  Box,
  useTheme,
  useMediaQuery,
  Divider,
  Avatar,
  Menu,
  MenuItem,
  Select,
  FormControl,
} from '@mui/material';
import {
  Menu as MenuIcon,
  CheckroomOutlined,
  Person2,
  HomeOutlined,
  LandscapeOutlined,
  LogoutOutlined,
  Language as LanguageIcon,
  EditOutlined,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useAppStore } from '../stores/appStore';

const drawerWidth = 240;

interface NavigationProps {
  children: React.ReactNode;
}

const Navigation: React.FC<NavigationProps> = ({ children }) => {
  const { user, signOut } = useAuth();
  const { t } = useTranslation();
  const { language, setLanguage } = useAppStore();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const handleDrawerToggle = () => {
    if (isMobile) {
      setMobileOpen(!mobileOpen);
    } else {
      setDesktopOpen(!desktopOpen);
    }
  };

  const menuItems = [
    { textKey: 'navigation.home', icon: <HomeOutlined />, path: '/home' },
    { textKey: 'navigation.modelGeneration', icon: <Person2 />, path: '/model-generation' },
    { textKey: 'navigation.virtualTryOn', icon: <CheckroomOutlined />, path: '/virtual-try-on' },
    { textKey: 'navigation.backgroundReplacement', icon: <LandscapeOutlined />, path: '/background-replacement' },
    { textKey: 'navigation.imageEdit', icon: <EditOutlined />, path: '/image-edit' },
  ];

  const handleNavigation = (path: string) => {
    navigate(path);
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setUserMenuAnchor(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setUserMenuAnchor(null);
  };

  const handleSignOut = () => {
    handleUserMenuClose();
    if (signOut) {
      signOut();
    }
  };

  const handleLanguageChange = (newLanguage: 'en' | 'ja') => {
    setLanguage(newLanguage);
    handleUserMenuClose();
  };

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar>
        <Typography variant="h6" noWrap component="div">
          {t('navigation.menu')}
        </Typography>
      </Toolbar>
      <Divider />
      <List sx={{ flexGrow: 1 }}>
        {menuItems.map((item) => (
          <ListItem key={item.textKey} disablePadding>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => handleNavigation(item.path)}
              sx={{
                '&.Mui-selected': {
                  backgroundColor: theme.palette.action.selected,
                  '&:hover': {
                    backgroundColor: theme.palette.action.hover,
                  },
                },
              }}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={t(item.textKey)} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          width: isMobile ? '100%' : `calc(100% - ${desktopOpen ? drawerWidth : 0}px)`,
          ml: isMobile ? 0 : `${desktopOpen ? drawerWidth : 0}px`,
          transition: theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            {t('home.title')}
          </Typography>
          {user && (
            <>
              <IconButton
                color="inherit"
                onClick={handleUserMenuOpen}
                sx={{ p: 0 }}
              >
                <Avatar sx={{ width: 32, height: 32 }}>
                  {user.email ? user.email.charAt(0).toUpperCase() : (user.username ? user.username.charAt(0).toUpperCase() : 'U')}
                </Avatar>
              </IconButton>
              <Menu
                anchorEl={userMenuAnchor}
                open={Boolean(userMenuAnchor)}
                onClose={handleUserMenuClose}
                anchorOrigin={{
                  vertical: 'bottom',
                  horizontal: 'right',
                }}
                transformOrigin={{
                  vertical: 'top',
                  horizontal: 'right',
                }}
                sx={{ mt: 1 }}
              >
                <MenuItem disabled>
                  <Box>
                    <Typography variant="subtitle2">
                      {user.username || 'User'}
                    </Typography>
                    {user.email && (
                      <Typography variant="body2" color="textSecondary">
                        {user.email}
                      </Typography>
                    )}
                  </Box>
                </MenuItem>
                <Divider />
                <MenuItem>
                  <ListItemIcon>
                    <LanguageIcon fontSize="small" />
                  </ListItemIcon>
                  <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    <Typography sx={{ mr: 2 }}>{t('navigation.language')}</Typography>
                    <FormControl size="small" sx={{ minWidth: 80 }}>
                      <Select
                        value={language.currentLanguage}
                        onChange={(e) => handleLanguageChange(e.target.value as 'en' | 'ja')}
                        variant="outlined"
                        sx={{ 
                          fontSize: '0.875rem',
                          '& .MuiOutlinedInput-notchedOutline': {
                            border: 'none',
                          },
                        }}
                      >
                        <MenuItem value="en">English</MenuItem>
                        <MenuItem value="ja">日本語</MenuItem>
                      </Select>
                    </FormControl>
                  </Box>
                </MenuItem>
                <Divider />
                <MenuItem onClick={handleSignOut}>
                  <ListItemIcon>
                    <LogoutOutlined fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>{t('navigation.signOut')}</ListItemText>
                </MenuItem>
              </Menu>
            </>
          )}
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ 
          width: { md: desktopOpen ? drawerWidth : 0 }, 
          flexShrink: { md: 0 },
          transition: theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
        }}
      >
        {isMobile ? (
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={handleDrawerToggle}
            ModalProps={{
              keepMounted: true, // Better open performance on mobile.
            }}
            sx={{
              '& .MuiDrawer-paper': {
                boxSizing: 'border-box',
                width: drawerWidth,
              },
            }}
          >
            {drawer}
          </Drawer>
        ) : (
          <Drawer
            variant="persistent"
            open={desktopOpen}
            sx={{
              '& .MuiDrawer-paper': {
                boxSizing: 'border-box',
                width: drawerWidth,
                transition: theme.transitions.create('width', {
                  easing: theme.transitions.easing.sharp,
                  duration: theme.transitions.duration.leavingScreen,
                }),
              },
            }}
          >
            {drawer}
          </Drawer>
        )}
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: isMobile ? '100%' : `calc(100% - ${desktopOpen ? drawerWidth : 0}px)`,
          mt: 8, // Add margin top for AppBar on both mobile and desktop
          transition: theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
        }}
      >
        {children}
      </Box>
    </Box>
  );
};

export default Navigation;
