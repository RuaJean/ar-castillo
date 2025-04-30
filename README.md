# Visor de Realidad Aumentada Geolocalizada

Una aplicación web que muestra modelos 3D en realidad aumentada basada en la posición geográfica del usuario utilizando AR.js y A-Frame.

## Características

- **Realidad Aumentada Geolocalizada:** Visualiza modelos 3D en el mundo real basándose en tu ubicación GPS
- **Modelos Seleccionables:** Elige entre varios modelos 3D para visualizar
- **Interfaz Intuitiva:** Experiencia de usuario sencilla con instrucciones claras

## Tecnologías utilizadas

- React
- A-Frame para el entorno 3D
- AR.js para la funcionalidad de realidad aumentada geolocalizada

## Requisitos del sistema

- Navegador moderno que soporte WebGL y WebRTC
- Dispositivo móvil con:
  - GPS activado
  - Permisos de ubicación habilitados
  - Acelerómetro y giroscopio (para la orientación)

## Instalación y ejecución

1. Clona el repositorio
2. Instala las dependencias con `npm install`
3. Ejecuta el servidor de desarrollo con `npm run dev`
4. Accede a la aplicación desde tu navegador en `http://localhost:5173/`

## Uso

1. Al abrir la aplicación, serás dirigido directamente a la experiencia de AR Geolocalizada
2. Selecciona el modelo 3D que desees visualizar
3. Haz clic en "Iniciar Experiencia AR"
4. Concede permisos de ubicación cuando se te solicite
5. La aplicación mostrará el modelo 3D en tu ubicación actual
6. Puedes cambiar el modelo durante la experiencia usando el selector en la parte superior

## Licencia

Este proyecto se encuentra bajo licencia MIT.
