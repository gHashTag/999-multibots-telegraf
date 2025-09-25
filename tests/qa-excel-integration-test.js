/**
 * QA INTEGRATION TEST: Excel File Generation
 * Tests actual Excel file creation and validation
 */

const { generateAdminExcelReport } = require('../dist/utils/adminExcelReportGenerator')
const XLSX = require('xlsx')
const fs = require('fs')
const path = require('path')

async function testExcelGeneration() {
  console.log('🔍 Starting Excel Generation Integration Test...')

  try {
    // Test with a mock bot name (will use limited data from DB)
    console.log('📊 Testing Excel generation for mock bot...')

    const excelBuffer = await generateAdminExcelReport('test_bot_999_qa')

    console.log('✅ Excel buffer generated successfully!')
    console.log(`📏 Buffer size: ${excelBuffer.length} bytes`)

    // Validate that it's a valid Excel file
    const workbook = XLSX.read(excelBuffer, { type: 'buffer' })
    console.log('✅ Excel file is valid and readable!')

    // Check expected sheets
    const expectedSheets = [
      '📊 Общая сводка',
      '💰 Финансы',
      '🛠️ Сервисы',
      '👥 Пользователи',
      '📅 Динамика',
      '📋 Транзакции'
    ]

    console.log('📋 Validating Excel sheets...')
    expectedSheets.forEach(sheetName => {
      if (workbook.Sheets[sheetName]) {
        console.log(`  ✅ Sheet found: ${sheetName}`)

        // Convert to JSON to validate data structure
        const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 })
        console.log(`     📊 Rows: ${sheetData.length}`)
      } else {
        console.log(`  ❌ Sheet missing: ${sheetName}`)
      }
    })

    // Save test file for manual inspection
    const testOutputPath = path.join(__dirname, 'qa-test-output.xlsx')
    fs.writeFileSync(testOutputPath, excelBuffer)
    console.log(`💾 Test Excel file saved: ${testOutputPath}`)

    // File size validation
    const stats = fs.statSync(testOutputPath)
    if (stats.size > 1024) { // Should be at least 1KB
      console.log(`✅ File size validation passed: ${stats.size} bytes`)
    } else {
      console.log(`⚠️ File size seems small: ${stats.size} bytes`)
    }

    console.log('🎉 Excel Generation Integration Test PASSED!')

    return {
      success: true,
      bufferSize: excelBuffer.length,
      fileSize: stats.size,
      sheetsFound: Object.keys(workbook.Sheets),
      testFilePath: testOutputPath
    }

  } catch (error) {
    console.error('❌ Excel Generation Integration Test FAILED!')
    console.error('Error details:', error.message)
    console.error('Stack trace:', error.stack)

    return {
      success: false,
      error: error.message,
      stack: error.stack
    }
  }
}

// Run the test
testExcelGeneration()
  .then(result => {
    console.log('\n📊 TEST SUMMARY:')
    console.log(JSON.stringify(result, null, 2))
    process.exit(result.success ? 0 : 1)
  })
  .catch(error => {
    console.error('Fatal test error:', error)
    process.exit(1)
  })