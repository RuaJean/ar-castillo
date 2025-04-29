import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import 'aframe';
import 'aframe-ar';
import 'aframe-extras';
import 'aframe-look-at-component';
import '../styles/ARView.css';

const ARView: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [arReady, setArReady] = useState(false);
  const [modelLoading, setModelLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Coordenadas del objetivo (39°28'09.4"N 0°25'53.5"W)
  const targetLat = 39.469278;
  const targetLng = -0.431528;

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

    // Manejar errores de carga del modelo
    document.addEventListener('model-error', () => {
      setError('Error al cargar el modelo 3D. Por favor, verifica tu conexión a internet.');
    });

    // Pre-carga del modelo para mejorar el rendimiento
    const modelLoader = new Image();
    modelLoader.src = 'https://jeanrua.com/models/SantaMaria_futuro.glb';
    
    // Monitoreo de progreso de carga usando XMLHttpRequest
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://jeanrua.com/models/SantaMaria_futuro.glb', true);
    xhr.responseType = 'arraybuffer';
    
    xhr.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        setLoadingProgress(percentComplete);
      }
    };
    
    xhr.onload = () => {
      setModelLoading(false);
    };
    
    xhr.onerror = () => {
      setError('Error al cargar el modelo 3D. Por favor, verifica tu conexión a internet.');
    };
    
    xhr.send();

    // Añadir listener para eventos de progreso de carga en A-Frame
    document.addEventListener('model-loaded', () => {
      setModelLoading(false);
    });

    return () => {
      document.removeEventListener('model-loaded', () => {
        setModelLoading(false);
      });
      xhr.abort();
    };
  }, []);

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

  // Contenido A-Frame como HTML con optimizaciones de rendimiento
  const aframeHTML = `
    <a-scene 
      embedded
      arjs="sourceType: webcam; videoTexture: true; debugUIEnabled: false;"
      vr-mode-ui="enabled: false"
      renderer="antialias: true; alpha: true; precision: mediump; logarithmicDepthBuffer: true;"
      id="scene"
      loading-screen="enabled: false">
      <a-assets timeout="30000">
        <a-asset-item id="castillo-asset" src="https://jeanrua.com/models/SantaMaria_futuro.glb" 
          response-type="arraybuffer" crossorigin="anonymous"></a-asset-item>
      </a-assets>
      
      <a-camera gps-camera rotation-reader></a-camera>
      
      <!-- Modelo en low-poly mientras carga el completo -->
      <a-box id="placeholder-model" position="0 0 -5" scale="2 2 2" color="#AAAAAA" opacity="0.5"
        animation="property: opacity; to: 0; dur: 1000; easing: linear; startEvents: modelLoaded"></a-box>
      
      <!-- Modelo 3D principal con LOD (Level of Detail) -->
      <a-entity
        id="castillo-model"
        position="0 0 -5"
        scale="1 1 1"
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