/**
 * RouteTrafficOverlay - Sadece çizilen rotayı trafik durumuna göre renklendirir
 * 
 * ✅ Grid sistemi YOK - sadece mevcut rota çizgisi
 * ✅ Rota segmentlere bölünür ve her segment renklenir
 * ✅ Yeşil/Sarı/Kırmızı trafik renkleri
 */
export default class RouteTrafficOverlay {
    
    constructor(config, eventBus, map, trafficDataManager) {
        this.config = config;
        this.eventBus = eventBus;
        this.map = map;
        this.trafficDataManager = trafficDataManager;
        
        // Trafik renkli rota için ayrı layer
        this.trafficRouteSource = new ol.source.Vector();
        this.trafficRouteLayer = new ol.layer.Vector({
            source: this.trafficRouteSource,
            style: this.trafficRouteStyle.bind(this),
            visible: false,
            zIndex: 15 // Normal rotanın üstünde
        });
        
        this.map.addLayer(this.trafficRouteLayer);
        
        this.currentRoute = null;
        this.trafficSegments = [];
        this.isVisible = false;
        
        // Event'leri dinle
        this.eventBus.subscribe("route:calculated", this.onRouteCalculated.bind(this));
        this.eventBus.subscribe("route:clear", this.onRouteClear.bind(this));
        this.eventBus.subscribe("traffic:overlay:toggle", this.onTrafficToggle.bind(this)); // ✅ DÜZELTİLDİ: Farklı event adı
        
        console.log("🎨 RouteTrafficOverlay başlatıldı (sadece rota renklendirme)");
    }
    
    /**
     * Yeni rota hesaplandığında çağrılır
     */
    async onRouteCalculated(routeData) {
        this.currentRoute = routeData;
        
        if (!routeData.coordinates || routeData.coordinates.length < 2) {
            console.warn("❌ Rota koordinatları bulunamadı");
            return;
        }
        
        console.log("🗺️ Rota alındı, trafik analizi hazırlanıyor...");
        
        // Eğer trafik görünürse, analizi başlat
        if (this.isVisible) {
            await this.analyzeRouteTraffic();
        }
    }
    
    /**
     * Trafik toggle edildiğinde
     */
    async onTrafficToggle(isVisible) {
        this.isVisible = isVisible;
        this.trafficRouteLayer.setVisible(isVisible);
        
        if (isVisible && this.currentRoute) {
            console.log("🚦 Rota trafik analizi başlatılıyor...");
            await this.analyzeRouteTraffic();
        } else {
            console.log("🚫 Trafik renklendirmesi kapatıldı");
            this.clearTrafficRoute();
        }
    }
    
    /**
     * Rota üzerindeki trafiği analiz eder ve renklendirir
     */
    async analyzeRouteTraffic() {
        if (!this.currentRoute || !this.currentRoute.coordinates) {
            console.warn("❌ Analiz edilecek rota bulunamadı");
            return;
        }
        
        try {
            this.eventBus.publish("traffic:loading", true);
            
            // 1. Rotayı segmentlere böl
            const routeSegments = this.createRouteSegments(this.currentRoute.coordinates);
            console.log(`📏 Rota ${routeSegments.length} segmente bölündü`);
            
            // 2. Her segment için trafik verisi al
            console.log("🌐 Segment trafik verileri alınıyor...");
            const trafficPromises = routeSegments.map(segment => 
                this.trafficDataManager.getSegmentTraffic(segment)
            );
            
            const trafficData = await Promise.all(trafficPromises);
            
            // 3. Trafik verilerini segmentlerle birleştir
            this.trafficSegments = routeSegments.map((segment, index) => ({
                ...segment,
                traffic: trafficData[index]
            }));
            
            // 4. Renkli rota segmentlerini oluştur ve göster
            this.createColoredRouteSegments();
            
            this.eventBus.publish("traffic:loading", false);
            
            const stats = this.trafficDataManager.getStats();
            console.log(`✅ Rota trafik analizi tamamlandı: ${stats.hitRate}% cache hit`);
            
        } catch (error) {
            console.error("❌ Rota trafik analizi hatası:", error);
            this.eventBus.publish("traffic:loading", false);
        }
    }
    
    /**
     * Rota koordinatlarını segmentlere böler
     */
    createRouteSegments(coordinates, maxSegmentLength = 1000) {
        const segments = [];
        let currentDistance = 0;
        let segmentStart = coordinates[0];
        let segmentStartIndex = 0;
        
        for (let i = 1; i < coordinates.length; i++) {
            // İki koordinat arası mesafe hesapla (metre)
            const distance = this.calculateDistance(
                [coordinates[i-1][1], coordinates[i-1][0]], // [lat, lon]
                [coordinates[i][1], coordinates[i][0]]       // [lat, lon]
            );
            
            currentDistance += distance;
            
            // Segment uzunluğu aşıldığında veya son koordinatta segment oluştur
            if (currentDistance >= maxSegmentLength || i === coordinates.length - 1) {
                segments.push({
                    start: [segmentStart[1], segmentStart[0]], // [lat, lon] formatına çevir
                    end: [coordinates[i][1], coordinates[i][0]], // [lat, lon] formatına çevir
                    distance: currentDistance / 1000, // metre -> km
                    startCoordinate: segmentStart,
                    endCoordinate: coordinates[i],
                    startIndex: segmentStartIndex,
                    endIndex: i,
                    coordinateRange: coordinates.slice(segmentStartIndex, i + 1)
                });
                
                // Sonraki segment için başlangıç noktasını güncelle
                segmentStart = coordinates[i];
                segmentStartIndex = i;
                currentDistance = 0;
            }
        }
        
        return segments;
    }
    
    /**
     * Renkli rota segmentlerini oluşturur ve haritaya ekler
     */
    createColoredRouteSegments() {
        // Önce mevcut trafik rotasını temizle
        this.trafficRouteSource.clear();
        
        console.log(`🎨 ${this.trafficSegments.length} renkli segment oluşturuluyor...`);
        
        this.trafficSegments.forEach((segment, index) => {
            // Segment koordinatlarını OpenLayers formatına çevir
            const olCoordinates = segment.coordinateRange.map(coord => 
                ol.proj.fromLonLat([coord[0], coord[1]]) // [lon, lat] -> Web Mercator
            );
            
            // LineString feature oluştur
            const segmentFeature = new ol.Feature({
                geometry: new ol.geom.LineString(olCoordinates),
                trafficFactor: segment.traffic.trafficFactor || 1.0,
                confidence: segment.traffic.confidence || 0.7,
                currentSpeed: segment.traffic.currentSpeed || 50,
                freeFlowSpeed: segment.traffic.freeFlowSpeed || 50,
                segmentIndex: index,
                segmentType: "route",
                fallback: segment.traffic.fallback || false
            });
            
            this.trafficRouteSource.addFeature(segmentFeature);
        });
        
        console.log(`✅ ${this.trafficSegments.length} renkli rota segmenti haritada gösteriliyor`);
        
        // Layer'ı yeniden render et
        this.trafficRouteLayer.changed();
    }
    
    /**
     * Trafik durumuna göre rota segmenti stil fonksiyonu
     */
    trafficRouteStyle(feature) {
        const trafficFactor = feature.get("trafficFactor") || 1.0;
        const confidence = feature.get("confidence") || 0.7;
        const fallback = feature.get("fallback") || false;
        
        // 🔧 DÜZELTİLDİ: Google Maps & TomTom standartlarına uygun eşikler
        let color;
        let width = 8; // Normal rota çizgisinden daha kalın
        
        if (trafficFactor <= 1.20) {
            // Akıcı trafik - Yeşil (%80+ normal hız)
            color = "rgba(76, 175, 80, 0.9)";
        } else if (trafficFactor <= 1.50) {
            // Orta trafik - Turuncu (%67-80 normal hız)
            color = "rgba(255, 152, 0, 0.9)";
        } else {
            // Ağır trafik - Kırmızı (%67- normal hız)
            color = "rgba(244, 67, 54, 0.9)";
        }
        
        // Düşük confidence durumunda transparan yap
        if (confidence < 0.5) {
            color = color.replace("0.9", "0.6");
            width = 6;
        }
        
        // Fallback data ise daha ince çizgi
        if (fallback) {
            width = Math.max(4, width - 2);
            color = color.replace("0.9", "0.5");
        }
        
        return new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: color,
                width: width,
                lineCap: "round",
                lineJoin: "round"
            })
        });
    }
    
    /**
     * İki koordinat arası mesafe hesapla (Haversine formülü)
     */
    calculateDistance(coord1, coord2) {
        const R = 6371000; // Dünya yarıçapı (metre)

        const lat1 = coord1[0] * Math.PI / 180;
        const lat2 = coord2[0] * Math.PI / 180;
        const deltaLat = (coord2[0] - coord1[0]) * Math.PI / 180;
        const deltaLon = (coord2[1] - coord1[1]) * Math.PI / 180;

        const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }
    
    /**
     * Rota temizlendiğinde çağrılır
     */
    onRouteClear() {
        this.clearTrafficRoute();
        this.currentRoute = null;
        this.trafficSegments = [];
        
        console.log("🧹 Trafik rota overlay temizlendi");
    }
    
    /**
     * Trafik rotasını temizler
     */
    clearTrafficRoute() {
        this.trafficRouteSource.clear();
    }
    
    /**
     * Trafik analiz detaylarını döndürür
     */
    getTrafficAnalysis() {
        if (!this.trafficSegments || this.trafficSegments.length === 0) {
            return null;
        }
        
        // Genel istatistikler
        const totalSegments = this.trafficSegments.length;
        let totalDelay = 0;
        let goodSegments = 0;
        let moderateSegments = 0;
        let badSegments = 0;
        
        this.trafficSegments.forEach(segment => {
            const factor = segment.traffic.trafficFactor || 1.0;
            
            // 🔧 DÜZELTİLDİ: Google/TomTom standartlarına uygun kategoriler
            if (factor <= 1.20) {
                goodSegments++;      // %80+ normal hız
            } else if (factor <= 1.50) {
                moderateSegments++;  // %67-80 normal hız
            } else {
                badSegments++;       // %67- normal hız
            }
            
            totalDelay += (factor - 1) * segment.distance;
        });
        
        return {
            totalSegments,
            goodSegments,
            moderateSegments,
            badSegments,
            averageDelay: totalDelay / totalSegments,
            trafficDistribution: {
                good: Math.round((goodSegments / totalSegments) * 100),
                moderate: Math.round((moderateSegments / totalSegments) * 100),
                bad: Math.round((badSegments / totalSegments) * 100)
            }
        };
    }
    
    /**
     * Debug bilgileri
     */
    debugTrafficRoute() {
        console.log("🔍 Trafik Rota Debug:", {
            hasRoute: !!this.currentRoute,
            segmentCount: this.trafficSegments.length,
            layerVisible: this.trafficRouteLayer.getVisible(),
            featureCount: this.trafficRouteSource.getFeatures().length
        });
        
        if (this.trafficSegments.length > 0) {
            const analysis = this.getTrafficAnalysis();
            console.log("📊 Trafik Analizi:", analysis);
            
            // İlk birkaç segment örneği
            console.log("🔍 Segment örnekleri:");
            this.trafficSegments.slice(0, 3).forEach((seg, idx) => {
                console.log(`   ${idx}: Factor ${seg.traffic.trafficFactor.toFixed(2)}, ${seg.distance.toFixed(1)}km`);
            });
        }
    }
    
    /**
     * Temizlik işlemi
     */
    destroy() {
        this.clearTrafficRoute();
        if (this.trafficRouteLayer) {
            this.map.removeLayer(this.trafficRouteLayer);
        }
        console.log("🛑 RouteTrafficOverlay destroyed");
    }
}

// Global debug fonksiyonu
window.debugRouteTraffic = function() {
    if (window.app && window.app.routeTrafficOverlay) {
        window.app.routeTrafficOverlay.debugTrafficRoute();
    } else {
        console.warn("RouteTrafficOverlay bulunamadı!");
    }
};