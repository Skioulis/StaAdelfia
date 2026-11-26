import { getPublicMenu } from '../db/menu.js';
import { publicMenuOut } from '../lib/schemas.js';

export default async function menuRoutes(app) {
  app.get('/api/menu', { schema: { response: { 200: publicMenuOut } } }, async (request, reply) => {
    reply.header('Cache-Control', 'public, max-age=60');
    return getPublicMenu(app.db);
  });
}
