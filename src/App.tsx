import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Education from './pages/Education';
import MoodJournal from './pages/MoodJournal';

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/education" element={<Education />} />
            <Route path="/mood" element={<MoodJournal />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AppProvider>
  );
}
