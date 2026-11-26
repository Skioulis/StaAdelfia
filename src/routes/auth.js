import { COOKIE_NAME, cookieOptions, checkCredentials } from '../lib/auth.js';
import { createSession, deleteSession, touchSession } from '../db/sessions.js';

const loginBody = {
  type: 'object',
  required: ['username', 'password'],
  additionalProperties: false,
  properties: {
    username: { type: 'string', minLength: 1, maxLength: 200 },
    password: { type: 'string', minLength: 1, maxLength: 1000 },
  },
};

export default async function authRoutes(app) {
  // Login state must never be cached by the browser or a proxy.
  app.addHook('onSend', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });

  app.post('/api/auth/login', {
    schema: { body: loginBody },
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { username, password } = request.body;
    if (!(await checkCredentials(app.config, username, password))) {
      request.log.warn({ ip: request.ip }, 'Failed admin login');
      return reply.code(401).send({ error: 'Invalid username or password' });
    }
    // Drop any session the browser already had, then start a fresh one.
    deleteSession(app.db, request.cookies[COOKIE_NAME]);
    const id = createSession(app.db);
    reply.setCookie(COOKIE_NAME, id, cookieOptions(app.config));
    return reply.code(204).send();
  });

  app.post('/api/auth/logout', async (request, reply) => {
    deleteSession(app.db, request.cookies[COOKIE_NAME]);
    const { maxAge, ...opts } = cookieOptions(app.config);
    reply.clearCookie(COOKIE_NAME, opts);
    return reply.code(204).send();
  });

  app.get('/api/auth/me', {
    schema: {
      response: { 200: { type: 'object', properties: { username: { type: 'string' } } } },
    },
  }, async (request, reply) => {
    const id = request.cookies[COOKIE_NAME];
    if (!touchSession(app.db, id)) return reply.code(401).send({ error: 'Unauthorized' });
    reply.setCookie(COOKIE_NAME, id, cookieOptions(app.config));
    return { username: app.config.adminUsername };
  });
}
