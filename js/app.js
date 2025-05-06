// Sayfa yüklendiğinde çalıştır
document.addEventListener('DOMContentLoaded', function() {
    // Haritayı oluştur
    const map = new ol.Map({
      target: 'map',
      layers: [
        new ol.layer.Tile({
          source: new ol.source.OSM()
        })
      ],
      view: new ol.View({
        center: ol.proj.fromLonLat([35.24, 38.96]), // Türkiye'nin merkezi
        zoom: 6
      })
    });
  
    // Buton kontrollerini bağla
    document.getElementById('zoom-turkey').addEventListener('click', function() {
      map.getView().animate({
        center: ol.proj.fromLonLat([35.24, 38.96]),
        zoom: 6,
        duration: 1000
      });
    });
  
    document.getElementById('zoom-istanbul').addEventListener('click', function() {
      map.getView().animate({
        center: ol.proj.fromLonLat([29.01, 41.01]), // İstanbul
        zoom: 10,
        duration: 1000
      });
    });
  
    document.getElementById('zoom-ankara').addEventListener('click', function() {
      map.getView().animate({
        center: ol.proj.fromLonLat([32.85, 39.92]), // Ankara
        zoom: 10,
        duration: 1000
      });
    });
  
    // Harita hazır olduğunda konsola bilgi ver
    map.once('rendercomplete', function() {
      console.log('Harita yüklendi!');
    });
  });