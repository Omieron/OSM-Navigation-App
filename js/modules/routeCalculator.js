/**
 * RouteCalculator - Rota hesaplama işlemlerini yöneten modül
 * İleride backend API ile entegre edilecek
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
            color: '#3388ff',
            width: 6
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
      
      // İleride burada gerçek backend API çağrısı yapılacak
      // Örneğin:
      // fetch(`${this.config.api.route}?start=${start.join(',')}&end=${end.join(',')}&type=${type}`)
      //   .then(response => response.json())
      //   .then(data => this.drawRoute(data.coordinates))
      //   .catch(error => console.error('Rota hesaplama hatası:', error));
      
      // Şimdilik mock rota oluşturuyoruz
      this.createMockRoute(start, end, type);
    }
    
    /**
     * Backend'den gelen koordinatları kullanarak rotayı çizer
     * @param {Array} coordinates - [[lon1, lat1], [lon2, lat2], ...] formatında koordinatlar
     */
    drawRoute(coordinates) {
      // Koordinatları OpenLayers formatına dönüştür
      const points = coordinates.map(coord => ol.proj.fromLonLat(coord));
      
      // LineString geometrisi oluştur
      const routeGeometry = new ol.geom.LineString(points);
      
      // Feature oluştur
      const routeFeature = new ol.Feature({
        geometry: routeGeometry,
        type: 'route'
      });
      
      // Feature'ı source'a ekle
      this.routeSource.addFeature(routeFeature);
      
      console.log('Rota çizildi');
    }
    
    /**
     * Test amaçlı basit bir rota oluşturur
     * @param {Array} start - [lon, lat] başlangıç noktası
     * @param {Array} end - [lon, lat] bitiş noktası
     * @param {string} type - Araç tipi
     */
    createMockRoute(start, end, type) {
      // Kullanıcının seçtiği araç tipini konsola yazdır
      console.log(`RouteCalculator: Araç tipi = ${type}`);
      
      // Gerçekçi görünmesi için iki nokta arasında ara noktalar oluştur
      const coordinates = this.generateIntermediatePoints(start, end, 5);
      
      // Rotayı çiz
      this.drawRoute(coordinates);
      
      // Mesafe hesapla
      const distance = this.calculateTotalDistance(coordinates);
      
      // Tahmini süreyi hesapla
      const duration = this.estimateDuration(distance, type);
      
      // Rota bilgilerini oluştur
      const routeInfo = {
        distance: distance,
        duration: duration,
        type: type,
        coordinates: coordinates
      };
      
      // Debug için routeInfo nesnesini konsola yazdır
      console.log('RouteInfo oluşturuldu:', routeInfo);
      
      // Route hesaplanması eventini yayınla
      this.eventBus.publish('route:calculated', routeInfo);
      
      // Kullanıcıya bilgi göster
      this.showRouteInformation(distance, duration, type);
    }
    
    /**
     * İki nokta arasında rastgele ara noktalar oluşturur
     * @param {Array} start - [lon, lat] başlangıç noktası
     * @param {Array} end - [lon, lat] bitiş noktası
     * @param {number} pointCount - Oluşturulacak ara nokta sayısı
     * @returns {Array} - [[lon1, lat1], [lon2, lat2], ...] formatında koordinatlar
     */
    generateIntermediatePoints(start, end, pointCount) {
      const result = [start];
      
      // İki konum arasında ara noktalar oluştur
      for (let i = 1; i <= pointCount; i++) {
        const ratio = i / (pointCount + 1);
        
        // Doğrusal interpolasyon
        const lon = start[0] + (end[0] - start[0]) * ratio;
        const lat = start[1] + (end[1] - start[1]) * ratio;
        
        // Biraz rastgelelik ekle (gerçekçi yol görünümü için)
        const randomOffsetLon = (Math.random() - 0.5) * 0.01;
        const randomOffsetLat = (Math.random() - 0.5) * 0.01;
        
        result.push([lon + randomOffsetLon, lat + randomOffsetLat]);
      }
      
      result.push(end);
      return result;
    }
    
    /**
     * Koordinat listesindeki toplam mesafeyi hesaplar
     * @param {Array} coordinates - [[lon1, lat1], [lon2, lat2], ...] formatında koordinatlar
     * @returns {number} - Kilometre cinsinden toplam mesafe
     */
    calculateTotalDistance(coordinates) {
      let totalDistance = 0;
      
      for (let i = 0; i < coordinates.length - 1; i++) {
        totalDistance += this.calculateDistance(coordinates[i], coordinates[i + 1]);
      }
      
      return totalDistance;
    }
    
    /**
     * İki nokta arasındaki mesafeyi hesaplar (km cinsinden)
     * @param {Array} point1 - [lon, lat] birinci nokta
     * @param {Array} point2 - [lon, lat] ikinci nokta
     * @returns {number} - Kilometre cinsinden mesafe
     */
    calculateDistance(point1, point2) {
      const lon1 = point1[0] * Math.PI / 180;
      const lon2 = point2[0] * Math.PI / 180;
      const lat1 = point1[1] * Math.PI / 180;
      const lat2 = point2[1] * Math.PI / 180;
      
      // Haversine formülü
      const dlon = lon2 - lon1;
      const dlat = lat2 - lat1;
      const a = Math.pow(Math.sin(dlat / 2), 2) + 
                Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(dlon / 2), 2);
      const c = 2 * Math.asin(Math.sqrt(a));
      const r = 6371; // Dünya yarıçapı (km)
      
      return c * r;
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
  Tahmini süre: ${Math.round(duration)} dakika
  
  Not: Bu basit bir hesaplamadır. Gerçek rota hesaplaması ileride eklenecektir.`);
    }
  }