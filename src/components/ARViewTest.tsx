import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
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
  const [modelLoaded, setModelLoaded] = useState<boolean>(false);
  const [currentPosition, setCurrentPosition] = useState<{latitude?: number, longitude?: number}>({});
  
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
      MODEL_URLS.simplified
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
  }, [deviceInfo, selectModelUrl]);

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
    
  }, [permissionAsked, requestCameraPermission]);

  // Mover loadModel aquí, antes del useEffect que la usa
  // Función para cargar un modelo con manejo de progreso y recuperación
  const loadModel = useCallback((modelUrl: string) => {
    if (!modelUrl) {
      logger.error('URL de modelo inválida');
      setError('URL de modelo 3D inválida');
      return;
    }

    // Limpiar petición anterior si existe
    if (xhrRef.current) {
      logger.info('Abortando carga anterior del modelo');
      xhrRef.current.abort();
      xhrRef.current = null;
    }

    // Obtener información del dispositivo y navegador
    const isIOSDevice = deviceInfo.isIOS;
    const isSafariDevice = deviceInfo.isSafari;
    const userAgent = navigator.userAgent;
    
    logger.info(`Iniciando carga del modelo: ${modelUrl}`, {
      isIOS: isIOSDevice,
      isSafari: isSafariDevice,
      userAgent: userAgent.substring(0, 100), // Truncar para evitar logs demasiado largos
      attemptNumber: modelLoadAttempts + 1
    });

    // Establecer estado de carga
    setLoading(true);
    setLoadingProgress(0);
    const startTime = Date.now();
    setModelLoadAttempts(prev => prev + 1);

    // Crear referencia al modelo para limpieza posterior
    let modelElement: Element | null = null;
    let timeout: number | null = null;

    // URLs alternativas según la prioridad (primaria, local, simplificada, fallback)
    const modelUrls = {
      primary: modelUrl,
      local: MODEL_URLS.local,
      simplified: MODEL_URLS.simplified,
      fallback: MODEL_URLS.fallback
    };

    // Configuraciones específicas para iOS
    const config = {
      maxAttempts: isIOSDevice ? 2 : 3,
      timeout: isIOSDevice ? 20000 : 30000, // 20 segundos para iOS, 30 para otros
      minValidSize: isIOSDevice ? 5 * 1024 : 10 * 1024, // 5KB mínimo para iOS
      retryDelay: isIOSDevice ? 500 : 1000,
      progressThrottle: isIOSDevice ? 500 : 200 // Limitar las actualizaciones de progreso
    };

    // En iOS, iniciar AudioContext para evitar problemas de bloqueo 
    // (soluciona el problema de "user gesture required" en Safari)
    if (isIOSDevice && 'AudioContext' in window) {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioCtx.state === 'suspended') {
          audioCtx.resume().then(() => {
            logger.info('AudioContext iniciado correctamente en iOS');
          }).catch(e => {
            logger.warn('No se pudo iniciar AudioContext, posible interacción requerida', e);
          });
        }
      } catch (e) {
        logger.warn('Error al iniciar AudioContext en iOS', e);
      }
    }

    // Función para cargar con fetch (mejor compatibilidad con iOS que XMLHttpRequest)
    const loadWithFetch = async (url: string, attempt: number): Promise<ArrayBuffer> => {
      const controller = new AbortController();
      const signal = controller.signal;
      
      // Configurar timeout
      const timeoutId = setTimeout(() => controller.abort(), config.timeout);
      
      try {
        logger.info(`Intento ${attempt + 1} - Cargando modelo con fetch: ${url}`);
        
        const response = await fetch(url, { 
          signal,
          cache: 'no-store', // Evitar caché para asegurar versión actual
          headers: {
            'Accept': 'model/gltf-binary, application/octet-stream',
            'X-Requested-With': 'Fetch' // Para logging
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        
        // Si la respuesta tiene Content-Length, podemos mostrar progreso
        const totalSize = response.headers.get('Content-Length');
        
        // Para mostrar progreso con fetch necesitamos usar ReadableStream
        // Solo compatible con navegadores modernos
        const reader = response.body?.getReader();
        let receivedLength = 0;
        const chunks: Uint8Array[] = [];
        let lastProgressUpdate = Date.now();
        
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              break;
            }
            
            chunks.push(value);
            receivedLength += value.length;
            
            // Actualizar progreso, pero con limitación para no saturar la UI
            if (totalSize && (Date.now() - lastProgressUpdate > config.progressThrottle)) {
              const percentComplete = Math.floor((receivedLength / Number(totalSize)) * 100);
              setLoadingProgress(percentComplete);
              lastProgressUpdate = Date.now();
              
              logger.info(`Progreso de carga: ${percentComplete}%`, {
                loaded: formatBytes(receivedLength),
                total: formatBytes(Number(totalSize)),
                url
              });
            }
          }
        } else {
          // Fallback si no podemos usar reader (menos común)
          const buffer = await response.arrayBuffer();
          receivedLength = buffer.byteLength;
          chunks.push(new Uint8Array(buffer));
          setLoadingProgress(100);
        }
        
        // Combinar todos los fragmentos en un único ArrayBuffer
        let result = new Uint8Array(receivedLength);
        let position = 0;
        for (const chunk of chunks) {
          result.set(chunk, position);
          position += chunk.length;
        }
        
        clearTimeout(timeoutId);
        
        logger.info(`Modelo descargado correctamente: ${formatBytes(receivedLength)}`, {
          url,
          loadTime: `${Date.now() - startTime}ms`
        });
        
        return result.buffer;
      } catch (error: any) {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
          logger.error(`Timeout al cargar el modelo (${config.timeout}ms)`, { url });
          throw new Error(`Timeout: ${config.timeout}ms`);
        } else {
          logger.error(`Error al cargar el modelo: ${error.message}`, { url });
          throw error;
        }
      }
    };

    // Función para procesar el modelo una vez descargado
    const processModel = async (buffer: ArrayBuffer, url: string) => {
      // Validar tamaño mínimo
      if (buffer.byteLength < config.minValidSize) {
        logger.warn(`El modelo parece demasiado pequeño: ${formatBytes(buffer.byteLength)}`);
        // Continuar de todos modos, puede ser un modelo muy simple
      }

      // Validar formato (verificar firma GLB)
      const arr = new Uint8Array(buffer.slice(0, 4));
      const glbSignature = Array.from(arr).map(byte => String.fromCharCode(byte)).join('');
      if (glbSignature !== 'glTF') {
        logger.warn('El modelo no tiene firma GLB válida', {
          signature: glbSignature,
          expected: 'glTF'
        });
        // Continuar de todos modos, podría ser otro formato de modelo
      }

      try {
        // Crear objeto URL del modelo descargado
        const blob = new Blob([buffer], { type: 'model/gltf-binary' });
        const objectUrl = URL.createObjectURL(blob);

        // Obtener el elemento A-Frame donde cargaremos el modelo
        const sceneEl = document.querySelector('a-scene');
        const existingModel = document.querySelector('#ar-model');
        
        if (existingModel) {
          logger.info('Eliminando modelo existente');
          existingModel.remove();
        }
        
        if (!sceneEl) {
          logger.error('No se encontró la escena de A-Frame');
          setError('Error al cargar el entorno 3D');
          setLoading(false);
          return;
        }

        // Crear y configurar el modelo
        modelElement = document.createElement('a-entity');
        modelElement.setAttribute('id', 'ar-model');
        modelElement.setAttribute('gltf-model', objectUrl);
        modelElement.setAttribute('position', '0 0 0');
        
        // En iOS, aplicar configuraciones específicas para mejor rendimiento
        if (isIOSDevice) {
          // Escala más pequeña para mejor rendimiento en iOS
          modelElement.setAttribute('scale', '0.85 0.85 0.85');
          // Reducir polígonos en iOS activando LOD (Level of Detail) de A-Frame
          modelElement.setAttribute('lod', 'minCellWidth: 0.005; maxCellWidth: 0.1; targetCellWidth: 0.03');
          // Reducir detalles de materiales
          modelElement.setAttribute('material', 'npot: true; dithering: false');
        } else {
          modelElement.setAttribute('scale', '1 1 1');
        }
        
        modelElement.setAttribute('rotation', '0 0 0');
        
        // Obtener coordenadas del componente si están disponibles
        if (currentPosition && currentPosition.latitude && currentPosition.longitude) {
          modelElement.setAttribute('gps-projected-entity-place', '');
          const coords = `latitude: ${currentPosition.latitude}; longitude: ${currentPosition.longitude}`;
          modelElement.setAttribute('gps-projected-entity-place', coords);
          logger.info(`Posicionando modelo en coordenadas: ${coords}`);
        }
        
        // Evento cuando el modelo se ha cargado correctamente
        modelElement.addEventListener('model-loaded', function() {
          setLoading(false);
          setModelLoaded(true);
          
          logger.info('Modelo cargado y renderizado correctamente', {
            url,
            loadTime: `${Date.now() - startTime}ms`
          });

          // En iOS, necesitamos tratamiento especial
          if (isIOSDevice) {
            logger.info('Aplicando optimizaciones posteriores para iOS');
            timeout = window.setTimeout(() => {
              try {
                const modelObj = modelElement as any;
                if (modelObj && modelObj.object3D) {
                  const obj3D = modelObj.object3D;
                  
                  // Forzar actualización de matrices y geometrías
                  obj3D.matrix.decompose(obj3D.position, obj3D.quaternion, obj3D.scale);
                  obj3D.updateMatrixWorld(true);
                  
                  // Reducir complejidad en iOS
                  if (obj3D.children && obj3D.children.length > 0) {
                    obj3D.children.forEach((child: any) => {
                      // Optimizar materiales
                      if (child.material) {
                        if (Array.isArray(child.material)) {
                          child.material.forEach((mat: any) => {
                            if (mat) {
                              mat.precision = 'lowp'; // 'lowp', 'mediump', 'highp'
                              mat.fog = false; // Desactivar niebla para mejor rendimiento
                            }
                          });
                        } else if (child.material) {
                          child.material.precision = 'lowp';
                          child.material.fog = false;
                        }
                      }
                    });
                  }
                  
                  logger.info('Matrices y materiales del modelo optimizados');
                }
              } catch (e) {
                logger.error('Error al optimizar modelo en iOS', e);
              }
            }, 500); // Delay reducido para mejor experiencia
          }
        });
        
        // Manejar errores de carga del modelo
        modelElement.addEventListener('model-error', function(e) {
          logger.error('Error al cargar el modelo en el escenario', e);
          setLoading(false);
          setError('Error en la renderización del modelo 3D');
          
          // Intentar cargar modelo alternativo si aún tenemos intentos disponibles
          if (modelLoadAttempts < config.maxAttempts) {
            logger.info('Intentando cargar modelo alternativo');
            const nextUrl = MODEL_URLS.simplified;
            setCurrentModelUrl(nextUrl);
          }
        });
        
        // Agregar el modelo a la escena
        sceneEl.appendChild(modelElement);
        
        logger.info('Modelo añadido a la escena', { url });
      } catch (e) {
        logger.error('Error al procesar el modelo descargado', e);
        setLoading(false);
        setError('Error al procesar el modelo 3D');
        
        // Intentar con un modelo alternativo
        if (modelLoadAttempts < config.maxAttempts) {
          const fallbackUrl = MODEL_URLS.fallback;
          logger.info(`Intentando con modelo alternativo: ${fallbackUrl}`);
          setCurrentModelUrl(fallbackUrl);
        }
      }
    };

    // Función para intentar cargar el modelo con recuperación
    const attemptLoad = async () => {
      let currentAttempt = 0;
      let lastError: Error | null = null;
      
      while (currentAttempt < config.maxAttempts) {
        try {
          // Seleccionar URL según el intento actual
          let urlToUse = modelUrl;
          
          if (currentAttempt > 0) {
            // Para el segundo intento, usar local o simplificado según el dispositivo
            urlToUse = isIOSDevice ? modelUrls.simplified : modelUrls.local;
            // Para el tercer intento, ir al fallback
            if (currentAttempt > 1) {
              urlToUse = modelUrls.fallback;
            }
            
            logger.info(`Reintentando carga con URL alternativa (#${currentAttempt + 1}): ${urlToUse}`);
          }
          
          // Intentar cargar con fetch (mejor para iOS)
          const buffer = await loadWithFetch(urlToUse, currentAttempt);
          
          // Procesar el modelo
          await processModel(buffer, urlToUse);
          
          // Si llegamos aquí, la carga fue exitosa
          return;
        } catch (error: any) {
          lastError = error;
          logger.error(`Error en intento #${currentAttempt + 1}: ${error.message}`);
          
          // Registrar el error para depuración
          setLoadingErrors(prev => [...prev, `Intento ${currentAttempt + 1}: ${error.message}`]);
          
          // Incrementar el contador de intentos
          currentAttempt++;
          
          // Si aún tenemos intentos, esperar antes del siguiente
          if (currentAttempt < config.maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, config.retryDelay));
          }
        }
      }
      
      // Si llegamos aquí, todos los intentos fallaron
      logger.error(`Todos los intentos fallaron (${config.maxAttempts})`, { lastError });
      setLoading(false);
      setError(`No se pudo cargar el modelo después de ${config.maxAttempts} intentos`);
    };
    
    // Iniciar el proceso de carga
    attemptLoad().catch(error => {
      logger.error('Error crítico durante la carga', error);
      setLoading(false);
      setError('Error crítico durante la carga del modelo');
    });
    
    // Limpiar recursos cuando se desmonte el componente
    return () => {
      if (timeout) {
        window.clearTimeout(timeout);
      }
    };
  }, [deviceInfo, modelLoadAttempts, currentPosition, setModelLoaded]);

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
  }, [arReady, currentModelUrl, isMobileDevice, modelLoadAttempts, loadModel]);

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