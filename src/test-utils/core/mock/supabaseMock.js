/**
 * Mock implementation of Supabase client for testing
 * This provides a fake Supabase client that can be used in tests without
 * requiring a real connection to Supabase.
 */

// In-memory storage for mocked data
const mockStorage = {
  users: [],
  transactions: [],
  subscriptions: [],
  settings: [],
  // Add other tables as needed
};

/**
 * Creates a mock of the Supabase client
 * @returns {Object} Mock Supabase client
 */
function createSupabaseMock() {
  // Base query builder that all table methods will return
  const createQueryBuilder = (tableName) => {
    // Keep track of the current query state
    const state = {
      table: tableName,
      filters: [],
      selectedFields: '*',
      singleRecord: false,
      orderBy: null,
      limitCount: null,
      data: null,
    };
    
    // Helper to get filtered data based on current state
    const getFilteredData = () => {
      let result = [...(mockStorage[tableName] || [])];
      
      // Apply filters
      state.filters.forEach(filter => {
        result = result.filter(filter);
      });
      
      // Apply ordering
      if (state.orderBy) {
        const { column, ascending } = state.orderBy;
        result.sort((a, b) => {
          const valueA = a[column];
          const valueB = b[column];
          if (ascending) {
            return valueA > valueB ? 1 : -1;
          } else {
            return valueA < valueB ? 1 : -1;
          }
        });
      }
      
      // Apply limit
      if (state.limitCount !== null) {
        result = result.slice(0, state.limitCount);
      }
      
      return result;
    };
    
    // The query builder object with chainable methods
    const builder = {
      // Filtering methods
      eq(column, value) {
        state.filters.push(record => record[column] === value);
        return builder;
      },
      
      neq(column, value) {
        state.filters.push(record => record[column] !== value);
        return builder;
      },
      
      gt(column, value) {
        state.filters.push(record => record[column] > value);
        return builder;
      },
      
      gte(column, value) {
        state.filters.push(record => record[column] >= value);
        return builder;
      },
      
      lt(column, value) {
        state.filters.push(record => record[column] < value);
        return builder;
      },
      
      lte(column, value) {
        state.filters.push(record => record[column] <= value);
        return builder;
      },
      
      like(column, pattern) {
        const regex = new RegExp(pattern.replace(/%/g, '.*'));
        state.filters.push(record => regex.test(record[column]));
        return builder;
      },
      
      in(column, values) {
        state.filters.push(record => values.includes(record[column]));
        return builder;
      },
      
      is(column, value) {
        if (value === null) {
          state.filters.push(record => record[column] === null);
        } else {
          state.filters.push(record => record[column] === value);
        }
        return builder;
      },
      
      // Selection methods
      select(fields) {
        state.selectedFields = fields;
        return builder;
      },
      
      single() {
        state.singleRecord = true;
        return builder;
      },
      
      // Ordering and limiting
      order(column, { ascending = true } = {}) {
        state.orderBy = { column, ascending };
        return builder;
      },
      
      limit(count) {
        state.limitCount = count;
        return builder;
      },
      
      // Data mutation methods
      insert(data) {
        state.data = Array.isArray(data) ? data : [data];
        
        // Make sure the table exists in our mock storage
        if (!mockStorage[tableName]) {
          mockStorage[tableName] = [];
        }
        
        // Generate IDs if needed and add timestamps
        const now = new Date().toISOString();
        const newRecords = state.data.map(record => ({
          id: record.id || Math.random().toString(36).substring(2, 15),
          created_at: record.created_at || now,
          ...record
        }));
        
        // Add to storage
        mockStorage[tableName].push(...newRecords);
        
        return {
          data: newRecords,
          error: null
        };
      },
      
      update(data) {
        const filtered = getFilteredData();
        
        // Apply updates to filtered records
        filtered.forEach(record => {
          Object.assign(record, data, {
            updated_at: new Date().toISOString()
          });
        });
        
        return {
          data: filtered,
          error: null
        };
      },
      
      delete() {
        const filtered = getFilteredData();
        
        // Remove filtered records from storage
        filtered.forEach(record => {
          const index = mockStorage[tableName].findIndex(r => r.id === record.id);
          if (index !== -1) {
            mockStorage[tableName].splice(index, 1);
          }
        });
        
        return {
          data: filtered,
          error: null
        };
      },
      
      // Execute query and return results
      async then(resolve) {
        const result = {
          data: getFilteredData(),
          error: null
        };
        
        // If single record mode, return only the first item
        if (state.singleRecord) {
          result.data = result.data.length > 0 ? result.data[0] : null;
        }
        
        resolve(result);
        return result;
      }
    };
    
    return builder;
  };
  
  // The mock Supabase client
  return {
    // Auth methods
    auth: {
      signIn: jest.fn().mockResolvedValue({ user: { id: 'mock-user-id' }, error: null }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
      session: jest.fn().mockReturnValue({ user: { id: 'mock-user-id' } }),
      user: jest.fn().mockReturnValue({ id: 'mock-user-id' }),
      onAuthStateChange: jest.fn(),
    },
    
    // Storage methods
    storage: {
      from: (bucket) => ({
        upload: jest.fn().mockResolvedValue({ data: { Key: 'mock-file-key' }, error: null }),
        download: jest.fn().mockResolvedValue({ data: Buffer.from('mock-file-data'), error: null }),
        remove: jest.fn().mockResolvedValue({ error: null }),
        list: jest.fn().mockResolvedValue({ data: [], error: null }),
        getPublicUrl: jest.fn().mockReturnValue({ publicURL: 'https://mock-storage-url.com/mock-file-key' }),
      }),
    },
    
    // Table access methods
    from: (tableName) => createQueryBuilder(tableName),
    
    // RPC method for calling stored procedures
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  };
}

// Helper to reset all mock data
function resetMockStorage() {
  Object.keys(mockStorage).forEach(key => {
    mockStorage[key] = [];
  });
}

// Helper to add test data
function seedMockData(table, data) {
  if (!mockStorage[table]) {
    mockStorage[table] = [];
  }
  
  mockStorage[table] = Array.isArray(data) ? [...data] : [data];
}

// Export the mock creator and helpers
module.exports = {
  createSupabaseMock,
  resetMockStorage,
  seedMockData,
  mockStorage
}; 