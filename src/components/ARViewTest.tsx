import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import 'aframe';
import 'aframe-ar';
import 'aframe-extras';
import 'aframe-look-at-component';
import '../styles/ARView.css';

// Sistema de logging para depuración
const DEBUG = true;
const MOBILE_DEBUG = false; // Solo activar logging extenso en móviles si es necesario
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

const logger = {
  info: (message: string, ...args: any[]) => {
    if (DEBUG && (!isMobile || MOBILE_DEBUG)) console.info(`[AR-DEBUG][INFO] ${message}`, ...args);
  },
  warn: (message: string, ...args: any[]) => {
    if (DEBUG) console.warn(`[AR-DEBUG][WARN] ${message}`, ...args);
  },
  error: (message: string, ...args: any[]) => {
    if (DEBUG) console.error(`[AR-DEBUG][ERROR] ${message}`, ...args);
  },
  log: (message: string, ...args: any[]) => {
    if (DEBUG && (!isMobile || MOBILE_DEBUG)) console.log(`[AR-DEBUG][LOG] ${message}`, ...args);
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
  remote: 'https://jeanrua.com/models/SantaMaria_futuro.glb',
  local: '/SantaMaria_futuro.glb',
  backup: 'https://raw.githubusercontent.com/jeanrua/ar-castillo/main/public/SantaMaria_futuro.glb',
  fallback: '/castle.glb', // Modelo más simple por si todo falla
  simplified: '/castle_low.glb', // Versión aún más ligera (si existe)
  mobile: '/castle_mobile.glb' // Versión específica para móviles (si existe)
};

// Configuración avanzada para la carga del modelo
const MODEL_LOAD_CONFIG = {
  maxAttempts: 3,                 // Reducido para móviles (era 4)
  timeoutMs: isMobile ? 60000 : 120000, // Timeout reducido para móviles
  minValidSizeBytes: 10000,       // Tamaño mínimo esperado para un modelo GLB válido
  retryDelayMs: 1000,             // Retraso entre intentos de carga
  progressThrottleMs: isMobile ? 500 : 200, // Menos actualizaciones en móviles
  maxTextureSize: isMobile ? 1024 : 2048,  // Limitar tamaño de texturas en móviles
  maxGlobalAttempts: 5,           // Máximo absoluto de intentos incluyendo reset
};

const ARViewTest: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [arReady, setArReady] = useState(false);
  const [modelLoading, setModelLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [modelLoadAttempts, setModelLoadAttempts] = useState(0);
  const [globalAttempts, setGlobalAttempts] = useState(0); // Contador global para evitar bucles infinitos
  const [isLastAttempt, setIsLastAttempt] = useState(false); // Flag para marcar el último intento
  const [currentModelUrl, setCurrentModelUrl] = useState<string | null>(null);
  const [loadingErrors, setLoadingErrors] = useState<string[]>([]);
  const sceneContainerRef = useRef<HTMLDivElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const initialLoadDone = useRef(false); // Flag para controlar la carga inicial
  
  // Distancia de prueba en metros (modelo aparecerá a esta distancia del usuario)
  const testDistance = 15;
  // Ángulo aleatorio para posicionar el modelo (0-360 grados)
  const randomAngle = Math.random() * 2 * Math.PI;

  // Seleccionar la URL del modelo más adecuada para la situación actual
  const selectModelUrl = (attemptNumber: number): string => {
    logger.info(`Seleccionando URL para intento: ${attemptNumber}`);
    
    // Para móviles, intentar primero una versión específica si es el intento 0
    if (isMobile && attemptNumber === 0) {
      logger.info('Primer intento en móvil: usando versión para móviles');
      return MODEL_URLS.mobile || MODEL_URLS.fallback; // Fallback si no hay versión móvil
    }
    
    if (attemptNumber === 0) {
      // Primer intento (no móvil, o móvil sin versión específica)
      if (window.location.protocol === 'https:') {
        logger.info('Primer intento: usando URL remota');
        return MODEL_URLS.remote;
      } else {
        logger.info('Primer intento en HTTP: usando URL local');
        return MODEL_URLS.local;
      }
    } else if (attemptNumber === 1) {
      // Segundo intento
      if (isMobile) {
        logger.info('Segundo intento en móvil: usando modelo simplificado (fallback)');
        return MODEL_URLS.fallback;
      } else {
        logger.info('Segundo intento (no móvil): usando URL de backup GitHub');
        return MODEL_URLS.backup;
      }
    } else { // attemptNumber >= 2
      // Último recurso (tercer intento o superior)
      logger.info(`Intento ${attemptNumber + 1}: usando modelo simplificado (fallback)`);
      return MODEL_URLS.fallback;
    }
  };

  // Se ejecuta una sola vez al inicio para configurar la depuración y solicitar permisos
  useEffect(() => {
    logger.info('Iniciando ARViewTest - Versión optimizada para móviles');
    logger.info(`Dispositivo móvil detectado: ${isMobile}`);
    logger.info(`Protocolo actual: ${window.location.protocol}`);
    logger.info(`User Agent: ${navigator.userAgent}`);
    
    // Registrar información detallada del entorno solo en debug completo
    if (!isMobile || MOBILE_DEBUG) {
      logEnvironmentInfo();
    }
    
    // NO seleccionamos URL inicial aquí, se hará en el efecto de arReady
    
    // Configurar depuración de A-Frame de forma segura (no en móviles)
    if (DEBUG && !isMobile) {
      enableAFrameDebug();
    }

    // Registrar los errores en consola (esto siempre es importante)
    window.addEventListener('error', (event) => {
      logger.error('Error global capturado:', event.message, {
        error: event.error,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    });
    
    // También capturar promesas rechazadas
    window.addEventListener('unhandledrejection', (event) => {
      logger.error('Promesa rechazada sin manejar:', {
        reason: event.reason,
      });
    });
    
    // Manejar errores de carga del modelo
    document.addEventListener('model-error', (event) => {
      logger.error('Evento model-error disparado', event);
      // No establecer error inmediatamente para permitir reintentos
      setLoadingErrors(prev => [...prev, 'Error al cargar el modelo 3D (evento A-Frame)']);
    });

    // Limpiar listeners al desmontar
    return () => {
      logger.info('Desmontando componente ARViewTest');
      document.removeEventListener('model-error', () => {});
      window.removeEventListener('error', () => {});
      window.removeEventListener('unhandledrejection', () => {});
      if (xhrRef.current) {
        xhrRef.current.abort(); // Asegurar que se aborta al desmontar
      }
    };
  }, []); // Vacío para ejecutar solo una vez al montar

  // Manejo de cámara y permiso de video
  useEffect(() => {
    logger.info('Solicitando acceso a la cámara...');
    
    // Solicitar acceso a la cámara explícitamente antes de inicializar AR.js
    navigator.mediaDevices.getUserMedia({ 
      video: { 
        facingMode: 'environment', 
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false 
    })
      .then((stream) => {
        logger.info('Acceso a la cámara concedido', stream.getVideoTracks()[0].label);
        setCameraActive(true);
        
        // Imprimir capacidades de la cámara
        const videoTrack = stream.getVideoTracks()[0];
        logger.info('Capacidades de la cámara:', videoTrack.getCapabilities());
        
        // Pequeño retraso para asegurar que la cámara esté lista
        setTimeout(() => {
          logger.info('Iniciando escena AR después de delay');
          setArReady(true);
        }, 1000);
      })
      .catch(err => {
        logger.error('Error al acceder a la cámara', err);
        setError(`Error al acceder a la cámara: ${err instanceof Error ? err.message : String(err)}`);
      });
  }, []);

  // Función para cargar el modelo con manejo avanzado de errores y reintentos
  const loadModel = (url: string) => {
    logger.info(`Intentando cargar modelo desde: ${url} (Intento global: ${globalAttempts + 1})`);

    // --- Verificación de intentos globales ANTES de incrementar ---
    if (globalAttempts >= MODEL_LOAD_CONFIG.maxGlobalAttempts) {
      logger.error(`Excedido número máximo global de intentos (${MODEL_LOAD_CONFIG.maxGlobalAttempts}), deteniendo carga.`);
      setError(`Error crítico: demasiados intentos fallidos. Por favor, reinicia la aplicación.`);
      setModelLoading(false); // Detener indicador de carga
      return; 
    }
    // --- Incrementar contador global --- 
    setGlobalAttempts(prev => prev + 1); 
    
    // --- Incrementar contador de intentos de la ronda actual --- 
    setModelLoadAttempts(prev => prev + 1);
    
    setModelLoading(true);
    setLoadingProgress(0);

    // Limpiar cualquier request previa
    if (xhrRef.current) {
      logger.info('Abortando solicitud previa');
      xhrRef.current.abort();
    }

    // Crear nueva solicitud XHR
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';

    // Variable para controlar la limitación de actualizaciones de progreso
    let lastProgressUpdate = 0;

    xhr.onloadstart = () => {
      logger.info(`Iniciando descarga del modelo desde ${url}`);
      // Ya no incrementamos los intentos aquí
    };

    xhr.onprogress = (event) => {
      const now = Date.now();
      
      // Limitar las actualizaciones de progreso para evitar sobrecarga de renderización
      if (now - lastProgressUpdate < MODEL_LOAD_CONFIG.progressThrottleMs) {
        return;
      }
      
      lastProgressUpdate = now;
      
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        
        // Solo registrar en la consola cada 25% o en 0%, 100% en móviles
        if (percentComplete % (isMobile ? 25 : 10) === 0 || percentComplete === 100) {
          logger.info(`Progreso de carga: ${percentComplete}%`, {
            loaded: formatBytes(event.loaded),
            total: formatBytes(event.total)
          });
        }
        
        setLoadingProgress(percentComplete);
        
        // Detección temprana de posibles problemas
        if (event.loaded > 0 && event.total < MODEL_LOAD_CONFIG.minValidSizeBytes) {
          logger.warn('El tamaño total del modelo parece sospechosamente pequeño', {
            total: event.total, 
            url
          });
        }
      } else {
        // Para URLs sin tamaño computable, simular progreso basado en bytes recibidos
        const estimatedProgress = Math.min(99, Math.log(event.loaded + 1) / Math.log(10000000) * 100);
        setLoadingProgress(Math.round(estimatedProgress));
      }
    };
    
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        logger.info('Modelo cargado completamente', { 
          status: xhr.status,
          response_size: formatBytes(xhr.response.byteLength),
          contentType: xhr.getResponseHeader('Content-Type'),
          url
        });
        
        // Validaciones adicionales del modelo descargado
        if (xhr.response.byteLength < MODEL_LOAD_CONFIG.minValidSizeBytes) {
          logger.warn('El modelo cargado parece demasiado pequeño, podría estar corrupto', {
            size: xhr.response.byteLength,
            expectedMinSize: MODEL_LOAD_CONFIG.minValidSizeBytes
          });
          
          // Verificar si es un mensaje de error HTML en lugar de un GLB
          const firstBytes = new Uint8Array(xhr.response, 0, Math.min(20, xhr.response.byteLength));
          const probablyHTML = firstBytes.indexOf(60) !== -1; // 60 es '<' en ASCII
          
          if (probablyHTML) {
            logger.error('Recibido HTML en lugar de GLB. Posible error de servidor.', {
              firstBytes: Array.from(firstBytes).map(b => String.fromCharCode(b)).join('')
            });
            setLoadingErrors(prev => [...prev, `Recibido HTML en lugar de GLB (${url.split('/').pop()})`]);
          } else {
            setLoadingErrors(prev => [...prev, `Modelo posiblemente corrupto (${formatBytes(xhr.response.byteLength)})`]);
          }
          
          retry();
          return;
        }
        
        // Verificar formato GLB (GLB comienza con magia 'glTF')
        const header = new Uint8Array(xhr.response, 0, 4);
        const magicString = String.fromCharCode.apply(null, Array.from(header));
        
        if (magicString !== 'glTF') {
          logger.error('El archivo no parece ser un GLB válido', { 
            magic: magicString,
            headerBytes: Array.from(header)
          });
          setLoadingErrors(prev => [...prev, `Formato de archivo no válido (${magicString})`]);
          retry();
          return;
        }
        
        // Todo parece correcto, marcar como cargado
        setModelLoading(false);
        setLoadingProgress(100);
        
        // Actualizar el elemento 3D en la escena
        setTimeout(() => {
          try {
            const modelEntity = document.querySelector('#castillo-model');
            const progressIndicator = document.querySelector('#progress-indicator');
            
            if (modelEntity) {
              logger.info('Activando visibilidad del modelo 3D');
              modelEntity.setAttribute('visible', 'true');
              
              // Registrar evento para detectar errores de renderizado
              modelEntity.addEventListener('model-error', (event) => {
                logger.error('Error en renderizado del modelo', event);
              });
            }
            
            if (progressIndicator) {
              logger.info('Ocultando indicador de progreso');
              progressIndicator.setAttribute('visible', 'false');
            }
          } catch (e) {
            logger.error('Error al actualizar elementos en la escena', e);
          }
        }, 500);
      } else {
        logger.error(`Error HTTP ${xhr.status} al cargar el modelo`, { 
          url,
          statusText: xhr.statusText,
          response: xhr.responseText?.substring(0, 200) || 'No disponible'
        });
        setLoadingErrors(prev => [...prev, `Error HTTP ${xhr.status} (${xhr.statusText})`]);
        retry();
      }
    };
    
    xhr.onerror = (e) => {
      logger.error('Error al cargar el modelo', e, {
        type: 'network_error',
        url,
        protocol: window.location.protocol,
        hostname: new URL(url.startsWith('/') ? window.location.origin + url : url).hostname
      });
      
      // Análisis detallado del error de red
      let errorDetail = 'Error de red desconocido';
      
      if (navigator.onLine === false) {
        errorDetail = 'Dispositivo sin conexión a internet';
      } else if (url.startsWith('https:') && window.location.protocol === 'http:') {
        errorDetail = 'Error de mezcla HTTP/HTTPS';
      } else if (url.includes('githubusercontent') && navigator.userAgent.includes('iPhone')) {
        errorDetail = 'Posible bloqueo en Safari iOS';
      }
      
      setLoadingErrors(prev => [...prev, `Error de red: ${errorDetail}`]);
      retry();
    };
    
    xhr.ontimeout = () => {
      logger.error('Timeout al cargar el modelo', { 
        url,
        timeoutMs: MODEL_LOAD_CONFIG.timeoutMs
      });
      setLoadingErrors(prev => [...prev, `Timeout después de ${MODEL_LOAD_CONFIG.timeoutMs/1000}s`]);
      retry();
    };
    
    xhr.onabort = () => {
      logger.warn('Carga del modelo abortada', { url });
    };

    // Establecer timeout para la carga
    xhr.timeout = MODEL_LOAD_CONFIG.timeoutMs;

    try {
      xhr.send();
      logger.info('Solicitud enviada para cargar el modelo', {
        url,
        method: 'GET',
        responseType: xhr.responseType
      });
    } catch (e) {
      logger.error('Error al enviar la solicitud', e, {
        url,
        browserInfo: navigator.userAgent
      });
      setLoadingErrors(prev => [...prev, `Error al iniciar la descarga: ${e instanceof Error ? e.message : String(e)}`]);
      retry(); // Llama a retry si send() falla
    }
  };

  // Función para reintentar con otra URL
  const retry = () => {
    logger.warn(`Fallo detectado. Intento actual: ${modelLoadAttempts}, Global: ${globalAttempts}`);
    
    // --- Verificación de seguridad para prevenir bucles infinitos --- 
    if (globalAttempts >= MODEL_LOAD_CONFIG.maxGlobalAttempts) {
      logger.error(`Excedido número máximo global de intentos (${MODEL_LOAD_CONFIG.maxGlobalAttempts}) en retry, cancelando.`);
      setError(`Error crítico: demasiados intentos fallidos. Por favor, reinicia la aplicación.`);
      setModelLoading(false);
      return;
    }

    if (isLastAttempt) {
      logger.error('Último intento (modelo simplificado) fallido, no hay más reintentos disponibles.');
      setError('No se pudo cargar ningún modelo 3D después de múltiples intentos. Por favor, reinicia la aplicación.');
      setModelLoading(false);
      return;
    }

    // Verificar si hemos alcanzado el máximo de intentos para la ronda actual
    if (modelLoadAttempts >= MODEL_LOAD_CONFIG.maxAttempts) {
      logger.error(`Se alcanzó el máximo de ${MODEL_LOAD_CONFIG.maxAttempts} intentos para esta ronda de carga.`);

      // Intentar cargar el modelo simplificado como último recurso
      if (!currentModelUrl || (!currentModelUrl.includes('simplified') && !currentModelUrl.includes('fallback'))) {
        logger.info('Intentando última opción: modelo ultra simplificado (fallback/simplified).');

        // Marcar como último intento para prevenir bucles
        setIsLastAttempt(true);

        // NO restablecemos contadores, solo el error
        setError(null);
        setLoadingErrors([]); 
        
        // Usamos la URL simplificada o fallback directamente
        const finalUrl = MODEL_URLS.simplified || MODEL_URLS.fallback;
        setCurrentModelUrl(finalUrl);

        setTimeout(() => {
          try {
            // Reiniciamos modelLoadAttempts para esta *última* carga
            setModelLoadAttempts(0); 
            loadModel(finalUrl);
          } catch (e) {
            logger.error('Error crítico en el último intento con modelo simplificado', e);
            setError('No se pudo cargar ningún modelo 3D. Por favor, inténtalo más tarde.');
            setModelLoading(false);
          }
        }, MODEL_LOAD_CONFIG.retryDelayMs);
      } else {
        // Ya se intentó el simplificado/fallback y falló, o currentModelUrl es null
        logger.error('El último intento con modelo simplificado/fallback también falló.');
        setError(`No se pudo cargar el modelo 3D después de ${globalAttempts} intentos totales. Errores: ${loadingErrors.slice(-3).join(', ')}`);
        setModelLoading(false);
      }
      return; // Detener aquí después de manejar el último intento
    }

    // Si no hemos llegado al límite de intentos de esta ronda
    logger.info(`Reintentando carga (Intento ${modelLoadAttempts + 1}/${MODEL_LOAD_CONFIG.maxAttempts})`);

    // Obtener la siguiente URL basada en el número de intento actual
    const nextUrl = selectModelUrl(modelLoadAttempts); 
    logger.info(`Seleccionada siguiente URL: ${nextUrl}`);
    setCurrentModelUrl(nextUrl);

    // Retraso antes de reintentar
    setTimeout(() => {
      // No incrementamos modelLoadAttempts aquí, loadModel lo hará
      loadModel(nextUrl);
    }, MODEL_LOAD_CONFIG.retryDelayMs);
  };

  // Manejador de carga del modelo - inicia el proceso cuando AR está listo
  useEffect(() => {
    if (arReady && !initialLoadDone.current && !modelLoading && !error) {
      logger.info('AR está listo, iniciando carga inicial del modelo.');
      initialLoadDone.current = true; // Marcar que la carga inicial se ha disparado
      
      // Seleccionar la primera URL basada en intento 0
      const firstUrl = selectModelUrl(0); 
      setCurrentModelUrl(firstUrl);
      // Reiniciar contadores antes de la primera carga
      setGlobalAttempts(0); 
      setModelLoadAttempts(0);
      setIsLastAttempt(false);
      setLoadingErrors([]);
      
      loadModel(firstUrl);
    }
  }, [arReady, modelLoading, error]); // Depender de arReady, modelLoading y error

  // Manejo de geolocalización (solo cuando arReady es true)
  useEffect(() => {
    if (!arReady) return;

    logger.info('Configurando geolocalización');
    
    if ('geolocation' in navigator) {
      // Usar una sola llamada inicial para evitar warning de gesture
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          logger.info('Posición inicial obtenida', { latitude, longitude, accuracy });
          
          // Posicionar el modelo a una distancia fija, en una dirección aleatoria
          const dx = testDistance * Math.sin(randomAngle);
          const dz = testDistance * Math.cos(randomAngle);
          logger.info('Posición calculada para el modelo', { dx, dz, distancia: testDistance, angulo: randomAngle });
          
          // Iniciar el watchPosition después de tener la posición inicial
          const watchId = navigator.geolocation.watchPosition(
            (position) => {
              const { latitude, longitude, accuracy } = position.coords;
              logger.info('Actualización de posición', { latitude, longitude, accuracy });
              
              // Actualizar la posición del modelo dinámicamente usando el sistema de eventos de A-Frame
              setTimeout(() => {
                const modelEl = document.querySelector('#castillo-model');
                if (modelEl) {
                  logger.info('Actualizando posición del modelo', { dx, dz });
                  modelEl.setAttribute('position', `${dx} 0 ${dz}`);
                } else {
                  logger.warn('Elemento del modelo no encontrado para actualizar posición');
                }
              }, 1000);
            },
            (err) => {
              logger.error('Error accediendo a la ubicación', err);
              setError(`Error accediendo a la ubicación: ${err.message}`);
            },
            { 
              enableHighAccuracy: true,
              maximumAge: 1000,
              timeout: 60000
            }
          );
          
          return () => {
            logger.info('Limpiando watch position');
            navigator.geolocation.clearWatch(watchId);
          };
        },
        (err) => {
          logger.error('Error accediendo a la ubicación inicial', err);
          setError(`Error accediendo a la ubicación: ${err.message}`);
        },
        { 
          enableHighAccuracy: true,
          timeout: 60000
        }
      );
    } else {
      logger.error('Geolocalización no disponible');
      setError('La geolocalización no está disponible en este dispositivo.');
    }
  }, [arReady, randomAngle, testDistance]);

  // Actualizar el progreso de carga en la escena
  useEffect(() => {
    if (!arReady) return;
    
    logger.info('Actualizando indicadores de progreso en DOM', { progreso: loadingProgress });
    
    const progressBar = document.querySelector('#progress-bar');
    const progressText = document.querySelector('#progress-text');
    const progressIndicator = document.querySelector('#progress-indicator');
    const placeholderModel = document.querySelector('#placeholder-model');
    const castilloModel = document.querySelector('#castillo-model');
    
    if (progressBar && progressText) {
      progressBar.setAttribute('scale', `${loadingProgress/100} 1 1`);
      progressText.setAttribute('value', `${loadingProgress}%`);
      logger.info('Elementos de progreso actualizados');
    } else {
      logger.warn('No se encontraron elementos de progreso en el DOM');
    }
    
    if (loadingProgress === 100 && progressIndicator) {
      logger.info('Carga completa, mostrando modelo');
      setTimeout(() => {
        if (progressIndicator) {
          progressIndicator.setAttribute('visible', 'false');
          logger.info('Indicador de progreso ocultado');
        }
        
        if (placeholderModel && castilloModel) {
          logger.info('Activando modelo real y desvaneciendo placeholder');
          placeholderModel.dispatchEvent(new CustomEvent('modelLoaded'));
          castilloModel.setAttribute('visible', 'true');
        } else {
          logger.warn('No se encontraron elementos del modelo o placeholder');
        }
      }, 1000);
    }
  }, [loadingProgress, arReady]);

  // Monitorear estado del sistema cada 10 segundos (aumentado de 5s) y solo si no es móvil
  useEffect(() => {
    if (!arReady || isMobile) return; // No monitorear en dispositivos móviles
    
    const intervalId = setInterval(() => {
      const memory = (window as any).performance?.memory;
      
      logger.info('Estado del sistema', {
        memory: memory ? {
          jsHeapSizeLimit: formatBytes(memory.jsHeapSizeLimit),
          totalJSHeapSize: formatBytes(memory.totalJSHeapSize),
          usedJSHeapSize: formatBytes(memory.usedJSHeapSize)
        } : 'No disponible',
        arReady,
        modelLoading,
        loadingProgress,
      });
      
    }, 10000); // Aumentado a 10 segundos
    
    return () => clearInterval(intervalId);
  }, [arReady, modelLoading, loadingProgress]);

  // Utilidad para formatear bytes en forma legible
  const formatBytes = (bytes: number, decimals = 2): string => {
    if (bytes === undefined || bytes === null || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    try {
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      // Asegurar que i esté dentro de los límites del array sizes
      const safeIndex = Math.max(0, Math.min(i, sizes.length - 1)); 
      return parseFloat((bytes / Math.pow(k, safeIndex)).toFixed(dm)) + ' ' + sizes[safeIndex];
    } catch (e) {
      logger.warn(`Error formateando bytes: ${bytes}`, e);
      return `${bytes} Bytes`;
    }
  };

  // Contenido A-Frame como HTML con optimizaciones de rendimiento y depuración
  const getAframeHTML = () => {
    logger.info(`Generando HTML A-Frame con URL: ${currentModelUrl}`);
    
    // Configurar parámetros de depuración para A-Frame (desactivado en móviles)
    const debugConfig = DEBUG && !isMobile ? 
      `stats="${DEBUG}" 
       debug="true"
       debug-helper` 
      : '';
    
    return `
      <a-scene 
        embedded
        arjs="sourceType: webcam; videoTexture: true; debugUIEnabled: ${DEBUG && !isMobile}; detectionMode: mono_and_matrix;"
        vr-mode-ui="enabled: false"
        renderer="antialias: ${!isMobile}; alpha: true; precision: ${isMobile ? 'lowp' : 'mediump'}; logarithmicDepthBuffer: ${!isMobile};"
        id="scene"
        loading-screen="enabled: false"
        ${debugConfig}>
        
        <a-assets timeout="${isMobile ? 30000 : 3000000}">
          <a-asset-item id="castillo-asset" src="${currentModelUrl}" 
            response-type="arraybuffer" crossorigin="anonymous"></a-asset-item>
        </a-assets>
        
        <a-entity position="0 0 -4" id="error-display" visible="false">
          <a-text value="Error al cargar modelo" color="red" position="0 0.5 0" align="center"></a-text>
          <a-text id="error-details" value="" color="white" position="0 0.2 0" align="center" scale="0.5 0.5 0.5"></a-text>
        </a-entity>
        
        <a-camera gps-camera rotation-reader position="0 1.6 0"></a-camera>
        
        <!-- Modelo en low-poly mientras carga el completo -->
        <a-box id="placeholder-model" position="0 0 -5" scale="2 2 2" color="#AAAAAA" opacity="0.5"
          animation="property: opacity; to: 0; dur: 1000; easing: linear; startEvents: modelLoaded"></a-box>
        
        <!-- Modelo 3D principal con LOD (Level of Detail) -->
        <a-entity
          id="castillo-model"
          position="0 0 -5"
          scale="${isMobile ? '0.3 0.3 0.3' : '0.5 0.5 0.5'}"
          rotation="0 0 0"
          gltf-model="#castillo-asset"
          visible="false"
          animation="property: visible; to: true; dur: 1; delay: 500; startEvents: loaded">
        </a-entity>
        
        <a-entity id="progress-indicator" position="0 0 -3" visible="true">
          <a-text id="loading-text" value="Cargando modelo 3D..." position="0 0.5 0" color="white" align="center" scale="0.5 0.5 0.5"></a-text>
          <a-plane id="progress-bar-bg" position="0 0 0" width="1" height="0.1" color="#333333"></a-plane>
          <a-plane id="progress-bar" position="-0.5 0 0.01" width="0.01" height="0.08" color="#4CAF50" scale="${loadingProgress/100} 1 1"></a-plane>
          <a-text id="progress-text" value="${loadingProgress}%" position="0 -0.2 0" color="white" align="center" scale="0.3 0.3 0.3"></a-text>
        </a-entity>
        
        <!-- Coordenadas para depuración (solo en no-móviles) -->
        ${DEBUG && !isMobile ? `
        <a-entity id="debug-info" position="0 -1 -3">
          <a-text value="Debug Info" position="0 0 0" color="white" align="center" scale="0.3 0.3 0.3"></a-text>
          <a-text id="coords-display" value="Cargando coordenadas..." position="0 -0.2 0" color="white" align="center" scale="0.2 0.2 0.2"></a-text>
          <a-text id="model-url-display" value="URL: ${currentModelUrl?.substring(0, 30) || 'No URL'}..." position="0 -0.4 0" color="white" align="center" scale="0.15 0.15 0.15"></a-text>
          <a-text id="attempts-display" value="Intento: ${modelLoadAttempts}" position="0 -0.6 0" color="white" align="center" scale="0.2 0.2 0.2"></a-text>
        </a-entity>
        ` : ''}
      </a-scene>
    `;
  };

  return (
    <div className="ar-container">
      {DEBUG && (
        <div className="debug-panel">
          <h3>Debug</h3>
          <p>AR Ready: {String(arReady)}</p>
          <p>Camera: {String(cameraActive)}</p>
          <p>Progress: {loadingProgress}%</p>
          <p>Attempt: {modelLoadAttempts}</p>
          <p>Global: {globalAttempts}</p>
          <p>URL: {currentModelUrl?.substring(0, 15) || 'No URL'}...</p>
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
          <Link to="/" className="back-button">Volver al inicio</Link>
        </div>
      )}
      
      {!arReady && !error && (
        <div className="loading-overlay">
          <p>Inicializando cámara...</p>
        </div>
      )}
      
      {modelLoading && arReady && !error && (
        <div className="model-loading-indicator">
          <div className="progress-bar-container">
            <div className="progress-bar" style={{ width: `${loadingProgress}%` }}></div>
          </div>
          <p>Cargando modelo 3D: {loadingProgress}%</p>
          {(modelLoadAttempts > 0 || globalAttempts > 0) && (
            <p className="retry-message">Intento {modelLoadAttempts}/{MODEL_LOAD_CONFIG.maxAttempts} (Global: {globalAttempts})</p>
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
          ref={sceneContainerRef} 
          className="scene-container" 
          dangerouslySetInnerHTML={{ __html: getAframeHTML() }}
        />
      )}
    </div>
  );
};

export default ARViewTest; 