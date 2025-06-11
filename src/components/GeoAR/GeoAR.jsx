import React, { useState, useRef, useEffect } from 'react';
import './GeoAR.css';

const GeoAR = ({ modelPath = '/models/car.glb' }) => {
  const [stage, setStage] = useState('initial'); // "initial", "loading", "started", "error"
  const [error, setError] = useState(null);
  const [selectedModel] = useState(modelPath);

  // Ref para el contenedor de la escena AR para poder limpiarlo después
  const arContainerRef = useRef(null);

  // Inicia el proceso para entrar en modo AR
  const startAR = () => {
    console.log('[AR] Solicitud de experiencia AR iniciada...');
    setStage('loading');
  };

  // El script de A-Frame se da por cargado globalmente para evitar conflictos.
  // La carga dinámica de scripts se ha eliminado.

  // Efecto que inicializa la escena AR cuando el estado es 'loading'
  useEffect(() => {
    if (stage === 'loading') {
      // Se asume que A-Frame ya está cargado en la página globalmente (p.ej. en index.html).
      // Los logs del problema indican que A-Frame v1.4.2 ya está presente.
      // Eliminar la carga dinámica de v1.3.0 soluciona conflictos y advertencias de "múltiples instancias de Three.js".
      if (!window.AFRAME) {
        console.error('[AR] A-Frame no encontrado. Asegúrate de que el script de A-Frame está incluido en tu página.');
        setError('Error crítico: A-Frame no está cargado.');
        setStage('error');
        return;
      }
      
      try {
        initARScene();
        setStage('started');
      } catch (e) {
        console.error('[AR] Fallo al inicializar la escena AR:', e);
        setError('No se pudo inicializar la escena de Realidad Aumentada.');
        setStage('error');
      }
    }
  }, [stage]);

  // Función principal para construir la escena de RA
  const initARScene = () => {
    console.log('[AR] Inicializando escena AR con hit-test para anclaje...');

    // Contenedor principal para la escena y la UI
      const arContainer = document.createElement('div');
      arContainer.className = 'ar-scene-container';
      document.body.appendChild(arContainer);
    arContainerRef.current = arContainer;

    // Contenedor para la interfaz de usuario sobre la vista AR
    const arUi = document.createElement('div');
    arUi.id = 'ar-ui';
    arUi.style.pointerEvents = 'none'; // Permite que los toques lleguen a la escena

    // Texto de instrucciones para el usuario
    const instructionText = document.createElement('div');
    instructionText.className = 'ar-instruction';
    instructionText.innerHTML = 'Mueve tu teléfono para detectar una superficie';
    arUi.appendChild(instructionText);

    // Botón para salir de la experiencia AR
    const backButton = document.createElement('button');
    backButton.textContent = 'Salir de AR';
    backButton.className = 'ar-button ar-back-button';
    backButton.style.pointerEvents = 'auto';
    backButton.addEventListener('click', () => {
      // Limpia la escena y vuelve a la pantalla inicial
      if (arContainerRef.current) {
        document.body.removeChild(arContainerRef.current);
        arContainerRef.current = null;
      }
      setStage('initial');
    });
    arUi.appendChild(backButton);
    arContainer.appendChild(arUi);

    // Creación de la escena de A-Frame
    const sceneEl = document.createElement('a-scene');
    sceneEl.setAttribute('embedded', '');
    sceneEl.setAttribute('vr-mode-ui', 'enabled: false');
    
    // La clave está aquí: solicitamos 'hit-test' para poder anclar el objeto a una superficie detectada.
    // 'local-floor' proporciona un punto de partida para el seguimiento.
    // Se elimina 'geospatial' para simplificar y evitar posibles fuentes de error.
    sceneEl.setAttribute('webxr', `
      requiredFeatures: hit-test, local-floor;
      optionalFeatures: light-estimation, dom-overlay;
      overlayElement: #${arUi.id}
    `);

    // Assets: el modelo se cargará directamente en la entidad `a-entity` para evitar
    // problemas de timing con `a-assets` al crear la escena dinámicamente.
    // Por lo tanto, la sección <a-assets> no es necesaria.

    // Contenedor del modelo, que se moverá con la retícula de hit-test
    const modelContainer = document.createElement('a-entity');
    modelContainer.id = 'model-container';
    modelContainer.setAttribute('ar-hit-test', 'type: plane; enabled: true;');
    modelContainer.setAttribute('visible', 'false');

    // Anillo visual (retícula) que indica dónde se anclará el objeto
    const reticleRing = document.createElement('a-entity');
    reticleRing.id = 'reticle-ring';
    reticleRing.setAttribute('geometry', 'primitive: ring; radiusInner: 0.04; radiusOuter: 0.06;');
    reticleRing.setAttribute('material', 'color: #3498db; shader: flat;');
    reticleRing.setAttribute('rotation', '-90 0 0');
    modelContainer.appendChild(reticleRing);
    
    // El modelo 3D real, inicialmente invisible
    const modelEl = document.createElement('a-entity');
    modelEl.id = 'model';
    // Se usa `url()` para cargar el modelo directamente, lo que es más robusto que usar el sistema de assets (#id)
    // cuando la escena se crea por programación.
    modelEl.setAttribute('gltf-model', `url(${selectedModel})`);
    modelEl.setAttribute('scale', '0.3 0.3 0.3'); // Escala inicial aumentada, 0.1 puede ser muy pequeño
    modelEl.setAttribute('visible', 'false');
    modelContainer.appendChild(modelEl);

    sceneEl.appendChild(modelContainer);

    // Iluminación para que el modelo se vea bien
    sceneEl.innerHTML += '<a-light type="ambient" color="#fff" intensity="0.6"></a-light>';
    sceneEl.innerHTML += '<a-light type="directional" color="#fff" intensity="0.7" position="-1 2 1"></a-light>';
    
    arContainer.appendChild(sceneEl);

    let modelPlaced = false;

    // Eventos de ar-hit-test para dar feedback al usuario
    modelContainer.addEventListener('ar-hit-test-start', () => {
      instructionText.innerHTML = 'Sigue moviendo el teléfono...';
    });
    modelContainer.addEventListener('ar-hit-test-achieved', () => {
      modelContainer.setAttribute('visible', 'true');
      if (!modelPlaced) {
        instructionText.innerHTML = 'Toca la pantalla para anclar el coche';
      }
    });

    // Evento de clic en la escena para anclar el modelo
    sceneEl.addEventListener('click', (evt) => {
      if (modelContainer.getAttribute('visible') && !modelPlaced) {
        console.log('[AR] Anclando modelo...');
        modelEl.setAttribute('visible', 'true'); // Hacer visible el coche
        reticleRing.setAttribute('visible', 'false'); // Ocultar la retícula
        modelContainer.setAttribute('ar-hit-test', 'enabled', 'false'); // Desactivar hit-test para que no se mueva más
        
        instructionText.innerHTML = '¡Anclado! Muévete para verlo desde todos los ángulos.';
        modelPlaced = true;
        
        // Añadir botón para reposicionar el modelo
        const repositionButton = document.createElement('button');
        repositionButton.textContent = 'Reposicionar';
        repositionButton.className = 'ar-button ar-reposition-button';
        repositionButton.style.pointerEvents = 'auto';
        repositionButton.addEventListener('click', () => {
           modelPlaced = false;
           modelEl.setAttribute('visible', 'false');
           reticleRing.setAttribute('visible', 'true');
           modelContainer.setAttribute('ar-hit-test', 'enabled', 'true');
           instructionText.innerHTML = 'Toca la pantalla para anclar el coche';
           arUi.removeChild(repositionButton);
        });
        arUi.appendChild(repositionButton);
      }
    });
  };

  // Efecto de limpieza para eliminar la escena AR al salir del componente
  useEffect(() => {
    return () => {
      if (arContainerRef.current) {
        document.body.removeChild(arContainerRef.current);
        arContainerRef.current = null;
      }
    };
  }, []);

  // Renderiza la pantalla inicial con el botón
  const renderInitialScreen = () => (
        <div className="geo-ar-permission">
      <div className="card">
        <h1 className="card-title">Realidad Aumentada</h1>
        <p className="card-subtitle">Ancla un modelo 3D en tu entorno utilizando la cámara de tu dispositivo.</p>
        <div className="action-buttons">
            <button
            onClick={startAR}
            className="primary-btn"
            disabled={stage === 'loading'}
          >
            {stage === 'loading' ? 'Cargando...' : 'Iniciar AR'}
              </button>
            </div>
          </div>
        </div>
  );

  // Renderiza una pantalla de carga mientras se preparan los scripts
  const renderLoadingScreen = () => (
    <div className="geo-ar-loading-overlay">
      <div className="loading-spinner"></div>
      <p className="loading-text">Preparando la experiencia AR...</p>
        </div>
  );

  // Renderiza una pantalla de error si algo falla
  const renderErrorScreen = () => (
    <div className="geo-ar-error-overlay">
      <div className="error-card">
        <h2 className="error-title">Error</h2>
        <p className="error-message">{error}</p>
        <button onClick={() => setStage('initial')} className="primary-btn">
              Volver
            </button>
          </div>
        </div>
  );

  return (
    <div className="geo-ar-container">
      {stage === 'initial' && renderInitialScreen()}
      {stage === 'loading' && <div className="geo-ar-loading-overlay">
          <div className="loading-spinner"></div>
          <p className="loading-text">Preparando la experiencia AR...</p>
        </div>
      }
      {stage === 'error' && renderErrorScreen()}
    </div>
  );
};

export default GeoAR;
