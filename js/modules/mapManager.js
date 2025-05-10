/**
 * MapManager - Harita işlemlerini yöneten modül
 * OpenLayers haritasını başlatır ve harita ile ilgili temel işlevleri sağlar
 */
export default class MapManager {
  /**
   * MapManager sınıfını başlatır
   * @param {Object} config - Konfigürasyon ayarları
   * @param {Object} eventBus - Modüller arası iletişim için EventBus
   */
  constructor(config, eventBus) {
    this.config = config;
    this.eventBus = eventBus;
    this.map = null;
    this.vectorSource = new ol.source.Vector();
    this.vectorLayer = null;
    
    // EventBus olaylarını dinle
    this.eventBus.subscribe('map:zoomToLocation', this.zoomToLocation.bind(this));
    this.eventBus.subscribe('map:zoomToExtent', this.zoomToExtent.bind(this)); // Yeni event
    this.eventBus.subscribe('map:addFeature', this.addFeature.bind(this));
    this.eventBus.subscribe('map:removeFeature', this.removeFeature.bind(this));
    this.eventBus.subscribe('map:clearFeatures', this.clearFeatures.bind(this));
    
    this.init();
  }
  
  /**
   * Haritayı başlatır
   */
  init() {
    // Vector layer'ı oluştur (markerlar için)
    this.vectorLayer = new ol.layer.Vector({
      source: this.vectorSource,
      style: this.styleFunction.bind(this)
    });
  
    // Haritayı oluştur
    this.map = new ol.Map({
      target: 'map',
      layers: [
        new ol.layer.Tile({
          source: new ol.source.OSM()
        }),
        this.vectorLayer // Marker layer'ı ekle
      ],
      view: new ol.View({
        center: ol.proj.fromLonLat(this.config.map.initialView.turkey.center),
        zoom: this.config.map.initialView.turkey.zoom,
        minZoom: this.config.map.minZoom,
        maxZoom: this.config.map.maxZoom
      }),
      controls: ol.control.defaults.defaults().extend([
        new ol.control.ScaleLine(), // Ölçek çizgisi ekle
        new ol.control.FullScreen() // Tam ekran kontrolü ekle
      ])
    });
    
    // Harita tıklama olayını dinle
    this.map.on('click', this.handleMapClick.bind(this));
    
    // Harita hazır olduğunda EventBus aracılığıyla bildir
    this.map.once('rendercomplete', () => {
      console.log('Harita yüklendi!');
      this.eventBus.publish('map:ready', this.map);
    });
  }
  
  /**
   * Harita tıklamalarını işler ve EventBus üzerinden iletir
   * @param {Object} evt - Tıklama olayı
   */
  handleMapClick(evt) {
    const coordinate = evt.coordinate;
    const lonLat = ol.proj.toLonLat(coordinate);
    
    // Tıklama olayını EventBus üzerinden yayınla
    this.eventBus.publish('map:clicked', {
      coordinate: coordinate,
      lonLat: lonLat
    });
  }
  
  /**
   * Feature (marker, çizgi vb.) stilini belirler
   * @param {ol.Feature} feature - Stili belirlenecek OpenLayers feature
   * @returns {ol.style.Style} - Oluşturulan stil
   */
  styleFunction(feature) {
    const type = feature.get('type');
    
    if (type === 'start' || type === 'end') {
      const markerConfig = type === 'start' ? 
        this.config.markers.start : 
        this.config.markers.end;
      
      return new ol.style.Style({
        image: new ol.style.Circle({
          radius: markerConfig.radius,
          fill: new ol.style.Fill({
            color: markerConfig.fillColor
          }),
          stroke: new ol.style.Stroke({
            color: markerConfig.strokeColor,
            width: markerConfig.strokeWidth
          })
        })
      });
    } else if (type === 'route') {
      // Rota stili
      return new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: this.config.routeStyle.lineColor,
          width: this.config.routeStyle.lineWidth
        })
      });
    }
    
    // Varsayılan stil
    return new ol.style.Style({
      image: new ol.style.Circle({
        radius: 5,
        fill: new ol.style.Fill({
          color: '#007bff'
        }),
        stroke: new ol.style.Stroke({
          color: '#ffffff',
          width: 1
        })
      })
    });
  }
  
  /**
   * Belirli bir konuma yakınlaşır
   * @param {Object} params - {coords: [lon, lat], zoom: number, duration?: number}
   */
  zoomToLocation(params) {
    const { coords, zoom, duration = this.config.map.animationDuration } = params;
    
    this.map.getView().animate({
      center: ol.proj.fromLonLat(coords),
      zoom: zoom,
      duration: duration
    });
  }

  /**
   * Verilen yayılıma (extent) göre haritayı yakınlaştırır
   * @param {Object} params - {extent: [minX, minY, maxX, maxY], padding?: [top, right, bottom, left], duration?: number}
   */
  zoomToExtent(params) {
    const { 
      extent, 
      padding = [50, 50, 50, 50], 
      duration = this.config.map.animationDuration 
    } = params;
    
    if (!extent) {
      console.warn('zoomToExtent: extent parametresi sağlanmadı');
      return;
    }
    
    // Harita görünümünü belirtilen alana göre ayarla
    this.map.getView().fit(extent, {
      padding: padding,
      duration: duration
    });
  }
  
  /**
   * Feature'ı harita layer'ına ekler
   * @param {ol.Feature} feature - Eklenecek feature
   */
  addFeature(feature) {
    this.vectorSource.addFeature(feature);
  }
  
  /**
   * Feature'ı harita layer'ından kaldırır
   * @param {ol.Feature} feature - Kaldırılacak feature
   */
  removeFeature(feature) {
    this.vectorSource.removeFeature(feature);
  }
  
  /**
   * Tüm feature'ları temizler
   */
  clearFeatures() {
    this.vectorSource.clear();
  }
  
  /**
   * Harita referansını döndürür
   * @returns {ol.Map} - OpenLayers harita nesnesi
   */
  getMap() {
    return this.map;
  }
  
  /**
   * Vector source referansını döndürür
   * @returns {ol.source.Vector} - OpenLayers vector source nesnesi
   */
  getVectorSource() {
    return this.vectorSource;
  }
}