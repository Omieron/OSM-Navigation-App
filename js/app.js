/**
 * Ana uygulama başlatıcı
 * Tüm modülleri yükler ve başlatır
 */
import EventBus from './utils/eventBus.js';
import config from './config.js';
import MapManager from './modules/mapManager.js';
import RouteSelector from './modules/routeSelector.js';
import RouteCalculator from './modules/routeCalculator.js';

// Sayfa yüklendiğinde çalıştır
document.addEventListener('DOMContentLoaded', function() {
  console.log('Navigasyon uygulaması başlatılıyor...');
  
  // EventBus oluştur - tüm modüllerin iletişimi için
  const eventBus = new EventBus();
  
  // Modülleri başlat
  const mapManager = new MapManager(config, eventBus);
  const routeSelector = new RouteSelector(config, eventBus);
  const routeCalculator = new RouteCalculator(config, eventBus);
  
  // Zoom butonlarını bağla
  document.getElementById('zoom-turkey').addEventListener('click', function() {
    eventBus.publish('map:zoomToLocation', {
      coords: config.map.initialView.turkey.center,
      zoom: config.map.initialView.turkey.zoom
    });
  });
  
  document.getElementById('zoom-istanbul').addEventListener('click', function() {
    eventBus.publish('map:zoomToLocation', {
      coords: config.map.initialView.istanbul.center,
      zoom: config.map.initialView.istanbul.zoom
    });
  });
  
  document.getElementById('zoom-ankara').addEventListener('click', function() {
    eventBus.publish('map:zoomToLocation', {
      coords: config.map.initialView.ankara.center,
      zoom: config.map.initialView.ankara.zoom
    });
  });
  
  // Rota yükleniyor durumu eventbusunu dinle
  eventBus.subscribe('route:loading', function(isLoading) {
    const calcButton = document.getElementById('calculate-route');
    if (isLoading) {
      calcButton.disabled = true;
      calcButton.textContent = 'Rota hesaplanıyor...';
    } else {
      calcButton.disabled = false;
      calcButton.textContent = 'Rota Hesapla';
    }
  });
  
  // Uygulama hazır olduğunda EventBus üzerinden bildir
  eventBus.publish('app:ready', {
    timestamp: Date.now()
  });
  
  // Backend bağlantısını test et
  testBackendConnection();
});

/**
 * Backend API bağlantısını kontrol eder
 */
function testBackendConnection() {
  const statusText = document.createElement('div');
  statusText.id = 'api-status';
  statusText.style.position = 'absolute';
  statusText.style.bottom = '10px';
  statusText.style.right = '10px';
  statusText.style.padding = '5px 10px';
  statusText.style.borderRadius = '4px';
  statusText.style.fontSize = '12px';
  statusText.style.zIndex = '1000';
  statusText.textContent = 'Backend kontrol ediliyor...';
  statusText.style.backgroundColor = '#FFF59D';
  document.body.appendChild(statusText);
  
  fetch(`${config.api.baseUrl}${config.api.districts}`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      statusText.textContent = 'Backend bağlantısı başarılı';
      statusText.style.backgroundColor = '#A5D6A7';
      
      // 3 saniye sonra mesajı gizle
      setTimeout(() => {
        statusText.style.opacity = '0';
        statusText.style.transition = 'opacity 1s';
      }, 3000);
      
      return response.json();
    })
    .catch(error => {
      console.error('Backend API kontrol hatası:', error);
      statusText.textContent = 'Backend bağlantısı başarısız!';
      statusText.style.backgroundColor = '#EF9A9A';
      
      // Backend URL'sini göster
      const urlInfo = document.createElement('div');
      urlInfo.style.fontSize = '10px';
      urlInfo.style.marginTop = '5px';
      urlInfo.textContent = `URL: ${config.api.baseUrl}`;
      statusText.appendChild(urlInfo);
      
      // WSL IP adresi ile ilgili bilgilendirme ekle
      const tipInfo = document.createElement('div');
      tipInfo.style.fontSize = '10px';
      tipInfo.style.marginTop = '5px';
      tipInfo.textContent = 'config.js dosyasında backend URL ayarlarını kontrol edin.';
      statusText.appendChild(tipInfo);
    });
}