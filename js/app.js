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
  
  // Aktif şehir
  let activeCity = 'balikesir'; // Varsayılan şehir
  
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
  
  // Seçili şehre zoom
  document.getElementById('zoom-to-city').addEventListener('click', function() {
    const citySelect = document.getElementById('city-select');
    const selectedCity = citySelect.value;
    
    if (selectedCity && config.map.initialView[selectedCity]) {
      eventBus.publish('map:zoomToLocation', {
        coords: config.map.initialView[selectedCity].center,
        zoom: config.map.initialView[selectedCity].zoom
      });
    }
  });
  
  // Şehir seçimini izle
  document.getElementById('city-select').addEventListener('change', function(e) {
    const selectedCity = e.target.value;
    activeCity = selectedCity;
    
    // UI güncelleme
    document.getElementById('active-city').textContent = 
      selectedCity.charAt(0).toUpperCase() + selectedCity.slice(1);
    
    // Veritabanı ismini güncelle
    document.getElementById('active-database').textContent = 
      `routing_${selectedCity === 'balikesir' ? 'db' : selectedCity}`;
      
    // Şehir değiştiğinde rotayı temizle
    eventBus.publish('route:clear');
    
    // Diğer modülleri şehir değişikliği hakkında bilgilendir
    eventBus.publish('city:changed', selectedCity);
  });
  
  // Route Calculator için city:changed olayını dinleyiciyi manuel olarak oluştur
  // (CityManager olmadığından)
  eventBus.subscribe('city:changed', (cityId) => {
    // RouteCalculator sınıfı içinde bu bilgiyi kullan
    routeCalculator.setCurrentCity(cityId);
    console.log(`Rota hesaplayıcı için şehir ayarlandı: ${cityId}`);
  });
  
  // Rota yükleniyor durumu eventbusunu dinle
  eventBus.subscribe('route:loading', function(isLoading) {
    const calcButton = document.getElementById('calculate-route');
    const loadingOverlay = document.getElementById('loading-overlay');
    
    if (isLoading) {
      // Hesaplama başladığında
      calcButton.disabled = true;
      calcButton.textContent = 'Rota hesaplanıyor...';
      
      // Overlay'i göster
      loadingOverlay.style.display = 'flex';
      
      // Tüm tıklama eventlerini devre dışı bırakmak için overlay'i göster
      document.body.classList.add('loading');
    } else {
      // Hesaplama bittiğinde
      calcButton.disabled = false;
      calcButton.textContent = 'Rota Hesapla';
      
      // Overlay'i gizle
      loadingOverlay.style.display = 'none';
      
      // Tıklama eventlerini tekrar aktif et
      document.body.classList.remove('loading');
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
  
  // API bağlantı durumunu daha güvenli bir şekilde kontrol et
  const checkAPI = async () => {
    try {
      console.log(`Backend API kontrol ediliyor: ${config.api.baseUrl}`);
      
      // Önce fetch ile temel bağlantıyı kontrol et
      // `/cities` endpoint'i olmadığı için `/districts` endpoint'ini kontrol et
      const response = await fetch(`${config.api.baseUrl}/districts`, {
        method: 'GET',
        // Timeout ekle
        signal: AbortSignal.timeout(5000) // 5 saniye timeout
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      // Yanıtı JSON olarak parse et
      const data = await response.json();
      
      // Başarılı mesajı göster
      statusText.textContent = 'Backend bağlantısı başarılı';
      statusText.style.backgroundColor = '#A5D6A7';
      
      // 3 saniye sonra mesajı gizle
      setTimeout(() => {
        statusText.style.opacity = '0';
        statusText.style.transition = 'opacity 1s';
      }, 3000);
      
    } catch (error) {
      console.error('Backend API kontrol hatası:', error);
      statusText.textContent = 'Backend bağlantısı başarısız!';
      statusText.style.backgroundColor = '#EF9A9A';
      
      // Hata detaylarını göster
      const errorDetails = document.createElement('div');
      errorDetails.style.fontSize = '10px';
      errorDetails.style.marginTop = '5px';
      errorDetails.textContent = error.message || 'Bilinmeyen hata';
      statusText.appendChild(errorDetails);
      
      // Backend URL'sini göster
      const urlInfo = document.createElement('div');
      urlInfo.style.fontSize = '10px';
      urlInfo.style.marginTop = '5px';
      urlInfo.textContent = `URL: ${config.api.baseUrl}`;
      statusText.appendChild(urlInfo);
      
      // Config dosyasını güncelleme ipucu
      const configTip = document.createElement('div');
      configTip.style.fontSize = '10px';
      configTip.style.marginTop = '5px';
      configTip.textContent = 'config.js dosyasında baseUrl ayarını güncelleyin.';
      statusText.appendChild(configTip);
    }
  };
  
  // API kontrolünü başlat
  checkAPI();
}