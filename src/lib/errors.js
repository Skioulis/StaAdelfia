/** A 400 error tied to request fields, sent as { error, errors: { "<field>": "<message>" } }. */
export class FieldError extends Error {
  constructor(errors, message = 'Validation failed') {
    super(message);
    this.statusCode = 400;
    this.errors = errors;
  }
}

/** A 404 for an unknown id. */
export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.statusCode = 404;
  }
}
