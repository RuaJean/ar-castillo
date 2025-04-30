import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import '../styles/ARView.css'; // Mantener estilos existentes si son necesarios

// Logging simplificado (adaptado de GeoAR)
const loggerAR = {
  log: (message: string, ...args: any[]) => console.log(`[ARVIEW][LOG] ${message}`, ...args),
  info: (message: string, ...args: any[]) => console.info(`[ARVIEW][INFO] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[ARVIEW][WARN] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ARVIEW][ERROR] ${message}`, ...args)
};

const ARView: React.FC = () => {
  const [stage, setStage] = useState<'initial' | 'requesting' | 'success' | 'error'>('initial');
  const [error, setError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionState | null>(null);
  const [gpsWatchId, setGpsWatchId] = useState<number | null>(null);
  const [currentCoords, setCurrentCoords] = useState<{ latitude: number; longitude: number } | null>(null); // Para mostrar la ubicación del usuario

  // Coordenadas fijas del objetivo (Castillo Santa María) y URL del modelo
  const targetLat = 39.469278;
  const targetLng = -0.431528;
  const modelUrl = 'https://jeanrua.com/models/SantaMaria_futuro_packed.glb'; // Usar la URL específica

  // Refs para la escena AR
  const arSceneContainerRef = useRef<HTMLDivElement | null>(null);
  const arSceneRef = useRef<any>(null); // Referencia a a-scene
  const cameraRef = useRef<any>(null); // Referencia a a-camera
  const modelEntityRef = useRef<any>(null); // Referencia a a-entity del modelo

  // Carga dinámica de scripts A-Frame y AR.js
  const loadScript = (src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        loggerAR.info(`Script ya cargado: ${src}`);
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => {
        loggerAR.info(`Script cargado: ${src}`);
        resolve();
      };
      script.onerror = (err) => {
        loggerAR.error(`Error cargando script: ${src}`, err);
        reject(new Error(`Error al cargar ${src}`));
      };
      document.head.appendChild(script);
    });
  };

  // Consultar estado del permiso al montar
  useEffect(() => {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' })
        .then((status) => {
          loggerAR.info('Estado inicial del permiso de geolocalización:', status.state);
          setPermissionStatus(status.state);
          status.onchange = () => {
            loggerAR.info('Cambio en el estado del permiso:', status.state);
            setPermissionStatus(status.state);
          };
        })
        .catch(err => {
          loggerAR.error('Error al consultar permisos:', err);
          setError(`Error consultando permisos: ${err.message}`);
        });
    } else {
      loggerAR.info('API Permissions no soportada.');
    }
    
    // Limpieza al desmontar
    return () => {
      if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
        loggerAR.info('Seguimiento de posición cancelado.');
      }
      // Eliminar el contenedor de la escena AR si existe
      if (arSceneContainerRef.current && arSceneContainerRef.current.parentNode) {
         arSceneContainerRef.current.parentNode.removeChild(arSceneContainerRef.current);
         loggerAR.info('Contenedor AR eliminado del DOM.');
      }
    };
  }, [gpsWatchId]); // Dependencia añadida para limpieza correcta

  // Función para solicitar geolocalización
  const requestGeolocation = () => {
    loggerAR.info('Solicitando geolocalización...');
    
    if (window.location.protocol !== 'https:') {
      const msg = 'La geolocalización requiere HTTPS.';
      loggerAR.error(msg);
      setError(msg);
      setStage('error');
      return;
    }

    if (!navigator.geolocation) {
       const msg = 'Geolocalización no soportada en este navegador/dispositivo.';
       loggerAR.error(msg);
       setError(msg);
       setStage('error');
       return;
    }

    setStage('requesting');
    setError(null);

    const options = {
      enableHighAccuracy: true,
      timeout: 20000, // Aumentar timeout
      maximumAge: 0,
    };

    // Usar getCurrentPosition solo para obtener la confirmación del permiso y la primera ubicación
    navigator.geolocation.getCurrentPosition(
      (position) => {
        loggerAR.info('Permiso concedido y ubicación inicial obtenida:', position.coords);
        setCurrentCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setStage('success');
        // Iniciar seguimiento continuo *después* de confirmar el éxito
        startPositionTracking();
      },
      (err) => {
        loggerAR.error('Error obteniendo ubicación inicial:', err);
        let errorMessage = `Error ${err.code}: ${err.message}`;
        if (err.code === 1) {
          errorMessage = 'Permiso de ubicación denegado. Habilítalo en la configuración de tu navegador/dispositivo y recarga.';
        } else if (err.code === 2) {
           errorMessage = 'No se pudo determinar la ubicación (Problema de red o GPS desactivado).';
        } else if (err.code === 3) {
           errorMessage = 'Timeout esperando la ubicación. Verifica tu conexión y señal GPS.';
        }
        setError(errorMessage);
        setStage('error');
      },
      options
    );
  };
  
  // Función para iniciar seguimiento continuo
  const startPositionTracking = () => {
    if (gpsWatchId !== null) { // Evitar múltiples watchers
      navigator.geolocation.clearWatch(gpsWatchId);
    }
    loggerAR.info('Iniciando seguimiento continuo de posición (watchPosition)...');
    const id = navigator.geolocation.watchPosition(
      (position) => {
        const updatedCoords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        // Solo actualizamos el estado de las coordenadas del usuario
        setCurrentCoords(updatedCoords); 
        loggerAR.log('Posición del usuario actualizada (watch):', updatedCoords);
        // El modelo permanece fijo en targetLat, targetLng
      },
      (err) => {
        // Errores durante el seguimiento son menos críticos, solo advertir
        loggerAR.warn('Error durante el seguimiento de posición (watch):', err);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 } // maximumAge > 0 para usar caché si es reciente
    );
    setGpsWatchId(id);
  };

  // Efecto para cargar scripts e inicializar AR cuando el stage es 'success'
  useEffect(() => {
    if (stage === 'success') {
      loggerAR.info('Permiso OK, iniciando carga de scripts AR...');
      const init = async () => {
        try {
          // Comprobar si A-Frame ya está cargado
          if (!(window as any).AFRAME) {
            loggerAR.info("Cargando A-Frame...");
            await loadScript('https://aframe.io/releases/1.5.0/aframe.min.js'); // Usar versión más reciente
          } else {
             loggerAR.info("A-Frame ya presente.");
          }
          // Comprobar si AR.js está cargado
          if (!(window as any).AFRAME?.components['gps-camera']) {
            loggerAR.info("Cargando AR.js para A-Frame...");
            // Usar la versión three.js de AR.js
            await loadScript('https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar-nft.js'); 
          } else {
             loggerAR.info("Componentes AR.js ya presentes.");
          }
          
          // Esperar un poco para que los scripts se registren completamente
          await new Promise(resolve => setTimeout(resolve, 500));
          
          loggerAR.info("Scripts cargados, inicializando escena AR...");
          initARScene();
          
        } catch (e: any) {
          loggerAR.error('Error al cargar scripts AR:', e);
          setError(`Error crítico al cargar librerías AR: ${e.message}. Recarga la página.`);
          setStage('error');
        }
      };
      init();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]); // Dependencia única: 'stage'

  // Función para inicializar la escena A-Frame dinámicamente
  const initARScene = () => {
    if (arSceneRef.current) {
      loggerAR.warn('Intento de inicializar escena AR múltiple prevenido.');
      return; // Evitar inicializar múltiples veces
    }
    
    loggerAR.info('Inicializando escena A-Frame...');

    // Crear contenedor si no existe
    if (!arSceneContainerRef.current) {
       const container = document.createElement('div');
       container.id = 'ar-scene-container';
       container.style.position = 'fixed';
       container.style.top = '0';
       container.style.left = '0';
       container.style.width = '100%';
       container.style.height = '100%';
       container.style.zIndex = '-1'; // Detrás de la UI de React
       document.body.appendChild(container);
       arSceneContainerRef.current = container;
       loggerAR.info('Contenedor de escena AR creado.');
    }
    
    // Crear la escena A-Frame
    const sceneEl = document.createElement('a-scene');
    arSceneRef.current = sceneEl; // Guardar referencia
    
    // Atributos importantes
    sceneEl.setAttribute('embedded', '');
    sceneEl.setAttribute('renderer', 'logarithmicDepthBuffer: true; colorManagement: true;'); // Mejoras visuales
    sceneEl.setAttribute('vr-mode-ui', 'enabled: false');
    sceneEl.setAttribute('device-orientation-permission-ui', 'enabled: false'); // Deshabilitar diálogo iOS
    // Configurar AR.js: sourceType webcam, usar ubicación GPS
    sceneEl.setAttribute('arjs', 'sourceType: webcam; videoTexture: true; debugUIEnabled: false; detectionMode: mono_and_matrix; gpsTimeInterval: 5000;'); // Intervalo GPS 5s

    // Crear cámara con gps-camera
    const cameraEl = document.createElement('a-camera');
    cameraRef.current = cameraEl; // Guardar referencia
    cameraEl.setAttribute('gps-camera', 'simulateLatitude: 39.469; simulateLongitude: -0.431; alert: true; gpsMinAccuracy: 50;'); // Simulación opcional, alerta si GPS malo, min precisión 50m
    cameraEl.setAttribute('rotation-reader', '');
    sceneEl.appendChild(cameraEl);
    loggerAR.info('Cámara AR (gps-camera) creada.');

    // Crear la entidad del modelo 3D usando las coordenadas FIJAS
    const modelEl = document.createElement('a-entity');
    modelEntityRef.current = modelEl; // Guardar referencia
    modelEl.setAttribute('id', 'castillo-model');
    modelEl.setAttribute('gltf-model', `url(${modelUrl})`);
    // Usar las coordenadas FIJAS (targetLat, targetLng)
    modelEl.setAttribute('gps-entity-place', `latitude: ${targetLat}; longitude: ${targetLng};`);
    modelEl.setAttribute('scale', '1 1 1'); // Ajustar escala según sea necesario
    modelEl.setAttribute('rotation', '0 0 0'); // Ajustar rotación inicial si es necesario
    modelEl.setAttribute('animation-mixer', ''); // Activar animaciones si existen
    sceneEl.appendChild(modelEl);
    loggerAR.info(`Modelo 3D (${modelUrl}) agregado en lat: ${targetLat}, lon: ${targetLng}`);

    // Añadir la escena al contenedor
    arSceneContainerRef.current.appendChild(sceneEl);

    // Listener para cuando A-Frame y AR.js estén listos
    sceneEl.addEventListener('loaded', () => {
      loggerAR.info('A-Frame scene loaded event fired.');
    });
    
    // Listener específico de AR.js para GPS inicializado
    window.addEventListener('gps-camera-update-position', (event: any) => {
       loggerAR.info('AR.js gps-camera-update-position:', event.detail.position);
       // Actualizar UI con coordenadas del usuario desde AR.js si es necesario
       if (event.detail.position) {
           setCurrentCoords({ latitude: event.detail.position.latitude, longitude: event.detail.position.longitude });
       }
    });
    
    // Listener para errores del modelo GLTF
    modelEl.addEventListener('model-error', (e) => {
      loggerAR.error('Error al cargar el modelo GLTF:', e);
      setError(`Error cargando modelo 3D: ${e.detail?.message || 'Desconocido'}. Verifica la URL y el formato.`);
      // Podríamos intentar ocultar el modelo o mostrar un placeholder
      modelEl.setAttribute('visible', 'false');
    });
    
    loggerAR.info('Escena AR inicializada y añadida al DOM.');
  };

  // Texto del estado del permiso
  const getPermissionText = () => {
    switch (permissionStatus) {
      case 'granted': return 'Permiso concedido';
      case 'denied': return 'Permiso denegado';
      case 'prompt': return 'Permiso pendiente';
      default: return 'Consultando...';
    }
  };

  // Renderizado del componente React
  return (
    <div className="ar-container"> {/* Usar clase existente si define layout */}
      
      {/* Overlay para UI (estados, errores, botones) */}
      <div className="ar-ui-overlay" style={{ 
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', 
          zIndex: 10, pointerEvents: 'none', // Permite interactuar con AR detrás
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          padding: '15px', boxSizing: 'border-box'
        }}>

        {/* Área superior: Estado y Botón Volver */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pointerEvents: 'all' }}>
          <Link to="/" className="back-button-ar">Volver</Link>
          {currentCoords && stage === 'success' && (
            <div style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: 'white', padding: '5px 10px', borderRadius: '4px', fontSize: '12px' }}>
              Tu Lat: {currentCoords.latitude.toFixed(5)}, Lon: {currentCoords.longitude.toFixed(5)}
            </div>
          )}
        </div>

        {/* Área central: Mensajes de estado/error */}
        <div style={{ flexGrow: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', pointerEvents: 'all' }}>
          {stage === 'initial' && (
            <div className="ar-message-box">
              <h2>Realidad Aumentada Geolocalizada</h2>
              <p>Esta experiencia requiere acceso a tu ubicación GPS.</p>
               <p>Estado del permiso: <strong>{getPermissionText()}</strong></p>
              {permissionStatus !== 'granted' && (
                <p className="geo-ar-instructions">
                  {permissionStatus === 'denied'
                    ? 'Permiso denegado. Habilita la ubicación en la configuración de tu navegador/dispositivo y recarga.'
                    : 'Haz clic abajo para solicitar acceso a la ubicación.'}
                </p>
              )}
              <button 
                onClick={requestGeolocation} 
                className="geo-ar-permission-btn" 
                disabled={permissionStatus === 'denied'}
              >
                {permissionStatus === 'granted' ? 'Iniciar AR' : 'Solicitar Permiso'}
              </button>
              {permissionStatus === 'denied' && (
                 <button onClick={() => window.location.reload()} className="geo-ar-retry-btn" style={{marginLeft: '10px'}}>Recargar</button>
              )}
            </div>
          )}

          {stage === 'requesting' && (
            <div className="ar-message-box">
              <div className="geo-ar-spinner"></div>
              <p>Accediendo a tu ubicación...</p>
              <p>Por favor, acepta la solicitud de permiso.</p>
            </div>
          )}

          {stage === 'error' && (
            <div className="ar-message-box error-box">
              <h3>Error de Geolocalización</h3>
              <p>{error || 'Ha ocurrido un error desconocido.'}</p>
              <button onClick={requestGeolocation} className="geo-ar-retry-btn">Reintentar</button>
              {permissionStatus === 'denied' && (
                 <button onClick={() => window.location.reload()} className="geo-ar-retry-btn" style={{marginLeft: '10px'}}>Recargar</button>
              )}
            </div>
          )}
          
          {stage === 'success' && !arSceneRef.current && (
             <div className="ar-message-box">
               <div className="geo-ar-spinner"></div>
               <p>Ubicación obtenida. Cargando entorno AR...</p>
             </div>
          )}
          
           {stage === 'success' && arSceneRef.current && (
             <div className="ar-message-box hint-box" style={{backgroundColor: 'rgba(0, 128, 0, 0.6)'}}>
               <p>¡Entorno AR listo!</p>
               <p>El modelo 3D se ha colocado en las coordenadas del Castillo.</p>
                <p style={{fontSize: '12px', marginTop: '10px'}}>Si no ves nada, asegúrate de tener buena señal GPS y apunta tu cámara alrededor.</p>
             </div>
          )}
        </div>

        {/* Área inferior: Información adicional (opcional) */}
        <div style={{ pointerEvents: 'all', textAlign: 'center', color: 'white', textShadow: '1px 1px 2px black' }}>
          {/* Puedes añadir más info aquí si es necesario */}
        </div>

      </div>
      
      {/* El contenedor de la escena AR se añade al body dinámicamente */}
      
    </div>
  );
};

export default ARView;

// --- Estilos CSS (si no están en ARView.css) ---
/* 
Asegúrate de tener estilos básicos en ARView.css o aquí:

.ar-container { 
  width: 100%; 
  height: 100vh; 
  overflow: hidden; 
  position: relative; 
  background-color: #333; // Fondo mientras carga
}

.ar-ui-overlay {
  // Estilos definidos inline arriba
}

.back-button-ar {
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 8px 15px;
  border: none;
  border-radius: 5px;
  text-decoration: none;
  cursor: pointer;
  font-size: 14px;
}
.back-button-ar:hover {
  background-color: rgba(0, 0, 0, 0.9);
}

.ar-message-box {
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 20px;
  border-radius: 8px;
  text-align: center;
  max-width: 80%;
}
.ar-message-box.error-box {
  background-color: rgba(200, 0, 0, 0.8);
}
.ar-message-box.hint-box {
   background-color: rgba(0, 80, 0, 0.7);
   animation: fadeOut 5s forwards; /* Desaparece después de 5s */
   animation-delay: 3s;
}

@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; pointer-events: none; }
}


.geo-ar-permission-btn, .geo-ar-retry-btn {
  background-color: #4CAF50;
  color: white;
  padding: 10px 20px;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;
  margin-top: 15px;
}
.geo-ar-permission-btn:disabled {
  background-color: #aaa;
  cursor: not-allowed;
}
.geo-ar-retry-btn {
  background-color: #f44336;
}

.geo-ar-spinner {
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top: 4px solid #fff;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin: 0 auto 15px auto;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.geo-ar-instructions {
  font-size: 13px;
  color: #ddd;
  margin-top: 10px;
}
*/