import React, { useState, useRef, useEffect } from 'react';

// Componente WorldAR
// Usa WebXR (immersive-ar) y hit-test para anclar un modelo 3D al mundo real de forma muy estable
// Compatible con Chrome/Edge Android y Safari iOS 17+

const WorldAR = ({ defaultModel = '/models/car.glb' }) => {
  const [started, setStarted] = useState(false);
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [error, setError] = useState(null);
  const sceneRef = useRef(null);
  const modelRef = useRef(null);

  // Carga dinámica de A-Frame + módulo webxr-hit-test
  useEffect(() => {
    if (!started) return;

    const load = async () => {
      try {
        if (!window.AFRAME) {
          await loadScript('https://aframe.io/releases/1.4.2/aframe.min.js');
        }
        // Módulo hit-test
        if (!window.AFRAME.components['ar-hit-test']) {
          await loadScript('https://unpkg.com/aframe-ar-hit-test-component@1.0.2/dist/aframe-ar-hit-test-component.min.js');
        }
        buildScene();
      } catch (e) {
        console.error(e);
        setError(e.message);
      }
    };
    load();
  }, [started]);

  const loadScript = (src) => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = rej;
    document.head.appendChild(s);
  });

  const buildScene = () => {
    const scene = document.createElement('a-scene');
    scene.setAttribute('renderer', 'colorManagement: true; physicallyCorrectLights: true; logarithmicDepthBuffer: true');
    scene.setAttribute('webxr', 'requiredFeatures: hit-test; optionalFeatures: local-floor;');
    scene.setAttribute('vr-mode-ui', 'enabled: false');
    scene.setAttribute('embedded', '');

    // Cámara WebXR
    const camera = document.createElement('a-camera');
    camera.setAttribute('look-controls', 'enabled: false');
    scene.appendChild(camera);

    // Retícula que indica donde se puede colocar el modelo
    const reticle = document.createElement('a-ring');
    reticle.setAttribute('id', 'reticle');
    reticle.setAttribute('radius-inner', '0.05');
    reticle.setAttribute('radius-outer', '0.06');
    reticle.setAttribute('position', '0 0 -2');
    reticle.setAttribute('rotation', '-90 0 0');
    reticle.setAttribute('material', 'color: #FFC107; shader: flat; opacity: 0.8');
    reticle.setAttribute('visible', 'false');
    scene.appendChild(reticle);

    // Hit-test componente sobre la retícula
    reticle.setAttribute('ar-hit-test', '');

    // Evento cuando hay resultado de hit-test
    reticle.addEventListener('ar-hit-test-select', () => {
      if (modelRef.current) return; // ya colocado
      const m = document.createElement('a-entity');
      m.setAttribute('gltf-model', selectedModel);
      m.setAttribute('scale', '1 1 1');
      // anclar exactamente donde está la retícula
      const { x, y, z } = reticle.object3D.position;
      m.setAttribute('position', `${x} ${y} ${z}`);
      scene.appendChild(m);
      modelRef.current = m;
      reticle.setAttribute('visible', 'false');
    });

    document.body.appendChild(scene);
    sceneRef.current = scene;
  };

  const handleStart = () => {
    if (!navigator.xr) {
      setError('WebXR no soportado en este dispositivo/navegador');
      return;
    }
    setStarted(true);
  };

  return (
    <div style={{ textAlign: 'center', padding: '20px' }}>
      {!started && (
        <>
          <h2>Experiencia AR (WebXR)</h2>
          <p>Selecciona un modelo y pulsa Iniciar. Podrás anclarlo tocando en el suelo a través de la cámara.</p>
          <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
            <option value="/models/car.glb">Carro</option>
            <option value="https://jeanrua.com/models/SantaMaria_actual.glb">Sta. María (Actual)</option>
          </select>
          <br/><br/>
          <button onClick={handleStart}>Iniciar AR</button>
          {error && <p style={{color:'red'}}>{error}</p>}
        </>
      )}
    </div>
  );
};

export default WorldAR; 