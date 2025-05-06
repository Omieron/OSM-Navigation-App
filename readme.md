# OSM Turkey Overpass Navigasyon Sistemi

Yerel verilerle çalışan, OpenStreetMap tabanlı, modüler bir navigasyon sistemi. Bu sistem, arabalar, yayalar ve bisikletler için ayrı rota hesaplamaları yapabilen bir altyapı sunmaktadır.

## Proje Yapısı

```
osm_turkey_overpass
├── .git
├── css
│   └── style.css
├── html
│   └── index.html
└── js
    └── app.js
```

## Proje Bileşenleri

### Backend

1. **PostgreSQL + PostGIS + pgRouting**
   * `kartoza/postgis:15-3.4` Docker imajı
   * pgRouting eklentisi otomatik yükleme
   * OSM verileri için `osm2pgsql` konteyneri
   * Çoklu eklenti konfigürasyonu: `postgis,hstore,pgrouting`

2. **Yol Ağları (Road Networks)**
   * Üç farklı yol ağı: Araba, Yaya, Bisiklet
   * Her ağ için ayrı topoloji ve maliyet hesaplamaları
   * Hız, mesafe ve zaman bazlı rota optimizasyonu

3. **Rota Hesaplama API'si**
   * Node.js backend
   * `/route` endpoint'i (iki nokta arası rota)
   * `/search` endpoint'i (yer araması)
   * PostgreSQL veritabanı entegrasyonu

### Frontend

1. **Modüler Yapı**
   * Tek Sorumluluk Prensibi (Single Responsibility Principle)
   * EventBus ile modüller arası iletişim
   * HTML, CSS ve JS'nin ayrı dosyalarda tutulması

2. **Planlanan Modüller**
   * Harita Yönetim Modülü
   * Yol Çizim Modülü
   * Rota Analiz Modülü
   * Arama Kutusu Modülü
   * Rota Bilgisi Modülü

## Yol Ağları (Road Networks)

### 1. Araba Yol Ağı (car_network)

Arabaların kullanabileceği yolları içerir. Otoyollar, ana yollar ve şehir içi yollar dahildir.

```sql
CREATE TABLE car_network AS
SELECT 
    osm_id, 
    way AS geom, 
    highway, 
    name,
    oneway,
    maxspeed,
    ST_Length(way::geography) AS length_meters
FROM planet_osm_line
WHERE 
    highway IN ('motorway', 'trunk', 'primary', 'secondary', 'tertiary', 
               'unclassified', 'residential', 'motorway_link', 'trunk_link', 
               'primary_link', 'secondary_link', 'tertiary_link', 'service')
    AND (access IS NULL OR access NOT IN ('no', 'private'))
    AND (vehicle IS NULL OR vehicle != 'no')
    AND (motor_vehicle IS NULL OR motor_vehicle != 'no');

-- Hız değerlerini ata
ALTER TABLE car_network ADD COLUMN speed_kmh INTEGER;

UPDATE car_network SET speed_kmh = 
    CASE 
        WHEN maxspeed ~ E'^\\d+$' THEN maxspeed::integer
        WHEN highway = 'motorway' THEN 110
        WHEN highway = 'trunk' THEN 90
        WHEN highway = 'primary' THEN 70
        WHEN highway = 'secondary' THEN 50
        WHEN highway = 'tertiary' THEN 40
        WHEN highway = 'residential' THEN 30
        WHEN highway = 'service' THEN 20
        ELSE 30
    END;

-- pgRouting topolojisi oluştur
SELECT pgr_createTopology('car_network', 0.00001, 'geom', 'osm_id');
```

### 2. Yaya Yol Ağı (pedestrian_network)

Yayaların kullanabileceği yolları içerir. Kaldırımlar, patikalar, merdivenler ve yaya geçişine açık diğer yollar dahildir.

```sql
CREATE TABLE pedestrian_network AS
SELECT 
    osm_id, 
    way AS geom, 
    highway, 
    name,
    ST_Length(way::geography) AS length_meters
FROM planet_osm_line
WHERE 
    highway IN ('footway', 'path', 'steps', 'pedestrian', 'living_street',
               'residential', 'unclassified', 'service', 'track',
               'tertiary', 'secondary', 'primary')
    AND (access IS NULL OR access NOT IN ('no', 'private'))
    AND (foot IS NULL OR foot != 'no');

-- Hız değerlerini ata (yaya hızı, km/saat)
ALTER TABLE pedestrian_network ADD COLUMN speed_kmh FLOAT;

UPDATE pedestrian_network SET speed_kmh = 
    CASE 
        WHEN highway = 'steps' THEN 2.5  -- Merdivenler yavaş
        WHEN highway = 'footway' THEN 4.5
        WHEN highway = 'path' THEN 4.0
        WHEN highway = 'pedestrian' THEN 4.5
        ELSE 3.5
    END;
```

### 3. Bisiklet Yol Ağı (bicycle_network)

Bisikletlerin kullanabileceği yolları içerir. Bisiklet yolları, patikalar ve bisiklet geçişine izin verilen diğer yollar dahildir.

```sql
CREATE TABLE bicycle_network AS
SELECT 
    osm_id, 
    way AS geom, 
    highway, 
    name,
    oneway,
    cycleway,
    bicycle,
    ST_Length(way::geography) AS length_meters
FROM planet_osm_line
WHERE 
    (
        highway IN ('cycleway', 'path', 'track', 'service', 'residential', 
                   'unclassified', 'tertiary', 'secondary', 'primary')
        AND highway NOT IN ('motorway', 'motorway_link', 'trunk', 'trunk_link')
    )
    OR cycleway IS NOT NULL
    OR bicycle = 'yes'
    AND (access IS NULL OR access NOT IN ('no', 'private'))
    AND (bicycle IS NULL OR bicycle != 'no');

-- Hız değerlerini ata (bisiklet hızı, km/saat)
ALTER TABLE bicycle_network ADD COLUMN speed_kmh FLOAT;

UPDATE bicycle_network SET speed_kmh = 
    CASE 
        WHEN highway = 'cycleway' OR cycleway IS NOT NULL THEN 16.0
        WHEN highway = 'path' THEN 12.0
        WHEN highway = 'track' THEN 10.0
        ELSE 14.0
    END;
```

## Maliyet Hesaplamaları

Her yol ağı için benzer maliyet hesaplamaları yapılır:

```sql
-- Maliyet sütunları ekle
ALTER TABLE [ağ_ismi] ADD COLUMN cost FLOAT;
ALTER TABLE [ağ_ismi] ADD COLUMN reverse_cost FLOAT;

-- Zaman bazlı maliyet hesaplama (dakika cinsinden)
UPDATE [ağ_ismi] 
SET cost = (length_meters / 1000.0) / (speed_kmh / 60.0),
    reverse_cost = (length_meters / 1000.0) / (speed_kmh / 60.0);

-- Tek yönlü yollar için (yalnızca araba ve bisiklet ağlarında)
UPDATE [ağ_ismi] 
SET reverse_cost = -1 
WHERE oneway = 'yes';
```

## OpenStreetMap Yol Tipleri

OpenStreetMap'te bulunan başlıca yol tipleri:

### Araç Yolları
- **motorway**: Otoyollar
- **trunk**: Ana karayolları
- **primary**: Birincil yollar
- **secondary**: İkincil yollar
- **tertiary**: Üçüncül yollar
- **unclassified**: Sınıflandırılmamış yerel yollar
- **residential**: Yerleşim bölgesi yolları
- **service**: Servis yolları

### Yaya Yolları
- **footway**: Yaya patikası
- **pedestrian**: Yaya bölgeleri
- **steps**: Merdivenler
- **path**: Çok amaçlı patikalar

### Bisiklet Yolları
- **cycleway**: Bisiklet yolu
- **path**: Çok amaçlı patikalar (bisikletlere açık)

## Kurulum

(Bu bölüm geliştirilecek)

## Geliştirme

(Bu bölüm geliştirilecek)

## Lisans

(Bu bölüm geliştirilecek)