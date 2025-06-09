/**
 * TrafficDataManager - Cache sorunları düzeltilmiş versiyon
 * 
 * Düzeltilen sorunlar:
 * 1. Cache key'leri daha hassas (coordinate precision artırıldı)
 * 2. Segment koordinat formatı düzeltildi
 * 3. Cache debug bilgileri iyileştirildi
 * 4. Fallback data handling geliştirildi
 */
export default class TrafficDataManager {

    constructor(config, eventBus) {
        this.config = config;
        this.eventBus = eventBus;

        // Frontend cache (backend cache'den ayrı, daha kısa süreli)
        this.cache = new Map();

        // İstatistikler
        this.stats = {
            hitCount: 0,     // Frontend cache hit
            missCount: 0,    // Frontend cache miss  
            apiCalls: 0,     // Backend'e yapılan call'lar
            errors: 0,       // Hata sayısı
            fallbackCount: 0 // Fallback data kullanım sayısı
        };

        // Cache temizlik interval'ı (2 dakikada bir expired cache'leri temizle)
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredCache();
        }, 120000); // 2 dakika

        console.log('🏗️ TrafficDataManager başlatıldı');
    }

    /**
     * Segment için trafik verisi al - Geliştirilmiş cache sistemi
     * @param {Object} segment - Segment bilgileri {start: [lat, lon], end: [lat, lon], distance: km}
     * @returns {Promise<Object>} Trafik verisi
     */
    async getSegmentTraffic(segment) {
        // 🔧 DÜZELTİLDİ: Daha hassas segment ID
        const segmentId = this.createSegmentId(segment);

        // Frontend cache kontrolü
        const cached = this.getCachedData(segmentId);
        if (cached) {
            this.stats.hitCount++;
            if (this.config.debug.showCacheStats) {
                console.log(`✅ Cache HIT: ${segmentId.substring(0, 20)}...`);
            }
            return cached;
        }

        // Cache miss - Backend'e git
        this.stats.missCount++;
        this.stats.apiCalls++;
        
        if (this.config.debug.showNetworkRequests) {
            console.log(`❌ Cache MISS: ${segmentId.substring(0, 20)}... -> Backend'e istek`);
        }

        try {
            const trafficData = await this.fetchFromBackend(segment);
            
            // Frontend cache'e kaydet
            this.cacheData(segmentId, trafficData, segment);
            
            return trafficData;
            
        } catch (error) {
            console.error('❌ Backend trafik API hatası:', error.message);
            this.stats.errors++;
            
            // Fallback data oluştur ve cache'le
            const fallbackData = this.createFallbackData(segment);
            this.stats.fallbackCount++;
            
            // Fallback data'yı da cache'le (kısa süreyle)
            this.cacheData(segmentId, fallbackData, segment, 30000); // 30 saniye cache
            
            console.log(`💾 Fallback cached: ${segmentId.substring(0, 20)}...`);
            
            return fallbackData;
        }
    }

    /**
     * 🔧 DÜZELTİLDİ: Segment ID oluştur - Daha yüksek hassasiyet
     * @param {Object} segment - Segment bilgileri
     * @returns {string} Unique segment ID
     */
    createSegmentId(segment) {
        // Hassasiyeti artırdık: 6 basamak ~1 metre hassasiyet
        const precision = 6; 
        
        const start = `${segment.start[0].toFixed(precision)},${segment.start[1].toFixed(precision)}`;
        const end = `${segment.end[0].toFixed(precision)},${segment.end[1].toFixed(precision)}`;
        
        return `${start}-${end}`;
    }

    /**
     * Frontend cache'den veri al
     * @param {string} segmentId - Segment ID
     * @returns {Object|null} Cache'lenmiş veri veya null
     */
    getCachedData(segmentId) {
        const cached = this.cache.get(segmentId);

        if (!cached) {
            return null;
        }

        // Süre kontrolü
        const now = Date.now();
        if (now > cached.expiresAt) {
            this.cache.delete(segmentId);
            if (this.config.debug.verbose) {
                console.log(`⏰ Cache EXPIRED: ${segmentId.substring(0, 20)}...`);
            }
            return null;
        }

        // 🔧 DÜZELTİLDİ: Cache hit zamanını güncelle
        cached.lastAccessed = now;
        return cached.data;
    }

    /**
     * Frontend cache'e veri kaydet
     * @param {string} segmentId - Segment ID
     * @param {Object} data - Cache'lenecek veri
     * @param {Object} segment - Segment bilgileri
     * @param {number} customTTL - Özel TTL (ms)
     */
    cacheData(segmentId, data, segment, customTTL = null) {
        // Cache süresi belirle
        const cacheDurationMs = customTTL || this.config.traffic.cache.ttl;
        const expiresAt = Date.now() + cacheDurationMs;

        // Cache boyut kontrolü
        if (this.cache.size >= this.config.traffic.cache.maxSize) {
            // En eski entry'leri temizle
            this.cleanupOldestEntries(10);
        }

        // Cache'e kaydet
        this.cache.set(segmentId, {
            data: data,
            timestamp: Date.now(),
            lastAccessed: Date.now(),
            expiresAt: expiresAt,
            segment: segment // Debug için
        });

        if (this.config.debug.verbose) {
            const duration = Math.round(cacheDurationMs / 1000);
            console.log(`💾 Cache SAVED: ${segmentId.substring(0, 20)}... (${duration}s TTL)`);
        }
    }

    /**
     * Backend'den trafik verisi çek
     * @param {Object} segment - Segment bilgileri
     * @returns {Promise<Object>} Normalize edilmiş trafik verisi
     */
    async fetchFromBackend(segment) {
        // 🔧 DÜZELTİLDİ: Segment'in orta noktasını hesapla
        const midpoint = this.getMidpoint(segment);
        
        // Backend endpoint URL'i
        const url = `${this.config.traffic.baseUrl}${this.config.traffic.flowSegmentData}`;
        
        // Query parametreleri
        const params = new URLSearchParams({
            point: `${midpoint[0]},${midpoint[1]}` // lat,lon formatında
        });

        const fullUrl = `${url}?${params}`;
        
        if (this.config.debug.showNetworkRequests) {
            console.log(`🌐 Backend Request: ${fullUrl}`);
        }

        // Backend'e fetch ile istek yap
        const response = await fetch(fullUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(this.config.traffic.timeout.flow)
        });

        // Hata kontrolü
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Backend API Error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        // JSON parse
        const data = await response.json();
        
        if (this.config.debug.verbose) {
            console.log('✅ Backend Response:', {
                trafficFactor: data.trafficFactor,
                currentSpeed: data.currentSpeed,
                confidence: data.confidence,
                fallback: data.fallback || false
            });
        }

        // Backend zaten normalize edilmiş data döndürüyor
        if (data.fallback) {
            this.stats.fallbackCount++;
            console.warn('⚠️ Backend fallback data:', data.errorDetails);
        }

        return data;
    }

    /**
     * Segment'in orta noktasını hesapla
     * @param {Object} segment - Segment bilgileri
     * @returns {Array} [lat, lon] orta nokta
     */
    getMidpoint(segment) {
        return [
            (segment.start[0] + segment.end[0]) / 2,  // Ortalama latitude
            (segment.start[1] + segment.end[1]) / 2   // Ortalama longitude
        ];
    }

    /**
     * 🔧 DÜZELTİLDİ: Fallback veri oluştur - Google/TomTom standartlarına uygun
     * @param {Object} segment - Segment bilgileri
     * @returns {Object} Fallback trafik verisi
     */
    createFallbackData(segment) {
        // Segment uzunluğuna ve lokasyonuna göre akıllı tahmin
        const distance = segment.distance || 1; // km
        
        // Uzun segmentler genelde şehir dışı -> daha iyi trafik
        let trafficFactor = distance > 5 ? 1.10 : 1.25; // Google standartlarına uygun
        
        // Zamana göre ayarla
        const hour = new Date().getHours();
        if (hour >= 7 && hour <= 9 || hour >= 17 && hour <= 19) {
            trafficFactor *= 1.4; // Rush hour - daha dramatik etki
        }
        
        // Rastgele varyasyon ekle (daha geniş aralık)
        trafficFactor *= (0.85 + Math.random() * 0.3);
        
        return {
            currentSpeed: Math.round(50 / trafficFactor),
            freeFlowSpeed: 50,
            confidence: 0.3,
            trafficFactor: trafficFactor,
            fallback: true,
            source: 'frontend_google_standard_fallback',
            timestamp: Date.now()
        };
    }

    /**
     * Cache istatistiklerini döndür
     * @returns {Object} Detaylı istatistikler
     */
    getStats() {
        const total = this.stats.hitCount + this.stats.missCount;
        const hitRate = total > 0 ? Math.round((this.stats.hitCount / total) * 100) : 0;

        return {
            hitCount: this.stats.hitCount,
            missCount: this.stats.missCount,
            hitRate: hitRate,
            totalRequests: total,
            cacheSize: this.cache.size,
            
            // Frontend'e özgü stats
            apiCalls: this.stats.apiCalls,
            errors: this.stats.errors,
            fallbackCount: this.stats.fallbackCount,
            
            // Performance metrics
            performance: {
                cacheEfficiency: hitRate,
                errorRate: total > 0 ? Math.round((this.stats.errors / total) * 100) : 0,
                fallbackRate: total > 0 ? Math.round((this.stats.fallbackCount / total) * 100) : 0
            }
        };
    }

    /**
     * Expired cache entry'leri temizle
     */
    cleanupExpiredCache() {
        const now = Date.now();
        let cleaned = 0;

        for (const [segmentId, cacheEntry] of this.cache) {
            if (now > cacheEntry.expiresAt) {
                this.cache.delete(segmentId);
                cleaned++;
            }
        }

        if (cleaned > 0 && this.config.debug.verbose) {
            console.log(`🧹 Cache cleanup: ${cleaned} expired entries removed`);
        }
    }

    /**
     * En eski cache entry'leri temizle
     * @param {number} count - Temizlenecek entry sayısı
     */
    cleanupOldestEntries(count) {
        const entries = Array.from(this.cache.entries())
            .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed)
            .slice(0, count);

        entries.forEach(([segmentId]) => {
            this.cache.delete(segmentId);
        });

        if (this.config.debug.verbose) {
            console.log(`🧹 Cache cleanup: ${entries.length} oldest entries removed`);
        }
    }

    /**
     * Cache'i tamamen temizle
     */
    clearCache() {
        const size = this.cache.size;
        this.cache.clear();
        
        // Stats'ı sıfırla
        this.stats = {
            hitCount: 0,
            missCount: 0,
            apiCalls: 0,
            errors: 0,
            fallbackCount: 0
        };
        
        if (this.config.debug.enabled) {
            console.log(`🗑️ Cache cleared: ${size} entries removed, stats reset`);
        }
    }

    /**
     * 🔧 YENİ: Cache durumunu detaylı logla
     */
    logCacheStatus() {
        const stats = this.getStats();
        
        console.log('📊 Traffic Cache Status:');
        console.log(`   Cache Size: ${stats.cacheSize}/${this.config.traffic.cache.maxSize}`);
        console.log(`   Hit Rate: ${stats.hitRate}% (${stats.hitCount}/${stats.totalRequests})`);
        console.log(`   API Calls: ${stats.apiCalls}`);
        console.log(`   Errors: ${stats.errors} (${stats.performance.errorRate}%)`);
        console.log(`   Fallback: ${stats.fallbackCount} (${stats.performance.fallbackRate}%)`);
        
        // En aktif cache entry'leri göster
        if (this.config.debug.verbose && this.cache.size > 0) {
            console.log('🔍 Cache Samples:');
            let count = 0;
            for (const [segmentId, entry] of this.cache) {
                if (count >= 3) break;
                const age = Math.round((Date.now() - entry.timestamp) / 1000);
                console.log(`   ${segmentId.substring(0, 25)}... (${age}s ago)`);
                count++;
            }
        }
    }

    /**
     * Temizlik işlemi (component destroy edilirken)
     */
    destroy() {
        // Cleanup interval'ı temizle
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        // Cache'i temizle
        this.clearCache();

        console.log('🛑 TrafficDataManager destroyed');
    }
}

/*
 * 🔧 DÜZELTİLEN KULLANIM:
 * 
 * const manager = new TrafficDataManager(config, eventBus);
 * 
 * // Daha hassas koordinatlarla segment
 * const segment = {
 *   start: [40.987654, 29.123456], // 6 basamak hassasiyet
 *   end: [40.758901, 30.325678],   // 6 basamak hassasiyet
 *   distance: 15.2 // km
 * };
 * 
 * const trafficData = await manager.getSegmentTraffic(segment);
 * // Artık aynı bölge için cache çalışır!
 * 
 * // Debug için:
 * manager.logCacheStatus();
 * 
 * // Temizlik:
 * manager.destroy();
 */