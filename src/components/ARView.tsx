import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import 'aframe';
import 'aframe-ar';
import 'aframe-extras';
import 'aframe-look-at-component';
import '../styles/ARView.css';

// URL del modelo a cargar - SOLO ESTE MODELO
const MODEL_URL = 'https://jeanrua.com/models/SantaMaria_futuro.glb';
const MODEL_CACHE_KEY = 'ar-castillo-model-cache';
const MODEL_CACHE_VERSION = 'v1';

// Configuración de tiempos de espera muy altos
const TIMEOUTS = {
  modelLoad: 10000000, // 10,000 segundos
  cameraInit: 60000,    // 60 segundos
  sceneSetup: 5000,     // 5 segundos para configurar escena
  retryDelay: 30000     // 30 segundos entre reintentos
};

const ARView: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [arReady, setArReady] = useState(false);
  const [modelLoading, setModelLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [modelBuffer, setModelBuffer] = useState<ArrayBuffer | null>(null);
  const [blobUrl, setBlobUrl] = useState<string>('');
  const sceneRef = useRef<HTMLDivElement | null>(null);
  
  // Coordenadas del objetivo (39°28'09.4"N 0°25'53.5"W)
  const targetLat = 39.469278;
  const targetLng = -0.431528;

  // Sistema de caché para el modelo 3D usando IndexedDB
  const cacheModel = useCallback(async (buffer: ArrayBuffer): Promise<void> => {
    try {
      // Comprobar si IndexedDB está disponible
      if (!('indexedDB' in window)) {
        console.warn('IndexedDB no está disponible para almacenar el modelo en caché');
        return;
      }

      const dbName = MODEL_CACHE_KEY;
      const storeName = 'models';
      const request = indexedDB.open(dbName, 1);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      };

      request.onerror = () => {
        console.error('Error al abrir IndexedDB');
      };

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const cacheKey = `${MODEL_URL}|${MODEL_CACHE_VERSION}`;
        
        const putRequest = store.put(buffer, cacheKey);
        
        putRequest.onsuccess = () => {
          console.log('Modelo guardado en caché correctamente');
        };
        
        putRequest.onerror = () => {
          console.error('Error al guardar el modelo en caché');
        };
      };
    } catch (err) {
      console.error('Error al intentar almacenar el modelo en caché', err);
    }
  }, []);

  // Cargar modelo desde caché
  const loadModelFromCache = useCallback(async (): Promise<ArrayBuffer | null> => {
    return new Promise((resolve) => {
      try {
        if (!('indexedDB' in window)) {
          console.warn('IndexedDB no está disponible');
          resolve(null);
          return;
        }

        const dbName = MODEL_CACHE_KEY;
        const storeName = 'models';
        const request = indexedDB.open(dbName, 1);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName);
          }
        };

        request.onerror = () => {
          console.error('Error al abrir IndexedDB para cargar el modelo');
          resolve(null);
        };

        request.onsuccess = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          const transaction = db.transaction([storeName], 'readonly');
          const store = transaction.objectStore(storeName);
          const cacheKey = `${MODEL_URL}|${MODEL_CACHE_VERSION}`;
          
          const getRequest = store.get(cacheKey);
          
          getRequest.onsuccess = () => {
            const cachedModel = getRequest.result as ArrayBuffer;
            if (cachedModel && cachedModel.byteLength > 1000) {
              console.log('Modelo cargado desde caché', cachedModel.byteLength, 'bytes');
              resolve(cachedModel);
            } else {
              console.log('No se encontró modelo en caché o es inválido');
              resolve(null);
            }
          };
          
          getRequest.onerror = () => {
            console.error('Error al recuperar el modelo de la caché');
            resolve(null);
          };
        };
      } catch (err) {
        console.error('Error al intentar cargar el modelo desde caché', err);
        resolve(null);
      }
    });
  }, []);

  // Cargar modelo optimizado con sistema de reintentos
  const loadModelOptimized = useCallback(async (): Promise<ArrayBuffer | null> => {
    let attempts = 0;
    const maxAttempts = 5; // Aumentamos el número de intentos
    
    // Primero intentamos cargar desde la caché
    const cachedModel = await loadModelFromCache();
    if (cachedModel) {
      setLoadingProgress(100);
      return cachedModel;
    }
    
    while (attempts < maxAttempts) {
      try {
        attempts++;
        console.log(`Intento ${attempts} de ${maxAttempts} para cargar el modelo desde ${MODEL_URL}`);
        
        // Usamos XMLHttpRequest para monitorear el progreso
        const modelData = await new Promise<ArrayBuffer>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', MODEL_URL, true);
          xhr.responseType = 'arraybuffer';
          
          // Timeout extremadamente largo
          xhr.timeout = TIMEOUTS.modelLoad;
          
          // Monitorear el progreso de la descarga
          xhr.onprogress = (event) => {
            if (event.lengthComputable) {
              const percentComplete = Math.round((event.loaded / event.total) * 100);
              setLoadingProgress(percentComplete);
              console.log(`Progreso de carga: ${percentComplete}% (${formatBytes(event.loaded)}/${formatBytes(event.total)})`);
            } else {
              // Si no podemos calcular el progreso, mostramos al menos los bytes descargados
              console.log(`Descargados ${formatBytes(event.loaded)} bytes`);
            }
          };
          
          xhr.onload = function() {
            if (this.status === 200) {
              setLoadingProgress(100);
              console.log(`Modelo descargado completo: ${formatBytes(this.response.byteLength)} bytes`);
              resolve(this.response);
            } else {
              reject(new Error(`Error al cargar modelo: ${this.status}`));
            }
          };
          
          xhr.onerror = () => {
            reject(new Error('Error de red al cargar el modelo'));
          };
          
          xhr.ontimeout = () => {
            reject(new Error('Tiempo de espera agotado al cargar el modelo'));
          };
          
          xhr.send();
        });
        
        // Validar el modelo cargado
        if (modelData && modelData.byteLength > 10000) {
          // Guardar en caché para futuras cargas
          await cacheModel(modelData);
          return modelData;
        } else {
          console.warn('Modelo cargado con tamaño sospechoso:', modelData?.byteLength || 0, 'bytes');
          if (attempts >= maxAttempts) {
            setError(`El modelo parece ser demasiado pequeño (${modelData?.byteLength || 0} bytes). Intenta recargar la página.`);
            return null;
          }
          continue; // Reintentar
        }
      } catch (err) {
        console.error(`Error en el intento ${attempts}:`, err);
        
        if (attempts >= maxAttempts) {
          setError(`No se pudo cargar el modelo después de ${maxAttempts} intentos. Por favor, verifica tu conexión e inténtalo de nuevo.`);
          return null;
        }
        
        // Esperar antes del siguiente intento con tiempo de espera largo
        await new Promise(resolve => setTimeout(resolve, TIMEOUTS.retryDelay));
      }
    }
    
    return null;
  }, [loadModelFromCache, cacheModel]);

  // Función de utilidad para formatear bytes
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Obtener URL de objeto para el modelo
  const createModelBlobUrl = useCallback((buffer: ArrayBuffer): string => {
    try {
      // Crear un Blob desde el ArrayBuffer
      const blob = new Blob([buffer], { type: 'model/gltf-binary' });
      
      // Crear una URL de objeto para el blob
      const objectURL = URL.createObjectURL(blob);
      console.log('URL de objeto creada correctamente');
      return objectURL;
    } catch (err) {
      console.error('Error al crear URL de objeto para el modelo', err);
      return MODEL_URL;
    }
  }, []);

  useEffect(() => {
    // Solicitar acceso a la cámara explícitamente antes de inicializar AR.js
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(() => {
        // Tiempo de espera más largo para asegurar que la cámara esté lista
        setTimeout(() => {
          setArReady(true);
          console.log('Cámara inicializada correctamente, AR listo');
        }, TIMEOUTS.cameraInit / 10); // Un décimo del timeout total
      })
      .catch(err => {
        setError(`Error al acceder a la cámara: ${err instanceof Error ? err.message : String(err)}`);
      });

    // Escuchar eventos de errores en la carga del modelo
    document.addEventListener('model-error', () => {
      console.error('Evento model-error detectado');
      // No establecemos error inmediatamente para permitir que el sistema de reintentos funcione
    });

    // Comienza la precarga del modelo tan pronto como sea posible
    console.log('Iniciando carga optimizada del modelo...');
    loadModelOptimized()
      .then(buffer => {
        if (buffer) {
          console.log(`Modelo cargado exitosamente: ${formatBytes(buffer.byteLength)}`);
          setModelBuffer(buffer);
          
          // Crear URL de objeto para el modelo
          const url = createModelBlobUrl(buffer);
          setBlobUrl(url);
          
          setModelLoading(false);
        } else {
          console.error('La carga del modelo devolvió null');
        }
      })
      .catch(err => {
        console.error('Error crítico al cargar el modelo:', err);
        setError('Error al cargar el modelo 3D. Por favor, verifica tu conexión a internet e intenta nuevamente.');
      });

    // Limpiar
    return () => {
      // Liberar blob URL al desmontar
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
      
      document.removeEventListener('model-error', () => {});
    };
  }, [loadModelOptimized, createModelBlobUrl]);

  // Configurar la escena AR cuando esté lista y el modelo esté cargado
  useEffect(() => {
    if (!arReady || !sceneRef.current || modelLoading) return;
    
    // Configurar la escena una vez que la cámara y el modelo estén listos
    console.log('Configurando escena AR...');
    
    // Dar tiempo a A-Frame para inicializarse
    setTimeout(() => {
      try {
        // Actualizar el componente modelo
        const modelEntity = document.querySelector('#castillo-model');
        if (modelEntity && blobUrl) {
          console.log('Aplicando modelo a la entidad...');
          modelEntity.setAttribute('gltf-model', blobUrl);
          modelEntity.setAttribute('visible', 'true');
          
          // Ocultar indicador de progreso
          const progressIndicator = document.querySelector('#progress-indicator');
          if (progressIndicator) {
            progressIndicator.setAttribute('visible', 'false');
          }
          
          // Disparar evento modelLoaded para el placeholder
          const placeholderModel = document.querySelector('#placeholder-model');
          if (placeholderModel) {
            placeholderModel.dispatchEvent(new CustomEvent('modelLoaded'));
          }
        }
      } catch (err) {
        console.error('Error al configurar modelo en escena:', err);
      }
    }, TIMEOUTS.sceneSetup);
    
  }, [arReady, modelLoading, blobUrl]);

  useEffect(() => {
    if (!arReady) return;

    if ('geolocation' in navigator) {
      navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          
          // Calcular la distancia al objetivo para posicionar el modelo
          const dx = calculateDistanceX(latitude, longitude, targetLat, targetLng);
          const dz = calculateDistanceZ(latitude, longitude, targetLat, targetLng);
          
          // Actualizar la posición del modelo dinámicamente usando el sistema de eventos de A-Frame
          setTimeout(() => {
            const modelEl = document.querySelector('#castillo-model');
            if (modelEl) {
              modelEl.setAttribute('position', `${dx} 0 ${dz}`);
            }
          }, 1000);
        },
        (err) => {
          setError(`Error accediendo a la ubicación: ${err.message}`);
        },
        { enableHighAccuracy: true }
      );
    } else {
      setError('La geolocalización no está disponible en este dispositivo.');
    }
  }, [arReady, targetLat, targetLng]);

  // Calcula la distancia en el eje X (longitud) en metros
  const calculateDistanceX = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Radio de la Tierra en metros
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const λ1 = lon1 * Math.PI / 180;
    const λ2 = lon2 * Math.PI / 180;
    
    const x = (λ2 - λ1) * Math.cos((φ1 + φ2) / 2);
    
    return R * x;
  };

  // Calcula la distancia en el eje Z (latitud) en metros
  const calculateDistanceZ = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Radio de la Tierra en metros
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    
    const y = (φ2 - φ1);
    
    return R * y;
  };

  // Contenido A-Frame como HTML (versión simplificada y optimizada)
  const aframeHTML = `
    <a-scene 
      embedded
      arjs="sourceType: webcam; videoTexture: true; debugUIEnabled: false;"
      vr-mode-ui="enabled: false"
      renderer="antialias: true; alpha: true; precision: mediump; logarithmicDepthBuffer: true;"
      id="scene"
      loading-screen="enabled: false">
      
      <a-camera gps-camera rotation-reader></a-camera>
      
      <!-- Placeholder mientras el modelo carga -->
      <a-box id="placeholder-model" position="0 0 -5" scale="2 2 2" color="#AAAAAA" opacity="0.5"
        animation="property: opacity; to: 0; dur: 1000; easing: linear; startEvents: modelLoaded"></a-box>
      
      <!-- Modelo 3D principal - Sin URL inicial para evitar doble carga -->
      <a-entity
        id="castillo-model"
        position="0 0 -5"
        scale="1 1 1"
        rotation="0 0 0"
        visible="false">
      </a-entity>
      
      <a-entity id="progress-indicator" position="0 0 -3" visible="${modelLoading}">
        <a-text id="loading-text" value="Cargando modelo 3D..." position="0 0.5 0" color="white" align="center" scale="0.5 0.5 0.5"></a-text>
        <a-plane id="progress-bar-bg" position="0 0 0" width="1" height="0.1" color="#333333"></a-plane>
        <a-plane id="progress-bar" position="-0.5 0 0.01" width="0.01" height="0.08" color="#4CAF50" scale="${loadingProgress/100} 1 1"></a-plane>
        <a-text id="progress-text" value="${loadingProgress}%" position="0 -0.2 0" color="white" align="center" scale="0.3 0.3 0.3"></a-text>
      </a-entity>
    </a-scene>
  `;

  // Actualizar el progreso de carga en la escena
  useEffect(() => {
    if (!arReady) return;
    
    const progressBar = document.querySelector('#progress-bar');
    const progressText = document.querySelector('#progress-text');
    
    if (progressBar && progressText) {
      progressBar.setAttribute('scale', `${loadingProgress/100} 1 1`);
      progressText.setAttribute('value', `${loadingProgress}%`);
    }
  }, [loadingProgress, arReady]);

  return (
    <div className="ar-container">
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
        </div>
      )}
      
      <Link to="/" className="back-button-ar">Volver</Link>
      
      {/* A-Frame Scene */}
      {arReady && <div ref={sceneRef} dangerouslySetInnerHTML={{ __html: aframeHTML }} />}
    </div>
  );
};

export default ARView; 