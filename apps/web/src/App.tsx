import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Home } from './Home';
import { Join } from './play/Join';
import { PlaySession } from './play/PlaySession';

// Les écrans TV (QR code, lecteur YouTube…) sont chargés à part : les téléphones n'en ont pas besoin.
const TvSetup = lazy(() => import('./tv/TvSetup').then((m) => ({ default: m.TvSetup })));
const TvSession = lazy(() => import('./tv/TvSession').then((m) => ({ default: m.TvSession })));
const AdminApp = lazy(() => import('./admin/AdminApp').then((m) => ({ default: m.AdminApp })));

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="stage min-h-dvh" />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/tv" element={<TvSetup />} />
          <Route path="/tv/:code" element={<TvSession />} />
          <Route path="/join" element={<Join />} />
          <Route path="/play/:code" element={<PlaySession />} />
          <Route path="/admin" element={<AdminApp />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
