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
    scene.setAttribute('webxr', 'mode: ar; requiredFeatures: hit-test; optionalFeatures: local-floor;');
    scene.setAttribute('vr-mode-ui', 'enabled: false');
    scene.setAttribute('embedded', '');

    // Cámara WebXR
    const camera = document.createElement('a-camera');
    camera.setAttribute('look-controls', 'enabled: false');
    scene.appendChild(camera);

    // Retícula + hit-test con creación automática de ANCHOR
    const reticle = document.createElement('a-entity');
    reticle.setAttribute('id', 'reticle');
    reticle.setAttribute('ar-hit-test', 'type: plane; anchor: true;');
    // Añadimos una malla slim para visualizar el punto de impacto
    const ring = document.createElement('a-ring');
    ring.setAttribute('radius-inner', '0.05');
    ring.setAttribute('radius-outer', '0.06');
    ring.setAttribute('rotation', '-90 0 0');
    ring.setAttribute('material', 'color: #FFC107; shader: flat; opacity: 0.8');
    reticle.appendChild(ring);
    scene.appendChild(reticle);

    // Cuando el usuario toca la pantalla y se genera un anchor
    reticle.addEventListener('ar-hit-test-anchor-set', (e) => {
      if (modelRef.current) return;
      const anchorEl = e.detail.anchorEl; // elemento que mantiene la matriz del anchor
      const m = document.createElement('a-entity');
      m.setAttribute('gltf-model', selectedModel);
      m.setAttribute('scale', '1 1 1');
      anchorEl.appendChild(m); // El modelo hereda la matriz del anchor => sin saltos
      modelRef.current = m;
      ring.setAttribute('visible', 'false');
    });

    document.body.appendChild(scene);
    sceneRef.current = scene;
  };

  const handleStart = async () => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    // 1) Comprobar contexto seguro (HTTPS o localhost)
    if (!window.isSecureContext && location.hostname !== 'localhost') {
      setError('WebXR sólo funciona sobre HTTPS. Accede mediante https:// o usa localhost durante el desarrollo.');
      return;
    }

    // 2) Verificar que la API esté expuesta
    if (!navigator.xr) {
      if (isIOS) {
        setError('Actualmente Safari y Chrome en iOS no exponen la API WebXR. Apple sólo ofrece soporte WebXR en visionOS (Apple Vision Pro). Por ahora no es posible iniciar la experiencia AR WebXR desde un iPhone o iPad.');
      } else {
        setError(`Tu navegador no expone la API WebXR.\nAsegúrate de habilitar los flags experimentales (WebXR Device API / WebXR Handheld AR) o utiliza un navegador compatible, por ejemplo Chrome/Edge en Android.`);
      }
      return;
    }

    // 3) Confirmar que soporta sesiones immersive-ar
    try {
      const supported = await navigator.xr.isSessionSupported('immersive-ar');
      if (!supported) {
        setError('Este dispositivo/navegador no soporta sesiones AR inmersivas (WebXR).');
        return;
      }
    } catch (e) {
      console.error(e);
      setError('Error consultando soporte WebXR: ' + e.message);
      return;
    }

    setError(null);
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