import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import 'aframe';
import 'aframe-ar';
import 'aframe-extras';
import 'aframe-look-at-component';
import '../styles/ARView.css';

// URL del modelo a cargar - SOLO ESTE MODELO
const MODEL_URL = 'https://jeanrua.com/models/SantaMaria_futuro.glb';

const ARView: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [arReady, setArReady] = useState(false);
  const [modelLoading, setModelLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  
  // Coordenadas del objetivo (39°28'09.4"N 0°25'53.5"W)
  const targetLat = 39.469278;
  const targetLng = -0.431528;
  
  // Función de utilidad para formatear bytes
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };
  
  // Inicializar cámara y AR
  useEffect(() => {
    console.log('Iniciando ARView con modelo único:', MODEL_URL);
    
    // Solicitar acceso a la cámara
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(() => {
        setTimeout(() => {
          setArReady(true);
          console.log('Cámara inicializada correctamente');
        }, 1000);
      })
      .catch(err => {
        setError(`Error al acceder a la cámara: ${err instanceof Error ? err.message : String(err)}`);
      });
      
    return () => {
      console.log('Desmontando ARView');
    };
  }, []);
  
  // Configurar la escena AR cuando esté lista
  useEffect(() => {
    if (!arReady || !sceneRef.current) return;
    
    console.log('Escena AR lista, configurando...');
    
    // Dar tiempo para que la escena A-Frame se inicialice
    setTimeout(() => {
      const modelEntity = document.querySelector('#castillo-model');
      if (modelEntity) {
        console.log('Aplicando modelo a la entidad...');
        modelEntity.setAttribute('gltf-model', MODEL_URL);
      }
    }, 1000);
    
  }, [arReady]);
  
  // Actualizar el indicador de progreso de carga
  useEffect(() => {
    if (!arReady) return;
    
    const progressBar = document.querySelector('#progress-bar');
    const progressText = document.querySelector('#progress-text');
    
    if (progressBar && progressText) {
      progressBar.setAttribute('scale', `${loadingProgress/100} 1 1`);
      progressText.setAttribute('value', `${loadingProgress}%`);
    }
    
    // Cuando el modelo termine de cargar
    if (loadingProgress === 100) {
      setTimeout(() => {
        setModelLoading(false);
        const progressIndicator = document.querySelector('#progress-indicator');
        if (progressIndicator) {
          progressIndicator.setAttribute('visible', 'false');
        }
      }, 1000);
    }
  }, [loadingProgress, arReady]);
  
  // Monitorear el progreso de carga del modelo
  useEffect(() => {
    if (!arReady) return;
    
    console.log('Configurando listener para monitorear carga del modelo...');
    
    // Configurar un listener para el evento de carga del modelo
    const handleModelLoaded = () => {
      console.log('Modelo cargado exitosamente!');
      setModelLoading(false);
      setLoadingProgress(100);
    };
    
    // Escuchar el evento model-loaded de A-Frame
    document.addEventListener('model-loaded', handleModelLoaded);
    
    // También monitorear mediante mutationObserver
    setTimeout(() => {
      const entity = document.querySelector('#castillo-model');
      if (entity) {
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'gltf-model-loaded') {
              const isLoaded = entity.getAttribute('gltf-model-loaded');
              if (isLoaded === 'true' || isLoaded === 'loaded') {
                console.log('Modelo detectado como cargado a través de atributo');
                setModelLoading(false);
                setLoadingProgress(100);
              }
            }
          });
        });
        
        observer.observe(entity, { attributes: true });
        
        // Fallback en caso de que ningún evento se dispare
        setTimeout(() => {
          if (modelLoading) {
            console.log('Asumiendo que el modelo está cargado después de timeout');
            setModelLoading(false);
            setLoadingProgress(100);
          }
        }, 30000);
      }
    }, 2000);
    
    return () => {
      document.removeEventListener('model-loaded', handleModelLoaded);
    };
  }, [arReady, modelLoading]);
  
  // Manejar la geolocalización
  useEffect(() => {
    if (!arReady) return;

    if ('geolocation' in navigator) {
      navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          
          // Calcular la distancia al objetivo para posicionar el modelo
          const dx = calculateDistanceX(latitude, longitude, targetLat, targetLng);
          const dz = calculateDistanceZ(latitude, longitude, targetLat, targetLng);
          
          // Actualizar la posición del modelo
          const modelEl = document.querySelector('#castillo-model');
          if (modelEl) {
            modelEl.setAttribute('position', `${dx} 0 ${dz}`);
          }
        },
        (err) => {
          console.warn('Error de geolocalización:', err.message);
        },
        { enableHighAccuracy: true }
      );
    }
  }, [arReady, targetLat, targetLng]);

  // Calcular distancias para la geolocalización
  const calculateDistanceX = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Radio de la Tierra en metros
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const λ1 = lon1 * Math.PI / 180;
    const λ2 = lon2 * Math.PI / 180;
    
    const x = (λ2 - λ1) * Math.cos((φ1 + φ2) / 2);
    
    return R * x;
  };

  const calculateDistanceZ = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Radio de la Tierra en metros
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    
    const y = (φ2 - φ1);
    
    return R * y;
  };

  // Template A-Frame mínimo
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
        animation="property: opacity; to: 0; dur: 1000; easing: linear; startEvents: model-loaded"></a-box>
      
      <!-- Modelo 3D principal - Asignado por JavaScript -->
      <a-entity
        id="castillo-model"
        position="0 0 -5"
        scale="1 1 1"
        rotation="0 0 0"
        visible="true">
      </a-entity>
      
      <a-entity id="progress-indicator" position="0 0 -3" visible="true">
        <a-text id="loading-text" value="Cargando modelo 3D..." position="0 0.5 0" color="white" align="center" scale="0.5 0.5 0.5"></a-text>
        <a-plane id="progress-bar-bg" position="0 0 0" width="1" height="0.1" color="#333333"></a-plane>
        <a-plane id="progress-bar" position="-0.5 0 0.01" width="0.01" height="0.08" color="#4CAF50" scale="0 1 1"></a-plane>
        <a-text id="progress-text" value="0%" position="0 -0.2 0" color="white" align="center" scale="0.3 0.3 0.3"></a-text>
      </a-entity>
    </a-scene>
  `;

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