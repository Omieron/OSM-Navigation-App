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
  
  // Uygulama hazır olduğunda EventBus üzerinden bildir
  eventBus.publish('app:ready', {
    timestamp: Date.now()
  });
});