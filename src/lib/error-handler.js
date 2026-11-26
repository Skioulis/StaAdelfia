// Error responses:
//   400 validation → { error: 'Validation failed', errors: { "name.de": "Required", ... } }
//   other 4xx      → { error: message[, errors] }
//   5xx            → { error: 'Internal Server Error' } (details only in the log)

/** "/options/0/name/de" → "options.0.name.de" */
const toKey = (instancePath, extra) =>
  [...instancePath.split('/').filter(Boolean), ...(extra ? [extra] : [])].join('.');

function message(e) {
  const p = e.params || {};
  switch (e.keyword) {
    case 'required': return 'Required';
    case 'minLength': return p.limit === 1 ? 'Required' : `At least ${p.limit} characters`;
    case 'pattern': return 'Required'; // only used as "not just whitespace"
    case 'maxLength': return `At most ${p.limit} characters`;
    case 'minimum': return `Must be at least ${p.limit}`;
    case 'maximum': return `Must be at most ${p.limit}`;
    case 'maxItems': return `At most ${p.limit} entries`;
    case 'enum': return 'Invalid value';
    case 'uniqueItems': return 'Duplicate entries';
    case 'type': return `Must be ${[p.type].flat().filter((t) => t !== 'null').join(' or ')}`;
    default: return e.message || 'Invalid value';
  }
}

export function fieldErrors(validation) {
  const errors = {};
  for (const e of validation) {
    const key = toKey(e.instancePath || '', e.keyword === 'required' ? e.params?.missingProperty : undefined) || '_';
    if (!(key in errors)) errors[key] = message(e); // first error per field wins
  }
  return errors;
}

export function errorHandler(error, request, reply) {
  if (error.validation) {
    return reply.code(400).send({ error: 'Validation failed', errors: fieldErrors(error.validation) });
  }
  const status = error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500;
  if (status >= 500) {
    request.log.error(error);
    return reply.code(status).send({ error: 'Internal Server Error' });
  }
  const body = { error: error.message };
  if (error.errors) body.errors = error.errors;
  return reply.code(status).send(body);
}
