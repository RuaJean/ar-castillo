// Archivo de respaldo para garantizar que siempre haya un archivo JavaScript válido disponible
console.log('Archivo de respaldo cargado correctamente');

// Función para intentar reiniciar la aplicación si se detectan problemas
window.reiniciarApp = function() {
  console.log('Intentando reiniciar la aplicación...');
  window.location.reload(true);
};

// Comprobación de carga correcta
window.addEventListener('load', function() {
  // Verificar si la aplicación principal se ha cargado correctamente
  if (!window.appCargadaCorrectamente && !document.querySelector('a-scene')) {
    console.error('La aplicación AR no se cargó correctamente. Mostrando interfaz de respaldo.');
    
    // Si hay un error, mostrar un mensaje de error amigable
    const contenedor = document.createElement('div');
    contenedor.style.padding = '20px';
    contenedor.style.fontFamily = 'Arial, sans-serif';
    contenedor.style.maxWidth = '600px';
    contenedor.style.margin = '50px auto';
    contenedor.style.backgroundColor = '#f8d7da';
    contenedor.style.border = '1px solid #f5c6cb';
    contenedor.style.borderRadius = '5px';
    contenedor.style.color = '#721c24';
    
    contenedor.innerHTML = `
      <h2>Hubo un problema al cargar la aplicación</h2>
      <p>La aplicación de Realidad Aumentada no pudo cargarse correctamente.</p>
      <ul>
        <li>Intenta recargar la página</li>
        <li>Asegúrate de usar un navegador compatible (Chrome o Safari recientes)</li>
        <li>Verifica tu conexión a internet</li>
      </ul>
      <button onclick="window.reiniciarApp()" style="padding: 10px 15px; background-color: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; margin-top: 10px;">
        Reintentar
      </button>
    `;
    
    // Añadir al cuerpo del documento si está vacío o tiene pocos elementos
    if (!document.body.children.length || document.body.children.length < 3) {
      document.body.appendChild(contenedor);
    }
  }
}); 