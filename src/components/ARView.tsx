import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import 'aframe';
import 'aframe-ar';
import 'aframe-extras';
import 'aframe-look-at-component';
import '../styles/ARView.css';
import { createObjectURLFromExternalURL } from '../services/CORSHelper';

const ARView: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [loadingModel, setLoadingModel] = useState<boolean>(false);
  const [modelURL, setModelURL] = useState<string | null>(null);

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

  // Agregamos manejo CORS para evitar problemas de bloqueo
  useEffect(() => {
    // Verificar si ya tenemos el modelo en cache
    const cachedModelURL = localStorage.getItem('modelObjectURL');
    if (cachedModelURL) {
      setModelURL(cachedModelURL);
      return;
    }

    // Si no tenemos el modelo en cache, intentamos cargarlo
    const loadModel = async () => {
      setLoadingModel(true);
      try {
        // Intentamos cargar desde URL externa primero
        const externalModelURL = "https://jeanrua.com/models/SantaMaria_futuro.glb";
        const objectURL = await createObjectURLFromExternalURL(externalModelURL);
        
        // Guardamos en localStorage para próximas visitas
        localStorage.setItem('modelObjectURL', objectURL);
        setModelURL(objectURL);
        
        // Actualizamos el modelo una vez que tenemos la URL
        setTimeout(() => {
          const model = document.querySelector('#castillo-model') as any;
          if (model) {
            model.setAttribute('gltf-model', objectURL);
          }
        }, 1000);
      } catch (e: any) {
        console.error("Falló carga externa, usando modelo local", e);
        // Si falla, usamos el modelo local
        setModelURL("/SantaMaria_futuro.glb");
      } finally {
        setLoadingModel(false);
      }
    };
    
    loadModel();
  }, []);

  // Contenido de A-Frame como HTML
  const aframeContent = `
    <a-scene 
      embedded
      arjs="sourceType: webcam; debugUIEnabled: false; detectionMode: mono_and_matrix;"
      renderer="logarithmicDepthBuffer: true; precision: medium;"
      vr-mode-ui="enabled: false">
      
      <a-assets timeout="30000">
        <a-asset-item id="castle-model" src="/SantaMaria_futuro.glb" crossorigin="anonymous"></a-asset-item>
      </a-assets>
      
      <!-- Cámara con control de gestos -->
      <a-entity camera look-controls wasd-controls position="0 1.6 0"></a-entity>
      
      <!-- Modelo 3D del Castillo -->
      <a-entity
        id="castillo-model"
        position="0 0 -5"
        scale="1 1 1"
        rotation="0 0 0"
        gltf-model="#castle-model">
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
      
      {loadingModel && (
        <div className="loading-overlay">
          <p>Cargando modelo 3D...</p>
        </div>
      )}
      
      <Link to="/" className="back-button-ar">Volver</Link>
      
      <div dangerouslySetInnerHTML={{ __html: aframeContent }} />
    </div>
  );
};

export default ARView; 