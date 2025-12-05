import { Model, PipelineStage } from 'mongoose';

interface QueryParams {
  search?: string;
  sort?: string;
  page?: string;
  limit?: string;
  fields?: string;
  is_count_only?: string | boolean;
  [key: string]: unknown;
}

class AggregationQuery<T = any> {
  private model: Model<any>;
  private _pipeline: PipelineStage[];
  private query_params: QueryParams;

  private baseMatchFilter: Record<string, any> = {};
  
  private page = 1;
  private limit = 0;
  

  constructor(model: Model<any>, query_params: Record<string, unknown>) {
    this.model = model;
    this.query_params = query_params;
    this._pipeline = [];
  }

  search(applicableFields: (keyof T)[]): this {
    const searchValue = this.query_params.search;
    if (searchValue) {
      const searchConditions = {
        $or: applicableFields.map((field) => ({
          [String(field)]: { $regex: searchValue, $options: 'i' },
        })),
      };

      // Find first $match stage
      const matchIndex = this._pipeline.findIndex((stage) => '$match' in stage);

      if (matchIndex >= 0) {
        const matchStage = this._pipeline[matchIndex] as {
          $match: Record<string, any>;
        };
        matchStage.$match = { ...matchStage.$match, ...searchConditions };
      } else {
        // If no $match exists, create one at the beginning
        this._pipeline.unshift({ $match: searchConditions });
      }
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

    // Add to existing $match or create new one
    if (Object.keys(mongoFilter).length > 0) {
      const matchIndex = this._pipeline.findIndex((stage) => '$match' in stage);

      if (matchIndex >= 0) {
        const matchStage = this._pipeline[matchIndex] as {
          $match: Record<string, any>;
        };
        matchStage.$match = { ...matchStage.$match, ...mongoFilter };
      } else {
        // If no $match exists, create one at the beginning
        this._pipeline.unshift({ $match: mongoFilter });
      }

      // Store for count query
      this.baseMatchFilter = { ...this.baseMatchFilter, ...mongoFilter };
    }

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

    // Remove existing $sort if any
    this._pipeline = this._pipeline.filter((stage) => !('$sort' in stage));

    if (fields.length > 0) {
      const sortObj: Record<string, 1 | -1> = {};
      fields.forEach((field) => {
        const fieldName = field.startsWith('-') ? field.slice(1) : field;
        const order = field.startsWith('-') ? -1 : 1;
        sortObj[fieldName] = order;
      });
      this._pipeline.push({ $sort: sortObj });
    } else {
      // Default sort
      this._pipeline.push({ $sort: { created_at: -1 } });
    }

    return this;
  }

  paginate(): this {
    const { page, limit } = this.query_params;

    if (limit && page) {
      this.page = Number(page) || 1;
      this.limit = Number(limit) || 10;
      const skip = (this.page - 1) * this.limit;
      this._pipeline.push({ $skip: skip }, { $limit: this.limit });
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

    // Remove existing $project if any
    this._pipeline = this._pipeline.filter((stage) => !('$project' in stage));

    if (selectedFields.length > 0) {
      const projectObj: Record<string, 1 | 0> = {};
      selectedFields.forEach((field) => {
        const fieldName = field.startsWith('-') ? field.slice(1) : field;
        const include = field.startsWith('-') ? 0 : 1;
        projectObj[fieldName] = include;
      });
      this._pipeline.push({ $project: projectObj });
    }

    return this;
  }

  populate(
    populateConfig:
      | string
      | Array<
          | string
          | {
              path: string;
              select?: string | Record<string, 0 | 1>;
              match?: Record<string, any>;
              populate?:
                | string
                | Array<{
                    path: string;
                    select?: string | Record<string, 0 | 1>;
                    match?: Record<string, any>;
                  }>;
              model?: string;
              options?: Record<string, any>;
            }
        >,
  ): this {
    const buildLookupStage = (
      path: string,
      config?: {
        select?: string | Record<string, 0 | 1>;
        match?: Record<string, any>;
        populate?:
          | string
          | Array<{
              path: string;
              select?: string | Record<string, 0 | 1>;
              match?: Record<string, any>;
            }>;
        model?: string;
        options?: Record<string, any>;
      },
    ): PipelineStage[] => {
      const stages: PipelineStage[] = [];
      // For ObjectId references, localField is the same as path
      const localField = path;
      const foreignField = '_id';
      const asField = path;
      
      // Get collection name from model or use path (mongoose pluralizes model names)
      // If model is provided, use it; otherwise try to infer from path
      let collectionName = config?.model;
      if (!collectionName) {
        // Try to get collection name from the model's schema
        const schema = this.model.schema;
        const pathSchema = schema.path(path);
        if (pathSchema && (pathSchema as any).options?.ref) {
          // Get the referenced model
          const refModelName = (pathSchema as any).options.ref;
          try {
            const refModel = this.model.db.model(refModelName);
            if (refModel && refModel.collection) {
              collectionName = refModel.collection.name;
            } else {
              // Fallback: pluralize model name (mongoose default: ModelName -> modelnames)
              collectionName = refModelName.toLowerCase() + 's';
            }
          } catch (e) {
            // Fallback: pluralize model name (mongoose default)
            collectionName = refModelName.toLowerCase() + 's';
          }
        } else {
          // Fallback: pluralize the path
          collectionName = path.endsWith('s') ? path : path + 's';
        }
      }

      // Build lookup pipeline
      const lookupPipeline: PipelineStage[] = [];

      // Add match if provided
      if (config?.match) {
        lookupPipeline.push({ $match: config.match });
      }

      // Handle nested populate
      if (config?.populate) {
        if (typeof config.populate === 'string') {
          // Simple nested populate
          const nestedPath = config.populate;
          // For nested populate, localField is the nested path itself
          const nestedLocalField = nestedPath;
          // Get collection name for nested populate
          let nestedCollectionName = nestedPath.endsWith('s') ? nestedPath : nestedPath + 's';
          lookupPipeline.push({
            $lookup: {
              from: nestedCollectionName,
              localField: nestedLocalField,
              foreignField: '_id',
              as: nestedPath,
            },
          });
        } else if (Array.isArray(config.populate)) {
          // Array of nested populates
          config.populate.forEach((nestedPop) => {
            if (typeof nestedPop === 'string') {
              const nestedPath: string = nestedPop;
              const nestedLocalField = nestedPath;
              const nestedCollectionName = nestedPath.endsWith('s') ? nestedPath : nestedPath + 's';
              lookupPipeline.push({
                $lookup: {
                  from: nestedCollectionName,
                  localField: nestedLocalField,
                  foreignField: '_id',
                  as: nestedPath,
                },
              });
            } else {
              const nestedPopObj = nestedPop as {
                path: string;
                select?: string | Record<string, 0 | 1>;
                match?: Record<string, any>;
              };
              const nestedPath: string = nestedPopObj.path;
              const nestedLocalField = nestedPath;
              const nestedCollectionName = nestedPath.endsWith('s') ? nestedPath : nestedPath + 's';
              const nestedLookupPipeline: any[] = [];
              if (nestedPopObj.match) {
                nestedLookupPipeline.push({ $match: nestedPopObj.match });
              }
              const nestedLookup: any = {
                $lookup: {
                  from: nestedCollectionName,
                  localField: nestedLocalField,
                  foreignField: '_id',
                  as: nestedPath,
                },
              };
              if (nestedLookupPipeline.length > 0) {
                nestedLookup.$lookup.pipeline = nestedLookupPipeline;
              }
              lookupPipeline.push(nestedLookup);
            }
          });
        }
      }

      // Build lookup stage
      const lookupStage: any = {
        $lookup: {
          from: collectionName,
          localField: localField,
          foreignField: foreignField,
          as: asField,
        },
      };

      if (lookupPipeline.length > 0) {
        lookupStage.$lookup.pipeline = lookupPipeline;
      }

      stages.push(lookupStage);

      // Add project stage for select if provided
      if (config?.select) {
        const projectObj: Record<string, 1 | 0> = {};
        if (typeof config.select === 'string') {
          // Parse string select like "name email -password"
          const fields = config.select.split(/\s+/);
          fields.forEach((field) => {
            const fieldName = field.startsWith('-') ? field.slice(1) : field;
            const include = field.startsWith('-') ? 0 : 1;
            projectObj[fieldName] = include;
          });
        } else {
          // Use object directly
          Object.assign(projectObj, config.select);
        }

        // Add $project to lookup pipeline to select specific fields
        const selectProject: Record<string, 1 | 0> = {};
        Object.keys(projectObj).forEach((key) => {
          if (projectObj[key] === 1) {
            selectProject[key] = 1;
          }
        });

        if (Object.keys(selectProject).length > 0) {
          // Add project to the lookup pipeline
          if (!lookupStage.$lookup.pipeline) {
            lookupStage.$lookup.pipeline = [];
          }
          lookupStage.$lookup.pipeline.push({ $project: selectProject });
        }
      }

      return stages;
    };

    if (Array.isArray(populateConfig)) {
      // Array-based populate
      populateConfig.forEach((pop) => {
        if (typeof pop === 'string') {
          // Simple string populate
          const stages = buildLookupStage(pop);
          this._pipeline.push(...stages);
        } else {
          // Object-based populate
          const stages = buildLookupStage(pop.path, pop);
          this._pipeline.push(...stages);
        }
      });
    } else {
      // Simple string populate
      const stages = buildLookupStage(populateConfig);
      this._pipeline.push(...stages);
    }

    return this;
  }

  tap(callback: (pipeline: PipelineStage[]) => PipelineStage[]): this {
    this._pipeline = callback(this._pipeline);
    return this;
  }

  pipeline(stages: PipelineStage[], position?: number): this {
    if (stages.length === 0) {
      return this;
    }

    if (position !== undefined && position >= 0) {
      // Insert at specific position
      this._pipeline.splice(position, 0, ...stages);
    } else {
      // Find the position before $sort, $skip, $limit, $project
      const sortIndex = this._pipeline.findIndex((stage) => '$sort' in stage);
      const skipIndex = this._pipeline.findIndex((stage) => '$skip' in stage);
      const limitIndex = this._pipeline.findIndex((stage) => '$limit' in stage);
      const projectIndex = this._pipeline.findIndex(
        (stage) => '$project' in stage,
      );

      // Find the earliest position among these
      const insertIndex = [sortIndex, skipIndex, limitIndex, projectIndex]
        .filter((idx) => idx >= 0)
        .reduce((min, idx) => (idx < min ? idx : min), this._pipeline.length);

      // Insert before pagination/sort/project stages
      this._pipeline.splice(insertIndex, 0, ...stages);
    }

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
    // Build count pipeline (without skip, limit, project)
    const countPipeline: PipelineStage[] = [];

    // Copy all stages except skip, limit, and project
    for (const stage of this._pipeline) {
      if ('$skip' in stage || '$limit' in stage || '$project' in stage) {
        continue;
      }
      // Deep clone to avoid mutating original
      countPipeline.push(JSON.parse(JSON.stringify(stage)));
    }

    // If no stages, add default match
    if (countPipeline.length === 0) {
      countPipeline.push({ $match: {} });
    }

    // Add count stage
    countPipeline.push({ $count: 'total' });

    // Execute count and data queries in parallel
    const [countResult, stats] = await Promise.all([
      this.model.aggregate(countPipeline),
      statisticsQueries
        ? Promise.all(
            statisticsQueries.map(async (stat) => {
              const statPipeline: PipelineStage[] = [];

              // Copy stages except skip, limit, project
              for (const stage of this._pipeline) {
                if (
                  '$skip' in stage ||
                  '$limit' in stage ||
                  '$project' in stage
                ) {
                  continue;
                }
                statPipeline.push(JSON.parse(JSON.stringify(stage)));
              }

              // Add stat filter to first $match
              const matchIndex = statPipeline.findIndex((s) => '$match' in s);

              if (matchIndex >= 0) {
                const matchStage = statPipeline[matchIndex] as {
                  $match: Record<string, any>;
                };
                matchStage.$match = { ...matchStage.$match, ...stat.filter };
              } else {
                // If no match stage exists, create one with the stat filter
                statPipeline.unshift({ $match: stat.filter });
              }

              // If pipeline is still empty, add default match
              if (statPipeline.length === 0) {
                statPipeline.push({ $match: stat.filter });
              }

              statPipeline.push({ $count: 'total' });

              const result = await this.model.aggregate(statPipeline);
              return { key: stat.key, count: result[0]?.total || 0 };
            }),
          )
        : Promise.resolve([]),
    ]);

    const total = countResult[0]?.total || 0;

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

    // Execute main pipeline
    // If pipeline is empty, add a default match stage
    const pipelineToExecute =
      this._pipeline.length === 0 ? [{ $match: {} }] : this._pipeline;
    const data = (await this.model.aggregate(pipelineToExecute)) as T[];

    return {
      data,
      meta: { total, page: this.page, limit: this.limit, statistics },
    };
  }
}

export default AggregationQuery;