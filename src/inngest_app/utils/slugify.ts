/**
 * Simple slugify function for Inngest v2 compatibility
 * Converts string to URL-friendly slug
 */
export const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove non-word chars
    .replace(/[\s_-]+/g, '-') // Replace spaces, underscores with -
    .replace(/^-+|-+$/g, '') // Remove leading/trailing -
}
