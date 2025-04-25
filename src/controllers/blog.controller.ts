import { Request, Response } from 'express'
import { supabase } from '@/core/supabase/client'
import slugify from 'slugify'

interface BlogPost {
  id: string
  title: string
  content: string
  slug: string
  excerpt: string
  cover_image: string
  author_id: string
  created_at: string
  updated_at: string
  status: 'published' | 'draft' | 'archived'
  tags?: string[]
  likes?: number
}

class BlogController {
  /**
   * Получение списка постов блога с фильтрацией и пагинацией
   */
  async getPosts(req: Request, res: Response) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        status = 'published', 
        tag,
        search,
        author_id,
        sort_by = 'created_at',
        sort_order = 'desc' 
      } = req.query as any
      
      const offset = (page - 1) * limit
      
      // Базовый запрос
      let query = supabase
        .from('blog_posts')
        .select(`
          id, 
          title, 
          slug, 
          excerpt, 
          cover_image, 
          author_id, 
          created_at, 
          updated_at, 
          status,
          likes,
          authors!blog_posts_author_id_fkey (
            id,
            full_name,
            avatar_url
          ),
          blog_post_tags (
            tag_name
          )
        `)
        .eq('status', status)

      // Фильтр по автору
      if (author_id) {
        query = query.eq('author_id', author_id)
      }
      
      // Фильтр по тегу
      if (tag) {
        query = query.contains('tags', [tag])
      }
      
      // Поиск по заголовку или эксцерпту
      if (search) {
        query = query.or(`title.ilike.%${search}%,excerpt.ilike.%${search}%`)
      }
      
      // Получаем общее количество постов для пагинации
      const countQuery = supabase
        .from('blog_posts')
        .count()
        .eq('status', status)
      
      if (author_id) countQuery.eq('author_id', author_id)
      if (tag) countQuery.contains('tags', [tag])
      if (search) countQuery.or(`title.ilike.%${search}%,excerpt.ilike.%${search}%`)
      
      const [postsResult, countResult] = await Promise.all([
        query
          .order(sort_by, { ascending: sort_order === 'asc' })
          .range(offset, offset + limit - 1),
        countQuery
      ])
      
      if (postsResult.error) {
        throw postsResult.error
      }
      
      if (countResult.error) {
        throw countResult.error
      }
      
      // Форматируем данные постов для ответа
      const posts = postsResult.data.map(post => {
        // Извлекаем теги из отношений
        const tags = post.blog_post_tags ? post.blog_post_tags.map((t: any) => t.tag_name) : []
        
        // Извлекаем данные автора
        const author = post.authors || null
        
        // Исключаем ненужные вложенные объекты
        const { blog_post_tags, authors, ...postData } = post
        
        return {
          ...postData,
          tags,
          author
        }
      })
      
      return res.status(200).json({
        success: true,
        data: {
          posts,
          pagination: {
            total: countResult.data[0].count,
            page: parseInt(String(page)),
            limit: parseInt(String(limit)),
            pages: Math.ceil(countResult.data[0].count / limit)
          }
        }
      })
    } catch (error: any) {
      console.error('Ошибка при получении списка постов:', error)
      return res.status(500).json({
        success: false,
        message: 'Ошибка при получении списка постов',
        error: error.message
      })
    }
  }
  
  /**
   * Получение поста по ID
   */
  async getPostById(req: Request, res: Response) {
    try {
      const { id } = req.params
      
      const { data, error } = await supabase
        .from('blog_posts')
        .select(`
          id, 
          title, 
          slug, 
          excerpt,
          content, 
          cover_image, 
          author_id, 
          created_at, 
          updated_at, 
          status,
          likes,
          authors!blog_posts_author_id_fkey (
            id,
            full_name,
            avatar_url
          ),
          blog_post_tags (
            tag_name
          )
        `)
        .eq('id', id)
        .single()
      
      if (error) {
        throw error
      }
      
      if (!data) {
        return res.status(404).json({
          success: false,
          message: 'Пост не найден'
        })
      }
      
      // Форматируем данные поста
      const { blog_post_tags, authors, ...postData } = data
      const tags = blog_post_tags ? blog_post_tags.map((t: any) => t.tag_name) : []
      
      return res.status(200).json({
        success: true,
        data: {
          ...postData,
          tags,
          author: authors
        }
      })
    } catch (error: any) {
      console.error('Ошибка при получении поста:', error)
      return res.status(500).json({
        success: false,
        message: 'Ошибка при получении поста',
        error: error.message
      })
    }
  }
  
  /**
   * Получение поста по slug
   */
  async getPostBySlug(req: Request, res: Response) {
    try {
      const { slug } = req.params
      
      const { data, error } = await supabase
        .from('blog_posts')
        .select(`
          id, 
          title, 
          slug, 
          excerpt,
          content, 
          cover_image, 
          author_id, 
          created_at, 
          updated_at, 
          status,
          likes,
          authors!blog_posts_author_id_fkey (
            id,
            full_name,
            avatar_url
          ),
          blog_post_tags (
            tag_name
          )
        `)
        .eq('slug', slug)
        .single()
      
      if (error) {
        throw error
      }
      
      if (!data) {
        return res.status(404).json({
          success: false,
          message: 'Пост не найден'
        })
      }
      
      // Форматируем данные поста
      const { blog_post_tags, authors, ...postData } = data
      const tags = blog_post_tags ? blog_post_tags.map((t: any) => t.tag_name) : []
      
      return res.status(200).json({
        success: true,
        data: {
          ...postData,
          tags,
          author: authors
        }
      })
    } catch (error: any) {
      console.error('Ошибка при получении поста по slug:', error)
      return res.status(500).json({
        success: false,
        message: 'Ошибка при получении поста',
        error: error.message
      })
    }
  }
  
  /**
   * Создание нового поста
   */
  async createPost(req: Request, res: Response) {
    try {
      const { title, content, excerpt, cover_image, tags = [] } = req.body
      
      if (!title || !content) {
        return res.status(400).json({
          success: false,
          message: 'Требуются заголовок и содержание поста'
        })
      }
      
      // Получаем данные авторизованного пользователя из middleware
      const author_id = req.user?.id
      
      // Создаем slug из заголовка
      const slug = slugify(title, { 
        lower: true,
        strict: true,
        locale: 'ru'
      })
      
      // Создаем пост
      const { data: postData, error: postError } = await supabase
        .from('blog_posts')
        .insert({
          title,
          content,
          excerpt: excerpt || content.substring(0, 150) + '...',
          cover_image,
          author_id,
          slug,
          status: 'draft'
        })
        .select()
        .single()
      
      if (postError) {
        throw postError
      }
      
      // Если есть теги, создаем связи
      if (tags && tags.length > 0) {
        const tagReferences = tags.map((tag: string) => ({
          post_id: postData.id,
          tag_name: tag
        }))
        
        const { error: tagError } = await supabase
          .from('blog_post_tags')
          .insert(tagReferences)
        
        if (tagError) {
          console.error('Ошибка при добавлении тегов:', tagError)
        }
      }
      
      return res.status(201).json({
        success: true,
        data: {
          ...postData,
          tags
        },
        message: 'Пост успешно создан'
      })
    } catch (error: any) {
      console.error('Ошибка при создании поста:', error)
      return res.status(500).json({
        success: false,
        message: 'Ошибка при создании поста',
        error: error.message
      })
    }
  }
  
  /**
   * Обновление поста
   */
  async updatePost(req: Request, res: Response) {
    try {
      const { id } = req.params
      const { title, content, excerpt, cover_image, tags } = req.body
      
      // Проверяем существование поста и владельца
      const { data: existingPost, error: fetchError } = await supabase
        .from('blog_posts')
        .select('author_id')
        .eq('id', id)
        .single()
      
      if (fetchError) {
        throw fetchError
      }
      
      if (!existingPost) {
        return res.status(404).json({
          success: false,
          message: 'Пост не найден'
        })
      }
      
      // Проверяем права на редактирование
      if (existingPost.author_id !== req.user?.id) {
        return res.status(403).json({
          success: false,
          message: 'Нет прав на редактирование поста'
        })
      }
      
      // Обновляем данные поста
      const updateData: Partial<BlogPost> = {}
      
      if (title) {
        updateData.title = title
        updateData.slug = slugify(title, { 
          lower: true,
          strict: true,
          locale: 'ru'
        })
      }
      
      if (content) updateData.content = content
      if (excerpt) updateData.excerpt = excerpt
      if (cover_image) updateData.cover_image = cover_image
      
      const { data: updatedPost, error: updateError } = await supabase
        .from('blog_posts')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()
      
      if (updateError) {
        throw updateError
      }
      
      // Если предоставлены теги, обновляем их
      if (tags) {
        // Удаляем существующие теги
        await supabase
          .from('blog_post_tags')
          .delete()
          .eq('post_id', id)
        
        // Добавляем новые теги
        if (tags.length > 0) {
          const tagReferences = tags.map((tag: string) => ({
            post_id: id,
            tag_name: tag
          }))
          
          await supabase
            .from('blog_post_tags')
            .insert(tagReferences)
        }
      }
      
      return res.status(200).json({
        success: true,
        data: {
          ...updatedPost,
          tags: tags || []
        },
        message: 'Пост успешно обновлен'
      })
    } catch (error: any) {
      console.error('Ошибка при обновлении поста:', error)
      return res.status(500).json({
        success: false,
        message: 'Ошибка при обновлении поста',
        error: error.message
      })
    }
  }
  
  /**
   * Удаление поста
   */
  async deletePost(req: Request, res: Response) {
    try {
      const { id } = req.params
      
      // Проверяем существование поста и владельца
      const { data: existingPost, error: fetchError } = await supabase
        .from('blog_posts')
        .select('author_id')
        .eq('id', id)
        .single()
      
      if (fetchError) {
        throw fetchError
      }
      
      if (!existingPost) {
        return res.status(404).json({
          success: false,
          message: 'Пост не найден'
        })
      }
      
      // Проверяем права на удаление
      if (existingPost.author_id !== req.user?.id) {
        return res.status(403).json({
          success: false,
          message: 'Нет прав на удаление поста'
        })
      }
      
      // Удаляем связанные записи
      await supabase
        .from('blog_post_tags')
        .delete()
        .eq('post_id', id)
      
      // Удаляем пост
      const { error: deleteError } = await supabase
        .from('blog_posts')
        .delete()
        .eq('id', id)
      
      if (deleteError) {
        throw deleteError
      }
      
      return res.status(200).json({
        success: true,
        message: 'Пост успешно удален'
      })
    } catch (error: any) {
      console.error('Ошибка при удалении поста:', error)
      return res.status(500).json({
        success: false,
        message: 'Ошибка при удалении поста',
        error: error.message
      })
    }
  }
  
  /**
   * Архивирование поста
   */
  async archivePost(req: Request, res: Response) {
    try {
      const { id } = req.params
      
      // Проверяем существование поста и владельца
      const { data: existingPost, error: fetchError } = await supabase
        .from('blog_posts')
        .select('author_id')
        .eq('id', id)
        .single()
      
      if (fetchError) {
        throw fetchError
      }
      
      if (!existingPost) {
        return res.status(404).json({
          success: false,
          message: 'Пост не найден'
        })
      }
      
      // Проверяем права
      if (existingPost.author_id !== req.user?.id) {
        return res.status(403).json({
          success: false,
          message: 'Нет прав на архивирование поста'
        })
      }
      
      // Обновляем статус поста
      const { data, error } = await supabase
        .from('blog_posts')
        .update({ status: 'archived' })
        .eq('id', id)
        .select()
        .single()
      
      if (error) {
        throw error
      }
      
      return res.status(200).json({
        success: true,
        data,
        message: 'Пост успешно архивирован'
      })
    } catch (error: any) {
      console.error('Ошибка при архивировании поста:', error)
      return res.status(500).json({
        success: false,
        message: 'Ошибка при архивировании поста',
        error: error.message
      })
    }
  }
  
  /**
   * Публикация поста
   */
  async publishPost(req: Request, res: Response) {
    try {
      const { id } = req.params
      
      // Проверяем существование поста и владельца
      const { data: existingPost, error: fetchError } = await supabase
        .from('blog_posts')
        .select('author_id')
        .eq('id', id)
        .single()
      
      if (fetchError) {
        throw fetchError
      }
      
      if (!existingPost) {
        return res.status(404).json({
          success: false,
          message: 'Пост не найден'
        })
      }
      
      // Проверяем права
      if (existingPost.author_id !== req.user?.id) {
        return res.status(403).json({
          success: false,
          message: 'Нет прав на публикацию поста'
        })
      }
      
      // Обновляем статус поста
      const { data, error } = await supabase
        .from('blog_posts')
        .update({ status: 'published' })
        .eq('id', id)
        .select()
        .single()
      
      if (error) {
        throw error
      }
      
      return res.status(200).json({
        success: true,
        data,
        message: 'Пост успешно опубликован'
      })
    } catch (error: any) {
      console.error('Ошибка при публикации поста:', error)
      return res.status(500).json({
        success: false,
        message: 'Ошибка при публикации поста',
        error: error.message
      })
    }
  }
  
  /**
   * Перевод поста в черновик
   */
  async draftPost(req: Request, res: Response) {
    try {
      const { id } = req.params
      
      // Проверяем существование поста и владельца
      const { data: existingPost, error: fetchError } = await supabase
        .from('blog_posts')
        .select('author_id')
        .eq('id', id)
        .single()
      
      if (fetchError) {
        throw fetchError
      }
      
      if (!existingPost) {
        return res.status(404).json({
          success: false,
          message: 'Пост не найден'
        })
      }
      
      // Проверяем права
      if (existingPost.author_id !== req.user?.id) {
        return res.status(403).json({
          success: false,
          message: 'Нет прав на изменение статуса поста'
        })
      }
      
      // Обновляем статус поста
      const { data, error } = await supabase
        .from('blog_posts')
        .update({ status: 'draft' })
        .eq('id', id)
        .select()
        .single()
      
      if (error) {
        throw error
      }
      
      return res.status(200).json({
        success: true,
        data,
        message: 'Пост переведен в черновики'
      })
    } catch (error: any) {
      console.error('Ошибка при изменении статуса поста:', error)
      return res.status(500).json({
        success: false,
        message: 'Ошибка при изменении статуса поста',
        error: error.message
      })
    }
  }
  
  /**
   * Получение популярных тегов
   */
  async getPopularTags(req: Request, res: Response) {
    try {
      const { limit = 10 } = req.query as any
      
      const { data, error } = await supabase
        .rpc('get_popular_tags', { tag_limit: limit })
      
      if (error) {
        throw error
      }
      
      return res.status(200).json({
        success: true,
        data
      })
    } catch (error: any) {
      console.error('Ошибка при получении популярных тегов:', error)
      return res.status(500).json({
        success: false,
        message: 'Ошибка при получении популярных тегов',
        error: error.message
      })
    }
  }
  
  /**
   * Установка/снятие лайка для поста
   */
  async toggleLike(req: Request, res: Response) {
    try {
      const { id } = req.params
      const userId = req.user?.id
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Требуется авторизация'
        })
      }
      
      // Проверяем существование поста
      const { data: existingPost, error: fetchError } = await supabase
        .from('blog_posts')
        .select('id')
        .eq('id', id)
        .single()
      
      if (fetchError) {
        throw fetchError
      }
      
      if (!existingPost) {
        return res.status(404).json({
          success: false,
          message: 'Пост не найден'
        })
      }
      
      // Проверяем, существует ли уже лайк
      const { data: existingLike, error: likeError } = await supabase
        .from('blog_post_likes')
        .select('id')
        .eq('post_id', id)
        .eq('user_id', userId)
        .single()
      
      if (likeError && likeError.code !== 'PGRST116') {
        throw likeError
      }
      
      let action: 'added' | 'removed'
      
      if (existingLike) {
        // Если лайк уже есть - удаляем
        const { error: deleteError } = await supabase
          .from('blog_post_likes')
          .delete()
          .eq('id', existingLike.id)
        
        if (deleteError) {
          throw deleteError
        }
        
        action = 'removed'
      } else {
        // Если лайка нет - добавляем
        const { error: insertError } = await supabase
          .from('blog_post_likes')
          .insert({
            post_id: id,
            user_id: userId
          })
        
        if (insertError) {
          throw insertError
        }
        
        action = 'added'
      }
      
      // Обновляем счетчик лайков в посте
      const { data: updatedPost, error: updateError } = await supabase
        .rpc('update_post_likes_count', {
          post_id: id
        })
      
      if (updateError) {
        throw updateError
      }
      
      return res.status(200).json({
        success: true,
        data: {
          action,
          likes_count: updatedPost
        },
        message: action === 'added' ? 'Лайк добавлен' : 'Лайк удален'
      })
    } catch (error: any) {
      console.error('Ошибка при обработке лайка:', error)
      return res.status(500).json({
        success: false,
        message: 'Ошибка при обработке лайка',
        error: error.message
      })
    }
  }
}

export const blogController = new BlogController() 