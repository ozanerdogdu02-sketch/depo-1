import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Education from './pages/Education';
import MoodJournal from './pages/MoodJournal';
import Admin from './pages/Admin';
import Pricing from './pages/Pricing';

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/education" element={<Education />} />
            <Route path="/mood" element={<MoodJournal />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/pricing" element={<Pricing />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AppProvider>
  );
}
