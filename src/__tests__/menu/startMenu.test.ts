import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Markup } from 'telegraf'
import { startMenu } from '@/menu/startMenu'
import { levels } from '@/menu/mainMenu'
import { createMockContext } from './../helpers/context' // Relative path within src/__tests__
import type { Mock } from 'vitest'
