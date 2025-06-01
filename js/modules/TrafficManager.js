/**
 * TrafficManager - Ana trafik yönetim sınıfı
 * Diğer trafik modüllerini yöneten merkezi sınıf
 */
import TrafficStyler from './trafficStyler.js';
import TrafficCalculator from './trafficCalculator.js';
import TrafficUI from './trafficUI.js';
import TrafficDataManager from './TrafficDataManager.js';
import TrafficLayerManager from './TrafficLayerManager.js';

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

    // Alt modülleri başlat
    this.styler = new TrafficStyler(config);
    this.calculator = new TrafficCalculator(config);
    this.ui = new TrafficUI(config, eventBus);

    this.dataManager = new TrafficDataManager(config, eventBus);
    
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
  // TrafficManager.js - initialize methodunu bul ve güncelle
initialize(map) {
  this.map = map;
  
  // API anahtarı kontrolü
  if (!this.config.traffic.apiKey || this.config.traffic.apiKey === 'YOUR_TOMTOM_API_KEY_HERE') {
    console.error('TomTom API anahtarı tanımlanmamış!');
    this.ui.showStatusMessage('TomTom API anahtarı tanımlanmamış! config.js dosyasını güncelleyin.', 'error');
    return;
  }
  
  try {
    // Rota vektör kaynağı oluştur
    this.routeSource = new ol.source.Vector();
    
    // Rota katmanı oluştur
    this.routeLayer = new ol.layer.Vector({
      source: this.routeSource,
      style: (feature) => this.styler.trafficRouteStyle(feature, this.isTrafficVisible),
      visible: false,
      zIndex: 10 // Diğer katmanların üstünde olsun
    });
    
    // Haritaya ekle
    map.addLayer(this.routeLayer);
    
    // RouteCalculator'ın kullandığı katmana referans bulmaya çalış
    this.findOriginalRouteLayer(map);
    
    // 🚀 YENİ - TrafficLayerManager'ı BURADA başlat (map hazır olduktan sonra)
    this.layerManager = new TrafficLayerManager(
      this.config,
      this.eventBus, 
      map,                    // map artık hazır
      this.dataManager        // TrafficDataManager referansı
    );
    
    // Başarı mesajı göster
    this.ui.showStatusMessage('TomTom trafik sistemi hazır', 'success');
    console.log('TomTom trafik sistemi başlatıldı');
  } catch (error) {
    console.error('Trafik sistemi başlatma hatası:', error);
    this.ui.showStatusMessage(`Trafik sistemi başlatma hatası: ${error.message}`, 'error');
  }
}

  /**
   * Orijinal rota katmanını bulur
   * @param {ol.Map} map - OpenLayers harita nesnesi
   */
  findOriginalRouteLayer(map) {
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

      // Hesaplamayı başlat
      this.calculator.setOriginalDuration(routeData.duration);

      // Önce mevcut rota feature'larını temizle
      this.routeSource.clear();

      // Rota feature'ı oluştur
      const routeFeature = this.createRouteFeature(routeData);

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

        // Rotanın trafik bilgisini hesapla
        this.calculateTrafficInfo(routeData);
      }

    } catch (error) {
      console.error('Rota trafik bilgisi oluşturma hatası:', error);
    }
  }

  /**
   * Rota feature'ı oluşturur
   * @param {Object} routeData - Rota bilgileri
   * @returns {ol.Feature} Oluşturulan feature
   */
  createRouteFeature(routeData) {
    // Rota koordinatlarını OpenLayers koordinat sistemine dönüştür
    const routeCoords = routeData.coordinates.map(coord =>
      ol.proj.fromLonLat([parseFloat(coord[0]), parseFloat(coord[1])])
    );

    // Rota geometrisi oluştur
    const routeGeometry = new ol.geom.LineString(routeCoords);

    // Rota feature'ı oluştur
    return new ol.Feature({
      geometry: routeGeometry,
      name: 'Traffic Route',
      type: 'traffic-route'
    });
  }

  /**
   * Rota üzerindeki trafik durumunu hesaplar
   * @param {Object} routeData - Rota bilgileri
   */
  calculateTrafficInfo(routeData) {
    try {
      // Trafik hesaplamalarını yap
      const trafficInfo = this.calculator.calculateTrafficInfo(routeData);

      // Rota feature'ına trafik bilgilerini ekle
      const routeFeature = this.routeSource.getFeatures()[0];
      if (routeFeature) {
        // Feature özelliklerini ayarla
        routeFeature.set('trafficCondition', trafficInfo.condition);
        routeFeature.set('trafficFactor', trafficInfo.factor);
        routeFeature.set('segmentTraffic', trafficInfo.segmentTraffic);
        routeFeature.set('segmentFactors', trafficInfo.segmentFactors);
        routeFeature.set('segmentCount', trafficInfo.segmentCount);

        // Görselleştirmeyi güncelle
        this.routeLayer.changed();

        // Rota bilgilerini güncelle - trafik varlığında süre değişimini göster
        this.ui.updateRouteInfoWithTraffic(
          routeData.distance,
          this.calculator.getOriginalDuration(),
          this.calculator.getTrafficDuration()
        );

        // Bilgi mesajı
        this.ui.showStatusMessage(
          `Trafik süresi: ${this.ui.formatDuration(this.calculator.getTrafficDuration())} (+${Math.round((trafficInfo.factor - 1) * 100)}%)`,
          'success'
        );
      }
    } catch (error) {
      console.error('Trafik süresi hesaplama hatası:', error);
    }
  }

  /**
   * Rota temizlendiğinde çağrılır
   */
  onRouteClear() {
    this.currentRoute = null;
    this.calculator.reset();

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
          this.calculateTrafficInfo(this.currentRoute);
        } else {
          // Rota bilgilerini güncelle - trafik varlığında süre değişimini göster
          this.ui.updateRouteInfoWithTraffic(
            this.currentRoute.distance,
            this.calculator.getOriginalDuration(),
            this.calculator.getTrafficDuration()
          );
        }
      }

      if (this.layerManager) {
        this.layerManager.toggleTrafficLayer(this.isTrafficVisible);
      }

      // Bilgi mesajı
      if (this.calculator.getTrafficDuration() > 0) {
        this.ui.showStatusMessage(
          `Trafik süresi: ${this.ui.formatDuration(this.calculator.getTrafficDuration())}`,
          'success'
        );
      } else {
        this.ui.showStatusMessage('Rota üzerinde trafik gösteriliyor', 'success');
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
        this.ui.updateRouteInfoWithOriginalData(
          this.currentRoute.distance,
          this.calculator.getOriginalDuration()
        );
      }

      // Trafik kapatıldı mesajı
      if (!this.isTrafficVisible && this.currentRoute) {
        this.ui.showStatusMessage('Trafik gösterimi kapatıldı', 'info');
      }
      // Rota yok mesajı
      else if (!this.currentRoute) {
        this.ui.showStatusMessage('Trafik göstermek için önce bir rota oluşturun', 'info');
      }
    }

    // UI durumunu güncelle
    this.ui.updateTrafficButtonState(this.isTrafficVisible);

    console.log(`Trafik katmanı ${this.isTrafficVisible ? 'açıldı' : 'kapatıldı'}`);
  }
}