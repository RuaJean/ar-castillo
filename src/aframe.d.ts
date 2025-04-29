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
  }
}

// Ampliación de Window para incluir AFRAME
interface Window {
  AFRAME: any;
} 