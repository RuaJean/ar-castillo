import React, { useState, useRef, useEffect } from 'react';
import './GeoAR.css';

const GeoAR = ({ modelPath = 'https://jeanrua.com/models/SantaMaria_futuro.glb' }) => {
  const [stage, setStage] = useState('initial'); // "initial", "requesting", "success", "error"
  const [error, setError] = useState(null);
  const [coords, setCoords] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState(null);
  const [gpsWatchId, setGpsWatchId] = useState(null);
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

  // Al montar, consultar el estado del permiso (si es compatible)
  useEffect(() => {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' })
        .then((status) => {
          console.log('[GeoAR] Estado del permiso de geolocalización:', status.state);
          setPermissionStatus(status.state);
          status.onchange = () => {
            console.log('[GeoAR] Cambio en el estado del permiso:', status.state);
            setPermissionStatus(status.state);
          };
        })
        .catch(err => {
          console.error('[GeoAR] Error al consultar permisos:', err);
          setError(`Error consultando permisos: ${err.message}`);
        });
    } else {
      console.log('[GeoAR] API Permissions no soportada en este navegador');
    }
  }, []);

  // Función para solicitar la ubicación usando getCurrentPosition con mayor detalle en el error
  const requestGeolocation = () => {
    console.log('[GeoAR] Solicitando geolocalización...');
    
    // Resetear permisos en móviles si están denegados
    if (navigator.userAgent.match(/Android|iPhone|iPad|iPod/i) && permissionStatus === 'denied') {
      if (navigator.permissions && navigator.permissions.revoke) {
        navigator.permissions.revoke({ name: 'geolocation' }).then(() => {
          console.log('[GeoAR] Permisos reseteados, recargando...');
          window.location.reload();
        });
        return;
      } else {
        setError('Debes reiniciar el navegador o habilitar manualmente los permisos en Configuración > Ubicación');
        setStage('error');
        return;
      }
    }
    
    if (window.location.protocol !== 'https:') {
      const msg = 'La geolocalización solo funciona en HTTPS. Usa un dominio seguro.';
      console.error('[GeoAR]', msg);
      setError(msg);
      setStage('error');
      return;
    }
    
    // Nueva verificación para dispositivos móviles
    if (navigator.userAgent.match(/Android|iPhone|iPad|iPod/i)) {
      if (!navigator.geolocation || typeof navigator.geolocation.getCurrentPosition !== 'function') {
        const mobileError = `Geolocalización no soportada en este dispositivo. Verifica:
          1. GPS activado
          2. Permisos de ubicación habilitados
          3. Navegador actualizado`;
        setError(mobileError);
        setStage('error');
        return;
      }
    }
    
    setStage('requesting');
    setError(null);

    const options = {
      enableHighAccuracy: true,
      timeout: 15000,  // Aumentar tiempo de espera
      maximumAge: 0,
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log('[GeoAR] Ubicación obtenida:', position);
        const newCoords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setCoords(newCoords);
        setStage('success');
        startPositionTracking(newCoords);
      },
      (err) => {
        console.error('[GeoAR] Error retrieving location:', err);
        // Detallar código y mensaje del error
        let errorMessage = `Error obteniendo ubicación: ${err.message}`;
        if (err.code === 1) {
          errorMessage = `Permiso denegado. Debes:
            1. Tocar "Reiniciar Permisos"
            2. Habilitar ubicación
            3. Recargar la página`;
        }
        setError(errorMessage);
        setStage('error');
      },
      options
    );

    const timeout = setTimeout(() => {
      setError('El GPS está tardando demasiado. Verifica: 1. Conexión a internet 2. GPS activado 3. Permisos habilitados');
      setStage('error');
    }, 15000);
  };

  // Función para calcular un punto a cierta distancia de la ubicación del usuario
  const calculatePointAtDistance = (lat, lon, distanceMeters, bearing = 0) => {
    // Radio de la Tierra en metros
    const R = 6378137;
    
    // Convertir a radianes
    const latRad = lat * Math.PI / 180;
    const lonRad = lon * Math.PI / 180;
    const bearingRad = bearing * Math.PI / 180;
    
    // Cálculo del nuevo punto
    const d = distanceMeters / R;
    const newLatRad = Math.asin(Math.sin(latRad) * Math.cos(d) + 
                      Math.cos(latRad) * Math.sin(d) * Math.cos(bearingRad));
    const newLonRad = lonRad + Math.atan2(Math.sin(bearingRad) * Math.sin(d) * Math.cos(latRad),
                       Math.cos(d) - Math.sin(latRad) * Math.sin(newLatRad));
    
    // Convertir de vuelta a grados
    const newLat = newLatRad * 180 / Math.PI;
    const newLon = newLonRad * 180 / Math.PI;
    
    return { latitude: newLat, longitude: newLon };
  };

  // Función para iniciar seguimiento continuo de la posición
  const startPositionTracking = (initialCoords) => {
    console.log('[GeoAR] Iniciando seguimiento de posición...');
    
    // Calcular una posición a 10 metros de distancia del usuario (rumbo norte)
    const modelPosition = calculatePointAtDistance(
      initialCoords.latitude, 
      initialCoords.longitude, 
      15, // 10 metros de distancia (reducido de 20m)
      0   // Dirección norte (0 grados)
    );
    
    console.log('[GeoAR] Posición del usuario:', initialCoords);
    console.log('[GeoAR] Posición calculada para el modelo (10m al norte):', modelPosition);
    
    // El modelo se coloca a 10 metros de distancia
    if (modelEntityRef.current) {
      modelEntityRef.current.setAttribute('gps-projected-entity-place',
        `latitude: ${modelPosition.latitude}; longitude: ${modelPosition.longitude}`);
    }
    
    const id = navigator.geolocation.watchPosition(
      (position) => {
        const updatedCoords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        console.log('[GeoAR] Posición actualizada:', updatedCoords);
        setCoords(updatedCoords);
        
        // No actualizamos la posición del modelo, solo la cámara se mueve
        // con los cambios de posición del usuario (controlado por gps-projected-camera)
        console.log('[GeoAR] Usuario en movimiento, cámara actualizada');
      },
      (err) => {
        console.warn('[GeoAR] Error durante el seguimiento:', err);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
    setGpsWatchId(id);
  };

  // Limpiar el seguimiento al desmontar
  useEffect(() => {
    return () => {
      if (gpsWatchId) {
        navigator.geolocation.clearWatch(gpsWatchId);
        console.log('[GeoAR] Seguimiento de posición cancelado.');
      }
    };
  }, [gpsWatchId]);

  // Función para mostrar el estado de permiso en texto
  const getPermissionText = () => {
    switch (permissionStatus) {
      case 'granted': return 'Permiso concedido';
      case 'denied': return 'Permiso denegado';
      case 'prompt': return 'Se solicitará permiso';
      default: return 'Estado desconocido';
    }
  };

  // --- Configuración de la escena AR ---
  useEffect(() => {
    if (stage === 'success' && coords) {
      console.log('[GeoAR] Ubicación exitosa, iniciando carga de scripts AR...');
      const loadScripts = async () => {
        try {
          if (!window.AFRAME) {
            console.log('[GeoAR] Cargando A-Frame...');
            await loadScript('https://aframe.io/releases/1.3.0/aframe.min.js');
          }
          // Cargar AR.js (usamos githack para evitar problemas de CORS en document.write)
          if (!window.AFRAME || !window.AFRAME.components['gps-camera']) {
            console.log('[GeoAR] Cargando AR.js para A-Frame...');
            await loadScript('https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.js');
          }
          // Pausa breve para asegurar que los scripts se inicialicen
          setTimeout(() => {
            initARScene();
          }, 1000);
        } catch (e) {
          console.error('[GeoAR] Error al cargar scripts AR:', e);
          setError('Error al cargar los scripts AR: ' + e.message);
          setStage('error');
        }
      };
      loadScripts();
    }
  }, [stage, coords]);

  // Función para cargar un script dinámicamente
  const loadScript = (src) => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => {
        console.log('[GeoAR] Script cargado:', src);
        resolve();
      };
      script.onerror = (err) => {
        console.error('[GeoAR] Error cargando script:', src, err);
        reject(err);
      };
      document.head.appendChild(script);
    });
  };

  // Función para inicializar la escena AR
  const initARScene = () => {
    if (!coords) return;
    console.log('[GeoAR] Inicializando escena AR...');
    if (!arSceneRef.current) {
      // Calcular una posición a 10 metros de distancia del usuario (rumbo norte)
      const modelPosition = calculatePointAtDistance(
        coords.latitude, 
        coords.longitude, 
        10, // 10 metros de distancia (reducido de 20m)
        0   // Dirección norte (0 grados)
      );
      
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
      console.log('[GeoAR] Contenedor AR creado.');

      // Crear la escena A-Frame
      const scene = document.createElement('a-scene');
      scene.setAttribute('embedded', '');
      // Configurar AR.js en modo "mono_and_matrix" con ubicación activada
      scene.setAttribute('arjs', 'sourceType: webcam; debugUIEnabled: false; detectionMode: mono_and_matrix;');
      arContainer.appendChild(scene);

      // Añadir entorno para mejor percepción de profundidad
      const environment = document.createElement('a-entity');
      environment.setAttribute('id', 'environment');
      scene.appendChild(environment);

      // Agregar marcador visual para ayudar a localizar el modelo
      const marker = document.createElement('a-box');
      marker.setAttribute('gps-projected-entity-place', `latitude: ${modelPosition.latitude}; longitude: ${modelPosition.longitude}`);
      marker.setAttribute('scale', '1 5 1');
      marker.setAttribute('position', '0 2.5 0');
      marker.setAttribute('color', '#FF5733');
      marker.setAttribute('emissive', '#FF5733');
      marker.setAttribute('emissive-intensity', '0.5');
      scene.appendChild(marker);
      
      // Agregar la entidad del modelo 3D a 10 metros de distancia
      const entity = document.createElement('a-entity');
      entity.setAttribute('gltf-model', selectedModel);
      entity.setAttribute('gps-projected-entity-place', `latitude: ${modelPosition.latitude}; longitude: ${modelPosition.longitude}`);
      entity.setAttribute('scale', '15 15 15'); // Aumentado tamaño para mejor visibilidad
      entity.setAttribute('position', '0 0 0');
      entity.setAttribute('rotation', '0 0 0');
      scene.appendChild(entity);
      modelEntityRef.current = entity;
      console.log('[GeoAR] Modelo 3D agregado a 10 metros de distancia del usuario');

      // Crear la cámara que sigue al usuario
      const camera = document.createElement('a-camera');
      camera.setAttribute('gps-projected-camera', '');
      camera.setAttribute('rotation-reader', '');
      camera.setAttribute('look-controls', 'pointerLockEnabled: false');
      camera.setAttribute('position', '0 1.6 0');
      scene.appendChild(camera);
      cameraRef.current = camera;
      console.log('[GeoAR] Cámara AR creada.');

      // Escuchar el evento "loaded" de la escena
      scene.addEventListener('loaded', () => {
        console.log('[GeoAR] Escena AR cargada correctamente');
        // Configurar actualizaciones de posición
        if ('geolocation' in navigator) {
          navigator.geolocation.watchPosition((position) => {
            const currentCamera = cameraRef.current;
            if (currentCamera) {
              console.log('[GeoAR] Actualizando posición de cámara según movimiento del usuario');
              
              // Calcular distancia al modelo
              const userPos = { 
                latitude: position.coords.latitude, 
                longitude: position.coords.longitude 
              };
              const distanceToModel = calculateDistance(userPos, modelPosition);
              
              // Actualizar display con distancia
              const coordsDisplay = document.querySelector('.ar-coords-display');
              if (coordsDisplay) {
                coordsDisplay.innerHTML = `
                  <p>Tu ubicación:</p>
                  <p>Lat: ${position.coords.latitude.toFixed(6)}</p>
                  <p>Lon: ${position.coords.longitude.toFixed(6)}</p>
                  <p>Modelo a ${distanceToModel.toFixed(1)}m al norte</p>
                  <p><b>Busca el marcador naranja</b></p>
                `;
              }
            }
          }, 
          (err) => console.error('[GeoAR] Error en seguimiento:', err), 
          { enableHighAccuracy: true, maximumAge: 0, timeout: 27000 });
        }
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
          console.log('[GeoAR] Contenedor AR eliminado.');
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

      // Mostrar las coordenadas (opcional)
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
        <p>Tu ubicación:</p>
        <p>Lat: ${coords.latitude.toFixed(6)}</p>
        <p>Lon: ${coords.longitude.toFixed(6)}</p>
        <p>Modelo a 10m al norte</p>
        <p><b>Busca el marcador naranja</b></p>
      `;
      arContainer.appendChild(coordsDisplay);
      console.log('[GeoAR] Escena AR configurada con éxito.');
    }
  };

  // Función para calcular la distancia entre dos puntos GPS
  const calculateDistance = (point1, point2) => {
    // Radio de la Tierra en metros
    const R = 6378137;
    
    // Convertir a radianes
    const lat1 = point1.latitude * Math.PI / 180;
    const lon1 = point1.longitude * Math.PI / 180;
    const lat2 = point2.latitude * Math.PI / 180;
    const lon2 = point2.longitude * Math.PI / 180;
    
    // Diferencias
    const dLat = lat2 - lat1;
    const dLon = lon2 - lon1;
    
    // Fórmula haversine
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    return distance; // Distancia en metros
  };

  // Función para actualizar el modelo 3D en la escena AR
  const updateARModel = (modelPath) => {
    if (modelEntityRef.current && coords) {
      console.log('[GeoAR] Actualizando modelo a:', modelPath);
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
      {/* Pantalla inicial: Solicitud de permisos */}
      {stage === 'initial' && (
        <div className="geo-ar-permission">
          <h2>AR Geolocalizado</h2>
          <p>Esta experiencia requiere acceso a tu ubicación precisa</p>
          
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
          
          {/* Nuevas instrucciones para móviles */}
          <div className="mobile-instructions">
            <p>En dispositivos móviles:</p>
            <ol>
              <li>Abre ajustes del navegador</li>
              <li>Habilita permisos de ubicación</li>
              <li>Asegúrate que el GPS esté activado</li>
              <li>Recarga la página</li>
            </ol>
          </div>

          <img 
            src="https://cdn-icons-png.flaticon.com/512/684/684908.png" 
            alt="GPS icon" 
            className="geo-ar-location-icon" 
          />
          {permissionStatus && (
            <div className="geo-ar-permission-status">
              <p>Estado del permiso: <strong>{getPermissionText()}</strong></p>
            </div>
          )}
          <p className="geo-ar-instructions">
            {permissionStatus === 'denied'
              ? 'Debes permitir el acceso a tu ubicación desde la configuración de tu navegador para continuar.'
              : 'Haz clic en "Iniciar Experiencia AR" para solicitar el acceso a tu ubicación.'}
          </p>
          <button 
            onClick={requestGeolocation} 
            className="geo-ar-permission-btn"
            disabled={permissionStatus === 'denied'}
          >
            Iniciar Experiencia AR
          </button>
          
          {/* Nuevo botón para abrir ajustes en móviles */}
          {permissionStatus === 'denied' && (
            <button 
              className="geo-ar-settings-btn"
              onClick={() => {
                // Método universal para abrir configuración en móviles
                if (navigator.permissions && navigator.permissions.revoke) {
                  navigator.permissions.revoke({ name: 'geolocation' }).then(() => {
                    window.location.reload();
                  });
                } else {
                  // Deep link para ajustes de ubicación en Android/iOS
                  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                  window.location.href = isIOS ? 'App-Prefs:Privacy&path=LOCATION' : 'android.settings.LOCATION_SOURCE_SETTINGS';
                }
              }}
            >
              🔄 Reiniciar Permisos de Ubicación
            </button>
          )}
          <button onClick={() => window.history.back()} className="geo-ar-back-btn">
            Volver
          </button>
          
          {/* Nuevo botón para experiencia con ubicación fija */}
          <button 
            onClick={() => window.location.href = '/ar-fijo'} 
            className="geo-ar-fixed-location-btn"
            style={{
              backgroundColor: '#4e9a06',
              marginTop: '10px'
            }}
          >
            Experiencia AR en Ubicación Fija
          </button>
        </div>
      )}

      {/* Pantalla de carga mientras se solicita la ubicación */}
      {stage === 'requesting' && (
        <div className="geo-ar-loading">
          <div className="geo-ar-spinner"></div>
          <p>Accediendo a tu ubicación...</p>
          <p className="geo-ar-loading-hint">
            Si aparece un diálogo de permiso, selecciona "Permitir"
          </p>
        </div>
      )}

      {/* Pantalla de error */}
      {stage === 'error' && (
        <div className="geo-ar-error">
          <h3>Error</h3>
          <p>{error}</p>
          <div className="geo-ar-error-buttons">
            <button onClick={requestGeolocation} className="geo-ar-retry-btn">
              Intentar nuevamente
            </button>
            <button onClick={() => window.history.back()} className="geo-ar-back-btn">
              Volver
            </button>
          </div>
        </div>
      )}

      {/* Pantalla de éxito: Mientras se cargan los scripts AR */}
      {stage === 'success' && coords && (
        <div className="geo-ar-success">
          <div className="geo-ar-loading">
            <div className="geo-ar-spinner"></div>
            <p>Iniciando experiencia AR...</p>
            <p className="geo-ar-coords-display">
              Ubicación: {coords.latitude.toFixed(6)}, {coords.longitude.toFixed(6)}
            </p>
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

export default GeoAR;
