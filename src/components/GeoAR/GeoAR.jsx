import React, { useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/*
  Componente GeoAR basado en el tutorial oficial de Google "Hello WebXR".
  - Usa WebXR + THREE.js sin depender de A-Frame ni AR.js.
  - Realiza hit-testing para permitir anclar un modelo GLTF en una superficie real.
  - Sigue de forma fiel los pasos descritos en:
    https://developers.google.com/ar/develop/webxr/hello-webxr
*/

const GeoAR = ({ modelPath = '/models/car.glb' }) => {
  const [stage, setStage] = useState('initial'); // initial | loading | started | error
  const [errorMsg, setErrorMsg] = useState('');
  const containerRef = useRef(null);

  // Variables de THREE que se necesitan en todo el ciclo de vida
  const threeRef = useRef({
    renderer: null,
    scene: null,
    camera: null,
    reticle: null,
    model: null,
    hitTestSource: null,
    referenceSpace: null,
  });

  /* =====================================================================
     Utilidades internas
  ===================================================================== */
  const showError = (msg) => {
    console.error('[AR] ', msg);
    setErrorMsg(msg);
    setStage('error');
  };

  /* =====================================================================
     Paso 1: Verificar compatibilidad y solicitar la sesión
  ===================================================================== */
  const startAR = async () => {
    if (!navigator.xr) {
      return showError('WebXR no está disponible en este navegador.');
    }

    const isSupported = await navigator.xr.isSessionSupported('immersive-ar');
    if (!isSupported) {
      return showError('Este dispositivo o navegador no soporta experiencias AR inmersivas.');
    }

    // Ya no usamos la detección por user-agent porque es poco fiable.
    // Si el dispositivo carece de ARCore, el requestSession lanzará NotSupportedError
    // y mostraremos un mensaje apropiado en el catch inferior.

    setStage('loading');
    try {
      // Intentamos primero con todas las características útiles.
      const fullOptions = {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay', 'anchors', 'plane-detection'],
        domOverlay: { root: document.body },
      };

      let session;
      try {
        session = await navigator.xr.requestSession('immersive-ar', fullOptions);
      } catch (e) {
        console.warn('[AR] Configuración completa de sesión no soportada, intentando una versión mínima.', e);
        // Si falla, intentamos la configuración mínima
        session = await navigator.xr.requestSession('immersive-ar', {
          requiredFeatures: ['hit-test'],
        });
      }

      onSessionStarted(session);
    } catch (err) {
      if (err?.name === 'NotSupportedError') {
        showError('Este dispositivo no soporta la característica "hit-test". Comprueba que "Google Play Services for AR" esté instalado y actualizado.');
      } else if (err?.name === 'NotAllowedError') {
        showError('No se concedieron permisos para la cámara.');
      } else {
        showError(err?.message || 'No se pudo iniciar la sesión de AR.');
      }
    }
  };

  /* =====================================================================
     Paso 2: Configurar THREE.js con WebXR
  ===================================================================== */
  const onSessionStarted = async (session) => {
    // 1. Crear renderer y adjuntarlo al contenedor
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.xr.enabled = true;
    renderer.autoClear = false;
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.zIndex = '9999';
    container.appendChild(renderer.domElement);
    document.body.appendChild(container);
    containerRef.current = container;

    // Hacemos transparente cualquier fondo de la página que pudiera tapar la cámara
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    const rootEl = document.getElementById('root');
    if (rootEl) rootEl.style.background = 'transparent';
    // Opcional: desactivamos eventos para evitar scroll accidental
    document.body.style.overflow = 'hidden';

    // 2. Crear la escena y la cámara
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();

    // 3. Luz ambiental simple
    scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1));

    // 4. Cargar retículo GLTF
    const loader = new GLTFLoader();
    let reticle;
    try {
      const gltf = await loader.loadAsync('https://immersive-web.github.io/webxr-samples/media/gltf/reticle/reticle.gltf');
      reticle = gltf.scene;
      reticle.visible = false;
      scene.add(reticle);
    } catch (err) {
      console.warn('[AR] No se pudo cargar el retículo GLTF, usando círculo plano.');
      const ring = new THREE.RingGeometry(0.1, 0.12, 32).rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ color: 0x00aaff });
      reticle = new THREE.Mesh(ring, mat);
      reticle.visible = false;
      scene.add(reticle);
    }

    // 5. Cargar modelo principal (coche)
    let model;
    try {
      const gltfModel = await loader.loadAsync(modelPath);
      model = gltfModel.scene;
    } catch (err) {
      return showError('No se pudo cargar el modelo 3D: ' + err.message);
    }

    // Guardamos referencias
    threeRef.current = {
      renderer,
      scene,
      camera,
      reticle,
      model,
      hitTestSource: null,
      referenceSpace: null,
    };

    // 6. Referencia local y fuente de hit-test
    const referenceSpace = await session.requestReferenceSpace('local');
    const viewerSpace = await session.requestReferenceSpace('viewer');
    const hitTestSource = await session.requestHitTestSource({ space: viewerSpace });

    threeRef.current.hitTestSource = hitTestSource;
    threeRef.current.referenceSpace = referenceSpace;

    // 7. Evento select para colocar el modelo
    session.addEventListener('select', () => {
      if (!reticle.visible) return;
      const clone = model.clone();
      clone.position.copy(reticle.position);
      clone.quaternion.copy(reticle.quaternion);
      clone.scale.setScalar(0.4); // Ajusta la escala si es necesario
      scene.add(clone);
    });

    // 8. Limpiar todo al acabar la sesión
    session.addEventListener('end', () => {
      if (containerRef.current) {
        document.body.removeChild(containerRef.current);
        containerRef.current = null;
      }
      setStage('initial');
    });

    // 9. Iniciar la sesión en el renderer
    renderer.xr.setReferenceSpaceType('local');
    renderer.xr.setSession(session);

    // 10. Animación por frame
    renderer.setAnimationLoop((time, frame) => {
      if (!frame) return;

      const { referenceSpace, hitTestSource } = threeRef.current;
      const hitTestResults = frame.getHitTestResults(hitTestSource);
      if (hitTestResults.length > 0) {
        const hit = hitTestResults[0];
        const pose = hit.getPose(referenceSpace);
        if (pose) {
          reticle.visible = true;
          reticle.matrix.fromArray(pose.transform.matrix);
          reticle.matrix.decompose(reticle.position, reticle.quaternion, reticle.scale);
        }
      } else {
        reticle.visible = false;
      }
      renderer.clearDepth();
      renderer.render(scene, camera);
    });

    setStage('started');
  };

  /* =====================================================================
     UI Helpers
  ===================================================================== */
  const renderInitialScreen = () => (
        <div className="geo-ar-permission">
      <div className="card">
        <h1 className="card-title">Realidad Aumentada</h1>
        <p className="card-subtitle">Ancla un modelo 3D en tu entorno usando la cámara.</p>
        <div className="action-buttons">
          <button onClick={startAR} className="primary-btn" disabled={stage === 'loading'}>
            {stage === 'loading' ? 'Cargando...' : 'Iniciar AR'}
              </button>
            </div>
          </div>
        </div>
  );

  const renderErrorScreen = () => (
    <div className="geo-ar-error-overlay">
      <div className="error-card">
        <h2 className="error-title">Error</h2>
        <p className="error-message">{errorMsg}</p>
        <button onClick={() => setStage('initial')} className="primary-btn">Volver</button>
          </div>
        </div>
  );

  return (
    <div className="geo-ar-container">
      {(stage === 'initial' || stage === 'loading') && renderInitialScreen()}
      {stage === 'error' && renderErrorScreen()}
    </div>
  );
};

export default GeoAR;
