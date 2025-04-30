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

// Límites de zoom
const minZoom = 0.02; // Mínimo valor de zoom (cercanía máxima)
const maxZoom = 1.0; // Máximo valor de zoom (lejanía máxima)

// Temporizador para detección de inactividad
let inactivityTimer;
const inactivityTimeout = 10000; // 10 segundos

// Integrar configuración manualmente (por problemas de CORS)
const csvConfig = `
property,value
ambientLightIntensity,1
directionalLightIntensity,0.9
cameraInitialPositionX,0.1
cameraInitialPositionY,0.1
cameraInitialPositionZ,0.1
`;

// Convertir CSV a objeto config
csvConfig.trim().split('\n').forEach(line => {
    const [key, value] = line.split(',');
    if (key && value) config[key.trim()] = parseFloat(value.trim());
});

// Asegurarse de que el DOM esté listo antes de asignar eventos
document.addEventListener('DOMContentLoaded', () => {
    // Función para mostrar el visor 3D al hacer clic en el botón
    document.getElementById('entrar-btn').addEventListener('click', function() {
        document.getElementById('preview').style.display = 'none'; // Oculta el contenedor del preview
        document.getElementById('container').style.display = 'block'; // Muestra el visor 3D
        iniciarVisor3D(); // Iniciar el visor 3D con la configuración cargada
        animarAproximacion(); // Llama a la función para animar la cámara
        iniciarAutoRotacion(); // Inicia la autorotación al inicio
    });

    // Asignar eventos de interacción para detener la auto-rotación
    document.getElementById('container').addEventListener('mousemove', detenerAutoRotacion);
    document.getElementById('container').addEventListener('mousedown', detenerAutoRotacion);
    document.getElementById('container').addEventListener('wheel', detenerAutoRotacion);
});

// Función para iniciar el visor 3D
function iniciarVisor3D() {
    // Configuración básica de la escena, cámara y renderizador
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setClearColor(0xffffff); // Fondo blanco
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('container').appendChild(renderer.domElement);

    // Iluminación ambiental y direccional ajustable
    ambientLight = new THREE.AmbientLight(0xffffff, config.ambientLightIntensity || 1); // Luz ambiental ajustable
    scene.add(ambientLight);

    directionalLight = new THREE.DirectionalLight(0xffffff, config.directionalLightIntensity || 0.9); // Luz direccional ajustable
    directionalLight.position.set(5, 5, 5).normalize();
    scene.add(directionalLight);

    // Deshabilitar botones mientras se carga el modelo
    toggleControls(false);

    // Cargar el modelo GLB/GLTF con ruta verificada
    const loader = new THREE.GLTFLoader();
    loader.load(
        'https://img-360dielmo.s3.eu-west-1.amazonaws.com/2024/castros/lingote/oro.glb', // Ruta del modelo
        function (gltf) {
            model = gltf.scene;
            model.scale.set(1, 1, 1); // Escalar el modelo si es necesario
            scene.add(model);

            // Asegurar que todos los materiales del modelo sean sólidos
            model.traverse((child) => {
                if (child.isMesh) {
                    child.material.transparent = false; // Desactivar transparencia
                    child.material.opacity = 1; // Asegurar opacidad completa
                }
            });

            // Habilitar botones después de cargar el modelo
            toggleControls(true);
        },
        undefined,
        function (error) {
            console.error('Error al cargar el modelo:', error); // Muestra el error en la consola
        }
    );

    // Configuración inicial de la cámara
    camera.position.set(
        config.cameraInitialPositionX || 0.1,
        config.cameraInitialPositionY || 0.1,
        config.cameraInitialPositionZ || 0.1
    );
    camera.lookAt(0, 0, 0);

    // Añadir OrbitControls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // Añadir inercia al movimiento
    controls.dampingFactor = 0.05;

    // Añadir ejes de coordenadas en la esquina inferior derecha
    iniciarEjesCoordenados();

    // Raycaster para herramientas de medición
    raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // Función de animación
    function animate() {
        requestAnimationFrame(animate);

        // Aplicar auto-rotación si está habilitada
        if (autoRotate && model) {
            model.rotation.y += 0.001; // Rotación lenta en el eje Y
        }

        if (camera && scene) { // Verificar si el modelo y la cámara están definidos
            controls.update(); // Actualizar controles en cada frame
            renderer.render(scene, camera);
            // Renderizar los ejes de coordenadas
            if (axesRenderer && axesHelper) {
                axesRenderer.render(axesHelper, axesCamera);
            }
            actualizarEjes();
        }
    }
    animate();

    // Ajustar el tamaño del renderizador al cambiar el tamaño de la ventana
    window.addEventListener('resize', () => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    });

    // Capturar eventos de clic para la herramienta de medición
    renderer.domElement.addEventListener('click', (event) => {
        if (measuring) {
            // Calcular la posición del ratón en coordenadas normalizadas de la pantalla
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

            // Actualizar el raycaster con la posición de la cámara y del ratón
            raycaster.setFromCamera(mouse, camera);

            // Detectar intersección con el modelo 3D
            const intersects = raycaster.intersectObject(model, true);

            if (intersects.length > 0) {
                // Eliminar puntos anteriores si se ha hecho más de dos clics
                if (points.length >= 2) {
                    eliminarPuntosDeMedicion();
                }

                const point = intersects[0].point;
                points.push(point);

                // Mostrar el punto seleccionado
                mostrarPunto(point);

                // Si se han seleccionado dos puntos, medir la distancia y dibujar la línea
                if (points.length === 2) {
                    medirDistancia(points[0], points[1]);
                    dibujarLinea(points[0], points[1]);
                }
            }
        }
    });
}

// Función para habilitar/deshabilitar controles
function toggleControls(enabled) {
    const buttons = document.querySelectorAll('.control-btn, .tool-btn');
    buttons.forEach(button => {
        button.disabled = !enabled; // Habilitar o deshabilitar
    });
    if (enabled) {
        configurarControles(); // Configurar eventos de los controles
        configurarHerramientas(); // Configurar herramientas
        configurarVistas(); // Configurar vistas predefinidas
    }
}

// Función para mostrar el punto seleccionado
function mostrarPunto(point) {
    const sphereGeometry = new THREE.SphereGeometry(0.0005, 16, 16); // Tamaño 10 veces más pequeño
    const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.copy(point);
    scene.add(sphere);
    pointMeshes.push(sphere); // Almacenar la esfera para eliminarla más tarde
}

// Función para dibujar la línea entre dos puntos de medición
function dibujarLinea(p1, p2) {
    if (line) {
        scene.remove(line); // Eliminar la línea anterior si existe
    }
    const material = new THREE.LineBasicMaterial({ color: 0xffff00 }); // Color amarillo
    const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    line = new THREE.Line(geometry, material);
    scene.add(line);
}

// Función para medir la distancia entre dos puntos y mostrarla
function medirDistancia(p1, p2) {
    const distance = p1.distanceTo(p2) * 100; // Convertir a cm (si 1 unidad = 1 metro)
    document.getElementById('measurement-display').innerHTML = `Distancia: ${distance.toFixed(2)} cm`;
    document.getElementById('measurement-display').style.display = 'block';
}

// Función para eliminar los puntos de medición del modelo y la línea de medición
function eliminarPuntosDeMedicion() {
    pointMeshes.forEach(mesh => {
        scene.remove(mesh); // Eliminar cada punto de la escena
    });
    pointMeshes = []; // Vaciar la lista de puntos visuales
    points = []; // Vaciar la lista de puntos de medición
    if (line) {
        scene.remove(line); // Eliminar la línea de medición
        line = null;
    }
}

// Función para configurar los botones de navegación
function configurarControles() {
    document.getElementById('reset-view').addEventListener('click', () => {
        // Restablecer la posición de la cámara y controles
        camera.position.set(
            config.cameraInitialPositionX,
            config.cameraInitialPositionY,
            config.cameraInitialPositionZ
        );
        controls.reset();
    });

    document.getElementById('rotate-left').addEventListener('click', () => {
        // Girar el modelo hacia la izquierda
        if (model) {
            model.rotation.y -= 0.1;
        }
    });

    document.getElementById('rotate-right').addEventListener('click', () => {
        // Girar el modelo hacia la derecha
        if (model) {
            model.rotation.y += 0.1;
        }
    });

    document.getElementById('zoom-in').addEventListener('click', () => {
        // Acercar la cámara, con límites
        if (camera.position.z > minZoom) {
            camera.position.z -= 0.02; // Permitir niveles adicionales de zoom
            controls.update();
        }
    });

    document.getElementById('zoom-out').addEventListener('click', () => {
        // Alejar la cámara, con límites
        if (camera.position.z < maxZoom) {
            camera.position.z += 0.05;
            controls.update();
        }
    });
}

// Función para configurar herramientas de medición y visualización
function configurarHerramientas() {
    document.getElementById('measure-tool').addEventListener('click', () => {
        // Activar la herramienta de medición
        measuring = !measuring;
        if (measuring) {
            document.getElementById('measurement-display').style.display = 'block';
            document.getElementById('measurement-display').innerHTML = 'Seleccione dos puntos para medir';
        } else {
            document.getElementById('measurement-display').style.display = 'none';
            points = []; // Reiniciar puntos cuando se desactiva la herramienta de medición
            eliminarPuntosDeMedicion(); // Eliminar puntos visuales y línea de medición
        }
    });

    document.getElementById('wireframe-tool').addEventListener('click', () => {
        // Cambiar a modo alambrado
        wireframeMode = !wireframeMode;
        model.traverse((child) => {
            if (child.isMesh) {
                child.material.wireframe = wireframeMode;
            }
        });
    });

    document.getElementById('light-tool').addEventListener('click', () => {
        // Cambiar intensidad de iluminación
        ambientLight.intensity = ambientLight.intensity === 1 ? 0.7 : 1;
        directionalLight.intensity = directionalLight.intensity === 0.9 ? 1.5 : 0.9;
    });

    document.getElementById('auto-rotate-tool').addEventListener('click', () => {
        // Activar o desactivar auto-rotación
        autoRotate = !autoRotate;
        document.getElementById('auto-rotate-tool').innerHTML = autoRotate ? "Detener Auto-rotación" : "Iniciar Auto-rotación";
    });
}

// Función para configurar vistas predefinidas
function configurarVistas() {
    document.getElementById('view-front').addEventListener('click', () => {
        setView(0, 0, 0.1); // Vista Frontal más cercana
    });

    document.getElementById('view-top').addEventListener('click', () => {
        setView(0, 0.1, 0); // Vista Superior más cercana
    });

    document.getElementById('view-side').addEventListener('click', () => {
        setView(0.1, 0, 0); // Vista Lateral más cercana
    });
}

// Función para cambiar a vistas predefinidas
function setView(x, y, z) {
    const targetPosition = new THREE.Vector3(x, y, z);
    camera.position.copy(targetPosition);
    camera.lookAt(0, 0, 0);
    controls.update();
}

// Mostrar la medición en pantalla
function mostrarMedicion(distance) {
    document.getElementById('measurement-display').innerHTML = `Distancia: ${distance.toFixed(2)} cm`;
    document.getElementById('measurement-display').style.display = 'block';
}

// Función para animar la cámara hacia el modelo al entrar
function animarAproximacion() {
    const targetPosition = new THREE.Vector3(
        config.cameraInitialPositionX,
        config.cameraInitialPositionY,
        config.cameraInitialPositionZ
    ); // Posición objetivo
    const startPosition = new THREE.Vector3(0, 0, 5); // Posición inicial (más lejos)
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

// Función para iniciar ejes de coordenadas
function iniciarEjesCoordenados() {
    axesHelper = new THREE.Scene();
    axesCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    axesCamera.position.z = 2;

    const axes = new THREE.AxesHelper(0.5);
    axesHelper.add(axes);

    axesRenderer = new THREE.WebGLRenderer({ alpha: true });
    axesRenderer.setSize(100, 100);
    document.getElementById('axes-container').appendChild(axesRenderer.domElement);

    axesControls = new THREE.OrbitControls(axesCamera, axesRenderer.domElement);
    axesControls.enableRotate = false; // Desactivar rotación de los ejes
}

// Función para actualizar la orientación de los ejes coordenados
function actualizarEjes() {
    const quaternion = camera.quaternion.clone();
    axesCamera.quaternion.copy(quaternion);
}

// Función para iniciar la autorotación
function iniciarAutoRotacion() {
    autoRotate = true;
    document.getElementById('auto-rotate-tool').innerHTML = "Detener Auto-rotación";
}

// Función para detener la autorotación
function detenerAutoRotacion() {
    autoRotate = false;
    document.getElementById('auto-rotate-tool').innerHTML = "Iniciar Auto-rotación";
    clearTimeout(inactivityTimer); // Detener temporizador de inactividad
    iniciarTemporizadorInactividad(); // Reiniciar el temporizador para detectar inactividad
}

// Función para iniciar el temporizador de inactividad
function iniciarTemporizadorInactividad() {
    inactivityTimer = setTimeout(() => {
        iniciarAutoRotacion(); // Reiniciar la autorotación después de 10 segundos de inactividad
    }, inactivityTimeout);
}
