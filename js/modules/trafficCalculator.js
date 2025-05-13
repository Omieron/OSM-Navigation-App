/**
 * TrafficCalculator - Trafik süre ve faktör hesaplamalarını yöneten sınıf
 */
export default class TrafficCalculator {
  /**
   * TrafficCalculator sınıfını başlatır
   * @param {Object} config - Konfigürasyon ayarları
   */
  constructor(config) {
    this.config = config;
    this.originalDuration = 0;   // Trafik olmadan orjinal süre
    this.trafficDuration = 0;    // Trafik varlığında süre
  }
  
  /**
   * Hesaplayıcıyı sıfırlar
   */
  reset() {
    this.originalDuration = 0;
    this.trafficDuration = 0;
  }
  
  /**
   * Orijinal süreyi ayarlar
   * @param {number} duration - Trafik olmadan orjinal süre (dakika)
   */
  setOriginalDuration(duration) {
    this.originalDuration = duration;
  }
  
  /**
   * Orijinal süreyi döndürür
   * @returns {number} - Trafik olmadan orjinal süre (dakika)
   */
  getOriginalDuration() {
    return this.originalDuration;
  }
  
  /**
   * Trafik varlığında süreyi döndürür
   * @returns {number} - Trafik varlığında süre (dakika)
   */
  getTrafficDuration() {
    return this.trafficDuration;
  }
  
  /**
   * Rota üzerindeki trafik durumunu hesaplar
   * @param {Object} routeData - Rota bilgileri
   * @returns {Object} - Trafik bilgileri
   */
  calculateTrafficInfo(routeData) {
    // Rotadaki trafik durumunu belirleyen bazı değerleri hesapla/tahmin et
    const distance = routeData.distance; // km cinsinden
    const normalDuration = this.originalDuration; // dakika cinsinden (normal süre)
    
    // Trafik faktörünü hesapla
    const trafficFactor = this.calculateTrafficFactor(distance, normalDuration);
    
    // Trafik varlığında tahmini süreyi hesapla
    this.trafficDuration = Math.round(normalDuration * trafficFactor);
    
    // Trafik faktörüne göre genel durumu belirle
    const trafficCondition = this.determineTrafficCondition(trafficFactor);
    
    // Segment trafik durumlarını oluştur
    const segmentInfo = this.createSegmentTrafficInfo(trafficFactor);
    
    // Trafik bilgilerini döndür
    return {
      condition: trafficCondition,
      factor: trafficFactor,
      segmentTraffic: segmentInfo.segmentTraffic,
      segmentFactors: segmentInfo.segmentFactors,
      segmentCount: segmentInfo.segmentCount
    };
  }
  
  /**
   * Trafik faktörünü hesaplar
   * @param {number} distance - Mesafe (km)
   * @param {number} normalDuration - Normal süre (dakika)
   * @returns {number} - Trafik faktörü
   */
  calculateTrafficFactor(distance, normalDuration) {
    // 1. Şehir içi/şehir dışı rota tespiti
    const isUrbanRoute = distance < 20; // 20 km'den kısa rotalar genelde şehir içi
    
    // 2. Trafik yoğunluğunu belirle
    // Şehir içi rotalar için farklı, şehir dışı için farklı faktörler
    let trafficFactor;
    
    if (isUrbanRoute) {
      // Şehir içi rotalar: Saat kontrolü (trafik saati mi?)
      const currentHour = new Date().getHours();
      const isRushHour = (currentHour >= 7 && currentHour <= 9) || 
                         (currentHour >= 17 && currentHour <= 19);
      
      if (isRushHour) {
        // Yoğun trafik saati
        trafficFactor = 1.4 + Math.random() * 0.4; // 1.4x - 1.8x arası
      } else {
        // Normal saatler
        trafficFactor = 1.1 + Math.random() * 0.3; // 1.1x - 1.4x arası
      }
    } else {
      // Şehir dışı rotalar: Genelde daha az trafik
      trafficFactor = 1.05 + Math.random() * 0.15; // 1.05x - 1.2x arası
    }
    
    return trafficFactor;
  }
  
  /**
   * Trafik faktörüne göre trafik durumunu belirler
   * @param {number} trafficFactor - Trafik faktörü
   * @returns {string} - Trafik durumu ('good', 'moderate', 'bad')
   */
  determineTrafficCondition(trafficFactor) {
    if (trafficFactor < 1.15) {
      return 'good'; // İyi trafik (yeşil)
    } else if (trafficFactor < 1.4) {
      return 'moderate'; // Orta trafik (sarı)
    } else {
      return 'bad'; // Kötü trafik (kırmızı)
    }
  }
  
  /**
   * Segment trafik durumlarını oluşturur
   * @param {number} trafficFactor - Genel trafik faktörü
   * @returns {Object} - Segment trafik bilgileri
   */
  createSegmentTrafficInfo(trafficFactor) {
    // Segment sayısı - yeterince gerçekçi görünüm için 10 segment
    const segmentCount = 10;
    
    // Segmentlerin trafik durumlarını tutan array'ler
    const segmentTraffic = [];
    const segmentFactors = [];
    
    // Segment trafik durumlarını oluştur
    for (let i = 0; i < segmentCount; i++) {
      // Her segment için trafik durumunu belirle
      // Ana trafiğe yakın, ama biraz rastgele varyasyon ekle
      const segFactor = trafficFactor * (0.85 + Math.random() * 0.3);
      segmentFactors.push(segFactor);
      
      // Segment trafik durumunu belirle
      segmentTraffic.push(this.determineTrafficCondition(segFactor));
    }
    
    return {
      segmentTraffic,
      segmentFactors,
      segmentCount
    };
  }
  
  /**
   * Trafik durumuna göre açıklama döndürür
   * @param {string} condition - Trafik durumu
   * @returns {string} Trafik açıklaması
   */
  getTrafficDescription(condition) {
    switch (condition) {
      case 'good':
        return 'Trafik akıcı';
      case 'moderate':
        return 'Trafik orta yoğunlukta';
      case 'bad':
        return 'Trafik yoğun';
      default:
        return 'Trafik durumu bilinmiyor';
    }
  }
}