/**
 * Sistem genelinde kullanılacak yapılandırma ayarları
 * Backend adaptasyonu ile güncellenmiş
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

  // OSRM API ayarları - Backend üzerinden
  api: {
    // Backend'in base URL'i
    baseUrl: 'http://localhost:3001/api',
    
    // OSRM endpoints (backend üzerinden)
    route: '/route/v1',
    
    // Profiller
    profiles: {
      car: 'driving',
      bicycle: 'bike', 
      pedestrian: 'foot'
    },
    
    // OSRM parametreleri
    params: {
      overview: 'full',
      geometries: 'geojson',
      steps: true,
      annotations: true
    }
  },

  // Rota hesaplama ayarları
  routing: {
    vehicleType: 'car',
    costField: 'duration'
  },

  // Rota stili
  routeStyle: {
    lineColor: '#3388ff',
    lineWidth: 6,
    lineHighlightColor: '#FF8800',
    lineHighlightWidth: 8
  },

  // Trafik ayarları - Backend entegrasyonu
  traffic: {
    // ❌ API key artık frontend'de değil! Backend'de tutulacak
    // apiKey: '', // KALDIRILDI
    
    // Backend endpoint'leri
    baseUrl: 'http://localhost:3001/api',
    flowSegmentData: '/traffic/flow',  // Backend route'u
    
    // Status endpoint'leri
    statusEndpoints: {
      osrm: '/status/osrm',
      tomtom: '/status/tomtom',
      health: '/health'
    },
    
    // Görselleştirme ayarları
    colors: {
      good: 'rgba(0, 176, 80, 0.8)',      // Yeşil - akıcı trafik
      moderate: 'rgba(255, 192, 0, 0.8)', // Sarı - orta yoğunluk
      bad: 'rgba(237, 28, 36, 0.8)'       // Kırmızı - yoğun trafik
    },
    
    // Trafik çizgi kalınlığı
    lineWidth: 4,
    
    // Minimum zoom seviyesi (trafik gösterimi için)
    minZoomLevel: 10,
    
    // Otomatik güncelleme aralığı (ms)
    refreshInterval: 300000, // 5 dakika
    
    // Rota buffer genişliği (metre)
    routeBufferWidth: 30,
    
    // Cache ayarları (frontend tarafı)
    cache: {
      // Backend'de cache var, frontend'de de kısa süreli cache
      ttl: 60000, // 1 dakika (backend'den daha kısa)
      maxSize: 100 // Maximum cache entry sayısı
    },
    
    // Request timeout ayarları
    timeout: {
      status: 5000,    // Status check için 5 saniye
      flow: 10000      // Trafik verisi için 10 saniye
    },
    
    // Fallback ayarları
    fallback: {
      enabled: true,
      data: {
        currentSpeed: 45,
        freeFlowSpeed: 50,
        confidence: 0.3,
        trafficFactor: 1.1
      }
    }
  },

  // Backend bağlantı ayarları
  backend: {
    baseUrl: 'http://localhost:3001',
    timeout: 15000, // 15 saniye genel timeout
    retryAttempts: 2,
    retryDelay: 1000, // 1 saniye retry delay
    
    // Endpoint'ler
    endpoints: {
      osrmRoute: '/api/route/v1',
      trafficFlow: '/api/traffic/flow',
      statusOsrm: '/api/status/osrm',
      statusTomtom: '/api/status/tomtom',
      health: '/api/health'
    }
  },

  // Debug ve geliştirme ayarları
  debug: {
    enabled: true, // Konsol logları için
    verbose: false, // Detaylı loglar
    showCacheStats: true, // Cache istatistiklerini göster
    showNetworkRequests: true // Network isteklerini logla
  }
};