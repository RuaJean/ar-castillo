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

// Diccionario de configuración para cada pieza
const piezasConfig = {
    oro: {
        titulo: "Lingote de Oro Museo Santiago",
        imagen: "https://img-360dielmo.s3.eu-west-1.amazonaws.com/2024/castros/lingote/inicial_lingote.png",
        modelo: 'oro.glb'
    },
    plata: {
        titulo: "Lingote de Plata Museo Santiago",
        imagen: "https://img-360dielmo.s3.eu-west-1.amazonaws.com/2024/castros/lingote/inicial_plata.png",
        modelo: "plata.glb"
    }
};

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
    // Si tenemos un parámetro model en la URL, lo usamos directamente
    modeloURL = `/${modelParam}`;
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
});

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
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setClearColor(0xffffff);
    renderer.setSize(window.innerWidth, window.innerHeight);
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

            toggleControls(true);
        },
        undefined,
        function (error) {
            console.error('Error al cargar el modelo:', error);
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

        if (camera && scene) {
            controls.update();
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

function animate() {
    requestAnimationFrame(animate);

    if (autoRotate && model) {
        model.rotation.y += 0.001;
    }

    // Actualizar y renderizar la escena principal
    controls.update();
    renderer.render(scene, camera);

    // Renderizar la escena de los ejes
    if (axesRenderer && axesHelper) {
        actualizarEjes(); // Actualizar la rotación de los ejes
        axesRenderer.render(axesHelper, axesCamera);
    }
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

