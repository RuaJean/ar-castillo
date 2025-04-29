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

// URLs del modelo para distintos escenarios
const MODEL_URLS = {
  remote: 'https://jeanrua.com/models/SantaMaria_futuro.glb', // URL remota principal
  local: './models/SantaMaria_futuro.glb',     // URL local (para desarrollo)
  backup: 'https://raw.githubusercontent.com/ejemplos/modelo3d/master/SantaMaria_futuro.glb', // URL de respaldo
  fallback: './models/SantaMaria_simple.glb',  // Modelo simplificado como último recurso
  simplified: 'https://jeanrua.com/models/SantaMaria_simple.glb' // Versión ligera para móviles
};

// Configuración del proceso de carga de modelos
const MODEL_LOAD_CONFIG = {
  maxAttempts: 4,
  timeout: 30000,
  minValidSize: 100 * 1024, // 100KB mínimo para considerar un modelo válido
  retryDelay: 2000,
  progressThrottle: 500 // ms entre actualizaciones de progreso
};

// Configuración específica para iOS
const IOS_CONFIG = {
  maxAttempts: 3,
  timeout: 25000,
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
      const newUrl = currentModelUrl === MODEL_URLS.remote ? MODEL_URLS.local : MODEL_URLS.backup;
      logger.info(`Segundo intento: usando ${newUrl === MODEL_URLS.local ? 'URL local' : 'URL de backup GitHub'}`);
      return newUrl;
    } else if (modelLoadAttempts === 2) {
      // Tercer intento: usar GitHub si no se ha intentado aún
      if (!currentModelUrl.includes('github')) {
        logger.info('Tercer intento: usando URL de backup GitHub');
        return MODEL_URLS.backup;
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

  // Función mejorada de carga de modelo con manejo específico para iOS
  const loadModel = async (url: string = MODEL_URLS.remote): Promise<void> => {
    logger.info(`Iniciando carga de modelo. UA: ${navigator.userAgent}`);
    
    if (!url) {
      setError('URL del modelo no válida');
      return;
    }
    
    setLoading(true);
    setLoadingProgress(0);
    setCurrentStep('cargando modelo 3D');
    
    // Definir URLs de modelos alternativos
    const modelUrls = {
      primary: url,
      local: '/models/model.glb', // Modelo local como respaldo
      simplified: '/models/simplified.glb', // Versión simplificada para dispositivos de baja potencia
      fallback: 'https://cdn.example.com/models/fallback.glb' // URL de CDN alternativo
    };
    
    // Configuración específica para iOS vs otros dispositivos
    const config = {
      maxAttempts: deviceInfo.isIOS ? 2 : 3,
      timeout: deviceInfo.isIOS ? 15000 : 30000, // Timeout más corto para iOS
      minValidSize: deviceInfo.isIOS ? 10 * 1024 : 100 * 1024, // 10KB vs 100KB
      retryDelay: deviceInfo.isIOS ? 1000 : 2000,
      progressThrottle: deviceInfo.isIOS ? 500 : 200 // Menos actualizaciones de progreso en iOS
    };
    
    // En iOS, iniciar un AudioContext para evitar bloqueos
    if (deviceInfo.isIOS) {
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        const audioContext = new AudioContext();
        audioContext.resume().then(() => logger.info('AudioContext iniciado en iOS'));
      } catch (e) {
        logger.warn('No se pudo iniciar AudioContext en iOS', e);
      }
    }
    
    let lastProgressUpdate = 0;
    let currentAttempt = 0;
    let lastUrl = '';
    
    while (currentAttempt < config.maxAttempts) {
      currentAttempt++;
      
      // Seleccionar URL basada en el intento actual
      let currentUrl = modelUrls.primary;
      if (currentAttempt === 2) {
        currentUrl = deviceInfo.isIOS ? modelUrls.simplified : modelUrls.local;
        logger.warn(`Intento ${currentAttempt}: Cambiando a modelo ${deviceInfo.isIOS ? 'simplificado' : 'local'}: ${currentUrl}`);
      } else if (currentAttempt === 3) {
        currentUrl = modelUrls.fallback;
        logger.warn(`Intento ${currentAttempt}: Cambiando a modelo de respaldo: ${currentUrl}`);
      }
      
      // Evitar intentar cargar la misma URL dos veces seguidas
      if (currentUrl === lastUrl) {
        logger.warn(`Saltando URL duplicada: ${currentUrl}`);
        continue;
      }
      
      lastUrl = currentUrl;
      
      try {
        setCurrentStep(`cargando modelo (intento ${currentAttempt}/${config.maxAttempts})`);
        
        // Crear un AbortController para gestionar el timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
          throw new Error(`Timeout al cargar modelo después de ${config.timeout / 1000}s`);
        }, config.timeout);
        
        // Iniciar carga con fetch para tener control sobre el progreso
        const response = await fetch(currentUrl, { 
          signal: controller.signal,
          headers: {
            'Accept': 'application/octet-stream'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Error de red: ${response.status} ${response.statusText}`);
        }
        
        const contentLength = response.headers.get('content-length');
        const totalSize = contentLength ? parseInt(contentLength, 10) : 0;
        
        if (totalSize && totalSize < config.minValidSize) {
          throw new Error(`Modelo demasiado pequeño (${formatBytes(totalSize)}) - posible archivo corrupto`);
        }
        
        // Configurar reader para manejar la carga con progreso
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No se pudo obtener reader para la respuesta');
        }
        
        // Leer los chunks y actualizar el progreso
        let receivedLength = 0;
        const chunks: Uint8Array[] = [];
        
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            break;
          }
          
          chunks.push(value);
          receivedLength += value.length;
          
          // Actualizar progreso con throttling para iOS
          const now = Date.now();
          if (now - lastProgressUpdate > config.progressThrottle) {
            const progress = totalSize ? Math.min(99, Math.round((receivedLength / totalSize) * 100)) : 50;
            setLoadingProgress(progress);
            lastProgressUpdate = now;
          }
        }
        
        // Cancelar el timeout ya que la carga se completó
        clearTimeout(timeoutId);
        
        // Unir los chunks en un solo ArrayBuffer
        const chunksAll = new Uint8Array(receivedLength);
        let position = 0;
        for (const chunk of chunks) {
          chunksAll.set(chunk, position);
          position += chunk.length;
        }
        
        // Verificar firma del archivo para GLB (0x46546C67) o GLTF
        const modelFormat = (chunksAll[0] === 0x67 && chunksAll[1] === 0x6C && chunksAll[2] === 0x54 && chunksAll[3] === 0x46) 
          ? 'glb' 
          : (new TextDecoder().decode(chunksAll.slice(0, 20)).includes('{"asset"')) 
            ? 'gltf' 
            : 'desconocido';
        
        if (modelFormat === 'desconocido') {
          logger.warn(`Formato de modelo no reconocido, intentando cargar de todos modos...`);
        } else {
          logger.info(`Formato de modelo detectado: ${modelFormat}`);
        }
        
        // Cargar modelo en A-Frame
        const modelEntity = document.getElementById('model-container');
        if (!modelEntity) {
          throw new Error('Contenedor de modelo no encontrado en el DOM');
        }
        
        // Crear blob URL para el modelo
        const blob = new Blob([chunksAll], { type: 'application/octet-stream' });
        const modelObjectUrl = URL.createObjectURL(blob);
        
        logger.info(`Modelo descargado: ${formatBytes(receivedLength)}, aplicando a la escena...`);
        setLoadingProgress(100);
        
        // Aplicar modelo específicamente para iOS o dispositivos regulares
        if (deviceInfo.isIOS) {
          // En iOS, usar enfoque más directo para evitar problemas de memoria
          modelEntity.setAttribute('gltf-model', modelObjectUrl);
          modelEntity.setAttribute('scale', '0.5 0.5 0.5'); // Escala reducida para iOS
          
          // Verificar carga exitosa con timeout para iOS
          setTimeout(() => {
            const model = (modelEntity as any).getObject3D('mesh');
            if (model) {
              logger.info('Modelo cargado exitosamente en iOS');
              setLoading(false);
              setCurrentStep('modelo cargado');
            } else {
              throw new Error('No se pudo renderizar el modelo en iOS');
            }
          }, 2000);
        } else {
          // Para dispositivos regulares, mantener enfoque estándar
          modelEntity.setAttribute('gltf-model', modelObjectUrl);
          modelEntity.setAttribute('scale', '1 1 1');
          
          modelEntity.addEventListener('model-loaded', () => {
            logger.info('Modelo cargado exitosamente');
            setLoading(false);
            setCurrentStep('modelo cargado');
          });
          
          modelEntity.addEventListener('model-error', (event) => {
            logger.error('Error al cargar modelo en la escena', event);
            throw new Error('Error al cargar modelo en la escena');
          });
        }
        
        // Modelo cargado exitosamente, salir del bucle
        return;
        
      } catch (error: any) {
        // Manejar diferentes tipos de errores
        const errorMessage = error.message || String(error);
        logger.error(`Error en intento ${currentAttempt}/${config.maxAttempts}: ${errorMessage}`);
        
        // Determinar qué URL usar en el próximo intento basado en el tipo de error
        if (errorMessage.includes('Timeout') || errorMessage.includes('aborto')) {
          logger.warn('Error de timeout, probando con modelo más pequeño en el siguiente intento');
        } else if (errorMessage.includes('red') || errorMessage.includes('fetch')) {
          logger.warn('Error de red, intentando URL alternativa');
        } else if (errorMessage.includes('pequeño') || errorMessage.includes('corrupto')) {
          logger.warn('Archivo corrupto, cambiando a otra fuente');
        } else if (errorMessage.includes('renderizar') || errorMessage.includes('escena')) {
          logger.warn('Error de renderizado, probando modelo simplificado');
        }
        
        // Esperar antes de reintentar (excepto en el último intento)
        if (currentAttempt < config.maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, config.retryDelay));
        } else {
          setError(`No se pudo cargar el modelo después de ${config.maxAttempts} intentos: ${errorMessage}`);
          setLoading(false);
        }
      }
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
    logger.info('Inicializando AR...');
    setCurrentStep('inicializando realidad aumentada');
    
    try {
      // Solicitar permisos de cámara de forma diferente según la plataforma
      if (deviceInfo.isIOS) {
        // En iOS, necesitamos manejar permisos de manera diferente
        try {
          // En Safari de iOS, getUserMedia puede comportarse de manera diferente
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: {
              facingMode: 'environment', 
              width: { ideal: 1280 },
              height: { ideal: 720 }
            },
            audio: false
          });
          
          // Si llegamos aquí, tenemos acceso a la cámara
          logger.info('Permiso de cámara concedido en iOS');
          
          // Detener el stream inmediatamente para evitar bloqueos en iOS
          stream.getTracks().forEach(track => track.stop());
          
          // Inicializar componentes AR
          await loadModel(MODEL_URLS.remote);
          
        } catch (error: any) {
          // Manejo específico de errores para iOS
          if (error.name === 'NotAllowedError' || error.message.includes('denied')) {
            setError('Permiso de cámara denegado. En iOS, debes permitir el acceso a la cámara desde Configuración > Safari > Cámara.');
          } else if (error.name === 'NotFoundError') {
            setError('No se pudo encontrar la cámara trasera en este dispositivo iOS.');
          } else if (error.name === 'NotReadableError' || error.message.includes('Could not start video source')) {
            setError('No se puede acceder a la cámara. Cierra otras aplicaciones que podrían estar usando la cámara.');
          } else if (deviceInfo.iOSVersion < 13) {
            setError(`Tu versión de iOS (${deviceInfo.iOSVersion}) podría no ser compatible con AR. Se recomienda iOS 13 o superior.`);
          } else {
            setError(`Error al inicializar AR en iOS: ${error.message || 'Error desconocido'}`);
          }
          logger.error('Error en inicialización de AR para iOS:', error);
          return;
        }
      } else {
        // Para dispositivos no iOS
        try {
          // Verificar permisos de cámara
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' }, 
            audio: false 
          });
          
          // Si llegamos aquí, tenemos acceso a la cámara
          logger.info('Permiso de cámara concedido');
          
          // Detener el stream, ya que AR.js gestionará la cámara
          stream.getTracks().forEach(track => track.stop());
          
          // Cargar el modelo 3D
          await loadModel(MODEL_URLS.remote);
          
        } catch (error: any) {
          // Manejo genérico de errores para otros dispositivos
          if (error.name === 'NotAllowedError') {
            setError('Permiso de cámara denegado. Por favor, permite el acceso a la cámara e intenta de nuevo.');
          } else {
            setError(`Error al inicializar AR: ${error.message || 'Error desconocido'}`);
          }
          logger.error('Error en inicialización de AR:', error);
          return;
        }
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
        renderer="logarithmicDepthBuffer: true; ${deviceInfo.isIOS ? 'precision: medium; antialias: false; colorManagement: false;' : 'precision: high; antialias: true; colorManagement: true;'}"
        embedded 
        arjs="sourceType: webcam; debugUIEnabled: false; detectionMode: mono_and_matrix; matrixCodeType: 3x3;"
        loading-screen="enabled: false"
        ${deviceInfo.isIOS ? 'device-orientation-permission-ui="enabled: true"' : ''}
      >
        <a-camera gps-camera rotation-reader></a-camera>
        <a-entity 
          id="model-container" 
          position="0 0 -5" 
          rotation="0 0 0"
          ${deviceInfo.isIOS ? 'animation="property: rotation; to: 0 360 0; loop: true; dur: 10000; easing: linear;"' : ''}
        ></a-entity>
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