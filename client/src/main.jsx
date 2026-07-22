import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import ResetPage from './pages/ResetPage';
import VerifyPage from './pages/VerifyPage';
import RegisterPage from './pages/RegisterPage';
import PortalPage from './pages/PortalPage';
import HomePage from './pages/HomePage';
import CreatePage from './pages/CreatePage';
import ChatPage from './pages/ChatPage';
import SettingsPage from './pages/SettingsPage';
import VoicesListPage from './pages/VoicesListPage';
import VoicesNewPage from './pages/VoicesNewPage';
import VoicesRoomPage from './pages/VoicesRoomPage';
import XianxiaCharList from './pages/xianxia/CharListPage';
import XianxiaBirth from './pages/xianxia/BirthPage';
import XianxiaMain from './pages/xianxia/MainPage';
import XianxiaProfile from './pages/xianxia/ProfilePage';
import XianxiaMap from './pages/xianxia/MapPage';
import XianxiaJournal from './pages/xianxia/JournalPage';
import XianxiaLegacy from './pages/xianxia/LegacyPage';
import '@fontsource/noto-serif-sc/300.css';
import '@fontsource/noto-serif-sc/400.css';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/ibm-plex-mono/400.css';
import './index.css';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/welcome" replace />;
  return children;
}

function GuestRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to="/" replace />;
  return children;
}

function LoadingScreen() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '16px',
      alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: 'var(--color-paper)'
    }}>
      <span className="seal" aria-hidden="true">愛</span>
      <span className="mono-label">loading</span>
    </div>
  );
}

function App() {
  const { user } = useAuth();
  /* 主题收敛：仅 纸(light)/砚(dark) 两模式，历史值(warm/green)按 light 处理 */
  const theme = user?.theme === 'dark' ? 'dark' : 'light';

  return (
    <div data-theme={theme} className="app-canvas">
      <Routes>
        <Route path="/welcome" element={<GuestRoute><LandingPage /></GuestRoute>} />
        <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
        <Route path="/reset" element={<GuestRoute><ResetPage /></GuestRoute>} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
        <Route path="/" element={<ProtectedRoute><PortalPage /></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/create" element={<ProtectedRoute><CreatePage /></ProtectedRoute>} />
        <Route path="/chat/:id" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
        <Route path="/voices" element={<ProtectedRoute><VoicesListPage /></ProtectedRoute>} />
        <Route path="/voices/new" element={<ProtectedRoute><VoicesNewPage /></ProtectedRoute>} />
        <Route path="/voices/:id" element={<ProtectedRoute><VoicesRoomPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        <Route path="/xianxia" element={<ProtectedRoute><XianxiaCharList /></ProtectedRoute>} />
        <Route path="/xianxia/birth" element={<ProtectedRoute><XianxiaBirth /></ProtectedRoute>} />
        <Route path="/xianxia/legacy" element={<ProtectedRoute><XianxiaLegacy /></ProtectedRoute>} />
        <Route path="/xianxia/:characterId" element={<ProtectedRoute><XianxiaMain /></ProtectedRoute>} />
        <Route path="/xianxia/:characterId/profile" element={<ProtectedRoute><XianxiaProfile /></ProtectedRoute>} />
        <Route path="/xianxia/:characterId/map" element={<ProtectedRoute><XianxiaMap /></ProtectedRoute>} />
        <Route path="/xianxia/:characterId/journal" element={<ProtectedRoute><XianxiaJournal /></ProtectedRoute>} />
      </Routes>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
