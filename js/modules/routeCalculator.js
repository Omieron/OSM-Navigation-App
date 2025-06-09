/**
 * RouteCalculator - Segment sistemi düzeltilmiş versiyon
 * 
 * Düzeltilen sorunlar:
 * 1. Segment oluşturma algoritması optimize edildi
 * 2. Koordinat hassasiyeti artırıldı
 * 3. Cache uyumluluğu iyileştirildi
 * 4. Debug bilgileri genişletildi
 */
import TrafficDataManager from './TrafficDataManager.js';

export default class RouteCalculator {
  constructor(config, eventBus) {
    this.config = config;
    this.eventBus = eventBus;
    this.routeLayer = null;
    this.routeSource = new ol.source.Vector();

    this.trafficDataManager = new TrafficDataManager(config, eventBus);

    // EventBus olaylarını dinle
    this.eventBus.subscribe('route:calculate', this.calculateRoute.bind(this));
    this.eventBus.subscribe('route:clear', this.clearRoute.bind(this));
    this.eventBus.subscribe('map:ready', this.setupRouteLayer.bind(this));
  }

  setupRouteLayer(map) {
    this.routeLayer = new ol.layer.Vector({
      source: this.routeSource,
      style: new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: this.config.routeStyle.lineColor,
          width: this.config.routeStyle.lineWidth
        })
      })
    });

    map.addLayer(this.routeLayer);
    console.log('Rota layer haritaya eklendi');
  }

  clearRoute() {
    if (this.routeSource) {
      this.routeSource.clear();
      console.log('Rota temizlendi');
    }
  }

  calculateRoute(routeRequest) {
    this.clearRoute();

    const { start, end, type } = routeRequest;
    console.log(`Rota hesaplanıyor: ${type} tipi ile`);
    console.log(`Başlangıç: ${start[0].toFixed(6)}, ${start[1].toFixed(6)}`);
    console.log(`Bitiş: ${end[0].toFixed(6)}, ${end[1].toFixed(6)}`);

    // OSRM API'ye rota hesaplama isteği gönder
    this.fetchRouteFromOSRM(start, end, type);
  }

  fetchRouteFromOSRM(start, end, type) {
    // Yükleniyor durumunu bildirme
    this.eventBus.publish('route:loading', true);

    // OSRM'ye uygun profil belirle
    const profile = this.config.api.profiles[type] || 'car';

    // OSRM'ye uygun koordinat formatı oluştur: "lon,lat;lon,lat"
    const coordinates = `${start[0]},${start[1]};${end[0]},${end[1]}`;

    // OSRM API URL'sini oluştur
    const baseUrl = this.config.api.baseUrl;
    const routeEndpoint = this.config.api.route;

    // OSRM parametrelerini oluştur
    const params = new URLSearchParams({
      overview: this.config.api.params.overview,
      geometries: this.config.api.params.geometries,
      steps: this.config.api.params.steps,
      annotations: this.config.api.params.annotations
    }).toString();

    // URL'yi oluştur: /route/v1/{profile}/{coordinates}?params
    const url = `${baseUrl}${routeEndpoint}/${profile}/${coordinates}?${params}`;

    console.log(`OSRM API isteği gönderiliyor: ${url}`);

    // Zaman aşımı için controller
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      mode: 'cors',
      signal: controller.signal
    })
      .then(response => {
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then(async data => {
        console.log('OSRM yanıtı alındı:', data);

        if (data.code !== 'Ok') {
          console.error(`Rota hesaplama hatası: ${data.message || 'Bilinmeyen hata'}`);
          this.showStatusMessage(`Rota hesaplama hatası: ${data.message || 'OSRM rotayı hesaplayamadı'}`, 'error');
          return;
        }

        // OSRM GeoJSON verisini çiz
        this.drawRouteFromOSRM(data);

        // 🚀 YENİ - Trafik verilerini uygula
        const routeStats = await this.applyTrafficToRoute(data, type);

        // Route hesaplanması eventini yayınla
        this.eventBus.publish('route:calculated', routeStats);

        // Rota bilgilerini göster (trafik aware)
        this.showRouteInformation(routeStats);
      })
      .catch(error => {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
          console.error('API isteği zaman aşımına uğradı.');
          this.showStatusMessage('OSRM yanıt vermedi. OSRM Docker servisinin çalıştığından emin olun.', 'error');
          return;
        }

        if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
          console.error('CORS hatası veya bağlantı sorunu:', error);
          this.showStatusMessage('CORS hatası! OSRM servisi bağlantı sorunu.', 'error');
          return;
        }

        console.error('Rota hesaplama hatası:', error);
        this.showStatusMessage(`Rota hesaplama sırasında bir hata oluştu: ${error.message}`, 'error');
      })
      .finally(() => {
        this.eventBus.publish('route:loading', false);
      });
  }

  showStatusMessage(message, type = 'info') {
    const statusText = document.getElementById('selection-status');
    if (statusText) {
      statusText.textContent = message;

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

      setTimeout(() => {
        statusText.textContent = 'Rota seçimi için bir işlem seçin';
        statusText.style.backgroundColor = '#f5f5f5';
        statusText.style.color = '#333';
      }, 5000);
    }

    console.log(`Durum mesajı (${type}): ${message}`);
  }

  drawRouteFromOSRM(osrmResponse) {
    try {
      if (!osrmResponse || !osrmResponse.routes || osrmResponse.routes.length === 0) {
        console.warn('Geçerli OSRM rota verisi bulunamadı:', osrmResponse);
        return;
      }

      const route = osrmResponse.routes[0];

      const routeGeoJSON = {
        type: 'Feature',
        properties: {
          distance: route.distance,
          duration: route.duration
        },
        geometry: route.geometry
      };

      console.log('İşlenecek GeoJSON (OSRM):', routeGeoJSON);

      const feature = new ol.format.GeoJSON().readFeature(routeGeoJSON, {
        featureProjection: 'EPSG:3857'
      });

      feature.set('type', 'route');
      this.routeSource.addFeature(feature);

      console.log('OSRM rotası çizildi');
      this.zoomToRoute();
    } catch (error) {
      console.error('OSRM verisi işleme hatası:', error);
      console.error('Hatalı veri:', osrmResponse);
    }
  }

  zoomToRoute() {
    if (this.routeSource.getFeatures().length === 0) return;

    const extent = this.routeSource.getExtent();
    this.eventBus.publish('map:zoomToExtent', {
      extent: extent,
      padding: [50, 50, 50, 50],
      duration: this.config.map.animationDuration
    });
  }

  calculateOSRMRouteStatistics(osrmResponse, type) {
    const route = osrmResponse.routes[0];
    const distanceKm = route.distance / 1000;
    const durationMinutes = Math.round(route.duration / 60);

    let coordinates = [];
    if (route.geometry && route.geometry.coordinates) {
      coordinates = route.geometry.coordinates;
    }

    return {
      distance: distanceKm,
      duration: durationMinutes,
      type: type,
      coordinates: coordinates
    };
  }

  formatDuration(minutes) {
    if (!minutes || minutes < 0) return '0 dakika';

    if (minutes < 60) {
      return `${Math.round(minutes)} dakika`;
    } else {
      const hours = Math.floor(minutes / 60);
      const mins = Math.round(minutes % 60);
      return `${hours} saat${mins > 0 ? ` ${mins} dakika` : ''}`;
    }
  }

  showRouteInformation(routeStats) {
    const {
      distance,
      originalDuration,
      trafficDuration,
      type,
      cacheStats,
      hasTrafficData,
      trafficFactor
    } = routeStats;

    let vehicleText = type === 'car' ? 'Araba' :
      type === 'bicycle' ? 'Bisiklet' :
        type === 'pedestrian' ? 'Yaya' : 'Araç';

    let distanceText = distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`;
    let originalText = this.formatDuration(originalDuration || routeStats.duration);
    let displayDuration = originalDuration || routeStats.duration;
    let statusMessage = `${vehicleText}: ${distanceText}`;

    if (hasTrafficData && trafficDuration && trafficDuration !== displayDuration) {
      const trafficText = this.formatDuration(trafficDuration);
      const diffMinutes = trafficDuration - displayDuration;
      const diffPercent = Math.round((trafficDuration / displayDuration - 1) * 100);

      statusMessage += `, Trafik ile: ${trafficText}`;
      if (diffPercent > 0) {
        statusMessage += ` (+${diffPercent}%)`;
      }

      displayDuration = trafficDuration;
    } else {
      statusMessage += `, Süre: ${originalText}`;
    }

    if (cacheStats && hasTrafficData) {
      statusMessage += ` | Cache: ${cacheStats.hitRate}%`;
    }

    console.log(`🚗 Rota Bilgileri:`);
    console.log(`   Araç: ${vehicleText}`);
    console.log(`   Mesafe: ${distanceText}`);
    console.log(`   Normal süre: ${originalText}`);
    if (hasTrafficData && trafficDuration) {
      console.log(`   Trafik ile: ${this.formatDuration(trafficDuration)} (${Math.round((trafficFactor - 1) * 100)}% yavaş)`);
      console.log(`   Cache performansı: ${cacheStats.hitRate}% hit rate, ${cacheStats.apiCalls} API calls`);
    }

    this.showStatusMessage(statusMessage, 'success');
    this.updateRouteInfoPanel(routeStats);
  }

  updateRouteInfoPanel(routeStats) {
    const routeInfo = document.getElementById('route-info');
    const routeDetails = document.getElementById('route-details');

    if (routeInfo && routeDetails) {
      const {
        distance,
        originalDuration,
        trafficDuration,
        type,
        cacheStats,
        hasTrafficData,
        trafficFactor
      } = routeStats;

      const vehicleText = type === 'car' ? 'Araba' : type;
      const distanceText = distance < 1 ? Math.round(distance * 1000) + ' m' : distance.toFixed(1) + ' km';

      let html = `<p><strong>Araç:</strong> ${vehicleText}</p>`;
      html += `<p><strong>Mesafe:</strong> ${distanceText}</p>`;

      if (hasTrafficData && trafficDuration && originalDuration) {
        html += `<p><strong>Normal Süre:</strong> ${this.formatDuration(originalDuration)}</p>`;

        const diffPercent = Math.round((trafficDuration / originalDuration - 1) * 100);
        const color = diffPercent > 0 ? '#f44336' : '#4CAF50';
        html += `<p><strong>Trafik İle:</strong> <span style="color: ${color}">${this.formatDuration(trafficDuration)}`;
        if (diffPercent !== 0) {
          html += ` (${diffPercent > 0 ? '+' : ''}${diffPercent}%)`;
        }
        html += `</span></p>`;

        if (cacheStats) {
          html += `<p><strong>Cache:</strong> ${cacheStats.hitRate}% hit (${cacheStats.apiCalls} API)</p>`;
        }
      } else {
        html += `<p><strong>Tahmini Süre:</strong> ${this.formatDuration(originalDuration || routeStats.duration)}</p>`;
        if (!hasTrafficData) {
          html += `<p><em>Trafik verisi alınamadı</em></p>`;
        }
      }

      routeDetails.innerHTML = html;
      routeInfo.style.display = 'block';
    }
  }

  /**
   * 🔧 DÜZELTİLDİ: OSRM rotasına trafik verilerini uygular
   */
  async applyTrafficToRoute(osrmResponse, vehicleType) {
    try {
      const route = osrmResponse.routes[0];
      if (!route || !route.geometry?.coordinates) {
        console.warn('OSRM rotasında geometry bulunamadı, normal hesaplama yapılıyor');
        return this.calculateOSRMRouteStatistics(osrmResponse, vehicleType);
      }

      console.log('🚦 Trafik verileri rotaya uygulanıyor...');

      // 🔧 DÜZELTİLDİ: Rota koordinatlarını segmentlere böl
      const segments = this.createRouteSegments(route.geometry.coordinates);
      console.log(`📊 Rota ${segments.length} segmente bölündü`);

      // Her segment için trafik verisi al (cache'den veya API'den)
      console.log('🌐 Segment trafik verileri alınıyor...');
      const trafficPromises = segments.map(segment =>
        this.trafficDataManager.getSegmentTraffic(segment)
      );

      const trafficData = await Promise.all(trafficPromises);
      console.log('✅ Tüm segment trafik verileri alındı');

      // Trafik verilerini rota süresine uygula
      const trafficAwareDuration = this.calculateTrafficAwareDuration(
        segments,
        trafficData,
        route.duration
      );

      // Original stats'i al ve trafik verisiyle güncelle
      const stats = this.calculateOSRMRouteStatistics(osrmResponse, vehicleType);

      // Cache istatistiklerini al
      const cacheStats = this.trafficDataManager.getStats();

      const result = {
        ...stats,
        originalDuration: stats.duration,
        trafficDuration: Math.round(trafficAwareDuration / 60), // saniyeden dakikaya
        trafficFactor: trafficAwareDuration / route.duration,
        segmentCount: segments.length,
        cacheStats: cacheStats,
        hasTrafficData: true
      };

      console.log('🎯 Trafik uygulaması tamamlandı:', {
        originalDuration: stats.duration,
        trafficDuration: result.trafficDuration,
        improvement: `${Math.round((result.trafficFactor - 1) * 100)}%`,
        cacheHitRate: `${cacheStats.hitRate}%`
      });

      return result;

    } catch (error) {
      console.error('❌ Trafik uygulama hatası:', error);
      const fallbackStats = this.calculateOSRMRouteStatistics(osrmResponse, vehicleType);
      return {
        ...fallbackStats,
        hasTrafficData: false,
        error: error.message
      };
    }
  }

  /**
   * 🔧 DÜZELTİLDİ: Rota koordinatlarını segmentlere böler - Daha akıllı algoritma
   * @param {Array} coordinates - OSRM'den gelen koordinat dizisi [[lon, lat], ...]
   * @param {number} maxSegmentLength - Maksimum segment uzunluğu (metre)
   * @returns {Array} - Segment dizisi
   */
  createRouteSegments(coordinates, maxSegmentLength = 1500) {
    if (!coordinates || coordinates.length < 2) {
      console.warn('Yetersiz koordinat verisi');
      return [];
    }

    const segments = [];
    let currentDistance = 0;
    let segmentStart = coordinates[0];
    let segmentStartIndex = 0;

    console.log(`🗺️ ${coordinates.length} koordinat ile segment oluşturma başlıyor...`);

    for (let i = 1; i < coordinates.length; i++) {
      // İki koordinat arası mesafe hesapla
      const distance = this.calculateDistance(
        [coordinates[i - 1][1], coordinates[i - 1][0]], // [lat, lon] formatına çevir
        [coordinates[i][1], coordinates[i][0]]           // [lat, lon] formatına çevir
      );
      
      currentDistance += distance;

      // Segment uzunluğu aşıldığında veya son koordinatta segment oluştur
      if (currentDistance >= maxSegmentLength || i === coordinates.length - 1) {
        
        // 🔧 DÜZELTİLDİ: Segment koordinatları [lat, lon] formatında
        const segment = {
          start: [segmentStart[1], segmentStart[0]], // [lat, lon] formatına çevir
          end: [coordinates[i][1], coordinates[i][0]], // [lat, lon] formatına çevir
          distance: currentDistance / 1000, // metre -> km
          startIndex: segmentStartIndex,
          endIndex: i,
          coordinateCount: i - segmentStartIndex + 1
        };

        // Çok kısa segment'leri atla
        if (segment.distance > 0.1) { // 100 metre minimum
          segments.push(segment);
        }

        // Sonraki segment için başlangıç noktasını güncelle
        segmentStart = coordinates[i];
        segmentStartIndex = i;
        currentDistance = 0;
      }
    }

    console.log(`✅ ${segments.length} segment oluşturuldu (ortalama: ${(coordinates.length / segments.length).toFixed(1)} nokta/segment)`);
    
    // İlk birkaç segment'i debug için logla
    if (segments.length > 0 && this.config.debug.verbose) {
      console.log('🔍 İlk segment örnekleri:');
      segments.slice(0, 3).forEach((seg, idx) => {
        console.log(`   ${idx}: ${seg.distance.toFixed(2)}km - [${seg.start[0].toFixed(4)},${seg.start[1].toFixed(4)}] -> [${seg.end[0].toFixed(4)},${seg.end[1].toFixed(4)}]`);
      });
    }

    return segments;
  }

  /**
   * İki koordinat arası mesafe hesapla (Haversine formülü)
   * @param {Array} coord1 - [lat, lon] formatında koordinat 1
   * @param {Array} coord2 - [lat, lon] formatında koordinat 2
   * @returns {number} - Mesafe (metre)
   */
  calculateDistance(coord1, coord2) {
    const R = 6371000; // Dünya yarıçapı (metre)

    const lat1 = coord1[0] * Math.PI / 180;
    const lat2 = coord2[0] * Math.PI / 180;
    const deltaLat = (coord2[0] - coord1[0]) * Math.PI / 180;
    const deltaLon = (coord2[1] - coord1[1]) * Math.PI / 180;

    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) *
      Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Trafik verisiyle süre hesapla
   * @param {Array} segments - Segment dizisi
   * @param {Array} trafficData - Her segmente karşılık gelen trafik verisi
   * @param {number} originalDuration - OSRM'den gelen orijinal süre (saniye)
   * @returns {number} - Trafik uygulanmış süre (saniye)
   */
  calculateTrafficAwareDuration(segments, trafficData, originalDuration) {
    let totalTrafficFactor = 0;
    let totalWeight = 0;

    // Her segment için ağırlıklı trafik faktörü hesapla
    segments.forEach((segment, index) => {
      const traffic = trafficData[index];
      const weight = segment.distance; // Segment uzunluğu ağırlık olarak kullan

      totalTrafficFactor += traffic.trafficFactor * weight;
      totalWeight += weight;
    });

    // Ağırlıklı ortalama trafik faktörü
    const avgTrafficFactor = totalWeight > 0 ? totalTrafficFactor / totalWeight : 1;

    // Orijinal süreye trafik faktörünü uygula
    const trafficAwareDuration = originalDuration * avgTrafficFactor;

    console.log('📊 Trafik süre hesaplama:', {
      originalDuration: Math.round(originalDuration / 60),
      avgTrafficFactor: avgTrafficFactor.toFixed(2),
      trafficDuration: Math.round(trafficAwareDuration / 60),
      segments: segments.length
    });

    return trafficAwareDuration;
  }
}