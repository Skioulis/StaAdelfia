import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyMultipart from '@fastify/multipart';
import fastifyHelmet from '@fastify/helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import menuRoutes from './routes/menu.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import { errorHandler } from './lib/error-handler.js';
import { MAX_IMAGE_BYTES, uploadsDir } from './lib/images.js';
import { deleteExpiredSessions } from './db/sessions.js';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
export const SESSION_CLEANUP_MS = 60 * 60 * 1000; // hourly

/**
 * Content Security Policy. Scripts only from our own files (no inline scripts).
 * Stylesheets from us and Google Fonts; inline style *attributes* are allowed because
 * the prototype's markup uses a few (style-src-attr), but inline <style> blocks are not.
 */
export function cspDirectives(config) {
  return {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrcElem: ["'self'", 'https://fonts.googleapis.com'],
    styleSrcAttr: ["'unsafe-inline'"],
    styleSrc: ["'self'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    imgSrc: ["'self'", 'data:', 'blob:'],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    // Only behind HTTPS. In development the site runs on plain http (often opened by LAN IP on a phone).
    upgradeInsecureRequests: config.production ? [] : null,
  };
}

// buildApp(config, { db }) → Fastify instance (used by server.js and the tests)
export function buildApp(config, { db, logger = config.nodeEnv !== 'test' } = {}) {
  const app = Fastify({
    logger,
    trustProxy: config.trustProxy,
    // Report every invalid field at once, so the admin form can mark them all.
    ajv: { customOptions: { allErrors: true } },
  });

  app.setErrorHandler(errorHandler);
  // CSRF: a cross-site HTML form can send text/plain without a CORS preflight.
  // Only JSON (and multipart, for uploads) is accepted for request bodies.
  app.removeContentTypeParser('text/plain');

  app.decorate('config', config);
  app.decorate('db', db);

  // Security headers on every response, registered first so they cover every route.
  app.register(fastifyHelmet, {
    global: true,
    contentSecurityPolicy: { useDefaults: false, directives: cspDirectives(config) },
    // HSTS only matters over HTTPS; browsers ignore it on plain http, so dev is unaffected.
    strictTransportSecurity: { maxAge: 365 * 24 * 3600, includeSubDomains: false },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });

  app.register(async (instance) => {
    instance.get('/healthz', async (request, reply) => {
      db.prepare('SELECT 1').get();
      reply.header('Cache-Control', 'no-store');
      return { ok: true };
    });
  });

  // Delete expired admin sessions once an hour (server.js also does it at startup).
  let cleanupTimer;
  app.addHook('onReady', async () => {
    cleanupTimer = setInterval(() => {
      try {
        const n = deleteExpiredSessions(db);
        if (n) app.log.info({ removed: n }, 'Deleted expired sessions');
      } catch (err) {
        app.log.error(err, 'Session cleanup failed');
      }
    }, SESSION_CLEANUP_MS);
    cleanupTimer.unref();
  });
  app.addHook('onClose', async () => clearInterval(cleanupTimer));

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({ error: 'Not found' });
  });

  app.register(fastifyCookie);
  // Only routes that opt in (login) are rate limited.
  app.register(fastifyRateLimit, { global: false });

  // One file per request, at most 5 MB. Only the upload route accepts multipart (see routes/admin.js).
  app.register(fastifyMultipart, {
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0, parts: 2 },
  });

  app.register(menuRoutes);
  app.register(authRoutes);
  app.register(adminRoutes, { prefix: '/api/admin' });

  // Menu page, admin page, CSS/JS/images. Short cache with revalidation (ETag),
  // since file names are not content-hashed.
  app.register(fastifyStatic, {
    root: publicDir,
    cacheControl: true,
    maxAge: config.production ? '1h' : 0,
    redirect: true, // /admin → /admin/
  });

  // Uploaded item images. A new upload always gets a new file name, so they can be cached for a year.
  app.register(fastifyStatic, {
    root: uploadsDir(config.dataDir),
    prefix: '/uploads/',
    decorateReply: false,
    index: false,
    cacheControl: false,
    setHeaders(reply) { // @fastify/static 11 passes the Fastify reply
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      reply.header('X-Content-Type-Options', 'nosniff');
    },
  });

  return app;
}
