import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { CssBaseline } from '@mui/material'
import './index.css'
import App from './App.tsx'

const theme = createTheme({
  palette: {
    primary: {
      main: '#252F3D', // AWS navy
      dark: '#1a2128',  // darker shade for hover
      light: '#3a4b5c', // lighter shade
      contrastText: '#ffffff', // white text on buttons
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        containedPrimary: {
          backgroundColor: '#252F3D',
          color: '#ffffff',
          '&:hover': {
            backgroundColor: '#1a2128',
          },
          '&:disabled': {
            backgroundColor: '#666666',
            color: '#cccccc',
          },
        },
      },
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>,
)
