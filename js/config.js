/**
 * Sistem genelinde kullanılacak yapılandırma ayarları
 */
export default {
  // Harita ayarları
  map: {
    initialView: {
      turkey: {
        center: [35.24, 38.96],
        zoom: 6
      }
    },
    minZoom: 4,
    maxZoom: 18,
    animationDuration: 1000
  },

  // Marker stilleyimleri
  markers: {
    start: {
      radius: 10,
      fillColor: '#4CAF50',  // Yeşil
      strokeColor: '#fff',
      strokeWidth: 2
    },
    end: {
      radius: 10,
      fillColor: '#f44336',  // Kırmızı
      strokeColor: '#fff',
      strokeWidth: 2
    }
  },

  // OSRM API ayarları - Docker'da çalışan OSRM sunucusu
  api: {
    // Docker üzerinde çalışan OSRM'nin IP adresi ve port'u
    baseUrl: 'http://localhost:3001/api',
    //baseUrl: 'http://localhost:3001/api/tomtom',
    // OSRM endpoints
    route: '/route/v1',
    // Profiller
    profiles: {
      car: 'driving',
      bicycle: 'bike',
      pedestrian: 'foot'
    },
    // OSRM parametreleri
    params: {
      overview: 'full', // Detaylı rota geometrisi
      geometries: 'geojson', // GeoJSON formatında sonuç
      steps: true, // Adım adım navigasyon bilgileri
      annotations: true // Mesafe ve süre bilgileri
    }
  },

  // Rota hesaplama ayarları
  routing: {
    vehicleType: 'car',  // 'car', 'bicycle', 'pedestrian'
    costField: 'duration' // 'distance' veya 'duration'
  },

  // Rota stili
  routeStyle: {
    lineColor: '#3388ff',
    lineWidth: 6,
    lineHighlightColor: '#FF8800',
    lineHighlightWidth: 8
  },

  // TomTom Trafik API ayarları
  traffic: {
    // TomTom API anahtarı
    apiKey: '', // Artık frontend'de API key gerekmez
    baseUrl: 'http://localhost:3001/api', // Backend'e git
    flowSegmentData: '/traffic/flow', // Backend endpoint'i

    // ... diğer ayarlar aynı kalacak
    colors: {
      good: 'rgba(0, 176, 80, 0.8)',
      moderate: 'rgba(255, 192, 0, 0.8)',
      bad: 'rgba(237, 28, 36, 0.8)'
    },
    // Trafik çizgi kalınlığı
    lineWidth: 4,
    minZoomLevel: 10,
    refreshInterval: 300000,
    routeBufferWidth: 30,
  }
};