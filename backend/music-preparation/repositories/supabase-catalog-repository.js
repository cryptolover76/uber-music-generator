const CATALOGS = Object.freeze({
  templates: Object.freeze({ table: 'templates_letras', columns: 'id,name,letra,active,categoria' }),
  styles: Object.freeze({ table: 'estilos', columns: 'id,name,prompt,active,categoria' }),
  periods: Object.freeze({ table: 'periodos', columns: 'id,name,texto,active,categoria' }),
  weekdays: Object.freeze({ table: 'dias_semana', columns: 'id,name,texto,active,categoria' }),
  climates: Object.freeze({ table: 'climas', columns: 'id,name,texto,active,categoria' }),
});

export class CatalogRepositoryError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'CatalogRepositoryError';
    this.code = code;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

export class InvalidCatalogTypeError extends CatalogRepositoryError {
  constructor(type) {
    super('INVALID_CATALOG_TYPE', 'Catalog type is not allowed');
    this.name = 'InvalidCatalogTypeError';
    this.catalogType = type;
  }
}

function catalog(type) {
  const definition = CATALOGS[type];
  if (!definition) throw new InvalidCatalogTypeError(type);
  return definition;
}

function failure(operation, error) {
  return new CatalogRepositoryError('CATALOG_QUERY_FAILED', `Catalog ${operation} failed`, { cause: error });
}

function deterministic(rows) {
  return [...rows].sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

export function createSupabaseCatalogRepository({ client } = {}) {
  if (!client || typeof client.from !== 'function') throw new TypeError('client.from is required');

  return Object.freeze({
    async list(type) {
      const definition = catalog(type);
      const { data, error } = await client.from(definition.table).select(definition.columns).eq('active', true);
      if (error) throw failure('list', error);
      if (!Array.isArray(data)) throw failure('list', new TypeError('Supabase returned invalid catalog data'));
      return deterministic(data);
    },

    async findById(type, id) {
      const definition = catalog(type);
      const { data, error } = await client.from(definition.table)
        .select(definition.columns)
        .eq('active', true)
        .eq('id', id);
      if (error) throw failure('lookup', error);
      if (!Array.isArray(data)) throw failure('lookup', new TypeError('Supabase returned invalid catalog data'));
      if (data.length > 1) {
        throw new CatalogRepositoryError('MULTIPLE_CATALOG_ROWS', 'Catalog lookup returned multiple rows');
      }
      return data[0] ?? null;
    },
  });
}
