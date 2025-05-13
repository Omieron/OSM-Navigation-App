/**
 * TrafficStyler - Trafik görselleştirme işlemlerini yöneten sınıf
 */
export default class TrafficStyler {
  /**
   * TrafficStyler sınıfını başlatır
   * @param {Object} config - Konfigürasyon ayarları
   */
  constructor(config) {
    this.config = config;
  }
  
  /**
   * Trafik rota stili için stil fonksiyonu
   * @param {ol.Feature} feature - Stil uygulanacak feature
   * @param {boolean} isTrafficVisible - Trafik görünürlük durumu
   * @returns {ol.style.Style} - Oluşturulan stil
   */
  trafficRouteStyle(feature, isTrafficVisible) {
    // Eğer feature trafik-rota değilse veya görünür değilse, stil döndürme
    if (feature.get('type') !== 'traffic-route' || !isTrafficVisible) {
      return null;
    }
    
    // Trafik durumunu al
    const trafficCondition = feature.get('trafficCondition') || 'good';
    
    // Segmentlere göre stil oluştur
    const segmentTraffic = feature.get('segmentTraffic');
    const segmentCount = feature.get('segmentCount');
    
    // Eğer segment trafik bilgisi yoksa, genel trafik durumuna göre tek bir stil döndür
    if (!segmentTraffic || segmentCount <= 1) {
      return this.createSingleRouteStyle(trafficCondition);
    }
    
    // Segmentlere göre çoklu stil oluştur
    return this.createSegmentStyles(feature, segmentTraffic, segmentCount);
  }
  
  /**
   * Tek parça rota stili oluşturur
   * @param {string} trafficCondition - Trafik durumu ('good', 'moderate', 'bad')
   * @returns {ol.style.Style} - Oluşturulan stil
   */
  createSingleRouteStyle(trafficCondition) {
    // Trafik durumuna göre renk belirle
    const color = this.getColorForCondition(trafficCondition);
    
    // Stil oluştur
    return new ol.style.Style({
      stroke: new ol.style.Stroke({
        color: color,
        width: this.config.routeStyle.lineWidth + 2, // Biraz daha kalın
        lineCap: 'round',
        lineJoin: 'round'
      })
    });
  }
  
  /**
   * Segment bazlı çoklu stil oluşturur
   * @param {ol.Feature} feature - Rota feature'ı
   * @param {Array} segmentTraffic - Segment trafik durumları
   * @param {number} segmentCount - Segment sayısı
   * @returns {Array} - Stil dizisi
   */
  createSegmentStyles(feature, segmentTraffic, segmentCount) {
    const geometry = feature.getGeometry();
    const coordinates = geometry.getCoordinates();
    
    // Multi-style için stil dizisi
    const styles = [];
    
    // Her segment için segment uzunluğunu hesapla
    const segmentLength = Math.floor(coordinates.length / segmentCount);
    
    // Her segment için ayrı stil oluştur
    for (let i = 0; i < segmentCount; i++) {
      // Segment başlangıç ve bitiş indeksleri
      const start = i * segmentLength;
      const end = (i === segmentCount - 1) ? coordinates.length : (i + 1) * segmentLength;
      
      // Segment trafik durumunu al
      const segCondition = segmentTraffic[i] || 'good';
      
      // Segment rengi
      const color = this.getColorForCondition(segCondition);
      
      // Segment koordinatları
      const segCoords = coordinates.slice(start, end);
      
      // Segment için stil oluştur
      styles.push(new ol.style.Style({
        geometry: new ol.geom.LineString(segCoords),
        stroke: new ol.style.Stroke({
          color: color,
          width: this.config.routeStyle.lineWidth + 2, // Biraz daha kalın
          lineCap: 'round',
          lineJoin: 'round'
        })
      }));
    }
    
    return styles;
  }
  
  /**
   * Trafik durumuna göre renk döndürür
   * @param {string} condition - Trafik durumu ('good', 'moderate', 'bad')
   * @returns {string} - Renk kodu
   */
  getColorForCondition(condition) {
    switch (condition) {
      case 'good':
        return this.config.traffic.colors.good;
      case 'moderate':
        return this.config.traffic.colors.moderate;
      case 'bad':
        return this.config.traffic.colors.bad;
      default:
        return this.config.traffic.colors.good;
    }
  }
}