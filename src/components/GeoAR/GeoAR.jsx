import React, { useState } from 'react';
import './GeoAR.css';

const GeoAR = () => {
  const [arStarted, setArStarted] = useState(false);

  const initAR = async () => {
    try {
      // Cargar scripts necesarios
          if (!window.AFRAME) {
            await loadScript('https://aframe.io/releases/1.3.0/aframe.min.js');
          }
          if (!window.AFRAME || !window.AFRAME.components['gps-camera']) {
            await loadScript('https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.js');
          }

      // Crear contenedor AR
      const arContainer = document.createElement('div');
      arContainer.style.position = 'fixed';
      arContainer.style.top = '0';
      arContainer.style.left = '0';
      arContainer.style.width = '100%';
      arContainer.style.height = '100%';
      arContainer.style.zIndex = '1000';
      document.body.appendChild(arContainer);

      // Crear escena AR
      const scene = document.createElement('a-scene');
      scene.setAttribute('embedded', '');
      scene.setAttribute('arjs', 'sourceType: webcam; debugUIEnabled: false;');
      scene.setAttribute('vr-mode-ui', 'enabled: false');
      arContainer.appendChild(scene);

      // Agregar modelo 3D
      const entity = document.createElement('a-entity');
      entity.setAttribute('gltf-model', 'https://jeanrua.com/models/SantaMaria_actual.glb');
      entity.setAttribute('scale', '1 1 1');
      entity.setAttribute('position', '0 0 -5');
      scene.appendChild(entity);

      // Agregar cámara
      const camera = document.createElement('a-camera');
      scene.appendChild(camera);

      // Botón para volver
      const backButton = document.createElement('button');
      backButton.textContent = 'Volver';
      backButton.style.position = 'fixed';
      backButton.style.top = '10px';
      backButton.style.left = '10px';
      backButton.style.zIndex = '2000';
      backButton.style.padding = '8px 16px';
      backButton.style.backgroundColor = '#000';
      backButton.style.color = 'white';
      backButton.style.border = 'none';
      backButton.style.borderRadius = '4px';
      backButton.addEventListener('click', () => {
        arContainer.remove();
        setArStarted(false);
      });
      arContainer.appendChild(backButton);

      setArStarted(true);
    } catch (error) {
      console.error('Error al iniciar AR:', error);
    }
  };
      
  const loadScript = (src) => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      {!arStarted && (
            <button
          onClick={initAR}
          style={{
            padding: '20px 40px',
            fontSize: '18px',
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          Iniciar AR
            </button>
      )}
    </div>
  );
};

export default GeoAR;
