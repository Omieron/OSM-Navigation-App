/**
 * RouteCalculator - OSRM ile rota hesaplama işlemlerini yöneten modül
 */
export default class RouteCalculator {
  /**
   * RouteCalculator sınıfını başlatır
   * @param {Object} config - Konfigürasyon ayarları
   * @param {Object} eventBus - Modüller arası iletişim için EventBus
   */
  constructor(config, eventBus) {
    this.config = config;
    this.eventBus = eventBus;
    this.routeLayer = null;
    this.routeSource = new ol.source.Vector();
    
    // EventBus olaylarını dinle
    this.eventBus.subscribe('route:calculate', this.calculateRoute.bind(this));
    this.eventBus.subscribe('route:clear', this.clearRoute.bind(this));
    this.eventBus.subscribe('map:ready', this.setupRouteLayer.bind(this));
  }
  
  /**
   * Rota Layer'ını oluşturur
   * @param {ol.Map} map - OpenLayers harita nesnesi
   */
  setupRouteLayer(map) {
    this.routeLayer = new ol.layer.Vector({
      source: this.routeSource,
      style: new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: this.config.routeStyle.lineColor,
          width: this.config.routeStyle.lineWidth
        })
      })
    });
    
    map.addLayer(this.routeLayer);
    console.log('Rota layer haritaya eklendi');
  }
  
  /**
   * Çizilmiş rotayı temizler
   */
  clearRoute() {
    if (this.routeSource) {
      this.routeSource.clear();
      console.log('Rota temizlendi');
    }
  }
  
  /**
   * İki nokta arasında rota hesaplar
   * @param {Object} routeRequest - {start: [lon, lat], end: [lon, lat], type: 'car'|'bicycle'|'pedestrian'}
   */
  calculateRoute(routeRequest) {
    // Mevcut rotayı temizle
    this.clearRoute();
    
    const { start, end, type } = routeRequest;
    console.log(`Rota hesaplanıyor: ${type} tipi ile`);
    console.log(`Başlangıç: ${start[0].toFixed(6)}, ${start[1].toFixed(6)}`);
    console.log(`Bitiş: ${end[0].toFixed(6)}, ${end[1].toFixed(6)}`);
    
    // OSRM API'ye rota hesaplama isteği gönder
    this.fetchRouteFromOSRM(start, end, type);
  }
  
  /**
   * OSRM API'den rota verisi çeker
   * @param {Array} start - [lon, lat] başlangıç noktası
   * @param {Array} end - [lon, lat] bitiş noktası
   * @param {string} type - Araç tipi
   */
  fetchRouteFromOSRM(start, end, type) {
    // Yükleniyor durumunu bildirme
    this.eventBus.publish('route:loading', true);
    
    // OSRM'ye uygun profil belirle
    const profile = this.config.api.profiles[type] || 'car';
    
    // OSRM'ye uygun koordinat formatı oluştur: "lon,lat;lon,lat"
    const coordinates = `${start[0]},${start[1]};${end[0]},${end[1]}`;
    
    // OSRM API URL'sini oluştur
    const baseUrl = this.config.api.baseUrl;
    const routeEndpoint = this.config.api.route;
    
    // OSRM parametrelerini oluştur
    const params = new URLSearchParams({
      overview: this.config.api.params.overview,
      geometries: this.config.api.params.geometries,
      steps: this.config.api.params.steps,
      annotations: this.config.api.params.annotations
    }).toString();
    
    // URL'yi oluştur: /route/v1/{profile}/{coordinates}?params
    const url = `${baseUrl}${routeEndpoint}/${profile}/${coordinates}?${params}`;
    
    console.log(`OSRM API isteği gönderiliyor: ${url}`);
    
    // Zaman aşımı için controller
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 saniye timeout
    
    // API çağrısı yap
    fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      mode: 'cors',
      signal: controller.signal // Zaman aşımı için sinyal
    })
      .then(response => {
        clearTimeout(timeoutId); // Zamanlayıcıyı temizle
        
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('OSRM yanıtı alındı:', data);
        
        if (data.code !== 'Ok') {
          console.error(`Rota hesaplama hatası: ${data.message || 'Bilinmeyen hata'}`);
          this.showStatusMessage(`Rota hesaplama hatası: ${data.message || 'OSRM rotayı hesaplayamadı'}`, 'error');
          return;
        }
        
        // OSRM GeoJSON verisini çiz
        this.drawRouteFromOSRM(data);
        
        // Rota istatistiklerini hesapla
        const routeStats = this.calculateOSRMRouteStatistics(data, type);
        
        // Route hesaplanması eventini yayınla
        this.eventBus.publish('route:calculated', routeStats);
        
        // Rota bilgilerini göster
        this.showRouteInformation(routeStats.distance, routeStats.duration, type);
      })
      .catch(error => {
        clearTimeout(timeoutId); // Hata durumunda da zamanlayıcıyı temizle
        
        // İstek zaman aşımına uğradı mı?
        if (error.name === 'AbortError') {
          console.error('API isteği zaman aşımına uğradı.');
          this.showStatusMessage('OSRM yanıt vermedi. OSRM Docker servisinin çalıştığından emin olun.', 'error');
          return;
        }
        
        // CORS hatası için özel mesaj
        if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
          console.error('CORS hatası veya bağlantı sorunu:', error);
          this.showStatusMessage('CORS hatası! OSRM servisi bağlantı sorunu.', 'error');
          return;
        }
        
        console.error('Rota hesaplama hatası:', error);
        this.showStatusMessage(`Rota hesaplama sırasında bir hata oluştu: ${error.message}`, 'error');
      })
      .finally(() => {
        // Yükleniyor durumunu kapat
        this.eventBus.publish('route:loading', false);
      });
  }
  
  /**
   * Durum mesajı gösterir
   * @param {string} message - Gösterilecek mesaj
   * @param {string} type - Mesaj tipi (success, error, info)
   */
  showStatusMessage(message, type = 'info') {
    // Durum mesajını seçim durumu alanında göster
    const statusText = document.getElementById('selection-status');
    if (statusText) {
      statusText.textContent = message;
      
      // Mesaj tipine göre stil
      if (type === 'error') {
        statusText.style.backgroundColor = '#ffebee';
        statusText.style.color = '#c62828';
      } else if (type === 'success') {
        statusText.style.backgroundColor = '#e8f5e9';
        statusText.style.color = '#2e7d32';
      } else {
        statusText.style.backgroundColor = '#e3f2fd';
        statusText.style.color = '#0d47a1';
      }
      
      // 5 saniye sonra eski haline getir
      setTimeout(() => {
        statusText.textContent = 'Rota seçimi için bir işlem seçin';
        statusText.style.backgroundColor = '#f5f5f5';
        statusText.style.color = '#333';
      }, 5000);
    }
    
    console.log(`Durum mesajı (${type}): ${message}`);
  }
  
  /**
   * OSRM'den gelen yanıtı işleyerek rotayı çizer
   * @param {Object} osrmResponse - OSRM API'den gelen yanıt
   */
  drawRouteFromOSRM(osrmResponse) {
    try {
      // Yanıtı kontrol et
      if (!osrmResponse || !osrmResponse.routes || osrmResponse.routes.length === 0) {
        console.warn('Geçerli OSRM rota verisi bulunamadı:', osrmResponse);
        return;
      }
      
      // OSRM'nin ilk rotasını al (varsayılan olarak en iyi rota)
      const route = osrmResponse.routes[0];
      
      // GeoJSON yapısı oluştur
      const routeGeoJSON = {
        type: 'Feature',
        properties: {
          distance: route.distance,
          duration: route.duration
        },
        geometry: route.geometry // OSRM'den 'geometries=geojson' parametresi ile uyumlu
      };
      
      console.log('İşlenecek GeoJSON (OSRM):', routeGeoJSON);
      
      // GeoJSON formatını OpenLayers formatına dönüştür
      const feature = new ol.format.GeoJSON().readFeature(routeGeoJSON, {
        featureProjection: 'EPSG:3857' // Web Mercator projeksiyon
      });
      
      // Feature'a tip ekle
      feature.set('type', 'route');
      
      // Feature'ı source'a ekle
      this.routeSource.addFeature(feature);
      
      console.log('OSRM rotası çizildi');
      
      // Haritayı rota boyutuna uygun şekilde yakınlaştır
      this.zoomToRoute();
    } catch (error) {
      console.error('OSRM verisi işleme hatası:', error);
      console.error('Hatalı veri:', osrmResponse);
    }
  }
  
  /**
   * Haritayı çizilen rotayı gösterecek şekilde yakınlaştırır
   */
  zoomToRoute() {
    if (this.routeSource.getFeatures().length === 0) return;
    
    // Tüm rota özelliklerinin yayılımını (extent) hesapla
    const extent = this.routeSource.getExtent();
    
    // Rota görünümünü EventBus üzerinden bildir
    this.eventBus.publish('map:zoomToExtent', {
      extent: extent,
      padding: [50, 50, 50, 50], // Kenarlardan boşluk bırak
      duration: this.config.map.animationDuration
    });
  }
  
  /**
   * OSRM yanıtından rota istatistikleri hesaplar
   * @param {Object} osrmResponse - OSRM API yanıtı
   * @param {string} type - Araç tipi
   * @returns {Object} - {distance, duration, type, coordinates}
   */
  calculateOSRMRouteStatistics(osrmResponse, type) {
    // OSRM'in ilk rotasını al
    const route = osrmResponse.routes[0];
    
    // Mesafeyi km cinsine çevir (OSRM metre olarak döndürür)
    const distanceKm = route.distance / 1000;
    
    // Süreyi dakika cinsine çevir (OSRM saniye olarak döndürür)
    const durationMinutes = Math.round(route.duration / 60);
    
    // Rota koordinatlarını al
    let coordinates = [];
    if (route.geometry && route.geometry.coordinates) {
      coordinates = route.geometry.coordinates;
    }
    
    return {
      distance: distanceKm,
      duration: durationMinutes,
      type: type,
      coordinates: coordinates
    };
  }
  
  /**
   * Rota bilgilerini kullanıcıya gösterir
   * @param {number} distance - Mesafe (km)
   * @param {number} duration - Süre (dakika)
   * @param {string} vehicleType - Araç tipi
   */
  showRouteInformation(distance, duration, vehicleType) {
    // Araç tipine göre metni belirle
    let vehicleText;
    
    if (vehicleType === 'car') {
      vehicleText = 'Araba';
    } else if (vehicleType === 'bicycle') {
      vehicleText = 'Bisiklet';
    } else if (vehicleType === 'pedestrian') {
      vehicleText = 'Yaya';
    } else {
      vehicleText = 'Araç';
    }
    
    // Mesafeyi formatla
    let distanceText;
    if (distance < 1) {
      // 1 km'den küçükse metre cinsinden göster
      distanceText = `${Math.round(distance * 1000)} m`;
    } else {
      // 1 km'den büyükse km cinsinden göster (1 ondalık basamaklı)
      distanceText = `${distance.toFixed(1)} km`;
    }
    
    // Süreyi formatla
    let durationText;
    if (duration < 60) {
      // 1 saatten az
      durationText = `${duration} dakika`;
    } else {
      // 1 saatten fazla
      const hours = Math.floor(duration / 60);
      const minutes = duration % 60;
      durationText = `${hours} saat${minutes > 0 ? ` ${minutes} dakika` : ''}`;
    }
    
    // Konsola bilgileri yazdır (debug için)
    console.log(`Rota bilgileri (OSRM): ${vehicleText}, ${distanceText}, ${durationText}`);
    
    // Rota bilgilerini status mesajında göster
    this.showStatusMessage(
      `${vehicleText} ile: ${distanceText}, ${durationText}`,
      'success'
    );
    
    // Rota bilgilerini route-info alanında da göster
    const routeInfo = document.getElementById('route-info');
    const routeDetails = document.getElementById('route-details');
    
    if (routeInfo && routeDetails) {
      routeDetails.innerHTML = `
        <p><strong>Araç:</strong> ${vehicleText}</p>
        <p><strong>Mesafe:</strong> ${distanceText}</p>
        <p><strong>Tahmini Süre:</strong> ${durationText}</p>
      `;
      
      routeInfo.style.display = 'block';
    }
  }
}