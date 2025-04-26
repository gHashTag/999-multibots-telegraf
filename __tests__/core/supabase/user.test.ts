import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createUser } from '@/core/supabase/createUser' // Use alias, corrected path
import { supabase } from '@/core/supabase' // Use alias for dependency
import type { User } from '@/interfaces/user.interface' // Corrected path for User type
import type { CreateUserData } from '@/interfaces/supabase.interface' // Import CreateUserData

// Define a type for the returned mocks for easier access
type SupabaseMocks = {
  mockFrom: ReturnType<typeof vi.fn>
  mockSelect: ReturnType<typeof vi.fn>
  mockInsert: ReturnType<typeof vi.fn>
  mockUpdate: ReturnType<typeof vi.fn>
  mockEq: ReturnType<typeof vi.fn>
  mockMaybeSingle: ReturnType<typeof vi.fn>
  mockSingle: ReturnType<typeof vi.fn>
  mockRpc: ReturnType<typeof vi.fn>
}

// Store the mocks returned by the factory
let internalMocks: SupabaseMocks

// Mock ONLY the supabase client dependency using alias
vi.mock('@/core/supabase', () => {
  // 1. Initialize ALL mock function variables *INSIDE* the factory
  const eq = vi.fn()
  const maybeSingle = vi.fn()
  const single = vi.fn()
  const select = vi.fn()
  const insert = vi.fn() // Revert: Insert returns an object with select
  const update = vi.fn()
  const rpc = vi.fn()

  // 2. Implement the mocks using these *local* variables
  select.mockImplementation(() => ({ eq: eq }))
  // Revert: insert should return the chain
  insert.mockImplementation(() => ({
    select: vi.fn().mockReturnValue({
      // Mock select after insert
      single: single, // Mock single after insert->select
      maybeSingle: maybeSingle, // Mock maybeSingle after insert->select
    }),
  }))
  update.mockImplementation(() => ({ eq: eq })) // Update still returns a chain
  // from should return appropriate chains
  const from = vi.fn().mockImplementation((tableName: string) => {
    if (tableName === 'users') {
      return {
        select: select,
        insert: insert, // Pass the mock insert function
        update: update,
      }
    }
    return {} // Default empty object for other tables if needed
  })
  eq.mockImplementation(() => ({
    maybeSingle: maybeSingle,
    single: single,
  }))

  // 3. Store the mocks in an object to be returned and accessed later
  const mocks: SupabaseMocks = {
    mockFrom: from,
    mockSelect: select,
    mockInsert: insert,
    mockUpdate: update,
    mockEq: eq,
    mockMaybeSingle: maybeSingle,
    mockSingle: single,
    mockRpc: rpc,
  }

  // 4. Return the external interface and the internal mocks
  return {
    supabase: {
      from: from,
      rpc: rpc,
    },
    __mocks: mocks, // Expose mocks here
  }
})

// Helper to reset mocks more easily
const resetSupabaseMocks = () => {
  if (!internalMocks) return // Guard clause if mocks aren't initialized yet

  // Clear all mocks using the stored references
  internalMocks.mockFrom?.mockClear()
  internalMocks.mockSelect?.mockClear()
  internalMocks.mockInsert?.mockClear() // Clear insert
  internalMocks.mockUpdate?.mockClear()
  internalMocks.mockEq?.mockClear()
  internalMocks.mockMaybeSingle?.mockClear()
  internalMocks.mockSingle?.mockClear()
  internalMocks.mockRpc?.mockClear()

  // Re-implement basic chaining logic (excluding insert)
  if (internalMocks.mockEq)
    internalMocks.mockEq.mockImplementation(() => ({
      maybeSingle: internalMocks.mockMaybeSingle,
      single: internalMocks.mockSingle,
    }))
  if (internalMocks.mockSelect)
    internalMocks.mockSelect.mockImplementation(() => ({
      eq: internalMocks.mockEq,
    }))
  if (internalMocks.mockUpdate)
    internalMocks.mockUpdate.mockImplementation(() => ({
      eq: internalMocks.mockEq, // Assuming update chain ends with eq
    }))
  // Reset from to return the structure with the (re-implemented) chain mocks
  if (internalMocks.mockFrom) {
    internalMocks.mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'users') {
        return {
          select: internalMocks.mockSelect,
          insert: internalMocks.mockInsert, // Pass the cleared insert mock
          update: internalMocks.mockUpdate,
        }
      }
      return {}
    })
  }
}

// Import the mocks exposed by the factory AFTER vi.mock runs
// Need to dynamically import or handle this differently
// Let's try accessing them directly in beforeEach or tests

describe('createUser', () => {
  // Reset mocks before each test
  beforeEach(async () => {
    // Dynamically import the mocked module to get access to __mocks
    const mockedSupabase = await import('@/core/supabase')
    internalMocks = (mockedSupabase as any).__mocks as SupabaseMocks
    resetSupabaseMocks()
    // Default setup: Assume RPC succeeds
    internalMocks.mockRpc.mockResolvedValue({ data: null, error: null })
  })

  it('should create a new user if they do not exist', async () => {
    // Data matching CreateUserData
    const userData: CreateUserData = {
      telegram_id: '12345',
      username: 'testuser',
      first_name: 'Test',
      last_name: 'User',
      is_bot: false,
      language_code: 'en',
      photo_url: 'http://photo.url',
      chat_id: 54321,
      mode: 'clean',
      model: 'gpt-4-turbo',
      count: 0,
      aspect_ratio: '9:16',
      inviter: null,
      bot_name: 'test_bot',
    }

    // Expected result matching User interface
    const createdUserMock: User = {
      id: 'new-uuid-123',
      telegram_id: '12345',
      username: 'testuser',
      first_name: 'Test',
      last_name: 'User',
      bot_name: 'test_bot',
      created_at: new Date().toISOString(),
    }

    // 1. Mock the initial check (user not found)
    internalMocks.mockMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    })

    // 2. Mock the insert operation (returns the created user)
    internalMocks.mockSingle.mockResolvedValueOnce({
      data: { ...createdUserMock },
      error: null,
    })

    // --- Call the function ---
    const [wasCreated, resultUser] = await createUser(userData, null as any)

    // --- Assertions ---
    expect(wasCreated).toBe(true)
    expect(resultUser).toEqual(expect.objectContaining(createdUserMock))

    // --- Check mocks --- using internalMocks
    expect(internalMocks.mockFrom).toHaveBeenCalledWith('users')
    expect(internalMocks.mockSelect).toHaveBeenCalledWith('*')
    expect(internalMocks.mockEq).toHaveBeenCalledWith('telegram_id', '12345')
    expect(internalMocks.mockMaybeSingle).toHaveBeenCalledTimes(1)

    // More detailed check for mockInsert arguments
    expect(internalMocks.mockInsert).toHaveBeenCalledTimes(1)
    const insertSelectMock =
      internalMocks.mockInsert.mock.results[0].value.select // Get the select mock returned by insert
    expect(insertSelectMock).toHaveBeenCalledTimes(1) // select called after insert
    const insertSingleMock = insertSelectMock.mock.results[0].value.single // Get the single mock returned by select
    expect(insertSingleMock).toHaveBeenCalledTimes(1) // single called after insert->select
    expect(internalMocks.mockSingle).toHaveBeenCalledTimes(1) // Total calls to the *shared* single mock

    expect(internalMocks.mockRpc).not.toHaveBeenCalled() // Explicitly check it's NOT called
    expect(internalMocks.mockUpdate).not.toHaveBeenCalled()
  })

  it('should return existing user if they exist and update data if changed', async () => {
    const existingUserData: User = {
      id: 'existing-uuid',
      telegram_id: '54321',
      username: 'olduser',
      first_name: 'Old',
      last_name: 'Name',
      bot_name: 'test_bot',
      language: 'en',
      is_ru: false,
      level: 1,
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date(Date.now() - 86400000).toISOString(),
    }
    const incomingUserData: CreateUserData = {
      telegram_id: '54321',
      username: 'newuser',
      first_name: 'New',
      last_name: 'Name',
      is_bot: false,
      language_code: 'ru',
      photo_url: 'new_photo.url',
      chat_id: 22222,
      mode: 'creative',
      model: 'gpt-4-turbo',
      count: 0,
      aspect_ratio: '16:9',
      inviter: null,
      bot_name: 'test_bot',
    }
    const expectedUpdatePayload = {
      username: 'newuser',
      first_name: 'New',
      language_code: 'ru',
    }

    // Mock find returns existing user
    internalMocks.mockMaybeSingle.mockResolvedValueOnce({
      data: { ...existingUserData, language_code: 'en' },
      error: null,
    })
    // Mock the eq call after update (no specific return needed)
    // Re-implementation happens in resetSupabaseMocks

    const [wasCreated, resultUser] = await createUser(
      incomingUserData,
      null as any
    )

    expect(wasCreated).toBe(false)
    // Expect result to contain existing data *plus* the updates
    expect(resultUser).toEqual(
      expect.objectContaining({
        ...existingUserData,
        username: 'newuser',
        first_name: 'New',
        // language_code is not part of User interface directly
      })
    )
    expect(internalMocks.mockFrom).toHaveBeenCalledTimes(2) // Once for find, once for update
    expect(internalMocks.mockSelect).toHaveBeenCalledWith('*') // For find
    expect(internalMocks.mockEq).toHaveBeenCalledWith('telegram_id', '54321') // Find
    expect(internalMocks.mockMaybeSingle).toHaveBeenCalledTimes(1)
    expect(internalMocks.mockUpdate).toHaveBeenCalledWith(expectedUpdatePayload)
    expect(internalMocks.mockEq).toHaveBeenCalledWith('telegram_id', '54321') // Update
    expect(internalMocks.mockEq).toHaveBeenCalledTimes(2) // Once for find, once for update
    expect(internalMocks.mockInsert).not.toHaveBeenCalled()
    expect(internalMocks.mockRpc).not.toHaveBeenCalled()
  })

  it('should return existing user if they exist and not update if data is same', async () => {
    const existingUserData: User = {
      id: 'existing-uuid-2',
      telegram_id: '67890',
      username: 'sameuser',
      first_name: 'Same',
      last_name: 'User',
      bot_name: 'test_bot',
      language: 'en',
      is_ru: false,
      level: 0,
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date(Date.now() - 86400000).toISOString(),
    }
    const incomingUserData: CreateUserData = {
      telegram_id: '67890',
      username: 'sameuser',
      first_name: 'Same',
      last_name: 'User',
      is_bot: false,
      language_code: 'en',
      photo_url: 'another_photo.url',
      chat_id: 44444,
      mode: 'creative',
      model: 'gpt-4-turbo',
      count: 0,
      aspect_ratio: '16:9',
      inviter: null,
      bot_name: 'test_bot',
    }

    internalMocks.mockMaybeSingle.mockResolvedValueOnce({
      data: { ...existingUserData, language_code: 'en' },
      error: null,
    })

    const [wasCreated, resultUser] = await createUser(
      incomingUserData,
      null as any
    )

    expect(wasCreated).toBe(false)
    expect(resultUser).toEqual(expect.objectContaining(existingUserData))
    expect(internalMocks.mockMaybeSingle).toHaveBeenCalledTimes(1)
    expect(internalMocks.mockUpdate).not.toHaveBeenCalled()
    expect(internalMocks.mockInsert).not.toHaveBeenCalled()
    expect(internalMocks.mockRpc).not.toHaveBeenCalled()
  })

  it('should handle error during user find', async () => {
    const userData: Partial<CreateUserData> = { telegram_id: 'err-find' }
    const findError = new Error('Find failed')

    // Mock maybeSingle to return an error object in the result
    internalMocks.mockMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: findError,
    })

    // Expect the createUser function itself not to throw, but return nulls because it catches the error
    const [wasCreated, resultUser] = await createUser(
      userData as CreateUserData,
      null as any
    )

    expect(wasCreated).toBe(false)
    expect(resultUser).toBeNull()
    // Verify mocks were called as expected before the error
    expect(internalMocks.mockMaybeSingle).toHaveBeenCalledTimes(1)
    expect(internalMocks.mockUpdate).not.toHaveBeenCalled()
    expect(internalMocks.mockInsert).not.toHaveBeenCalled()
    expect(internalMocks.mockRpc).not.toHaveBeenCalled()
  })

  it('should handle error during user creation (not race condition)', async () => {
    const userData: CreateUserData = {
      telegram_id: 'err-create',
    } as CreateUserData
    const createError = new Error('Insert failed')
    ;(createError as any).code = 'SOME_OTHER_CODE' // Important: Not 23505

    internalMocks.mockMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    })
    internalMocks.mockSingle.mockRejectedValueOnce(createError) // Mock insert failure

    // Expect the createUser function to catch the insert error and return nulls
    const [wasCreated, resultUser] = await createUser(userData, null as any)

    expect(wasCreated).toBe(false)
    expect(resultUser).toBeNull()
    // Verify mocks up to the point of failure
    expect(internalMocks.mockMaybeSingle).toHaveBeenCalledTimes(1)
    expect(internalMocks.mockInsert).toHaveBeenCalledTimes(1)
    expect(internalMocks.mockSingle).toHaveBeenCalledTimes(1) // From insert attempt
    expect(internalMocks.mockUpdate).not.toHaveBeenCalled()
    expect(internalMocks.mockRpc).not.toHaveBeenCalled() // No RPC call if insert failed
  })

  it('should handle race condition during user creation (23505 error)', async () => {
    const userData: CreateUserData = {
      telegram_id: 'err-race',
    } as CreateUserData
    const createError = new Error(
      'duplicate key value violates unique constraint'
    )
    ;(createError as any).code = '23505' // Simulate race condition error
    const raceFoundUser: User = {
      id: 'race-uuid',
      telegram_id: 'err-race',
      bot_name: 'test_bot',
      username: 'raceuser',
      first_name: 'Race',
      last_name: 'Cond',
      created_at: new Date().toISOString(),
    }

    // 1. Initial find: not found
    internalMocks.mockMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    })
    // 2. Mock the insert(...).select().single() chain to fail with the 23505 error
    internalMocks.mockSingle // This is the single mock instance
      .mockRejectedValueOnce(createError) // First call (insert attempt) fails with 23505
      .mockResolvedValueOnce({
        // Second call (re-find attempt) succeeds
        data: { ...raceFoundUser, language_code: 'en' },
        error: null,
      })

    const [wasCreated, resultUser] = await createUser(userData, null as any)

    expect(wasCreated).toBe(false)
    expect(resultUser).toEqual(expect.objectContaining(raceFoundUser))

    // Verify mocks
    expect(internalMocks.mockMaybeSingle).toHaveBeenCalledTimes(1) // Initial find
    expect(internalMocks.mockInsert).toHaveBeenCalledTimes(1) // Attempted insert
    expect(internalMocks.mockFrom).toHaveBeenCalledWith('users')
    // Verify the insert chain structure
    const insertSelectMock =
      internalMocks.mockInsert.mock.results[0].value.select
    expect(insertSelectMock).toHaveBeenCalledTimes(1) // select called after insert
    // const insertSingleMock = insertSelectMock.mock.results[0].value.single
    // expect(insertSingleMock).toHaveBeenCalledTimes(1) // This check is problematic as 'single' mock is reused. Removed.

    // Verify the re-find call structure
    expect(internalMocks.mockSelect).toHaveBeenCalledWith('*') // Called for re-find
    expect(internalMocks.mockEq).toHaveBeenCalledWith('telegram_id', 'err-race') // Called for re-find
    // Verify the total calls to the single mock function
    expect(internalMocks.mockSingle).toHaveBeenCalledTimes(2) // Once for insert (failed), once for re-find (succeeded)

    expect(internalMocks.mockUpdate).not.toHaveBeenCalled()
    expect(internalMocks.mockRpc).not.toHaveBeenCalled()
  })

  it('should handle error during user update', async () => {
    const existingUserData: User = {
      id: 'exist-upd-err',
      telegram_id: 'err-update',
      bot_name: 'test_bot',
      // Add other required User fields
      username: 'olduser',
      first_name: 'Old',
      last_name: 'Name',
      created_at: new Date().toISOString(),
    }
    const incomingUserData: CreateUserData = {
      telegram_id: 'err-update',
      username: 'new-username', // Change that triggers update
    } as CreateUserData
    const updateError = new Error('Update failed')

    internalMocks.mockMaybeSingle.mockResolvedValueOnce({
      data: { ...existingUserData, language_code: 'en' },
      error: null,
    })
    // Mock the update chain to throw an error.
    const failingEqMock = vi.fn().mockImplementation(() => {
      throw updateError
    })
    internalMocks.mockUpdate.mockImplementationOnce(() => ({
      eq: failingEqMock,
    }))

    // Expect createUser to catch the update error and return the original user data
    const [wasCreated, resultUser] = await createUser(
      incomingUserData,
      null as any
    )

    expect(wasCreated).toBe(false)
    expect(resultUser).toEqual(expect.objectContaining(existingUserData)) // Return original user on update error
    // Verify mocks
    expect(internalMocks.mockMaybeSingle).toHaveBeenCalledTimes(1)
    expect(internalMocks.mockUpdate).toHaveBeenCalledTimes(1) // Called but threw error
    // `eq` after update might not be called if update throws early
    expect(failingEqMock).toHaveBeenCalledTimes(1) // Check the mock that throws
    expect(internalMocks.mockEq).toHaveBeenCalledTimes(1) // Only for the initial find
    expect(internalMocks.mockInsert).not.toHaveBeenCalled()
    expect(internalMocks.mockRpc).not.toHaveBeenCalled()
  })
})
