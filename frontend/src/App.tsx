import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navigation from './components/Navigation';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import OfflineIndicator from './components/OfflineIndicator';
import PWAUpdatePrompt from './components/PWAUpdatePrompt';
import Home from './pages/Home';
import VirtualTryOn from './pages/VirtualTryOn';
import ModelGeneration from './pages/ModelGeneration';
import ImageEdit from './pages/ImageEdit';
import Settings from './pages/Settings';
import './i18n'; // i18n初期化
import './App.css';

function App() {
  return (
    <AuthProvider>
      <ProtectedRoute>
        <Router>
          <Navigation>
            <Routes>
              <Route path="/" element={<Navigate to="/home" replace />} />
              <Route path="/home" element={<Home />} />
              <Route path="/virtual-try-on" element={<VirtualTryOn />} />
              <Route path="/model-generation" element={<ModelGeneration />} />
              <Route path="/image-edit" element={<ImageEdit />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
            <PWAInstallPrompt />
            <OfflineIndicator />
            <PWAUpdatePrompt />
          </Navigation>
        </Router>
      </ProtectedRoute>
    </AuthProvider>
  );
}

export default App;
