/**
 * TrafficManager - Sadece rota renklendirme için basit versiyon
 * 
 * ✅ Grid sistemi KALDIRILDI
 * ✅ Sadece mevcut rotanın rengini değiştirir
 * ✅ RouteTrafficOverlay kullanır
 */
import TrafficStyler from './trafficStyler.js';
import TrafficCalculator from './trafficCalculator.js';
import TrafficUI from './trafficUI.js';
import TrafficDataManager from './TrafficDataManager.js';
import RouteTrafficOverlay from './RouteTrafficOverlay.js'; // Grid değil, overlay

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
  async initialize(map) {
    this.map = map;
    
    try {
      // Backend trafik durumunu kontrol et
      console.log('🔍 Backend trafik durumu kontrol ediliyor...');
      const trafficStatus = await this.checkBackendTrafficStatus();
      
      if (!trafficStatus.available) {
        console.error('❌ Backend trafik servisi kullanılamıyor:', trafficStatus.error);
        this.ui.showStatusMessage(
          `Trafik servisi kullanılamıyor: ${trafficStatus.error}`, 
          'error'
        );
        
        // Trafik butonunu devre dışı bırak
        this.disableTrafficButton();
        return;
      }
      
      console.log('✅ Backend trafik servisi aktif');
      
      // ✅ Sadece RouteTrafficOverlay başlat (grid sistemi YOK)
      this.routeTrafficOverlay = new RouteTrafficOverlay(
        this.config,
        this.eventBus, 
        map,
        this.dataManager
      );
      
      // Global erişim için
      window.app.routeTrafficOverlay = this.routeTrafficOverlay;
      
      // Başarı mesajı
      this.ui.showStatusMessage('Trafik sistemi hazır (sadece rota renklendirme)', 'success');
      console.log('✅ Trafik sistemi başlatıldı - sadece rota renklendirme');
      
    } catch (error) {
      console.error('❌ Trafik sistemi başlatma hatası:', error);
      this.ui.showStatusMessage(`Trafik sistemi hatası: ${error.message}`, 'error');
      this.disableTrafficButton();
    }
  }

  /**
   * Backend trafik servisinin durumunu kontrol eder
   * @returns {Object} - {available: boolean, error?: string}
   */
  async checkBackendTrafficStatus() {
    try {
      // Backend status endpoint'ini kontrol et
      const response = await fetch(`${this.config.traffic.baseUrl}/status/tomtom`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        timeout: 5000
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          available: false,
          error: errorData.message || `Backend status: ${response.status}`
        };
      }

      const statusData = await response.json();
      
      // Backend'den gelen durumu değerlendir
      if (statusData.status === 'connected' && statusData.api_key_valid) {
        return { available: true };
      } else if (statusData.status === 'not_configured') {
        return {
          available: false,
          error: 'TomTom API key backend\'de yapılandırılmamış'
        };
      } else {
        return {
          available: false,
          error: statusData.error || 'TomTom API bağlantı sorunu'
        };
      }
      
    } catch (error) {
      console.error('Backend trafik status kontrolü hatası:', error);
      return {
        available: false,
        error: 'Backend\'e bağlanılamıyor'
      };
    }
  }

  /**
   * Trafik butonunu devre dışı bırakır
   */
  disableTrafficButton() {
    const trafficButton = document.getElementById('toggle-traffic');
    if (trafficButton) {
      trafficButton.disabled = true;
      trafficButton.textContent = 'Trafik Servisi Kullanılamıyor';
      trafficButton.title = 'Backend trafik servisi yapılandırılmamış';
      trafficButton.style.backgroundColor = '#cccccc';
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

      // Hesaplamayı başlat
      this.calculator.setOriginalDuration(routeData.duration);

      console.log(`📍 Yeni rota: ${routeData.distance.toFixed(1)}km, ${routeData.duration} dakika`);

    } catch (error) {
      console.error('❌ Rota trafik bilgisi oluşturma hatası:', error);
    }
  }

  /**
   * Rota temizlendiğinde çağrılır
   */
  onRouteClear() {
    this.currentRoute = null;
    this.calculator.reset();
    console.log('🧹 Trafik manager - rota temizlendi');
  }

  /**
   * Trafik katmanını açıp kapatır
   * @param {boolean} [forceState] - İsteğe bağlı zorla durum
   */
  toggleTrafficLayer(forceState) {
    this.isTrafficVisible = forceState !== undefined ? forceState : !this.isTrafficVisible;

    if (this.isTrafficVisible && this.currentRoute) {
      this.enableTrafficView();
    } else {
      this.disableTrafficView();
    }

    // UI durumunu güncelle
    this.ui.updateTrafficButtonState(this.isTrafficVisible);
    console.log(`🚦 Trafik renklendirme ${this.isTrafficVisible ? 'açıldı' : 'kapatıldı'}`);
  }

  /**
   * Trafik görünümünü aktifleştirir
   */
  enableTrafficView() {
    // ✅ DÜZELTİLDİ: Farklı event adı kullan - infinite loop önlenir
    this.eventBus.publish('traffic:overlay:toggle', true);

    if (this.currentRoute) {
      this.ui.showStatusMessage('Rota trafik renklendirmesi aktif', 'success');
    } else {
      this.ui.showStatusMessage('Trafik göstermek için önce bir rota oluşturun', 'info');
    }
  }

  /**
   * Trafik görünümünü deaktifleştirir
   */
  disableTrafficView() {
    // ✅ DÜZELTİLDİ: Farklı event adı kullan - infinite loop önlenir
    this.eventBus.publish('traffic:overlay:toggle', false);

    this.ui.showStatusMessage('Trafik renklendirmesi kapatıldı', 'info');
  }

  /**
   * Debug bilgileri
   */
  debugTrafficManager() {
    console.log('🔍 TrafficManager Debug:', {
      isVisible: this.isTrafficVisible,
      hasRoute: !!this.currentRoute,
      hasOverlay: !!this.routeTrafficOverlay
    });

    // Cache durumu
    if (this.dataManager) {
      this.dataManager.logCacheStatus();
    }

    // Overlay debug
    if (this.routeTrafficOverlay) {
      this.routeTrafficOverlay.debugTrafficRoute();
    }
  }

  /**
   * Temizlik işlemi
   */
  destroy() {
    if (this.routeTrafficOverlay) {
      this.routeTrafficOverlay.destroy();
    }
    
    if (this.dataManager) {
      this.dataManager.destroy();
    }
    
    console.log('🛑 TrafficManager destroyed');
  }
}

// Global debug fonksiyonu
window.debugTrafficManager = function() {
  if (window.app && window.app.trafficManager) {
    window.app.trafficManager.debugTrafficManager();
  } else {
    console.warn("TrafficManager bulunamadı!");
  }
};