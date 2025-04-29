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

// URLs de modelos alternativos
const MODEL_URLS = {
  remote: 'https://jeanrua.com/models/SantaMaria_futuro.glb',
  local: '/SantaMaria_futuro.glb',
  backup: 'https://raw.githubusercontent.com/jeanrua/ar-castillo/main/public/SantaMaria_futuro.glb',
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

const ARViewTest: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [arReady, setArReady] = useState(false);
  const [modelLoading, setModelLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [modelLoadAttempts, setModelLoadAttempts] = useState(0);
  const [currentModelUrl, setCurrentModelUrl] = useState('');
  const [loadingErrors, setLoadingErrors] = useState<string[]>([]);
  const sceneContainerRef = useRef<HTMLDivElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  
  // Distancia de prueba en metros (modelo aparecerá a esta distancia del usuario)
  const testDistance = 15;
  // Ángulo aleatorio para posicionar el modelo (0-360 grados)
  const randomAngle = Math.random() * 2 * Math.PI;

  // Seleccionar la URL del modelo más adecuada para la situación actual
  const selectModelUrl = () => {
    if (modelLoadAttempts === 0) {
      // Primera carga: usar remoto si estamos en HTTPS, local si estamos en HTTP
      if (window.location.protocol === 'https:') {
        logger.info('Primer intento: usando URL remota');
        return MODEL_URLS.remote;
      } else {
        logger.info('Primer intento en HTTP: usando URL local');
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
        logger.info('Tercer intento: usando URL de fallback simple');
        return MODEL_URLS.fallback;
      }
    } else {
      // Último recurso: modelo simplificado fallback
      logger.info('Último intento: usando modelo simplificado');
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
    
    // Seleccionar URL inicial
    const initialUrl = selectModelUrl();
    setCurrentModelUrl(initialUrl);
    logger.info(`URL inicial seleccionada: ${initialUrl}`);
    
    // Configurar depuración de A-Frame
    if (DEBUG && window.AFRAME) {
      window.AFRAME.debug.enable();
      logger.info('Modo debug de A-Frame activado');
    }

    // Registrar los errores en consola
    window.addEventListener('error', (event) => {
      logger.error('Error global capturado:', event.message, event.error);
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

    // Limpiar listeners al desmontar
    return () => {
      logger.info('Desmontando componente ARViewTest');
      document.removeEventListener('model-error', () => {});
      document.removeEventListener('loaded', () => {});
      window.removeEventListener('error', () => {});
    };
  }, []);

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
    logger.info(`Iniciando carga del modelo desde: ${url}`, { 
      intento: modelLoadAttempts + 1,
      timestamp: new Date().toISOString(),
      navegador: navigator.userAgent.split(' ').slice(-1)[0]
    });
    
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
      logger.info(`Iniciando descarga del modelo desde ${url}`, {
        hora: new Date().toTimeString().split(' ')[0],
        hostname: new URL(url.startsWith('/') ? window.location.origin + url : url).hostname
      });
      setModelLoadAttempts(prev => prev + 1);
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
        
        // Solo registrar en la consola cada 10% o en 0%, 100%
        if (percentComplete % 10 === 0 || percentComplete === 100) {
          logger.info(`Progreso de carga: ${percentComplete}%`, {
            loaded: formatBytes(event.loaded),
            total: formatBytes(event.total),
            url: url.split('/').pop()
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
        logger.info(`Progreso estimado (no computable): ${Math.round(estimatedProgress)}%`, {
          loaded: formatBytes(event.loaded),
          url: url.split('/').pop()
        });
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
      retry();
    }
  };

  // Función para reintentar con otra URL
  const retry = () => {
    if (modelLoadAttempts >= MODEL_LOAD_CONFIG.maxAttempts) {
      logger.error('Se alcanzó el máximo de intentos de carga del modelo', {
        intentos: modelLoadAttempts,
        errores: loadingErrors
      });
      
      // Mostrar mensaje de error detallado
      setError(`No se pudo cargar el modelo 3D después de ${modelLoadAttempts} intentos. 
               ${loadingErrors.length > 0 ? `Errores: ${loadingErrors.slice(-3).join(', ')}` : ''}`);
      
      // Si todo falla, tratar de mostrar por lo menos el modelo más simple
      if (!currentModelUrl.includes('simplified') && currentModelUrl !== MODEL_URLS.fallback) {
        logger.info('Intentando última opción: modelo ultra simplificado');
        
        // Restablecer estado para este último intento
        setError(null);
        setLoadingErrors([]);
        setModelLoadAttempts(0);
        setCurrentModelUrl(MODEL_URLS.simplified);
        
        setTimeout(() => {
          try {
            loadModel(MODEL_URLS.simplified);
          } catch (e) {
            logger.error('Error en último intento con modelo simplificado', e);
            setError('No se pudo cargar ningún modelo 3D. Por favor, inténtalo más tarde.');
          }
        }, MODEL_LOAD_CONFIG.retryDelayMs);
      }
      
      return;
    }
    
    logger.info('Reintentando carga con otra URL', {
      intentoActual: modelLoadAttempts,
      maxIntentos: MODEL_LOAD_CONFIG.maxAttempts
    });
    
    const nextUrl = selectModelUrl();
    logger.info(`Seleccionada siguiente URL: ${nextUrl}`);
    setCurrentModelUrl(nextUrl);
    
    // Retraso antes de reintentar
    setTimeout(() => {
      loadModel(nextUrl);
    }, MODEL_LOAD_CONFIG.retryDelayMs);
  };

  // Manejador de carga del modelo - inicia el proceso y maneja cambios de URL
  useEffect(() => {
    if (!arReady) {
      logger.info('AR no está listo todavía, esperando para cargar el modelo...');
      return;
    }
    
    if (currentModelUrl && modelLoadAttempts === 0) {
      loadModel(currentModelUrl);
    }
    
    return () => {
      if (xhrRef.current) {
        logger.info('Abortando carga del modelo (cleanup)');
        xhrRef.current.abort();
        xhrRef.current = null;
      }
    };
  }, [arReady, currentModelUrl]);

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

  // Monitorear estado del sistema cada 5 segundos
  useEffect(() => {
    if (!arReady) return;
    
    const intervalId = setInterval(() => {
      const memory = (window as any).performance?.memory;
      
      logger.info('Estado del sistema', {
        timestamp: new Date().toISOString(),
        memory: memory ? {
          jsHeapSizeLimit: formatBytes(memory.jsHeapSizeLimit),
          totalJSHeapSize: formatBytes(memory.totalJSHeapSize),
          usedJSHeapSize: formatBytes(memory.usedJSHeapSize)
        } : 'No disponible',
        arReady,
        modelLoading,
        loadingProgress,
        cameraActive,
        modelLoadAttempts
      });
      
      // Verificar si hay elementos clave en la escena
      const sceneEl = document.querySelector('a-scene');
      const cameraEl = document.querySelector('a-camera');
      const modelEl = document.querySelector('#castillo-model');
      
      logger.info('Estado de elementos DOM', {
        'a-scene': !!sceneEl,
        'a-camera': !!cameraEl,
        'castillo-model': !!modelEl,
        'scene class': sceneEl?.classList.toString(),
        'camera position': cameraEl?.getAttribute('position'),
        'model position': modelEl?.getAttribute('position'),
        'model visible': modelEl?.getAttribute('visible')
      });
      
    }, 5000);
    
    return () => clearInterval(intervalId);
  }, [arReady, modelLoading, loadingProgress, cameraActive, modelLoadAttempts]);

  // Utilidad para formatear bytes en forma legible
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Contenido A-Frame como HTML con optimizaciones de rendimiento y depuración
  const getAframeHTML = () => {
    logger.info(`Generando HTML A-Frame con URL: ${currentModelUrl}`, { intento: modelLoadAttempts });
    
    return `
      <a-scene 
        embedded
        arjs="sourceType: webcam; videoTexture: true; debugUIEnabled: ${DEBUG}; detectionMode: mono_and_matrix;"
        vr-mode-ui="enabled: false"
        renderer="antialias: true; alpha: true; precision: mediump; logarithmicDepthBuffer: true;"
        id="scene"
        loading-screen="enabled: false"
        stats="${DEBUG}">
        <a-assets timeout="3000000">
          <a-asset-item id="castillo-asset" src="${currentModelUrl}" 
            response-type="arraybuffer" crossorigin="anonymous"></a-asset-item>
        </a-assets>
        
        <!-- Agregamos más información de depuración cuando ocurre una excepción -->
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
          scale="0.5 0.5 0.5"
          rotation="0 0 0"
          gltf-model="#castillo-asset"
          visible="false"
          animation="property: visible; to: true; dur: 1; delay: 500; startEvents: loaded">
        </a-entity>
        
        <!-- Indicador de dirección hacia el modelo -->
        <a-entity id="direction-indicator" position="0 0 -2">
          <a-box position="0 0.5 0" color="green" depth="0.1" height="0.1" width="0.5"></a-box>
          <a-text value="Modelo 3D" position="0 0.7 0" color="white" align="center"></a-text>
        </a-entity>
        
        <a-entity id="progress-indicator" position="0 0 -3" visible="true">
          <a-text id="loading-text" value="Cargando modelo 3D..." position="0 0.5 0" color="white" align="center" scale="0.5 0.5 0.5"></a-text>
          <a-plane id="progress-bar-bg" position="0 0 0" width="1" height="0.1" color="#333333"></a-plane>
          <a-plane id="progress-bar" position="-0.5 0 0.01" width="0.01" height="0.08" color="#4CAF50" scale="${loadingProgress/100} 1 1"></a-plane>
          <a-text id="progress-text" value="${loadingProgress}%" position="0 -0.2 0" color="white" align="center" scale="0.3 0.3 0.3"></a-text>
        </a-entity>
        
        <!-- Coordenadas para depuración -->
        ${DEBUG ? `
        <a-entity id="debug-info" position="0 -1 -3">
          <a-text value="Debug Info" position="0 0 0" color="white" align="center" scale="0.3 0.3 0.3"></a-text>
          <a-text id="coords-display" value="Cargando coordenadas..." position="0 -0.2 0" color="white" align="center" scale="0.2 0.2 0.2"></a-text>
          <a-text id="model-url-display" value="URL: ${currentModelUrl.substring(0, 30)}..." position="0 -0.4 0" color="white" align="center" scale="0.15 0.15 0.15"></a-text>
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
          ref={sceneContainerRef} 
          className="scene-container" 
          dangerouslySetInnerHTML={{ __html: getAframeHTML() }}
        />
      )}
    </div>
  );
};

export default ARViewTest; 