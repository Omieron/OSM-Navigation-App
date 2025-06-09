/**
 * Ana uygulama başlatıcı
 * Grid sistemi kaldırıldı - sadece rota renklendirme
 */
import EventBus from "./utils/eventBus.js";
import config from "./config.js";
import MapManager from "./modules/mapManager.js";
import RouteSelector from "./modules/routeSelector.js";
import RouteCalculator from "./modules/routeCalculator.js";
import TrafficManager from "./modules/TrafficManager.js"; // Basit versiyon

// Sayfa yüklendiğinde çalıştır
document.addEventListener("DOMContentLoaded", function() {
  console.log("🚀 Navigasyon uygulaması başlatılıyor...");
  
  // EventBus oluştur
  const eventBus = new EventBus();
  
  // Modülleri başlat
  const mapManager = new MapManager(config, eventBus);
  const routeSelector = new RouteSelector(config, eventBus);
  const routeCalculator = new RouteCalculator(config, eventBus);
  const trafficManager = new TrafficManager(config, eventBus); // ✅ Sadece rota renklendirme

  // Global erişim (debug için)
  window.app = {
    config: config,
    eventBus: eventBus,
    mapManager: mapManager,
    routeSelector: routeSelector,
    routeCalculator: routeCalculator,
    trafficManager: trafficManager
    // routeTrafficOverlay trafficManager.initialize()'de eklenir
  };

  console.log("🚀 Debug için window.app oluşturuldu:", window.app);
  
  // UI Event listener'ları
  setupUIEventListeners(eventBus);
  
  // Backend sistem kontrollerini başlat
  initializeBackendChecks(eventBus);
  
  // Uygulama hazır
  eventBus.publish("app:ready", {
    timestamp: Date.now()
  });
});

/**
 * UI event listener'larını ayarlar
 * @param {Object} eventBus - Event bus referansı
 */
function setupUIEventListeners(eventBus) {
  // Zoom butonları
  document.getElementById('zoom-turkey').addEventListener('click', function() {
    eventBus.publish('map:zoomToLocation', {
      coords: config.map.initialView.turkey.center,
      zoom: config.map.initialView.turkey.zoom
    });
  });
  
  // ✅ Trafik butonu - sadece rota renklendirme için
  document.getElementById('toggle-traffic').addEventListener('click', function() {
    eventBus.publish('traffic:toggle');
  });
  
  // Loading overlay eventleri
  setupLoadingEventListeners(eventBus);
}

/**
 * Loading overlay event listener'larını ayarlar
 * @param {Object} eventBus - Event bus referansı
 */
function setupLoadingEventListeners(eventBus) {
  // Rota yükleniyor durumu
  eventBus.subscribe('route:loading', function(isLoading) {
    const loadingOverlay = document.getElementById('loading-overlay');
    
    if (isLoading) {
      loadingOverlay.style.display = 'flex';
      document.body.classList.add('loading');
    } else {
      loadingOverlay.style.display = 'none';
      document.body.classList.remove('loading');
    }
  });
  
  // Trafik yükleniyor durumu
  eventBus.subscribe('traffic:loading', function(isLoading) {
    const trafficButton = document.getElementById('toggle-traffic');
    
    if (isLoading && trafficButton) {
      trafficButton.classList.add('loading');
      trafficButton.disabled = true;
    } else if (trafficButton) {
      trafficButton.classList.remove('loading');
      trafficButton.disabled = false;
    }
  });
}

/**
 * Backend sistem kontrollerini başlatır
 * @param {Object} eventBus - Event bus referansı
 */
async function initializeBackendChecks(eventBus) {
  console.log('🔍 Backend sistem kontrolleri başlatılıyor...');
  
  // Sıralı kontroller
  await checkBackendHealth();
  await checkOSRMStatus();
  await checkTomTomStatus();
  
  console.log('✅ Backend sistem kontrolleri tamamlandı');
}

/**
 * Backend health check
 */
async function checkBackendHealth() {
  const statusDiv = createStatusIndicator('backend-status', 'Backend bağlantısı kontrol ediliyor...');
  
  try {
    console.log('🏥 Backend health check yapılıyor...');
    
    const response = await fetch(`${config.backend.baseUrl}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(config.backend.timeout),
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Backend health check failed: ${response.status}`);
    }
    
    const healthData = await response.json();
    console.log('💚 Backend sağlıklı:', healthData);
    
    updateStatusIndicator(statusDiv, 'Backend bağlantısı başarılı', 'success');
    
    // Health data'yı global olarak sakla
    window.app.backendHealth = healthData;
    
  } catch (error) {
    console.error('❌ Backend health check hatası:', error);
    updateStatusIndicator(
      statusDiv, 
      `Backend bağlantı hatası: ${error.message}`, 
      'error',
      true // persist
    );
  }
}

/**
 * OSRM servis durumunu kontrol eder
 */
async function checkOSRMStatus() {
  const statusDiv = createStatusIndicator('osrm-status', 'OSRM servisi kontrol ediliyor...');
  
  try {
    console.log('🗺️ OSRM servis durumu kontrol ediliyor...');
    
    const response = await fetch(`${config.backend.baseUrl}/api/status/osrm`, {
      method: 'GET',
      signal: AbortSignal.timeout(config.traffic.timeout.status)
    });
    
    const osrmData = await response.json();
    
    if (osrmData.status === 'connected') {
      console.log('✅ OSRM servisi aktif:', osrmData);
      updateStatusIndicator(statusDiv, 'OSRM servisi aktif', 'success');
    } else {
      console.warn('⚠️ OSRM servisi bağlantı sorunu:', osrmData);
      updateStatusIndicator(
        statusDiv, 
        `OSRM bağlantı sorunu: ${osrmData.error}`, 
        'warning',
        true
      );
    }
    
    window.app.osrmStatus = osrmData;
    
  } catch (error) {
    console.error('❌ OSRM status kontrolü hatası:', error);
    updateStatusIndicator(
      statusDiv, 
      'OSRM servisi kullanılamıyor. Docker konteynerini başlatın.', 
      'error',
      true
    );
  }
}

/**
 * TomTom API durumunu kontrol eder
 */
async function checkTomTomStatus() {
  const statusDiv = createStatusIndicator('tomtom-status', 'TomTom API kontrol ediliyor...');
  
  try {
    console.log('🚦 TomTom API durumu kontrol ediliyor...');
    
    const response = await fetch(`${config.backend.baseUrl}/api/status/tomtom`, {
      method: 'GET',
      signal: AbortSignal.timeout(config.traffic.timeout.status)
    });
    
    const tomtomData = await response.json();
    
    if (tomtomData.status === 'connected' && tomtomData.api_key_valid) {
      console.log('✅ TomTom API aktif:', tomtomData);
      updateStatusIndicator(statusDiv, 'TomTom API aktif', 'success');
    } else if (tomtomData.status === 'not_configured') {
      console.warn('⚠️ TomTom API yapılandırılmamış');
      updateStatusIndicator(
        statusDiv, 
        'TomTom API key backend\'de yapılandırılmamış', 
        'warning',
        true
      );
      disableTrafficFeatures();
    } else {
      console.warn('⚠️ TomTom API sorunu:', tomtomData);
      updateStatusIndicator(
        statusDiv, 
        `TomTom API sorunu: ${tomtomData.error}`, 
        'warning',
        true
      );
      disableTrafficFeatures();
    }
    
    window.app.tomtomStatus = tomtomData;
    
  } catch (error) {
    console.error('❌ TomTom status kontrolü hatası:', error);
    updateStatusIndicator(
      statusDiv, 
      'TomTom API kontrol edilemedi', 
      'error',
      true
    );
    disableTrafficFeatures();
  }
}

/**
 * Trafik özelliklerini devre dışı bırakır
 */
function disableTrafficFeatures() {
  const trafficButton = document.getElementById('toggle-traffic');
  if (trafficButton) {
    trafficButton.disabled = true;
    trafficButton.textContent = 'Trafik Servisi Kullanılamıyor';
    trafficButton.style.backgroundColor = '#cccccc';
    trafficButton.title = 'TomTom API yapılandırması gerekiyor';
  }
}

/**
 * Status göstergesi oluşturur
 * @param {string} id - Element ID'si
 * @param {string} message - Gösterilecek mesaj
 * @returns {HTMLElement} - Oluşturulan element
 */
function createStatusIndicator(id, message) {
  // Varolan göstergeyi kaldır
  const existing = document.getElementById(id);
  if (existing) {
    existing.remove();
  }
  
  const statusDiv = document.createElement('div');
  statusDiv.id = id;
  statusDiv.className = 'status-indicator';
  statusDiv.style.cssText = `
    position: absolute;
    bottom: ${getStatusPosition()}px;
    right: 10px;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 1000;
    background-color: #FFF59D;
    color: #333;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    transition: all 0.3s ease;
  `;
  statusDiv.textContent = message;
  
  document.body.appendChild(statusDiv);
  return statusDiv;
}

/**
 * Status göstergesini günceller
 * @param {HTMLElement} statusDiv - Status element
 * @param {string} message - Yeni mesaj
 * @param {string} type - success, error, warning
 * @param {boolean} persist - Kalıcı gösterim
 */
function updateStatusIndicator(statusDiv, message, type = 'info', persist = false) {
  statusDiv.textContent = message;
  
  // Renk ayarları
  const colors = {
    success: { bg: '#A5D6A7', color: '#2E7D32' },
    error: { bg: '#FFCDD2', color: '#C62828' },
    warning: { bg: '#FFE0B2', color: '#EF6C00' },
    info: { bg: '#E1F5FE', color: '#0277BD' }
  };
  
  const colorScheme = colors[type] || colors.info;
  statusDiv.style.backgroundColor = colorScheme.bg;
  statusDiv.style.color = colorScheme.color;
  
  // Kapatma butonu ekle
  if (persist) {
    addCloseButton(statusDiv);
  } else {
    // 5 saniye sonra kaldır
    setTimeout(() => {
      if (statusDiv.parentNode) {
        statusDiv.style.opacity = '0';
        setTimeout(() => {
          if (statusDiv.parentNode) {
            statusDiv.remove();
          }
        }, 300);
      }
    }, 5000);
  }
}

/**
 * Kapatma butonu ekler
 * @param {HTMLElement} statusDiv - Status element
 */
function addCloseButton(statusDiv) {
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.style.cssText = `
    position: absolute;
    right: 5px;
    top: 5px;
    border: none;
    background: none;
    font-size: 16px;
    cursor: pointer;
    color: inherit;
    padding: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  
  closeBtn.onclick = () => {
    statusDiv.style.opacity = '0';
    setTimeout(() => {
      if (statusDiv.parentNode) {
        statusDiv.remove();
      }
    }, 300);
  };
  
  statusDiv.appendChild(closeBtn);
  statusDiv.style.paddingRight = '30px'; // Close button için yer aç
}

/**
 * Status indicator'ların position'ını hesaplar
 * @returns {number} - Bottom position (px)
 */
function getStatusPosition() {
  const existingIndicators = document.querySelectorAll('.status-indicator');
  return 50 + (existingIndicators.length * 50); // Her biri 50px aralıkla
}

/**
 * Test fonksiyonu - Backend endpoint'lerini test eder
 */
function testBackendEndpoints() {
  console.log("🧪 Backend endpoint testleri başlatılıyor...");
  
  const endpoints = [
    { name: "Health", url: "/api/health" },
    { name: "OSRM Status", url: "/api/status/osrm" },
    { name: "TomTom Status", url: "/api/status/tomtom" },
    { name: "Test Route", url: "/api/route/v1/driving/29.0320,40.9923;29.0158,41.0265?overview=false" }
  ];
  
  return new Promise(async (resolve) => {
    for (const endpoint of endpoints) {
      try {
        console.log(`📡 Testing ${endpoint.name}...`);
        const response = await fetch(`${config.backend.baseUrl}${endpoint.url}`);
        const data = await response.json();
        console.log(`✅ ${endpoint.name}:`, data);
      } catch (error) {
        console.error(`❌ ${endpoint.name} error:`, error);
      }
    }
    
    console.log("🏁 Backend endpoint testleri tamamlandı");
    resolve();
  });
}

// Global fonksiyonlar
window.testBackend = testBackendEndpoints;

// ✅ Debug fonksiyonları - sadece rota renklendirme için
window.debugRoute = function() {
  if (window.app && window.app.routeTrafficOverlay) {
    window.app.routeTrafficOverlay.debugTrafficRoute();
  } else {
    console.warn("RouteTrafficOverlay bulunamadı! Önce bir rota oluşturun.");
  }
};

window.toggleRouteTraffic = function() {
  if (window.app && window.app.trafficManager) {
    // ✅ DÜZELTİLDİ: TrafficManager'ın toggleTrafficLayer metodunu direkt çağır
    window.app.trafficManager.toggleTrafficLayer();
    console.log("🔄 Trafik toggle edildi");
  } else {
    console.warn("TrafficManager bulunamadı!");
  }
};

window.clearRouteCache = function() {
  if (window.app && window.app.trafficManager && window.app.trafficManager.dataManager) {
    window.app.trafficManager.dataManager.clearCache();
    console.log("🗑️ Rota cache temizlendi");
  } else {
    console.warn("TrafficDataManager bulunamadı!");
  }
};