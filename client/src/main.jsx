import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import '@fontsource/noto-serif-sc/300.css';
import '@fontsource/noto-serif-sc/400.css';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/ibm-plex-mono/400.css';
import './index.css';

// Guest pages (eager-loaded for first paint)
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ResetPage from './pages/ResetPage';
import VerifyPage from './pages/VerifyPage';

// Lazy-loaded authenticated pages
const PortalPage = React.lazy(() => import('./pages/PortalPage'));
const HomePage = React.lazy(() => import('./pages/HomePage'));
const CreatePage = React.lazy(() => import('./pages/CreatePage'));
const ChatPage = React.lazy(() => import('./pages/ChatPage'));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'));
const VoicesListPage = React.lazy(() => import('./pages/VoicesListPage'));
const VoicesNewPage = React.lazy(() => import('./pages/VoicesNewPage'));
const VoicesRoomPage = React.lazy(() => import('./pages/VoicesRoomPage'));
const XianxiaCharList = React.lazy(() => import('./pages/xianxia/CharListPage'));
const XianxiaBirth = React.lazy(() => import('./pages/xianxia/BirthPage'));
const XianxiaMain = React.lazy(() => import('./pages/xianxia/MainPage'));
const XianxiaProfile = React.lazy(() => import('./pages/xianxia/ProfilePage'));
const XianxiaMap = React.lazy(() => import('./pages/xianxia/MapPage'));
const XianxiaJournal = React.lazy(() => import('./pages/xianxia/JournalPage'));
const XianxiaJade = React.lazy(() => import('./pages/xianxia/JadePage'));
const XianxiaLegacy = React.lazy(() => import('./pages/xianxia/LegacyPage'));

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
    <div className="loading-screen">
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
      <Suspense fallback={<LoadingScreen />}>
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
          <Route path="/xianxia/:characterId/jade" element={<ProtectedRoute><XianxiaJade /></ProtectedRoute>} />
        </Routes>
      </Suspense>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
