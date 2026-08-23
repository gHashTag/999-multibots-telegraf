import { useState, useCallback, useMemo } from 'react'
import {
  Folder,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Edit3,
  Trash2,
  Plus,
  X,
} from 'lucide-react'
import { useLanguage } from '@/hooks/useLanguage'
import { BRAND_COLORS, STATUS_COLORS } from '@vibee/atoms'
import './AssetCollections.css'

export interface Collection {
  id: string
  name: string
  color?: string
  assetIds: string[]
  parentId?: string
  createdAt: number
}

interface AssetCollectionsProps {
  collections: Collection[]
  activeCollectionId: string | null
  onSelectCollection: (id: string | null) => void
  onCreateCollection: (name: string, parentId?: string) => void
  onRenameCollection: (id: string, name: string) => void
  onDeleteCollection: (id: string) => void
  onAddToCollection: (collectionId: string, assetIds: string[]) => void
  onRemoveFromCollection: (collectionId: string, assetIds: string[]) => void
}

export function AssetCollections({
  collections,
  activeCollectionId,
  onSelectCollection,
  onCreateCollection,
  onRenameCollection,
  onDeleteCollection,
}: AssetCollectionsProps) {
  const { t } = useLanguage()
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [isCreating, setIsCreating] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  // Build tree structure
  const rootCollections = useMemo(() => {
    return collections.filter(c => !c.parentId)
  }, [collections])

  const getChildren = useCallback(
    (parentId: string) => {
      return collections.filter(c => c.parentId === parentId)
    },
    [collections]
  )

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const handleCreateSubmit = useCallback(() => {
    if (newCollectionName.trim()) {
      onCreateCollection(newCollectionName.trim())
      setNewCollectionName('')
      setIsCreating(false)
    }
  }, [newCollectionName, onCreateCollection])

  const handleRenameSubmit = useCallback(() => {
    if (editingId && editingName.trim()) {
      onRenameCollection(editingId, editingName.trim())
      setEditingId(null)
      setEditingName('')
    }
  }, [editingId, editingName, onRenameCollection])

  const startEditing = useCallback((collection: Collection) => {
    setEditingId(collection.id)
    setEditingName(collection.name)
    setMenuOpenId(null)
  }, [])

  const handleDelete = useCallback(
    (id: string) => {
      onDeleteCollection(id)
      setMenuOpenId(null)
      if (activeCollectionId === id) {
        onSelectCollection(null)
      }
    },
    [onDeleteCollection, activeCollectionId, onSelectCollection]
  )

  const defaultColors = [
    BRAND_COLORS.amber,
    '#10b981',
    '#4dffab',
    '#8b5cf6',
    '#ec4899',
    STATUS_COLORS.error,
  ]

  const renderCollection = (collection: Collection, depth: number = 0) => {
    const children = getChildren(collection.id)
    const hasChildren = children.length > 0
    const isExpanded = expandedIds.has(collection.id)
    const isActive = activeCollectionId === collection.id
    const isEditing = editingId === collection.id
    const showMenu = menuOpenId === collection.id

    return (
      <div key={collection.id} className="collection-item-wrapper">
        <div
          className={`collection-item ${isActive ? 'active' : ''}`}
          style={{ paddingLeft: 12 + depth * 16 }}
        >
          {/* Expand toggle */}
          <button
            className="collection-item__toggle"
            onClick={() => toggleExpand(collection.id)}
            style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
          >
            {isExpanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
          </button>

          {/* Folder icon */}
          <Folder
            size={16}
            className="collection-item__icon"
            style={{ color: collection.color || BRAND_COLORS.amber }}
          />

          {/* Name (editable) */}
          {isEditing ? (
            <input
              type="text"
              className="collection-item__input"
              value={editingName}
              onChange={e => setEditingName(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={e => {
                if (e.key === 'Enter') handleRenameSubmit()
                if (e.key === 'Escape') {
                  setEditingId(null)
                  setEditingName('')
                }
              }}
              autoFocus
            />
          ) : (
            <button
              className="collection-item__name"
              onClick={() => onSelectCollection(collection.id)}
            >
              {collection.name}
              <span className="collection-item__count">
                {collection.assetIds.length}
              </span>
            </button>
          )}

          {/* Menu button */}
          <div className="collection-item__menu-wrapper">
            <button
              className="collection-item__menu-btn"
              onClick={() => setMenuOpenId(showMenu ? null : collection.id)}
            >
              <MoreHorizontal size={14} />
            </button>

            {showMenu && (
              <div className="collection-item__menu">
                <button onClick={() => startEditing(collection)}>
                  <Edit3 size={14} />
                  {t('actions.rename') || 'Rename'}
                </button>
                <button
                  onClick={() => handleDelete(collection.id)}
                  className="danger"
                >
                  <Trash2 size={14} />
                  {t('actions.delete') || 'Delete'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div className="collection-children">
            {children.map(child => renderCollection(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="asset-collections">
      {/* Header */}
      <div className="asset-collections__header">
        <span className="asset-collections__title">
          {t('assets.collections') || 'Collections'}
        </span>
        <button
          className="asset-collections__add-btn"
          onClick={() => setIsCreating(true)}
          title={t('assets.newCollection') || 'New Collection'}
        >
          <FolderPlus size={16} />
        </button>
      </div>

      {/* "All Assets" option */}
      <button
        className={`collection-item collection-item--all ${
          activeCollectionId === null ? 'active' : ''
        }`}
        onClick={() => onSelectCollection(null)}
      >
        <Folder size={16} className="collection-item__icon" />
        <span className="collection-item__name">
          {t('assets.allAssets') || 'All Assets'}
        </span>
      </button>

      {/* Create new collection form */}
      {isCreating && (
        <div className="collection-create">
          <input
            type="text"
            className="collection-create__input"
            value={newCollectionName}
            onChange={e => setNewCollectionName(e.target.value)}
            placeholder={t('assets.collectionName') || 'Collection name...'}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreateSubmit()
              if (e.key === 'Escape') {
                setIsCreating(false)
                setNewCollectionName('')
              }
            }}
            autoFocus
          />
          <button
            className="collection-create__btn"
            onClick={handleCreateSubmit}
          >
            <Plus size={14} />
          </button>
          <button
            className="collection-create__cancel"
            onClick={() => {
              setIsCreating(false)
              setNewCollectionName('')
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Collection list */}
      <div className="asset-collections__list">
        {rootCollections.map(collection => renderCollection(collection))}
      </div>

      {/* Empty state */}
      {collections.length === 0 && !isCreating && (
        <div className="asset-collections__empty">
          <p>{t('assets.noCollections') || 'No collections yet'}</p>
          <button onClick={() => setIsCreating(true)}>
            <FolderPlus size={14} />
            {t('assets.createFirst') || 'Create your first collection'}
          </button>
        </div>
      )}
    </div>
  )
}

// Mini collection picker for adding assets to collections
interface CollectionPickerProps {
  collections: Collection[]
  selectedIds: string[]
  onToggle: (collectionId: string) => void
  onClose: () => void
}

export function CollectionPicker({
  collections,
  selectedIds,
  onToggle,
  onClose,
}: CollectionPickerProps) {
  const { t } = useLanguage()

  return (
    <div className="collection-picker">
      <div className="collection-picker__header">
        <span>{t('assets.addToCollection') || 'Add to Collection'}</span>
        <button onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="collection-picker__list">
        {collections.map(collection => (
          <button
            key={collection.id}
            className={`collection-picker__item ${
              selectedIds.includes(collection.id) ? 'selected' : ''
            }`}
            onClick={() => onToggle(collection.id)}
          >
            <Folder
              size={14}
              style={{ color: collection.color || BRAND_COLORS.amber }}
            />
            <span>{collection.name}</span>
            {selectedIds.includes(collection.id) && (
              <span className="collection-picker__check">✓</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
