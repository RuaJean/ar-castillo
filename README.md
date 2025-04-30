# AR Castillo - Visualización de modelo 3D en realidad aumentada geolocalizada

Este proyecto permite visualizar un modelo 3D en realidad aumentada vinculado a una ubicación geográfica específica. El usuario puede navegar hasta la ubicación definida y visualizar el modelo en el espacio real utilizando la cámara de su dispositivo.

## Características

- Geolocalización en tiempo real del usuario
- Cálculo de distancia entre el usuario y la ubicación objetivo
- Visualización de un modelo 3D (SantaMaria_futuro_packed.glb) en realidad aumentada
- Capacidad para caminar alrededor y dentro del modelo

## Coordenadas Objetivo

El modelo se muestra en las siguientes coordenadas:
- 39°28'09.4"N 0°25'53.5"W (39.469278, -0.431528)

## Tecnologías utilizadas

- React
- TypeScript
- A-Frame (framework para realidad virtual y aumentada)
- AR.js (biblioteca para realidad aumentada)
- Three.js (motor 3D)

## Instalación

1. Clona este repositorio
2. Instala las dependencias:
   ```
   npm install
   ```
3. Inicia la aplicación:
   ```
   npm start
   ```

## Requisitos del dispositivo

Para utilizar esta aplicación correctamente:

- Navegador web moderno con soporte para WebXR
- Acceso a la cámara
- Acceso a la geolocalización
- Conexión a internet
- Preferiblemente utilizar en un dispositivo móvil para una mejor experiencia

## Uso

1. Abra la aplicación en su dispositivo móvil
2. Permita el acceso a la geolocalización y la cámara cuando se le solicite
3. Navegue hasta la ubicación objetivo (se muestra en la pantalla principal)
4. Cuando esté cerca, toque el botón "Iniciar Experiencia AR"
5. Apunte la cámara al espacio donde debería aparecer el modelo
6. Explore alrededor y dentro del modelo 3D

## Notas de desarrollo

Este proyecto utiliza React con TypeScript para la estructura base, y A-Frame con AR.js para la implementación de realidad aumentada. La geolocalización se maneja a través de la API de Geolocalización del navegador.

## Licencia

MIT
