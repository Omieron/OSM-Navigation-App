/**
 * TrafficManager - Trafik durumuna göre süre tahmini gösteren versiyon
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
    this.originalDuration = 0;   // Trafik olmadan orjinal süre
    this.trafficDuration = 0;    // Trafik varlığında süre
    
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
      // Orjinal süreyi kaydet
      this.originalDuration = routeData.duration;
      
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
        
        // Rotanın trafik bilgisini almak için hesaplama yap
        this.calculateTrafficRouteInfo(routeData);
      }
      
    } catch (error) {
      console.error('Rota trafik bilgisi oluşturma hatası:', error);
    }
  }
  
  /**
   * Rota üzerindeki trafik durumunu hesaplar ve gösterir
   * @param {Object} routeData - Rota bilgileri
   */
  calculateTrafficRouteInfo(routeData) {
    try {
      // Rotadaki trafik durumunu belirleyen bazı değerleri hesapla/tahmin et
      const distance = routeData.distance; // km cinsinden
      const normalDuration = routeData.duration; // dakika cinsinden (normal süre)
      
      // Trafik yoğunluğuna göre süre faktörü hesapla
      // Bu, trafik varlığında sürenin nasıl değiştiğini belirler
      let trafficFactor;
      
      // Trafik faktörünü hesapla:
      // 1. Şehir içi/şehir dışı rota tespiti
      const isUrbanRoute = distance < 20; // 20 km'den kısa rotalar genelde şehir içi
      
      // 2. Trafik yoğunluğunu belirle
      // Şehir içi rotalar için farklı, şehir dışı için farklı faktörler
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
      
      // Trafik varlığında tahmini süreyi hesapla
      this.trafficDuration = Math.round(normalDuration * trafficFactor);
      
      // Rota feature'ına trafik faktörünü ekle
      const routeFeature = this.routeSource.getFeatures()[0];
      if (routeFeature) {
        // Trafik faktörüne göre genel durumu belirle
        let trafficCondition;
        if (trafficFactor < 1.15) {
          trafficCondition = 'good'; // İyi trafik (yeşil)
        } else if (trafficFactor < 1.4) {
          trafficCondition = 'moderate'; // Orta trafik (sarı)
        } else {
          trafficCondition = 'bad'; // Kötü trafik (kırmızı)
        }
        
        // Feature özelliklerini ayarla
        routeFeature.set('trafficCondition', trafficCondition);
        routeFeature.set('trafficFactor', trafficFactor);
        
        // Rota segmentlerini oluştur ve her birine rastgele trafik durumu ata
        // Bu, daha gerçekçi bir görsel sağlar
        const coordinates = routeFeature.getGeometry().getCoordinates();
        const segmentCount = Math.min(10, Math.floor(coordinates.length / 5)); // Her 5 noktada bir segment
        
        // Segmentlerin trafik durumlarını tutan array
        const segmentTraffic = [];
        const segmentFactors = [];
        
        // Segment trafik durumlarını oluştur
        for (let i = 0; i < segmentCount; i++) {
          // Her segment için trafik durumunu belirle
          // Ana trafiğe yakın, ama biraz rastgele varyasyon ekle
          const segFactor = trafficFactor * (0.85 + Math.random() * 0.3);
          segmentFactors.push(segFactor);
          
          let segCondition;
          if (segFactor < 1.15) {
            segCondition = 'good';
          } else if (segFactor < 1.4) {
            segCondition = 'moderate';
          } else {
            segCondition = 'bad';
          }
          
          segmentTraffic.push(segCondition);
        }
        
        // Feature'a segment bilgilerini ekle
        routeFeature.set('segmentTraffic', segmentTraffic);
        routeFeature.set('segmentFactors', segmentFactors);
        routeFeature.set('segmentCount', segmentCount);
        
        // Görselleştirmeyi güncelle
        this.routeLayer.changed();
        
        // Rota bilgilerini güncelle - trafik varlığında süre değişimini göster
        this.updateRouteInfoWithTraffic(distance, normalDuration, this.trafficDuration);
        
        // Bilgi mesajı
        this.showStatusMessage(
          `Trafik süresi: ${this.formatDuration(this.trafficDuration)} (+${Math.round((trafficFactor-1)*100)}%)`, 
          'success'
        );
      }
    } catch (error) {
      console.error('Trafik süresi hesaplama hatası:', error);
    }
  }
  
  /**
   * Dakika cinsinden süreyi formatlı olarak döndürür
   * @param {number} minutes - Dakika cinsinden süre
   * @returns {string} Formatlanmış süre
   */
  formatDuration(minutes) {
    if (minutes < 60) {
      return `${minutes} dakika`;
    } else {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours} saat${mins > 0 ? ` ${mins} dakika` : ''}`;
    }
  }
  
  /**
   * Rota bilgi panelini trafik verisiyle günceller
   * @param {number} distance - Mesafe (km)
   * @param {number} normalDuration - Normal süre (dakika)
   * @param {number} trafficDuration - Trafik varlığında süre (dakika)
   */
  updateRouteInfoWithTraffic(distance, normalDuration, trafficDuration) {
    const routeDetails = document.getElementById('route-details');
    
    if (routeDetails) {
      // Orijinal rota bilgilerini oluştur
      const durationDiff = trafficDuration - normalDuration;
      const durationPercent = Math.round((trafficDuration / normalDuration - 1) * 100);
      
      // Mesafeyi formatla
      let distanceText;
      if (distance < 1) {
        distanceText = `${Math.round(distance * 1000)} m`;
      } else {
        distanceText = `${distance.toFixed(1)} km`;
      }
      
      // HTML içeriğini güncelle
      routeDetails.innerHTML = `
        <p><strong>Araç:</strong> Araba</p>
        <p><strong>Mesafe:</strong> ${distanceText}</p>
        <p><strong>Normal Süre:</strong> ${this.formatDuration(normalDuration)}</p>
        <p><strong>Trafik Varlığında:</strong> 
          <span style="color: ${durationDiff > 0 ? '#f44336' : '#4CAF50'}">
            ${this.formatDuration(trafficDuration)}
            ${durationDiff !== 0 ? ` (${durationDiff > 0 ? '+' : ''}${durationPercent}%)` : ''}
          </span>
        </p>
      `;
      
      // Rota bilgi panelini görünür yap
      const routeInfo = document.getElementById('route-info');
      if (routeInfo) {
        routeInfo.style.display = 'block';
      }
    }
  }
  
  /**
   * Rota temizlendiğinde çağrılır
   */
  onRouteClear() {
    this.currentRoute = null;
    this.originalDuration = 0;
    this.trafficDuration = 0;
    
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
          this.calculateTrafficRouteInfo(this.currentRoute);
        } else {
          // Rota bilgilerini güncelle - trafik varlığında süre değişimini göster
          this.updateRouteInfoWithTraffic(
            this.currentRoute.distance, 
            this.originalDuration, 
            this.trafficDuration
          );
        }
      }
      
      // Bilgi mesajı
      if (this.trafficDuration > 0) {
        this.showStatusMessage(
          `Trafik süresi: ${this.formatDuration(this.trafficDuration)}`, 
          'success'
        );
      } else {
        this.showStatusMessage('Rota üzerinde trafik gösteriliyor', 'success');
      }
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
      
      // Trafik kapatıldıysa, orijinal rota bilgilerini göster
      if (!this.isTrafficVisible && this.currentRoute) {
        const routeDetails = document.getElementById('route-details');
        if (routeDetails) {
          // Mesafeyi formatla
          let distanceText;
          if (this.currentRoute.distance < 1) {
            distanceText = `${Math.round(this.currentRoute.distance * 1000)} m`;
          } else {
            distanceText = `${this.currentRoute.distance.toFixed(1)} km`;
          }
          
          // HTML içeriğini güncelle - sadece orijinal bilgiler
          routeDetails.innerHTML = `
            <p><strong>Araç:</strong> Araba</p>
            <p><strong>Mesafe:</strong> ${distanceText}</p>
            <p><strong>Tahmini Süre:</strong> ${this.formatDuration(this.originalDuration)}</p>
          `;
        }
      }
      
      // Trafik kapatıldı mesajı
      if (!this.isTrafficVisible && this.currentRoute) {
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