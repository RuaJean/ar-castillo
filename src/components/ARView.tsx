import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import 'aframe';
import 'aframe-ar';
import 'aframe-extras';
import 'aframe-look-at-component';
import '../styles/ARView.css';

const ARView: React.FC = () => {
  const [error, setError] = useState<string | null>(null);

  // Coordenadas del objetivo (39°28'09.4"N 0°25'53.5"W)
  const targetLat = 39.469278;
  const targetLng = -0.431528;

  useEffect(() => {
    if ('geolocation' in navigator) {
      // Obtener la ubicación actual
      navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          
          // Calcular la distancia al objetivo para posicionar el modelo
          const dx = calculateDistanceX(latitude, longitude, targetLat, targetLng);
          const dz = calculateDistanceZ(latitude, longitude, targetLat, targetLng);
          
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
  }, [targetLat, targetLng]);

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
        position="0 0 -5"
        scale="1 1 1"
        rotation="0 0 0"
        gltf-model="https://jeanrua.com/models/SantaMaria_futuro.glb">
      </a-entity>
      
      <!-- Entidad para mostrar la posición del usuario -->
      <a-sphere position="0 0 0" radius="0.5" color="red" opacity="0.7"></a-sphere>
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
      
      <Link to="/" className="back-button-ar">Volver</Link>
      
      <div dangerouslySetInnerHTML={{ __html: aframeContent }} />
    </div>
  );
};

export default ARView; 