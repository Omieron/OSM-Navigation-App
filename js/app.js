/**
 * Ana uygulama başlatıcı
 * Tüm modülleri yükler ve başlatır
 */
import EventBus from './utils/eventBus.js';
import config from './config.js';
import MapManager from './modules/mapManager.js';
import RouteSelector from './modules/routeSelector.js';
import RouteCalculator from './modules/routeCalculator.js';
import TrafficManager from './modules/TrafficManager.js'; // Ana trafik yöneticisi

// Sayfa yüklendiğinde çalıştır
document.addEventListener('DOMContentLoaded', function() {
  console.log('Navigasyon uygulaması başlatılıyor...');
  
  // EventBus oluştur - tüm modüllerin iletişimi için
  const eventBus = new EventBus();
  
  // Modülleri başlat
  const mapManager = new MapManager(config, eventBus);
  const routeSelector = new RouteSelector(config, eventBus);
  const routeCalculator = new RouteCalculator(config, eventBus);
  const trafficManager = new TrafficManager(config, eventBus); // Trafik yöneticisini başlat

  // 🚀 DEBUG İÇİN GLOBAL ERİŞİM - BURASI YENİ!
  window.app = {
    config: config,
    eventBus: eventBus,
    mapManager: mapManager,
    routeSelector: routeSelector,
    routeCalculator: routeCalculator,
    trafficManager: trafficManager
  };

  console.log('🚀 Debug için window.app oluşturuldu:', window.app);
  
  // Zoom butonlarını bağla
  document.getElementById('zoom-turkey').addEventListener('click', function() {
    eventBus.publish('map:zoomToLocation', {
      coords: config.map.initialView.turkey.center,
      zoom: config.map.initialView.turkey.zoom
    });
  });
  
  // Trafik butonunu bağla
  document.getElementById('toggle-traffic').addEventListener('click', function() {
    eventBus.publish('traffic:toggle');
  });
  
  // Rota yükleniyor durumu eventbusunu dinle
  eventBus.subscribe('route:loading', function(isLoading) {
    const loadingOverlay = document.getElementById('loading-overlay');
    
    if (isLoading) {
      // Hesaplama başladığında
      // Overlay'i göster
      loadingOverlay.style.display = 'flex';
      
      // Tüm tıklama eventlerini devre dışı bırakmak için overlay'i göster
      document.body.classList.add('loading');
    } else {
      // Hesaplama bittiğinde
      // Overlay'i gizle
      loadingOverlay.style.display = 'none';
      
      // Tıklama eventlerini tekrar aktif et
      document.body.classList.remove('loading');
    }
  });
  
  // Trafik yükleniyor durumu eventbusunu dinle
  eventBus.subscribe('traffic:loading', function(isLoading) {
    // Trafik verisi yüklenirken basit bir gösterge
    const trafficButton = document.getElementById('toggle-traffic');
    
    if (isLoading && trafficButton) {
      trafficButton.classList.add('loading');
      trafficButton.disabled = true;
    } else if (trafficButton) {
      trafficButton.classList.remove('loading');
      trafficButton.disabled = false;
    }
  });
  
  // Uygulama hazır olduğunda EventBus aracılığıyla bildir
  eventBus.publish('app:ready', {
    timestamp: Date.now()
  });
  
  // OSRM bağlantısını test et
  testOSRMConnection();
  
  // TomTom API anahtarını kontrol et
  checkTomTomAPIKey();
});

/**
 * OSRM bağlantısını kontrol eder
 */
function testOSRMConnection() {
  const statusText = document.createElement('div');
  statusText.id = 'api-status';
  statusText.style.position = 'absolute';
  statusText.style.bottom = '10px';
  statusText.style.right = '10px';
  statusText.style.padding = '5px 10px';
  statusText.style.borderRadius = '4px';
  statusText.style.fontSize = '12px';
  statusText.style.zIndex = '1000';
  statusText.textContent = 'OSRM bağlantısı kontrol ediliyor...';
  statusText.style.backgroundColor = '#FFF59D';
  document.body.appendChild(statusText);
  
  // OSRM bağlantı durumunu kontrol et
  const checkOSRM = async () => {
    try {
      console.log(`OSRM API kontrol ediliyor: ${config.api.baseUrl}`);
      
      // OSRM servis kontrolü için örnek koordinatlar kullanarak geçerli bir istek yap
      // İstanbul'dan küçük bir örnek rota (Kadıköy -> Üsküdar)
      const profile = 'car';
      const testCoords = '29.0320,40.9923;29.0158,41.0265';
      const testParams = 'overview=false';
      
      // Geçerli bir OSRM isteği oluştur
      const url = `${config.api.baseUrl}${config.api.route}/${profile}/${testCoords}?${testParams}`;
      
      console.log(`OSRM test isteği: ${url}`);
      
      // Fetch ile bağlantıyı kontrol et
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000) // 5 saniye timeout
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      // Yanıtı JSON olarak parse et
      const data = await response.json();
      
      // OSRM yanıt kontrolü
      if (data.code !== 'Ok') {
        throw new Error(`OSRM yanıt hatası: ${data.message || 'Bilinmeyen OSRM hatası'}`);
      }
      
      // Başarılı mesajı göster
      statusText.textContent = 'OSRM bağlantısı başarılı';
      statusText.style.backgroundColor = '#A5D6A7';
      
      // 3 saniye sonra mesajı gizle
      setTimeout(() => {
        statusText.style.opacity = '0';
        statusText.style.transition = 'opacity 1s';
      }, 3000);
      
    } catch (error) {
      console.error('OSRM API kontrol hatası:', error);
      statusText.textContent = 'OSRM bağlantısı başarısız!';
      statusText.style.backgroundColor = '#EF9A9A';
      
      // Hata detaylarını göster
      const errorDetails = document.createElement('div');
      errorDetails.style.fontSize = '10px';
      errorDetails.style.marginTop = '5px';
      errorDetails.textContent = error.message || 'Bilinmeyen hata';
      statusText.appendChild(errorDetails);
      
      // OSRM URL'sini göster
      const urlInfo = document.createElement('div');
      urlInfo.style.fontSize = '10px';
      urlInfo.style.marginTop = '5px';
      urlInfo.textContent = `URL: ${config.api.baseUrl}`;
      statusText.appendChild(urlInfo);
      
      // Docker kontrol ipucu
      const dockerTip = document.createElement('div');
      dockerTip.style.fontSize = '10px';
      dockerTip.style.marginTop = '5px';
      dockerTip.textContent = 'Docker üzerinde OSRM servisinin çalıştığından emin olun.';
      statusText.appendChild(dockerTip);
      
      // Config ipucu
      const configTip = document.createElement('div');
      configTip.style.fontSize = '10px';
      configTip.style.marginTop = '5px';
      configTip.textContent = 'config.js dosyasında baseUrl ayarını güncelleyin.';
      statusText.appendChild(configTip);
    }
  };
  
  // API kontrolünü başlat
  checkOSRM();
}

/**
 * TomTom API anahtarını kontrol eder
 */
function checkTomTomAPIKey() {
  // API anahtarının ayarlanıp ayarlanmadığını kontrol et
  if (!config.traffic || !config.traffic.apiKey || config.traffic.apiKey === 'YOUR_TOMTOM_API_KEY_HERE') {
    console.warn('TomTom API anahtarı ayarlanmamış!');
    
    // Uyarı mesajı oluştur
    const warningDiv = document.createElement('div');
    warningDiv.style.position = 'absolute';
    warningDiv.style.top = '10px';
    warningDiv.style.left = '50%';
    warningDiv.style.transform = 'translateX(-50%)';
    warningDiv.style.padding = '10px 15px';
    warningDiv.style.backgroundColor = '#FFECB3';
    warningDiv.style.color = '#E65100';
    warningDiv.style.borderRadius = '4px';
    warningDiv.style.zIndex = '1000';
    warningDiv.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    warningDiv.textContent = 'TomTom API anahtarı tanımlanmamış! Trafik verisi gösterilemeyecek.';
    
    // Kapatma butonu ekle
    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    closeButton.style.position = 'absolute';
    closeButton.style.right = '5px';
    closeButton.style.top = '5px';
    closeButton.style.border = 'none';
    closeButton.style.background = 'none';
    closeButton.style.fontSize = '16px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.color = '#E65100';
    
    closeButton.addEventListener('click', () => {
      document.body.removeChild(warningDiv);
    });
    
    warningDiv.appendChild(closeButton);
    document.body.appendChild(warningDiv);
    
    // Trafik butonunu devre dışı bırak
    const trafficButton = document.getElementById('toggle-traffic');
    if (trafficButton) {
      trafficButton.disabled = true;
      trafficButton.title = 'TomTom API anahtarı gerekiyor';
    }
  }
}