/**
 * RouteCalculator - Rota hesaplama işlemlerini yöneten modül
 * Şehir parametre destekli
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
    this.currentCity = 'balikesir'; // Varsayılan şehir
    
    // EventBus olaylarını dinle
    this.eventBus.subscribe('route:calculate', this.calculateRoute.bind(this));
    this.eventBus.subscribe('route:clear', this.clearRoute.bind(this));
    this.eventBus.subscribe('map:ready', this.setupRouteLayer.bind(this));
  }
  
  /**
   * Aktif şehri ayarlar
   * @param {string} cityId - Şehir ID'si
   */
  setCurrentCity(cityId) {
    this.currentCity = cityId;
    console.log(`RouteCalculator: Aktif şehir ${this.currentCity} olarak ayarlandı`);
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
    console.log(`Rota hesaplanıyor: ${type} tipi ile (${this.currentCity} şehri)`);
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
    
    // API URL'sini oluştur - şehir parametresi ekle
    const baseUrl = this.config.api.baseUrl;
    const params = `start_lon=${start[0]}&start_lat=${start[1]}&end_lon=${end[0]}&end_lat=${end[1]}&city=${this.currentCity}`;
    
    // URL'yi oluştur
    const url = `${baseUrl}/route?${params}`;
    
    console.log(`API isteği gönderiliyor: ${url}`);
    
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
        console.log('API yanıtı alındı:', data);
        
        if (data.error) {
          console.error(`Rota hesaplama hatası: ${data.error}`);
          this.showStatusMessage(`Rota hesaplama hatası: ${data.error}`, 'error');
          return;
        }
        
        // GeoJSON verisini çiz
        this.drawRouteFromGeoJSON(data);
        
        // Rota istatistiklerini hesapla
        const routeStats = this.calculateRouteStatistics(data, type);
        
        // Route hesaplanması eventini yayınla
        this.eventBus.publish('route:calculated', routeStats);
        
        // Rota bilgilerini göster
        this.showRouteInformation(routeStats.distance, routeStats.duration, type, this.currentCity);
      })
      .catch(error => {
        clearTimeout(timeoutId); // Hata durumunda da zamanlayıcıyı temizle
        
        // İstek zaman aşımına uğradı mı?
        if (error.name === 'AbortError') {
          console.error('API isteği zaman aşımına uğradı.');
          this.showStatusMessage('API yanıt vermedi. Lütfen backend bağlantınızı kontrol edin.', 'error');
          return;
        }
        
        // CORS hatası için özel mesaj
        if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
          console.error('CORS hatası veya bağlantı sorunu:', error);
          this.showStatusMessage('CORS hatası! Backend bağlantı sorunu.', 'error');
          return;
        }
        
        console.error('Rota hesaplama hatası:', error);
        this.showStatusMessage(`Rota hesaplama sırasında bir hata oluştu`, 'error');
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
   * GeoJSON formatındaki rota verisini OpenLayers haritasında çizer
   * @param {Object} geoJSON - Backend'den gelen GeoJSON verisi
   */
  drawRouteFromGeoJSON(geoJSON) {
    try {
      // Gelen veriyi kontrol et
      if (!geoJSON || !geoJSON.features || geoJSON.features.length === 0) {
        console.warn('Geçerli GeoJSON verisi bulunamadı:', geoJSON);
        return;
      }
      
      console.log('İşlenecek GeoJSON:', geoJSON);
      
      // GeoJSON formatını OpenLayers formatına dönüştür
      const features = new ol.format.GeoJSON().readFeatures(geoJSON, {
        featureProjection: 'EPSG:3857' // Web Mercator projeksiyon
      });
      
      if (features.length === 0) {
        console.warn('GeoJSON verisi içinde çizilebilir feature bulunamadı.');
        return;
      }
      
      // Her feature'a tip ekle
      features.forEach(feature => {
        feature.set('type', 'route');
        // Aktif şehir bilgisini de ekle
        feature.set('city', this.currentCity);
      });
      
      // Featuları source'a ekle
      features.forEach(feature => this.routeSource.addFeature(feature));
      
      console.log(`${features.length} rota parçası çizildi`);
      
      // Haritayı rota boyutuna uygun şekilde yakınlaştır
      this.zoomToRoute();
    } catch (error) {
      console.error('GeoJSON parse hatası:', error);
      console.error('Hatalı veri:', geoJSON);
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
   * Rota istatistiklerini hesaplar
   * @param {Object} geoJSON - GeoJSON rota verisi
   * @param {string} type - Araç tipi
   * @returns {Object} - {distance, duration, type, coordinates, city}
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
    
    // API'den gelen verinin birimini kontrol et ve gerekirse dönüştür
    // Eğer mesafe çok küçükse (örneğin < 0.1), muhtemelen birim metre cinsindendir
    let distanceKm = totalDistance;
    if (totalDistance > 1000) {
      distanceKm = totalDistance / 1000; // Metreyi km'ye çevir
    } else if (totalDistance < 0.1 && coordinates.length > 1) {
      // Çok küçük bir değer geldi, koordinatlardan mesafeyi kendimiz hesaplayalım
      distanceKm = this.calculateDistanceFromCoordinates(coordinates);
    }
    
    // Minimum değer kontrolü
    distanceKm = Math.max(distanceKm, 0.1); // En az 100m olsun
    
    // Tahmini süreyi hesapla
    const duration = this.estimateDuration(distanceKm, type);
    
    return {
      distance: distanceKm,
      duration: duration,
      type: type,
      coordinates: coordinates,
      city: this.currentCity
    };
  }
  
  /**
   * Koordinatlardan mesafe hesaplar (Haversine formülü)
   * @param {Array} coordinates - [[lon1, lat1], [lon2, lat2], ...] formatında koordinatlar
   * @returns {number} - Kilometre cinsinden mesafe
   */
  calculateDistanceFromCoordinates(coordinates) {
    if (!coordinates || coordinates.length < 2) return 0.1; // En az 100m
    
    let totalDistance = 0;
    
    for (let i = 0; i < coordinates.length - 1; i++) {
      const [lon1, lat1] = coordinates[i];
      const [lon2, lat2] = coordinates[i + 1];
      
      // Haversine formülü ile iki nokta arası mesafe (km cinsinden)
      const R = 6371; // Dünya yarıçapı (km)
      const dLat = this.deg2rad(lat2 - lat1);
      const dLon = this.deg2rad(lon2 - lon1);
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c;
      
      totalDistance += distance;
    }
    
    // Minimum mesafe kontrolü
    return Math.max(totalDistance, 0.1); // En az 100m
  }
  
  /**
   * Derece cinsinden açıyı radyana çevirir
   * @param {number} deg - Derece
   * @returns {number} - Radyan
   */
  deg2rad(deg) {
    return deg * (Math.PI/180);
  }
  
  /**
   * Mesafeye göre tahmini süreyi hesaplar
   * @param {number} distance - Kilometre cinsinden mesafe
   * @param {string} type - Araç tipi
   * @returns {number} - Dakika cinsinden tahmini süre
   */
  estimateDuration(distance, type) {
    const speeds = {
      car: 30, // Şehir içi ortalama hız (km/saat)
      bicycle: 15, // km/saat
      pedestrian: 5 // km/saat
    };
    
    // Araç tipine göre hız seç veya varsayılan olarak araba hızını kullan
    const speed = speeds[type] || speeds.car;
    
    // Süreyi hesapla (saat * 60 = dakika)
    let duration = (distance / speed) * 60;
    
    // İstanbul gibi yoğun trafikli şehirlerde ek süre
    if (this.currentCity === 'istanbul' && type === 'car') {
      duration *= 1.5; // %50 trafik faktörü
    }
    
    // Minimum süre kontrolü (en az 1 dakika)
    return Math.max(Math.round(duration), 1);
  }
  
  /**
   * Rota bilgilerini kullanıcıya gösterir
   * @param {number} distance - Mesafe (km)
   * @param {number} duration - Süre (dakika)
   * @param {string} vehicleType - Araç tipi
   * @param {string} city - Şehir adı
   */
  showRouteInformation(distance, duration, vehicleType, city) {
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
    
    // Şehir adını formatla
    const cityName = city.charAt(0).toUpperCase() + city.slice(1);
    
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
    console.log(`Rota bilgileri: ${cityName}, ${vehicleText}, ${distanceText}, ${durationText}`);
    
    // Rota bilgilerini status mesajında göster
    this.showStatusMessage(
      `${cityName} - ${vehicleText} ile: ${distanceText}, ${durationText}`,
      'success'
    );
    
    // Rota bilgilerini route-info alanında da göster
    const routeInfo = document.getElementById('route-info');
    const routeDetails = document.getElementById('route-details');
    
    if (routeInfo && routeDetails) {
      routeDetails.innerHTML = `
        <p><strong>Şehir:</strong> ${cityName}</p>
        <p><strong>Araç:</strong> ${vehicleText}</p>
      `;
      
      routeInfo.style.display = 'block';
    }
  }
}