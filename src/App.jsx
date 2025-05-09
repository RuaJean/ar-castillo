import { HashRouter as Router, Route, Routes } from 'react-router-dom';
import GeoAR from './components/GeoAR/GeoAR';
import FixedLocationAR from './components/GeoAR/FixedLocationAR';
import WorldAR from './components/WorldAR/WorldAR';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app-container">
        <div className="content">
          <Routes>
            <Route path="/" element={<GeoAR modelPath="https://jeanrua.com/models/SantaMaria_futuro.glb" />} />
            <Route path="/ar-fijo" element={<FixedLocationAR modelPath="https://jeanrua.com/models/SantaMaria_futuro.glb" />} />
            <Route path="/ar-world" element={<WorldAR />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
