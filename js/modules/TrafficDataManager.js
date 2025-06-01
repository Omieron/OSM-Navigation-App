/**
 * TrafficDataManager - Trafik verisi cache yönetimi
 * 
 * Bu sınıf neden gerekli?
 * - TomTom API'den trafik verisi almak pahalı ($0.01/segment)
 * - Aynı yol parçaları farklı rotalarda tekrar kullanılıyor
 * - Cache ile aynı veriyi tekrar tekrar almayı engelleyeceğiz
 */
export default class TrafficDataManager {

    constructor(config, eventBus) {
        this.config = config;        // config.js'den ayarlar (API key vs)
        this.eventBus = eventBus;    // Diğer modüllerle iletişim için

        // Cache = bellekte veri saklama alanı
        // Map kullanıyoruz çünkü key-value çiftleri tutuyor ve hızlı
        this.cache = new Map();

        // İstatistikler - ne kadar tasarruf ettiğimizi görmek için
        this.stats = {
            hitCount: 0,    // Cache'den kaç kez veri aldık
            missCount: 0,   // Cache'de olmayıp API'den kaç kez aldık
            apiCalls: 0     // Toplam API çağrısı sayısı
        };
    }

    /**
     * Ana method - Segment için trafik verisi al
     * 
     * Bu method'un mantığı:
     * 1. Önce cache'e bak - varsa oradan al (hızlı + ücretsiz)
     * 2. Cache'de yoksa API'ye git (yavaş + ücretli)
     * 3. API'den aldığın veriyi cache'e kaydet (gelecek için)
     */
    async getSegmentTraffic(segment) {
        const segmentId = this.createSegmentId(segment);

        // Cache kontrolü
        const cached = this.getCachedData(segmentId);
        if (cached) {
            this.stats.hitCount++;
            console.log(`✅ Cache HIT: ${segmentId}`);
            return cached;
        }

        // Cache miss - API çağrısı
        this.stats.missCount++;
        this.stats.apiCalls++;
        console.log(`❌ Cache MISS: ${segmentId} - API çağrısı yapılıyor...`);

        try {
            const trafficData = await this.fetchFromTomTom(segment);
            this.cacheData(segmentId, trafficData, segment); // ✅ Success case cache
            return trafficData;
        } catch (error) {
            console.error('TomTom API hatası:', error);
            const fallbackData = this.createFallbackData(segment);

            // 🚀 ÖNEMLİ: Fallback data'yı da cache'le!
            this.cacheData(segmentId, fallbackData, segment);
            console.log(`💾 Fallback data cache'lendi: ${segmentId}`);

            return fallbackData;
        }
    }

    /**
     * Segment ID oluştur
     * 
     * Neden gerekli?
     * - Her segment için benzersiz bir anahtar lazım
     * - Aynı segment farklı rotalarda tekrar kullanılabilsin
     * 
     * Örnek: "40.9876,29.1234-40.7589,30.3256"
     */
    createSegmentId(segment) {
        // Precision = hassasiyet. 4 ondalık = ~11 metre hassasiyet
        // Çok hassas olursa her segment farklı görünür (cache faydası olmaz)
        // Çok kaba olursa farklı yollar aynı görünür (hatalı cache)
        const precision = 4;

        // Koordinatları belirli hassasiyette string'e çevir
        const start = `${segment.start[0].toFixed(precision)},${segment.start[1].toFixed(precision)}`;
        const end = `${segment.end[0].toFixed(precision)},${segment.end[1].toFixed(precision)}`;

        // "başlangıç-bitiş" formatında ID oluştur
        return `${start}-${end}`;
    }

    /**
     * Cache'den veri al
     * 
     * Cache mantığı:
     * - Veri varsa ve süresi dolmamışsa döndür
     * - Veri yoksa veya süresi dolmuşsa null döndür
     */
    getCachedData(segmentId) {
        const cached = this.cache.get(segmentId);

        // Cache'de hiç yok
        if (!cached) {
            return null;
        }

        // Cache'de var ama süresi dolmuş mu kontrol et
        const now = Date.now(); // Şu anki zaman (milisaniye)
        if (now > cached.expiresAt) {
            // Süresi dolmuş, cache'den sil
            this.cache.delete(segmentId);
            console.log(`⏰ Cache EXPIRED: ${segmentId}`);
            return null;
        }

        // Cache'de var ve geçerli
        return cached.data;
    }

    /**
     * Cache'e veri kaydet
     * 
     * Her veriyi ne kadar süre saklayacağımıza karar veriyoruz:
     * - Şehir içi: 5 dakika (trafik çok değişken)
     * - Otoyol: 15 dakika (trafik daha stabil)
     */
    cacheData(segmentId, data, segment) {
        // Bu segment için cache süresi ne olsun?
        const cacheDurationMinutes = this.getCacheDuration(segment);

        // Şu andan itibaren cacheDurationMinutes dakika sonra süresi dolsun
        const expiresAt = Date.now() + (cacheDurationMinutes * 60 * 1000);

        // Cache'e kaydet
        this.cache.set(segmentId, {
            data: data,                    // Asıl trafik verisi
            timestamp: Date.now(),         // Ne zaman kaydedildi
            expiresAt: expiresAt          // Ne zaman süresi dolacak
        });

        console.log(`💾 Cache SAVED: ${segmentId} (${cacheDurationMinutes} dakika geçerli)`);
    }

    /**
     * TomTom API çağrısı
     * 
     * Bu en pahalı operasyon! Mümkün olduğunca az çağırmak istiyoruz.
     */
    async fetchFromTomTom(segment) {
        // Segment'in orta noktasını al
        const midpoint = this.getMidpoint(segment);

        const url = `${this.config.traffic.baseUrl}${this.config.traffic.flowSegmentData}`;
        const params = new URLSearchParams({
            point: `${midpoint[0]},${midpoint[1]}`, // "lat,lon" formatında nokta
            format: 'json'
        });

        console.log(`🌐 Backend Traffic API çağrısı: ${url}?${params}`);

        // Fetch ile backend'e istek yap
        const response = await fetch(`${url}?${params}`, {
            method: 'GET',
            timeout: 10000,
            headers: {
                'Accept': 'application/json'
            }
        });

        // Hata kontrolü
        if (!response.ok) {
            throw new Error(`Backend Traffic API Error: ${response.status} ${response.statusText}`);
        }

        // JSON parse et
        const data = await response.json();
        console.log('Backend Traffic API yanıtı:', data);

        // Backend zaten normalize edilmiş veri döndürüyor
        return data;
    }

    /**
     * Segment'in orta noktasını hesapla
     * 
     * TomTom API tek bir koordinat istiyor, biz segment (çizgi) veriyoruz.
     * Çözüm: Segment'in ortasını hesapla.
     */
    getMidpoint(segment) {
        return [
            (segment.start[0] + segment.end[0]) / 2,  // Ortalama latitude
            (segment.start[1] + segment.end[1]) / 2   // Ortalama longitude
        ];
    }

    /**
     * Cache süresi belirle
     * 
     * Gelecekte burayı geliştirebiliriz:
     * - Şehir içi vs şehir dışı
     * - Trafik yoğunluğuna göre
     * - Saat dilimine göre
     */
    getCacheDuration(segment) {
        // Şimdilik hepsi için 5 dakika
        // TODO: Segment tipine göre farklı süreler
        return 5; // dakika
    }

    /**
     * Fallback veri (API hatası durumunda)
     * 
     * API çalışmazsa tamamen dursun istemiyoruz.
     * Varsayılan değerlerle devam et.
     */
    createFallbackData(segment) {
        return {
            currentSpeed: 45,        // Varsayılan: biraz yavaş
            freeFlowSpeed: 50,       // Varsayılan: normal şehir hızı
            confidence: 0.3,         // Düşük güven (tahmin ettiğimizi belirt)
            trafficFactor: 1.1       // Hafif trafik var gibi davran
        };
    }

    /**
     * İstatistikleri döndür
     * 
     * Cache ne kadar etkili çalışıyor görelim:
     * - Hit rate: %80 üzeri = çok iyi
     * - API calls: Az olması iyi
     */
    getStats() {
        const total = this.stats.hitCount + this.stats.missCount;
        const hitRate = total > 0 ? Math.round((this.stats.hitCount / total) * 100) : 0;

        return {
            ...this.stats,
            hitRate: hitRate,
            totalRequests: total,
            cacheSize: this.cache.size  // Kaç farklı segment cache'de
        };
    }

    /**
     * Cache temizleme (memory yönetimi)
     * 
     * Cache çok büyürse hafızayı doldurur.
     * Eski verileri temizlemek gerekebilir.
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

        if (cleaned > 0) {
            console.log(`🧹 Cache cleanup: ${cleaned} expired entries removed`);
        }
    }
}

/*
 * Bu sınıfın kullanımı:
 * 
 * const manager = new TrafficDataManager(config, eventBus);
 * 
 * const segment = {
 *   start: [40.9876, 29.1234],
 *   end: [40.7589, 30.3256],
 *   distance: 15.2
 * };
 * 
 * const trafficData = await manager.getSegmentTraffic(segment);
 * // İlk çağrı: API'ye gider
 * // Sonraki çağrılar (5 dk içinde): Cache'den alır
 */