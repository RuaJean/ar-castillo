import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import 'aframe';
import 'aframe-ar';
import 'aframe-extras';
import 'aframe-look-at-component';
import '../styles/ARView.css';

const ARViewTest: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  // Distancia de prueba en metros (modelo aparecerá a esta distancia del usuario)
  const testDistance = 15;
  // Ángulo aleatorio para posicionar el modelo (0-360 grados)
  const randomAngle = Math.random() * 2 * Math.PI;

  useEffect(() => {
    if ('geolocation' in navigator) {
      // Obtener la ubicación actual
      navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          
          // Posicionar el modelo a una distancia fija, en una dirección aleatoria
          const dx = testDistance * Math.sin(randomAngle);
          const dz = testDistance * Math.cos(randomAngle);
          
          // Actualizar la posición del modelo dinámicamente
          const model = document.querySelector('#castillo-model') as any;
          if (model) {
            model.setAttribute('position', { x: dx, y: 0, z: dz });
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
  }, [randomAngle, testDistance]);

  // Contenido de A-Frame como HTML
  const aframeContent = `
    <a-scene 
      embedded
      arjs="sourceType: webcam; debugUIEnabled: false; detectionMode: mono_and_matrix;"
      renderer="logarithmicDepthBuffer: true; precision: medium;"
      vr-mode-ui="enabled: false">
      
      <!-- Cámara con control de gestos -->
      <a-entity camera look-controls wasd-controls position="0 1.6 0"></a-entity>
      
      <!-- Modelo 3D del Castillo -->
      <a-entity
        id="castillo-model"
        position="0 0 -${testDistance}"
        scale="1 1 1"
        rotation="0 0 0"
        gltf-model="https://jeanrua.com/models/SantaMaria_futuro.glb">
      </a-entity>
      
      <!-- Indicador de dirección hacia el modelo -->
      <a-entity id="direction-indicator">
        <a-box position="0 0.5 -2" color="green" depth="0.1" height="0.1" width="0.5"></a-box>
        <a-text value="Modelo 3D" position="0 0.7 -2" color="white" align="center"></a-text>
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
      
      <div className="ar-info-overlay">
        <p>Modelo posicionado a aproximadamente {testDistance} metros de ti</p>
      </div>
      
      <Link to="/" className="back-button-ar">Volver</Link>
      
      <div dangerouslySetInnerHTML={{ __html: aframeContent }} />
    </div>
  );
};

export default ARViewTest; 