/**
 * Скачивает модели face-api.js для детекции лица
 */

const https = require('https')
const fs = require('fs')
const path = require('path')

const MODELS_DIR = path.join(__dirname, '..', 'models', 'face-api')
const BASE_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/'

const files = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model-shard1',
  'ssd_mobilenetv1_model-shard2',
]

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`📥 Downloading ${path.basename(dest)}...`)

    const file = fs.createWriteStream(dest)

    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        https.get(response.headers.location, (redirectResponse) => {
          redirectResponse.pipe(file)
          file.on('finish', () => {
            file.close()
            console.log(`✅ Downloaded ${path.basename(dest)}`)
            resolve()
          })
        }).on('error', (err) => {
          fs.unlink(dest, () => {})
          reject(err)
        })
      } else {
        response.pipe(file)
        file.on('finish', () => {
          file.close()
          console.log(`✅ Downloaded ${path.basename(dest)}`)
          resolve()
        })
      }
    }).on('error', (err) => {
      fs.unlink(dest, () => {})
      reject(err)
    })

    file.on('error', (err) => {
      fs.unlink(dest, () => {})
      reject(err)
    })
  })
}

async function main() {
  console.log('🚀 Downloading face-api.js models...')
  console.log(`📁 Target directory: ${MODELS_DIR}`)

  // Create models directory if it doesn't exist
  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true })
    console.log('✅ Created models directory')
  }

  // Download all files
  for (const file of files) {
    const url = BASE_URL + file
    const dest = path.join(MODELS_DIR, file)

    try {
      await downloadFile(url, dest)
    } catch (error) {
      console.error(`❌ Error downloading ${file}:`, error.message)
      process.exit(1)
    }
  }

  console.log('✅ All models downloaded successfully!')
}

main()
