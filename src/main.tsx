import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import { Layout } from './components/Layout';
import Home from './pages/Home';
import Overview from './pages/Overview';
import Register from './pages/Register';
import Squads, { SquadProfile } from './pages/Squads';
import Draw from './pages/Draw';
import Standings from './pages/Standings';
import Schedule from './pages/Schedule';
import Live from './pages/Live';
import Bracket from './pages/Bracket';
import Killers from './pages/Killers';
import Predict from './pages/Predict';
import Prizes from './pages/Prizes';
import Rules from './pages/Rules';
import ReportPage from './pages/Report';
import Staff from './pages/Staff';
import Admin from './pages/Admin';
import Champions from './pages/Champions';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/overview" element={<Overview />} />
          <Route path="/register" element={<Register />} />
          <Route path="/squads" element={<Squads />} />
          <Route path="/squads/:id" element={<SquadProfile />} />
          <Route path="/draw" element={<Draw />} />
          <Route path="/standings" element={<Standings />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/live" element={<Live />} />
          <Route path="/live/:number" element={<Live />} />
          <Route path="/bracket" element={<Bracket />} />
          <Route path="/killers" element={<Killers />} />
          <Route path="/predict" element={<Predict />} />
          <Route path="/prizes" element={<Prizes />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/staff" element={<Staff />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/champions" element={<Champions />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Layout>
    </HashRouter>
  </React.StrictMode>,
);
