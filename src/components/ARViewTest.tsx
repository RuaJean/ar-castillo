import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import 'aframe';
import 'aframe-ar';
import 'aframe-extras';
import 'aframe-look-at-component';
import '../styles/ARView.css';

const ARViewTest: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const sceneContainerRef = useRef<HTMLDivElement>(null);
  
  // Distancia de prueba en metros (modelo aparecerá a esta distancia del usuario)
  const testDistance = 15;
  // Ángulo aleatorio para posicionar el modelo (0-360 grados)
  const randomAngle = Math.random() * 2 * Math.PI;

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
      model.setAttribute('position', `0 0 -${testDistance}`);
      model.setAttribute('scale', '1 1 1');
      model.setAttribute('rotation', '0 0 0');
      model.setAttribute('gltf-model', 'https://jeanrua.com/models/SantaMaria_futuro.glb');
      scene.appendChild(model);
      
      // Indicador de dirección hacia el modelo
      const directionIndicator = document.createElement('a-entity');
      directionIndicator.id = 'direction-indicator';
      
      const arrow = document.createElement('a-box');
      arrow.setAttribute('position', '0 0.5 -2');
      arrow.setAttribute('color', 'green');
      arrow.setAttribute('depth', '0.1');
      arrow.setAttribute('height', '0.1');
      arrow.setAttribute('width', '0.5');
      directionIndicator.appendChild(arrow);
      
      const text = document.createElement('a-text');
      text.setAttribute('value', 'Modelo 3D');
      text.setAttribute('position', '0 0.7 -2');
      text.setAttribute('color', 'white');
      text.setAttribute('align', 'center');
      directionIndicator.appendChild(text);
      
      scene.appendChild(directionIndicator);
      
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
            // Posicionar el modelo a una distancia fija, en una dirección aleatoria
            const dx = testDistance * Math.sin(randomAngle);
            const dz = testDistance * Math.cos(randomAngle);
            
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
  }, [cameraReady, randomAngle, testDistance]);

  return (
    <div className="ar-container">
      {error && (
        <div className="error-overlay">
          <p>{error}</p>
          <Link to="/" className="back-button">Volver al inicio</Link>
        </div>
      )}
      
      {!error && !cameraReady && (
        <div className="loading-overlay">
          <p>Solicitando acceso a la cámara...</p>
        </div>
      )}
      
      <div className="ar-info-overlay">
        <p>Modelo posicionado a aproximadamente {testDistance} metros de ti</p>
      </div>
      
      <Link to="/" className="back-button-ar">Volver</Link>
      
      <div ref={sceneContainerRef} className="scene-container"></div>
    </div>
  );
};

export default ARViewTest; 