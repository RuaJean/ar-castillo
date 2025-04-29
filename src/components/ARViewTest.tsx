import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import 'aframe';
import 'aframe-ar';
import 'aframe-extras';
import 'aframe-look-at-component';
import '../styles/ARView.css';

const ARViewTest: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [arReady, setArReady] = useState(false);
  
  // Distancia de prueba en metros (modelo aparecerá a esta distancia del usuario)
  const testDistance = 15;
  // Ángulo aleatorio para posicionar el modelo (0-360 grados)
  const randomAngle = Math.random() * 2 * Math.PI;

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
  }, []);

  useEffect(() => {
    if (!arReady) return;

    if ('geolocation' in navigator) {
      navigator.geolocation.watchPosition(
        (position) => {
          // Posicionar el modelo a una distancia fija, en una dirección aleatoria
          const dx = testDistance * Math.sin(randomAngle);
          const dz = testDistance * Math.cos(randomAngle);
          
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
  }, [arReady, randomAngle, testDistance]);

  // Contenido A-Frame como HTML
  const aframeHTML = `
    <a-scene 
      embedded
      arjs="sourceType: webcam; videoTexture: true; debugUIEnabled: false;"
      vr-mode-ui="enabled: false"
      renderer="antialias: true; alpha: true; precision: mediump;"
      id="scene">
      <a-camera gps-camera rotation-reader></a-camera>
      
      <a-entity
        id="castillo-model"
        position="0 0 -5"
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
      
      {!arReady && !error && (
        <div className="loading-overlay">
          <p>Inicializando cámara...</p>
        </div>
      )}
      
      <div className="ar-info-overlay">
        <p>Modelo posicionado a aproximadamente {testDistance} metros de ti</p>
      </div>
      
      <Link to="/" className="back-button-ar">Volver</Link>
      
      {/* A-Frame Scene */}
      {arReady && <div dangerouslySetInnerHTML={{ __html: aframeHTML }} />}
    </div>
  );
};

export default ARViewTest; 