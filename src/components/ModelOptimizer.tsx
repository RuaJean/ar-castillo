import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';
import '../styles/ModelOptimizer.css'; // Crearemos este archivo de estilos

// Logger simple
const logger = {
  info: console.info,
  warn: console.warn,
  error: console.error,
};

const ModelOptimizer: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'loading' | 'optimizing' | 'exporting' | 'ready' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [originalInfo, setOriginalInfo] = useState<{ polygons: number; size: number } | null>(null);
  const [optimizedInfo, setOptimizedInfo] = useState<{ polygons: number; size: number } | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const downloadLinkRef = useRef<HTMLAnchorElement>(null);

  // --- Configuración --- 
  const originalModelUrl = '/SantaMaria_futuro.glb'; // Carga el archivo desde la carpeta public
  const optimizedFileName = 'SantaMaria_futuro_optimized.glb';
  const simplificationRatio = 0.5; // Reducir al 50% de polígonos (ajustable)
  // --- Fin Configuración ---

  const cleanupDownloadUrl = () => {
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
  };

  const handleOptimizeClick = useCallback(async () => {
    cleanupDownloadUrl();
    setStatus('loading');
    setErrorMessage(null);
    setOriginalInfo(null);
    setOptimizedInfo(null);
    setProgress(0);

    logger.info('[Optimizer] Iniciando carga del modelo original...');
    const loader = new GLTFLoader();

    try {
      const gltf = await loader.loadAsync(originalModelUrl, (xhr) => {
        if (xhr.lengthComputable) {
          const percentComplete = Math.round((xhr.loaded / xhr.total) * 100);
          setProgress(percentComplete);
        }
      });

      logger.info('[Optimizer] Modelo original cargado.');
      const originalScene = gltf.scene;
      let originalPolygonCount = 0;
      originalScene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          originalPolygonCount += (child as THREE.Mesh).geometry.attributes.position.count / 3;
        }
      });
      // Estimación inicial del tamaño (no exacto hasta exportar)
      setOriginalInfo({ polygons: Math.round(originalPolygonCount), size: 0 }); 

      setStatus('optimizing');
      logger.info('[Optimizer] Iniciando optimización (simplificación)...');
      setProgress(0); // Reset progress for optimization step

      // Clonar la escena para no modificar la original directamente
      const optimizedScene = originalScene.clone();
      const modifier = new SimplifyModifier();
      let optimizedPolygonCount = 0;
      const meshesToSimplify: THREE.Mesh[] = [];

      optimizedScene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
            meshesToSimplify.push(child as THREE.Mesh);
        }
      });

      // Aplicar simplificación (puede tardar)
      // Usamos un pequeño timeout para permitir que la UI se actualice a 'optimizing'
      await new Promise(resolve => setTimeout(resolve, 50)); 
      
      for (const mesh of meshesToSimplify) {
          const count = mesh.geometry.attributes.position.count;
          const targetCount = Math.max(10, Math.floor(count * simplificationRatio)); // No simplificar demasiado
          
          logger.info(`[Optimizer] Simplificando malla: ${count} -> ${targetCount} vértices`);
          try {
              // Crear nueva geometría simplificada
              const simplifiedGeometry = modifier.modify(mesh.geometry, targetCount);
              
              // ¡Importante! Desechar la geometría antigua para liberar memoria GPU
              mesh.geometry.dispose(); 
              
              // Asignar la nueva geometría
              mesh.geometry = simplifiedGeometry;
              
          } catch (simplifyError) {
              logger.error(`[Optimizer] Error simplificando malla específica:`, simplifyError);
              // Continuar con las otras mallas si una falla
          }
      }

      optimizedScene.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
              optimizedPolygonCount += (child as THREE.Mesh).geometry.attributes.position.count / 3;
              // Asegurar que las sombras estén desactivadas (opcional, buena práctica)
              child.castShadow = false;
              child.receiveShadow = false;
          }
      });
      
      setOptimizedInfo({ polygons: Math.round(optimizedPolygonCount), size: 0 });
      logger.info('[Optimizer] Simplificación completada.');

      setStatus('exporting');
      logger.info('[Optimizer] Iniciando exportación a GLB...');

      const exporter = new GLTFExporter();
      exporter.parse(
        optimizedScene,
        (result) => {
          if (result instanceof ArrayBuffer) {
            logger.info('[Optimizer] Exportación GLB completada.');
            const blob = new Blob([result], { type: 'model/gltf-binary' });
            const url = URL.createObjectURL(blob);
            setDownloadUrl(url);
            setOptimizedInfo(prev => prev ? { ...prev, size: blob.size } : { polygons: 0, size: blob.size });
            setStatus('ready');
          } else {
            throw new Error('El resultado de la exportación no fue un ArrayBuffer');
          }
        },
        (error) => {
          logger.error('[Optimizer] Error durante la exportación:', error);
          setErrorMessage('Error durante la exportación del modelo.');
          setStatus('error');
        },
        { binary: true } // Opciones para exportar como GLB
      );

    } catch (error) {
      logger.error('[Optimizer] Error en el proceso:', error);
      setErrorMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
      setStatus('error');
    }
  }, [downloadUrl]); // Depende de downloadUrl para limpieza

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      cleanupDownloadUrl();
    };
  }, []);

  return (
    <div className="model-optimizer-container">
      <h1>Optimizador de Modelos GLB</h1>
      <p>Esta herramienta carga el modelo <code>{originalModelUrl}</code>, lo simplifica y permite descargarlo.</p>
      <p><strong>Instrucciones:</strong></p>
      <ol>
        <li>Haz clic en "Iniciar Optimización".</li>
        <li>Espera a que el proceso termine (puede tardar varios minutos en modelos grandes).</li>
        <li>Haz clic en "Descargar Modelo Optimizado".</li>
        <li>Sube el archivo descargado (<code>{optimizedFileName}</code>) a la carpeta <code>public</code> de tu servidor, reemplazando el original si usas el mismo nombre, o actualiza las URLs en el código.</li>
      </ol>

      <button onClick={handleOptimizeClick} disabled={status === 'loading' || status === 'optimizing' || status === 'exporting'}>
        {status === 'loading' && 'Cargando...'}
        {status === 'optimizing' && 'Optimizando...'}
        {status === 'exporting' && 'Exportando...'}
        {(status === 'idle' || status === 'ready' || status === 'error') && 'Iniciar Optimización'}
      </button>

      {status === 'loading' && <div className="progress-bar"><div style={{ width: `${progress}%` }}></div></div>}
      
      <div className="status-section">
        <h2>Estado: {status.toUpperCase()}</h2>
        {originalInfo && (
          <div className="info-box original">
            <h3>Original</h3>
            <p>Polígonos: {originalInfo.polygons.toLocaleString()}</p>
            {/* <p>Tamaño Estimado: {formatBytes(originalInfo.size)}</p> */}
          </div>
        )}
        {optimizedInfo && (
          <div className="info-box optimized">
            <h3>Optimizado</h3>
            <p>Polígonos: {optimizedInfo.polygons.toLocaleString()} (Ratio: {simplificationRatio})</p>
            {optimizedInfo.size > 0 && <p>Tamaño Archivo: {formatBytes(optimizedInfo.size)}</p>}
          </div>
        )}
        {errorMessage && <p className="error-message">Error: {errorMessage}</p>}
      </div>

      {status === 'ready' && downloadUrl && (
        <a
          ref={downloadLinkRef}
          href={downloadUrl}
          download={optimizedFileName}
          className="download-button"
        >
          Descargar Modelo Optimizado
        </a>
      )}
      
      <Link to="/" className="back-link">Volver al Inicio</Link>
    </div>
  );
};

// Función auxiliar para formatear bytes (copiada de ARViewTest)
const formatBytes = (bytes: number, decimals = 2) => {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export default ModelOptimizer; 