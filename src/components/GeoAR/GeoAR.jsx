import React, { useState, useRef, useEffect } from 'react';
import './GeoAR.css';

const GeoAR = ({ modelPath = '/models/car.glb' }) => {
  const [stage, setStage] = useState('initial'); // "initial", "loading", "started", "error"
  const [error, setError] = useState(null);
  const [selectedModel] = useState(modelPath);

  // Ref para el contenedor de la escena AR para poder limpiarlo después
  const arContainerRef = useRef(null);

  // Inicia el proceso para entrar en modo AR
  const startAR = async () => {
    console.log('[AR] Verificando compatibilidad con WebXR...');
    // Primero, comprobamos si el navegador soporta WebXR para AR.
    if (!navigator.xr || !(await navigator.xr.isSessionSupported('immersive-ar'))) {
      console.error('[AR] WebXR immersive-ar no es compatible en este navegador/dispositivo.');
      setError('Tu navegador o dispositivo no es compatible con la Realidad Aumentada (WebXR). Por favor, usa un navegador moderno como Chrome en Android o Safari en iOS.');
      setStage('error');
      return;
    }

    console.log('[AR] Solicitud de experiencia AR iniciada...');
    setStage('loading'); // Oculta la UI inicial y podría mostrar un spinner

    const sceneEl = initARScene();

    // Escuchador para cuando el usuario sale del modo AR.
    // Esto limpia la escena y resetea el estado de la aplicación.
    sceneEl.addEventListener('exit-vr', () => {
      console.log('[AR] Saliendo de la experiencia AR.');
      if (arContainerRef.current) {
        document.body.removeChild(arContainerRef.current);
        arContainerRef.current = null;
      }
      setStage('initial');
    });

    // Se debe esperar a que la escena de A-Frame esté completamente cargada
    // antes de intentar entrar en modo inmersivo.
    sceneEl.addEventListener('loaded', async () => {
      console.log('[AR] Escena de A-Frame cargada. Intentando entrar en modo AR...');
      try {
        // La llamada a enterVR() debe estar lo más cerca posible de la interacción del usuario.
        // A-Frame se encargará de gestionar la sesión de AR.
        await sceneEl.enterVR();
        setStage('started'); // La escena ya está en modo inmersivo.
      } catch (e) {
        console.error('[AR] Fallo al entrar en modo AR:', e);
        setError('No se pudo iniciar la sesión de Realidad Aumentada. Asegúrate de conceder los permisos para la cámara.');
        setStage('error');
        // Limpia si la entrada falla
        if (arContainerRef.current) {
          document.body.removeChild(arContainerRef.current);
          arContainerRef.current = null;
        }
      }
    });
  };

  // El script de A-Frame se da por cargado globalmente para evitar conflictos.
  // La carga dinámica de scripts se ha eliminado.

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
      // La forma correcta de salir es pedirle a la escena que finalice la sesión de VR/AR.
      // Esto disparará el evento 'exit-vr' que hemos capturado arriba.
      sceneEl.exitVR();
    });
    arUi.appendChild(backButton);
    arContainer.appendChild(arUi);

    // Creación de la escena de A-Frame (se devuelve para poder manipularla)
    const sceneEl = document.createElement('a-scene');

    // Creación de la escena de A-Frame
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

    return sceneEl;
  };

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
      {/*
        Se muestra la pantalla inicial tanto en estado 'initial' como 'loading'.
        La propia pantalla inicial se encarga de mostrar un estado de carga en el botón,
        evitando así una superposición que pueda ocultar los diálogos de permisos del navegador.
      */}
      {(stage === 'initial' || stage === 'loading') && renderInitialScreen()}
      {stage === 'error' && renderErrorScreen()}
    </div>
  );
};

export default GeoAR;
