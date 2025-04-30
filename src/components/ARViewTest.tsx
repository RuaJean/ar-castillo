import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import 'aframe';
import 'aframe-ar';
import 'aframe-extras';
import 'aframe-look-at-component';
import '../styles/ARView.css';

// Sistema de logging para depuración
const DEBUG = true;
const logger = {
  info: (message: string, ...args: any[]) => {
    if (DEBUG) console.info(`[AR-DEBUG][INFO] ${message}`, ...args);
  },
  warn: (message: string, ...args: any[]) => {
    if (DEBUG) console.warn(`[AR-DEBUG][WARN] ${message}`, ...args);
  },
  error: (message: string, ...args: any[]) => {
    if (DEBUG) console.error(`[AR-DEBUG][ERROR] ${message}`, ...args);
  },
  log: (message: string, ...args: any[]) => {
    if (DEBUG) console.log(`[AR-DEBUG][LOG] ${message}`, ...args);
  }
};

// Función segura para habilitar el modo de depuración de A-Frame
const enableAFrameDebug = () => {
  try {
    if (typeof window !== 'undefined' && window.AFRAME) {
      logger.info('AFRAME encontrado en window', {
        version: window.AFRAME.version,
        hasDebug: !!window.AFRAME.debug,
        hasUtils: !!window.AFRAME.utils,
        components: Object.keys(window.AFRAME.components || {}).length,
      });
      
      // Método 1: API debug.enable() (puede no estar disponible)
      if (window.AFRAME.debug && typeof window.AFRAME.debug.enable === 'function') {
        window.AFRAME.debug.enable();
        logger.info('Modo debug de A-Frame activado usando debug.enable()');
        return true;
      }
      
      // Método 2: Configurar debug en registerComponent (alternativa)
      if (window.AFRAME.registerComponent) {
        logger.info('Intentando activar debug mediante atributos');
        
        // Crear componente de depuración personalizado
        window.AFRAME.registerComponent('debug-helper', {
          init: function() {
            logger.info('Componente debug-helper inicializado');
            // Activar estadísticas de rendimiento si THREE está disponible
            if (window.AFRAME.THREE && window.AFRAME.THREE.Stats) {
              const stats = new window.AFRAME.THREE.Stats();
              document.body.appendChild(stats.dom);
              logger.info('Stats de THREE.js añadidos al DOM');
            }
          }
        });
        
        return true;
      }
      
      logger.warn('No se pudo activar el modo debug de A-Frame');
      return false;
    } else {
      logger.warn('A-Frame no está disponible en window');
      return false;
    }
  } catch (error) {
    logger.error('Error al intentar habilitar el debug de A-Frame', error);
    return false;
  }
};

// Función para registrar información sobre el entorno
const logEnvironmentInfo = () => {
  try {
    logger.info('Información del entorno:', {
      userAgent: navigator.userAgent,
      vendor: navigator.vendor,
      platform: navigator.platform,
      language: navigator.language,
      deviceMemory: (navigator as any).deviceMemory || 'No disponible',
      hardwareConcurrency: navigator.hardwareConcurrency || 'No disponible',
      url: window.location.href,
      protocol: window.location.protocol,
      screenSize: `${window.screen.width}x${window.screen.height}`,
      devicePixelRatio: window.devicePixelRatio,
    });
    
    // Comprobar WebGL
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    if (gl) {
      try {
        // Asegurar que TypeScript reconoce gl como WebGLRenderingContext
        const webgl = gl as WebGLRenderingContext;
        const debugInfo = webgl.getExtension('WEBGL_debug_renderer_info');
        
        if (debugInfo) {
          logger.info('Información WebGL:', {
            vendor: webgl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
            renderer: webgl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL),
            version: webgl.getParameter(webgl.VERSION),
            shadingLanguageVersion: webgl.getParameter(webgl.SHADING_LANGUAGE_VERSION),
            maxTextureSize: webgl.getParameter(webgl.MAX_TEXTURE_SIZE)
          });
        } else {
          logger.info('Información WebGL básica:', {
            version: webgl.getParameter(webgl.VERSION),
            vendor: webgl.getParameter(webgl.VENDOR),
          });
        }
      } catch (e) {
        logger.warn('Error al obtener información WebGL', e);
      }
    } else {
      logger.warn('WebGL no está soportado en este navegador');
    }
    
    // Scripts cargados
    const scripts = Array.from(document.scripts).map(s => ({
      src: s.src,
      type: s.type,
      async: s.async,
      defer: s.defer
    }));
    
    logger.info(`Scripts cargados: ${scripts.length}`);
    
    // Bibliotecas detectadas
    const libraries = {
      aframe: typeof window.AFRAME !== 'undefined',
      three: typeof (window as any).THREE !== 'undefined',
      jquery: typeof (window as any).jQuery !== 'undefined',
      react: typeof (window as any).React !== 'undefined',
      arjs: typeof (window as any).ARjs !== 'undefined'
    };
    
    logger.info('Bibliotecas detectadas:', libraries);
  } catch (error) {
    logger.error('Error al recopilar información del entorno', error);
  }
};

// URLs de modelos alternativos
const MODEL_URLS = {
  remote: 'https://jeanrua.com/models/SantaMaria_futuro_packed.glb',
  local: '/SantaMaria_futuro_packed.glb',
  backup: 'https://raw.githubusercontent.com/jeanrua/ar-castillo/main/public/SantaMaria_futuro_packed.glb',
  fallback: '/castle.glb', // Modelo más simple por si todo falla
  simplified: '/castle_low.glb' // Versión aún más ligera (si existe)
};

// Configuración avanzada para la carga del modelo
const MODEL_LOAD_CONFIG = {
  maxAttempts: 4,             // Número máximo de intentos de carga
  timeoutMs: 120000,          // Timeout para la carga (2 minutos)
  minValidSizeBytes: 10000,   // Tamaño mínimo esperado para un modelo GLB válido
  retryDelayMs: 1000,         // Retraso entre intentos de carga
  progressThrottleMs: 200,    // Limitar actualizaciones de progreso para mejor rendimiento
};

// Lista de modelos disponibles (adaptado de GeoAR)
const availableModels = [
  // Añade aquí los modelos que quieras probar
  { name: 'Santa María Futuro (Remoto)', path: 'https://jeanrua.com/models/SantaMaria_futuro_packed.glb' },
  { name: 'Santa María Futuro (Local)', path: '/SantaMaria_futuro_packed.glb' },
  { name: 'Santa María Futuro (Backup)', path: 'https://raw.githubusercontent.com/jeanrua/ar-castillo/main/public/SantaMaria_futuro_packed.glb' },
  { name: 'Castillo Simple (Fallback)', path: '/castle.glb' },
  { name: 'Cubo Test (Prueba)', path: 'test-cube' } // Opción para un cubo simple
];

const ARViewTest: React.FC = () => {
  const [stage, setStage] = useState<'initial' | 'requesting' | 'success' | 'error'>('initial');
  const [error, setError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionState | null>(null);
  const [gpsWatchId, setGpsWatchId] = useState<number | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>(availableModels[0].path); // Modelo inicial
  const [isARSceneReady, setIsARSceneReady] = useState(false); // Flag para saber si A-Frame cargó

  // Refs para la escena AR
  const arSceneContainerRef = useRef<HTMLDivElement | null>(null);
  const arSceneRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const modelEntityRef = useRef<any>(null);
  const simpleCubeRef = useRef<any>(null); // Ref para el cubo simple

  // Carga dinámica de scripts
  const loadScript = (src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        logger.info(`Script ya cargado: ${src}`);
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => {
        logger.info(`Script cargado: ${src}`);
        resolve();
      };
      script.onerror = (err) => {
        logger.error(`Error cargando script: ${src}`, err);
        reject(new Error(`Error al cargar ${src}`));
      };
      document.head.appendChild(script);
    });
  };

  // Consultar permisos al montar y limpieza
  useEffect(() => {
    logger.info('ARViewTest: Montando componente');
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' })
        .then((status) => {
          logger.info('Estado inicial permiso geo:', status.state);
          setPermissionStatus(status.state);
          status.onchange = () => {
            logger.info('Cambio estado permiso geo:', status.state);
            setPermissionStatus(status.state);
          };
        })
        .catch(err => {
          logger.error('Error consultando permisos:', err);
          setError(`Error consultando permisos: ${err.message}`);
        });
    } else {
      logger.info('API Permissions no soportada.');
    }

    return () => {
      logger.info('ARViewTest: Desmontando');
      if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
        logger.info('Seguimiento posición cancelado.');
      }
      if (arSceneContainerRef.current && arSceneContainerRef.current.parentNode) {
         arSceneContainerRef.current.parentNode.removeChild(arSceneContainerRef.current);
         logger.info('Contenedor AR eliminado.');
      }
    };
  }, [gpsWatchId]);

  // Solicitar geolocalización
  const requestGeolocation = () => {
    logger.info('Solicitando geolocalización...');
    
    if (window.location.protocol !== 'https:') {
      const msg = 'La geolocalización requiere HTTPS.';
      logger.error(msg);
      setError(msg);
      setStage('error');
      return;
    }

    if (!navigator.geolocation) {
       const msg = 'Geolocalización no soportada.';
       logger.error(msg);
       setError(msg);
       setStage('error');
       return;
    }

    setStage('requesting');
    setError(null);

    const options = {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        logger.info('Ubicación inicial obtenida:', position.coords);
        const newCoords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setCoords(newCoords);
        setStage('success');
        startPositionTracking(newCoords); // Iniciar seguimiento
      },
      (err) => {
        logger.error('Error obteniendo ubicación inicial:', err);
        let errorMessage = `Error ${err.code}: ${err.message}`;
        if (err.code === 1) errorMessage = 'Permiso denegado. Habilítalo y recarga.';
        else if (err.code === 2) errorMessage = 'Ubicación no disponible (Red/GPS).';
        else if (err.code === 3) errorMessage = 'Timeout esperando ubicación.';
        setError(errorMessage);
        setStage('error');
      },
      options
    );
  };
  
  // Iniciar seguimiento continuo
  const startPositionTracking = (initialCoords: { latitude: number; longitude: number }) => {
     if (gpsWatchId !== null) navigator.geolocation.clearWatch(gpsWatchId);
     logger.info('Iniciando seguimiento continuo (watchPosition)...');
     
     const id = navigator.geolocation.watchPosition(
      (position) => {
        const updatedCoords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        logger.log('Posición actualizada (watch):', updatedCoords);
        setCoords(updatedCoords);

        // Actualizar la posición GPS de la cámara y/o modelo si la escena está lista
        if (isARSceneReady && cameraRef.current) {
           // AR.js <a-camera gps-camera> debería actualizarse sola, pero podemos forzar si es necesario
           // o actualizar la entidad si no usamos gps-entity-place directamente en ella
           logger.log('Actualizando posición GPS en A-Frame (si es necesario)');
           // Ejemplo: Si el modelo NO usa gps-entity-place, podríamos calcular dx, dz y actualizar position
           // if (modelEntityRef.current) modelEntityRef.current.setAttribute('position', `${dx} 0 ${dz}`);
        }
      },
      (err) => {
        logger.warn('Error durante seguimiento (watch):', err);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
    setGpsWatchId(id);
  };

  // Cargar scripts e inicializar AR
  useEffect(() => {
    if (stage === 'success' && coords) {
      logger.info('Permiso OK y coords obtenidas, iniciando carga scripts AR...');
      const init = async () => {
        try {
          setIsARSceneReady(false); // Marcar como no lista mientras carga
          if (!(window as any).AFRAME) {
            logger.info("Cargando A-Frame...");
            await loadScript('https://aframe.io/releases/1.5.0/aframe.min.js');
          } else logger.info("A-Frame ya presente.");
          
          if (!(window as any).AFRAME?.components['gps-camera']) {
            logger.info("Cargando AR.js...");
            await loadScript('https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar-nft.js');
          } else logger.info("AR.js ya presente.");

          await new Promise(resolve => setTimeout(resolve, 500)); 
          logger.info("Scripts cargados, inicializando escena AR...");
          initARScene(coords); // Pasar coords iniciales

        } catch (e: any) {
          logger.error('Error al cargar/inicializar AR:', e);
          setError(`Error crítico AR: ${e.message}. Recarga.`);
          setStage('error');
          setIsARSceneReady(false);
        }
      };
      init();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, coords]); // Dependencias: stage y coords

  // Inicializar escena A-Frame
  const initARScene = (initialCoords: { latitude: number; longitude: number }) => {
    if (arSceneRef.current) {
       logger.warn('Intento de inicializar escena AR múltiple prevenido.');
       return;
    }
    logger.info('Inicializando escena A-Frame...');

    // Crear contenedor
    if (!arSceneContainerRef.current) {
       const container = document.createElement('div');
       container.id = 'ar-test-scene-container';
       container.style.position = 'fixed'; container.style.top = '0'; container.style.left = '0';
       container.style.width = '100%'; container.style.height = '100%'; container.style.zIndex = '-1';
       document.body.appendChild(container);
       arSceneContainerRef.current = container;
       logger.info('Contenedor escena AR creado.');
    }

    // Crear escena
    const sceneEl = document.createElement('a-scene');
    arSceneRef.current = sceneEl;
    sceneEl.setAttribute('embedded', '');
    sceneEl.setAttribute('renderer', 'logarithmicDepthBuffer: true; colorManagement: true;');
    sceneEl.setAttribute('vr-mode-ui', 'enabled: false');
    sceneEl.setAttribute('device-orientation-permission-ui', 'enabled: false');
    // AR.js config: usar GPS, debug opcional
    sceneEl.setAttribute('arjs', `sourceType: webcam; videoTexture: true; debugUIEnabled: ${DEBUG}; detectionMode: mono_and_matrix; gpsTimeInterval: 5000;`);

    // Crear cámara
    const cameraEl = document.createElement('a-camera');
    cameraRef.current = cameraEl;
    // Usar las coordenadas REALES del usuario
    cameraEl.setAttribute('gps-camera', `alert: true; gpsMinAccuracy: 80; positionMinAccuracy: 80;`); 
    cameraEl.setAttribute('rotation-reader', '');
    sceneEl.appendChild(cameraEl);
    logger.info('Cámara AR (gps-camera) creada.');

    // Crear Entidad del Modelo (inicialmente oculta o placeholder)
    const modelEl = document.createElement('a-entity');
    modelEntityRef.current = modelEl;
    modelEl.setAttribute('id', 'dynamic-model');
    // Importante: Usar gps-entity-place con las coordenadas del usuario
    modelEl.setAttribute('gps-entity-place', `latitude: ${initialCoords.latitude}; longitude: ${initialCoords.longitude};`);
    modelEl.setAttribute('scale', '1 1 1'); // Ajustar escala
    modelEl.setAttribute('rotation', '0 0 0');
    modelEl.setAttribute('visible', 'false'); // Empezar invisible hasta seleccionar modelo
    modelEl.setAttribute('animation-mixer', '');
    sceneEl.appendChild(modelEl);
    logger.info(`Entidad de modelo creada en lat: ${initialCoords.latitude}, lon: ${initialCoords.longitude}`);
    
    // Crear Cubo Simple (para prueba, inicialmente oculto)
    const cubeEl = document.createElement('a-box');
    simpleCubeRef.current = cubeEl;
    cubeEl.setAttribute('id', 'test-cube');
    cubeEl.setAttribute('color', 'magenta');
    cubeEl.setAttribute('scale', '2 2 2');
    // Posición relativa a la cámara si no usa gps-entity-place
    // O también puede usar gps-entity-place si queremos anclarlo al mundo
    cubeEl.setAttribute('gps-entity-place', `latitude: ${initialCoords.latitude}; longitude: ${initialCoords.longitude};`);
    // Moverlo un poco hacia el frente y arriba para que no esté en el mismo sitio que el modelo
    cubeEl.setAttribute('position', '0 2 -5'); // Ajusta x, y, z respecto a su ancla GPS
    cubeEl.setAttribute('visible', 'false');
    sceneEl.appendChild(cubeEl);
    logger.info('Cubo de prueba creado.');

    // Añadir escena al contenedor
    arSceneContainerRef.current.appendChild(sceneEl);

    // Listeners
    sceneEl.addEventListener('loaded', () => {
      logger.info('A-Frame scene loaded.');
      setIsARSceneReady(true); // Marcar que A-Frame está listo
      // Actualizar el modelo ahora que la escena está lista
      updateARModel(selectedModel);
    });
    
    window.addEventListener('gps-camera-update-position', (event: any) => {
       logger.info('AR.js gps-camera-update-position:', event.detail.position);
       if (event.detail.position) {
           setCoords({ latitude: event.detail.position.latitude, longitude: event.detail.position.longitude });
       }
    });
    
    modelEl.addEventListener('model-error', (e: any) => {
      logger.error('Error cargando modelo GLTF:', e);
      setError(`Error cargando ${selectedModel}: ${e.detail?.message || 'Desconocido'}`);
      // Ocultar si falla
      modelEl.setAttribute('visible', 'false');
    });

    logger.info('Escena AR inicializada y añadida al DOM.');
  };

  // Función para actualizar el modelo en la escena
  const updateARModel = (modelPath: string) => {
    if (!isARSceneReady) {
      logger.warn('Intento de actualizar modelo antes de que la escena esté lista.');
      return;
    }
    logger.info(`Actualizando modelo a: ${modelPath}`);
    
    const modelEntity = modelEntityRef.current;
    const cubeEntity = simpleCubeRef.current;

    if (!modelEntity || !cubeEntity) {
       logger.error('Referencias a entidades AR no encontradas.');
       return;
    }

    // Si se selecciona el cubo de prueba
    if (modelPath === 'test-cube') {
      modelEntity.setAttribute('visible', 'false'); // Ocultar modelo GLB
      modelEntity.removeAttribute('gltf-model'); // Quitar modelo anterior
      cubeEntity.setAttribute('visible', 'true'); // Mostrar cubo
      logger.info('Mostrando cubo de prueba.');
      setError(null); // Limpiar errores previos
    } 
    // Si se selecciona un modelo GLB
    else {
      cubeEntity.setAttribute('visible', 'false'); // Ocultar cubo
      modelEntity.setAttribute('gltf-model', `url(${modelPath})`);
      modelEntity.setAttribute('visible', 'true'); // Mostrar modelo
      logger.info(`Cargando modelo GLB: ${modelPath}`);
      setError(null); // Limpiar errores previos
    }
  };

  // Efecto para reaccionar a cambios en selectedModel
  useEffect(() => {
    // Solo actualizar si la escena ya está inicializada y lista
    if (stage === 'success' && isARSceneReady) {
      updateARModel(selectedModel);
    }
  }, [selectedModel, stage, isARSceneReady]);

  // Texto del permiso
  const getPermissionText = () => {
    switch (permissionStatus) {
      case 'granted': return 'Concedido';
      case 'denied': return 'Denegado';
      case 'prompt': return 'Pendiente';
      default: return 'Consultando...';
    }
  };

  return (
    <div className="ar-container"> 
      
      {/* UI Overlay */}
      <div className="ar-ui-overlay" style={{ 
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', 
          zIndex: 10, pointerEvents: 'none', display: 'flex', 
          flexDirection: 'column', justifyContent: 'space-between',
          padding: '15px', boxSizing: 'border-box'
        }}>

        {/* Top Area: Back Button, Coords, Model Selector */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', pointerEvents: 'all' }}>
          <Link to="/" className="back-button-ar">Volver</Link>
          
          {stage === 'success' && (
            <div style={{ textAlign: 'right' }}>
              {coords && (
                <div style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: 'white', padding: '5px 10px', borderRadius: '4px', fontSize: '12px', marginBottom: '10px' }}>
                  Lat: {coords.latitude.toFixed(5)}, Lon: {coords.longitude.toFixed(5)}
                </div>
              )}
              {/* Selector de Modelos */}
              <div style={{ backgroundColor: 'rgba(0,0,0,0.6)', padding: '8px', borderRadius: '5px' }}>
                <label htmlFor="model-select" style={{ color: 'white', fontSize: '13px', marginRight: '5px' }}>Modelo:</label>
                <select 
                  id="model-select"
                  value={selectedModel} 
                  onChange={(e) => setSelectedModel(e.target.value)}
                  style={{ padding: '4px', borderRadius: '3px', border: 'none' }}
                >
                  {availableModels.map((model) => (
                    <option key={model.path} value={model.path}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Center Area: Status/Error Messages */}
        <div style={{ flexGrow: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', pointerEvents: 'all' }}>
          {stage === 'initial' && (
            <div className="ar-message-box">
              <h2>AR Geolocalizado (Test)</h2>
              <p>Necesita acceso a tu ubicación GPS.</p>
               <p>Permiso: <strong>{getPermissionText()}</strong></p>
              {permissionStatus !== 'granted' && (
                <p className="geo-ar-instructions">
                  {permissionStatus === 'denied'
                    ? 'Permiso denegado. Habilítalo y recarga.'
                    : 'Clic para solicitar permiso.'}
                </p>
              )}
               {/* Selector inicial (opcional) */}
               <div style={{marginTop: '15px', marginBottom: '10px'}}>
                 <label htmlFor="initial-model-select" style={{ color: 'white', fontSize: '13px', marginRight: '5px' }}>Modelo inicial:</label>
                 <select 
                    id="initial-model-select"
                    value={selectedModel} 
                    onChange={(e) => setSelectedModel(e.target.value)}
                    style={{ padding: '4px', borderRadius: '3px', border: 'none' }}
                  >
                    {availableModels.map((model) => (
                      <option key={model.path} value={model.path}>
                        {model.name}
                      </option>
                    ))}
                  </select>
               </div>
              <button onClick={requestGeolocation} className="geo-ar-permission-btn" disabled={permissionStatus === 'denied'}>
                {permissionStatus === 'granted' ? 'Iniciar AR Test' : 'Solicitar Permiso'}
              </button>
              {permissionStatus === 'denied' && (
                 <button onClick={() => window.location.reload()} className="geo-ar-retry-btn" style={{marginLeft: '10px'}}>Recargar</button>
              )}
            </div>
          )}
          {stage === 'requesting' && (
            <div className="ar-message-box">
              <div className="geo-ar-spinner"></div> <p>Accediendo ubicación...</p>
            </div>
          )}
          {stage === 'error' && (
            <div className="ar-message-box error-box">
              <h3>Error</h3> <p>{error || 'Error desconocido.'}</p>
              <button onClick={requestGeolocation} className="geo-ar-retry-btn">Reintentar</button>
            </div>
          )}
          {stage === 'success' && !isARSceneReady && (
             <div className="ar-message-box">
               <div className="geo-ar-spinner"></div> <p>Ubicación OK. Cargando AR...</p>
             </div>
          )}
           {stage === 'success' && isARSceneReady && (
             <div className="ar-message-box hint-box" style={{backgroundColor: 'rgba(0, 128, 0, 0.6)'}}>
               <p>¡Entorno AR Listo!</p>
               <p>Modelo colocado en tu ubicación actual.</p>
               <p style={{fontSize: '12px', marginTop: '10px'}}>Usa el selector arriba para cambiar modelo.</p>
             </div>
          )}
        </div>

        {/* Bottom Area: Debug Info */}
        {DEBUG && (
          <div style={{ pointerEvents: 'all', backgroundColor: 'rgba(0,0,0,0.7)', color:'#0f0', padding: '5px', fontSize: '10px', fontFamily: 'monospace', maxHeight: '100px', overflowY: 'auto' }}>
             <p>Stage: {stage} | Perm: {permissionStatus} | AR Ready: {String(isARSceneReady)}</p>
             {coords && <p>Coords: {coords.latitude.toFixed(6)}, {coords.longitude.toFixed(6)}</p>}
             <p>Model: {selectedModel}</p>
             {error && <p style={{color: 'red'}}>Error: {error}</p>}
          </div>
        )}

      </div>
      
      {/* AR Scene Container (managed dynamically) */}
      
    </div>
  );
};

export default ARViewTest;

// --- Estilos (Asegúrate que estén en ARView.css o definidos globalmente) ---
/*
.ar-container { ... }
.ar-ui-overlay { ... }
.back-button-ar { ... }
.ar-message-box { ... }
.error-box { ... }
.hint-box { ... }
@keyframes fadeOut { ... }
.geo-ar-permission-btn, .geo-ar-retry-btn { ... }
.geo-ar-permission-btn:disabled { ... }
.geo-ar-spinner { ... }
@keyframes spin { ... }
.geo-ar-instructions { ... }
*/ 