/**
 * TrafficUI - Trafik arayüz işlemlerini yöneten sınıf
 */
export default class TrafficUI {
  /**
   * TrafficUI sınıfını başlatır
   * @param {Object} config - Konfigürasyon ayarları
   * @param {Object} eventBus - Modüller arası iletişim için EventBus
   */
  constructor(config, eventBus) {
    this.config = config;
    this.eventBus = eventBus;
  }
  
  /**
   * Dakika cinsinden süreyi formatlı olarak döndürür
   * @param {number} minutes - Dakika cinsinden süre
   * @returns {string} Formatlanmış süre
   */
  formatDuration(minutes) {
    if (minutes < 60) {
      return `${minutes} dakika`;
    } else {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours} saat${mins > 0 ? ` ${mins} dakika` : ''}`;
    }
  }
  
  /**
   * Rota bilgi panelini trafik verisiyle günceller
   * @param {number} distance - Mesafe (km)
   * @param {number} normalDuration - Normal süre (dakika)
   * @param {number} trafficDuration - Trafik varlığında süre (dakika)
   */
  updateRouteInfoWithTraffic(distance, normalDuration, trafficDuration) {
    const routeDetails = document.getElementById('route-details');
    
    if (routeDetails) {
      // Orijinal rota bilgilerini oluştur
      const durationDiff = trafficDuration - normalDuration;
      const durationPercent = Math.round((trafficDuration / normalDuration - 1) * 100);
      
      // Mesafeyi formatla
      const distanceText = this.formatDistance(distance);
      
      // HTML içeriğini güncelle
      routeDetails.innerHTML = `
        <p><strong>Araç:</strong> Araba</p>
        <p><strong>Mesafe:</strong> ${distanceText}</p>
        <p><strong>Normal Süre:</strong> ${this.formatDuration(normalDuration)}</p>
        <p><strong>Trafik Varlığında:</strong> 
          <span style="color: ${durationDiff > 0 ? '#f44336' : '#4CAF50'}">
            ${this.formatDuration(trafficDuration)}
            ${durationDiff !== 0 ? ` (${durationDiff > 0 ? '+' : ''}${durationPercent}%)` : ''}
          </span>
        </p>
      `;
      
      // Rota bilgi panelini görünür yap
      this.showRouteInfoPanel();
    }
  }
  
  /**
   * Rota bilgi panelini normal verilerle günceller
   * @param {number} distance - Mesafe (km)
   * @param {number} duration - Süre (dakika)
   */
  updateRouteInfoWithOriginalData(distance, duration) {
    const routeDetails = document.getElementById('route-details');
    
    if (routeDetails) {
      // Mesafeyi formatla
      const distanceText = this.formatDistance(distance);
      
      // HTML içeriğini güncelle
      routeDetails.innerHTML = `
        <p><strong>Araç:</strong> Araba</p>
        <p><strong>Mesafe:</strong> ${distanceText}</p>
        <p><strong>Tahmini Süre:</strong> ${this.formatDuration(duration)}</p>
      `;
      
      // Rota bilgi panelini görünür yap
      this.showRouteInfoPanel();
    }
  }
  
  /**
   * Mesafeyi formatlar
   * @param {number} distance - Mesafe (km)
   * @returns {string} Formatlanmış mesafe
   */
  formatDistance(distance) {
    if (distance < 1) {
      return `${Math.round(distance * 1000)} m`;
    } else {
      return `${distance.toFixed(1)} km`;
    }
  }
  
  /**
   * Rota bilgi panelini görünür yapar
   */
  showRouteInfoPanel() {
    const routeInfo = document.getElementById('route-info');
    if (routeInfo) {
      routeInfo.style.display = 'block';
    }
  }
  
  /**
   * UI'daki trafik butonu durumunu günceller
   * @param {boolean} isActive - Butonun aktif durumu
   */
  updateTrafficButtonState(isActive) {
    const trafficButton = document.getElementById('toggle-traffic');
    if (trafficButton) {
      trafficButton.classList.toggle('active', isActive);
      trafficButton.textContent = isActive ? 'Trafik Katmanını Kapat' : 'Trafik Katmanını Aç';
      
      // Yükleme durumunu kapat
      trafficButton.classList.remove('loading');
      trafficButton.disabled = false;
    }
  }
  
  /**
   * Durum mesajı gösterir
   * @param {string} message - Gösterilecek mesaj
   * @param {string} type - Mesaj tipi (success, error, info)
   */
  showStatusMessage(message, type = 'info') {
    // Durum mesajını seçim durumu alanında göster
    const statusText = document.getElementById('selection-status');
    if (statusText) {
      statusText.textContent = message;
      
      // Mesaj tipine göre stil
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
      
      // 5 saniye sonra eski haline getir
      setTimeout(() => {
        statusText.textContent = 'Rota seçimi için bir işlem seçin';
        statusText.style.backgroundColor = '#f5f5f5';
        statusText.style.color = '#333';
      }, 5000);
    }
    
    console.log(`Durum mesajı (${type}): ${message}`);
  }
}