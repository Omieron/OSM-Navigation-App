/**
 * RouteSelector - Başlangıç ve bitiş noktalarını seçmeyi yöneten modül
 */
export default class RouteSelector {
    /**
     * RouteSelector sınıfını başlatır
     * @param {Object} config - Konfigürasyon ayarları
     * @param {Object} eventBus - Modüller arası iletişim için EventBus
     */
    constructor(config, eventBus) {
      this.config = config;
      this.eventBus = eventBus;
      this.startMarker = null;
      this.endMarker = null;
      this.currentSelectionMode = null; // 'start', 'end' veya null
      
      // EventBus olaylarını dinle
      this.eventBus.subscribe('map:clicked', this.handleMapClick.bind(this));
      this.eventBus.subscribe('selector:setMode', this.setSelectionMode.bind(this));
      this.eventBus.subscribe('selector:clear', this.clearRouteMarkers.bind(this));
      
      this.init();
    }
    
    /**
     * Başlangıç işlemlerini yapar ve UI elementlerine event listener'lar ekler
     */
    init() {
      // UI butonlarına olay dinleyicileri ekle
      document.getElementById('select-start').addEventListener('click', () => {
        this.setSelectionMode('start');
      });
    
      document.getElementById('select-end').addEventListener('click', () => {
        this.setSelectionMode('end');
      });
    
      document.getElementById('clear-route').addEventListener('click', () => {
        this.clearRouteMarkers();
      });
    
      document.getElementById('calculate-route').addEventListener('click', () => {
        this.requestRouteCalculation();
      });
      
      // UI durumunu güncelle
      this.updateSelectionStatus();
    }
    
    /**
     * Seçim modunu ayarlar (başlangıç veya bitiş noktası seçimi)
     * @param {string} mode - 'start', 'end' veya null
     */
    setSelectionMode(mode) {
      this.currentSelectionMode = mode;
      this.updateSelectionStatus();
    }
    
    /**
     * UI'daki seçim durumunu günceller
     */
    updateSelectionStatus() {
      const startButton = document.getElementById('select-start');
      const endButton = document.getElementById('select-end');
      const statusText = document.getElementById('selection-status');
      const calcButton = document.getElementById('calculate-route');
      
      // Butonların active durumlarını güncelle
      startButton.classList.toggle('active', this.currentSelectionMode === 'start');
      endButton.classList.toggle('active', this.currentSelectionMode === 'end');
      
      // Durum metnini güncelle
      if (this.currentSelectionMode === 'start') {
        statusText.textContent = 'Başlangıç noktası seçmek için haritaya tıklayın';
        statusText.style.color = this.config.markers.start.fillColor;
      } else if (this.currentSelectionMode === 'end') {
        statusText.textContent = 'Bitiş noktası seçmek için haritaya tıklayın';
        statusText.style.color = this.config.markers.end.fillColor;
      } else {
        statusText.textContent = 'Rota seçimi için bir işlem seçin';
        statusText.style.color = '#333';
      }
      
      // Rota hesaplama butonunun durumunu güncelle
      calcButton.disabled = !(this.startMarker && this.endMarker);
    }
    
    /**
     * Harita tıklamasını işler
     * @param {Object} data - {coordinate: [x, y], lonLat: [lon, lat]}
     */
    handleMapClick(data) {
      if (!this.currentSelectionMode) return;
      
      console.log(`Tıklanan nokta: ${data.lonLat[0].toFixed(6)}, ${data.lonLat[1].toFixed(6)}`);
      
      if (this.currentSelectionMode === 'start') {
        this.setStartMarker(data.coordinate);
      } else if (this.currentSelectionMode === 'end') {
        this.setEndMarker(data.coordinate);
      }
      
      // Seçim modunu sıfırla
      this.currentSelectionMode = null;
      this.updateSelectionStatus();
    }
    
    /**
     * Başlangıç noktası marker'ını ayarlar
     * @param {Array} coordinate - [x, y] OpenLayers koordinatı
     */
    setStartMarker(coordinate) {
      // Eğer zaten bir başlangıç marker'ı varsa, kaldır
      if (this.startMarker) {
        this.eventBus.publish('map:removeFeature', this.startMarker);
      }
      
      // Yeni marker oluştur
      this.startMarker = new ol.Feature({
        geometry: new ol.geom.Point(coordinate),
        type: 'start'
      });
      
      // Marker'ı haritaya ekle
      this.eventBus.publish('map:addFeature', this.startMarker);
    }
    
    /**
     * Bitiş noktası marker'ını ayarlar
     * @param {Array} coordinate - [x, y] OpenLayers koordinatı
     */
    setEndMarker(coordinate) {
      // Eğer zaten bir bitiş marker'ı varsa, kaldır
      if (this.endMarker) {
        this.eventBus.publish('map:removeFeature', this.endMarker);
      }
      
      // Yeni marker oluştur
      this.endMarker = new ol.Feature({
        geometry: new ol.geom.Point(coordinate),
        type: 'end'
      });
      
      // Marker'ı haritaya ekle
      this.eventBus.publish('map:addFeature', this.endMarker);
    }
    
     /**
   * Rota marker'larını ve çizilen rotayı temizler
   */
  clearRouteMarkers() {
    if (this.startMarker) {
      this.eventBus.publish('map:removeFeature', this.startMarker);
      this.startMarker = null;
    }
    
    if (this.endMarker) {
      this.eventBus.publish('map:removeFeature', this.endMarker);
      this.endMarker = null;
    }
    
    // Çizilen rotayı da temizle
    this.eventBus.publish('route:clear');
    
    this.currentSelectionMode = null;
    this.updateSelectionStatus();
  }
    
    /**
     * Rota hesaplama isteği gönderir
     */
    requestRouteCalculation() {
      if (!this.startMarker || !this.endMarker) {
        alert('Rota hesaplamak için başlangıç ve bitiş noktalarını seçmelisiniz.');
        return;
      }
      
      const startCoord = ol.proj.toLonLat(this.startMarker.getGeometry().getCoordinates());
      const endCoord = ol.proj.toLonLat(this.endMarker.getGeometry().getCoordinates());
      
      console.log('Rota hesaplanıyor:');
      console.log(`Başlangıç: ${startCoord[0].toFixed(6)}, ${startCoord[1].toFixed(6)}`);
      console.log(`Bitiş: ${endCoord[0].toFixed(6)}, ${endCoord[1].toFixed(6)}`);
      
      // Rota hesaplama isteğini EventBus üzerinden yayınla
      this.eventBus.publish('route:calculate', {
        start: startCoord,
        end: endCoord,
        type: this.config.routing.vehicleType
      });
    }
  }