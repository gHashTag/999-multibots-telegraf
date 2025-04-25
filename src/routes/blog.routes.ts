import { Router } from 'express'
import { blogController } from '@/controllers/blog.controller'
import { authMiddleware } from '@/middlewares/auth.middleware'

// Создаем роутер для блог-постов
const router = Router()

// Маршруты, доступные без авторизации
router.get('/posts', blogController.getPosts.bind(blogController))
router.get('/posts/:id', blogController.getPostById.bind(blogController))
router.get('/posts/slug/:slug', blogController.getPostBySlug.bind(blogController))
router.get('/tags/popular', blogController.getPopularTags.bind(blogController))

// Маршруты, требующие авторизации
router.post('/posts', authMiddleware, blogController.createPost.bind(blogController))
router.put('/posts/:id', authMiddleware, blogController.updatePost.bind(blogController))
router.delete('/posts/:id', authMiddleware, blogController.deletePost.bind(blogController))
router.post('/posts/:id/archive', authMiddleware, blogController.archivePost.bind(blogController))
router.post('/posts/:id/publish', authMiddleware, blogController.publishPost.bind(blogController))
router.post('/posts/:id/draft', authMiddleware, blogController.draftPost.bind(blogController))
router.post('/posts/:id/like', blogController.toggleLike.bind(blogController))

export default router 