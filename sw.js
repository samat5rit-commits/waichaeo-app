// ============================================================
//  Waichaeo — Service Worker
//  จัดการ cache ให้แอปทำงาน offline ได้
// ============================================================

const CACHE_NAME   = 'waichaeo-v1.3';
const STATIC_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/waichaeo_logo.jpg',
];

// ── INSTALL: cache ไฟล์ทั้งหมดตอนติดตั้งครั้งแรก
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching static files');
        return cache.addAll(STATIC_FILES);
      })
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: ลบ cache เก่าออก
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: Network first → Cache fallback
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // ไม่ cache request จาก API ภายนอก (map tiles, nominatim, osrm)
  const externalAPIs = [
    'tile.openstreetmap.org',
    'nominatim.openstreetmap.org',
    'router.project-osrm.org',
    'supabase.co',
  ];
  if (externalAPIs.some(api => url.hostname.includes(api))) {
    event.respondWith(fetch(event.request));
    return;
  }

  // หน้าเว็บ (HTML): ดึงจากเครือข่ายก่อนเสมอ เพื่อให้ได้เวอร์ชันล่าสุดหลัง Deploy; ใช้แคชเมื่อออฟไลน์เท่านั้น
  if (event.request.method === 'GET' && (event.request.mode === 'navigate' || url.pathname === '/index.html')) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
        }
        return response;
      }).catch(() => caches.match(event.request).then(m => m || caches.match('/index.html')))
    );
    return;
  }

  // Cache first สำหรับ static assets
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;

        return fetch(event.request)
          .then(response => {
            // cache response ใหม่
            if (response && response.status === 200) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
            }
            return response;
          })
          .catch(() => {
            // Offline fallback
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
          });
      })
    );
  }
});

// ── PUSH NOTIFICATIONS (พร้อมใช้ในอนาคต)
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  self.registration.showNotification(data.title || 'Waichaeo', {
    body: data.body || 'มีกิจกรรมใหม่สำหรับคุณ!',
    icon: '/icon-192.png',
    badge: '/icon-96.png',
    data: { url: data.url || '/' }
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
