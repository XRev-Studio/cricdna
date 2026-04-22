import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { BottomNav } from './components/layout/BottomNav';
import { FeedPage } from './pages/FeedPage';
import { LibraryPage } from './pages/LibraryPage';
import { CapturePage } from './pages/CapturePage';
import { LeaderboardsPage } from './pages/LeaderboardsPage';
import { MePage } from './pages/MePage';
import { ProcessingPage } from './pages/ProcessingPage';
import { CardPage } from './pages/CardPage';
import { LongVideoPage } from './pages/LongVideoPage';

export default function App() {
  return (
    <BrowserRouter>
      <div className="h-full flex flex-col bg-bg-primary">
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <Routes>
            <Route path="/" element={<Navigate to="/feed" replace />} />
            <Route path="/feed" element={<FeedPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/capture" element={<CapturePage />} />
            <Route path="/leaderboards" element={<LeaderboardsPage />} />
            <Route path="/me" element={<MePage />} />
            <Route path="/processing" element={<ProcessingPage />} />
            <Route path="/card" element={<CardPage />} />
            <Route path="/long-video" element={<LongVideoPage />} />
          </Routes>
        </div>
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}
