import React, { useEffect, useState, useCallback } from 'react';
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

const ARView: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [arReady, setArReady] = useState(false);
  const [modelLoading, setModelLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [modelBuffer, setModelBuffer] = useState<ArrayBuffer | null>(null);

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
    const maxAttempts = 3;
    
    // Primero intentamos cargar desde la caché
    const cachedModel = await loadModelFromCache();
    if (cachedModel) {
      setLoadingProgress(100);
      return cachedModel;
    }
    
    while (attempts < maxAttempts) {
      try {
        attempts++;
        console.log(`Intento ${attempts} de ${maxAttempts} para cargar el modelo`);
        
        // Usamos XMLHttpRequest para monitorear el progreso
        const modelData = await new Promise<ArrayBuffer>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', MODEL_URL, true);
          xhr.responseType = 'arraybuffer';
          
          // Monitorear el progreso de la descarga
          xhr.onprogress = (event) => {
            if (event.lengthComputable) {
              const percentComplete = Math.round((event.loaded / event.total) * 100);
              setLoadingProgress(percentComplete);
            }
          };
          
          xhr.onload = function() {
            if (this.status === 200) {
              setLoadingProgress(100);
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
          continue; // Reintentar
        }
      } catch (err) {
        console.error(`Error en el intento ${attempts}:`, err);
        
        if (attempts >= maxAttempts) {
          setError(`No se pudo cargar el modelo después de ${maxAttempts} intentos. Por favor, verifica tu conexión e inténtalo de nuevo.`);
          return null;
        }
        
        // Esperar antes del siguiente intento (backoff exponencial)
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempts - 1)));
      }
    }
    
    return null;
  }, [loadModelFromCache, cacheModel]);

  useEffect(() => {
    // Solicitar acceso a la cámara explícitamente antes de inicializar AR.js
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(() => {
        // Pequeño retraso para asegurar que la cámara esté lista
        setTimeout(() => {
          setArReady(true);
        }, 1000);
      })
      .catch(err => {
        setError(`Error al acceder a la cámara: ${err instanceof Error ? err.message : String(err)}`);
      });

    // Escuchar eventos de errores en la carga del modelo
    document.addEventListener('model-error', () => {
      setError('Error al cargar el modelo 3D. Por favor, verifica tu conexión a internet.');
    });

    // Comienza la precarga del modelo tan pronto como sea posible
    loadModelOptimized()
      .then(buffer => {
        if (buffer) {
          setModelBuffer(buffer);
          setModelLoading(false);
        }
      })
      .catch(err => {
        console.error('Error al cargar el modelo:', err);
        setError('Error al cargar el modelo 3D. Por favor, verifica tu conexión a internet.');
      });

    // Escuchar eventos de carga del modelo en A-Frame
    document.addEventListener('model-loaded', () => {
      setModelLoading(false);
    });

    return () => {
      document.removeEventListener('model-loaded', () => {
        setModelLoading(false);
      });
    };
  }, [loadModelOptimized]);

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

  // Obtener URL de objeto para el modelo
  const getModelObjectURL = useCallback(() => {
    if (!modelBuffer) return '';

    try {
      // Crear un Blob desde el ArrayBuffer
      const blob = new Blob([modelBuffer], { type: 'model/gltf-binary' });
      
      // Crear una URL de objeto para el blob
      const objectURL = URL.createObjectURL(blob);
      return objectURL;
    } catch (err) {
      console.error('Error al crear URL de objeto para el modelo', err);
      return MODEL_URL;
    }
  }, [modelBuffer]);

  // Contenido A-Frame como HTML con optimizaciones de rendimiento
  const aframeHTML = `
    <a-scene 
      embedded
      arjs="sourceType: webcam; videoTexture: true; debugUIEnabled: false;"
      vr-mode-ui="enabled: false"
      renderer="antialias: true; alpha: true; precision: mediump; logarithmicDepthBuffer: true;"
      id="scene"
      loading-screen="enabled: false">
      <a-assets timeout="60000">
        <a-asset-item id="castillo-asset" src="${modelBuffer ? getModelObjectURL() : MODEL_URL}" 
          response-type="arraybuffer" crossorigin="anonymous"></a-asset-item>
      </a-assets>
      
      <a-camera gps-camera rotation-reader></a-camera>
      
      <!-- Placeholder mientras el modelo carga -->
      <a-box id="placeholder-model" position="0 0 -5" scale="2 2 2" color="#AAAAAA" opacity="0.5"
        animation="property: opacity; to: 0; dur: 1000; easing: linear; startEvents: modelLoaded"></a-box>
      
      <!-- Modelo 3D principal -->
      <a-entity
        id="castillo-model"
        position="0 0 -5"
        scale="1 1 1"
        rotation="0 0 0"
        gltf-model="#castillo-asset"
        visible="${!modelLoading}"
        animation="property: visible; to: true; dur: 1; delay: 500; startEvents: loaded">
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
    const progressIndicator = document.querySelector('#progress-indicator');
    const placeholderModel = document.querySelector('#placeholder-model');
    const castilloModel = document.querySelector('#castillo-model');
    
    if (progressBar && progressText) {
      progressBar.setAttribute('scale', `${loadingProgress/100} 1 1`);
      progressText.setAttribute('value', `${loadingProgress}%`);
    }
    
    if (loadingProgress === 100 && progressIndicator) {
      setTimeout(() => {
        progressIndicator.setAttribute('visible', 'false');
        if (placeholderModel && castilloModel) {
          placeholderModel.dispatchEvent(new CustomEvent('modelLoaded'));
          castilloModel.setAttribute('visible', 'true');
        }
      }, 1000);
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
      {arReady && <div dangerouslySetInnerHTML={{ __html: aframeHTML }} />}
    </div>
  );
};

export default ARView; 