/**
 * RouteCalculator - Rota hesaplama işlemlerini yöneten modül
 * Backend API ile entegre edildi
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
    
    // Backend API'ye rota hesaplama isteği gönder
    this.fetchRouteFromAPI(start, end, type);
  }
  
  /**
 * Backend API'den rota verisi çeker
 * @param {Array} start - [lon, lat] başlangıç noktası
 * @param {Array} end - [lon, lat] bitiş noktası
 * @param {string} type - Araç tipi (henüz backend'de kullanılmıyor)
 */
fetchRouteFromAPI(start, end, type) {
  // Yükleniyor durumunu bildirme
  this.eventBus.publish('route:loading', true);
  
  // API URL'sini oluştur
  const baseUrl = this.config.api.baseUrl;
  const routePath = this.config.api.route;
  const params = `start_lon=${start[0]}&start_lat=${start[1]}&end_lon=${end[0]}&end_lat=${end[1]}`;
  
  // Normal API URL'si
  const url = `${baseUrl}${routePath}?${params}`;
  
  console.log(`API isteği gönderiliyor: ${url}`);
  
  // Zaman aşımı için controller
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 saniye timeout
  
  // API çağrısı yap
  fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    },
    mode: 'cors', // CORS modu ayarı
    credentials: 'same-origin', // Çerezleri gönderme ayarı
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
      console.log('API yanıtı alındı:', data);
      
      if (data.error) {
        alert(`Rota hesaplama hatası: ${data.error}`);
        return;
      }
      
      // GeoJSON verisini çiz
      this.drawRouteFromGeoJSON(data);
      
      // Rota istatistiklerini hesapla
      const routeStats = this.calculateRouteStatistics(data, type);
      
      // Route hesaplanması eventini yayınla
      this.eventBus.publish('route:calculated', routeStats);
      
      // Kullanıcıya bilgi göster
      this.showRouteInformation(routeStats.distance, routeStats.duration, type);
    })
    .catch(error => {
      clearTimeout(timeoutId); // Hata durumunda da zamanlayıcıyı temizle
      
      // İstek zaman aşımına uğradı mı?
      if (error.name === 'AbortError') {
        console.error('API isteği zaman aşımına uğradı.');
        alert('API yanıt vermedi. Lütfen backend bağlantınızı kontrol edin veya daha sonra tekrar deneyin.');
        return;
      }
      
      // CORS hatası için özel mesaj
      if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
        console.error('CORS hatası veya bağlantı sorunu:', error);
        alert(`CORS hatası! Backend'in CORS ayarlarını kontrol edin veya farklı bir tarayıcı kullanın.
          \nTeknik detay: ${error.message}`);
        return;
      }
      
      // Genel hata mesajı
      console.error('Rota hesaplama hatası:', error);
      alert(`Rota hesaplama sırasında bir hata oluştu: ${error.message}`);
    })
    .finally(() => {
      // Yükleniyor durumunu kapat
      this.eventBus.publish('route:loading', false);
    });
}
  
  /**
   * GeoJSON formatındaki rota verisini OpenLayers haritasında çizer
   * @param {Object} geoJSON - Backend'den gelen GeoJSON verisi
   */
  drawRouteFromGeoJSON(geoJSON) {
    try {
      // GeoJSON formatını OpenLayers formatına dönüştür
      const features = new ol.format.GeoJSON().readFeatures(geoJSON, {
        featureProjection: 'EPSG:3857' // Web Mercator projeksiyon
      });
      
      if (features.length === 0) {
        console.warn('GeoJSON verisi içinde çizilebilir feature bulunamadı.');
        return;
      }
      
      // Featuları source'a ekle
      features.forEach(feature => this.routeSource.addFeature(feature));
      
      console.log(`${features.length} rota parçası çizildi`);
      
      // Haritayı rota boyutuna uygun şekilde yakınlaştır
      this.zoomToRoute();
    } catch (error) {
      console.error('GeoJSON parse hatası:', error);
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
    // MapManager bu eventi dinleyerek haritayı uygun şekilde yakınlaştırabilir
    this.eventBus.publish('map:zoomToExtent', {
      extent: extent,
      padding: [50, 50, 50, 50], // Kenarlardan boşluk bırak
      duration: this.config.map.animationDuration
    });
  }
  
  /**
   * Rota istatistiklerini hesaplar
   * @param {Object} geoJSON - GeoJSON rota verisi
   * @param {string} type - Araç tipi
   * @returns {Object} - {distance, duration, type, coordinates}
   */
  calculateRouteStatistics(geoJSON, type) {
    let totalDistance = 0;
    let coordinates = [];
    
    // GeoJSON'dan mesafe ve koordinat bilgilerini topla
    if (geoJSON && geoJSON.features) {
      geoJSON.features.forEach(feature => {
        // Özelliklerden mesafe bilgisini al (varsa)
        if (feature.properties && feature.properties.cost) {
          totalDistance += parseFloat(feature.properties.cost);
        }
        
        // Koordinatları topla
        if (feature.geometry && feature.geometry.coordinates) {
          if (feature.geometry.type === 'LineString') {
            coordinates = coordinates.concat(feature.geometry.coordinates);
          }
        }
      });
    }
    
    // Mesafe birimini km'ye çevir (API verisi farklı birimde olabilir)
    // Burada basit bir yaklaşım kullanıyoruz, gerçek hesaplama için API'nin verdiği değerler kullanılmalı
    const distanceKm = totalDistance > 1000 ? totalDistance / 1000 : totalDistance;
    
    // Tahmini süreyi hesapla
    const duration = this.estimateDuration(distanceKm, type);
    
    return {
      distance: distanceKm,
      duration: duration,
      type: type,
      coordinates: coordinates
    };
  }
  
  /**
   * Mesafeye göre tahmini süreyi hesaplar
   * @param {number} distance - Kilometre cinsinden mesafe
   * @param {string} type - Araç tipi
   * @returns {number} - Dakika cinsinden tahmini süre
   */
  estimateDuration(distance, type) {
    const speeds = {
      car: 60, // km/saat
      bicycle: 15, // km/saat
      pedestrian: 5 // km/saat
    };
    
    const speed = speeds[type] || speeds.car;
    return (distance / speed) * 60; // dakika cinsinden süre
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
    
    // Konsola bilgileri yazdır (debug için)
    console.log(`Gösterilecek araç tipi: ${vehicleType} -> ${vehicleText}`);
    
    // Bilgi mesajını göster
    alert(`Rota Bilgileri:
${vehicleText} ile seyahat
Mesafe: ${distance.toFixed(2)} km
Tahmini süre: ${Math.round(duration)} dakika`);
  }
}