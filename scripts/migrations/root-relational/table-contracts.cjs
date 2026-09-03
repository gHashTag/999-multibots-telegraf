'use strict'

/**
 * Policy-critical relational contracts for the first root migration wave.
 *
 * These are deliberately not a reconstructed full schema dump. The complete
 * source and destination catalog descriptions arrive in the JSON manifest and
 * are fingerprinted by the classifier. This file names only the columns and
 * constraints whose omission would change identity, money, ownership, or
 * primary-key semantics.
 */
const TABLE_CONTRACTS = {
  users: {
    primaryKey: ['id'],
    primaryKeyState: {
      deferrable: false,
      initiallyDeferred: false,
      validated: true,
    },
    requiredColumns: {
      id: { type: 'uuid', nullable: false },
      user_id: { type: 'uuid', nullable: false },
      inviter: { type: 'uuid', nullable: true },
    },
    alternateKeys: [
      {
        name: 'users_user_id_key',
        columns: ['user_id'],
        skipIfAnyNull: false,
        nullsDistinct: true,
        deferrable: false,
        initiallyDeferred: false,
        validated: true,
      },
    ],
    requiredForeignKeys: [
      {
        name: 'users_inviter_fkey',
        columns: ['inviter'],
        referencedTable: 'users',
        referencedColumns: ['user_id'],
        onUpdate: 'NO ACTION',
        onDelete: 'NO ACTION',
        deferrable: false,
        initiallyDeferred: false,
        validated: true,
      },
    ],
    ownerLinks: [
      {
        name: 'users_inviter_owner_link',
        columns: ['inviter'],
        referencedColumns: ['user_id'],
        skipIfAnyNull: true,
      },
    ],
    opaqueOwnerColumns: [],
    externalReferences: null,
    sequence: null,
    criticalConflicts: true,
  },
  payments_v2: {
    primaryKey: ['id'],
    primaryKeyState: {
      deferrable: false,
      initiallyDeferred: false,
      validated: true,
    },
    requiredColumns: {
      id: { type: 'integer', nullable: false },
      inv_id: { type: 'character varying(100)', nullable: true },
      stars: { type: 'numeric(12,2)', nullable: false },
    },
    alternateKeys: [
      {
        name: 'payments_v2_inv_id_key',
        columns: ['inv_id'],
        skipIfAnyNull: true,
        nullsDistinct: true,
        deferrable: false,
        initiallyDeferred: false,
        validated: true,
      },
    ],
    requiredForeignKeys: [],
    ownerLinks: [],
    opaqueOwnerColumns: [],
    externalReferences: null,
    sequence: {
      name: 'payments_v2_id_seq',
      column: 'id',
      increment: '1',
      cycle: false,
    },
    criticalConflicts: true,
  },
  assets: {
    primaryKey: ['id'],
    primaryKeyState: {
      deferrable: false,
      initiallyDeferred: false,
      validated: true,
    },
    requiredColumns: {
      id: { type: 'integer', nullable: false },
      storage_path: { type: 'text', nullable: false },
    },
    // storage_path is intentionally not unique in historical data.
    alternateKeys: [],
    requiredForeignKeys: [],
    ownerLinks: [],
    opaqueOwnerColumns: [],
    externalReferences: null,
    sequence: {
      name: 'assets_id_seq',
      column: 'id',
      increment: '1',
      cycle: false,
    },
    criticalConflicts: false,
  },
  jobs: {
    primaryKey: ['id'],
    primaryKeyState: {
      deferrable: false,
      initiallyDeferred: false,
      validated: true,
    },
    requiredColumns: {
      id: { type: 'text', nullable: false },
      template_id: { type: 'text', nullable: true },
      user_id: { type: 'text', nullable: false },
    },
    alternateKeys: [],
    requiredForeignKeys: [
      {
        name: 'jobs_template_id_fkey',
        columns: ['template_id'],
        referencedTable: 'templates',
        referencedColumns: ['id'],
        onUpdate: 'NO ACTION',
        onDelete: 'NO ACTION',
        deferrable: false,
        initiallyDeferred: false,
        validated: true,
      },
    ],
    ownerLinks: [],
    // Current producers do not establish a users FK for jobs.user_id.
    opaqueOwnerColumns: ['user_id'],
    externalReferences: {
      name: 'templates',
      column: 'template_id',
    },
    sequence: null,
    criticalConflicts: false,
  },
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const nested of Object.values(value)) deepFreeze(nested)
  }
  return value
}

deepFreeze(TABLE_CONTRACTS)

function getTableContract(table) {
  return Object.hasOwn(TABLE_CONTRACTS, table) ? TABLE_CONTRACTS[table] : null
}

module.exports = {
  TABLE_CONTRACTS,
  getTableContract,
}
