import * as fs from 'fs'

export async function deleteFile(filePath: string) {
  try {
    console.log('filePath', filePath)
    await fs.promises.unlink(filePath)
    console.log(`File ${filePath} deleted successfully`)
  } catch (error) {
    console.error(`Error deleting file ${filePath}:`, error)
  }
}
