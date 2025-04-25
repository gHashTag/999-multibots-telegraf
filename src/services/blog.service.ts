import { supabase } from '@/core/supabase/client'
import { logger } from '@/utils/logger'

/**
 * Интерфейс данных блог-поста
 */
export interface BlogPost {
  id: string
  userId: string
  title: string
  content: string
  summary?: string
  imageUrl?: string
  slug?: string
  tags?: string[]
  status: 'draft' | 'published' | 'archived'
  viewCount: number
  likeCount: number
  publishedAt?: string
  createdAt: string
  updatedAt: string
  metadata?: Record<string, any>
}

/**
 * Интерфейс для операции создания блог-поста
 */
export interface CreateBlogPostParams {
  userId: string
  title: string
  content: string
  summary?: string
  imageUrl?: string
  slug?: string
  tags?: string[]
  status?: 'draft' | 'published' | 'archived'
  publishedAt?: string
  metadata?: Record<string, any>
}

/**
 * Интерфейс для операции обновления блог-поста
 */
export interface UpdateBlogPostParams {
  title?: string
  content?: string
  summary?: string
  imageUrl?: string
  slug?: string
  tags?: string[]
  status?: 'draft' | 'published' | 'archived'
  publishedAt?: string
  metadata?: Record<string, any>
}

/**
 * Интерфейс результата операции с блог-постом
 */
export interface BlogPostOperationResult {
  success: boolean
  post?: BlogPost
  error?: string
  message: string
}

/**
 * Интерфейс для опций поиска блог-постов
 */
export interface BlogPostSearchOptions {
  userId?: string
  status?: 'draft' | 'published' | 'archived'
  tag?: string
  query?: string
  limit?: number
  offset?: number
  sortBy?: 'createdAt' | 'updatedAt' | 'publishedAt' | 'viewCount' | 'likeCount'
  sortOrder?: 'asc' | 'desc'
}

/**
 * Сервис для работы с блог-постами
 */
export class BlogService {
  private tableName = 'blog_posts'

  /**
   * Создать новый блог-пост
   */
  async createPost(params: CreateBlogPostParams): Promise<BlogPostOperationResult> {
    try {
      const post = {
        userId: params.userId,
        title: params.title,
        content: params.content,
        summary: params.summary || null,
        imageUrl: params.imageUrl || null,
        slug: params.slug || this.generateSlug(params.title),
        tags: params.tags || [],
        status: params.status || 'draft',
        viewCount: 0,
        likeCount: 0,
        publishedAt: params.status === 'published' ? params.publishedAt || new Date().toISOString() : null,
        metadata: params.metadata || {}
      }

      const { data, error } = await supabase
        .from(this.tableName)
        .insert(post)
        .select()
        .single()

      if (error) {
        logger.error('Ошибка при создании блог-поста:', error)
        return {
          success: false,
          error: error.message,
          message: `Ошибка при создании блог-поста: ${error.message}`
        }
      }

      return {
        success: true,
        post: data as BlogPost,
        message: 'Блог-пост успешно создан'
      }
    } catch (error) {
      logger.error('Непредвиденная ошибка при создании блог-поста:', error)
      return {
        success: false,
        error: (error as Error).message,
        message: `Непредвиденная ошибка при создании блог-поста: ${(error as Error).message}`
      }
    }
  }

  /**
   * Получить блог-пост по ID
   */
  async getPostById(id: string): Promise<BlogPost | null> {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        logger.error('Ошибка при получении блог-поста по ID:', error)
        return null
      }

      // Инкрементируем счетчик просмотров
      await this.incrementViewCount(id)

      return data as BlogPost
    } catch (error) {
      logger.error('Непредвиденная ошибка при получении блог-поста по ID:', error)
      return null
    }
  }

  /**
   * Получить блог-пост по slug
   */
  async getPostBySlug(slug: string): Promise<BlogPost | null> {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .select('*')
        .eq('slug', slug)
        .single()

      if (error) {
        logger.error('Ошибка при получении блог-поста по slug:', error)
        return null
      }

      // Инкрементируем счетчик просмотров
      await this.incrementViewCount(data.id)

      return data as BlogPost
    } catch (error) {
      logger.error('Непредвиденная ошибка при получении блог-поста по slug:', error)
      return null
    }
  }

  /**
   * Обновить блог-пост
   */
  async updatePost(id: string, params: UpdateBlogPostParams): Promise<BlogPostOperationResult> {
    try {
      const post = await this.getPostById(id)

      if (!post) {
        return {
          success: false,
          error: 'Блог-пост не найден',
          message: 'Блог-пост с указанным ID не найден'
        }
      }

      // Если статус меняется на "published" и не указана дата публикации
      const updateData = { ...params }
      if (params.status === 'published' && !post.publishedAt && !params.publishedAt) {
        updateData.publishedAt = new Date().toISOString()
      }

      // Если изменяется заголовок и не передан slug, генерируем новый
      if (params.title && !params.slug) {
        updateData.slug = this.generateSlug(params.title)
      }

      const { data, error } = await supabase
        .from(this.tableName)
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        logger.error('Ошибка при обновлении блог-поста:', error)
        return {
          success: false,
          error: error.message,
          message: `Ошибка при обновлении блог-поста: ${error.message}`
        }
      }

      return {
        success: true,
        post: data as BlogPost,
        message: 'Блог-пост успешно обновлен'
      }
    } catch (error) {
      logger.error('Непредвиденная ошибка при обновлении блог-поста:', error)
      return {
        success: false,
        error: (error as Error).message,
        message: `Непредвиденная ошибка при обновлении блог-поста: ${(error as Error).message}`
      }
    }
  }

  /**
   * Удалить блог-пост
   */
  async deletePost(id: string): Promise<BlogPostOperationResult> {
    try {
      const post = await this.getPostById(id)

      if (!post) {
        return {
          success: false,
          error: 'Блог-пост не найден',
          message: 'Блог-пост с указанным ID не найден'
        }
      }

      const { error } = await supabase
        .from(this.tableName)
        .delete()
        .eq('id', id)

      if (error) {
        logger.error('Ошибка при удалении блог-поста:', error)
        return {
          success: false,
          error: error.message,
          message: `Ошибка при удалении блог-поста: ${error.message}`
        }
      }

      return {
        success: true,
        message: 'Блог-пост успешно удален'
      }
    } catch (error) {
      logger.error('Непредвиденная ошибка при удалении блог-поста:', error)
      return {
        success: false,
        error: (error as Error).message,
        message: `Непредвиденная ошибка при удалении блог-поста: ${(error as Error).message}`
      }
    }
  }

  /**
   * Архивировать блог-пост (альтернатива удалению)
   */
  async archivePost(id: string): Promise<BlogPostOperationResult> {
    return this.updatePost(id, { status: 'archived' })
  }

  /**
   * Опубликовать блог-пост
   */
  async publishPost(id: string): Promise<BlogPostOperationResult> {
    return this.updatePost(id, { 
      status: 'published', 
      publishedAt: new Date().toISOString() 
    })
  }

  /**
   * Перевести блог-пост в черновики
   */
  async draftPost(id: string): Promise<BlogPostOperationResult> {
    return this.updatePost(id, { status: 'draft' })
  }

  /**
   * Инкрементировать счетчик просмотров
   */
  private async incrementViewCount(id: string): Promise<void> {
    try {
      await supabase.rpc('increment_blog_post_view_count', { post_id: id })
    } catch (error) {
      logger.error('Ошибка при увеличении счетчика просмотров:', error)
    }
  }

  /**
   * Добавить или удалить лайк
   */
  async toggleLike(id: string, increment: boolean = true): Promise<BlogPostOperationResult> {
    try {
      const post = await this.getPostById(id)

      if (!post) {
        return {
          success: false,
          error: 'Блог-пост не найден',
          message: 'Блог-пост с указанным ID не найден'
        }
      }

      const newLikeCount = increment ? post.likeCount + 1 : Math.max(0, post.likeCount - 1)

      const { data, error } = await supabase
        .from(this.tableName)
        .update({ likeCount: newLikeCount })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        logger.error('Ошибка при обновлении счетчика лайков:', error)
        return {
          success: false,
          error: error.message,
          message: `Ошибка при обновлении счетчика лайков: ${error.message}`
        }
      }

      return {
        success: true,
        post: data as BlogPost,
        message: increment ? 'Лайк добавлен' : 'Лайк удален'
      }
    } catch (error) {
      logger.error('Непредвиденная ошибка при обновлении счетчика лайков:', error)
      return {
        success: false,
        error: (error as Error).message,
        message: `Непредвиденная ошибка при обновлении счетчика лайков: ${(error as Error).message}`
      }
    }
  }

  /**
   * Получить список блог-постов с фильтрацией и сортировкой
   */
  async getPosts(options: BlogPostSearchOptions = {}): Promise<BlogPost[]> {
    try {
      let query = supabase
        .from(this.tableName)
        .select('*')

      // Фильтрация по userId
      if (options.userId) {
        query = query.eq('userId', options.userId)
      }

      // Фильтрация по статусу
      if (options.status) {
        query = query.eq('status', options.status)
      } else {
        // По умолчанию показываем только опубликованные посты
        query = query.eq('status', 'published')
      }

      // Фильтрация по тегу
      if (options.tag) {
        query = query.contains('tags', [options.tag])
      }

      // Полнотекстовый поиск
      if (options.query) {
        query = query.or(`title.ilike.%${options.query}%,content.ilike.%${options.query}%`)
      }

      // Сортировка
      const sortBy = options.sortBy || 'createdAt'
      const sortOrder = options.sortOrder || 'desc'
      query = query.order(sortBy, { ascending: sortOrder === 'asc' })

      // Пагинация
      const limit = options.limit || 10
      const offset = options.offset || 0
      query = query.range(offset, offset + limit - 1)

      const { data, error } = await query

      if (error) {
        logger.error('Ошибка при получении списка блог-постов:', error)
        return []
      }

      return data as BlogPost[]
    } catch (error) {
      logger.error('Непредвиденная ошибка при получении списка блог-постов:', error)
      return []
    }
  }

  /**
   * Получить популярные теги из блог-постов
   */
  async getPopularTags(limit: number = 10): Promise<{ tag: string; count: number }[]> {
    try {
      // Используем RPC для получения популярных тегов
      const { data, error } = await supabase.rpc('get_popular_blog_tags', { limit_count: limit })

      if (error) {
        logger.error('Ошибка при получении популярных тегов:', error)
        return []
      }

      return data
    } catch (error) {
      logger.error('Непредвиденная ошибка при получении популярных тегов:', error)
      return []
    }
  }

  /**
   * Сгенерировать slug на основе заголовка
   */
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\sа-яё]/gi, '') // Удаляем специальные символы
      .replace(/\s+/g, '-') // Заменяем пробелы на дефисы
      .replace(/[а-яё]/gi, (match) => {
        // Транслитерация кириллицы
        const cyrillicToLatin: Record<string, string> = {
          'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
          'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
          'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
          'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '',
          'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
        }
        return cyrillicToLatin[match.toLowerCase()] || match
      })
      .replace(/-+/g, '-') // Убираем множественные дефисы
      .replace(/^-|-$/g, '') // Убираем дефисы в начале и конце
  }

  /**
   * Получить количество блог-постов (всего или по фильтрам)
   */
  async getPostCount(options: Omit<BlogPostSearchOptions, 'limit' | 'offset' | 'sortBy' | 'sortOrder'> = {}): Promise<number> {
    try {
      let query = supabase
        .from(this.tableName)
        .select('*', { count: 'exact', head: true })

      // Фильтрация по userId
      if (options.userId) {
        query = query.eq('userId', options.userId)
      }

      // Фильтрация по статусу
      if (options.status) {
        query = query.eq('status', options.status)
      } else {
        // По умолчанию показываем только опубликованные посты
        query = query.eq('status', 'published')
      }

      // Фильтрация по тегу
      if (options.tag) {
        query = query.contains('tags', [options.tag])
      }

      // Полнотекстовый поиск
      if (options.query) {
        query = query.or(`title.ilike.%${options.query}%,content.ilike.%${options.query}%`)
      }

      const { data, error } = await query

      if (error) {
        logger.error('Ошибка при получении количества блог-постов:', error)
        return 0
      }

      return data.length || 0
    } catch (error) {
      logger.error('Непредвиденная ошибка при получении количества блог-постов:', error)
      return 0
    }
  }
}

// Экспортируем экземпляр сервиса для глобального использования
export const blogService = new BlogService() 