// Shared JSON Schemas.

const nullableString = { type: ['string', 'null'] };

// Response shape for translated text. Only `de` is required in stored data,
// but it is typed nullable here so the serializer never throws on a tagline.
export const localizedTextOut = {
  type: 'object',
  properties: { de: nullableString, en: nullableString, el: nullableString },
};

export const settingsOut = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    tagline: localizedTextOut,
  },
};

export const optionOut = {
  type: 'object',
  properties: {
    name: localizedTextOut,
    extraPriceCents: { type: 'integer' },
  },
};

export const publicItemOut = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: localizedTextOut,
    description: localizedTextOut,
    priceCents: { type: 'integer' },
    imageUrl: nullableString,
    isAvailable: { type: 'boolean' },
    options: { type: 'array', items: optionOut },
  },
};

export const publicMenuOut = {
  type: 'object',
  properties: {
    settings: settingsOut,
    groups: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: localizedTextOut,
          items: { type: 'array', items: publicItemOut },
        },
      },
    },
  },
};

export const adminItemOut = {
  type: 'object',
  properties: {
    ...publicItemOut.properties,
    groupId: { type: 'integer' },
    options: {
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'integer' }, ...optionOut.properties } },
    },
  },
};

export const adminMenuOut = {
  type: 'object',
  properties: {
    settings: settingsOut,
    groups: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: localizedTextOut,
          isVisible: { type: 'boolean' },
          items: { type: 'array', items: adminItemOut },
        },
      },
    },
  },
};

/* ---------- request schemas ---------- */

export const NAME_MAX = 120;
export const DESC_MAX = 600;
export const PRICE_MAX = 100000;
export const OPTIONS_MAX = 20;

const optText = (max) => ({ type: ['string', 'null'], maxLength: max });

/** Translated name: German required (and not only whitespace), en/el optional. */
export const localizedNameIn = {
  type: 'object',
  additionalProperties: false,
  required: ['de'],
  properties: {
    de: { type: 'string', minLength: 1, maxLength: NAME_MAX, pattern: '\\S' },
    en: optText(NAME_MAX),
    el: optText(NAME_MAX),
  },
};

/** Translated free text where every language is optional. */
const localizedTextIn = (max) => ({
  type: 'object',
  additionalProperties: false,
  properties: { de: optText(max), en: optText(max), el: optText(max) },
});

const price = { type: 'integer', minimum: 0, maximum: PRICE_MAX };
export const idParam = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1 } },
};

export const groupIn = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    name: localizedNameIn,
    isVisible: { type: 'boolean', default: true },
  },
};

export const groupOut = {
  type: 'object',
  properties: { id: { type: 'integer' }, name: localizedTextOut, isVisible: { type: 'boolean' } },
};

export const optionIn = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    id: { type: 'integer', minimum: 1 },
    name: localizedNameIn,
    extraPriceCents: { ...price, default: 0 },
  },
};

export const itemIn = {
  type: 'object',
  additionalProperties: false,
  required: ['groupId', 'name', 'priceCents'],
  properties: {
    groupId: { type: 'integer', minimum: 1 },
    name: localizedNameIn,
    description: localizedTextIn(DESC_MAX),
    priceCents: price,
    isAvailable: { type: 'boolean', default: true },
    options: { type: 'array', maxItems: OPTIONS_MAX, items: optionIn, default: [] },
  },
};

export const idsIn = {
  type: 'object',
  additionalProperties: false,
  required: ['ids'],
  properties: {
    ids: { type: 'array', maxItems: 1000, items: { type: 'integer', minimum: 1 } },
  },
};

export const settingsIn = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: NAME_MAX, pattern: '\\S' },
    tagline: localizedTextIn(200),
  },
};

/**
 * PUT replaces the whole resource, so every field is required and no defaults apply.
 * (A default would let a client that leaves out isVisible silently un-hide a group.)
 */
function forReplace(schema) {
  const properties = Object.fromEntries(
    Object.entries(schema.properties).map(([k, v]) => {
      const { default: _ignored, ...rest } = v;
      return [k, rest];
    }),
  );
  return { ...schema, properties, required: Object.keys(properties).filter((k) => k !== 'id') };
}

export const groupReplaceIn = forReplace(groupIn);
export const itemReplaceIn = {
  ...forReplace(itemIn),
  required: ['groupId', 'name', 'description', 'priceCents', 'isAvailable', 'options'],
};
