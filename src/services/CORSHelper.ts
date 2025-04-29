/**
 * CORSHelper - Servicio para manejar problemas de Cross-Origin Resource Sharing (CORS)
 */

/**
 * Intenta cargar un recurso externo con diferentes estrategias para evitar errores CORS
 * @param url URL del recurso a cargar
 * @returns Promise con el blob del recurso
 */
export const fetchWithCORSHandling = async (url: string): Promise<Blob> => {
  // Primero intentamos con fetch normal con modo cors
  try {
    const response = await fetch(url, {
      mode: 'cors',
      headers: {
        'Accept': 'application/octet-stream',
      },
    });
    
    if (response.ok) {
      return await response.blob();
    }
    
    throw new Error(`Error en la primera estrategia: ${response.statusText}`);
  } catch (error) {
    console.warn('Primera estrategia CORS falló, intentando método alternativo', error);
    
    // Segunda estrategia: usar XMLHttpRequest que a veces maneja CORS de forma diferente
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'blob';
      
      xhr.onload = function() {
        if (this.status >= 200 && this.status < 300) {
          resolve(this.response);
        } else {
          reject(new Error(`Error en la segunda estrategia: ${this.statusText}`));
        }
      };
      
      xhr.onerror = function() {
        reject(new Error('Error de red en la segunda estrategia'));
      };
      
      xhr.send();
    });
  }
};

/**
 * Crea un objeto URL a partir de una URL externa, manejando CORS
 * @param url URL del recurso
 * @returns Promise con el objectURL local
 */
export const createObjectURLFromExternalURL = async (url: string): Promise<string> => {
  try {
    const blob = await fetchWithCORSHandling(url);
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('Todos los métodos CORS fallaron', error);
    throw error;
  }
}; 