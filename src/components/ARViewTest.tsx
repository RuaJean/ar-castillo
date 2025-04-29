import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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

// Función para habilitar debugging de A-Frame
const enableAFrameDebug = () => {
  (window as any).AFRAME = (window as any).AFRAME || {};
  (window as any).AFRAME.DEBUG = true;
};

// URLs del modelo para distintos escenarios - reducir resolución para modelos grandes
const MODEL_URLS = {
  remote: 'https://jeanrua.com/models/SantaMaria_futuro_optimized.glb', // Versión optimizada
  local: './models/SantaMaria_futuro.glb',     // URL local (para desarrollo)
  simplified: 'https://jeanrua.com/models/SantaMaria_low.glb', // Versión ligera para móviles
  fallback: './models/castle.glb',  // Modelo simple local como respaldo
  placeholder: './models/placeholder.glb' // Modelo mínimo mientras carga
};

// Configuración del proceso de carga de modelos
const MODEL_LOAD_CONFIG = {
  maxAttempts: 2,
  timeout: 30000,
  minValidSize: 100 * 1024, // 100KB mínimo para considerar un modelo válido
  retryDelay: 2000,
  progressThrottle: 500 // ms entre actualizaciones de progreso
};

// Configuración específica para iOS
const IOS_CONFIG = {
  maxAttempts: 3,
  timeout: 2500000,
  minValidSize: 80 * 1024,
  retryDelay: 1500,
  progressThrottle: 800
};

// Registrar información del entorno
const logEnvironmentInfo = () => {
  const ua = navigator.userAgent;
  const mobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari = /^((?!chrome|android).)*safari/i.test(ua);
  
  const info = {
    userAgent: ua,
    timestamp: new Date().toISOString(),
    mobile,
    iOS,
    safari,
    protocol: window.location.protocol,
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      dpr: window.devicePixelRatio
    }
  };
  
  logger.info('Entorno AR detectado:', info);
  
  return info;
};

// Función para verificar si estamos en un dispositivo móvil
const isMobile = (): boolean => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

// Función para verificar si estamos en iOS
const isIOSCheck = (): boolean => {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

// Función para verificar si estamos en Safari
const isSafariCheck = (): boolean => {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
};

// Función mejorada para detectar dispositivos iOS
const detectIOSDevice = (): { isIOS: boolean, iOSVersion: number, isSafari: boolean, safariVersion: number } => {
  const ua = navigator.userAgent;
  const isIOSResult = isIOSCheck();
  
  // Detectar versión de iOS
  let iOSVersion = 0;
  if (isIOSResult) {
    const match = ua.match(/(iPhone|iPad|iPod).*OS\s(\d+)_/);
    if (match && match[2]) {
      iOSVersion = parseInt(match[2], 10);
    }
  }
  
  // Detectar Safari y su versión
  const isSafariResult = isSafariCheck();
  let safariVersion = 0;
  if (isSafariResult) {
    const match = ua.match(/Version\/(\d+)\.(\d+)/);
    if (match && match[1]) {
      safariVersion = parseInt(match[1], 10);
    }
  }
  
  logger.info(`Detección de plataforma: iOS=${isIOSResult}, versión=${iOSVersion}, Safari=${isSafariResult}, Safari versión=${safariVersion}`);
  return { isIOS: isIOSResult, iOSVersion, isSafari: isSafariResult, safariVersion };
};

// Función para verificar disponibilidad de recursos locales
const checkLocalResources = async (): Promise<boolean> => {
  try {
    logger.info('Verificando modelos locales...');
    
    // Verificar acceso a modelo local principal
    const response = await fetch(MODEL_URLS.local, { method: 'HEAD' });
    const localModelAvailable = response.ok;
    
    if (localModelAvailable) {
      logger.info('Modelo local disponible');
    } else {
      logger.warn('Modelo local no disponible, se usarán URLs remotas');
    }
    
    return localModelAvailable;
  } catch (e) {
    logger.warn('Error al verificar modelos locales, asumiendo no disponibles', e);
    return false;
  }
};

// Variable global para almacenar modelos precargados
const preloadedModels: Record<string, ArrayBuffer> = {};

// Función para precargar modelos para su uso posterior
const preloadModel = async (url: string): Promise<boolean> => {
  if (preloadedModels[url]) {
    logger.info(`Modelo ya precargado: ${url}`);
    return true;
  }
  
  try {
    logger.info(`Precargando modelo: ${url}`);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/octet-stream',
        'X-Requested-With': 'XMLHttpRequest'
      },
      cache: 'no-store'
    });
    
    if (!response.ok) {
      logger.warn(`Error al precargar modelo (${response.status}): ${url}`);
      return false;
    }
    
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength < 1000) {
      logger.warn(`Modelo demasiado pequeño en precarga (${buffer.byteLength} bytes): ${url}`);
      return false;
    }
    
    preloadedModels[url] = buffer;
    logger.info(`Modelo precargado con éxito (${buffer.byteLength} bytes): ${url}`);
    return true;
  } catch (e) {
    logger.error(`Error al precargar modelo: ${url}`, e);
    return false;
  }
};

// Función para usar un modelo precargado
const getPreloadedModel = (url: string): ArrayBuffer | null => {
  return preloadedModels[url] || null;
};

const ARViewTest = () => {
  const navigate = useNavigate();
  const { modelId } = useParams();
  const [showBackButton, setShowBackButton] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const [currentStep, setCurrentStep] = useState<string>('iniciando');
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  
  // Nuevos estados para manejar problemas en móviles
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  const [isSafariDevice, setIsSafariDevice] = useState(false);
  const [cameraPermissionError, setCameraPermissionError] = useState(false);
  const [permissionRequestCount, setPermissionRequestCount] = useState(0);
  const [loadingStuck, setLoadingStuck] = useState(false);
  const loadingTimerRef = useRef<number | null>(null);
  const cameraInitAttempts = useRef(0);
  
  // Variables de estado que faltan
  const [currentModelUrl, setCurrentModelUrl] = useState<string>('');
  const [modelLoadAttempts, setModelLoadAttempts] = useState<number>(0);
  const [loadingErrors, setLoadingErrors] = useState<string[]>([]);
  const [permissionDenied, setPermissionDenied] = useState<boolean>(false);
  const [permissionAsked, setPermissionAsked] = useState<boolean>(false);
  const [arReady, setArReady] = useState<boolean>(false);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [modelLoading, setModelLoading] = useState<boolean>(false);
  
  // Referencias que faltan
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const cameraInitAttemptsRef = useRef<number>(0);
  
  // Obtener información de iOS
  const deviceInfo = useMemo(() => {
    return detectIOSDevice();
  }, []);
  
  // Distancia de prueba en metros (modelo aparecerá a esta distancia del usuario)
  const testDistance = 15;
  
  const randomAngle = Math.random() * 360;
  
  // Seleccionar la URL del modelo más adecuada para la situación actual
  const selectModelUrl = () => {
    if (modelLoadAttempts === 0) {
      // Primera carga: usar remoto si estamos en HTTPS, local si estamos en HTTP
      if (window.location.protocol === 'https:') {
        logger.info('Primer intento: usando URL remota');
        return MODEL_URLS.remote;
      } else {
        logger.info('Primer intento: usando URL local');
        return MODEL_URLS.local;
      }
    } else if (modelLoadAttempts === 1) {
      // Segundo intento: usar local si el primer intento fue remoto, o backup si ya intentamos local
      const newUrl = currentModelUrl === MODEL_URLS.remote ? MODEL_URLS.local : MODEL_URLS.fallback;
      logger.info(`Segundo intento: usando ${newUrl === MODEL_URLS.local ? 'URL local' : 'URL de backup GitHub'}`);
      return newUrl;
    } else if (modelLoadAttempts === 2) {
      // Tercer intento: usar GitHub si no se ha intentado aún
      if (!currentModelUrl.includes('github')) {
        logger.info('Tercer intento: usando URL de backup GitHub');
        return MODEL_URLS.fallback;
      } else {
        // Si ya probamos GitHub, usar el modelo simplificado
        logger.info('Tercer intento: usando modelo simplificado');
        return MODEL_URLS.simplified;
      }
    } else {
      // Cuarto intento: último recurso, modelo simplificado local
      logger.info('Último intento: usando modelo simplificado local');
      return MODEL_URLS.fallback;
    }
  };

  // Se ejecuta una sola vez al inicio para configurar la depuración y solicitar permisos
  useEffect(() => {
    logger.info('Iniciando ARViewTest - Versión con debugging extenso');
    logger.info(`Protocolo actual: ${window.location.protocol}`);
    logger.info(`URLs de modelos disponibles:`, MODEL_URLS);
    logger.info(`User Agent: ${navigator.userAgent}`);
    logger.info(`Tamaño de ventana: ${window.innerWidth}x${window.innerHeight}`);
    
    // Registrar información detallada del entorno
    logEnvironmentInfo();
    
    // Seleccionar URL inicial
    const initialUrl = selectModelUrl();
    setCurrentModelUrl(initialUrl);
    logger.info(`URL inicial seleccionada: ${initialUrl}`);
    
    // Configurar depuración de A-Frame de forma segura
    if (DEBUG) {
      enableAFrameDebug();
    }

    // Registrar los errores en consola
    window.addEventListener('error', (event) => {
      logger.error('Error global capturado:', event.message, {
        error: event.error,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        timestamp: new Date().toISOString(),
      });
    });
    
    // También capturar promesas rechazadas
    window.addEventListener('unhandledrejection', (event) => {
      logger.error('Promesa rechazada sin manejar:', {
        reason: event.reason,
        timestamp: new Date().toISOString(),
      });
    });
    
    // Manejar errores de carga del modelo
    document.addEventListener('model-error', (event) => {
      logger.error('Evento model-error disparado', event);
      // No establecer error inmediatamente para permitir reintentos
      setLoadingErrors(prev => [...prev, 'Error al cargar el modelo 3D']);
    });

    // Monitorear la carga de la escena A-Frame
    document.addEventListener('loaded', () => {
      logger.info('Escena A-Frame cargada completamente');
    });
    
    // También escuchar eventos específicos de A-Frame
    ['loaded', 'renderstart', 'renderstop', 'enter-vr', 'exit-vr', 'camera-ready'].forEach(eventName => {
      document.addEventListener(eventName, () => {
        logger.info(`Evento A-Frame capturado: ${eventName}`);
      });
    });

    // Verificar si es móvil al inicio
    const mobile = isMobile();
    setIsMobileDevice(mobile);
    logger.info(`Detectado dispositivo ${mobile ? 'móvil' : 'desktop'}`, {
      userAgent: navigator.userAgent,
      isIOS: deviceInfo.isIOS,
      isSafari: deviceInfo.isSafari,
    });

    // En iOS, necesitamos inicializar audio para permitir autoplay después
    if (deviceInfo.isIOS) {
      try {
        // Crear contexto de audio para desbloquear interacciones en iOS
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
          const audioCtx = new AudioContext();
          logger.info('Contexto de audio inicializado para iOS');
          
          // Reproduce un sonido silencioso para desbloquear audio/interacciones en iOS
          const silentSound = audioCtx.createBuffer(1, 1, 22050);
          const source = audioCtx.createBufferSource();
          source.buffer = silentSound;
          source.connect(audioCtx.destination);
          source.start();
        }
      } catch (e) {
        logger.warn('Error al inicializar audio para iOS', e);
      }
    }

    // Actualizar la detección de iOS al inicio
    setIsIOSDevice(deviceInfo.isIOS);
    logger.info(`Detección de plataforma: iOS=${deviceInfo.isIOS}, versión=${deviceInfo.iOSVersion}, Safari=${deviceInfo.isSafari}, Safari versión=${deviceInfo.safariVersion}`);

    // Comprobar si estamos en HTTP en vez de HTTPS (crítico para iOS)
    if (deviceInfo.isIOS && window.location.protocol === 'http:' && window.location.hostname !== 'localhost') {
      logger.warn('AR en iOS requiere HTTPS. Redirigiendo...');
      window.location.href = window.location.href.replace('http:', 'https:');
    }

    // Precargar modelos para evitar problemas CORS
    const preloadUrls = [
      MODEL_URLS.remote,
      MODEL_URLS.fallback,
      'https://assets.codepen.io/1681167/SantaMaria_futuro.glb',
      'https://models.babylonjs.com/CornellBox/cornellBox.glb'
    ];
    
    // Usar Promise.all para precargar en paralelo
    Promise.all(preloadUrls.map(url => preloadModel(url)))
      .then(results => {
        const successCount = results.filter(Boolean).length;
        logger.info(`Precarga completada: ${successCount}/${preloadUrls.length} modelos cargados`);
      })
      .catch(e => {
        logger.warn('Error en precarga de modelos', e);
      });

    // Limpiar listeners al desmontar
    return () => {
      logger.info('Desmontando componente ARViewTest');
      document.removeEventListener('model-error', () => {});
      document.removeEventListener('loaded', () => {});
      window.removeEventListener('error', () => {});
      window.removeEventListener('unhandledrejection', () => {});
      ['loaded', 'renderstart', 'renderstop', 'enter-vr', 'exit-vr', 'camera-ready'].forEach(eventName => {
        document.removeEventListener(eventName, () => {});
      });
    };
  }, []);

  // Reiniciar la App cuando se detectan errores críticos
  useEffect(() => {
    if (error && error.includes('cámara') && !permissionDenied) {
      // Si hay un error de cámara pero no es por permisos denegados, intentar reiniciar
      const retryTimeout = setTimeout(() => {
        logger.info('Intentando reiniciar la aplicación después de error de cámara');
        window.location.reload();
      }, 5000);
      
      return () => clearTimeout(retryTimeout);
    }
  }, [error, permissionDenied]);

  // Función para solicitar permisos de cámara de manera robusta
  const requestCameraPermission = async () => {
    logger.info('Solicitando permiso de cámara explícitamente...');
    setPermissionAsked(true);
    
    try {
      // Configuración de cámara optimizada para dispositivos móviles
      const constraints: MediaStreamConstraints = {
        video: isMobileDevice ? 
          { 
            facingMode: { ideal: 'environment' },
            width: { ideal: 720 }, // Reducir calidad en móvil para mejor rendimiento
            height: { ideal: 1280 }
          } : 
          { 
            facingMode: 'environment', 
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
        audio: false
      };
      
      logger.info('Usando configuración de cámara:', constraints);
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      logger.info('Permiso de cámara concedido', {
        tracks: stream.getVideoTracks().length,
        label: stream.getVideoTracks()[0]?.label || 'sin etiqueta'
      });
      
      setCameraActive(true);
      
      // Obtener información detallada de la cámara para diagnóstico
      try {
        const videoTrack = stream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();
        const capabilities = videoTrack.getCapabilities();
        
        logger.info('Configuración de cámara:', settings);
        if (capabilities) {
          logger.info('Capacidades de la cámara:', capabilities);
        }
        
        // Limpiar el track después de obtener la información
        if (isMobileDevice) {
          // En móviles, liberamos la cámara aquí para que AR.js pueda capturarla después
          // Esto evita el error de "Permission denied" en AR.js
          stream.getTracks().forEach(track => track.stop());
          logger.info('Stream de cámara liberado para AR.js');
        }
      } catch (e) {
        logger.warn('Error al obtener detalles de la cámara', e);
      }
      
      // En móviles, especialmente iOS, necesitamos un breve retraso
      const delay = deviceInfo.isIOS ? 1500 : 800;
      setTimeout(() => {
        logger.info(`Activando AR después de ${delay}ms delay`);
        setArReady(true);
      }, delay);
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('Error al solicitar acceso a la cámara', {
        error: errorMessage,
        name: err instanceof Error ? err.name : 'UnknownError'
      });
      
      // Detectar razón específica del error
      if (errorMessage.includes('denied') || errorMessage.includes('denied') || 
          errorMessage.includes('permission') || (err instanceof Error && err.name === 'NotAllowedError')) {
        logger.error('Permiso de cámara denegado por el usuario');
        setPermissionDenied(true);
        setError('Permiso de cámara denegado. Por favor, permite el acceso desde la configuración de tu navegador.');
      } else if (errorMessage.includes('device') || (err instanceof Error && err.name === 'NotFoundError')) {
        setError('No se encontró ninguna cámara en tu dispositivo.');
      } else if (errorMessage.includes('insecure') || errorMessage.includes('secure origin')) {
        setError('Esta aplicación requiere HTTPS para acceder a la cámara.');
      } else if (deviceInfo.isIOS && deviceInfo.isSafari && cameraInitAttemptsRef.current < 2) {
        // Safari en iOS a veces necesita múltiples intentos
        logger.info('Reintentando inicialización de cámara en Safari iOS...');
        cameraInitAttemptsRef.current++;
        setTimeout(requestCameraPermission, 1000);
        return false;
      } else {
        setError(`Error al acceder a la cámara: ${errorMessage}`);
      }
      
      return false;
    }
  };

  // Manejo de cámara y permiso de video
  useEffect(() => {
    if (permissionAsked) {
      return; // Evitar solicitar permisos repetidamente
    }
    
    logger.info('Iniciando proceso de solicitud de cámara...');
    
    // Verificar si hay soporte para mediaDevices
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      logger.error('getUserMedia no está soportado en este navegador');
      setError('Tu navegador no soporta acceso a la cámara. Intenta con Chrome o Safari recientes.');
      return;
    }
    
    // Solicitar cámara
    requestCameraPermission();
    
  }, [permissionAsked]);

  // Manejador de carga del modelo - inicia el proceso y maneja cambios de URL
  useEffect(() => {
    if (!arReady) {
      logger.info('AR no está listo todavía, esperando para cargar el modelo...');
      return;
    }
    
    if (currentModelUrl && modelLoadAttempts === 0) {
      // En dispositivos móviles, usar preferentemente modelos locales/simplificados
      if (isMobileDevice && modelLoadAttempts === 0) {
        logger.info('Dispositivo móvil detectado, optando por modelos optimizados');
        // Si es la primera carga en móvil, preferir modelo local (más rápido)
        if (window.location.protocol === 'https:') {
          // En HTTPS podemos usar el modelo remoto, pero preferimos local por rendimiento
          const mobileUrl = MODEL_URLS.local;
          setCurrentModelUrl(mobileUrl);
          loadModel(mobileUrl);
        } else {
          // En HTTP, usar local directamente
          loadModel(MODEL_URLS.local);
        }
      } else {
        // En desktop, seguir el comportamiento normal
        loadModel(currentModelUrl);
      }
    }
    
    return () => {
      if (xhrRef.current) {
        logger.info('Abortando carga del modelo (cleanup)');
        xhrRef.current.abort();
        xhrRef.current = null;
      }
    };
  }, [arReady, currentModelUrl, isMobileDevice]);

  // Función para cargar un modelo con manejo de progreso y recuperación
  const loadModel = async (url: string = MODEL_URLS.remote): Promise<void> => {
    logger.info(`Iniciando carga de modelo simplificada. URL: ${url}`);
    
    // Inicializar variables de estado
    setLoading(true);
    setModelLoading(true);
    setLoadingProgress(0);
    setCurrentStep('cargando modelo 3D');
    setCurrentModelUrl(url);
    
    try {
      // Obtener contenedor del modelo
      const modelEntity = document.getElementById('model-container');
      if (!modelEntity) {
        throw new Error('Contenedor de modelo no encontrado');
      }
      
      // Mientras carga, mostrar un placeholder simple
      try {
        modelEntity.setAttribute('gltf-model', '#placeholder-model');
      } catch (e) {
        logger.warn('No se pudo mostrar placeholder mientras carga');
      }
      
      // Para URLs remotas, intentar precargar con progreso
      if (url.startsWith('http')) {
        try {
          logger.info(`Cargando modelo remoto con seguimiento de progreso: ${url}`);
          
          // Configurar request
          const xhr = new XMLHttpRequest();
          xhr.open('GET', url, true);
          xhr.responseType = 'blob';
          
          // Manejar progreso
          xhr.onprogress = (event) => {
            if (event.lengthComputable) {
              const progress = Math.min(99, Math.round((event.loaded / event.total) * 100));
              setLoadingProgress(progress);
              if (progress % 10 === 0) {
                logger.info(`Progreso de carga: ${progress}% (${formatBytes(event.loaded)} / ${formatBytes(event.total)})`);
              }
            }
          };
          
          // Manejar éxito
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              const blob = xhr.response;
              
              // Verificar tamaño mínimo para evitar modelos corruptos
              if (blob.size < 10 * 1024) { // Menos de 10KB
                throw new Error(`Modelo demasiado pequeño (${formatBytes(blob.size)}) - posible archivo corrupto`);
              }
              
              const objectURL = URL.createObjectURL(blob);
              logger.info(`Modelo descargado (${formatBytes(blob.size)}), aplicando a la escena`);
              setLoadingProgress(100);
              
              // Aplicar modelo
              modelEntity.removeAttribute('gltf-model'); // Quitar cualquier modelo previo
              setTimeout(() => {
                modelEntity.setAttribute('gltf-model', objectURL);
                modelEntity.setAttribute('scale', isMobileDevice ? '0.5 0.5 0.5' : '1 1 1');
                
                // En iOS, forzar actualización para evitar problemas de renderizado
                if (deviceInfo.isIOS) {
                  setTimeout(() => {
                    const scene = document.querySelector('a-scene');
                    if (scene) {
                      (scene as any).object3D?.updateMatrixWorld(true);
                    }
                  }, 500);
                }
              }, 100);
            } else {
              throw new Error(`Error HTTP: ${xhr.status}`);
            }
          };
          
          // Manejar errores
          xhr.onerror = () => {
            throw new Error('Error de red al cargar el modelo');
          };
          
          xhr.ontimeout = () => {
            throw new Error('Timeout al cargar el modelo');
          };
          
          // Configurar timeout
          xhr.timeout = 60000; // 1 minuto máximo
          
          // Iniciar la carga
          xhr.send();
          xhrRef.current = xhr;
        } catch (error) {
          logger.warn(`Error en carga optimizada, intentando método directo: ${error}`);
          modelEntity.setAttribute('gltf-model', url);
        }
      } else {
        // Para URLs locales, cargar directamente
        logger.info(`Cargando modelo local: ${url}`);
        
        // Pequeño retraso para permitir que la escena se inicialice
        setTimeout(() => {
          modelEntity.setAttribute('gltf-model', url);
          modelEntity.setAttribute('scale', isMobileDevice ? '0.5 0.5 0.5' : '1 1 1');
        }, 200);
      }
      
      // Manejar eventos
      // Eventos para A-Frame 1.0.0+
      modelEntity.addEventListener('model-loaded', (event) => {
        logger.info('Evento model-loaded disparado', event);
        setLoading(false);
        setModelLoading(false);
        setCurrentStep('modelo cargado');
      });
      
      modelEntity.addEventListener('model-error', (event) => {
        logger.error('Evento model-error disparado', event);
        
        // Intentar con otra URL si esta falla
        if (url === MODEL_URLS.remote) {
          logger.warn('Fallback a modelo simplificado');
          loadModel(MODEL_URLS.simplified);
        } else if (url === MODEL_URLS.simplified) {
          logger.warn('Fallback a modelo local');
          loadModel(MODEL_URLS.local);
        } else if (url === MODEL_URLS.local) {
          logger.warn('Fallback a modelo de respaldo');
          loadModel(MODEL_URLS.fallback);
        } else {
          // Si todos los intentos fallan, mostrar el cubo
          showFallbackModel();
        }
      });
      
      // Verificar la carga después de un tiempo razonable
      const timeout = setTimeout(() => {
        const hasModel = modelEntity.getAttribute('gltf-model');
        const hasObject = (modelEntity as any).getObject3D && (modelEntity as any).getObject3D('mesh');
        
        logger.info(`Verificando carga de modelo: hasModel=${!!hasModel}, hasObject=${!!hasObject}`);
        
        if (!hasObject) {
          // Manejar de manera similar a un error de carga
          logger.warn('Timeout de verificación - modelo no cargado');
          
          if (url === MODEL_URLS.remote) {
            logger.warn('Timeout: intentando con modelo simplificado');
            loadModel(MODEL_URLS.simplified);
          } else if (url === MODEL_URLS.simplified) {
            logger.warn('Timeout: intentando con modelo local');
            loadModel(MODEL_URLS.local);
          } else if (url === MODEL_URLS.local) {
            logger.warn('Timeout: intentando con modelo de respaldo');
            loadModel(MODEL_URLS.fallback);
          } else {
            // Si todos fallan, mostrar el fallback
            showFallbackModel();
          }
        }
      }, 30000);
      
      // Función para mostrar el modelo de respaldo
      const showFallbackModel = () => {
        logger.error('No se pudo cargar ningún modelo 3D, mostrando respaldo');
        setError('No se pudo cargar el modelo 3D. Se muestra una versión simplificada.');
        
        // Mostrar el cubo de respaldo
        const fallbackModel = document.getElementById('fallback-model');
        if (fallbackModel) {
          fallbackModel.setAttribute('visible', 'true');
        }
        
        setLoading(false);
        setModelLoading(false);
        setCurrentStep('usando modelo de respaldo');
      };
      
      // Limpiar timeout si el componente se desmonta
      useEffect(() => {
        return () => {
          if (timeout) {
            clearTimeout(timeout);
          }
        };
      }, [timeout]);
    } catch (error: any) {
      logger.error('Error general al cargar el modelo:', error);
      setError(`Error al cargar el modelo: ${error.message || 'Error desconocido'}`);
      
      // Mostrar cubo de respaldo
      const fallbackModel = document.getElementById('fallback-model');
      if (fallbackModel) {
        fallbackModel.setAttribute('visible', 'true');
      }
      
      setLoading(false);
      setModelLoading(false);
    }
  };

  // Función para reintentar si ocurre un error
  const retrySetup = async () => {
    setError(null);
    setCameraPermissionError(false);
    setLoading(true);
    setLoadingProgress(0);
    setLoadingStuck(false);
    
    // Limpiar cualquier escena AR previa
    if (sceneRef.current) {
      while (sceneRef.current.firstChild) {
        sceneRef.current.removeChild(sceneRef.current.firstChild);
      }
    }
    
    // Reiniciar el proceso
    initializeAR();
  };

  // Función para inicializar AR con opciones específicas para iOS
  const initializeAR = async (): Promise<void> => {
    logger.info('Inicializando AR simplificado...');
    setCurrentStep('inicializando realidad aumentada');
    
    try {
      // Verificar modelos locales primero
      const localModelsAvailable = await checkLocalResources();
      logger.info(`Modelos locales disponibles: ${localModelsAvailable}`);
      
      // Verificar permisos de cámara
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }, 
          audio: false 
        });
        
        // Liberamos el stream para que A-Frame pueda usarlo
        stream.getTracks().forEach(track => track.stop());
        logger.info('Permiso de cámara concedido, iniciando AR');
        
        // Activar AR
        setArReady(true);
        
        // Cargar el modelo - elegir el adecuado según plataforma
        const modelUrl = isMobileDevice ? 
          (localModelsAvailable ? MODEL_URLS.local : MODEL_URLS.simplified) : 
          (localModelsAvailable ? MODEL_URLS.local : MODEL_URLS.remote);
        
        // Pequeño retraso para asegurar que A-Frame esté listo
        setTimeout(() => {
          loadModel(modelUrl);
        }, 1000);
        
      } catch (error: any) {
        setError(`Error al acceder a la cámara: ${error.message || 'Error desconocido'}`);
        logger.error('Error al inicializar cámara AR:', error);
      }
    } catch (error: any) {
      setError(`Error al inicializar AR: ${error.message || 'Error desconocido'}`);
      logger.error('Error general en inicialización:', error);
    }
  };

  // Obtener el HTML para A-Frame con opciones específicas para cada plataforma
  const getAframeHTML = (): string => {
    const baseHTML = `
      <a-scene 
        vr-mode-ui="enabled: false"
        renderer="logarithmicDepthBuffer: true; ${deviceInfo.isIOS ? 'precision: medium; antialias: false;' : 'precision: high; antialias: true;'} colorManagement: false; sortObjects: true; physicallyCorrectLights: false;"
        embedded 
        arjs="sourceType: webcam; debugUIEnabled: false; detectionMode: mono; maxDetectionRate: 30; canvasWidth: 640; canvasHeight: 480;"
        loading-screen="enabled: false"
        inspector="url: https://cdn.jsdelivr.net/gh/aframevr/aframe-inspector@master/dist/aframe-inspector.min.js"
      >
        <!-- Precargar DRACO decoder para mejor compresión de modelos -->
        <a-assets timeout="10000">
          <a-asset-item id="placeholder-model" src="${MODEL_URLS.placeholder}"></a-asset-item>
        </a-assets>
        
        <a-camera 
          gps-projected-camera 
          rotation-reader 
          look-controls="enabled: false"
          position="0 1.6 0"
          near="0.1"
          far="10000"
        ></a-camera>
        
        <!-- Contenedor principal para el modelo GLB -->
        <a-entity 
          id="model-container" 
          position="0 0 -5" 
          rotation="0 0 0"
          animation="property: rotation; to: 0 360 0; loop: true; dur: 10000; easing: linear;"
          draco-decoder="legacy: false"
          oculus-thumbstick-controls="acceleration: 20"
        ></a-entity>
        
        <!-- Modelo de respaldo básico -->
        <a-box 
          id="fallback-model" 
          position="0 0 -5" 
          width="1" height="1" depth="1" 
          color="#4CC3D9"
          visible="false"
          animation="property: rotation; to: 0 360 0; dur: 10000; easing: linear; loop: true"
        ></a-box>
        
        <!-- Luces para mejor visualización -->
        <a-light type="ambient" color="#CCC" intensity="0.7"></a-light>
        <a-light type="directional" color="#FFF" intensity="0.7" position="1 1 1"></a-light>
      </a-scene>
    `;
    
    return baseHTML;
  };

  // Función de utilidad para formatear bytes
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  return (
    <div className="ar-container">
      {DEBUG && (
        <div className="debug-panel">
          <h3>Debug</h3>
          <p>AR Ready: {String(arReady)}</p>
          <p>Camera: {String(cameraActive)}</p>
          <p>Mobile: {String(isMobileDevice)}</p>
          <p>Progress: {loadingProgress}%</p>
          <p>Attempt: {modelLoadAttempts}</p>
          <p>URL: {currentModelUrl.substring(0, 15)}...</p>
          {loadingErrors.length > 0 && (
            <>
              <p style={{color: '#ff6b6b'}}>Errores:</p>
              <ul style={{margin: '0', paddingLeft: '15px', fontSize: '9px'}}>
                {loadingErrors.slice(-3).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      
      {error && (
        <div className="error-overlay">
          <p>{error}</p>
          {permissionDenied ? (
            <div>
              <p style={{fontSize: '0.9rem'}}>
                Debes permitir el acceso a la cámara para usar esta aplicación AR.
              </p>
              <button 
                className="retry-button"
                onClick={() => {
                  setPermissionDenied(false);
                  setPermissionAsked(false);
                  setError(null);
                  setLoadingErrors([]);
                  requestCameraPermission();
                }}
              >
                Reintentar
              </button>
            </div>
          ) : (
            <Link to="/" className="back-button">Volver al inicio</Link>
          )}
        </div>
      )}
      
      {!arReady && !error && (
        <div className="loading-overlay">
          <p>Inicializando cámara{cameraInitAttemptsRef.current > 0 ? ` (intento ${cameraInitAttemptsRef.current + 1})` : ''}...</p>
          <p style={{fontSize: '0.8rem', marginTop: '10px'}}>
            {isMobileDevice ? 'Por favor permite el acceso a la cámara cuando el navegador lo solicite.' : ''}
          </p>
        </div>
      )}
      
      {modelLoading && arReady && !error && (
        <div className="model-loading-indicator">
          <div className="progress-bar-container">
            <div className="progress-bar" style={{ width: `${loadingProgress}%` }}></div>
          </div>
          <p>Cargando modelo 3D: {loadingProgress}%</p>
          {modelLoadAttempts > 1 && (
            <p className="retry-message">Intento {modelLoadAttempts}/4: {
              currentModelUrl.includes('local') ? 'Usando copia local' : 
              currentModelUrl.includes('github') ? 'Usando copia de GitHub' :
              currentModelUrl.includes('fallback') ? 'Usando modelo simplificado' : 
              'Reintentando...'
            }</p>
          )}
        </div>
      )}
      
      <div className="ar-info-overlay">
        <p>Modelo posicionado a aproximadamente {testDistance} metros de ti</p>
      </div>
      
      <Link to="/" className="back-button-ar">Volver</Link>
      
      {/* A-Frame Scene */}
      {arReady && (
        <div 
          ref={sceneRef} 
          className="scene-container" 
          dangerouslySetInnerHTML={{ __html: getAframeHTML() }}
        />
      )}
    </div>
  );
};

export default ARViewTest; 