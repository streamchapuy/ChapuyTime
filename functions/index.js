const { setGlobalOptions } = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();
setGlobalOptions({ maxInstances: 10 });

const db = admin.firestore();
const OPENMETEO_FORECAST_API_URL = "https://api.open-meteo.com/v1/forecast";
const MAX_LOCATIONS_PER_DEVICE = 6;
// Codigos de Open-Meteo que consideramos clima severo (lluvia/nieve intensa, tormenta).
const SEVERE_WEATHER_CODES = new Set([65, 67, 75, 82, 86, 95, 96, 99]);
const NOTIFY_COOLDOWN_MS = 6 * 60 * 60 * 1000;

// Guarda/actualiza el token FCM y las ubicaciones favoritas de un dispositivo.
exports.registerDevice = onCall(async (request) => {
  const { token, locations } = request.data ?? {};

  if (!token || typeof token !== "string") {
    throw new HttpsError("invalid-argument", "Falta el token FCM.");
  }
  if (!Array.isArray(locations)) {
    throw new HttpsError("invalid-argument", "Las ubicaciones deben ser un array.");
  }

  const sanitizedLocations = locations
    .filter((loc) => loc && typeof loc.latitude === "number" && typeof loc.longitude === "number")
    .slice(0, MAX_LOCATIONS_PER_DEVICE)
    .map((loc) => ({
      label: typeof loc.label === "string" ? loc.label.slice(0, 80) : "",
      latitude: loc.latitude,
      longitude: loc.longitude
    }));

  await db.collection("devices").doc(token).set(
    {
      token,
      locations: sanitizedLocations,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return { ok: true };
});

// Corre cada 3 horas: revisa clima severo en las ubicaciones guardadas de cada dispositivo y envia push.
exports.checkSevereWeather = onSchedule("every 3 hours", async () => {
  const devicesSnap = await db.collection("devices").get();
  const now = Date.now();
  const alerts = [];

  for (const doc of devicesSnap.docs) {
    const device = doc.data();
    const token = device.token;
    const locations = Array.isArray(device.locations) ? device.locations : [];
    const lastNotifiedAt = device.lastNotifiedAt?.toMillis?.() ?? 0;

    if (!token || locations.length === 0 || now - lastNotifiedAt < NOTIFY_COOLDOWN_MS) {
      continue;
    }

    for (const location of locations) {
      try {
        const url =
          `${OPENMETEO_FORECAST_API_URL}?latitude=${location.latitude}&longitude=${location.longitude}` +
          `&current=weather_code`;
        const response = await fetch(url);
        const data = await response.json();
        const code = data?.current?.weather_code;

        if (SEVERE_WEATHER_CODES.has(code)) {
          alerts.push({
            token,
            docRef: doc.ref,
            notification: {
              title: "Alerta de clima severo",
              body: `Se espera clima severo en ${location.label || "tu ubicacion"}.`
            }
          });
          break; // un solo push por dispositivo por ciclo, aunque tenga varias ubicaciones en alerta
        }
      } catch (error) {
        logger.error(`Error consultando clima para device ${doc.id}`, error);
      }
    }
  }

  if (alerts.length === 0) {
    logger.info("Sin alertas de clima severo en este ciclo.");
    return;
  }

  const results = await Promise.allSettled(
    alerts.map((alert) =>
      admin.messaging().send({
        token: alert.token,
        notification: alert.notification
      })
    )
  );

  await Promise.all(
    alerts.map((alert, index) => {
      if (results[index].status === "fulfilled") {
        return alert.docRef.set(
          { lastNotifiedAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );
      }
      logger.error(`Error enviando push a device ${alert.docRef.id}`, results[index].reason);
      return Promise.resolve();
    })
  );

  logger.info(`Se enviaron ${results.filter((r) => r.status === "fulfilled").length} notificaciones.`);
});
