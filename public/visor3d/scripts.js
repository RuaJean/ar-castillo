// Variables globales
let camera, scene, renderer, controls, model, raycaster, directionalLight, ambientLight;
let measuring = false; // Estado de la herramienta de medición
let wireframeMode = false; // Modo alambrado
let autoRotate = true; // Estado de auto-rotación
let points = []; // Puntos seleccionados para medición
let pointMeshes = []; // Almacena los puntos de medición visuales
let line; // Línea de medición
let planes = []; // Planos de corte
let planeHelper; // Ayuda visual para el plano de corte
let axesHelper, axesCamera, axesRenderer, axesControls; // Ejes de coordenadas
let config = {}; // Almacena la configuración del CSV
let visorIniciado = false; // Indica si el visor ya se ha iniciado
let isLoading = false; // Estado de carga del modelo
let modeloActual = null; // Modelo "Actual" para la comparación
let modeloFuturo = null; // Modelo "Futuro" para la comparación
let modoComparacion = false; // Indica si estamos en modo comparación
let lineaDivisoria = null; // Línea divisoria para la comparación
let planoCorte = null; // Plano de corte para la comparación
let valorSliderActual = 50; // Valor actual del slider para mantener consistencia

// URLs de los modelos para comparación
const URL_MODELO_ACTUAL = 'https://jeanrua.com/models/SantaMaria_actual.glb';
const URL_MODELO_FUTURO = 'https://jeanrua.com/models/SantaMaria_futuro.glb';

// URLs de fallback (modelos locales)
const URL_MODELO_ACTUAL_FALLBACK = '/models/oro.glb';  // Usar el modelo de oro como fallback
const URL_MODELO_FUTURO_FALLBACK = '/models/oro.glb';  // Usar el modelo de oro como fallback

// Límites de zoom
const minZoom = 0.02; // Mínimo valor de zoom (cercanía máxima)
const maxZoom = 1.0; // Máximo valor de zoom (lejanía máxima)

// Temporizador para detección de inactividad
let inactivityTimer;
const inactivityTimeout = 10000; // 10 segundos

// Diccionario de configuración para cada pieza
const piezasConfig = {
    oro: {
        titulo: "Lingote de Oro Museo Santiago",
        imagen: "https://img-360dielmo.s3.eu-west-1.amazonaws.com/2024/castros/lingote/inicial_lingote.png",
        modelo: 'oro.glb'
    },
    // plata: {
    //     titulo: "Lingote de Plata Museo Santiago",
    //     imagen: "https://img-360dielmo.s3.eu-west-1.amazonaws.com/2024/castros/lingote/inicial_plata.png",
    //     modelo: "plata.glb"
    // },
    'https://jeanrua.com/models/SantaMaria_actual.glb': {
        titulo: "Santa María (Actual)",
        imagen: "https://img-360dielmo.s3.eu-west-1.amazonaws.com/2024/castros/lingote/inicial_lingote.png", // Puedes actualizar con la imagen correcta
        modelo: 'https://jeanrua.com/models/SantaMaria_actual.glb'
    },
    'https://jeanrua.com/models/SantaMaria_futuro.glb': {
        titulo: "Santa María (Futuro)",
        imagen: "https://img-360dielmo.s3.eu-west-1.amazonaws.com/2024/castros/lingote/inicial_lingote.png", // Puedes actualizar con la imagen correcta
        modelo: 'https://jeanrua.com/models/SantaMaria_futuro.glb'
    },
    'comparar': {
        titulo: "Santa María - Comparativa",
        imagen: "https://img-360dielmo.s3.eu-west-1.amazonaws.com/2024/castros/lingote/inicial_lingote.png", // Puedes actualizar con la imagen correcta
        modelo: 'comparar'
    }
};

// Función para mostrar/ocultar el indicador de carga
function toggleLoadingIndicator(show) {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (show) {
        loadingOverlay.style.display = 'flex';
        isLoading = true;
    } else {
        // Usar setTimeout para una transición suave
        loadingOverlay.style.opacity = '0';
        setTimeout(() => {
            loadingOverlay.style.display = 'none';
            loadingOverlay.style.opacity = '1';
            isLoading = false;
        }, 500);
    }
}

// Función para obtener el valor de un parámetro de la URL
function obtenerParametroDeURL(nombre) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(nombre);
}

// Usar el parámetro "modelo" para definir la configuración de la pieza
const modeloParam = obtenerParametroDeURL("modelo");
const piezaConfig = piezasConfig[modeloParam] || piezasConfig.oro; // Usa oro como predeterminado

// Actualizar el título y la imagen de inicio
document.title = piezaConfig.titulo;
document.getElementById('preview-img').src = piezaConfig.imagen;

// Modificamos para usar el modelo local pasado por parámetro o el predeterminado
let modeloURL;
const modelParam = obtenerParametroDeURL("model");
if (modelParam) {
    // Si tenemos un parámetro model en la URL, comprobamos si es una URL absoluta o relativa
    if (modelParam.startsWith('http://') || modelParam.startsWith('https://')) {
        // Si es una URL absoluta, la usamos directamente
        modeloURL = modelParam;
    } else {
        // Si es una ruta relativa, añadimos la barra inicial
        modeloURL = `/${modelParam}`;
    }
    console.log(`Usando modelo desde parámetro URL: ${modeloURL}`);
} else {
    // Si no, usamos la URL externa configurada
    modeloURL = `https://img-360dielmo.s3.eu-west-1.amazonaws.com/2024/castros/lingote/${piezaConfig.modelo}`;
    console.log(`Usando modelo desde URL externa: ${modeloURL}`);
}

// Asegurarse de que el DOM esté listo antes de asignar eventos
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('entrar-btn').addEventListener('click', function() {
        document.getElementById('preview').style.display = 'none';
        document.getElementById('container').style.display = 'block';
        iniciarVisor3D();
        animarAproximacion(); // Llama a la función para animar la cámara
        iniciarAutoRotacion();
    });

    document.getElementById('container').addEventListener('mousemove', detenerAutoRotacion);
    document.getElementById('container').addEventListener('mousedown', detenerAutoRotacion);
    document.getElementById('container').addEventListener('wheel', detenerAutoRotacion);
    
    // Configurar el selector de modelos
    configurarSelectorModelos();
    
    // Configurar el slider de comparación
    configurarSliderComparacion();
});

// Función para configurar el selector de modelos
function configurarSelectorModelos() {
    // Establecer el valor inicial del selector según el modelo actual
    const selectorModelo = document.getElementById('modelo-select');
    
    // Si tenemos un modelo en la URL, seleccionarlo en el dropdown
    if (modelParam) {
        // Intentar encontrar la opción correspondiente
        for (let i = 0; i < selectorModelo.options.length; i++) {
            if (selectorModelo.options[i].value === modelParam) {
                selectorModelo.selectedIndex = i;
                break;
            }
        }
    }
    
    // Añadir el evento al botón de cambiar modelo - CORREGIDO: ahora usamos una función anónima para evitar que se pase el evento como parámetro
    document.getElementById('cambiar-modelo-btn').addEventListener('click', function() {
        cambiarModelo();
    });
}

// Configurar el slider de comparación
function configurarSliderComparacion() {
    const slider = document.getElementById('comparar-slider');
    const sliderContainer = document.querySelector('.slider-container');
    
    // Añadir elemento visual para la línea divisoria en el slider
    if (sliderContainer && !document.querySelector('.slider-line')) {
        const lineaVisual = document.createElement('div');
        lineaVisual.className = 'slider-line';
        lineaVisual.style.position = 'absolute';
        lineaVisual.style.top = '0';
        lineaVisual.style.bottom = '0';
        lineaVisual.style.width = '2px';
        lineaVisual.style.backgroundColor = '#ffff00';
        lineaVisual.style.left = '50%'; // Posición inicial en el centro
        lineaVisual.style.zIndex = '10';
        lineaVisual.style.pointerEvents = 'none';
        sliderContainer.appendChild(lineaVisual);
    }
    
    slider.addEventListener('input', function() {
        if (modoComparacion) {
            const valorSlider = parseInt(slider.value);
            actualizarComparacion(valorSlider);
        }
    });
}

// Actualizar la visualización de los modelos según el valor del slider
function actualizarComparacion(valor) {
    // Normalizar valor a un rango de 0-1
    const mixFactor = valor / 100;
    
    // Guardar el valor actual para actualizaciones futuras
    valorSliderActual = valor;
    
    // Si no tenemos ambos modelos, no hacemos nada
    if (!modeloActual && !modeloFuturo) return;
    
    // IMPORTANTE: Primero actualizar planos de corte y después la línea visual
    // para asegurar que estén perfectamente alineados
    actualizarPlanosCorte(valor);
    
    // Crear o actualizar la línea divisoria en pantalla
    // Usar exactamente el mismo valor para alinear perfectamente
    actualizarLineaDivisoria(mixFactor);
}

// Función para crear/actualizar la línea divisoria visual
function actualizarLineaDivisoria(posicion) {
    // Eliminar línea anterior si existe en la escena 3D
    if (lineaDivisoria) {
        scene.remove(lineaDivisoria);
    }
    
    // Crear una línea vertical 3D que divida la pantalla basada en la orientación de la cámara
    const material = new THREE.LineBasicMaterial({ 
        color: 0x3498db, // Azul más profesional
        linewidth: 3,
        depthTest: false,  // Asegura que la línea siempre sea visible
        transparent: true,
        opacity: 0.9
    });
    
    // Obtener la orientación de la cámara
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    
    // Obtener el vector perpendicular a la dirección de la cámara (en el plano horizontal)
    const perpendicular = new THREE.Vector3(-cameraDirection.z, 0, cameraDirection.x).normalize();
    
    // Calcular posición X de la línea basada en el porcentaje del slider (0-100)
    // Mapear el valor del slider a un rango que coincida EXACTAMENTE con los planos de corte
    let offsetFactor;
    if (posicion <= 0.05) {
        offsetFactor = -20;
    } else if (posicion >= 0.95) {
        offsetFactor = 20;
    } else {
        // Usar exactamente la misma fórmula que en actualizarPlanosCorte
        const normalizedPos = (posicion - 0.05) / 0.9;
        offsetFactor = -20 + normalizedPos * 40;
    }
    
    // Calcular la distancia apropiada para la línea - usar los mismos cálculos que para los planos
    const distanceToCenter = camera.position.distanceTo(new THREE.Vector3(0, 0, 0));
    
    // Calcular punto central de la línea (frente a la cámara)
    const centerPoint = new THREE.Vector3().copy(camera.position).addScaledVector(cameraDirection, 2);
    // Desplazar según el valor del slider y distancia - IGUAL que en actualizarPlanosCorte
    centerPoint.addScaledVector(perpendicular, offsetFactor * (distanceToCenter/5));
    
    // Hacer que la línea sea más alta basándose en la distancia a la cámara
    const verticalOffset = Math.max(distanceToCenter * 2, 10);
    
    // Crear puntos para una línea vertical que siga la orientación de la cámara
    const points = [];
    points.push(new THREE.Vector3(
        centerPoint.x, 
        centerPoint.y + verticalOffset, 
        centerPoint.z
    ));
    
    points.push(new THREE.Vector3(
        centerPoint.x, 
        centerPoint.y - verticalOffset, 
        centerPoint.z
    ));
    
    // Crear geometría y línea
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    lineaDivisoria = new THREE.Line(geometry, material);
    lineaDivisoria.renderOrder = 999; // Renderizar al final para asegurar visibilidad
    
    // Añadir la línea a la escena
    scene.add(lineaDivisoria);
    
    // Actualizar también la línea deslizante en la UI
    const sliderLine = document.querySelector('.slider-line');
    if (sliderLine) {
        sliderLine.style.left = `${posicion * 100}%`;
    }
    
    // Actualizar o crear línea divisoria DOM para mayor visibilidad
    actualizarLineaDivisoriaDOM(posicion);
}

// Actualizar la línea divisoria DOM siguiendo la dirección de la cámara
function actualizarLineaDivisoriaDOM(posicion) {
    let divisorDOM = document.querySelector('.divisor-3d');
    
    // Crear el divisor DOM si no existe
    if (!divisorDOM) {
        divisorDOM = document.createElement('div');
        divisorDOM.className = 'divisor-3d';
        document.getElementById('container').appendChild(divisorDOM);
        
        // Añadir etiquetas a los lados del divisor con nuevo estilo
        if (!divisorDOM.querySelector('.divisor-label-actual')) {
            const labelActual = document.createElement('div');
            labelActual.className = 'divisor-label-actual';
            labelActual.textContent = '';
            labelActual.style.position = 'absolute';
            labelActual.style.left = '-65px'; // Aumentado para mayor separación
            labelActual.style.top = '20px';
            labelActual.style.transform = 'translateY(0)';
            labelActual.style.color = '#2196F3'; // Azul moderno
            labelActual.style.fontWeight = 'bold';
            labelActual.style.fontSize = '10px';
            labelActual.style.padding = '4px 8px';
            labelActual.style.background = 'rgba(0, 0, 0, 0.6)';
            labelActual.style.borderRadius = '3px';
            labelActual.style.letterSpacing = '1px';
            labelActual.style.fontFamily = 'Arial, sans-serif';
            labelActual.style.textShadow = '0 1px 2px rgba(0, 0, 0, 0.8)';
            divisorDOM.appendChild(labelActual);
            
            const labelFuturo = document.createElement('div');
            labelFuturo.className = 'divisor-label-futuro';
            labelFuturo.textContent = '';
            labelFuturo.style.position = 'absolute';
            labelFuturo.style.right = '-65px'; // Aumentado para mayor separación
            labelFuturo.style.top = '20px';
            labelFuturo.style.transform = 'translateY(0)';
            labelFuturo.style.color = '#4CAF50'; // Verde moderno
            labelFuturo.style.fontWeight = 'bold';
            labelFuturo.style.fontSize = '10px';
            labelFuturo.style.padding = '4px 8px';
            labelFuturo.style.background = 'rgba(0, 0, 0, 0.6)';
            labelFuturo.style.borderRadius = '3px';
            labelFuturo.style.letterSpacing = '1px';
            labelFuturo.style.fontFamily = 'Arial, sans-serif';
            labelFuturo.style.textShadow = '0 1px 2px rgba(0, 0, 0, 0.8)';
            divisorDOM.appendChild(labelFuturo);
        }
    }
    
    // Actualizar posición de la línea basada en el valor del slider
    const leftPos = posicion * 100;
    divisorDOM.style.left = `${leftPos}%`;
}

// Función para actualizar los planos de corte para ambos modelos según la orientación de la cámara
function actualizarPlanosCorte(posicion) {
    // Obtener la orientación actual de la cámara
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    
    // Vector perpendicular a la dirección de la cámara (en el plano horizontal)
    // Este será el vector normal de nuestro plano de corte
    const planeNormal = new THREE.Vector3(-cameraDirection.z, 0, cameraDirection.x).normalize();
    
    // Calcular la posición del plano basada en el valor del slider
    // Mapear de 0-100 a una función que abarque todo el espacio visual
    // Con un rango más amplio para asegurar que cada extremo muestre un modelo completo
    let offsetFactor;
    
    // Función para mapear el valor del slider a un factor de desplazamiento
    // Aseguramos consistencia matemática exacta con la función de la línea divisoria
    if (posicion <= 5) {
        // Para valores en el extremo izquierdo (0-5%) - modelo actual completamente visible
        offsetFactor = -20;
    } else if (posicion >= 95) {
        // Para valores en el extremo derecho (95-100%) - modelo futuro completamente visible
        offsetFactor = 20;
    } else {
        // Para valores intermedios, mapear de forma más gradual
        // Fórmula idéntica a la usada en actualizarLineaDivisoria
        const normalizedPos = (posicion - 5) / 90; // Normalizar de 0 a 1
        offsetFactor = -20 + normalizedPos * 40;
    }
    
    // Obtener el centro de la cámara (punto hacia donde mira) - igual que en actualizarLineaDivisoria
    const centerPoint = new THREE.Vector3().copy(camera.position).addScaledVector(cameraDirection, 2);
    
    // Calcular qué tan lejos deben estar los planos de corte
    // Usar la distancia entre la cámara y el centro de la escena para escalar adecuadamente
    const distanceToCenter = camera.position.distanceTo(new THREE.Vector3(0, 0, 0));
    
    // Desplazar el punto de corte según el valor del slider y la distancia calculada
    // Usar exactamente la misma fórmula que en actualizarLineaDivisoria
    centerPoint.addScaledVector(planeNormal, offsetFactor * (distanceToCenter/5));
    
    // Para el plano izquierdo (modelo actual)
    const planoIzquierdo = new THREE.Plane().setFromNormalAndCoplanarPoint(
        planeNormal.clone().negate(), // Invertir la normal para el lado izquierdo
        centerPoint
    );
    
    // Para el plano derecho (modelo futuro)
    const planoDerecho = new THREE.Plane().setFromNormalAndCoplanarPoint(
        planeNormal.clone(),
        centerPoint
    );
    
    // Actualizar los clipping planes para cada modelo
    if (modeloActual) {
        modeloActual.traverse((child) => {
            if (child.isMesh) {
                // Verificar si ya tiene un material con clipping
                if (!child.material.clippingPlanes || child.material.clippingPlanes.length === 0) {
                    // Crear nuevo material con clipping
                    const props = {
                        map: child.material.map || null,
                        color: child.material.color ? child.material.color.getHex() : 0xffffff,
                        side: THREE.DoubleSide,
                        transparent: false,
                        opacity: 1.0,
                        clippingPlanes: [planoIzquierdo],
                        clipIntersection: false
                    };
                    
                    // Crear nuevo material manteniendo propiedades originales
                    const nuevoMaterial = new THREE.MeshStandardMaterial(props);
                    
                    // Guardar material original si aún no lo hemos hecho
                    if (!child.userData.originalMaterial) {
                        child.userData.originalMaterial = child.material;
                    }
                    
                    // Asignar nuevo material
                    child.material = nuevoMaterial;
                } else {
                    // Actualizar el plano de recorte existente
                    child.material.clippingPlanes[0].copy(planoIzquierdo);
                }
                
                // Forzar actualización del material
                child.material.needsUpdate = true;
            }
        });
    }
    
    if (modeloFuturo) {
        modeloFuturo.traverse((child) => {
            if (child.isMesh) {
                // Verificar si ya tiene un material con clipping
                if (!child.material.clippingPlanes || child.material.clippingPlanes.length === 0) {
                    // Crear nuevo material con clipping
                    const props = {
                        map: child.material.map || null,
                        color: child.material.color ? child.material.color.getHex() : 0xffffff,
                        side: THREE.DoubleSide,
                        transparent: false,
                        opacity: 1.0,
                        clippingPlanes: [planoDerecho],
                        clipIntersection: false
                    };
                    
                    // Crear nuevo material manteniendo propiedades originales
                    const nuevoMaterial = new THREE.MeshStandardMaterial(props);
                    
                    // Guardar material original si aún no lo hemos hecho
                    if (!child.userData.originalMaterial) {
                        child.userData.originalMaterial = child.material;
                    }
                    
                    // Asignar nuevo material
                    child.material = nuevoMaterial;
                } else {
                    // Actualizar el plano de recorte existente
                    child.material.clippingPlanes[0].copy(planoDerecho);
                }
                
                // Forzar actualización del material
                child.material.needsUpdate = true;
            }
        });
    }
    
    // Actualizar la línea divisoria DOM para que cubra todo el alto del canvas
    const divisorDOM = document.querySelector('.divisor-3d');
    if (divisorDOM) {
        divisorDOM.style.left = `${posicion}%`;
        divisorDOM.style.top = '0';
        divisorDOM.style.bottom = '0';
        divisorDOM.style.height = '100%';
        
        // Actualizar visibilidad de las etiquetas según la posición del slider
        const labelActual = divisorDOM.querySelector('.divisor-label-actual');
        const labelFuturo = divisorDOM.querySelector('.divisor-label-futuro');
        
        if (labelActual && labelFuturo) {
            // Etiqueta ACTUAL (izquierda)
            if (posicion < 10) {
                labelActual.style.opacity = '0.2'; // Casi invisible cuando el slider está al extremo izquierdo
            } else if (posicion < 30) {
                labelActual.style.opacity = '0.7'; // Parcialmente visible
            } else {
                labelActual.style.opacity = '1'; // Completamente visible
            }
            
            // Etiqueta FUTURO (derecha)
            if (posicion > 90) {
                labelFuturo.style.opacity = '0.2'; // Casi invisible cuando el slider está al extremo derecho
            } else if (posicion > 70) {
                labelFuturo.style.opacity = '0.7'; // Parcialmente visible
            } else {
                labelFuturo.style.opacity = '1'; // Completamente visible
            }
        }
    }
}

// Intentar cargar primero desde la URL remota, y si falla, usar el fallback
function cargarModeloConFallback(urlPrimaria, urlFallback, onSuccess, onProgress, onError) {
    const loader = new THREE.GLTFLoader();
    
    // Validar que las URLs sean strings
    if (typeof urlPrimaria !== 'string') {
        console.error('URL primaria inválida:', urlPrimaria);
        urlPrimaria = '/models/oro.glb'; // Usar un valor por defecto
    }
    
    if (typeof urlFallback !== 'string') {
        console.error('URL fallback inválida:', urlFallback);
        urlFallback = '/models/oro.glb'; // Usar un valor por defecto
    }
    
    try {
        // Intentar cargar desde URL primaria
        loader.load(
            urlPrimaria,
            onSuccess,
            onProgress,
            (error) => {
                console.warn(`Error al cargar desde URL primaria (${urlPrimaria}), intentando fallback:`, error);
                
                try {
                    // Si falla, intentar con el fallback
                    loader.load(
                        urlFallback,
                        onSuccess,
                        onProgress,
                        (fallbackError) => {
                            console.error(`Error al cargar fallback (${urlFallback}):`, fallbackError);
                            // Si también falla el fallback, llamar al callback de error original
                            if (typeof onError === 'function') {
                                onError(fallbackError);
                            }
                        }
                    );
                } catch (criticalError) {
                    console.error('Error crítico al cargar el modelo fallback:', criticalError);
                    if (typeof onError === 'function') {
                        onError(criticalError);
                    }
                }
            }
        );
    } catch (criticalError) {
        console.error('Error crítico al intentar cargar el modelo principal:', criticalError);
        if (typeof onError === 'function') {
            onError(criticalError);
        }
    }
}

// Función para activar el modo comparación
function activarModoComparacion() {
    modoComparacion = true;
    document.getElementById('comparar-container').style.display = 'flex';
    
    // Ocultar el modelo actual si existe
    if (model) {
        scene.remove(model);
    }
    
    // Mostrar indicador de carga
    toggleLoadingIndicator(true);
    
    // Asegurarse de que el renderer tenga clipping habilitado
    if (renderer) {
        renderer.localClippingEnabled = true;
    }
    
    // Contador para seguir la carga de ambos modelos
    let modelosCargados = 0;
    
    // Configuración para optimizar los modelos pesados
    const configuracionDetalleModelos = {
        actual: { cargado: false, modelo: null },
        futuro: { cargado: false, modelo: null }
    };
    
    // Añadir temporizadores para cancelar cargas excesivamente largas
    let timerActual = setTimeout(() => {
        console.error("Tiempo excedido al cargar el modelo actual");
        modelosCargados++;
        checkLoadingComplete();
    }, 3000000); // 30 segundos de tiempo límite
    
    let timerFuturo = setTimeout(() => {
        console.error("Tiempo excedido al cargar el modelo futuro");
        modelosCargados++;
        checkLoadingComplete();
    }, 30000); // 30 segundos de tiempo límite
    
    // Función para verificar cuando ambos modelos estén cargados
    function checkLoadingComplete() {
        if (modelosCargados >= 2) {
            // Ambos modelos están cargados o han fallado
            toggleLoadingIndicator(false);
            
            const sliderContainer = document.getElementById('comparar-container');
            const sliderLabel = document.querySelector('.slider-labels');
            
            // Si tenemos al menos un modelo, mostramos el slider
            if (modeloActual || modeloFuturo) {
                sliderContainer.style.display = 'flex';
                document.getElementById('comparar-slider').value = 50;
                
                // Si solo tenemos uno de los modelos, actualizar etiquetas
                if (!modeloActual) {
                    const labels = sliderLabel.querySelectorAll('span');
                    if (labels.length >= 2) {
                        labels[0].innerHTML = '<strike>Actual</strike> <em>(No disponible)</em>';
                        labels[0].style.opacity = '0.5';
                    }
                }
                
                if (!modeloFuturo) {
                    const labels = sliderLabel.querySelectorAll('span');
                    if (labels.length >= 2) {
                        labels[1].innerHTML = '<strike>Futuro</strike> <em>(No disponible)</em>';
                        labels[1].style.opacity = '0.5';
                    }
                }
                
                // Inicializar la comparación con el valor medio
                actualizarComparacion(50);
            } else {
                // Si ambos modelos fallaron, mostrar mensaje y volver al modo normal
                alert("No se pudieron cargar los modelos para comparación. Intente más tarde.");
                desactivarModoComparacion();
                // Cargar el modelo predeterminado
                cambiarModelo('oro');
            }
        }
    }
    
    // Función para optimizar el modelo cargado
    function optimizarModelo(gltfScene) {
        // Reducir complejidad si es necesario
        let contadorPoligonos = 0;
        
        gltfScene.traverse((child) => {
            if (child.isMesh) {
                contadorPoligonos += child.geometry.attributes.position.count / 3;
                
                // Optimizar materiales
                child.material.transparent = true;
                
                // Desactivar sombras para mejorar rendimiento
                child.castShadow = false;
                child.receiveShadow = false;
                
                // Simplificar geometría si el modelo es muy pesado (más de 500,000 polígonos)
                if (contadorPoligonos > 500000 && child.geometry.attributes.position.count > 5000) {
                    console.log(`Optimizando geometría de modelo con ${contadorPoligonos} polígonos`);
                    
                    // Eliminar datos innecesarios para mejorar rendimiento
                    if (child.geometry.attributes.normal) {
                        child.geometry.attributes.normal.needsUpdate = true;
                    }
                    
                    if (child.geometry.attributes.uv) {
                        // Mantener UVs pero marcarlas como actualizadas
                        child.geometry.attributes.uv.needsUpdate = true;
                    }
                    
                    // Optimizar geometría
                    child.geometry.attributes.position.needsUpdate = true;
                    
                    // Liberar caché y buffers innecesarios
                    child.geometry.dispose();
                    THREE.Cache.clear();
                }
            }
        });
        
        console.log(`Modelo optimizado: ${contadorPoligonos} polígonos`);
        return gltfScene;
    }
    
    // Cargar modelo actual con fallback y optimización
    cargarModeloConFallback(
        URL_MODELO_ACTUAL,
        URL_MODELO_ACTUAL_FALLBACK,
        function (gltf) {
            // Detener el temporizador
            clearTimeout(timerActual);
            
            // Optimizar el modelo antes de agregarlo a la escena
            modeloActual = optimizarModelo(gltf.scene);
            modeloActual.scale.set(1, 1, 1);
            
            // Intentar centrar el modelo si es necesario
            centralizarModelo(modeloActual);
            
            // Añadir a la escena
            scene.add(modeloActual);
            
            // Configurar materiales
            modeloActual.traverse((child) => {
                if (child.isMesh) {
                    // Aplicar material original conservando propiedades
                    const material = new THREE.MeshStandardMaterial({
                        map: child.material.map || null,
                        color: child.material.color || 0xffffff,
                        side: THREE.DoubleSide,
                        transparent: false,
                        opacity: 1.0
                    });
                    
                    // Guardar referencia al material original para poder restaurarlo después
                    child.userData.originalMaterial = child.material;
                    
                    // Asignar nuevo material
                    child.material = material;
                    
                    // Usar niveles de detalle reducidos
                    if (child.geometry) {
                        child.frustumCulled = true; // Solo renderizar si es visible
                    }
                }
            });
            
            console.log("Modelo actual cargado correctamente.");
            
            // Liberar memoria después de procesar
            THREE.Cache.clear();
            
            modelosCargados++;
            checkLoadingComplete();
        },
        function (xhr) {
            // Solo mostrar el progreso si tenemos datos válidos
            if (xhr.total > 0) {
                const percentComplete = Math.round(xhr.loaded / xhr.total * 100);
                console.log('Modelo Actual: ' + percentComplete + '% cargado');
            }
        },
        function (error) {
            // Detener el temporizador
            clearTimeout(timerActual);
            
            console.error('Error al cargar el modelo actual:', error);
            alert("No se pudo cargar el modelo actual para la comparación. Se mostrará solo el modelo futuro si está disponible.");
            modelosCargados++;
            checkLoadingComplete();
        }
    );
    
    // Cargar modelo futuro con fallback y optimización
    cargarModeloConFallback(
        URL_MODELO_FUTURO,
        URL_MODELO_FUTURO_FALLBACK,
        function (gltf) {
            // Detener el temporizador
            clearTimeout(timerFuturo);
            
            // Optimizar el modelo antes de agregarlo a la escena
            modeloFuturo = optimizarModelo(gltf.scene);
            modeloFuturo.scale.set(1, 1, 1);
            
            // Intentar centrar el modelo si es necesario
            centralizarModelo(modeloFuturo);
            
            // Añadir a la escena
            scene.add(modeloFuturo);
            
            // Configurar materiales
            modeloFuturo.traverse((child) => {
                if (child.isMesh) {
                    // Aplicar material original conservando propiedades
                    const material = new THREE.MeshStandardMaterial({
                        map: child.material.map || null,
                        color: child.material.color || 0xffffff,
                        side: THREE.DoubleSide,
                        transparent: false,
                        opacity: 1.0
                    });
                    
                    // Guardar referencia al material original para poder restaurarlo después
                    child.userData.originalMaterial = child.material;
                    
                    // Asignar nuevo material
                    child.material = material;
                    
                    // Usar niveles de detalle reducidos
                    if (child.geometry) {
                        child.frustumCulled = true; // Solo renderizar si es visible
                    }
                }
            });
            
            console.log("Modelo futuro cargado correctamente.");
            
            // Liberar memoria después de procesar
            THREE.Cache.clear();
            
            modelosCargados++;
            checkLoadingComplete();
        },
        function (xhr) {
            // Solo mostrar el progreso si tenemos datos válidos
            if (xhr.total > 0) {
                const percentComplete = Math.round(xhr.loaded / xhr.total * 100);
                console.log('Modelo Futuro: ' + percentComplete + '% cargado');
            }
        },
        function (error) {
            // Detener el temporizador
            clearTimeout(timerFuturo);
            
            console.error('Error al cargar el modelo futuro:', error);
            alert("No se pudo cargar el modelo futuro para la comparación. Se mostrará solo el modelo actual si está disponible.");
            modelosCargados++;
            checkLoadingComplete();
        }
    );
}

// Función para desactivar el modo comparación
function desactivarModoComparacion() {
    modoComparacion = false;
    document.getElementById('comparar-container').style.display = 'none';
    
    // Eliminar la línea divisoria 3D si existe
    if (lineaDivisoria) {
        scene.remove(lineaDivisoria);
        lineaDivisoria = null;
    }
    
    // Eliminar la línea divisoria DOM si existe
    const divisorDOM = document.querySelector('.divisor-3d');
    if (divisorDOM) {
        divisorDOM.remove();
    }
    
    // Eliminar ambos modelos de la escena
    if (modeloActual) {
        scene.remove(modeloActual);
        modeloActual = null;
    }
    
    if (modeloFuturo) {
        scene.remove(modeloFuturo);
        modeloFuturo = null;
    }
    
    // Resetear plano de corte
    planoCorte = null;
}

// Función para cambiar el modelo actual
function cambiarModelo(modeloExplicito) {
    // Primero desactivar el modo comparación si estaba activo
    if (modoComparacion) {
        desactivarModoComparacion();
    }
    
    // Obtener el valor del modelo a cargar (desde argumento o desde selector)
    const nuevoModeloValor = modeloExplicito || document.getElementById('modelo-select').value;
    
    // Asegurarnos de que tenemos un string válido
    const modeloValor = String(nuevoModeloValor || '');
    
    // Verificar si debemos activar el modo comparación
    if (modeloValor === 'comparar') {
        console.log("Activando modo comparación de modelos");
        document.title = "Santa María - Comparativa";
        try {
        activarModoComparacion();
        } catch (error) {
            console.error("Error al activar el modo comparación:", error);
            toggleLoadingIndicator(false);
            alert("Hubo un error al iniciar el modo comparación. Intente más tarde.");
            // Cargar modelo de respaldo
            cambiarModelo('oro');
        }
        return;
    }
    
    // Mostrar indicador de carga
    toggleLoadingIndicator(true);
    
    // Determinar la URL del nuevo modelo
    let nuevaURL;
    try {
    if (modeloValor.startsWith('http://') || modeloValor.startsWith('https://')) {
        // Es una URL completa
        nuevaURL = modeloValor;
    } else if (piezasConfig[modeloValor]) {
        // Es una clave en nuestro diccionario de configuración
        const config = piezasConfig[modeloValor];
        if (config.modelo && typeof config.modelo === 'string' && 
            (config.modelo.startsWith('http://') || config.modelo.startsWith('https://'))) {
            nuevaURL = config.modelo;
        } else if (config.modelo && typeof config.modelo === 'string') {
            nuevaURL = `https://img-360dielmo.s3.eu-west-1.amazonaws.com/2024/castros/lingote/${config.modelo}`;
        } else {
            // Si no hay modelo válido en la configuración, usar el modelo de oro por defecto
            nuevaURL = '/models/oro.glb';
            console.warn(`Configuración de modelo inválida para ${modeloValor}, usando modelo por defecto`);
        }
    } else {
        // Si no es ninguna de las anteriores, asumimos que es una ruta relativa
        nuevaURL = `/${modeloValor}`;
    }
    
    console.log(`Cambiando a nuevo modelo: ${nuevaURL}`);
    
    // Actualizar título según el modelo
    if (piezasConfig[modeloValor]) {
        document.title = piezasConfig[modeloValor].titulo;
    }
    
    // Eliminar el modelo actual de la escena
    if (model) {
        scene.remove(model);
    }
    
    // Añadir tiempo límite para la carga
    let timerCarga = setTimeout(() => {
        console.error("Tiempo excedido al cargar el modelo");
        toggleLoadingIndicator(false);
        alert("El tiempo de carga del modelo ha excedido el límite. Intente más tarde o con otro modelo.");
    }, 30000); // 30 segundos de tiempo límite
        
        // Comprobar que tenemos una URL válida
        if (!nuevaURL || typeof nuevaURL !== 'string') {
            throw new Error(`URL inválida: ${nuevaURL}`);
        }
    
    // Cargar el nuevo modelo
    const loader = new THREE.GLTFLoader();
    
        loader.load(
            nuevaURL,
            function (gltf) {
                // Cancelar el temporizador
                clearTimeout(timerCarga);
                
                model = gltf.scene;
                model.scale.set(1, 1, 1);
                scene.add(model);

                model.traverse((child) => {
                    if (child.isMesh) {
                        child.material.transparent = false;
                        child.material.opacity = 1;
                    }
                });
                
                // Ocultar indicador de carga
                toggleLoadingIndicator(false);
                
                // Restablecer la vista para el nuevo modelo
                resetView();
            },
            // Callback de progreso
            function (xhr) {
                if (xhr.total > 0) {
                    const percentComplete = Math.round(xhr.loaded / xhr.total * 100);
                    console.log(percentComplete + '% cargado');
                    // Opcionalmente, podrías actualizar el texto del loader aquí
                    // document.querySelector('.loading-text').textContent = `Cargando modelo 3D... ${Math.round(percentComplete)}%`;
                }
            },
            function (error) {
                // Cancelar el temporizador
                clearTimeout(timerCarga);
                
                console.error('Error al cargar el nuevo modelo:', error);
                toggleLoadingIndicator(false); // Ocultar indicador incluso en caso de error
                alert("No se pudo cargar el modelo seleccionado. Verifica que la URL es correcta.");
                
                // Cargar modelo de respaldo en caso de error
                if (modeloValor !== 'oro') {
                    console.log("Cargando modelo de respaldo 'oro'");
                    cambiarModelo('oro');
                }
            }
        );
    } catch (error) {
        // Capturar errores al intentar cargar
        console.error('Error crítico al intentar cargar el modelo:', error);
        toggleLoadingIndicator(false);
        alert("Error crítico al intentar cargar el modelo. Por favor, intente con otro modelo.");
        
        // Cargar modelo de respaldo en caso de error
        if (modeloValor !== 'oro') {
            console.log("Cargando modelo de respaldo 'oro'");
            cambiarModelo('oro');
        }
    }
}

// Función para restablecer la vista
function resetView() {
    camera.position.set(
        config.cameraInitialPositionX || 0.1,
        config.cameraInitialPositionY || 0.1,
        config.cameraInitialPositionZ || 0.1
    );
    camera.lookAt(0, 0, 0);
    controls.update();
}

function animarAproximacion() {
    const startPosition = new THREE.Vector3(0, 0, 5); // Posición inicial (lejos del modelo)
    const targetPosition = new THREE.Vector3(
        config.cameraInitialPositionX || 0.1,
        config.cameraInitialPositionY || 0.1,
        config.cameraInitialPositionZ || 0.1
    ); // Posición objetivo (cercana al modelo)
    
    const duration = 2000; // Duración en milisegundos
    let startTime = null;

    function animate(time) {
        if (!startTime) startTime = time;
        const elapsed = time - startTime;
        const t = Math.min(elapsed / duration, 1); // Normalizar el tiempo a [0, 1]

        // Interpolación entre posición inicial y objetivo
        camera.position.lerpVectors(startPosition, targetPosition, t);
        camera.lookAt(0, 0, 0); // Mantener la cámara mirando hacia el modelo

        if (t < 1) {
            requestAnimationFrame(animate);
        } else {
            controls.update(); // Actualizar controles después de la animación
        }
    }
    requestAnimationFrame(animate);
}

function iniciarVisor3D() {
    // Evitar inicializar múltiples veces
    if (visorIniciado) return;
    visorIniciado = true;
    
    // Mostrar indicador de carga
    toggleLoadingIndicator(true);
    
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setClearColor(0xffffff);
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    // Habilitar recorte de planos
    renderer.localClippingEnabled = true;
    
    document.getElementById('container').appendChild(renderer.domElement);

    ambientLight = new THREE.AmbientLight(0xffffff, config.ambientLightIntensity || 1);
    scene.add(ambientLight);

    directionalLight = new THREE.DirectionalLight(0xffffff, config.directionalLightIntensity || 0.9);
    directionalLight.position.set(5, 5, 5).normalize();
    scene.add(directionalLight);

    toggleControls(false);

    const loader = new THREE.GLTFLoader();
    loader.load(
        modeloURL,
        function (gltf) {
            model = gltf.scene;
            model.scale.set(1, 1, 1);
            scene.add(model);

            model.traverse((child) => {
                if (child.isMesh) {
                    child.material.transparent = false;
                    child.material.opacity = 1;
                }
            });

            // Ocultar indicador de carga
            toggleLoadingIndicator(false);
            toggleControls(true);
        },
        // Callback de progreso
        function (xhr) {
            if (xhr.total > 0) {
                const percentComplete = xhr.loaded / xhr.total * 100;
                console.log(percentComplete + '% cargado');
                // Opcionalmente, podrías actualizar el texto del loader aquí
                // document.querySelector('.loading-text').textContent = `Cargando modelo 3D... ${Math.round(percentComplete)}%`;
            }
        },
        function (error) {
            console.error('Error al cargar el modelo:', error);
            toggleLoadingIndicator(false); // Ocultar indicador incluso en caso de error
            alert("No se pudo cargar el modelo. Verifica que la URL es correcta.");
        }
    );

    camera.position.set(
        config.cameraInitialPositionX || 0.1,
        config.cameraInitialPositionY || 0.1,
        config.cameraInitialPositionZ || 0.1
    );
    camera.lookAt(0, 0, 0);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    iniciarEjesCoordenados();

    function animate() {
        requestAnimationFrame(animate);

        if (autoRotate && model) {
            model.rotation.y += 0.001;
        }
        
        // Rotación sincronizada para los modelos en modo comparación
        if (autoRotate && modoComparacion && modeloActual && modeloFuturo) {
            modeloActual.rotation.y += 0.001;
            modeloFuturo.rotation.y += 0.001;
            
            // Actualizar la línea divisoria y los planos de corte cuando rota automáticamente
            if (modoComparacion && (modeloActual || modeloFuturo)) {
                actualizarComparacion(valorSliderActual);
            }
        }

        if (camera && scene) {
            // Detectar si la cámara se ha movido o rotado
            if (controls && controls.update) {
            controls.update();
                
                // Actualizar la línea divisoria y los planos de corte si estamos en modo comparación
                if (modoComparacion && (modeloActual || modeloFuturo)) {
                    actualizarComparacion(valorSliderActual);
                }
            }
            
            renderer.render(scene, camera);
            if (axesRenderer && axesHelper) {
                axesRenderer.render(axesHelper, axesCamera);
            }
            actualizarEjes();
        }
    }
    animate();

    window.addEventListener('resize', () => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    });
}

function actualizarEjes() {
    if (axesCamera && camera) {
        // Copiar solo la rotación de la cámara principal a la cámara de los ejes
        axesCamera.quaternion.copy(camera.quaternion);
    }
}

function iniciarAutoRotacion() {
    autoRotate = true;
    document.getElementById('auto-rotate-tool').innerHTML = "Detener Auto-rotación";
}

function detenerAutoRotacion() {
    autoRotate = false;
    document.getElementById('auto-rotate-tool').innerHTML = "Iniciar Auto-rotación";
    clearTimeout(inactivityTimer);
    iniciarTemporizadorInactividad();
}

function toggleControls(enabled) {
    const buttons = document.querySelectorAll('.control-btn, .tool-btn');
    buttons.forEach(button => {
        button.disabled = !enabled;
    });
    if (enabled) {
        configurarControles();
        configurarHerramientas();
        configurarVistas();
    }
}

function iniciarTemporizadorInactividad() {
    inactivityTimer = setTimeout(() => {
        iniciarAutoRotacion();
    }, inactivityTimeout);
}

function iniciarEjesCoordenados() {
    // Crear una escena específica para los ejes
    axesHelper = new THREE.Scene();
    axesCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    axesCamera.position.set(0, 0, 2); // Mantener la cámara de los ejes en un lugar fijo
    axesCamera.lookAt(new THREE.Vector3(0, 0, 0)); // Asegurar que la cámara de los ejes mire siempre al centro

    // Crear y añadir los ejes al contenedor de ejes
    const axes = new THREE.AxesHelper(0.5);
    axesHelper.add(axes);

    axesRenderer = new THREE.WebGLRenderer({ alpha: true });
    axesRenderer.setSize(100, 100);
    document.getElementById('axes-container').appendChild(axesRenderer.domElement);

    // Desactivar la rotación de los controles de los ejes para que permanezcan centrados
    axesControls = new THREE.OrbitControls(axesCamera, axesRenderer.domElement);
    axesControls.enableRotate = false;
}

function configurarControles() {
    document.getElementById('reset-view').addEventListener('click', () => {
        camera.position.set(
            config.cameraInitialPositionX,
            config.cameraInitialPositionY,
            config.cameraInitialPositionZ
        );
        controls.reset();
    });

    document.getElementById('rotate-left').addEventListener('click', () => {
        if (model) {
            model.rotation.y -= 0.1;
        }
    });

    document.getElementById('rotate-right').addEventListener('click', () => {
        if (model) {
            model.rotation.y += 0.1;
        }
    });

    document.getElementById('zoom-in').addEventListener('click', () => {
        if (camera.position.z > minZoom) {
            camera.position.z -= 0.02;
            controls.update();
        }
    });

    document.getElementById('zoom-out').addEventListener('click', () => {
        if (camera.position.z < maxZoom) {
            camera.position.z += 0.05;
            controls.update();
        }
    });

    // Añadir evento para detectar cuando los controles de la cámara cambian
    if (controls) {
        controls.addEventListener('change', function() {
            // Actualizar la comparación cuando la cámara cambia
            if (modoComparacion && (modeloActual || modeloFuturo)) {
                actualizarComparacion(valorSliderActual);
            }
        });
    }
}

function configurarHerramientas() {
    document.getElementById('measure-tool').addEventListener('click', () => {
        measuring = !measuring;
        eliminarPuntosDeMedicion(); // Reiniciar la medición si se vuelve a activar

        if (measuring) {
            document.getElementById('measurement-display').style.display = 'block';
            document.getElementById('measurement-display').innerHTML = 'Seleccione dos puntos para medir';
            iniciarMedicion(); // Activar la función de medición
        } else {
            document.getElementById('measurement-display').style.display = 'none';
            document.getElementById('container').removeEventListener('click', medir); // Eliminar el listener si se desactiva la herramienta
        }
    });

    // Otros botones, como el de wireframe y luz, quedan sin cambios
}

function configurarVistas() {
    document.getElementById('view-front').addEventListener('click', () => {
        setView(0, 0, 0.1);
    });

    document.getElementById('view-top').addEventListener('click', () => {
        setView(0, 0.1, 0);
    });

    document.getElementById('view-side').addEventListener('click', () => {
        setView(0.1, 0, 0);
    });
}

function setView(x, y, z) {
    const targetPosition = new THREE.Vector3(x, y, z);
    camera.position.copy(targetPosition);
    camera.lookAt(0, 0, 0);
    controls.update();
}

function eliminarPuntosDeMedicion() {
    pointMeshes.forEach(mesh => scene.remove(mesh)); // Remover los puntos de la escena
    pointMeshes = [];
    points = []; // Reiniciar los puntos seleccionados
    if (line) {
        scene.remove(line);
        line = null;
    }
}

function iniciarMedicion() {
    document.getElementById('container').addEventListener('click', medir);

    function medir(event) {
        if (!measuring) return; // Salir si la herramienta no está activa

        // Si ya se han seleccionado dos puntos, reiniciar la medición
        if (points.length >= 2) {
            eliminarPuntosDeMedicion();
        }

        // Convertir la posición del clic a coordenadas del mundo
        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );

        // Usar un rayo para detectar la intersección con el modelo
        raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(scene.children, true);

        if (intersects.length > 0) {
            const point = intersects[0].point;

            // Crear un pequeño punto visual en la posición de intersección
            const sphereGeometry = new THREE.SphereGeometry(0.0005, 16, 16); // Tamaño reducido
            const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
            sphere.position.copy(point);
            scene.add(sphere);
            pointMeshes.push(sphere);

            points.push(point);

            // Solo mostrar hasta dos puntos
            if (points.length === 2) {
                // Calcular la distancia y mostrarla en la pantalla
                const distance = points[0].distanceTo(points[1]) * 100; // Convertir a cm
                document.getElementById('measurement-display').innerHTML = `Distancia: ${distance.toFixed(2)} cm`;

                // Dibujar una línea amarilla entre los dos puntos
                const material = new THREE.LineBasicMaterial({ color: 0xffff00 });
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                line = new THREE.Line(geometry, material);
                scene.add(line);
            }
        }
    }
}

// Función para centralizar un modelo en la escena
function centralizarModelo(modelo) {
    if (!modelo) return;
    
    try {
        // Calcular la caja de contorno (bounding box) del modelo
        const bbox = new THREE.Box3().setFromObject(modelo);
        const centro = bbox.getCenter(new THREE.Vector3());
        
        // Mover el modelo para que su centro esté en el origen
        modelo.position.sub(centro);
        
        console.log("Modelo centralizado en el origen");
    } catch (error) {
        console.error("Error al intentar centralizar el modelo:", error);
    }
}

