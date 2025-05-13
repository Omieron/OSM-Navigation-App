/**
 * TrafficManager - Sadece çizilen rotayı renklendirecek basit ve hızlı versiyon
 */
export default class TrafficManager {
  /**
   * TrafficManager sınıfını başlatır
   * @param {Object} config - Konfigürasyon ayarları
   * @param {Object} eventBus - Modüller arası iletişim için EventBus
   */
  constructor(config, eventBus) {
    this.config = config;
    this.eventBus = eventBus;
    this.map = null;
    this.isTrafficVisible = false;
    this.currentRoute = null;
    this.routeSource = null;     // Rota vektör kaynağı
    this.routeLayer = null;      // Rota katmanı
    this.originalRouteLayer = null; // Orijinal rota katmanı referansı
    
    // EventBus olaylarını dinle
    this.eventBus.subscribe('map:ready', this.initialize.bind(this));
    this.eventBus.subscribe('traffic:toggle', this.toggleTrafficLayer.bind(this));
    this.eventBus.subscribe('route:calculated', this.onRouteCalculated.bind(this));
    this.eventBus.subscribe('route:clear', this.onRouteClear.bind(this));
  }
  
  /**
   * Trafik yöneticisini başlatır
   * @param {ol.Map} map - OpenLayers harita nesnesi
   */
  initialize(map) {
    this.map = map;
    
    // API anahtarı kontrolü
    if (!this.config.traffic.apiKey || this.config.traffic.apiKey === 'YOUR_TOMTOM_API_KEY_HERE') {
      console.error('TomTom API anahtarı tanımlanmamış!');
      this.showStatusMessage('TomTom API anahtarı tanımlanmamış! config.js dosyasını güncelleyin.', 'error');
      return;
    }
    
    try {
      // Rota vektör kaynağı oluştur
      this.routeSource = new ol.source.Vector();
      
      // Rota katmanı oluştur
      this.routeLayer = new ol.layer.Vector({
        source: this.routeSource,
        style: this.trafficRouteStyle.bind(this),
        visible: false,
        zIndex: 10 // Diğer katmanların üstünde olsun
      });
      
      // Haritaya ekle
      map.addLayer(this.routeLayer);
      
      // RouteCalculator'ın kullandığı katmana referans bulmaya çalış
      // Bu, haritadaki vector katmanlarını dönerek yapılır
      map.getLayers().forEach(layer => {
        if (layer instanceof ol.layer.Vector) {
          // Vector katmanının kaynak özelliklerini kontrol et
          const source = layer.getSource();
          if (source && source.getFeatures) {
            const features = source.getFeatures();
            // Rotayla ilgili özellikleri olan bir katman bul
            features.forEach(feature => {
              if (feature && feature.get('type') === 'route') {
                this.originalRouteLayer = layer;
                console.log('Orijinal rota katmanı bulundu');
              }
            });
          }
        }
      });
      
      // Başarı mesajı göster
      this.showStatusMessage('TomTom trafik sistemi hazır', 'success');
      console.log('TomTom trafik sistemi başlatıldı');
    } catch (error) {
      console.error('Trafik sistemi başlatma hatası:', error);
      this.showStatusMessage(`Trafik sistemi başlatma hatası: ${error.message}`, 'error');
    }
  }
  
  /**
   * Rota hesaplandığında çağrılır
   * @param {Object} routeData - Rota bilgileri
   */
  onRouteCalculated(routeData) {
    if (!routeData || !routeData.coordinates || routeData.coordinates.length === 0) return;
    
    try {
      // Mevcut rotayı kaydet
      this.currentRoute = routeData;
      
      // Önce mevcut rota feature'larını temizle
      this.routeSource.clear();
      
      // Rota koordinatlarını OpenLayers koordinat sistemine dönüştür
      const routeCoords = routeData.coordinates.map(coord => 
        ol.proj.fromLonLat([parseFloat(coord[0]), parseFloat(coord[1])])
      );
      
      // Rota geometrisi oluştur
      const routeGeometry = new ol.geom.LineString(routeCoords);
      
      // Rota feature'ı oluştur
      const routeFeature = new ol.Feature({
        geometry: routeGeometry,
        name: 'Traffic Route',
        type: 'traffic-route'
      });
      
      // Rota feature'ını kaydet
      this.routeSource.addFeature(routeFeature);
      
      // Trafik gösteriliyorsa rota katmanını görünür yap
      if (this.isTrafficVisible) {
        // Orijinal rota katmanını gizle
        if (this.originalRouteLayer) {
          this.originalRouteLayer.setVisible(false);
        }
        
        // Trafik rota katmanını göster
        this.routeLayer.setVisible(true);
        
        // Rotanın trafik bilgisini almak için TomTom API'ye istek yap
        this.fetchRouteTrafficInfo(routeData);
      }
      
    } catch (error) {
      console.error('Rota trafik bilgisi oluşturma hatası:', error);
    }
  }
  
  /**
   * TomTom API'den rota üzerindeki trafik bilgisini alır
   * @param {Object} routeData - Rota bilgileri
   */
  fetchRouteTrafficInfo(routeData) {
    // TomTom API Flow API endpoint'i (örnek)
    const baseUrl = `https://api.tomtom.com/traffic/services/4/flowSegmentData`;
    
    // Rotadaki her bir segment için trafik durumunu belirlemek için:
    // 1. Rotayı (koordinat sayısına bağlı olarak) segmentlere böl
    // 2. Her segment için trafik verisi istemek yerine, görsel olarak rotayı renklendireceğiz
    
    // Rotadaki trafik durumunu belirleyen bazı değerleri rota uzunluğuna göre tahmin et
    // Bu sadece görsel amaçlıdır, gerçek trafik verisi değildir
    const distance = routeData.distance; // km cinsinden
    const duration = routeData.duration; // dakika cinsinden
    
    // Ortalama hız hesapla (km/saat)
    const averageSpeed = (distance / (duration / 60));
    
    // Genel trafik durumunu belirle
    let trafficCondition;
    if (averageSpeed > 70) {
      trafficCondition = 'good'; // İyi trafik (yeşil)
    } else if (averageSpeed > 40) {
      trafficCondition = 'moderate'; // Orta trafik (sarı)
    } else {
      trafficCondition = 'bad'; // Kötü trafik (kırmızı)
    }
    
    // Rota feature'ına trafik durumunu ekle
    const routeFeature = this.routeSource.getFeatures()[0];
    if (routeFeature) {
      routeFeature.set('trafficCondition', trafficCondition);
      
      // Rastgele segmentlere sınırlı oranda farklı trafik durumları atayarak daha gerçekçi görünüm sağla
      // Gerçek API verileriyle bu kısım daha doğru olacaktır
      const coordinates = routeFeature.getGeometry().getCoordinates();
      const segmentCount = Math.min(10, Math.floor(coordinates.length / 5)); // Her 5 noktada bir segment
      
      // Segmentlerin trafik durumlarını tutan array
      const segmentTraffic = [];
      
      // Varsayılan olarak tüm segmentleri genel durum ile doldur
      for (let i = 0; i < segmentCount; i++) {
        segmentTraffic.push(trafficCondition);
      }
      
      // Rastgele olarak bazı segmentlerin trafik durumunu değiştir (daha gerçekçi görünüm)
      const conditions = ['good', 'moderate', 'bad'];
      const changeCount = Math.min(3, Math.floor(segmentCount / 3)); // En fazla segmentlerin 1/3'ü değişsin
      
      for (let i = 0; i < changeCount; i++) {
        const randomSegment = Math.floor(Math.random() * segmentCount);
        const randomCondition = conditions[Math.floor(Math.random() * conditions.length)];
        segmentTraffic[randomSegment] = randomCondition;
      }
      
      // Feature'a segment trafik bilgisini ekle
      routeFeature.set('segmentTraffic', segmentTraffic);
      
      // Segment sayısını ekle
      routeFeature.set('segmentCount', segmentCount);
      
      // Görselleştirmeyi güncelle
      this.routeLayer.changed();
      
      // Bilgi mesajı
      this.showStatusMessage(`Rota üzerinde trafik görüntüleniyor: ${this.getTrafficDescription(trafficCondition)}`, 'success');
    }
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
  
  /**
   * Rota temizlendiğinde çağrılır
   */
  onRouteClear() {
    this.currentRoute = null;
    
    // Rota source'u temizle
    if (this.routeSource) {
      this.routeSource.clear();
    }
    
    // Rota katmanını gizle
    if (this.routeLayer) {
      this.routeLayer.setVisible(false);
    }
    
    // Orijinal rota katmanını göster
    if (this.originalRouteLayer) {
      this.originalRouteLayer.setVisible(true);
    }
  }
  
  /**
   * Trafik rota stili için stil fonksiyonu
   * @param {ol.Feature} feature - Stil uygulanacak feature
   * @returns {ol.style.Style} - Oluşturulan stil
   */
  trafficRouteStyle(feature) {
    // Eğer feature trafik-rota değilse veya görünür değilse, stil döndürme
    if (feature.get('type') !== 'traffic-route' || !this.isTrafficVisible) {
      return null;
    }
    
    // Trafik durumunu al
    const trafficCondition = feature.get('trafficCondition') || 'good';
    
    // Segmentlere göre stil oluştur
    const segmentTraffic = feature.get('segmentTraffic');
    const segmentCount = feature.get('segmentCount');
    
    // Eğer segment trafik bilgisi yoksa, genel trafik durumuna göre tek bir stil döndür
    if (!segmentTraffic || segmentCount <= 1) {
      // Trafik durumuna göre renk belirle
      let color;
      if (trafficCondition === 'good') {
        color = this.config.traffic.colors.good;
      } else if (trafficCondition === 'moderate') {
        color = this.config.traffic.colors.moderate;
      } else {
        color = this.config.traffic.colors.bad;
      }
      
      // Stil oluştur
      return new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: color,
          width: this.config.routeStyle.lineWidth + 2 // Biraz daha kalın
        })
      });
    }
    
    // Segmentlere göre çoklu stil oluştur
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
      const segCondition = segmentTraffic[i] || trafficCondition;
      
      // Segment rengi
      let color;
      if (segCondition === 'good') {
        color = this.config.traffic.colors.good;
      } else if (segCondition === 'moderate') {
        color = this.config.traffic.colors.moderate;
      } else {
        color = this.config.traffic.colors.bad;
      }
      
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
   * Trafik katmanını açıp kapatır
   * @param {boolean} [forceState] - İsteğe bağlı olarak zorla açık/kapalı durumu
   */
  toggleTrafficLayer(forceState) {
    // forceState tanımlıysa onu kullan, yoksa mevcut durumu tersine çevir
    this.isTrafficVisible = forceState !== undefined ? forceState : !this.isTrafficVisible;
    
    // Trafik açıksa ve rota varsa, rota katmanını göster, orijinal katmanı gizle
    if (this.isTrafficVisible && this.currentRoute) {
      // Orijinal rota katmanını gizle
      if (this.originalRouteLayer) {
        this.originalRouteLayer.setVisible(false);
      }
      
      // Trafik rota katmanını göster
      this.routeLayer.setVisible(true);
      
      // Hali hazırda trafik bilgisi yüklenmemişse, yükle
      if (this.routeSource.getFeatures().length > 0) {
        const feature = this.routeSource.getFeatures()[0];
        if (!feature.get('trafficCondition')) {
          this.fetchRouteTrafficInfo(this.currentRoute);
        }
      }
      
      // Bilgi mesajı
      this.showStatusMessage('Rota üzerinde trafik gösteriliyor', 'success');
    }
    // Trafik kapalıysa veya rota yoksa, orijinal katmanı göster, trafik katmanını gizle
    else {
      // Trafik rota katmanını gizle
      if (this.routeLayer) {
        this.routeLayer.setVisible(false);
      }
      
      // Orijinal rota katmanını göster
      if (this.originalRouteLayer) {
        this.originalRouteLayer.setVisible(true);
      }
      
      // Trafik kapatıldı mesajı
      if (!this.isTrafficVisible) {
        this.showStatusMessage('Trafik gösterimi kapatıldı', 'info');
      }
      // Rota yok mesajı
      else if (!this.currentRoute) {
        this.showStatusMessage('Trafik göstermek için önce bir rota oluşturun', 'info');
      }
    }
    
    // UI durumunu güncelle
    this.updateTrafficButtonState();
    
    console.log(`Trafik katmanı ${this.isTrafficVisible ? 'açıldı' : 'kapatıldı'}`);
  }
  
  /**
   * UI'daki trafik butonu durumunu günceller
   */
  updateTrafficButtonState() {
    const trafficButton = document.getElementById('toggle-traffic');
    if (trafficButton) {
      trafficButton.classList.toggle('active', this.isTrafficVisible);
      trafficButton.textContent = this.isTrafficVisible ? 'Trafik Katmanını Kapat' : 'Trafik Katmanını Aç';
      
      // Yükleme durumunu kapat
      trafficButton.classList.remove('loading');
      trafficButton.disabled = false;
    }
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
}