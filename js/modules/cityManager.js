/**
 * CityManager - Şehir seçimi ve yönetimi için modül
 */
export default class CityManager {
    /**
     * CityManager sınıfını başlatır
     * @param {Object} config - Konfigürasyon ayarları
     * @param {Object} eventBus - Modüller arası iletişim için EventBus
     */
    constructor(config, eventBus) {
      this.config = config;
      this.eventBus = eventBus;
      this.currentCity = this.getDefaultCity();
      
      // EventBus olaylarını dinle
      this.eventBus.subscribe('city:changed', this.handleCityChange.bind(this));
      
      // UI'ı başlangıçta güncelle
      this.updateUI();
    }
    
    /**
     * Varsayılan şehri döndürür
     * @returns {string} - Varsayılan şehir ID'si
     */
    getDefaultCity() {
      const defaultCity = this.config.cities.find(city => city.default);
      return defaultCity ? defaultCity.id : 'balikesir';
    }
    
    /**
     * Şehir değişikliği olayını işler
     * @param {string} cityId - Yeni şehir ID'si
     */
    handleCityChange(cityId) {
      console.log(`Şehir değiştirildi: ${cityId}`);
      this.currentCity = cityId;
      
      // Diğer modülleri bilgilendir
      this.eventBus.publish('city:updated', {
        id: cityId,
        config: this.getCityConfig(cityId)
      });
    }
    
    /**
     * Belirli bir şehir için yapılandırmayı döndürür
     * @param {string} cityId - Şehir ID'si
     * @returns {Object} - Şehir yapılandırması
     */
    getCityConfig(cityId) {
      const city = this.config.cities.find(c => c.id === cityId);
      
      return {
        id: cityId,
        name: city ? city.name : cityId.charAt(0).toUpperCase() + cityId.slice(1),
        center: this.config.map.initialView[cityId]?.center || this.config.map.initialView.turkey.center,
        zoom: this.config.map.initialView[cityId]?.zoom || this.config.map.initialView.turkey.zoom
      };
    }
    
    /**
     * Varsayılan şehri UI'da ayarlar
     */
    updateUI() {
      // Şehir seçim menüsü
      const citySelect = document.getElementById('city-select');
      if (citySelect) {
        citySelect.value = this.currentCity;
      }
      
      // Aktif şehir metni
      const activeCity = document.getElementById('active-city');
      if (activeCity) {
        const cityConfig = this.getCityConfig(this.currentCity);
        activeCity.textContent = cityConfig.name;
      }
      
      // Aktif veritabanı metni
      const activeDatabase = document.getElementById('active-database');
      if (activeDatabase) {
        activeDatabase.textContent = `routing_${this.currentCity}`;
      }
    }
    
    /**
 * Backend'den şehirler listesini yükler
 */
async loadCities() {
    try {
      const response = await fetch(`${this.config.api.baseUrl}${this.config.api.cities}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const citiesData = await response.json();
      console.log('Şehirler verileri yüklendi:', citiesData);
      
      // Şehir listesini güncelle (artık bir obje olarak geliyor)
      if (citiesData && typeof citiesData === 'object') {
        this.updateCityList(citiesData);
      } else {
        console.warn('Beklenmeyen şehir verisi formatı:', citiesData);
      }
      
    } catch (error) {
      console.error('Şehirler listesi yüklenirken hata:', error);
    }
  }
  
  /**
   * Şehir listesini backenddeki veriyle günceller
   * @param {Object} citiesData - Backend'den gelen şehir verileri
   */
  updateCityList(citiesData) {
    if (!citiesData || typeof citiesData !== 'object') return;
    
    const citySelect = document.getElementById('city-select');
    if (!citySelect) return;
    
    // Mevcut seçimi hatırla
    const currentSelection = citySelect.value;
    
    // Select menüsünü temizle
    citySelect.innerHTML = '';
    
    // Yapılandırmadaki statik şehirleri ekle
    this.config.cities.forEach(city => {
      const option = document.createElement('option');
      option.value = city.id;
      option.textContent = city.name;
      citySelect.appendChild(option);
    });
    
    // Backend'den gelen ekstra şehirleri ekle
    Object.keys(citiesData).forEach(cityId => {
      // Eğer bu şehir zaten listedeyse, ekleme
      if (this.config.cities.some(c => c.id === cityId)) {
        return;
      }
      
      const option = document.createElement('option');
      option.value = cityId;
      option.textContent = cityId.charAt(0).toUpperCase() + cityId.slice(1);
      citySelect.appendChild(option);
    });
    
    // Önceki seçimi geri yükle
    citySelect.value = currentSelection;
  }
}