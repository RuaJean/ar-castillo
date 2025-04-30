import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import * as THREE from 'three';
import 'aframe';
import 'aframe-ar';
import 'aframe-extras';
import 'aframe-look-at-component';
import '../styles/ARView.css';

// Logger simplificado (o puedes copiar el logger completo de ARViewTest si prefieres)
const logger = {
  info: console.info,
  warn: console.warn,
  error: console.error,
  log: console.log
};

// Función de optimización runtime (copiada de ARViewTest)
const applyRuntimeOptimizations = (model: THREE.Object3D) => {
  logger.info('[ARView] Aplicando optimizaciones runtime...');
  let polygonCount = 0;
  const materials: string[] = [];

  model.traverse((child: THREE.Object3D) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry && mesh.geometry.attributes && mesh.geometry.attributes.position) {
          polygonCount += mesh.geometry.attributes.position.count / 3;
      }
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      if (mesh.material) {
        const materialType = Array.isArray(mesh.material) 
          ? mesh.material.map((m: THREE.Material) => m.type).join(',') 
          : (mesh.material as THREE.Material).type;
        if (!materials.includes(materialType)) {
          materials.push(materialType);
        }
      }
    }
  });

  logger.info('[ARView] Optimización runtime completada.', {
    polygons: Math.round(polygonCount),
    materialTypes: materials.join(', ')
  });
};

const ARView: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [arReady, setArReady] = useState(false);
  const [modelLoading, setModelLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const sceneContainerRef = useRef<HTMLDivElement>(null);

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
      } else {
          // Simular progreso si el total no es computable
          const estimatedProgress = Math.min(99, Math.log(event.loaded + 1) / Math.log(5000000) * 100); // Asumiendo tamaño aprox 5MB
          setLoadingProgress(Math.round(estimatedProgress));
      }
    };
    
    xhr.onload = () => {
        if(xhr.status >= 200 && xhr.status < 300) {
            setModelLoading(false);
            setLoadingProgress(100);
        } else {
            setError(`Error HTTP ${xhr.status} al cargar el modelo.`);
        }
    };
    
    xhr.onerror = () => {
      setError('Error de red al cargar el modelo 3D. Por favor, verifica tu conexión a internet.');
    };
    
    xhr.send();

    // Limpieza
    return () => {
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
              // Asegurarse de que la escena A-Frame esté montada antes de buscar
              const modelEl = sceneContainerRef.current?.querySelector('#castillo-model');
              if (modelEl) {
                  modelEl.setAttribute('position', `${dx} 0 ${dz}`);
              } else {
                  // logger.warn('[ARView] No se encontró #castillo-model para actualizar posición');
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
      <a-assets timeout="3000000">
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
        shadow="cast: false; receive: false"
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

  // Efecto para escuchar la carga del modelo y aplicar optimizaciones (similar a ARViewTest)
  useEffect(() => {
    if (!arReady) return;

    const modelEntity = sceneContainerRef.current?.querySelector('#castillo-model');
    if (!modelEntity) {
      // logger.warn('[ARView] No se encontró la entidad del modelo para añadir listener model-loaded');
      return;
    }

    const handleModelLoaded = (event: Event) => {
      logger.info('[ARView] Evento model-loaded recibido');
      const detail = (event as CustomEvent).detail;
      const modelData = detail?.model as THREE.Object3D | undefined;
      if (modelData) {
        applyRuntimeOptimizations(modelData);
      } else {
        // logger.warn('[ARView] No se encontró el objeto del modelo en el evento model-loaded', { detail });
      }
    };

    logger.info('[ARView] Añadiendo listener model-loaded a #castillo-model');
    modelEntity.addEventListener('model-loaded', handleModelLoaded);

    // Limpieza
    return () => {
      logger.info('[ARView] Quitando listener model-loaded de #castillo-model');
      modelEntity.removeEventListener('model-loaded', handleModelLoaded);
    };
  }, [arReady]);

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
      {arReady && 
        <div 
          ref={sceneContainerRef}
          dangerouslySetInnerHTML={{ __html: aframeHTML }} 
        />
      }
    </div>
  );
};

export default ARView; 