# Mongoose Query Kit

Powerful query builder classes (`FindQuery` and `AggregationQuery`) that enhance Mongoose queries with clean chaining for pagination, filtering, searching, sorting, field selection, statistics collection, and lean query support.

---

## ✨ Features

- ✅ Clean chainable API
- 🔍 Search by specific fields
- 📑 Pagination support
- 🔢 Filtering by any query field (supports `$or` and `$and` operators)
- ↕️ Sorting
- 🔐 Field selection
- 🪶 Lean query support
- 📊 Count-only query support
- 📈 Statistics collection (collect multiple counts in a single query)
- 🗑️ Automatic soft-delete handling (`is_deleted` field)
- 🔗 Seamless frontend-driven query support (perfect for single-endpoint APIs)
- 🧠 Full TypeScript support

---

## 📦 Installation

```bash
npm install mongoose-query-kit
# or
yarn add mongoose-query-kit
# or
pnpm add mongoose-query-kit
```

---

## 🚀 Migration from v2.x to v3.0

### Breaking Changes

**v3.0.0** introduces major breaking changes:

1. **Class Name Changed:**
   - `MongooseQuery` → `FindQuery` (for find-based queries)
   - New: `AggregationQuery` (for aggregation-based queries)

2. **Import Changes:**
   ```ts
   // Before (v2.x)
   import { MongooseQuery } from 'mongoose-query-kit';
   
   // After (v3.0.0)
   import { FindQuery, AggregationQuery } from 'mongoose-query-kit';
   ```

3. **Constructor Changes:**
   ```ts
   // Before (v2.x)
   new MongooseQuery(UserModel.find(), req.query)
   
   // After (v3.0.0) - FindQuery
   new FindQuery(UserModel, req.query)
   
   // After (v3.0.0) - AggregationQuery
   new AggregationQuery(UserModel, req.query)
   ```

### Migration Steps

1. **Update Imports:**
   ```ts
   // Change from
   import { MongooseQuery } from 'mongoose-query-kit';
   
   // To
   import { FindQuery } from 'mongoose-query-kit';
   ```

2. **Update Class Usage:**
   ```ts
   // Change from
   new MongooseQuery(UserModel.find(), req.query)
   
   // To
   new FindQuery(UserModel, req.query)
   ```

3. **Choose the Right Query Builder:**
   - Use `FindQuery` for standard find-based queries (same as v2.x)
   - Use `AggregationQuery` for complex aggregation pipelines with custom stages

### New Features in v3.0.0

- ✅ **Two Query Builders**: `FindQuery` for find-based queries and `AggregationQuery` for aggregation pipelines
- ✅ **Pipeline Support**: `AggregationQuery` includes `pipeline()` method for custom aggregation stages
- ✅ **Statistics Collection**: Collect multiple counts in a single query
- ✅ **OR/AND Filter Support**: Complex filtering with `$or` and `$and` operators
- ✅ **Automatic Soft Delete**: Handles `is_deleted` field automatically (FindQuery only)
- ✅ **Simplified API**: Pass Model directly instead of `Model.find()`

---

## 🔗 Frontend-Driven Queries (Single API Endpoint Design)

Using `FindQuery` or `AggregationQuery` allows your frontend to send query parameters directly, enabling dynamic filtering, pagination, searching, and sorting—all through a single API endpoint.

This design pattern makes your backend flexible and minimizes code repetition.

### ✅ Benefits

- One endpoint, multiple use cases
- Query operations controlled dynamically from frontend
- Backend can selectively enable/disable operations via method chaining
- Great for dashboards, admin panels, and advanced filtering systems

### 📲 Example: Frontend → Backend

#### Frontend Code

```ts
const query = new URLSearchParams({
  page: '1',
  limit: '10',
  search: 'john',
  sort: '-createdAt',
  fields: 'name,email',
  status: 'active',
}).toString();

fetch(`/api/users?${query}`);
```

#### Backend Code

```ts
import { FindQuery } from 'mongoose-query-kit';
import UserModel from '../models/user.model';

const getUsers = async (req, res) => {
  const searchableFields = ['name', 'email'];
  const filterableFields = ['status', 'role'];
  const sortableFields = ['name', 'email', 'createdAt'];

  const result = await new FindQuery(UserModel, req.query)
    .search(searchableFields)
    .filter(filterableFields)
    .sort(sortableFields)
    .fields()
    .paginate()
    .tap((q) => q.lean())
    .execute([
      { key: 'active', filter: { status: 'active' } },
      { key: 'inactive', filter: { status: 'inactive' } },
    ]);

  res.json(result);
};
```

### Complete Real-World Example

```ts
import { FindQuery } from 'mongoose-query-kit';
import UserModel from '../models/user.model';

const getUsersWithStats = async (req, res) => {
  try {
    const result = await new FindQuery(UserModel, req.query)
      .search(['name', 'email']) // Allow search on name and email
      .filter(['status', 'role', 'verified']) // Only allow these filters
      .sort(['name', 'createdAt', 'email']) // Only allow sorting by these fields
      .fields(['name', 'email', 'status', 'role']) // Only allow selecting these fields
      .paginate()
      .tap((q) => q.lean())
      .execute([
        // Collect statistics
        { key: 'totalActive', filter: { status: 'active' } },
        { key: 'totalVerified', filter: { verified: true } },
        { key: 'totalAdmins', filter: { role: 'admin' } },
      ]);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
```

---

## 🧠 Usage

### FindQuery vs AggregationQuery

**FindQuery** - Use for standard find-based queries (same as v2.x):
- Based on Mongoose `find()` method
- Returns Mongoose Documents
- Supports `.lean()` via `tap()`
- Best for simple queries and CRUD operations

**AggregationQuery** - Use for complex aggregation pipelines:
- Based on Mongoose `aggregate()` method
- Returns plain objects
- Supports custom pipeline stages via `pipeline()` method
- Best for complex data transformations, joins, and aggregations

### FindQuery - Basic Example

```ts
import { FindQuery } from 'mongoose-query-kit';

const result = await new FindQuery(UserModel, req.query)
  .search(['name', 'email'])
  .filter()
  .sort()
  .fields()
  .paginate()
  .tap((q) => q.lean())
  .execute();
```

### AggregationQuery - Basic Example

```ts
import { AggregationQuery } from 'mongoose-query-kit';

const result = await new AggregationQuery(UserModel, req.query)
  .search(['name', 'email'])
  .filter()
  .sort()
  .fields()
  .paginate()
  .execute();
```

### AggregationQuery - With Custom Pipeline Stages

```ts
import { AggregationQuery } from 'mongoose-query-kit';

const result = await new AggregationQuery(UserModel, req.query)
  .filter()
  .pipeline([
    { $addFields: { nameUpper: { $toUpper: '$name' } } },
    { $lookup: { from: 'posts', localField: '_id', foreignField: 'author', as: 'posts' } }
  ])
  .sort(['name'])
  .paginate()
  .execute();
```

### FindQuery - With Populate

```ts
import { FindQuery } from 'mongoose-query-kit';

const result = await new FindQuery(PostModel, req.query)
  .filter()
  .populate([
    {
      path: 'author',
      select: 'name email',
    },
    {
      path: 'comments',
      select: 'text createdAt',
      match: { approved: true },
      populate: {
        path: 'author',
        select: 'name',
      },
    },
  ])
  .paginate()
  .execute();
```

### AggregationQuery - With Populate

```ts
import { AggregationQuery } from 'mongoose-query-kit';

const result = await new AggregationQuery(PostModel, req.query)
  .filter()
  .populate([
    {
      path: 'author',
      select: 'name email',
      match: { active: true },
    },
  ])
  .sort(['createdAt'])
  .paginate()
  .execute();
```

### Count Only Query

If your query includes `is_count_only=true`, both query builders will return only the total count in the response, skipping data fetching for performance.

```ts
// Query string: ?is_count_only=true

const result = await new FindQuery(UserModel, req.query)
  .filter()
  .execute();

// Result:
{
  data: [],
  meta: {
    total: 143,
    page: 1,
    limit: 0
  }
}
```

### Statistics Collection

Collect multiple counts in a single query. Perfect for dashboards and analytics.

```ts
const result = await new FindQuery(UserModel, req.query)
  .filter()
  .execute([
    { key: 'active', filter: { status: 'active' } },
    { key: 'pending', filter: { status: 'pending' } },
    { key: 'blocked', filter: { status: 'blocked' } },
  ]);

// Result:
{
  data: [...],
  meta: {
    total: 150,
    page: 1,
    limit: 10,
    statistics: {
      active: 120,
      pending: 20,
      blocked: 10
    }
  }
}
```

### Advanced Filtering with OR/AND

Support for complex MongoDB queries using `$or` and `$and` operators.

```ts
// Query string: ?or[0][status]=active&or[1][role]=admin

const result = await new FindQuery(UserModel, req.query)
  .filter()
  .execute();

// This will create: { $or: [{ status: 'active' }, { role: 'admin' }] }
```

### Soft Delete Handling

Automatically excludes documents where `is_deleted: true` unless explicitly included in the filter (FindQuery only).

```ts
// Automatically filters out deleted items
const result = await new FindQuery(UserModel, req.query)
  .filter()
  .execute();

// To include deleted items, explicitly set is_deleted in query params
// Query string: ?is_deleted=true
```

---

## 📦 API Methods

### Common Methods (Both FindQuery & AggregationQuery)

| Method       | Description                                                                |
| ------------ | -------------------------------------------------------------------------- |
| `search()`   | Enables fuzzy search on specified fields using `search` query parameter   |
| `filter()`   | Applies filtering using query key-value pairs (supports `$or` and `$and`) |
| `sort()`     | Sorts results, e.g. `?sort=name` or `?sort=-createdAt`                     |
| `fields()`   | Selects fields to include, e.g. `?fields=name,email`                       |
| `paginate()` | Adds pagination via `?page=1&limit=10`                                     |
| `populate()` | Populates referenced documents (FindQuery uses populate, AggregationQuery uses $lookup) |
| `tap()`      | Provides direct access to modify the query/pipeline                        |
| `execute()`  | Runs the query, returns result and meta info. Accepts optional statistics  |

### AggregationQuery Only

| Method       | Description                                                                |
| ------------ | -------------------------------------------------------------------------- |
| `pipeline()` | Adds custom aggregation pipeline stages to the query                       |

### Method Details

#### `search(applicableFields: (keyof T)[])`
Enables case-insensitive regex search on specified fields.

**Query Parameters:**
- `search`: The search term

**Example:**
```ts
// Query: ?search=john
new FindQuery(UserModel, req.query)
  .search(['name', 'email'])
```

#### `filter(applicableFields?: (keyof T)[])`
Applies filtering from query parameters. If `applicableFields` is provided, only those fields will be allowed.

**Supports:**
- Simple key-value pairs: `?status=active&role=admin`
- `$or` operator: `?or[0][status]=active&or[1][role]=admin`
- `$and` operator: `?and[0][status]=active&and[1][verified]=true`

**Example:**
```ts
// Query: ?status=active&role=admin
new FindQuery(UserModel, req.query)
  .filter(['status', 'role']) // Only allow status and role filters
```

#### `sort(applicableFields?: (keyof T)[])`
Sorts results. Defaults to `-createdAt` if no sort is specified.

**Query Parameters:**
- `sort`: Comma-separated fields, prefix with `-` for descending

**Example:**
```ts
// Query: ?sort=-createdAt,name
new FindQuery(UserModel, req.query)
  .sort(['name', 'createdAt', 'email']) // Only allow these fields
```

#### `fields(applicableFields?: (keyof T)[])`
Selects which fields to return. Defaults to all fields except `__v`.

**Query Parameters:**
- `fields`: Comma-separated field names

**Example:**
```ts
// Query: ?fields=name,email
new FindQuery(UserModel, req.query)
  .fields(['name', 'email', 'createdAt']) // Only allow these fields
```

#### `paginate()`
Adds pagination to the query.

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page

**Example:**
```ts
// Query: ?page=2&limit=20
new FindQuery(UserModel, req.query)
  .paginate()
```

#### `populate(populateConfig)`
Populates referenced documents. Supports both simple string paths and complex object configurations.

**Parameters:**
- `populateConfig`: String path or array of populate configurations

**FindQuery Example:**
```ts
// Simple string populate
new FindQuery(PostModel, req.query)
  .populate('author')
  .execute();

// Array-based populate with options
new FindQuery(PostModel, req.query)
  .populate([
    'author',
    {
      path: 'comments',
      select: 'text createdAt',
      match: { approved: true },
    },
    {
      path: 'category',
      select: 'name',
      populate: {
        path: 'parent',
        select: 'name',
      },
    },
  ])
  .execute();
```

**AggregationQuery Example:**
```ts
// AggregationQuery uses $lookup internally
new AggregationQuery(PostModel, req.query)
  .populate([
    {
      path: 'author',
      select: 'name email',
      match: { active: true },
    },
  ])
  .execute();
```

#### `tap(callback)`
Provides direct access to modify the query or pipeline.

**FindQuery Example:**
```ts
new FindQuery(UserModel, req.query)
  .tap((q) => q.lean())
  .tap((q) => q.populate('author'))
```

**AggregationQuery Example:**
```ts
new AggregationQuery(UserModel, req.query)
  .tap((pipeline) => [...pipeline, { $limit: 10 }])
```

#### `pipeline(stages: PipelineStage[], position?: number)` (AggregationQuery only)
Adds custom aggregation pipeline stages to the query.

**Parameters:**
- `stages`: Array of MongoDB aggregation pipeline stages
- `position` (optional): Position to insert stages. If not provided, inserts before pagination/sort/project stages.

**Example:**
```ts
const result = await new AggregationQuery(UserModel, req.query)
  .filter()
  .pipeline([
    { $addFields: { nameUpper: { $toUpper: '$name' } } },
    { $lookup: { 
        from: 'posts', 
        localField: '_id', 
        foreignField: 'author', 
        as: 'posts' 
      } 
    }
  ])
  .sort(['name'])
  .execute();
```

#### `execute(statisticsQueries?: Array<{key: string, filter: Record<string, any>}>)`
Executes the query and returns results with metadata.

**Parameters:**
- `statisticsQueries` (optional): Array of statistics to collect. Each statistic will count documents matching the base filter + the statistic's filter.

**Example:**
```ts
const result = await new FindQuery(UserModel, req.query)
  .filter()
  .execute([
    { key: 'active', filter: { status: 'active' } },
    { key: 'inactive', filter: { status: 'inactive' } },
  ]);
```

---

## 🧾 Response Format

### Standard Response

By default, the response from `execute()` looks like this:

```ts
{
  data: T[],
  meta: {
    total: number,
    page: number,
    limit: number
  }
}
```

### With Statistics

When statistics are provided, the response includes a `statistics` object:

```ts
{
  data: T[],
  meta: {
    total: number,
    page: number,
    limit: number,
    statistics: {
      [key: string]: number
    }
  }
}
```

### Count Only Response

If `is_count_only=true` is passed in the query, the response will be:

```ts
{
  data: [],
  meta: {
    total: number,
    page: number,
    limit: number,
    statistics?: {
      [key: string]: number
    }
  }
}
```

**Note:** Statistics are still collected even when `is_count_only=true`.

---

## 🧪 TypeScript Support

Fully typed with generics for safe usage:

```ts
interface User {
  name: string;
  email: string;
  status: 'active' | 'inactive';
}

const result = await new FindQuery<User>(UserModel, req.query)
  .filter()
  .tap((q) => q.lean())
  .execute([
    { key: 'active', filter: { status: 'active' } },
  ]);

// result.data is typed as User[]
// result.meta.statistics is typed as Record<string, number> | undefined
```

---

## 📋 Query Parameters Reference

### Supported Query Parameters

| Parameter      | Type    | Description                                                      | Example                    |
| -------------- | ------- | ---------------------------------------------------------------- | -------------------------- |
| `search`       | string  | Search term for fuzzy search                                     | `?search=john`              |
| `sort`         | string  | Sort fields (comma-separated, prefix with `-` for descending)    | `?sort=-createdAt,name`     |
| `page`         | string  | Page number for pagination                                       | `?page=2`                   |
| `limit`        | string  | Items per page                                                   | `?limit=20`                 |
| `fields`       | string  | Fields to select (comma-separated)                               | `?fields=name,email`        |
| `is_count_only`| string  | Return only count without data (`true`/`false`)                  | `?is_count_only=true`       |
| `or`           | object  | OR conditions (array format)                                     | `?or[0][status]=active`     |
| `and`          | object  | AND conditions (array format)                                    | `?and[0][verified]=true`    |
| `[field]`      | any     | Any field name for direct filtering                             | `?status=active&role=admin` |

### Query Parameter Examples

**Simple Filtering:**
```
GET /api/users?status=active&role=admin
```

**Search with Pagination:**
```
GET /api/users?search=john&page=1&limit=10&sort=-createdAt
```

**Field Selection:**
```
GET /api/users?fields=name,email,status
```

**OR Conditions:**
```
GET /api/users?or[0][status]=active&or[1][role]=admin
```

**AND Conditions:**
```
GET /api/users?and[0][status]=active&and[1][verified]=true
```

**Count Only:**
```
GET /api/users?is_count_only=true&status=active
```

---

## 🧪 Testing

```bash
pnpm test
```

---

## 🌐 Repository

[https://github.com/beendoo/mongoose-query-kit.git](https://github.com/beendoo/mongoose-query-kit.git)

---

## 📝 License

MIT © [Foysal Ahmed](https://github.com/foysalahmedmin)

<!--
npm version patch   # for 1.0.0 -> 1.0.1
npm version minor   # for 1.0.1 -> 2.0.0
npm version major   # for 2.0.0 -> 3.0.0
-->
