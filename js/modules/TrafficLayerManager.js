/**
 * TrafficLayerManager - Görsel sorunları düzeltilmiş versiyon
 * 
 * Düzeltilen sorunlar:
 * 1. Segment koordinat dönüşümü düzeltildi
 * 2. Stil fonksiyonu optimize edildi  
 * 3. Grid sistemi iyileştirildi
 * 4. Debug bilgileri artırıldı
 */
export default class TrafficLayerManager {
  
  constructor(config, eventBus, map, trafficDataManager) {
    this.config = config;
    this.eventBus = eventBus;
    this.map = map;
    this.trafficDataManager = trafficDataManager;
    
    this.trafficSource = new ol.source.Vector();
    this.trafficLayer = new ol.layer.Vector({
      source: this.trafficSource,
      style: this.trafficSegmentStyle.bind(this), // ✅ Bind eklendi
      visible: false,
      zIndex: 5
    });
    
    this.currentTrafficSegments = [];
    this.updateInterval = null;
    this.isVisible = false;
    
    this.map.addLayer(this.trafficLayer);
    
    this.eventBus.subscribe("traffic:toggle", this.toggleTrafficLayer.bind(this));
    this.eventBus.subscribe("map:moveend", this.onMapMoveEnd.bind(this));
    
    console.log("🚦 TrafficLayerManager başlatıldı");
  }

  async toggleTrafficLayer(forceState) {
    this.isVisible = forceState !== undefined ? forceState : !this.isVisible;
    
    if (this.isVisible) {
      console.log("🚦 Trafik katmanı açılıyor...");
      this.trafficLayer.setVisible(true);
      
      await this.loadTrafficForCurrentView();
      this.startAutoUpdate();
      
      console.log("✅ Trafik katmanı aktif");
    } else {
      console.log("🚫 Trafik katmanı kapatılıyor...");
      this.trafficLayer.setVisible(false);
      this.clearTrafficSegments();
      this.stopAutoUpdate();
      
      console.log("✅ Trafik katmanı kapatıldı");
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
        this.clearTrafficSegments();
        return;
      }
      
      console.log(`🗺️ Zoom ${zoom.toFixed(1)} seviyesinde trafik verileri yükleniyor...`);
      
      // 🔧 DÜZELTİLDİ: Daha iyi road grid sistemi
      const roadSegments = this.generateRoadGridForView(extent, zoom);
      console.log(`🛣️ ${roadSegments.length} yol segmenti tespit edildi`);
      
      this.eventBus.publish("traffic:loading", true);
      
      // Her segment için trafik verisi al
      const trafficPromises = roadSegments.map(segment => 
        this.trafficDataManager.getSegmentTraffic(segment)
      );
      
      const trafficData = await Promise.all(trafficPromises);
      
      // Segment'leri görüntüle
      this.displayTrafficSegments(roadSegments, trafficData);
      
      this.eventBus.publish("traffic:loading", false);
      
      const stats = this.trafficDataManager.getStats();
      console.log(`📊 Trafik yüklendi: ${stats.hitRate}% cache hit rate`);
      
    } catch (error) {
      console.error("❌ Trafik verileri yüklenirken hata:", error);
      this.eventBus.publish("traffic:loading", false);
    }
  }

  /**
   * 🔧 DÜZELTİLDİ: Görünüm için yol grid'i oluşturur - Daha akıllı algoritma
   */
  generateRoadGridForView(extent, zoom) {
    const segments = [];
    
    // 🔧 Extent'i doğru şekilde dönüştür
    const [minX, minY, maxX, maxY] = ol.proj.transformExtent(
      extent, 
      "EPSG:3857", 
      "EPSG:4326"
    );
    
    console.log(`🗺️ Viewport bounds: ${minX.toFixed(4)}, ${minY.toFixed(4)} - ${maxX.toFixed(4)}, ${maxY.toFixed(4)}`);
    
    const gridSize = this.calculateGridSize(zoom);
    
    // 🔧 Daha doğal yol ağı oluştur
    const latStep = (maxY - minY) / gridSize;
    const lonStep = (maxX - minX) / gridSize;
    
    // Horizontal yollar (doğu-batı) - ana yollar
    for (let i = 1; i < gridSize; i++) {
      const lat = minY + (latStep * i);
      const segment = {
        start: [lat, minX], // [lat, lon]
        end: [lat, maxX],   // [lat, lon]
        distance: this.calculateDistance([minX, lat], [maxX, lat]) / 1000,
        type: "horizontal",
        importance: i % 2 === 0 ? "main" : "secondary" // Ana ve yan yollar
      };
      
      // Çok kısa segment'leri atla
      if (segment.distance > 0.5) {
        segments.push(segment);
      }
    }
    
    // Vertical yollar (kuzey-güney) - bağlantı yolları
    for (let i = 1; i < gridSize; i++) {
      const lon = minX + (lonStep * i);
      const segment = {
        start: [minY, lon], // [lat, lon]
        end: [maxY, lon],   // [lat, lon]
        distance: this.calculateDistance([lon, minY], [lon, maxY]) / 1000,
        type: "vertical",
        importance: i % 2 === 0 ? "main" : "secondary"
      };
      
      // Çok kısa segment'leri atla
      if (segment.distance > 0.5) {
        segments.push(segment);
      }
    }
    
    console.log(`🛣️ Grid oluşturuldu: ${segments.length} segment (${gridSize}x${gridSize} grid)`);
    return segments;
  }

  /**
   * 🔧 DÜZELTİLDİ: Grid boyutunu zoom'a göre hesapla
   */
  calculateGridSize(zoom) {
    if (zoom >= 16) return 12;     // Mahalle seviyesi - çok detay
    if (zoom >= 14) return 8;      // Şehir içi detay
    if (zoom >= 12) return 6;      // Şehir genel
    if (zoom >= 10) return 4;      // Bölge
    return 3;                      // Ülke/il
  }

  /**
   * 🔧 DÜZELTİLDİ: Trafik segment'lerini görüntüle
   */
  displayTrafficSegments(roadSegments, trafficData) {
    // Önce mevcut segment'leri temizle
    this.clearTrafficSegments();
    
    console.log(`🎨 ${roadSegments.length} trafik segmenti işleniyor...`);
    
    let validSegments = 0;
    
    roadSegments.forEach((segment, index) => {
      const traffic = trafficData[index];
      
      // 🔧 DÜZELTİLDİ: Koordinat dönüşümü
      const startCoord = ol.proj.fromLonLat([segment.start[1], segment.start[0]]); // [lon, lat]
      const endCoord = ol.proj.fromLonLat([segment.end[1], segment.end[0]]);       // [lon, lat]
      
      // Koordinat doğruluğunu kontrol et
      if (!startCoord || !endCoord || isNaN(startCoord[0]) || isNaN(endCoord[0])) {
        console.warn(`⚠️ Geçersiz koordinat: segment ${index}`);
        return;
      }
      
      // LineString feature oluştur
      const lineFeature = new ol.Feature({
        geometry: new ol.geom.LineString([startCoord, endCoord]),
        // ✅ Feature property'leri doğru şekilde ayarlandı
        trafficSpeed: traffic.currentSpeed || 45,
        freeFlowSpeed: traffic.freeFlowSpeed || 50,
        trafficFactor: traffic.trafficFactor || 1.1,
        confidence: traffic.confidence || 0.7,
        segmentType: segment.type,
        segmentImportance: segment.importance || "main",
        segmentId: `${segment.type}_${index}`, // Debug için
        fallback: traffic.fallback || false
      });
      
      this.trafficSource.addFeature(lineFeature);
      validSegments++;
    });
    
    console.log(`✅ ${validSegments}/${roadSegments.length} geçerli trafik segmenti haritada gösteriliyor`);
    
    // Katmanı yeniden render et
    this.trafficLayer.changed();
    
    // Cache durumu
    this.trafficDataManager.logCacheStatus();
  }

  /**
   * ✅ DÜZELTİLMİŞ: Trafik segment stil fonksiyonu - Daha görsel
   */
  trafficSegmentStyle(feature) {
    // Feature'dan trafik verilerini al
    const trafficFactor = feature.get("trafficFactor") || 1.0;
    const confidence = feature.get("confidence") || 0.5;
    const importance = feature.get("segmentImportance") || "main";
    const fallback = feature.get("fallback") || false;
    
    // 🔧 Debug: İlk birkaç segment için stil bilgilerini logla
    const segmentId = feature.get("segmentId");
    if (segmentId && (segmentId.endsWith("_0") || segmentId.endsWith("_1"))) {
      console.log(`🎨 Stil: ${segmentId} - Factor: ${trafficFactor.toFixed(2)}, Confidence: ${confidence.toFixed(2)}`);
    }
    
    // Trafik durumuna göre renk belirle
    let color;
    if (trafficFactor <= 1.15) {
      color = this.config.traffic.colors.good;        // Yeşil (akıcı)
    } else if (trafficFactor <= 1.4) {
      color = this.config.traffic.colors.moderate;    // Sarı (orta)
    } else {
      color = this.config.traffic.colors.bad;         // Kırmızı (yoğun)
    }
    
    // Çizgi kalınlığını öneme göre ayarla
    let lineWidth = this.config.traffic.lineWidth || 4;
    if (importance === "main") {
      lineWidth += 2; // Ana yollar daha kalın
    }
    
    // Opacity'yi confidence'a göre ayarla
    let opacity = Math.max(0.4, Math.min(1.0, confidence));
    
    // Fallback data ise daha şeffaf
    if (fallback) {
      opacity *= 0.6;
      lineWidth = Math.max(2, lineWidth - 1);
    }
    
    // RGBA formatında final renk
    let finalColor;
    if (color.includes("rgba")) {
      // Mevcut rgba'nın opacity'sini güncelle
      finalColor = color.replace(/,\s*[\d.]+\)/, `, ${opacity})`);
    } else if (color.includes("rgb")) {
      // RGB'yi RGBA'ya çevir
      finalColor = color.replace("rgb", "rgba").replace(")", `, ${opacity})`);
    } else {
      // Hex veya named color için default opacity
      finalColor = color;
    }
    
    // Style oluştur ve döndür
    return new ol.style.Style({
      stroke: new ol.style.Stroke({
        color: finalColor,
        width: lineWidth,
        lineCap: "round",
        lineJoin: "round"
      })
    });
  }

  clearTrafficSegments() {
    this.trafficSource.clear();
    this.currentTrafficSegments = [];
    console.log("🧹 Trafik segment'leri temizlendi");
  }

  onMapMoveEnd() {
    if (this.isVisible) {
      // Debounce ile çok sık güncellemeyi engelle
      clearTimeout(this.moveTimeout);
      this.moveTimeout = setTimeout(() => {
        console.log("🗺️ Harita hareket etti, trafik verileri güncelleniyor...");
        this.loadTrafficForCurrentView();
      }, 1000); 
    }
  }

  startAutoUpdate() {
    this.stopAutoUpdate(); 
    
    console.log(`⏰ Otomatik güncelleme başlatıldı (${this.config.traffic.refreshInterval / 1000}s)`);
    
    this.updateInterval = setInterval(() => {
      if (this.isVisible) {
        console.log("🔄 Trafik verileri otomatik güncelleniyor...");
        this.loadTrafficForCurrentView();
      }
    }, this.config.traffic.refreshInterval); 
  }

  stopAutoUpdate() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      console.log("⏰ Otomatik güncelleme durduruldu");
    }
  }

  updateTrafficButton() {
    const button = document.getElementById("toggle-traffic");
    if (button) {
      button.classList.toggle("active", this.isVisible);
      button.textContent = this.isVisible ? 
        "Trafik Katmanını Kapat" : 
        "Trafik Katmanını Aç";
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

  /**
   * 🔧 YENİ: Debug fonksiyonu - trafik segment'lerinin durumunu kontrol eder
   */
  debugTrafficSegments() {
    const features = this.trafficSource.getFeatures();
    console.log("🔍 Debug: Trafik segment'leri:", {
      count: features.length,
      visible: this.trafficLayer.getVisible(),
      zIndex: this.trafficLayer.getZIndex()
    });
    
    // İlk 5 segment'in detaylarını göster
    features.slice(0, 5).forEach((feature, index) => {
      const geom = feature.getGeometry();
      const coords = geom.getCoordinates();
      
      console.log(`🔍 Segment ${index}:`, {
        trafficFactor: feature.get("trafficFactor"),
        confidence: feature.get("confidence"),
        type: feature.get("segmentType"),
        importance: feature.get("segmentImportance"),
        fallback: feature.get("fallback"),
        startCoord: coords[0],
        endCoord: coords[1],
        length: Math.round(geom.getLength())
      });
    });
    
    // Cache durumunu göster
    this.trafficDataManager.logCacheStatus();
  }

  /**
   * 🔧 YENİ: Trafik kalitesi analizi
   */
  analyzeTrafficQuality() {
    const features = this.trafficSource.getFeatures();
    if (features.length === 0) {
      console.log("🔍 Analiz edilecek trafik verisi yok");
      return;
    }
    
    let goodTraffic = 0;
    let moderateTraffic = 0;
    let badTraffic = 0;
    let fallbackCount = 0;
    let totalConfidence = 0;
    
    features.forEach(feature => {
      const factor = feature.get("trafficFactor") || 1.0;
      const confidence = feature.get("confidence") || 0.5;
      const fallback = feature.get("fallback") || false;
      
      if (factor <= 1.15) goodTraffic++;
      else if (factor <= 1.4) moderateTraffic++;
      else badTraffic++;
      
      if (fallback) fallbackCount++;
      totalConfidence += confidence;
    });
    
    const avgConfidence = (totalConfidence / features.length).toFixed(2);
    const fallbackPercent = Math.round((fallbackCount / features.length) * 100);
    
    console.log("📊 Trafik Kalite Analizi:");
    console.log(`   🟢 İyi: ${goodTraffic} (${Math.round(goodTraffic/features.length*100)}%)`);
    console.log(`   🟡 Orta: ${moderateTraffic} (${Math.round(moderateTraffic/features.length*100)}%)`);
    console.log(`   🔴 Kötü: ${badTraffic} (${Math.round(badTraffic/features.length*100)}%)`);
    console.log(`   💾 Fallback: ${fallbackCount} (${fallbackPercent}%)`);
    console.log(`   🎯 Ortalama Güven: ${avgConfidence}`);
  }

  destroy() {
    this.stopAutoUpdate();
    this.clearTrafficSegments();
    if (this.trafficLayer) {
      this.map.removeLayer(this.trafficLayer);
    }
    console.log("🛑 TrafficLayerManager destroyed");
  }
}

// Global debug fonksiyonları
window.debugTraffic = function() {
  if (window.app && window.app.trafficManager && window.app.trafficManager.layerManager) {
    window.app.trafficManager.layerManager.debugTrafficSegments();
  } else {
    console.warn("Traffic manager bulunamadı!");
  }
};

window.analyzeTraffic = function() {
  if (window.app && window.app.trafficManager && window.app.trafficManager.layerManager) {
    window.app.trafficManager.layerManager.analyzeTrafficQuality();
  } else {
    console.warn("Traffic manager bulunamadı!");
  }
};

window.clearTrafficCache = function() {
  if (window.app && window.app.trafficManager && window.app.trafficManager.dataManager) {
    window.app.trafficManager.dataManager.clearCache();
    console.log("✅ Cache temizlendi");
  } else {
    console.warn("Traffic data manager bulunamadı!");
  }
};