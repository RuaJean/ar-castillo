/// <reference types="react-scripts" />

// Declaración de tipos para A-Frame
declare namespace JSX {
  interface IntrinsicElements {
    'a-scene': any;
    'a-entity': any;
    'a-sphere': any;
    'a-box': any;
    'a-cylinder': any;
    'a-plane': any;
    'a-sky': any;
    'a-asset-item': any;
    'a-assets': any;
    'a-camera': any;
    'a-marker': any;
    'a-text': any;
    'a-cursor': any;
    'a-light': any;
  }
}

// Ampliación de Window para incluir AFRAME
interface Window {
  AFRAME: any;
}

// Declaraciones de módulos
declare module 'aframe';
declare module 'aframe-ar';
declare module 'aframe-extras';
declare module 'aframe-look-at-component';
declare module '*.glb';
