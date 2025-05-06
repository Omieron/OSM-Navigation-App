/**
 * EventBus - Modüller arası iletişimi sağlayan basit bir olay yöneticisi
 * Publish/Subscribe (Pub/Sub) deseni kullanarak modüller birbirleriyle doğrudan iletişim
 * kurmadan olaylar üzerinden haberleşirler.
 */
export default class EventBus {
    constructor() {
      this.events = {};
    }
  
    /**
     * Belirli bir olay için dinleyici ekler
     * @param {string} event - Olay adı
     * @param {function} callback - Olay gerçekleştiğinde çağrılacak fonksiyon
     * @returns {function} - Abonelikten çıkmak için kullanılabilecek fonksiyon
     */
    subscribe(event, callback) {
      if (!this.events[event]) {
        this.events[event] = [];
      }
      this.events[event].push(callback);
      
      // Abonelikten çıkma fonksiyonu döndür
      return () => {
        this.events[event] = this.events[event].filter(cb => cb !== callback);
      };
    }
  
    /**
     * Belirli bir olayı tetikler ve dinleyicilere veri gönderir
     * @param {string} event - Tetiklenecek olay adı
     * @param {any} data - Dinleyicilere gönderilecek veri
     */
    publish(event, data) {
      if (this.events[event]) {
        this.events[event].forEach(callback => callback(data));
      }
    }
  }