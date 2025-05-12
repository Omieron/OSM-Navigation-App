# Docker Üzerine OSRM Kurmak 

Bu navigasyon aplikasyonunun çalışması için OSRM kullanılmıştır. OSRM'yi kendi ortamınızda Docker üzerinden kurmak için aşağıdaki adımları izleyin.

## OSRM Docker İmajını Çekme

``` powershell 
docker pull osrm/osrm-backend
``` 

## OSRM için Harita Verilerini İndirme ve Dizin Hazırlama

``` powershell
Dizin oluşturma
mkdir -p ~/osrm-data
cd ~/osrm-data

Invoke-WebRequest ile Türkiye haritasını indirme
Invoke-WebRequest -Uri "http://download.geofabrik.de/europe/turkey-latest.osm.pbf" -OutFile "turkey-latest.osm.pbf"
``` 

## OSRM Veri İşleme

``` powershell
# Tam yol kullanmak daha güvenlidir
$currentPath = (Get-Location).Path

# Harita verilerini işleme
docker run -t -v "${currentPath}:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/turkey-latest.osm.pbf

# Yol ağını oluşturma
docker run -t -v "${currentPath}:/data" osrm/osrm-backend osrm-partition /data/turkey-latest.osm.pbf

# Yol ağını optimize etme
docker run -t -v "${currentPath}:/data" osrm/osrm-backend osrm-customize /data/turkey-latest.osm.pbf
``` 

## OSRM Sunucusunu Başlatma 

``` powershell
docker run -t -i -p 5000:5000 -v "${currentPath}:/data" osrm/osrm-backend osrm-routed --algorithm mld /data/turkey-latest.osm.pbf
```