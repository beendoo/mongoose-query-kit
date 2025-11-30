import { Document, FilterQuery, Model, Query } from 'mongoose';

interface QueryParams {
  search?: string;
  sort?: string;
  page?: string;
  limit?: string;
  fields?: string;
  is_count_only?: string | boolean;
  [key: string]: unknown;
}

type DocumentType<T> = T & Document;

class MongooseQuery<T = any> {
  public query: Query<DocumentType<T>[], DocumentType<T>>;
  public query_params: QueryParams;
  public query_filter: FilterQuery<DocumentType<T>>;
  private model: Model<DocumentType<T>>;
  private page = 1;
  private limit = 0;

  constructor(
    model: Model<DocumentType<T>>,
    query_params: Record<string, unknown>,
  ) {
    this.model = model;
    this.query = model.find();
    this.query_params = query_params;
    this.query_filter = {};
  }

  search(applicableFields: (keyof T)[]): this {
    const searchValue = this.query_params.search;
    if (searchValue) {
      const searchConditions: FilterQuery<DocumentType<T>> = {
        $or: applicableFields.map((field) => ({
          [field]: { $regex: searchValue, $options: 'i' },
        })) as FilterQuery<DocumentType<T>>[],
      };
      this.query_filter = { ...this.query_filter, ...searchConditions };
      this.query = this.query.find(searchConditions);
    }
    return this;
  }

  filter(applicableFields?: (keyof T)[]): this {
    const queryObj = { ...this.query_params };
    const excludedFields = [
      'search',
      'sort',
      'limit',
      'page',
      'fields',
      'is_count_only',
    ];
    excludedFields.forEach((field) => delete queryObj[field]);

    // Normal filter
    if (applicableFields?.length) {
      Object.keys(queryObj).forEach((key) => {
        if (!applicableFields.includes(key as keyof T)) {
          delete queryObj[key];
        }
      });
    }

    const mongoFilter: Record<string, any> = {};

    // Handle OR
    if (queryObj.or) {
      try {
        mongoFilter.$or = Object.values(queryObj.or).map((cond: any) => cond);
      } catch (e) {
        console.error('Invalid OR format:', e);
      }
      delete queryObj.or;
    }

    // Handle AND
    if (queryObj.and) {
      try {
        mongoFilter.$and = Object.values(queryObj.and).map((cond: any) => cond);
      } catch (e) {
        console.error('Invalid AND format:', e);
      }
      delete queryObj.and;
    }

    // Merge remaining normal filters
    Object.assign(mongoFilter, queryObj);

    // Apply to query
    this.query_filter = { ...this.query_filter, ...mongoFilter };
    this.query = this.query.find(mongoFilter);

    return this;
  }

  sort(applicableFields?: (keyof T)[]): this {
    const rawSort = this.query_params.sort ?? '';
    let fields = rawSort.split(',').filter(Boolean);

    if (applicableFields?.length) {
      fields = fields.filter((field) => {
        const fieldName = field.startsWith('-') ? field.slice(1) : field;
        return applicableFields.includes(fieldName as keyof T);
      });
    }

    const sortOrder = fields.length > 0 ? fields.join(' ') : '-createdAt';
    this.query = this.query.sort(sortOrder);
    return this;
  }

  paginate(): this {
    const { page, limit } = this.query_params;

    if (limit && page) {
      this.page = Number(page) || 1;
      this.limit = Number(limit) || 10;
      const skip = (this.page - 1) * this.limit;
      this.query = this.query.skip(skip).limit(this.limit);
    }

    return this;
  }

  fields(applicableFields?: (keyof T)[]): this {
    const rawFields = this.query_params.fields ?? '';
    let selectedFields = rawFields.split(',').filter(Boolean);

    if (applicableFields?.length) {
      selectedFields = selectedFields.filter((field) => {
        const fieldName = field.startsWith('-') ? field.slice(1) : field;
        return applicableFields.includes(fieldName as keyof T);
      });
    }

    const fieldSelection =
      selectedFields.length > 0
        ? selectedFields.join(' ')
        : (applicableFields?.join(' ') ?? '-__v');

    this.query = this.query.select(fieldSelection);
    return this;
  }

  tap(
    callback: (
      query: Query<DocumentType<T>[], DocumentType<T>>,
    ) => Query<any, DocumentType<T>>,
  ): this {
    this.query = callback(this.query) as Query<
      DocumentType<T>[],
      DocumentType<T>
    >;
    return this;
  }

  async execute(
    statisticsQueries?: { key: string; filter: Record<string, any> }[],
  ): Promise<{
    data: T[];
    meta: {
      total: number;
      page: number;
      limit: number;
      statistics?: Record<string, number>;
    };
  }> {
    const [total, stats] = await Promise.all([
      this.model.countDocuments({
        ...this.query_filter,
        ...(!this.query_filter?.is_deleted && {
          is_deleted: { $ne: true },
        }),
      }),
      statisticsQueries
        ? Promise.all(
            statisticsQueries.map(async (stat) => {
              const count = await this.model.countDocuments({
                ...this.query_filter,
                ...stat.filter,
                ...(!this.query_filter?.is_deleted && {
                  is_deleted: { $ne: true },
                }),
              });
              return { key: stat.key, count };
            }),
          )
        : Promise.resolve([]),
    ]);

    const statistics =
      stats?.reduce(
        (acc, curr) => {
          acc[curr.key] = curr.count;
          return acc;
        },
        {} as Record<string, number>,
      ) || undefined;

    if (Boolean(this.query_params.is_count_only)) {
      return {
        data: [],
        meta: {
          total,
          page: this.page,
          limit: this.limit,
          statistics,
        },
      };
    }

    const data = (await this.query) as unknown as T[];

    return {
      data,
      meta: { total, page: this.page, limit: this.limit, statistics },
    };
  }
}

export default MongooseQuery;
