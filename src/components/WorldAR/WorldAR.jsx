import React, { useState, useEffect } from 'react';

// Componente WorldAR
// Usa WebXR (immersive-ar) y hit-test para anclar un modelo 3D al mundo real de forma muy estable
// Compatible con Chrome/Edge Android y Safari iOS 17+

const WorldAR = () => {
  const [started, setStarted] = useState(false);
  const [error, setError] = useState(null);
  const [model, setModel] = useState('/models/car.glb');

  // Cargar 8th Wall XR Web script dinámicamente
  useEffect(() => {
    if (!started) return;

    const script = document.createElement('script');
    script.src = 'https://apps.8thwall.com/xrweb?appKey=YOUR_APP_KEY_HERE'; // ← Reemplaza con tu APP KEY
    script.async = true;
    script.onload = init8thWall;
    script.onerror = () => setError('Error cargando 8th Wall');
    document.head.appendChild(script);
  }, [started]);

  const init8thWall = () => {
    if (!window.XR8) {
      setError('8th Wall no inicializó');
      return;
    }

    // Añadimos módulos básicos y el Geo Module
    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.XrController.pipelineModule(),
      XR8.Geo.pipelineModule() // ← módulo geoespacial
    ]);

    // Cuando el pipeline arranca creamos la escena A-Frame
    XR8.addCameraPipelineModule({
      name: 'init-aframe',
      onStart: ({canvasWidth, canvasHeight}) => {
        buildScene();
      }
    });

    XR8.run({ canvas: document.getElementById('camerafeed') });
  };

  const buildScene = () => {
    // Creamos <a-scene>
    const scene = document.createElement('a-scene');
    scene.setAttribute('xrweb', ''); // 8th Wall injects camera etc.
    scene.setAttribute('embedded', '');
    scene.style.width = '100%';
    scene.style.height = '100%';

    // Entidad para el modelo, se anclará en geo-place
    const modelEl = document.createElement('a-entity');
    modelEl.setAttribute('id', 'geo-model');
    modelEl.setAttribute('gltf-model', model);
    modelEl.setAttribute('scale', '1 1 1');
    scene.appendChild(modelEl);

    document.body.appendChild(scene);

    // Colocamos el modelo en la ubicación GPS actual (a 2 m delante)
    navigator.geolocation.getCurrentPosition((pos)=>{
      const {latitude, longitude} = pos.coords;
      XR8.Geo.placeEntityAtLocation(modelEl, {latitude, longitude});
    }, (e)=>{
      console.warn('GPS error', e);
    }, {enableHighAccuracy:true});
  };

  const start = () => {
    if (!navigator.xr && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      setError('Este dispositivo/navegador no soporta experiencias WebAR de 8th Wall');
      return;
    }
    setStarted(true);
  };

  if (error) return <p style={{color:'red'}}>{error}</p>;

  if (!started) {
    return (
      <div style={{textAlign:'center',padding:20}}>
        <h2>Experiencia AR (8th Wall)</h2>
        <p>Reemplaza <code>YOUR_APP_KEY_HERE</code> con tu App Key.</p>
        <button onClick={start}>Iniciar AR</button>
      </div>
    );
  }

  // Canvas que 8th Wall usa para la cámara
  return <canvas id="camerafeed" style={{position:'fixed',top:0,left:0,width:'100%',height:'100%'}}></canvas>;
};

export default WorldAR; 