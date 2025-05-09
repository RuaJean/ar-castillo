import React, { useState, useRef, useEffect } from 'react';

// Componente WorldAR
// Usa WebXR (immersive-ar) y hit-test para anclar un modelo 3D al mundo real de forma muy estable
// Compatible con Chrome/Edge Android y Safari iOS 17+

const WorldAR = ({ defaultModel = '/models/car.glb' }) => {
  const [started, setStarted] = useState(false);
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState(null);
  const sceneRef = useRef(null);
  const modelRef = useRef(null);

  // Detectar dispositivo y navegador al cargar
  useEffect(() => {
    const userAgent = navigator.userAgent;
    const browserInfo = {
      userAgent,
      isIOS: /iPhone|iPad|iPod/.test(userAgent),
      isSafari: /Safari/.test(userAgent) && !/Chrome/.test(userAgent),
      isChrome: /Chrome/.test(userAgent),
      webXRSupported: !!navigator.xr,
      webXRVersion: navigator.xr ? "Soportado" : "No soportado"
    };
    
    let webXRDetails = "WebXR no detectado";
    
    // Comprobar soporte específico de WebXR
    if (navigator.xr) {
      navigator.xr.isSessionSupported('immersive-ar')
        .then(supported => {
          browserInfo.immersiveARSupported = supported;
          webXRDetails = supported ? "immersive-ar: Soportado" : "immersive-ar: No soportado";
          
          setDebugInfo({
            ...browserInfo,
            webXRDetails
          });
        })
        .catch(err => {
          browserInfo.immersiveARError = err.message;
          webXRDetails = `Error al verificar immersive-ar: ${err.message}`;
          
          setDebugInfo({
            ...browserInfo,
            webXRDetails
          });
        });
    } else {
      let suggestion = "";
      if (browserInfo.isIOS) {
        if (parseInt(userAgent.match(/OS (\d+)_/)[1], 10) >= 17) {
          suggestion = "Aunque tienes iOS 17+, WebXR podría requerir habilitar características experimentales. En Safari, ve a Ajustes > Safari > Funciones experimentales > Realidad Aumentada.";
        } else {
          suggestion = "WebXR requiere iOS 17+ con Safari. Por favor actualiza tu dispositivo.";
        }
      }
      
      setDebugInfo({
        ...browserInfo,
        webXRDetails,
        suggestion
      });
    }
  }, []);

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

  const handleStart = () => {
    if (!navigator.xr) {
      setError('WebXR no soportado en este dispositivo/navegador');
      return;
    }
    setStarted(true);
  };

  const renderDebugPanel = () => {
    if (!debugInfo) return null;
    
    return (
      <div style={{ 
        backgroundColor: 'rgba(0,0,0,0.8)', 
        color: 'white', 
        padding: '10px', 
        borderRadius: '5px',
        marginTop: '20px',
        fontSize: '12px',
        textAlign: 'left'
      }}>
        <h3 style={{ marginTop: '0', color: '#FFC107' }}>Información de Depuración:</h3>
        <p>Navegador: {debugInfo.isSafari ? 'Safari' : debugInfo.isChrome ? 'Chrome' : 'Otro'}</p>
        <p>Dispositivo: {debugInfo.isIOS ? 'iOS' : 'No iOS'}</p>
        <p>WebXR API: {debugInfo.webXRVersion}</p>
        <p>Detalles WebXR: {debugInfo.webXRDetails}</p>
        {debugInfo.suggestion && (
          <p style={{ color: '#FFA500', fontWeight: 'bold' }}>{debugInfo.suggestion}</p>
        )}
        {debugInfo.isIOS && (
          <div style={{ marginTop: '10px', padding: '5px', backgroundColor: 'rgba(255,255,255,0.1)' }}>
            <p style={{ marginTop: '0', fontWeight: 'bold' }}>Instrucciones para iOS 17+:</p>
            <ol style={{ paddingLeft: '20px', margin: '5px 0' }}>
              <li>Abre la app Ajustes</li>
              <li>Navega a Safari</li>
              <li>Desplázate hasta Funciones experimentales</li>
              <li>Activa WebXR Device API</li>
              <li>Activa WebXR Layers API</li>
              <li>Activa WebXR Anchors Module</li>
              <li>Reinicia Safari</li>
            </ol>
          </div>
        )}
        <p style={{ fontSize: '10px', opacity: '0.7', marginBottom: '0' }}>
          User Agent: {debugInfo.userAgent.substring(0, 100)}...
        </p>
      </div>
    );
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
          {renderDebugPanel()}
        </>
      )}
    </div>
  );
};

export default WorldAR; 