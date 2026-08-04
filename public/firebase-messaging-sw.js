// Service worker de Firebase Cloud Messaging: maneja notificaciones push cuando la app está en background/cerrada.
// No puede usar el config de src/app/config/firebase.config.ts (ese pasa por el build de Angular); se duplica aquí a propósito.
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyA5YWDgiNsQYw1r9o9SIY_2msR-F1rqU-w',
  authDomain: 'nimbus-7ab3a.firebaseapp.com',
  projectId: 'nimbus-7ab3a',
  storageBucket: 'nimbus-7ab3a.firebasestorage.app',
  messagingSenderId: '383283821673',
  appId: '1:383283821673:web:f8dc2280f9106bcf6c76f8'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? 'Nimbus';
  const options = {
    body: payload.notification?.body ?? '',
    icon: 'icons/icon-192x192.png'
  };
  self.registration.showNotification(title, options);
});
