import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import 'aframe';
import 'aframe-ar';
import 'aframe-extras';
import 'aframe-look-at-component';
import '../styles/ARView.css';

const ARView: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const sceneContainerRef = useRef<HTMLDivElement>(null);

  // Coordenadas del objetivo (39°28'09.4"N 0°25'53.5"W)
  const targetLat = 39.469278;
  const targetLng = -0.431528;

  // Solicitar acceso a la cámara explícitamente
  useEffect(() => {
    const requestCameraAccess = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ video: true });
        setCameraReady(true);
      } catch (err) {
        setError(`Error al acceder a la cámara: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    requestCameraAccess();
  }, []);

  useEffect(() => {
    if (!cameraReady) return;

    // Inicializar A-Frame solo cuando la cámara esté lista
    const initAframe = () => {
      if (!sceneContainerRef.current) return;
      
      // Crear elementos A-Frame manualmente
      const scene = document.createElement('a-scene');
      scene.setAttribute('embedded', '');
      scene.setAttribute('arjs', 'sourceType: webcam; debugUIEnabled: false; detectionMode: mono_and_matrix; cameraParametersUrl: https://cdn.jsdelivr.net/gh/AR-js-org/AR.js@master/data/camera_para.dat;');
      scene.setAttribute('renderer', 'logarithmicDepthBuffer: true; precision: medium;');
      scene.setAttribute('vr-mode-ui', 'enabled: false');
      
      // Cámara
      const camera = document.createElement('a-entity');
      camera.setAttribute('camera', '');
      camera.setAttribute('look-controls', '');
      camera.setAttribute('wasd-controls', '');
      camera.setAttribute('position', '0 1.6 0');
      scene.appendChild(camera);
      
      // Modelo 3D
      const model = document.createElement('a-entity');
      model.id = 'castillo-model';
      model.setAttribute('position', '0 0 -5');
      model.setAttribute('scale', '1 1 1');
      model.setAttribute('rotation', '0 0 0');
      model.setAttribute('gltf-model', 'https://jeanrua.com/models/SantaMaria_futuro.glb');
      scene.appendChild(model);
      
      // Indicador de usuario
      const userIndicator = document.createElement('a-sphere');
      userIndicator.setAttribute('position', '0 0 0');
      userIndicator.setAttribute('radius', '0.5');
      userIndicator.setAttribute('color', 'red');
      userIndicator.setAttribute('opacity', '0.7');
      scene.appendChild(userIndicator);
      
      // Limpiar contenedor y añadir escena
      sceneContainerRef.current.innerHTML = '';
      sceneContainerRef.current.appendChild(scene);
      
      // Escuchar por error de cámara
      scene.addEventListener('camera-error', () => {
        setError('Error al inicializar la cámara de AR.js. Por favor, recarga la página e intenta de nuevo.');
      });
      
      if ('geolocation' in navigator) {
        // Obtener la ubicación actual
        navigator.geolocation.watchPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            
            // Calcular la distancia al objetivo para posicionar el modelo
            const dx = calculateDistanceX(latitude, longitude, targetLat, targetLng);
            const dz = calculateDistanceZ(latitude, longitude, targetLat, targetLng);
            
            // Actualizar la posición del modelo dinámicamente
            if (model) {
              model.setAttribute('position', `${dx} 0 ${dz}`);
            }
          },
          (err) => {
            setError(`Error accediendo a la ubicación: ${err.message}`);
          },
          { enableHighAccuracy: true }
        );
      } else {
        setError('La geolocalización no está disponible en este dispositivo.');
      }
    };

    // Inicializar A-Frame
    initAframe();

    // Limpiar al desmontar
    return () => {
      if (sceneContainerRef.current) {
        sceneContainerRef.current.innerHTML = '';
      }
    };
  }, [cameraReady, targetLat, targetLng]);

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

  return (
    <div className="ar-container">
      {error && (
        <div className="error-overlay">
          <p>{error}</p>
          <Link to="/" className="back-button">Volver al inicio</Link>
        </div>
      )}
      
      <Link to="/" className="back-button-ar">Volver</Link>
      
      {!error && !cameraReady && (
        <div className="loading-overlay">
          <p>Solicitando acceso a la cámara...</p>
        </div>
      )}
      
      <div ref={sceneContainerRef} className="scene-container"></div>
    </div>
  );
};

export default ARView; 