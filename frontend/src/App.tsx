import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import NotFoundPage from './pages/NotFoundPage';
import BadgesPage from './pages/BadgesPage';
import { LeaderboardsPage } from './pages/LeaderboardsPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/badges" element={<BadgesPage />} />
      <Route path="/leaderboards" element={<LeaderboardsPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
