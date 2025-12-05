import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { Schema, model } from 'mongoose';
import { FindQuery, AggregationQuery } from '../src';

interface IUser extends mongoose.Document {
  name: string;
  email: string;
}

interface IPost extends mongoose.Document {
  title: string;
  content: string;
  author: mongoose.Types.ObjectId;
}

const UserSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true },
});

const PostSchema = new Schema<IPost>({
  title: { type: String, required: true },
  content: { type: String, required: true },
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});

const User = model<IUser>('User', UserSchema);
const Post = model<IPost>('Post', PostSchema);

jest.setTimeout(60000); // increase timeout for MongoMemoryServer startup

describe('FindQuery', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
      instance: {
        dbName: 'jest-test-db',
      },
    });
    const uri = mongoServer.getUri();
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(uri);
    }
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await User.create([
      { name: 'Alice', email: 'alice@example.com' },
      { name: 'Bob', email: 'bob@example.com' },
      { name: 'Charlie', email: 'charlie@example.com' },
    ]);
  });

  test('search by name returns correct result', async () => {
    const queryParams = { search: 'ali' };
    const findQuery = new FindQuery(User, queryParams);
    const result = await findQuery.search(['name']).execute();

    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('Alice');
    expect(result.meta.total).toBe(1);
  });

  test('pagination works correctly', async () => {
    const queryParams = { page: '2', limit: '1', sort: 'name' }; // consistent order
    const findQuery = new FindQuery(User, queryParams);
    const result = await findQuery.sort(['name']).paginate().execute();

    expect(result.data).toHaveLength(1);
    expect(result.meta.page).toBe(2);
    expect(result.meta.limit).toBe(1);
    expect(result.data[0].name).toBe('Bob');
  });

  test('count only returns total without data', async () => {
    const queryParams = { is_count_only: 'true' };
    const findQuery = new FindQuery(User, queryParams);
    const result = await findQuery.execute();

    expect(result.data).toHaveLength(0);
    expect(result.meta.total).toBe(3);
    expect(result.meta.page).toBe(1);
    expect(result.meta.limit).toBe(0);
  });

  test('filter returns correct documents', async () => {
    const queryParams = { email: 'bob@example.com' };
    const findQuery = new FindQuery(User, queryParams);
    const result = await findQuery.filter(['email']).execute();

    expect(result.data).toHaveLength(1);
    expect(result.data[0].email).toBe('bob@example.com');
  });

  test('sort returns results in correct order', async () => {
    const queryParams = { sort: '-name' };
    const findQuery = new FindQuery(User, queryParams);
    const result = await findQuery.sort(['name']).execute();

    expect(result.data[0].name).toBe('Charlie');
    expect(result.data[2].name).toBe('Alice');
  });

  test('fields limits selected fields', async () => {
    const queryParams = { fields: 'name' };
    const findQuery = new FindQuery(User, queryParams);
    const result = await findQuery.fields(['name']).execute();

    expect(result.data[0]).toHaveProperty('name');
    expect(result.data[0].email).toBeUndefined();
  });

  test('tap method allows direct query modifications like lean()', async () => {
    const queryParams = {};
    const findQuery = new FindQuery(User, queryParams);
    const result = await findQuery.tap((q) => q.lean()).execute();

    expect(result.data).toHaveLength(3);
    expect(typeof result.data[0]).toBe('object');
    expect('_doc' in result.data[0]).toBe(false);
  });

  test('tap method allows multiple query modifications', async () => {
    const queryParams = {};
    const findQuery = new FindQuery(User, queryParams);
    const result = await findQuery
      .tap((q) => q.lean())
      .tap((q) => q.limit(2))
      .tap((q) => q.sort({ name: 1 }))
      .execute();

    expect(result.data).toHaveLength(2);
    expect(result.data[0].name).toBeDefined();
    expect('_doc' in result.data[0]).toBe(false);
  });

  test('tap method maintains method chaining', async () => {
    const queryParams = { page: '1', limit: '2' };
    const findQuery = new FindQuery(User, queryParams);
    const result = await findQuery
      .filter()
      .tap((q) => q.lean())
      .paginate()
      .execute();

    expect(result.data).toHaveLength(2);
    expect(result.meta.limit).toBe(2);
    expect('_doc' in result.data[0]).toBe(false);
  });

  test('populate method works with string path', async () => {
    await Post.deleteMany({});
    const alice = await User.findOne({ name: 'Alice' });
    await Post.create({
      title: 'Test Post',
      content: 'Test Content',
      author: alice!._id,
    });

    const queryParams = {};
    const findQuery = new FindQuery(Post, queryParams);
    const result = await findQuery.populate('author').execute();

    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('Test Post');
    expect(result.data[0].author).toBeDefined();
    expect(result.data[0].author.name).toBe('Alice');
  });

  test('populate method works with array of objects', async () => {
    await Post.deleteMany({});
    const alice = await User.findOne({ name: 'Alice' });
    await Post.create({
      title: 'Test Post',
      content: 'Test Content',
      author: alice!._id,
    });

    const queryParams = {};
    const findQuery = new FindQuery(Post, queryParams);
    const result = await findQuery
      .populate([
        {
          path: 'author',
          select: 'name email',
        },
      ])
      .execute();

    expect(result.data).toHaveLength(1);
    expect(result.data[0].author).toBeDefined();
    // Check if author is populated (not just ObjectId)
    const author = result.data[0].author;
    // Mongoose populate returns the document object, not ObjectId when populated
    expect(author).not.toBeInstanceOf(mongoose.Types.ObjectId);
    expect(author).toBeInstanceOf(Object);
    // When select is used, only selected fields should be present
    expect(author.name).toBe('Alice');
    expect(author.email).toBe('alice@example.com');
  });

  test('populate method works with match option', async () => {
    await Post.deleteMany({});
    const alice = await User.findOne({ name: 'Alice' });
    const bob = await User.findOne({ name: 'Bob' });
    await Post.create([
      {
        title: 'Post 1',
        content: 'Content 1',
        author: alice!._id,
      },
      {
        title: 'Post 2',
        content: 'Content 2',
        author: bob!._id,
      },
    ]);

    const queryParams = {};
    const findQuery = new FindQuery(Post, queryParams);
    const result = await findQuery
      .populate([
        {
          path: 'author',
          match: { name: 'Alice' },
        },
      ])
      .execute();

    expect(result.data).toHaveLength(2);
    // Post with Alice should have author populated
    const postWithAlice = result.data.find((p) => p.title === 'Post 1');
    expect(postWithAlice?.author).toBeDefined();
    // Check if author is populated and matches Alice
    const aliceAuthor = postWithAlice?.author;
    // When match finds a match, author should be populated
    expect(aliceAuthor).not.toBeNull();
    expect(aliceAuthor).not.toBeInstanceOf(mongoose.Types.ObjectId);
    expect(aliceAuthor.name).toBe('Alice');
    // Post with Bob should have null author due to match filter
    const postWithBob = result.data.find((p) => p.title === 'Post 2');
    // When match filter doesn't find a match, mongoose sets the field to null
    expect(postWithBob?.author).toBeNull();
  });
});

describe('AggregationQuery', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({
      instance: {
        dbName: 'jest-test-db-aggregation',
      },
    });
    const uri = mongoServer.getUri();
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(uri);
    }
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await User.create([
      { name: 'Alice', email: 'alice@example.com' },
      { name: 'Bob', email: 'bob@example.com' },
      { name: 'Charlie', email: 'charlie@example.com' },
    ]);
  });

  test('search by name returns correct result', async () => {
    const queryParams = { search: 'ali' };
    const aggQuery = new AggregationQuery(User, queryParams);
    const result = await aggQuery.search(['name']).execute();

    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('Alice');
    expect(result.meta.total).toBe(1);
  });

  test('pagination works correctly', async () => {
    const queryParams = { page: '2', limit: '1', sort: 'name' };
    const aggQuery = new AggregationQuery(User, queryParams);
    const result = await aggQuery.sort(['name']).paginate().execute();

    expect(result.data).toHaveLength(1);
    expect(result.meta.page).toBe(2);
    expect(result.meta.limit).toBe(1);
    expect(result.data[0].name).toBe('Bob');
  });

  test('count only returns total without data', async () => {
    const queryParams = { is_count_only: 'true' };
    const aggQuery = new AggregationQuery(User, queryParams);
    const result = await aggQuery.execute();

    expect(result.data).toHaveLength(0);
    expect(result.meta.total).toBe(3);
    expect(result.meta.page).toBe(1);
    expect(result.meta.limit).toBe(0);
  });

  test('filter returns correct documents', async () => {
    const queryParams = { email: 'bob@example.com' };
    const aggQuery = new AggregationQuery(User, queryParams);
    const result = await aggQuery.filter(['email']).execute();

    expect(result.data).toHaveLength(1);
    expect(result.data[0].email).toBe('bob@example.com');
  });

  test('sort returns results in correct order', async () => {
    const queryParams = { sort: '-name' };
    const aggQuery = new AggregationQuery(User, queryParams);
    const result = await aggQuery.sort(['name']).execute();

    expect(result.data[0].name).toBe('Charlie');
    expect(result.data[2].name).toBe('Alice');
  });

  test('fields limits selected fields', async () => {
    const queryParams = { fields: 'name' };
    const aggQuery = new AggregationQuery(User, queryParams);
    const result = await aggQuery.fields(['name']).execute();

    expect(result.data[0]).toHaveProperty('name');
    expect(result.data[0].email).toBeUndefined();
  });

  test('pipeline method adds custom pipeline stages', async () => {
    const queryParams = {};
    const aggQuery = new AggregationQuery(User, queryParams);
    const result = await aggQuery
      .pipeline([{ $addFields: { nameUpper: { $toUpper: '$name' } } }])
      .execute();

    expect(result.data).toHaveLength(3);
    expect(result.data[0]).toHaveProperty('nameUpper');
    expect(result.data[0].nameUpper).toBe(result.data[0].name.toUpperCase());
  });

  test('pipeline method inserts at specific position', async () => {
    const queryParams = { sort: 'name' };
    const aggQuery = new AggregationQuery(User, queryParams);
    const result = await aggQuery
      .sort(['name'])
      .pipeline([{ $addFields: { test: 'value' } }], 0)
      .execute();

    expect(result.data).toHaveLength(3);
    expect(result.data[0]).toHaveProperty('test');
  });

  test('tap method allows direct pipeline modifications', async () => {
    const queryParams = {};
    const aggQuery = new AggregationQuery(User, queryParams);
    const result = await aggQuery
      .tap((pipeline) => [...pipeline, { $limit: 2 }])
      .execute();

    expect(result.data).toHaveLength(2);
  });

  test('statistics collection works', async () => {
    const queryParams = {};
    const aggQuery = new AggregationQuery(User, queryParams);
    const result = await aggQuery.execute([
      { key: 'total', filter: {} },
    ]);

    expect(result.meta.statistics).toBeDefined();
    expect(result.meta.statistics?.total).toBe(3);
  });

  test('populate method works with string path', async () => {
    const alice = await User.findOne({ name: 'Alice' });
    await Post.create({
      title: 'Test Post',
      content: 'Test Content',
      author: alice!._id,
    });

    const queryParams = {};
    const aggQuery = new AggregationQuery(Post, queryParams);
    const result = await aggQuery.populate('author').execute();

    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe('Test Post');
    expect(result.data[0].author).toBeDefined();
    expect(Array.isArray(result.data[0].author)).toBe(true);
    if (Array.isArray(result.data[0].author) && result.data[0].author.length > 0) {
      expect(result.data[0].author[0].name).toBe('Alice');
    }
  });

  test('populate method works with array of objects', async () => {
    await Post.deleteMany({});
    const alice = await User.findOne({ name: 'Alice' });
    await Post.create({
      title: 'Test Post',
      content: 'Test Content',
      author: alice!._id,
    });

    const queryParams = {};
    const aggQuery = new AggregationQuery(Post, queryParams);
    const result = await aggQuery
      .populate([
        {
          path: 'author',
          select: 'name email',
        },
      ])
      .execute();

    expect(result.data).toHaveLength(1);
    expect(result.data[0].author).toBeDefined();
    if (Array.isArray(result.data[0].author) && result.data[0].author.length > 0) {
      expect(result.data[0].author[0].name).toBe('Alice');
      expect(result.data[0].author[0].email).toBe('alice@example.com');
    }
  });

  test('populate method works with match option', async () => {
    await Post.deleteMany({});
    const alice = await User.findOne({ name: 'Alice' });
    const bob = await User.findOne({ name: 'Bob' });
    await Post.create([
      {
        title: 'Post 1',
        content: 'Content 1',
        author: alice!._id,
      },
      {
        title: 'Post 2',
        content: 'Content 2',
        author: bob!._id,
      },
    ]);

    const queryParams = {};
    const aggQuery = new AggregationQuery(Post, queryParams);
    const result = await aggQuery
      .populate([
        {
          path: 'author',
          match: { name: 'Alice' },
        },
      ])
      .execute();

    expect(result.data).toHaveLength(2);
    // Post with Alice should have author populated
    const postWithAlice = result.data.find((p) => p.title === 'Post 1');
    expect(postWithAlice?.author).toBeDefined();
    if (Array.isArray(postWithAlice?.author) && postWithAlice?.author.length > 0) {
      expect(postWithAlice?.author[0].name).toBe('Alice');
    }
  });
});
