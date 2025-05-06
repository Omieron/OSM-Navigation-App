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
        },
        istanbul: {
          center: [29.01, 41.01],
          zoom: 10
        },
        ankara: {
          center: [32.85, 39.92],
          zoom: 10
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
    
    // API endpoint'leri (ileride kullanılacak)
    api: {
      route: 'http://localhost:3000/route',
      search: 'http://localhost:3000/search'
    },
    
    // Rota hesaplama ayarları
    routing: {
      vehicleType: 'car',  // 'car', 'bicycle', 'pedestrian'
      costField: 'duration' // 'distance' veya 'duration'
    }
  };