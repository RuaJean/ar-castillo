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
    { name: 'Santa María (Futuro)', path: 'https://jeanrua.com/models/SantaMaria_futuro.glb' },
    { name: 'Carro', path: '/models/car.glb' } // Nuevo modelo local
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
    console.log('[GeoAR] Solicitud de experiencia AR iniciada...');
    
    // Si el usuario eligió coordenadas manuales, usarlas directamente
    if (useManualCoords) {
      // Validar los datos de entrada
      const lat = parseFloat(manualLatitude);
      const lon = parseFloat(manualLongitude);
      
      if (isNaN(lat) || isNaN(lon) || !manualLatitude || !manualLongitude) {
        setError('Por favor, introduce coordenadas numéricas válidas de latitud y longitud.');
        setStage('error');
        return;
      }
      
      if (lat < -90 || lat > 90) {
        setError('La latitud debe estar entre -90 y 90 grados.');
        setStage('error');
        return;
      }
      
      if (lon < -180 || lon > 180) {
        setError('La longitud debe estar entre -180 y 180 grados.');
        setStage('error');
        return;
      }
      
      console.log('[GeoAR] Usando coordenadas manuales:', lat, lon);
      setStage('requesting');
      
      // Simular un breve retraso para dar feedback visual
      setTimeout(() => {
        const manualCoords = {
          latitude: lat,
          longitude: lon
        };
        setCoords(manualCoords);
        setStage('success');
        console.log('[GeoAR] Experiencia iniciada con coordenadas manuales');
      }, 1200);
      
      return;
    }
    
    // Comprobaciones para la ubicación GPS
    console.log('[GeoAR] Solicitando geolocalización GPS...');
    
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
      // Determinar coordenadas del modelo:
      // - Si se usan coordenadas manuales, el modelo va exactamente en esas coordenadas
      // - Si se usa GPS, el modelo se coloca a 10m del usuario en dirección norte
      const modelPosition = useManualCoords 
        ? { ...coords } // Usar exactamente las coordenadas especificadas
        : calculatePointAtDistance(
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
      // Configuración mínima de AR.js: orientación por brújula, sin UI debug
      scene.setAttribute('arjs', 'sourceType: webcam; orientationBase: compass; gpsMinDistance: 0; debugUIEnabled: false;');
      scene.setAttribute('vr-mode-ui', 'enabled: false');
      arContainer.appendChild(scene);

      // Crear el contenedor para el modelo
      const modelContainer = document.createElement('a-entity');
      modelContainer.setAttribute('id', 'model-container');
      // NO establecer posición manual; AR.js calculará la posición relativa
      scene.appendChild(modelContainer);
      
      // Agregar el modelo 3D
      const entity = document.createElement('a-entity');
      entity.setAttribute('id', 'main-model');
      entity.setAttribute('gltf-model', selectedModel);
      // Tamaño real del carro ~1.7 x 0.8 x 3.7 m → usamos escala 1
      entity.setAttribute('scale', '1 1 1');
      modelContainer.appendChild(entity);
      modelEntityRef.current = entity;

      // Crear la cámara
      const camera = document.createElement('a-camera');
      camera.setAttribute('gps-camera', 'gpsMinDistance: 0');
      camera.setAttribute('rotation-reader', '');
      camera.setAttribute('position', '0 1.6 0');
      scene.appendChild(camera);
      cameraRef.current = camera;
      
      // Establecer la posición GPS del modelo (sin proyección)
      modelContainer.setAttribute('gps-entity-place', 
        `latitude: ${modelPosition.latitude}; longitude: ${modelPosition.longitude}`
      );
      
      console.log(`[GeoAR] Contenedor del modelo (${modelContainer.id}) configurado para lat: ${modelPosition.latitude}, lon: ${modelPosition.longitude}`);
      console.log('[GeoAR] Cámara configurada con gps-projected-camera');
      
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
      
      if (useManualCoords) {
        infoPanel.innerHTML = `
          <div>Modelo posicionado en: Lat: ${modelPosition.latitude.toFixed(6)}, Lon: ${modelPosition.longitude.toFixed(6)}</div>
          <div>Para ver el modelo, apunta con tu cámara en diferentes direcciones.</div>
        `;
      } else {
        infoPanel.innerHTML = 'Inicializando rastreo de movimiento...';
      }
      
      arContainer.appendChild(infoPanel);
      
      // Inicializar el modelo en la posición fija basada en GPS
      scene.addEventListener('loaded', () => {
        console.log('[GeoAR] Escena AR cargada correctamente');
        
        // Colocar el modelo en su posición inicial en la escena
        // Guardamos las coordenadas objetivo para calcular distancia en el panel informativo
        initialModelPosition = { latitude: modelPosition.latitude, longitude: modelPosition.longitude };
        
        // Una vez la escena AR está lista, ocultamos la pantalla de carga
        setStage('started');
        
        // Configurar seguimiento continuo de GPS (solo si no usamos coordenadas manuales)
        if ('geolocation' in navigator) {
          // Establecer posición de la cámara (usuario) y del modelo
          // El seguimiento ahora es principalmente para actualizar el panel de información
          // AR.js maneja la posición relativa cámara-modelo con los componentes GPS
          const watchId = navigator.geolocation.watchPosition(
            (position) => {
              try {
                const currentLat = position.coords.latitude;
                const currentLon = position.coords.longitude;
                const heading = position.coords.heading; // Orientación del dispositivo

                // Calcular distancia entre la posición actual y el modelo
                const distanceToModel = calculateDistance(
                  { latitude: currentLat, longitude: currentLon },
                  initialModelPosition
                );

                // Determinar si estamos dentro del modelo
                const isInsideModel = distanceToModel < 5;

                // Actualizar panel informativo (unificado para ambos casos)
                infoPanel.innerHTML = `
                  <div>Distancia al modelo: ${distanceToModel.toFixed(1)}m</div>
                  <div>${isInsideModel ? '¡Estás DENTRO del modelo!' : 'Estás fuera del modelo'}</div>
                  <div style="font-size:10px">Tu Pos: Lat ${currentLat.toFixed(6)}, Lon ${currentLon.toFixed(6)}</div>
                  <div style="font-size:10px">Modelo en: Lat ${initialModelPosition.latitude.toFixed(6)}, Lon ${initialModelPosition.longitude.toFixed(6)}</div>
                  ${heading !== null ? `<div>Orientación: ${Math.round(heading)}°</div>` : ''}
                `;

                infoPanel.style.backgroundColor = isInsideModel ? 'rgba(46,204,113,0.8)' : 'rgba(0,0,0,0.7)';

                console.log(`[GeoAR] Posición GPS actualizada. Distancia al modelo: ${distanceToModel.toFixed(2)}m`);
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
              maximumAge: 0, // Obtener siempre la posición más reciente
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
        cameraRef.current.setAttribute('gps-projected-camera', 'gpsMinAccuracy: 50; gpsMinDistance: 0; gpsTimeInterval: 100');
        modelContainer.setAttribute('position', '0 0 0');
        console.log('[GeoAR] Posición reiniciada');
        infoPanel.innerHTML = useManualCoords 
          ? `Posición reiniciada. Modelo en: Lat ${modelPosition.latitude.toFixed(6)}, Lon ${modelPosition.longitude.toFixed(6)}`
          : 'Posición reiniciada. ¡Comienza a caminar!';
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
    if ((stage === 'success' || stage === 'started') && modelEntityRef.current) {
      updateARModel(selectedModel);
    }
  }, [selectedModel, stage]);

  return (
    <div className="geo-ar-container">
      {/* Pantalla inicial: Solicitud de permisos */}
      {stage === 'initial' && (
        <div className="geo-ar-permission">
          <h2 className="geo-ar-title">AR Geolocalizado</h2>
          
          {/* Contenedor principal de configuración */}
          <div className="geo-ar-config-container">
            {/* Selector de modelos 3D (mejorado) */}
            <div className="geo-ar-config-section">
              <h3 className="geo-ar-section-title">1. Selecciona un modelo 3D</h3>
              <div className="geo-ar-select-wrapper">
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
            </div>

            {/* Selector de ubicación (mejorado) */}
            <div className="geo-ar-config-section">
              <h3 className="geo-ar-section-title">2. Elige la ubicación del modelo</h3>
              
              <div className="geo-ar-location-options">
                <div className="geo-ar-option">
                  <label className="geo-ar-radio-label">
                    <input
                      type="radio"
                      name="locationOption"
                      checked={!useManualCoords}
                      onChange={() => setUseManualCoords(false)}
                    />
                    <span>Usar mi ubicación GPS (el modelo aparecerá cerca)</span>
                  </label>
                </div>
                
                <div className="geo-ar-option">
                  <label className="geo-ar-radio-label">
                    <input
                      type="radio"
                      name="locationOption"
                      checked={useManualCoords}
                      onChange={() => setUseManualCoords(true)}
                    />
                    <span>Fijar coordenadas manualmente</span>
                  </label>
                </div>
              </div>
              
              {useManualCoords && (
                <div className="geo-ar-manual-coords">
                  <div className="geo-ar-input-group">
                    <label>Latitud</label>
                    <input
                      type="number"
                      placeholder="Ej: 40.7128"
                      value={manualLatitude}
                      onChange={(e) => setManualLatitude(e.target.value)}
                      step="any"
                      className="geo-ar-input"
                    />
                  </div>
                  <div className="geo-ar-input-group">
                    <label>Longitud</label>
                    <input
                      type="number"
                      placeholder="Ej: -74.0060"
                      value={manualLongitude}
                      onChange={(e) => setManualLongitude(e.target.value)}
                      step="any"
                      className="geo-ar-input"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Notificación de requisitos */}
          <div className="geo-ar-notice">
            {useManualCoords ? (
              <p>El modelo 3D se colocará en las coordenadas especificadas.</p>
            ) : (
              <div className="geo-ar-gps-notice">
                <img
                  src="https://cdn-icons-png.flaticon.com/512/684/684908.png"
                  alt="GPS icon"
                  className="geo-ar-location-icon"
                />
                <p>Esta experiencia requiere acceso a tu ubicación precisa para colocar el modelo cerca de ti.</p>
              </div>
            )}
          </div>

          {/* Estado del permiso (solo si usa GPS) */}
          {!useManualCoords && permissionStatus && (
            <div className="geo-ar-permission-status">
              <p>Estado del permiso GPS: <strong>{getPermissionText()}</strong></p>
            </div>
          )}

          {/* Instrucciones móviles (solo si usa GPS) */}
          {!useManualCoords && (
            <div className="geo-ar-mobile-instructions">
              <h4>En dispositivos móviles:</h4>
              <ol>
                <li>Abre ajustes del navegador</li>
                <li>Habilita permisos de ubicación</li>
                <li>Asegúrate que el GPS esté activado</li>
                <li>Recarga la página</li>
              </ol>
            </div>
          )}

          {/* Grupo de botones de acción (rediseñados) */}
          <div className="geo-ar-action-buttons">
            <button
              onClick={requestGeolocation}
              className="geo-ar-primary-btn"
              disabled={!useManualCoords && permissionStatus === 'denied'}
            >
              Iniciar Experiencia AR
            </button>
            
            <div className="geo-ar-secondary-buttons">
              <button onClick={() => window.history.back()} className="geo-ar-secondary-btn">
                Volver
              </button>
              
              <button 
                onClick={() => window.location.href = '/ar-fijo'} 
                className="geo-ar-secondary-btn geo-ar-alt-btn"
              >
                Experiencia AR en Ubicación Fija
              </button>
            </div>
          </div>
          
          {/* Botón para reiniciar permisos (solo si están denegados) */}
          {permissionStatus === 'denied' && (
            <button 
              className="geo-ar-reset-btn"
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
