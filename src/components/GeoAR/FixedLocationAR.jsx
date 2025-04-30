import React, { useState, useRef, useEffect } from 'react';
import './GeoAR.css';
import * as THREE from 'three';

const FixedLocationAR = ({ modelPath = 'https://jeanrua.com/models/SantaMaria_futuro.glb' }) => {
  const [stage, setStage] = useState('initial'); // "initial", "requesting", "success", "error"
  const [error, setError] = useState(null);
  // Coordenadas fijas: 39°28'09.4"N 0°25'53.5"W convertidas a decimal
  const fixedCoords = {
    latitude: 39.469278,
    longitude: -0.431528
  };
  const [selectedModel, setSelectedModel] = useState(modelPath);
  
  // Lista de modelos disponibles
  const availableModels = [
    { name: 'Oro', path: 'https://jeanrua.com/models/oro.glb' },
    { name: 'Santa María (Actual)', path: 'https://jeanrua.com/models/SantaMaria_actual.glb' },
    { name: 'Santa María (Futuro)', path: 'https://jeanrua.com/models/SantaMaria_futuro.glb' }
  ];

  // Refs para la escena AR y elementos relacionados
  const arSceneRef = useRef(null);
  const modelEntityRef = useRef(null);
  const cameraRef = useRef(null);

  // Función para iniciar la experiencia AR con ubicación fija
  const startFixedLocationAR = () => {
    console.log('[FixedLocationAR] Iniciando experiencia con ubicación fija:', fixedCoords);
    setStage('success');
  };

  // --- Configuración de la escena AR ---
  useEffect(() => {
    if (stage === 'success') {
      console.log('[FixedLocationAR] Iniciando carga de scripts AR...');
      const loadScripts = async () => {
        try {
          if (!window.AFRAME) {
            console.log('[FixedLocationAR] Cargando A-Frame...');
            await loadScript('https://aframe.io/releases/1.3.0/aframe.min.js');
          }
          // Cargar AR.js
          if (!window.AFRAME || !window.AFRAME.components['gps-camera']) {
            console.log('[FixedLocationAR] Cargando AR.js para A-Frame...');
            await loadScript('https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.js');
          }
          // Pausa breve para asegurar que los scripts se inicialicen
          setTimeout(() => {
            initARScene();
          }, 1000);
        } catch (e) {
          console.error('[FixedLocationAR] Error al cargar scripts AR:', e);
          setError('Error al cargar los scripts AR: ' + e.message);
          setStage('error');
        }
      };
      loadScripts();
    }
  }, [stage]);

  // Función para cargar un script dinámicamente
  const loadScript = (src) => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => {
        console.log('[FixedLocationAR] Script cargado:', src);
        resolve();
      };
      script.onerror = (err) => {
        console.error('[FixedLocationAR] Error cargando script:', src, err);
        reject(err);
      };
      document.head.appendChild(script);
    });
  };

  // Función para inicializar la escena AR
  const initARScene = () => {
    console.log('[FixedLocationAR] Inicializando escena AR...');
    if (!arSceneRef.current) {
      // Crear contenedor para la escena AR
      const arContainer = document.createElement('div');
      arContainer.className = 'ar-scene-container';
      arContainer.style.position = 'fixed';
      arContainer.style.top = '0';
      arContainer.style.left = '0';
      arContainer.style.width = '100%';
      arContainer.style.height = '100%';
      arContainer.style.zIndex = '1000';
      document.body.appendChild(arContainer);
      console.log('[FixedLocationAR] Contenedor AR creado.');

      // Crear la escena A-Frame
      const scene = document.createElement('a-scene');
      scene.setAttribute('embedded', '');
      scene.setAttribute('arjs', 'sourceType: webcam; debugUIEnabled: false; detectionMode: mono_and_matrix;');
      arContainer.appendChild(scene);

      // Agregar la entidad del modelo 3D
      const entity = document.createElement('a-entity');
      entity.setAttribute('gltf-model', selectedModel);
      entity.setAttribute('gps-entity-place', `latitude: ${fixedCoords.latitude}; longitude: ${fixedCoords.longitude}`);
      entity.setAttribute('scale', '10 10 10');
      entity.setAttribute('position', '0 0 0');
      entity.setAttribute('rotation', '0 0 0');
      // Permitir que el usuario pueda atravesar el modelo
      entity.setAttribute('material', 'opacity: 0.9; transparent: true;');
      entity.setAttribute('data-aframe-traverse', 'true');
      scene.appendChild(entity);
      modelEntityRef.current = entity;
      console.log('[FixedLocationAR] Modelo 3D agregado a la escena en ubicación fija.');

      // Crear la cámara con gps-camera de AR.js
      const camera = document.createElement('a-camera');
      camera.setAttribute('gps-camera', 'simulateLatitude: 0; simulateLongitude: 0; minDistance: 0; maxDistance: 100000');
      camera.setAttribute('rotation-reader', '');
      camera.setAttribute('look-controls', 'enabled: true; magicWindowTrackingEnabled: true; touchEnabled: true; mouseEnabled: true');
      camera.setAttribute('wasd-controls', 'enabled: true; acceleration: 100;');
      scene.appendChild(camera);
      cameraRef.current = camera;
      console.log('[FixedLocationAR] Cámara AR creada.');

      // Escuchar el evento "loaded" de la escena
      scene.addEventListener('loaded', () => {
        console.log('[FixedLocationAR] Escena AR cargada correctamente');
      });
      arSceneRef.current = scene;

      // Botón para volver
      const backButton = document.createElement('button');
      backButton.textContent = 'Volver';
      backButton.className = 'ar-back-button';
      backButton.style.position = 'fixed';
      backButton.style.top = '10px';
      backButton.style.left = '10px';
      backButton.style.zIndex = '2000';
      backButton.style.padding = '8px 16px';
      backButton.style.backgroundColor = 'rgba(0,0,0,0.7)';
      backButton.style.color = 'white';
      backButton.style.border = 'none';
      backButton.style.borderRadius = '4px';
      backButton.addEventListener('click', () => {
        if (arContainer.parentNode) {
          arContainer.parentNode.removeChild(arContainer);
          console.log('[FixedLocationAR] Contenedor AR eliminado.');
        }
        window.location.href = '/';
      });
      arContainer.appendChild(backButton);

      // Selector de modelos en AR
      const modelSelector = document.createElement('div');
      modelSelector.className = 'ar-model-selector';
      modelSelector.style.position = 'fixed';
      modelSelector.style.top = '10px';
      modelSelector.style.right = '10px';
      modelSelector.style.zIndex = '2000';
      modelSelector.style.backgroundColor = 'rgba(0,0,0,0.7)';
      modelSelector.style.padding = '10px';
      modelSelector.style.borderRadius = '4px';
      modelSelector.style.color = 'white';
      
      const modelLabel = document.createElement('div');
      modelLabel.textContent = 'Modelo:';
      modelLabel.style.marginBottom = '5px';
      modelSelector.appendChild(modelLabel);
      
      const selectElement = document.createElement('select');
      selectElement.style.padding = '5px';
      selectElement.style.width = '100%';
      selectElement.style.borderRadius = '4px';
      selectElement.style.border = 'none';
      selectElement.style.backgroundColor = 'white';
      
      availableModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.path;
        option.textContent = model.name;
        option.selected = model.path === selectedModel;
        selectElement.appendChild(option);
      });
      
      selectElement.addEventListener('change', (e) => {
        const newModelPath = e.target.value;
        setSelectedModel(newModelPath);
      });
      
      modelSelector.appendChild(selectElement);
      arContainer.appendChild(modelSelector);

      // Mostrar las coordenadas fijas
      const coordsDisplay = document.createElement('div');
      coordsDisplay.className = 'ar-coords-display';
      coordsDisplay.style.position = 'fixed';
      coordsDisplay.style.top = '60px';
      coordsDisplay.style.left = '10px';
      coordsDisplay.style.zIndex = '2000';
      coordsDisplay.style.backgroundColor = 'rgba(0,0,0,0.7)';
      coordsDisplay.style.color = 'white';
      coordsDisplay.style.padding = '8px';
      coordsDisplay.style.borderRadius = '4px';
      coordsDisplay.style.fontSize = '12px';
      coordsDisplay.innerHTML = `
        <p>Ubicación Fija:</p>
        <p>Lat: ${fixedCoords.latitude.toFixed(6)}</p>
        <p>Lon: ${fixedCoords.longitude.toFixed(6)}</p>
      `;
      arContainer.appendChild(coordsDisplay);
      console.log('[FixedLocationAR] Escena AR configurada con éxito.');

      // Controles en pantalla para navegación
      const navControls = document.createElement('div');
      navControls.className = 'ar-nav-controls';
      navControls.style.position = 'fixed';
      navControls.style.bottom = '20px';
      navControls.style.left = '50%';
      navControls.style.transform = 'translateX(-50%)';
      navControls.style.display = 'flex';
      navControls.style.gap = '10px';
      navControls.style.zIndex = '2000';

      // Botón para acercarse
      const moveForwardBtn = document.createElement('button');
      moveForwardBtn.innerHTML = '&#x2B06;'; // Flecha hacia arriba
      moveForwardBtn.style.width = '50px';
      moveForwardBtn.style.height = '50px';
      moveForwardBtn.style.borderRadius = '50%';
      moveForwardBtn.style.border = 'none';
      moveForwardBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      moveForwardBtn.style.color = 'white';
      moveForwardBtn.style.fontSize = '24px';
      moveForwardBtn.style.cursor = 'pointer';
      moveForwardBtn.addEventListener('mousedown', () => {
        if (cameraRef.current) {
          const moveInterval = setInterval(() => {
            const direction = new THREE.Vector3(0, 0, -1);
            direction.applyQuaternion(cameraRef.current.object3D.quaternion);
            cameraRef.current.object3D.position.add(direction.multiplyScalar(0.2));
          }, 20);
          moveForwardBtn.addEventListener('mouseup', () => clearInterval(moveInterval));
          moveForwardBtn.addEventListener('mouseleave', () => clearInterval(moveInterval));
        }
      });
      navControls.appendChild(moveForwardBtn);

      // Botón para retroceder
      const moveBackBtn = document.createElement('button');
      moveBackBtn.innerHTML = '&#x2B07;'; // Flecha hacia abajo
      moveBackBtn.style.width = '50px';
      moveBackBtn.style.height = '50px';
      moveBackBtn.style.borderRadius = '50%';
      moveBackBtn.style.border = 'none';
      moveBackBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      moveBackBtn.style.color = 'white';
      moveBackBtn.style.fontSize = '24px';
      moveBackBtn.style.cursor = 'pointer';
      moveBackBtn.addEventListener('mousedown', () => {
        if (cameraRef.current) {
          const moveInterval = setInterval(() => {
            const direction = new THREE.Vector3(0, 0, 1);
            direction.applyQuaternion(cameraRef.current.object3D.quaternion);
            cameraRef.current.object3D.position.add(direction.multiplyScalar(0.2));
          }, 20);
          moveBackBtn.addEventListener('mouseup', () => clearInterval(moveInterval));
          moveBackBtn.addEventListener('mouseleave', () => clearInterval(moveInterval));
        }
      });
      navControls.appendChild(moveBackBtn);

      arContainer.appendChild(navControls);

      // Mensaje de ayuda para navegación
      const helpMessage = document.createElement('div');
      helpMessage.style.position = 'fixed';
      helpMessage.style.bottom = '80px';
      helpMessage.style.left = '50%';
      helpMessage.style.transform = 'translateX(-50%)';
      helpMessage.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      helpMessage.style.color = 'white';
      helpMessage.style.padding = '10px';
      helpMessage.style.borderRadius = '4px';
      helpMessage.style.fontSize = '14px';
      helpMessage.style.textAlign = 'center';
      helpMessage.style.zIndex = '2000';
      helpMessage.innerHTML = 'Mueve el dispositivo para mirar alrededor<br>Camina para moverte dentro del modelo<br>Usa los botones para avanzar/retroceder';
      helpMessage.style.opacity = '1';
      setTimeout(() => {
        helpMessage.style.transition = 'opacity 1s';
        helpMessage.style.opacity = '0';
        setTimeout(() => {
          helpMessage.style.display = 'none';
        }, 1000);
      }, 5000);
      arContainer.appendChild(helpMessage);
    }
  };

  // Función para actualizar el modelo 3D en la escena AR
  const updateARModel = (modelPath) => {
    if (modelEntityRef.current) {
      console.log('[FixedLocationAR] Actualizando modelo a:', modelPath);
      modelEntityRef.current.setAttribute('gltf-model', modelPath);
    }
  };

  // Efecto para actualizar el modelo cuando cambie selectedModel
  useEffect(() => {
    if (stage === 'success' && modelEntityRef.current) {
      updateARModel(selectedModel);
    }
  }, [selectedModel, stage]);

  return (
    <div className="geo-ar-container">
      {/* Pantalla inicial: Información sobre ubicación fija */}
      {stage === 'initial' && (
        <div className="geo-ar-permission">
          <h2>AR con Ubicación Fija</h2>
          <p>Esta experiencia mostrará un modelo 3D en una ubicación geográfica predefinida:</p>
          <p className="fixed-location-info">
            Coordenadas: 39°28'09.4"N 0°25'53.5"W
          </p>
          
          {/* Selector de modelos 3D */}
          <div className="model-selector">
            <h3>Selecciona un modelo 3D:</h3>
            <select 
              value={selectedModel} 
              onChange={(e) => setSelectedModel(e.target.value)}
              className="geo-ar-model-select"
            >
              {availableModels.map((model, index) => (
                <option key={index} value={model.path}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>
          
          <img 
            src="https://cdn-icons-png.flaticon.com/512/684/684908.png" 
            alt="GPS icon" 
            className="geo-ar-location-icon" 
          />
          
          <button 
            onClick={startFixedLocationAR} 
            className="geo-ar-permission-btn"
          >
            Iniciar Experiencia AR en Ubicación Fija
          </button>
          
          <button onClick={() => window.history.back()} className="geo-ar-back-btn">
            Volver
          </button>
        </div>
      )}

      {/* Pantalla de éxito: Mientras se cargan los scripts AR */}
      {stage === 'success' && (
        <div className="geo-ar-success">
          <div className="geo-ar-loading">
            <div className="geo-ar-spinner"></div>
            <p>Iniciando experiencia AR...</p>
            <p className="geo-ar-coords-display">
              Ubicación Fija: {fixedCoords.latitude.toFixed(6)}, {fixedCoords.longitude.toFixed(6)}
            </p>
          </div>
        </div>
      )}

      {/* Pantalla de error */}
      {stage === 'error' && (
        <div className="geo-ar-error">
          <h3>Error</h3>
          <p>{error}</p>
          <div className="geo-ar-error-buttons">
            <button onClick={startFixedLocationAR} className="geo-ar-retry-btn">
              Intentar nuevamente
            </button>
            <button onClick={() => window.history.back()} className="geo-ar-back-btn">
              Volver
            </button>
          </div>
        </div>
      )}

      {/* Rincón de Debug: Mostrar detalles de error (si existen) */}
      {error && (
        <div className="geo-ar-debug" style={{
          position: 'fixed',
          bottom: '0',
          left: '0',
          right: '0',
          backgroundColor: 'rgba(255, 0, 0, 0.8)',
          color: 'white',
          padding: '5px',
          fontSize: '10px',
          zIndex: 3000,
          textAlign: 'center'
        }}>
          Debug Error: {error}
        </div>
      )}
    </div>
  );
};

export default FixedLocationAR; 