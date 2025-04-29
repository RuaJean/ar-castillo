import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import '../styles/Home.css';

const Home: React.FC = () => {
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Coordenadas del objetivo (39°28'09.4"N 0°25'53.5"W)
  // Convertimos a formato decimal
  const targetLat = 39.469278;
  const targetLng = -0.431528;
  
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ latitude, longitude });
          
          // Calcular distancia al objetivo
          const dist = calculateDistance(latitude, longitude, targetLat, targetLng);
          setDistance(dist);
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
  
  // Función para calcular la distancia entre dos puntos geográficos en metros
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Radio de la Tierra en metros
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    return distance;
  };
  
  return (
    <div className="home-container">
      <h1>AR Castillo</h1>
      <p>Modelo 3D en realidad aumentada geolocalizado</p>
      
      {error && <p className="error">{error}</p>}
      
      {userLocation && (
        <div className="location-info">
          <p>Tu ubicación actual:</p>
          <p>Latitud: {userLocation.latitude.toFixed(6)}</p>
          <p>Longitud: {userLocation.longitude.toFixed(6)}</p>
          
          {distance !== null && (
            <div className="distance-info">
              <p>Distancia al modelo: {(distance / 1000).toFixed(2)} km</p>
              {distance < 100 ? (
                <p className="ready">¡Estás cerca! Puedes ver el modelo en realidad aumentada</p>
              ) : (
                <p>Debes acercarte más al punto objetivo para ver el modelo (39.469278, -0.431528)</p>
              )}
            </div>
          )}
        </div>
      )}
      
      <div className="buttons-container">
        <Link to="/ar" className="ar-button">
          Iniciar Experiencia AR
        </Link>
        
        <Link to="/ar-test" className="ar-button test-button">
          Iniciar Experiencia AR (Ubicación de prueba)
        </Link>
      </div>
    </div>
  );
};

export default Home; 