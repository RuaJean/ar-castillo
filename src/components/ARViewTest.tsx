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

// Función para habilitar el modo debug de A-Frame (si está disponible)
const enableAFrameDebug = (): boolean => {
  try {
    if (typeof window !== 'undefined' && window.AFRAME) {
      logger.info('AFRAME encontrado en window', {
        version: window.AFRAME.version,
      });

      // Método 1: Activar stats y debug a través de atributos de la escena
      // Esto se hará ahora en getStaticAframeHTML

      // Registrar componente helper si es necesario (puede que ya no sea necesario)
      if (window.AFRAME.registerComponent) {
        window.AFRAME.registerComponent('debug-helper', {
          init: function() {
            logger.info('Componente debug-helper inicializado (si se usa)');
          }
        });
        return true;
      }

      logger.warn('No se pudo registrar componente debug-helper');
      return false;
    } else {
      logger.warn('A-Frame no está disponible en window');
      return false;
    }
  } catch (error) {
    logger.error('Error al intentar configurar debug de A-Frame', error);
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
      screenSize: `${window.screen?.width}x${window.screen?.height}`,
      devicePixelRatio: window.devicePixelRatio,
    });

    // Comprobar WebGL
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

    if (gl) {
      try {
        const webgl = gl as WebGLRenderingContext;
        const debugInfo = webgl.getExtension('WEBGL_debug_renderer_info');
        logger.info('Información WebGL:', {
            vendor: debugInfo ? webgl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : webgl.getParameter(webgl.VENDOR),
            renderer: debugInfo ? webgl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'N/A',
            version: webgl.getParameter(webgl.VERSION),
            shadingLanguageVersion: webgl.getParameter(webgl.SHADING_LANGUAGE_VERSION),
            maxTextureSize: webgl.getParameter(webgl.MAX_TEXTURE_SIZE)
        });
      } catch (e) {
        logger.warn('Error al obtener información WebGL detallada', e);
         // Usar type guard para acceder a parámetros básicos
         if (gl instanceof WebGLRenderingContext) { 
             logger.info('Información WebGL básica:', {
                version: gl.getParameter(gl.VERSION),
                vendor: gl.getParameter(gl.VENDOR),
              });
        } else {
            logger.warn('No se pudo obtener información WebGL básica (contexto no es WebGLRenderingContext).');
        }
      }
    } else {
      logger.warn('WebGL no está soportado en este navegador');
    }

    // Bibliotecas detectadas
    const libraries = {
      aframe: typeof window.AFRAME !== 'undefined',
      three: typeof (window as any).THREE !== 'undefined',
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
  retryDelayMs: 1500,             // Retraso entre intentos de carga (aumentado ligeramente)
  progressThrottleMs: isMobile ? 500 : 200, // Menos actualizaciones en móviles
  maxTextureSize: isMobile ? 1024 : 2048,  // Limitar tamaño de texturas en móviles
  maxGlobalAttempts: 5,           // Máximo absoluto de intentos incluyendo reset
};

// Utilidad para formatear bytes en forma legible
const formatBytes = (bytes: number | undefined | null, decimals = 2): string => {
    if (bytes === undefined || bytes === null || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    try {
      // Handle potential negative or non-finite values from incorrect API results
      if (!Number.isFinite(bytes) || bytes < 0) {
        return 'N/A';
      }
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      // Asegurar que i esté dentro de los límites del array sizes
      const safeIndex = Math.max(0, Math.min(i, sizes.length - 1));
      return parseFloat((bytes / Math.pow(k, safeIndex)).toFixed(dm)) + ' ' + sizes[safeIndex];
    } catch (e) {
      // Log error only in debug mode to avoid console spam in production
      if (DEBUG) logger.warn(`Error formateando bytes: ${bytes}`, e);
      return `${bytes} Bytes`; // Fallback
    }
};

// Seleccionar la URL del modelo más adecuada para la situación actual
const selectModelUrl = (attemptNumber: number): string => {
  logger.info(`Seleccionando URL para intento de ronda: ${attemptNumber + 1}`); // Log 1-based attempt

  // Para móviles, intentar primero una versión específica si es el intento 0
  if (isMobile && attemptNumber === 0) {
    logger.info('Intento 1 (Móvil): Usando versión móvil o fallback');
    return MODEL_URLS.mobile || MODEL_URLS.fallback; // Fallback si no hay versión móvil
  }

  if (attemptNumber === 0) {
    // Primer intento (no móvil, o móvil sin versión específica)
    if (window.location.protocol === 'https:') {
      logger.info('Intento 1: Usando URL remota (HTTPS)');
      return MODEL_URLS.remote;
    } else {
      logger.info('Intento 1: Usando URL local (HTTP)');
      return MODEL_URLS.local;
    }
  } else if (attemptNumber === 1) {
    // Segundo intento
    if (isMobile) {
      logger.info('Intento 2 (Móvil): Usando modelo simplificado (fallback)');
      return MODEL_URLS.fallback;
    } else {
      logger.info('Intento 2 (No Móvil): Usando URL de backup GitHub');
      return MODEL_URLS.backup;
    }
  } else { // attemptNumber >= 2 (Tercer intento de la ronda)
    logger.info(`Intento ${attemptNumber + 1}: Usando modelo simplificado (fallback)`);
    return MODEL_URLS.fallback;
  }
};

const ARViewTest: React.FC = () => {
  const [arReady, setArReady] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelLoading, setModelLoading] = useState(false); // Inicia en false
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [modelLoadAttempts, setModelLoadAttempts] = useState(0); // Intentos de la ronda actual
  const [globalAttempts, setGlobalAttempts] = useState(0); // Contador global para evitar bucles infinitos
  const [isLastAttempt, setIsLastAttempt] = useState(false); // Flag para marcar el último intento (simplificado)
  const [currentModelUrl, setCurrentModelUrl] = useState<string | null>(null); // URL que se está intentando cargar
  const [loadingErrors, setLoadingErrors] = useState<string[]>([]);

  const sceneContainerRef = useRef<HTMLDivElement>(null); // Ref para el div contenedor
  const sceneElRef = useRef<any>(null); // Ref para la entidad <a-scene>
  const modelEntityRef = useRef<any>(null); // Ref para la entidad <a-entity id="castillo-model">
  const assetItemRef = useRef<any>(null); // Ref para <a-asset-item id="castillo-asset">
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const initialLoadTriggered = useRef(false); // Flag para controlar la carga inicial

  // --- useEffect de Configuración Inicial y Limpieza ---
  useEffect(() => {
    logger.info('Iniciando ARViewTest...');
    logger.info(`Dispositivo móvil detectado: ${isMobile}`);

    if (DEBUG && (!isMobile || MOBILE_DEBUG)) {
      logEnvironmentInfo();
    }
    if (DEBUG && !isMobile) {
      // La activación del debug de A-Frame se hará por atributos en la escena
      // enableAFrameDebug();
    }

    // Listener de errores globales
    const handleError = (event: ErrorEvent | PromiseRejectionEvent) => {
        let message = 'Error desconocido';
        let details: any = {};
        if (event instanceof ErrorEvent) {
            message = event.message || 'Error en script';
            details = { error: event.error, filename: event.filename, lineno: event.lineno, colno: event.colno };
        } else if (event instanceof PromiseRejectionEvent && event.reason) {
            message = 'Promesa rechazada sin manejar';
            details = { reason: event.reason };
        } else if ((event as any).message) {
            // Fallback genérico
            message = (event as any).message;
        }
        logger.error(`Error global capturado: ${message}`, details);
        // Podríamos mostrar un error genérico al usuario aquí si se repite mucho
        // setError("Ocurrió un error inesperado.");
    };
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleError);

    return () => {
      logger.info('Desmontando componente ARViewTest y limpiando recursos...');
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleError);
      if (xhrRef.current) {
        logger.info('Abortando XHR pendiente en cleanup.');
        xhrRef.current.onprogress = null;
        xhrRef.current.onload = null;
        xhrRef.current.onerror = null;
        xhrRef.current.ontimeout = null;
        xhrRef.current.onabort = null;
        xhrRef.current.abort();
        xhrRef.current = null;
      }
       // Limpiar Object URLs creados si aún existen y no fueron revocados
       // Esto es complejo de rastrear, A-Frame debería manejarlo si usamos su sistema
       // Pero si usamos setAttribute('src', blobUrl) directamente, debemos revocar
       // if (assetItemRef.current) {
       //     const currentSrc = assetItemRef.current.getAttribute('src');
       //     if (currentSrc && currentSrc.startsWith('blob:')) {
       //         logger.info(`Revocando Object URL ${currentSrc} en cleanup.`);
       //         URL.revokeObjectURL(currentSrc);
       //     }
       // }

      // Limpiar referencias de A-Frame
      sceneElRef.current = null;
      modelEntityRef.current = null;
      assetItemRef.current = null;
      logger.info('Cleanup completado.');
    };
  }, []); // Vacío para ejecutar solo una vez al montar

  // --- useEffect para solicitar cámara ---
  useEffect(() => {
    logger.info('Solicitando acceso a la cámara...');
    navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    })
      .then((stream) => {
        logger.info('Acceso a la cámara concedido.', stream.getVideoTracks()[0]?.label);
        setCameraActive(true);
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack?.getCapabilities) {
           logger.info('Capacidades de la cámara:', videoTrack.getCapabilities());
        }
        // Pequeño retraso para asegurar que la cámara esté lista antes de renderizar A-Frame
        setTimeout(() => {
          logger.info('Iniciando renderizado de escena AR.');
          setArReady(true); // Esto disparará el renderizado de la escena base
        }, 500); // Reducido el delay
      })
      .catch(err => {
        logger.error('Error al acceder a la cámara', err);
        setError(`Error al acceder a la cámara: ${err instanceof Error ? err.message : String(err)}`);
        setCameraActive(false); // Marcar cámara como inactiva
        setArReady(false); // Asegurar que AR no se active
      });
  }, []);

  // --- Función de Carga (XHR + Preparación Blob) ---
  const loadModel = (url: string) => {
    logger.info(`Intentando descargar modelo desde: ${url} (Intento global: ${globalAttempts + 1} / ${MODEL_LOAD_CONFIG.maxGlobalAttempts})`);

    // --- Verificación de intentos globales ANTES de incrementar ---
    if (globalAttempts >= MODEL_LOAD_CONFIG.maxGlobalAttempts) {
      logger.error(`EXCEDIDO MÁXIMO GLOBAL DE INTENTOS (${MODEL_LOAD_CONFIG.maxGlobalAttempts}). Deteniendo carga.`);
      setError(`Error crítico: Demasiados intentos fallidos (${globalAttempts}). Por favor, reinicia la aplicación.`);
      setModelLoading(false); // Detener indicador de carga
      return;
    }
    // --- Incrementar contador global ---
    setGlobalAttempts(prev => prev + 1);

    // --- Incrementar contador de intentos de la ronda actual ---
    // OJO: modelLoadAttempts se resetea a 0 en el useEffect inicial y antes del último intento
    setModelLoadAttempts(prev => prev + 1);

    setModelLoading(true); // Iniciar estado de carga
    setLoadingProgress(0);
    setLoadingErrors(prev => prev.filter(e => !e.includes('HTTP') && !e.includes('descarga'))); // Limpiar errores de carga previos

    // Abortar XHR previo si existe
    if (xhrRef.current) {
      logger.info('Abortando solicitud XHR previa.');
      xhrRef.current.onprogress = null;
      xhrRef.current.onload = null;
      xhrRef.current.onerror = null;
      xhrRef.current.ontimeout = null;
      xhrRef.current.onabort = null;
      xhrRef.current.abort();
    }

    // --- Crear nueva solicitud XHR ---
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';

    let lastProgressUpdate = 0;

    xhr.onprogress = (event) => {
      const now = Date.now();
      if (now - lastProgressUpdate < MODEL_LOAD_CONFIG.progressThrottleMs) {
        return; // Limitar actualizaciones
      }
      lastProgressUpdate = now;

      if (event.lengthComputable && event.total > 0) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        setLoadingProgress(percentComplete);
        if (percentComplete % (isMobile ? 25 : 10) === 0 || percentComplete === 100 || percentComplete === 0) {
             logger.info(`Progreso de carga: ${percentComplete}% (${formatBytes(event.loaded)} / ${formatBytes(event.total)})`);
        }
        // Detección temprana de tamaño sospechoso
        if (event.loaded > 0 && event.total < MODEL_LOAD_CONFIG.minValidSizeBytes) {
          logger.warn('Tamaño total del modelo < minValidSizeBytes', { total: event.total, url });
        }
      } else {
        // Simular progreso si no es computable (menos fiable)
        const estimatedProgress = Math.min(99, Math.log(event.loaded + 1) / Math.log(5000000) * 100); // Ajustar base log si es necesario
        setLoadingProgress(Math.round(estimatedProgress));
         logger.info(`Progreso de carga: ~${Math.round(estimatedProgress)}% (${formatBytes(event.loaded)} / ?)`);
      }
    };

    xhr.onload = () => {
      if (!xhrRef.current || xhr !== xhrRef.current) {
         logger.warn('XHR onload ejecutado pero la referencia ha cambiado (probablemente abortado). Ignorando.');
         return;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        logger.info('Modelo descargado completamente por XHR.', {
          status: xhr.status,
          size: formatBytes(xhr.response?.byteLength),
          contentType: xhr.getResponseHeader('Content-Type'),
          url
        });

        const responseData = xhr.response;
        // Liberar referencia XHR aquí para permitir GC temprano
        xhrRef.current = null;

        // --- Validaciones del contenido descargado ---
        if (!responseData || responseData.byteLength < MODEL_LOAD_CONFIG.minValidSizeBytes) {
          logger.error('Respuesta inválida o demasiado pequeña.', { 
              size: responseData?.byteLength, 
              expectedMin: MODEL_LOAD_CONFIG.minValidSizeBytes 
          });
          // Loguear inicio de la respuesta para depuración
          try {
            const firstChars = new TextDecoder().decode(responseData.slice(0, 100));
            logger.warn(`Inicio de la respuesta recibida (puede ser HTML): ${firstChars}...`);
          } catch {}
          setLoadingErrors(prev => [...prev, `Modelo inválido/corrupto (${formatBytes(responseData?.byteLength)})`]);
          retry(); // Intentar siguiente URL
          return;
        }

        // Verificar si es HTML (error común de servidor)
        const firstBytes = new Uint8Array(responseData, 0, Math.min(20, responseData.byteLength));
        const firstChars = Array.from(firstBytes).map(b => String.fromCharCode(b)).join('');
        if (firstChars.includes('<html') || firstChars.includes('<!DOCTYPE')) {
          logger.error('Recibido HTML en lugar de GLB. Posible error 404 o de servidor.', { head: firstChars });
          setLoadingErrors(prev => [...prev, `Error servidor (recibido HTML)`]);
          retry();
          return;
        }

        // Verificar magic bytes 'glTF'
        const header = new Uint8Array(responseData, 0, 4);
        const magicString = String.fromCharCode.apply(null, Array.from(header));
        if (magicString !== 'glTF') {
          logger.error('El archivo descargado no parece ser un GLB válido (magic bytes incorrectos).', { magic: magicString });
          setLoadingErrors(prev => [...prev, `Formato de archivo no válido (${magicString})`]);
          retry();
          return;
        }

        // --- ÉXITO de XHR y Validaciones ---
        logger.info('Datos del modelo descargados y validados. Creando Blob URL...');

        try {
          const blob = new Blob([responseData], { type: 'model/gltf-binary' });
          const objectURL = URL.createObjectURL(blob);
          logger.info(`Blob URL creado: ${objectURL.substring(0, 50)}...`);

          // --- Actualizar A-Frame ---
          if (assetItemRef.current) {
            const oldSrc = assetItemRef.current.getAttribute('src');
            logger.info(`Actualizando src de a-asset-item (${assetItemRef.current.id}) a nuevo Blob URL.`);
            assetItemRef.current.setAttribute('src', objectURL);

            // Revocar URL anterior si era un Blob URL
             if (oldSrc && oldSrc.startsWith('blob:')) {
                 logger.info(`Revocando Object URL anterior: ${oldSrc.substring(0,50)}...`);
                 URL.revokeObjectURL(oldSrc);
             }

             // A-Frame debería detectar el cambio en src y cargar el modelo
             // El listener 'model-loaded' en la entidad se encargará de la visibilidad
             // y de quitar el indicador de carga general.
             // setModelLoading(false); // Quitamos esto, 'model-loaded' lo hará
             setLoadingProgress(100); // Marcar progreso como 100%
             logger.info("Esperando evento 'model-loaded' desde A-Frame...");


          } else {
            logger.error('Referencia a a-asset-item no encontrada. No se puede cargar modelo.');
            setError('Error interno: No se pudo encontrar el componente de assets.');
            setModelLoading(false);
             URL.revokeObjectURL(objectURL); // Revocar si no se pudo usar
          }

        } catch (blobError) {
          logger.error('Error al crear Blob o Object URL', blobError);
          setLoadingErrors(prev => [...prev, 'Error interno procesando modelo']);
          retry();
        }

      } else {
        // --- Error HTTP ---
        logger.error(`Error HTTP ${xhr.status} al descargar ${url}`, { statusText: xhr.statusText });
        setLoadingErrors(prev => [...prev, `Error HTTP ${xhr.status}`]);
        xhrRef.current = null; // Limpiar ref
        retry();
      }
    };

    xhr.onerror = () => {
      if (!xhrRef.current || xhr !== xhrRef.current) {
         logger.warn('XHR onerror ejecutado pero la referencia ha cambiado. Ignorando.');
         return;
      }
      logger.error(`Error de red al intentar descargar ${url}`, { url });
      let errorDetail = 'Error de red';
      if (navigator.onLine === false) errorDetail = 'Sin conexión';
      else if (url.startsWith('https') && window.location.protocol === 'http:') errorDetail = 'Mezcla HTTP/HTTPS';
      setLoadingErrors(prev => [...prev, errorDetail]);
       xhrRef.current = null; // Limpiar ref
      retry();
    };

    xhr.ontimeout = () => {
       if (!xhrRef.current || xhr !== xhrRef.current) {
         logger.warn('XHR ontimeout ejecutado pero la referencia ha cambiado. Ignorando.');
         return;
      }
      logger.error(`Timeout (${MODEL_LOAD_CONFIG.timeoutMs}ms) al descargar ${url}`);
      setLoadingErrors(prev => [...prev, `Timeout (${MODEL_LOAD_CONFIG.timeoutMs/1000}s)`]);
       xhrRef.current = null; // Limpiar ref
      retry();
    };

     xhr.onabort = () => {
        // No llamar a retry si fue abortado intencionalmente
        logger.warn(`Descarga XHR abortada para ${url}.`);
         if (xhrRef.current === xhr) { // Solo limpiar si es el XHR actual
            xhrRef.current = null;
         }
    };

    // --- Enviar solicitud ---
    try {
      xhr.timeout = MODEL_LOAD_CONFIG.timeoutMs;
      xhr.send();
      logger.info(`Solicitud XHR enviada para ${url}`);
    } catch (e) {
      logger.error('Error al enviar la solicitud XHR', e, { url });
      setLoadingErrors(prev => [...prev, `Error al iniciar descarga: ${e instanceof Error ? e.message : String(e)}`]);
      xhrRef.current = null; // Limpiar ref
      retry(); // Llama a retry si send() falla
    }
  };

  // --- Función Retry ---
  const retry = () => {
    // Usar una pequeña demora para permitir que el estado se actualice y evitar ciclos rápidos
    setTimeout(() => {
        logger.warn(`RETRY llamado. Intento actual de ronda: ${modelLoadAttempts}, Global: ${globalAttempts}`);

        // --- Verificación de seguridad global ---
        if (globalAttempts >= MODEL_LOAD_CONFIG.maxGlobalAttempts) {
          logger.error(`EXCEDIDO MÁXIMO GLOBAL DE INTENTOS (${globalAttempts}/${MODEL_LOAD_CONFIG.maxGlobalAttempts}) en retry. Cancelando.`);
          setError(`Error crítico: Demasiados intentos fallidos (${globalAttempts}). Por favor, reinicia.`);
          setModelLoading(false);
          return;
        }

        // --- Verificación de intento final ---
        if (isLastAttempt) {
          logger.error('El último intento (modelo simplificado) también falló. No hay más reintentos.');
          setError(`No se pudo cargar ningún modelo después de ${globalAttempts} intentos. Errores: ${loadingErrors.slice(-3).join(', ')}`);
          setModelLoading(false);
          return;
        }

        // --- Verificar si hemos alcanzado el máximo de intentos para la ronda actual ---
        if (modelLoadAttempts >= MODEL_LOAD_CONFIG.maxAttempts) {
          logger.error(`Se alcanzó el máximo de ${MODEL_LOAD_CONFIG.maxAttempts} intentos para esta ronda. Intentando modelo simplificado.`);

          setIsLastAttempt(true); // Marcar como último intento
          setError(null); // Limpiar error principal para mostrar carga del último intento
          setLoadingProgress(0); // Resetear progreso para el último intento

          const finalUrl = MODEL_URLS.simplified || MODEL_URLS.fallback;
          setCurrentModelUrl(finalUrl); // Esto dispara el useEffect[currentModelUrl] que llama a loadModel

          // Resetear contador de intentos de ronda SOLO para este intento final
          setModelLoadAttempts(0);
          logger.info(`Iniciando último intento con URL: ${finalUrl}`);
          // NO llamamos a loadModel directamente aquí, el cambio de state lo hará.

          return; // Salir de retry después de configurar el último intento
        }

        // --- Si no hemos llegado al límite de la ronda, proceder con el siguiente intento ---
        logger.info(`Preparando siguiente intento (Intento de ronda ${modelLoadAttempts + 1}/${MODEL_LOAD_CONFIG.maxAttempts})`);
        setLoadingProgress(0); // <-- Resetear progreso ANTES del siguiente intento

        const nextUrl = selectModelUrl(modelLoadAttempts); // Obtener URL para el *siguiente* intento
        logger.info(`Siguiente URL seleccionada: ${nextUrl}`);
        setCurrentModelUrl(nextUrl); // Actualizar estado -> dispara useEffect[currentModelUrl] -> llama a loadModel
         // modelLoadAttempts se incrementará dentro del próximo loadModel

    }, MODEL_LOAD_CONFIG.retryDelayMs); // Aplicar retraso antes de decidir el reintento
  };

  // --- useEffect para iniciar la carga cuando AR está listo y la URL es nula ---
  useEffect(() => {
    // Solo si AR está listo, la carga inicial NO se ha disparado, y NO hay URL actual
    if (arReady && !initialLoadTriggered.current && currentModelUrl === null) {
      logger.info('AR listo y sin URL. Iniciando secuencia de carga inicial.');
      initialLoadTriggered.current = true;

      // Reiniciar contadores y estado para la primera secuencia
      setGlobalAttempts(0);
      setModelLoadAttempts(0);
      setIsLastAttempt(false);
      setLoadingErrors([]);
      setError(null);

      // Obtener la primera URL a intentar (intento 0)
      const firstUrl = selectModelUrl(0);
      logger.info(`URL inicial seleccionada: ${firstUrl}`);
      setCurrentModelUrl(firstUrl); // -> Dispara useEffect[currentModelUrl] -> loadModel
    }
  }, [arReady, currentModelUrl]); // Dependencias: arReady y currentModelUrl

  // --- useEffect para llamar a loadModel cuando cambia currentModelUrl ---
  useEffect(() => {
    // Solo si hay una URL válida y AR está listo
    if (currentModelUrl && arReady) {
      logger.info(`useEffect[currentModelUrl]: URL cambió a ${currentModelUrl}. Llamando a loadModel.`);
      loadModel(currentModelUrl);
    }
    // No necesita cleanup aquí, loadModel aborta XHR previo.
    // La revocación de Blob URL se maneja al cargar uno nuevo.
  }, [currentModelUrl, arReady]); // Ejecutar cuando la URL o arReady cambien

  // --- useEffect para adjuntar referencias y listeners a A-Frame ---
  useEffect(() => {
    if (arReady && sceneContainerRef.current && !sceneElRef.current) {
      logger.info('Contenedor de escena AR renderizado. Buscando elementos A-Frame...');

      // Usar un pequeño timeout puede ayudar si A-Frame necesita un ciclo
      const timerId = setTimeout(() => {
        if (!sceneContainerRef.current) return; // Comprobar si el contenedor aún existe

        const sceneElement = sceneContainerRef.current.querySelector('a-scene');
        if (sceneElement) {
          sceneElRef.current = sceneElement;
          logger.info('<a-scene> encontrada y referencia guardada.');

          assetItemRef.current = sceneElement.querySelector('#castillo-asset');
          modelEntityRef.current = sceneElement.querySelector('#castillo-model');

          if (!assetItemRef.current) logger.error('¡Error crítico! No se pudo encontrar #castillo-asset.');
          else logger.info('Referencia a #castillo-asset guardada.');

          if (!modelEntityRef.current) logger.error('¡Error crítico! No se pudo encontrar #castillo-model.');
          else {
            logger.info('Referencia a #castillo-model guardada. Adjuntando listeners...');

            // --- Listener para model-error ---
            const handleModelError = (event: Event) => {
                const detail = (event as CustomEvent)?.detail;
                const src = detail?.src || modelEntityRef.current?.getAttribute('gltf-model') || assetItemRef.current?.getAttribute('src') || 'desconocido';
                logger.error(`Evento 'model-error' capturado en #castillo-model`, { detail, src });
                setLoadingErrors(prev => [...prev, `Error A-Frame (${src.substring(0,30)}...)`]);

                // Llamar a retry SOLO si no estamos ya en el último intento y si el error NO viene de un blob
                // Errores en blob suelen ser irrecuperables (datos corruptos)
                if (!isLastAttempt && !src.startsWith('blob:')) {
                    logger.warn("Llamando a retry() desde listener 'model-error' (posible error de red/A-Frame).");
                    retry();
                } else if (src.startsWith('blob:')) {
                    logger.error("'model-error' ocurrió con un Blob URL. No se reintentará. Probablemente datos corruptos.");
                    setError('Error al procesar el modelo 3D descargado.');
                    setModelLoading(false);
                } else {
                     logger.error("'model-error' ocurrió en el último intento. No se reintentará.");
                     setError('Fallo final al cargar/renderizar el modelo 3D.');
                     setModelLoading(false);
                }
            };

            // --- Listener para model-loaded ---
             const handleModelLoaded = () => {
                logger.info("Evento 'model-loaded' capturado en #castillo-model. Modelo renderizado.");
                if (modelEntityRef.current) {
                    modelEntityRef.current.setAttribute('visible', 'true');
                }
                 // Asegurarse de quitar el indicador de carga general
                 // Usar timeout para evitar flicker si 'model-loaded' dispara muy rápido
                setTimeout(() => setModelLoading(false), 100);
                setLoadingProgress(100); // Asegurar 100%
            };

            // Adjuntar listeners
            modelEntityRef.current.addEventListener('model-error', handleModelError);
            modelEntityRef.current.addEventListener('model-loaded', handleModelLoaded);

            // Guardar funciones para poder removerlas en cleanup
            modelEntityRef.current._handleModelError = handleModelError;
            modelEntityRef.current._handleModelLoaded = handleModelLoaded;

          } // end if modelEntityRef.current

        } else {
          logger.error('No se pudo encontrar <a-scene> dentro del contenedor después del delay.');
        }
      }, 150); // Aumentar delay ligeramente si es necesario

      // Cleanup para este efecto: remover listeners si se desmonta ANTES de que se añadan o si arReady cambia a false
       return () => {
           clearTimeout(timerId);
           if (modelEntityRef.current) {
               if (modelEntityRef.current._handleModelError) {
                  logger.info("Removiendo listener 'model-error' de #castillo-model.");
                  modelEntityRef.current.removeEventListener('model-error', modelEntityRef.current._handleModelError);
               }
               if (modelEntityRef.current._handleModelLoaded) {
                  logger.info("Removiendo listener 'model-loaded' de #castillo-model.");
                  modelEntityRef.current.removeEventListener('model-loaded', modelEntityRef.current._handleModelLoaded);
               }
           }
       };

    } // end if arReady && sceneContainerRef.current && !sceneElRef.current
  }, [arReady]); // Ejecutar cuando arReady cambie

  // --- Contenido HTML Estático para A-Frame ---
  const getStaticAframeHTML = () => {
    logger.info('Generando HTML estático de A-Frame...');
    const debugConfig = DEBUG && !isMobile ? `stats="${DEBUG}" debug="true"` : ''; // debug-helper no necesario si no lo usamos

    // Nota: Quitamos src y gltf-model iniciales.
    // Añadimos el listener de progreso directamente al asset-item
    return `
      <a-scene
        embedded
        arjs="sourceType: webcam; videoTexture: true; debugUIEnabled: false; detectionMode: mono_and_matrix; matrixCodeType: 3x3;"
        vr-mode-ui="enabled: false"
        renderer="antialias: ${!isMobile}; alpha: true; precision: ${isMobile ? 'lowp' : 'mediump'}; logarithmicDepthBuffer: ${!isMobile}; colorManagement: true; physicallyCorrectLights: true;"
        loading-screen="enabled: false"
        ${debugConfig}>

        <a-assets timeout="60000">
          <a-asset-item id="castillo-asset"></a-asset-item>
          <!-- Podríamos añadir otros assets aquí si fueran necesarios -->
        </a-assets>

        <a-entity light="type: ambient; color: #BBB; intensity: 0.5;"></a-entity>
        <a-entity light="type: directional; color: #FFF; intensity: 0.6;" position="-0.5 1 1"></a-entity>

        <a-camera gps-camera rotation-reader position="0 1.6 0" fov="80"></a-camera>

        <a-entity
          id="castillo-model"
          position="0 0 -5" <!-- Posición inicial, se puede ajustar con GPS -->
          scale="${isMobile ? '0.3 0.3 0.3' : '0.5 0.5 0.5'}"
          rotation="0 0 0"
          shadow="cast: true; receive: false"
          gltf-model="#castillo-asset" <!-- Apunta al asset item -->
          visible="false">
        </a-entity>

      </a-scene>
    `;
  };

  // --- Renderizado del Componente ---
  return (
    <div className="ar-container">
      {/* Panel de Debug (si está activado) */}
      {DEBUG && (
        <div className="debug-panel">
          <h3>Debug Info</h3>
          <p>AR Ready: {String(arReady)}</p>
          <p>Cam Active: {String(cameraActive)}</p>
          <p>Loading: {String(modelLoading)}</p>
          <p>Progress: {loadingProgress}%</p>
          <p>Attempt: {modelLoadAttempts}/{MODEL_LOAD_CONFIG.maxAttempts}</p>
          <p>Global Att: {globalAttempts}/{MODEL_LOAD_CONFIG.maxGlobalAttempts}</p>
          <p>Last Att?: {String(isLastAttempt)}</p>
          <p>URL: {currentModelUrl ? currentModelUrl.substring(currentModelUrl.lastIndexOf('/') + 1) : 'N/A'}</p>
          {loadingErrors.length > 0 && (
            <>
              <p style={{color: '#ff6b6b', marginTop:'5px', borderTop:'1px solid #555', paddingTop:'3px'}}>Errors ({loadingErrors.length}):</p>
              <ul style={{margin: '0', paddingLeft: '15px', fontSize: '9px', maxHeight: '50px', overflowY: 'auto'}}>
                {loadingErrors.slice(-5).map((err, i) => ( // Mostrar últimos 5 errores
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* Overlay de Error Principal */}
      {error && (
        <div className="error-overlay">
          <p>{error}</p>
          <Link to="/" className="back-button">Volver al inicio</Link>
        </div>
      )}

       {/* Overlay de Carga Inicial (Cámara) */}
      {!arReady && !error && (
        <div className="loading-overlay">
          <p>Inicializando cámara y AR...</p>
          {!cameraActive && <p style={{fontSize:'0.8em', color:'#ccc'}}>Esperando permiso de cámara...</p>}
        </div>
      )}

      {/* Indicador de Carga del Modelo (diferente del overlay inicial) */}
      {modelLoading && arReady && !error && (
        <div className="model-loading-indicator">
          <div className="progress-bar-container">
            <div className="progress-bar" style={{ width: `${loadingProgress}%` }}></div>
          </div>
          <p>Cargando modelo 3D: {loadingProgress}%</p>
           {(globalAttempts > 0 || modelLoadAttempts > 1) && ( // Mostrar intentos
             <p className="retry-message">Intento {modelLoadAttempts}/{MODEL_LOAD_CONFIG.maxAttempts} (Global: {globalAttempts})</p>
           )}
        </div>
      )}

      {/* Botón para volver (visible siempre que no haya error fatal) */}
      {!error && <Link to="/" className="back-button-ar">Volver</Link>}

      {/* Contenedor para la Escena A-Frame Estática */}
      {/* Se renderiza solo cuando arReady es true */}
      <div
        ref={sceneContainerRef}
        className="scene-container"
        style={{ visibility: arReady ? 'visible' : 'hidden' }} // Ocultar hasta que AR esté listo
        dangerouslySetInnerHTML={arReady ? { __html: getStaticAframeHTML() } : undefined}
      />
    </div>
  );
};

export default ARViewTest; 