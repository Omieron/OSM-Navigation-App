export default class TrafficLayerManager {
  
  constructor(config, eventBus, map, trafficDataManager) {
    this.config = config;
    this.eventBus = eventBus;
    this.map = map;
    this.trafficDataManager = trafficDataManager;
    
    this.trafficSource = new ol.source.Vector();
    this.trafficLayer = new ol.layer.Vector({
      source: this.trafficSource,
      style: this.trafficSegmentStyle.bind(this),
      visible: false,
      zIndex: 5 // Rota katmanının altında
    });
    
    this.currentTrafficSegments = [];
    this.updateInterval = null;
    this.isVisible = false;
    
    this.map.addLayer(this.trafficLayer);
    
    this.eventBus.subscribe('traffic:toggle', this.toggleTrafficLayer.bind(this));
    this.eventBus.subscribe('map:moveend', this.onMapMoveEnd.bind(this));
  }


  async toggleTrafficLayer(forceState) {
    this.isVisible = forceState !== undefined ? forceState : !this.isVisible;
    
    if (this.isVisible) {
      console.log('🚦 Trafik katmanı açılıyor...');
      this.trafficLayer.setVisible(true);
      
      await this.loadTrafficForCurrentView();
      
      this.startAutoUpdate();
      
      console.log('✅ Trafik katmanı aktif');
    } else {
      console.log('🚫 Trafik katmanı kapatılıyor...');
      this.trafficLayer.setVisible(false);
      this.clearTrafficSegments();
      this.stopAutoUpdate();
      
      console.log('✅ Trafik katmanı kapatıldı');
    }
    
    this.updateTrafficButton();
  }


  async loadTrafficForCurrentView() {
    try {

      const view = this.map.getView();
      const extent = view.calculateExtent(this.map.getSize());
      const zoom = view.getZoom();
      
      if (zoom < this.config.traffic.minZoomLevel) {
        console.log(`⚠️ Zoom seviyesi çok düşük (${zoom.toFixed(1)}), trafik gösterilmiyor`);
        return;
      }
      
      console.log(`🗺️ Zoom ${zoom.toFixed(1)} seviyesinde trafik verileri yükleniyor...`);
      
      const roadSegments = this.generateRoadGridForView(extent, zoom);
      console.log(`🛣️ ${roadSegments.length} yol segmenti tespit edildi`);
      
      // Her segment için trafik verisi çek
      this.eventBus.publish('traffic:loading', true);
      
      const trafficPromises = roadSegments.map(segment => 
        this.trafficDataManager.getSegmentTraffic(segment)
      );
      
      const trafficData = await Promise.all(trafficPromises);
      
      this.displayTrafficSegments(roadSegments, trafficData);
      
      this.eventBus.publish('traffic:loading', false);
      
      const stats = this.trafficDataManager.getStats();
      console.log(`📊 Trafik yüklendi: ${stats.hitRate}% cache hit rate`);
      
    } catch (error) {
      console.error('❌ Trafik verileri yüklenirken hata:', error);
      this.eventBus.publish('traffic:loading', false);
    }
  }

  /**
   * Görünüm için yol grid'i oluşturur
   * Gerçek haritada bu OSM verilerinden gelecek, şimdilik grid yaklaşımı
   */
  generateRoadGridForView(extent, zoom) {
    const segments = [];
    
    const [minX, minY, maxX, maxY] = ol.proj.transformExtent(
      extent, 
      'EPSG:3857', 
      'EPSG:4326'
    );
    
    const gridSize = this.calculateGridSize(zoom);
    
    const latStep = (maxY - minY) / gridSize;
    for (let i = 0; i < gridSize; i++) {
      const lat = minY + (latStep * i);
      segments.push({
        start: [lat, minX],
        end: [lat, maxX],
        distance: this.calculateDistance([minX, lat], [maxX, lat]) / 1000, // km
        type: 'horizontal'
      });
    }
    
    const lonStep = (maxX - minX) / gridSize;
    for (let i = 0; i < gridSize; i++) {
      const lon = minX + (lonStep * i);
      segments.push({
        start: [minY, lon],
        end: [maxY, lon],
        distance: this.calculateDistance([lon, minY], [lon, maxY]) / 1000, // km
        type: 'vertical'
      });
    }
    
    return segments;
  }

  calculateGridSize(zoom) {
    if (zoom >= 15) return 8;      // Şehir içi detay
    if (zoom >= 12) return 6;      // Şehir genel
    if (zoom >= 10) return 4;      // Bölge
    return 3;                      // Ülke/il
  }

  displayTrafficSegments(roadSegments, trafficData) {

    this.clearTrafficSegments();
    
    roadSegments.forEach((segment, index) => {
      const traffic = trafficData[index];
      
      const coordinates = [
        ol.proj.fromLonLat([segment.start[1], segment.start[0]]), // [lon, lat]
        ol.proj.fromLonLat([segment.end[1], segment.end[0]])       // [lon, lat]
      ];
      
      const lineFeature = new ol.Feature({
        geometry: new ol.geom.LineString(coordinates),
        trafficSpeed: traffic.currentSpeed,
        freeFlowSpeed: traffic.freeFlowSpeed,
        trafficFactor: traffic.trafficFactor,
        confidence: traffic.confidence,
        segmentType: segment.type
      });
      
      this.trafficSource.addFeature(lineFeature);
    });
    
    console.log(`🎨 ${roadSegments.length} trafik segmenti haritada gösteriliyor`);
  }


  trafficSegmentStyle(feature) {
    const trafficFactor = feature.get('trafficFactor') || 1;
    const confidence = feature.get('confidence') || 0.5;
    
    let color;
    if (trafficFactor <= 1.15) {
      color = this.config.traffic.colors.good;        // Yeşil (akıcı)
    } else if (trafficFactor <= 1.4) {
      color = this.config.traffic.colors.moderate;    // Sarı (orta)
    } else {
      color = this.config.traffic.colors.bad;         // Kırmızı (yoğun)
    }
    
    const opacity = Math.max(0.3, confidence);
    const finalColor = color.replace(/rgba?\((.+)\)/, `rgba($1, ${opacity})`);
    
    return new ol.style.Style({
      stroke: new ol.style.Stroke({
        color: finalColor,
        width: this.config.traffic.lineWidth,
        lineCap: 'round'
      })
    });
  }


  clearTrafficSegments() {
    this.trafficSource.clear();
    this.currentTrafficSegments = [];
  }


  onMapMoveEnd() {
    // Trafik katmanı açıksa ve hareket önemli ise yeniden yükle
    if (this.isVisible) {
      // Debounce ile çok sık güncellemeyi engelle
      clearTimeout(this.moveTimeout);
      this.moveTimeout = setTimeout(() => {
        this.loadTrafficForCurrentView();
      }, 1000); 
    }
  }

  startAutoUpdate() {
    this.stopAutoUpdate(); 
    
    this.updateInterval = setInterval(() => {
      if (this.isVisible) {
        console.log('🔄 Trafik verileri otomatik güncelleniyor...');
        this.loadTrafficForCurrentView();
      }
    }, this.config.traffic.refreshInterval); 
  }

  
  stopAutoUpdate() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  
  updateTrafficButton() {
    const button = document.getElementById('toggle-traffic');
    if (button) {
      button.classList.toggle('active', this.isVisible);
      button.textContent = this.isVisible ? 
        'Trafik Katmanını Kapat' : 
        'Trafik Katmanını Aç';
    }
  }

  
  calculateDistance(coord1, coord2) {
    const R = 6371000; 
    const lat1 = coord1[1] * Math.PI / 180;
    const lat2 = coord2[1] * Math.PI / 180;
    const deltaLat = (coord2[1] - coord1[1]) * Math.PI / 180;
    const deltaLon = (coord2[0] - coord1[0]) * Math.PI / 180;

    const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLon/2) * Math.sin(deltaLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

 
  destroy() {
    this.stopAutoUpdate();
    this.clearTrafficSegments();
    if (this.trafficLayer) {
      this.map.removeLayer(this.trafficLayer);
    }
  }
}