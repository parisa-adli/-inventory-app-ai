import { isValidObjectId, type HydratedDocument, type Model, type PipelineStage, type Types } from 'mongoose';
import { defaultSortOrder } from '@inventory/shared';
import type { CatalogListQuery, Paginated } from '@inventory/shared';
import { AppError, NotFoundError, isDuplicateKeyError } from '../utils/errors.js';
import { escapeRegex } from '../utils/text.js';
import { countProductsReferencing, productCountStages, type ProductRefField } from './productRefs.js';

// Categories and suppliers share one set of rules: search + sort + paging with product counts,
// a normalized unique name, PATCH where null clears a field, and delete blocked while products use it.

/** Case-insensitive sort and comparison for names. */
const NAME_COLLATION = { locale: 'en', strength: 2 } as const;

interface CatalogConfig<TDoc, TDto> {
  // Mongoose's model generics differ per schema; the config only needs find/aggregate/save
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<any>;
  /** The display name field (`title` or `name`); `sort=name` sorts by it. */
  nameField: string;
  /** Fields `?search=` matches. */
  searchFields: string[];
  /** The Product field that references this record. */
  productField: ProductRefField;
  /** 'category' / 'supplier', for messages. */
  label: string;
  duplicateCode: string;
  inUseCode: string;
  toDto: (doc: TDoc) => TDto;
}

export const createCatalogService = <TDoc, TDto>(config: CatalogConfig<TDoc, TDto>) => {
  const { model, nameField, searchFields, productField, label } = config;
  const Label = label[0].toUpperCase() + label.slice(1);

  const duplicateError = () =>
    new AppError(409, config.duplicateCode, `A ${label} with this ${nameField} already exists.`);

  const findOrThrow = async (id: string): Promise<HydratedDocument<TDoc>> => {
    const doc = isValidObjectId(id) ? await model.findById(id) : null;
    if (!doc) throw new NotFoundError(`${Label} not found`);
    return doc;
  };

  const save = async (doc: HydratedDocument<TDoc>) => {
    try {
      await doc.save();
    } catch (err) {
      if (isDuplicateKeyError(err)) throw duplicateError();
      throw err;
    }
    return config.toDto(doc as TDoc);
  };

  /** GET list: escaped case-insensitive search, sort with a name tie-break, pages with product counts. */
  const list = async (query: CatalogListQuery): Promise<Paginated<TDto & { productCount: number }>> => {
    const { search, page, limit, sort } = query;
    const direction = (query.order ?? defaultSortOrder(sort)) === 'asc' ? 1 : -1;
    const filter: Record<string, unknown> = {};
    if (search) {
      const pattern = new RegExp(escapeRegex(search), 'i');
      filter.$or = searchFields.map((field) => ({ [field]: pattern }));
    }

    const sortField = sort === 'name' ? nameField : sort;
    const sortStage: Record<string, 1 | -1> = { [sortField]: direction };
    if (sortField !== nameField) sortStage[nameField] = 1;
    sortStage._id = 1;

    const pipeline: PipelineStage[] = [
      { $match: filter },
      ...productCountStages(productField),
      { $sort: sortStage },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ];

    const [total, rows] = await Promise.all([
      model.countDocuments(filter),
      model.aggregate<TDoc & { productCount: number }>(pipeline).collation(NAME_COLLATION),
    ]);
    return {
      items: rows.map((row) => ({ ...config.toDto(row), productCount: row.productCount })),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  };

  const create = async (input: object) => save(new model(input) as HydratedDocument<TDoc>);

  /** PATCH: absent fields stay, `null` removes the field from the document. */
  const update = async (id: string, patch: Record<string, unknown>) => {
    const doc = await findOrThrow(id);
    for (const [field, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      doc.set(field, value === null ? undefined : value);
    }
    return save(doc);
  };

  /** DELETE: 409 while any product (archived included) references the record. */
  const remove = async (id: string) => {
    const doc = await findOrThrow(id);
    const usage = await countProductsReferencing(productField, doc._id as Types.ObjectId);
    if (usage.productCount > 0) {
      const products = usage.productCount === 1 ? '1 product' : `${usage.productCount} products`;
      throw new AppError(
        409,
        config.inUseCode,
        `This ${label} is used by ${products}. Move them to another ${label} or delete them first.`,
        { ...usage }
      );
    }
    await doc.deleteOne();
  };

  return { list, create, update, remove };
};
