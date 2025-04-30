import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';

import Home from './components/Home';
import ARView from './components/ARView';
import ARViewTest from './components/ARViewTest';
import ModelOptimizer from './components/ModelOptimizer';

const App: React.FC = () => {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/ar" element={<ARView />} />
          <Route path="/ar-test" element={<ARViewTest />} />
          <Route path="/optimize-model" element={<ModelOptimizer />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;
