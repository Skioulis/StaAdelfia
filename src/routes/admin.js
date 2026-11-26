import { requireAdmin } from '../lib/auth.js';
import { NotFoundError } from '../lib/errors.js';
import { deleteImage, saveImage } from '../lib/images.js';
import { imageUrl } from '../db/menu.js';
import { FieldError } from '../lib/errors.js';
import * as q from '../db/admin.js';
import {
  adminMenuOut, adminItemOut, groupOut, settingsOut,
  groupIn, groupReplaceIn, itemIn, itemReplaceIn, idsIn, settingsIn, idParam,
} from '../lib/schemas.js';

const groupIdParam = {
  type: 'object',
  required: ['groupId'],
  properties: { groupId: { type: 'integer', minimum: 1 } },
};

const orNotFound = (value, what) => {
  if (value === null || value === undefined) throw new NotFoundError(`${what} not found`);
  return value;
};

// Registered with prefix /api/admin. The hooks below run for every route in this plugin.
export default async function adminRoutes(app) {
  const { db } = app;
  const removeImages = (files, log) =>
    Promise.all(files.filter(Boolean).map((f) => deleteImage(app.config.dataDir, f, log)));

  app.addHook('onRequest', requireAdmin(app));

  // CSRF: multipart is only accepted by the upload route. Everything else takes JSON only.
  app.addHook('preValidation', async (request, reply) => {
    if (request.isMultipart() && !request.routeOptions.config?.multipart) {
      return reply.code(415).send({ error: 'Unsupported Media Type' });
    }
  });

  // Admin responses must never be cached by the browser or the proxy.
  app.addHook('onSend', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });

  app.get('/menu', { schema: { response: { 200: adminMenuOut } } }, async () => q.getAdminMenu(db));

  /* ---------- groups ---------- */

  app.post('/groups', { schema: { body: groupIn, response: { 201: groupOut } } }, async (request, reply) => {
    return reply.code(201).send(q.createGroup(db, request.body));
  });

  // Static path: matched before /groups/:id.
  app.put('/groups/order', { schema: { body: idsIn } }, async (request, reply) => {
    q.reorderGroups(db, request.body.ids);
    return reply.code(204).send();
  });

  app.put('/groups/:id', {
    schema: { params: idParam, body: groupReplaceIn, response: { 200: groupOut } },
  }, async (request) => orNotFound(q.updateGroup(db, request.params.id, request.body), 'Group'));

  app.delete('/groups/:id', { schema: { params: idParam } }, async (request, reply) => {
    const files = orNotFound(q.deleteGroup(db, request.params.id), 'Group');
    await removeImages(files, request.log); // after the database change succeeded
    return reply.code(204).send();
  });

  app.put('/groups/:groupId/items/order', { schema: { params: groupIdParam, body: idsIn } }, async (request, reply) => {
    orNotFound(q.reorderItems(db, request.params.groupId, request.body.ids) || null, 'Group');
    return reply.code(204).send();
  });

  /* ---------- items ---------- */

  app.post('/items', { schema: { body: itemIn, response: { 201: adminItemOut } } }, async (request, reply) => {
    return reply.code(201).send(q.createItem(db, request.body));
  });

  app.put('/items/:id', {
    schema: { params: idParam, body: itemReplaceIn, response: { 200: adminItemOut } },
  }, async (request) => orNotFound(q.updateItem(db, request.params.id, request.body), 'Item'));

  app.delete('/items/:id', { schema: { params: idParam } }, async (request, reply) => {
    const { imageFile } = orNotFound(q.deleteItem(db, request.params.id), 'Item');
    await removeImages([imageFile], request.log);
    return reply.code(204).send();
  });

  /* ---------- item images ---------- */

  app.post('/items/:id/image', {
    config: { multipart: true },
    schema: {
      params: idParam,
      response: { 200: { type: 'object', properties: { imageUrl: { type: 'string' } } } },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    if (!q.getItem(db, id)) throw new NotFoundError('Item not found');
    if (!request.isMultipart()) {
      return reply.code(415).send({ error: 'Expected multipart/form-data' });
    }

    const part = await request.file();
    if (!part || part.fieldname !== 'file') {
      part?.file.resume(); // drain whatever was sent
      throw new FieldError({ file: 'Required' });
    }

    const fileName = await saveImage(app.config.dataDir, part.file);
    const result = q.setItemImage(db, id, fileName);
    if (!result) {
      // The item was deleted while the file was uploading.
      await deleteImage(app.config.dataDir, fileName, request.log);
      throw new NotFoundError('Item not found');
    }
    await removeImages([result.oldFile], request.log); // after the database change succeeded
    return { imageUrl: imageUrl(fileName) };
  });

  app.delete('/items/:id/image', { schema: { params: idParam } }, async (request, reply) => {
    const { oldFile } = orNotFound(q.setItemImage(db, request.params.id, null), 'Item');
    await removeImages([oldFile], request.log);
    return reply.code(204).send();
  });

  /* ---------- settings ---------- */

  app.get('/settings', { schema: { response: { 200: settingsOut } } }, async () => q.getSettings(db));

  app.put('/settings', { schema: { body: settingsIn, response: { 200: settingsOut } } },
    async (request) => q.updateSettings(db, request.body));
}
