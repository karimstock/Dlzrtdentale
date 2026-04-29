/**
 * JADOMI — Service Worker Push Notifications
 * Reçoit les notifications push et les affiche au patient.
 * Servi depuis la racine (/) pour avoir le scope maximal.
 */

self.addEventListener('push', function(event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' };
  }

  var title = data.title || 'JADOMI';
  var options = {
    body: data.body || '',
    icon: '/assets/icon-192.png',
    badge: '/assets/badge-72.png',
    tag: data.tag || 'jadomi-rappel',
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200],
    actions: data.actions || []
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';
  event.waitUntil(clients.openWindow(url));
});
