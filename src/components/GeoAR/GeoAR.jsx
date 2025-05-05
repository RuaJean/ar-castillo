import React, { useState, useRef, useEffect } from 'react';
import './GeoAR.css';

const GeoAR = ({ modelPath = 'https://jeanrua.com/models/SantaMaria_futuro.glb' }) => {
  const [stage, setStage] = useState('initial'); // "initial", "requesting", "success", "error"
  const [error, setError] = useState(null);
  const [coords, setCoords] = useState(null); // Coordenadas del USUARIO (GPS o manuales si se usan como inicio)
  const [permissionStatus, setPermissionStatus] = useState(null);
  const [gpsWatchId, setGpsWatchId] = useState(null); // ID para el watchPosition del panel informativo (opcional)
  const [selectedModel, setSelectedModel] = useState(modelPath);
  const [manualLatitude, setManualLatitude] = useState(''); // Nuevo estado
  const [manualLongitude, setManualLongitude] = useState(''); // Nuevo estado
  const [useManualCoords, setUseManualCoords] = useState(false); // Nuevo estado
  
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
      10, // 10 metros de distancia (reducido de 20m)
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
      // Usar configuración mejorada de AR.js para mejor seguimiento de posición
      scene.setAttribute('arjs', 'sourceType: webcam; debugUIEnabled: false; trackingMethod: best;');
      scene.setAttribute('vr-mode-ui', 'enabled: false');
      arContainer.appendChild(scene);

      // Añadir entorno para mejor percepción de profundidad
      const environment = document.createElement('a-entity');
      environment.setAttribute('id', 'environment');
      scene.appendChild(environment);

      // Crear el contenedor para el modelo
      const modelContainer = document.createElement('a-entity');
      modelContainer.setAttribute('id', 'model-container');
      modelContainer.setAttribute('position', '0 0 0');
      scene.appendChild(modelContainer);
      
      // Agregar marcador visual para ayudar a localizar el modelo
      const marker = document.createElement('a-box');
      marker.setAttribute('scale', '1 5 1');
      marker.setAttribute('position', '0 2.5 0');
      marker.setAttribute('color', '#FF5733');
      marker.setAttribute('emissive', '#FF5733');
      marker.setAttribute('emissive-intensity', '0.5');
      modelContainer.appendChild(marker);
      
      // Agregar el modelo 3D
      const entity = document.createElement('a-entity');
      entity.setAttribute('id', 'main-model');
      entity.setAttribute('gltf-model', selectedModel);
      entity.setAttribute('scale', '15 15 15'); // Tamaño aumentado para mejor visibilidad
      entity.setAttribute('position', '0 0 0');
      entity.setAttribute('rotation', '0 0 0');
      modelContainer.appendChild(entity);
      modelEntityRef.current = entity;

      // Crear la cámara
      const camera = document.createElement('a-entity');
      camera.setAttribute('id', 'camera');
      camera.setAttribute('camera', '');
      camera.setAttribute('position', '0 1.6 0');
      camera.setAttribute('wasd-controls', 'acceleration: 100');
      camera.setAttribute('look-controls', '');
      scene.appendChild(camera);
      cameraRef.current = camera;
      
      console.log('[GeoAR] Modelo 3D y cámara configurados');
      
      // Variables para seguimiento de la posición
      let lastLat = coords.latitude;
      let lastLon = coords.longitude;
      let cameraWorldPosition = { x: 0, y: 1.6, z: 0 };
      let initialModelPosition = null;
      
      // Mostrar panel de información
      const infoPanel = document.createElement('div');
      infoPanel.className = 'ar-info-panel';
      infoPanel.style.position = 'fixed';
      infoPanel.style.bottom = '10px';
      infoPanel.style.left = '50%';
      infoPanel.style.transform = 'translateX(-50%)';
      infoPanel.style.backgroundColor = 'rgba(0,0,0,0.7)';
      infoPanel.style.color = 'white';
      infoPanel.style.padding = '10px';
      infoPanel.style.borderRadius = '5px';
      infoPanel.style.zIndex = '2500';
      infoPanel.style.textAlign = 'center';
      infoPanel.style.width = '80%';
      infoPanel.innerHTML = 'Inicializando rastreo de movimiento...';
      arContainer.appendChild(infoPanel);
      
      // Inicializar el modelo en la posición fija basada en GPS
      scene.addEventListener('loaded', () => {
        console.log('[GeoAR] Escena AR cargada correctamente');
        
        // Colocar el modelo en su posición inicial en la escena
        initialModelPosition = {
          latitude: modelPosition.latitude,
          longitude: modelPosition.longitude
        };
        
        // Configurar seguimiento continuo de GPS
        if ('geolocation' in navigator) {
          const watchId = navigator.geolocation.watchPosition(
            (position) => {
              try {
                const currentLat = position.coords.latitude;
                const currentLon = position.coords.longitude;
                const heading = position.coords.heading;
                
                // Calcular diferencia en metros entre la posición actual y la anterior
                const distNorth = (currentLat - lastLat) * 111111;
                const distEast = (currentLon - lastLon) * 111111 * Math.cos(lastLat * Math.PI / 180);
                
                // Actualizar variables de seguimiento
                lastLat = currentLat;
                lastLon = currentLon;
                
                // Calcular nueva posición de cámara basada en el movimiento GPS
                cameraWorldPosition.x += distEast;
                cameraWorldPosition.z += distNorth;
                
                // Mover el contenedor del modelo en dirección opuesta al movimiento de la cámara
                modelContainer.setAttribute('position', 
                  `${-cameraWorldPosition.x} 0 ${-cameraWorldPosition.z}`);
                
                // Calcular distancia entre la posición actual y el modelo
                const distanceToModel = calculateDistance(
                  { latitude: currentLat, longitude: currentLon },
                  initialModelPosition
                );
                
                // Determinar si estamos dentro del modelo (aproximado, basado en distancia)
                const isInsideModel = distanceToModel < 5; // Consideramos "dentro" si estamos a menos de 5m
                
                // Actualizar panel informativo
                infoPanel.innerHTML = `
                  <div>Distancia al modelo: ${distanceToModel.toFixed(1)}m</div>
                  <div>Estado: ${isInsideModel ? '¡Estás DENTRO del modelo!' : 'Estás fuera del modelo'}</div>
                  <div>Movimiento: ${Math.sqrt(distNorth*distNorth + distEast*distEast).toFixed(2)}m</div>
                  <div style="font-size:10px">Lat: ${currentLat.toFixed(6)}, Lon: ${currentLon.toFixed(6)}</div>
                `;
                
                // Actualizar estilo del panel según si estamos dentro o fuera
                infoPanel.style.backgroundColor = isInsideModel ? 'rgba(46,204,113,0.8)' : 'rgba(0,0,0,0.7)';
                
                console.log(`[GeoAR] Movimiento: ${distNorth.toFixed(2)}m Norte, ${distEast.toFixed(2)}m Este, Distancia al modelo: ${distanceToModel.toFixed(2)}m`);
              } catch (e) {
                console.error('[GeoAR] Error procesando posición:', e);
              }
            },
            (err) => {
              console.error('[GeoAR] Error en seguimiento GPS:', err);
              infoPanel.innerHTML = `Error de GPS: ${err.message}`;
              infoPanel.style.backgroundColor = 'rgba(231,76,60,0.8)';
            },
            { 
              enableHighAccuracy: true, 
              maximumAge: 0, 
              timeout: 15000
            }
          );
          
          setGpsWatchId(watchId);
        }
      });
      
      arSceneRef.current = scene;

      // Botón para reiniciar posición
      const resetButton = document.createElement('button');
      resetButton.textContent = 'Reiniciar Posición';
      resetButton.style.position = 'fixed';
      resetButton.style.bottom = '70px';
      resetButton.style.right = '10px';
      resetButton.style.zIndex = '2000';
      resetButton.style.padding = '8px 16px';
      resetButton.style.backgroundColor = '#3498db';
      resetButton.style.color = 'white';
      resetButton.style.border = 'none';
      resetButton.style.borderRadius = '4px';
      resetButton.addEventListener('click', () => {
        // Reiniciar la posición de la cámara y el modelo
        cameraWorldPosition = { x: 0, y: 1.6, z: 0 };
        modelContainer.setAttribute('position', '0 0 0');
        console.log('[GeoAR] Posición reiniciada');
        infoPanel.innerHTML = 'Posición reiniciada. ¡Comienza a caminar!';
      });
      arContainer.appendChild(resetButton);

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
        if (gpsWatchId) {
          navigator.geolocation.clearWatch(gpsWatchId);
        }
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
          <div className="model-selector">
            <h3>1. Selecciona un modelo 3D:</h3>
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

          <div className="manual-coords-selector">
            <h3>2. Elige la ubicación del modelo:</h3>
            <label className="geo-ar-checkbox-label">
              <input
                type="checkbox"
                checked={!useManualCoords}
                onChange={(e) => setUseManualCoords(!e.target.checked)}
              />
              Usar mi ubicación GPS (el modelo aparecerá cerca)
            </label>
            <label className="geo-ar-checkbox-label">
              <input
                type="checkbox"
                checked={useManualCoords}
                onChange={(e) => setUseManualCoords(e.target.checked)}
              />
              Fijar coordenadas manualmente:
            </label>
            {useManualCoords && (
              <div className="manual-coords-inputs">
                <input
                  type="number"
                  placeholder="Latitud (ej: 40.7128)"
                  value={manualLatitude}
                  onChange={(e) => setManualLatitude(e.target.value)}
                  step="any"
                  className="geo-ar-coord-input"
                />
                <input
                  type="number"
                  placeholder="Longitud (ej: -74.0060)"
                  value={manualLongitude}
                  onChange={(e) => setManualLongitude(e.target.value)}
                  step="any"
                  className="geo-ar-coord-input"
                />
              </div>
            )}
          </div>

          <p>
            {useManualCoords
              ? 'El modelo se colocará en las coordenadas especificadas.'
              : 'Esta experiencia requiere acceso a tu ubicación precisa para colocar el modelo cerca de ti.'}
          </p>

          {!useManualCoords && (
            <>
              <img
                src="https://cdn-icons-png.flaticon.com/512/684/684908.png"
                alt="GPS icon"
                className="geo-ar-location-icon"
              />
              {permissionStatus && (
                <div className="geo-ar-permission-status">
                  <p>Estado del permiso GPS: <strong>{getPermissionText()}</strong></p>
                </div>
              )}
              <p className="geo-ar-instructions">
                {permissionStatus === 'denied'
                  ? 'Debes permitir el acceso a tu ubicación desde la configuración de tu navegador para continuar.'
                  : 'Haz clic en "Iniciar Experiencia AR" para solicitar el acceso a tu ubicación.'}
              </p>
            </>
          )}
          
          {!useManualCoords && (
            <div className="mobile-instructions">
              <p>En móviles (si usas GPS):</p>
              <ol>
                <li>Abre ajustes del navegador</li>
                <li>Habilita permisos de ubicación</li>
                <li>Asegúrate que el GPS esté activado</li>
                <li>Recarga la página</li>
              </ol>
            </div>
          )}

          <button
            onClick={requestGeolocation}
            className="geo-ar-permission-btn"
            disabled={!useManualCoords && permissionStatus === 'denied'}
          >
            Iniciar Experiencia AR
          </button>
          
          {permissionStatus === 'denied' && (
            <button 
              className="geo-ar-settings-btn"
              onClick={() => {
                if (navigator.permissions && navigator.permissions.revoke) {
                  navigator.permissions.revoke({ name: 'geolocation' }).then(() => {
                    window.location.reload();
                  });
                } else {
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
