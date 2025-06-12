import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import './GeoAR.css';

const GeoAR = ({ modelPath = '/models/car.glb' }) => {
  const [isARSupported, setisARSupported] = useState(true);
  const [error, setError] = useState(null);
  const [session, setSession] = useState(null);
  const [model, setModel] = useState(null);

  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(new THREE.Scene());
  const cameraRef = useRef(new THREE.PerspectiveCamera());
  const reticleRef = useRef(null); // El indicador visual para hit-test
  const hitTestSourceRef = useRef(null);
  const hitTestSourceRequestedRef = useRef(false);

  // Cargar el modelo 3D
  useEffect(() => {
    const loader = new GLTFLoader();
    loader.load(modelPath, (gltf) => {
      const loadedModel = gltf.scene;
      loadedModel.scale.set(0.1, 0.1, 0.1); // Escala inicial
      setModel(loadedModel);
    }, undefined, (err) => {
      console.error('[AR] Error cargando el modelo:', err);
      setError('No se pudo cargar el modelo 3D.');
    });
  }, [modelPath]);

  // Verificar soporte de WebXR
  useEffect(() => {
    if (!navigator.xr) {
      setisARSupported(false);
      setError('WebXR no es compatible con este navegador.');
      return;
    }
    navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
      if (!supported) {
        setisARSupported(false);
        setError('El modo de AR inmersivo no es compatible con este dispositivo.');
      }
    });
  }, []);

  // Función para iniciar la sesión de AR
  const startAR = async () => {
    if (session) return;
    setError(null);

    try {
      const newSession = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
      });

      setSession(newSession);
      onSessionStarted(newSession);
    } catch (e) {
      console.error('[AR] Error al iniciar la sesión:', e);
      setError('No se pudo iniciar la sesión de AR. Asegúrate de haber dado permiso a la cámara.');
    }
  };

  const onSessionStarted = async (xrSession) => {
    xrSession.addEventListener('end', onSessionEnded);

    const gl = canvasRef.current.getContext('webgl', { xrCompatible: true });
    
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      context: gl,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local');
    renderer.xr.setSession(xrSession);
    rendererRef.current = renderer;
    
    // Iluminación
    const light = new THREE.AmbientLight(0xffffff, 1.5);
    sceneRef.current.add(light);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(1, 1, 1);
    sceneRef.current.add(directionalLight);
    
    // Retícula para indicar el punto de anclaje
    reticleRef.current = new THREE.Mesh(
      new THREE.RingGeometry(0.04, 0.06, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x007bff })
    );
    reticleRef.current.matrixAutoUpdate = false;
    reticleRef.current.visible = false;
    sceneRef.current.add(reticleRef.current);

    xrSession.addEventListener('select', onSelect);
    
    renderer.setAnimationLoop(onXRFrame);
  };
  
  const onSelect = () => {
    if (reticleRef.current && reticleRef.current.visible && model) {
      const clone = model.clone();
      clone.position.setFromMatrixPosition(reticleRef.current.matrix);
      sceneRef.current.add(clone);

      // Opcional: ocultar la retícula una vez que se coloca un objeto
      // reticleRef.current.visible = false;
    }
  };
  
  // El bucle de renderizado
  const onXRFrame = useCallback((time, frame) => {
    if (!frame) return;
    
    const currentSession = frame.session;
    const renderer = rendererRef.current;
    
    if (!hitTestSourceRequestedRef.current) {
      currentSession.requestReferenceSpace('viewer').then(referenceSpace => {
        currentSession.requestHitTestSource({ space: referenceSpace }).then(source => {
          hitTestSourceRef.current = source;
        });
      });
      hitTestSourceRequestedRef.current = true;
    }

    if (hitTestSourceRef.current) {
      const hitTestResults = frame.getHitTestResults(hitTestSourceRef.current);
      if (hitTestResults.length > 0) {
        const hit = hitTestResults[0];
        const referenceSpace = renderer.xr.getReferenceSpace();
        const pose = hit.getPose(referenceSpace);
        
        reticleRef.current.visible = true;
        reticleRef.current.matrix.fromArray(pose.transform.matrix);
      } else {
        reticleRef.current.visible = false;
      }
    }
    
    renderer.render(sceneRef.current, cameraRef.current);
  }, [model]);

  // Función para finalizar la sesión de AR
  const endAR = async () => {
    if (session) {
      await session.end();
    }
  };

  const onSessionEnded = () => {
    if (hitTestSourceRef.current) {
      hitTestSourceRef.current.cancel();
      hitTestSourceRef.current = null;
    }
    hitTestSourceRequestedRef.current = false;

    setSession(null);
    rendererRef.current.setAnimationLoop(null);
    rendererRef.current.dispose();
    rendererRef.current = null;
    
    // Limpiamos la escena de los modelos clonados
    const objectsToRemove = [];
    sceneRef.current.children.forEach(child => {
      if (child.isObject3D && child !== reticleRef.current && child.type !== "AmbientLight" && child.type !== "DirectionalLight") {
        objectsToRemove.push(child);
      }
    });
    objectsToRemove.forEach(child => sceneRef.current.remove(child));
  };
  
  useEffect(() => {
    return () => {
      // Limpieza al desmontar el componente
      if (session) {
        session.end();
      }
    };
  }, [session]);

  const renderInitialScreen = () => (
        <div className="geo-ar-permission">
      <div className="card">
        <h1 className="card-title">Realidad Aumentada</h1>
        <p className="card-subtitle">Ancla un modelo 3D en tu entorno utilizando la cámara de tu dispositivo.</p>
        <div className="action-buttons">
            <button
            onClick={startAR}
            className="primary-btn"
            disabled={!isARSupported || !model}
          >
            {!model ? 'Cargando modelo...' : 'Iniciar AR'}
              </button>
        </div>
        {error && <p className="error-message">{error}</p>}
          </div>
        </div>
  );

  return (
    <div ref={containerRef} className="geo-ar-container">
      {session && (
        <>
          <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, zIndex: 1 }} />
          <button onClick={endAR} className="ar-button ar-back-button" style={{ zIndex: 2 }}>
            Salir de AR
          </button>
        </>
      )}
      {!session && renderInitialScreen()}
    </div>
  );
};

export default GeoAR;
