import { inngest } from '@/inngest_app/client'
import { parseEventData } from '@/inngest_app/guards'
import { z } from 'zod'
import { supabase } from '@/core/supabase'

// Validation schema for input data
const extractTopContentSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  project_id: z.number().int().positive('Project ID must be positive'),
  days_back: z.number().int().positive().default(14),
  limit: z.number().int().positive().default(10),
})

export type ExtractTopContentInput = z.infer<typeof extractTopContentSchema>

export interface TopReelData {
  id: string
  comp_username: string
  reel_id: string
  ig_reel_url: string
  caption: string | null
  views_count: number
  likes_count: number
  comments_count: number
  created_at_instagram: string
  engagement_rate: number
  project_id: number
}

/**
 * Extract top performing reels from reels_analysis table
 * Job 3: "Мне нужно получить инсайты о трендах"
 */
export const extractTopContent = inngest.createFunction(
  {
    // Canonical id (spec-first manifest). Legacy id was 'extract-top-content'.
    id: 'instagram-top-content-extract',
    name: '📊 Extract Top Content',
  },
  // Canonical event first, legacy event kept for existing senders.
  [
    { event: 'instagram/top-content.extract' },
    { event: 'instagram/extract-top' },
  ],
  async ({ event, step }) => {
    // Schema failure → NonRetriableError (never heals on retry).
    const input = parseEventData(
      extractTopContentSchema,
      event.data,
      'instagram/top-content.extract payload'
    )

    // Step 1: Query top reels from database
    const topReels = await step.run('query-top-reels', async () => {
      const { data, error } = await supabase
        .from('reels_analysis')
        .select('*')
        .eq('comp_username', input.username)
        .eq('project_id', input.project_id)
        .gte(
          'created_at_instagram',
          new Date(
            Date.now() - input.days_back * 24 * 60 * 60 * 1000
          ).toISOString()
        )
        .order('views_count', { ascending: false })
        .limit(input.limit)

      if (error) {
        throw new Error(`Database error: ${error.message}`)
      }

      return data || []
    })

    // Step 2: Calculate engagement rates and sort
    const processedReels = await step.run('process-reels', async () => {
      return topReels
        .map(reel => ({
          ...reel,
          engagement_rate:
            (reel.likes_count + reel.comments_count) /
            Math.max(reel.views_count, 1),
        }))
        .sort((a, b) => b.engagement_rate - a.engagement_rate)
    })

    // Step 3: Format report
    const report = await step.run('format-report', async () => {
      return formatTopReelsReport(processedReels)
    })

    return {
      success: true,
      data: {
        reels: processedReels,
        report,
        stats: {
          total_reels: processedReels.length,
          avg_engagement:
            processedReels.reduce(
              (sum, reel) => sum + reel.engagement_rate,
              0
            ) / processedReels.length || 0,
          top_views: processedReels[0]?.views_count || 0,
        },
      },
    }
  }
)

// Helper function to format reels report
function formatTopReelsReport(reels: TopReelData[]): string {
  if (reels.length === 0) {
    return `📊 ТОП-10 РИЛСОВ\n\nНет данных для отображения за указанный период.`
  }

  let report = `📊 ТОП-10 РИЛСОВ ${reels[0]?.comp_username}\n\n`

  reels.forEach((reel, index) => {
    const engagement = (reel.engagement_rate * 100).toFixed(1)
    report += `${index + 1}. 🎬 ${reel.caption?.substring(0, 50)}...\n`
    report += `   👀 ${reel.views_count.toLocaleString()} просмотров\n`
    report += `   ❤️ ${reel.likes_count.toLocaleString()} лайков\n`
    report += `   💬 ${reel.comments_count.toLocaleString()} комментариев\n`
    report += `   📊 ${engagement}% engagement\n`
    report += `   🔗 ${reel.ig_reel_url}\n\n`
  })

  return report
}

// Export helper functions for testing
export { formatTopReelsReport }
