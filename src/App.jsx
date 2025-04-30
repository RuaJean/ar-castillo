import { HashRouter as Router, Route, Routes } from 'react-router-dom';
import GeoAR from './components/GeoAR/GeoAR';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app-container">
        <div className="content">
          <Routes>
            <Route path="/" element={<GeoAR modelPath="https://jeanrua.com/models/SantaMaria_futuro.glb" />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
