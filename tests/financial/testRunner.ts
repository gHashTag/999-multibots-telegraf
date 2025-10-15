/**
 * FINANCIAL TESTING SUITE - Test Runner & Coverage Reporter
 * Comprehensive test execution and reporting system
 */

import { execSync } from 'child_process'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'

interface TestResult {
  suite: string
  tests: number
  passed: number
  failed: number
  coverage: number
  duration: number
  errors: string[]
}

interface CoverageReport {
  statements: number
  branches: number
  functions: number
  lines: number
  files: string[]
}

class FinancialTestRunner {
  private testSuites = [
    'paymentCategorization.test.ts',
    'excelGeneration.test.ts',
    'botBilling.test.ts',
    'endToEnd.test.ts'
  ]

  private testResults: TestResult[] = []

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Financial System Test Suite...\n')

    for (const suite of this.testSuites) {
      await this.runTestSuite(suite)
    }

    this.generateComprehensiveReport()
  }

  private async runTestSuite(suiteName: string): Promise<void> {
    console.log(`\n📋 Running ${suiteName}...`)

    const startTime = Date.now()

    try {
      // Run Jest with coverage for this specific suite
      const command = `npx jest tests/financial/${suiteName} --coverage --coverageReporters=json-summary --verbose`

      const output = execSync(command, {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: 'pipe'
      })

      const duration = Date.now() - startTime

      // Parse Jest output
      const result = this.parseJestOutput(output, suiteName, duration)
      this.testResults.push(result)

      console.log(`✅ ${suiteName}: ${result.passed}/${result.tests} tests passed (${result.duration}ms)`)

      if (result.failed > 0) {
        console.log(`❌ ${result.failed} tests failed:`)
        result.errors.forEach(error => console.log(`   - ${error}`))
      }

    } catch (error: any) {
      console.log(`❌ ${suiteName}: Failed to run`)
      console.log(`Error: ${error.message}`)

      this.testResults.push({
        suite: suiteName,
        tests: 0,
        passed: 0,
        failed: 1,
        coverage: 0,
        duration: Date.now() - startTime,
        errors: [error.message]
      })
    }
  }

  private parseJestOutput(output: string, suiteName: string, duration: number): TestResult {
    const lines = output.split('\n')

    let tests = 0
    let passed = 0
    let failed = 0
    const errors: string[] = []

    // Parse test results
    lines.forEach(line => {
      if (line.includes('✓') || line.includes('✗')) {
        tests++
        if (line.includes('✓')) {
          passed++
        } else {
          failed++
          errors.push(line.trim())
        }
      }
    })

    // Parse coverage if available
    let coverage = 0
    const coverageLine = lines.find(line => line.includes('All files'))
    if (coverageLine) {
      const match = coverageLine.match(/(\d+\.?\d*)%/)
      if (match) {
        coverage = parseFloat(match[1])
      }
    }

    return {
      suite: suiteName,
      tests,
      passed,
      failed,
      coverage,
      duration,
      errors
    }
  }

  private generateComprehensiveReport(): void {
    console.log('\n' + '='.repeat(80))
    console.log('📊 FINANCIAL SYSTEM TEST REPORT')
    console.log('='.repeat(80))

    const totalTests = this.testResults.reduce((sum, r) => sum + r.tests, 0)
    const totalPassed = this.testResults.reduce((sum, r) => sum + r.passed, 0)
    const totalFailed = this.testResults.reduce((sum, r) => sum + r.failed, 0)
    const totalDuration = this.testResults.reduce((sum, r) => sum + r.duration, 0)
    const avgCoverage = this.testResults.reduce((sum, r) => sum + r.coverage, 0) / this.testResults.length

    console.log(`\n📈 OVERALL SUMMARY:`)
    console.log(`   Total Tests: ${totalTests}`)
    console.log(`   Passed: ${totalPassed} (${((totalPassed / totalTests) * 100).toFixed(1)}%)`)
    console.log(`   Failed: ${totalFailed} (${((totalFailed / totalTests) * 100).toFixed(1)}%)`)
    console.log(`   Duration: ${totalDuration}ms`)
    console.log(`   Average Coverage: ${avgCoverage.toFixed(1)}%`)

    console.log(`\n📋 DETAILED RESULTS:`)
    this.testResults.forEach(result => {
      const status = result.failed === 0 ? '✅' : '❌'
      const passRate = result.tests > 0 ? ((result.passed / result.tests) * 100).toFixed(1) : '0'

      console.log(`   ${status} ${result.suite}:`)
      console.log(`      Tests: ${result.passed}/${result.tests} (${passRate}%)`)
      console.log(`      Coverage: ${result.coverage.toFixed(1)}%`)
      console.log(`      Duration: ${result.duration}ms`)

      if (result.errors.length > 0) {
        console.log(`      Errors: ${result.errors.length}`)
      }
    })

    this.generateCoverageReport()
    this.generateQualityMetrics()
    this.generateRecommendations()

    // Save detailed report to file
    this.saveReportToFile()
  }

  private generateCoverageReport(): void {
    console.log(`\n🎯 COVERAGE ANALYSIS:`)

    const coverageThresholds = {
      statements: 85,
      branches: 80,
      functions: 85,
      lines: 85
    }

    this.testResults.forEach(result => {
      const status = result.coverage >= 80 ? '✅' : result.coverage >= 60 ? '⚠️' : '❌'
      console.log(`   ${status} ${result.suite}: ${result.coverage.toFixed(1)}%`)
    })

    const avgCoverage = this.testResults.reduce((sum, r) => sum + r.coverage, 0) / this.testResults.length

    if (avgCoverage >= 85) {
      console.log(`\n🎉 Excellent coverage! Average: ${avgCoverage.toFixed(1)}%`)
    } else if (avgCoverage >= 75) {
      console.log(`\n👍 Good coverage! Average: ${avgCoverage.toFixed(1)}%`)
    } else {
      console.log(`\n⚠️ Coverage needs improvement. Average: ${avgCoverage.toFixed(1)}%`)
    }
  }

  private generateQualityMetrics(): void {
    console.log(`\n🔍 QUALITY METRICS:`)

    const metrics = {
      testSuiteCount: this.testResults.length,
      averageTestsPerSuite: this.testResults.reduce((sum, r) => sum + r.tests, 0) / this.testResults.length,
      overallPassRate: (this.testResults.reduce((sum, r) => sum + r.passed, 0) / this.testResults.reduce((sum, r) => sum + r.tests, 0)) * 100,
      averageDuration: this.testResults.reduce((sum, r) => sum + r.duration, 0) / this.testResults.length,
      criticalTestCoverage: this.calculateCriticalTestCoverage()
    }

    console.log(`   📊 Test Suites: ${metrics.testSuiteCount}`)
    console.log(`   📈 Avg Tests/Suite: ${metrics.averageTestsPerSuite.toFixed(1)}`)
    console.log(`   ✅ Pass Rate: ${metrics.overallPassRate.toFixed(1)}%`)
    console.log(`   ⏱️ Avg Duration: ${metrics.averageDuration.toFixed(0)}ms`)
    console.log(`   🎯 Critical Coverage: ${metrics.criticalTestCoverage.toFixed(1)}%`)

    // Quality assessment
    if (metrics.overallPassRate === 100 && metrics.criticalTestCoverage >= 90) {
      console.log(`\n🏆 PRODUCTION READY! All quality gates passed.`)
    } else if (metrics.overallPassRate >= 95 && metrics.criticalTestCoverage >= 80) {
      console.log(`\n✅ HIGH QUALITY! Minor improvements needed.`)
    } else {
      console.log(`\n⚠️ QUALITY ISSUES! Review failed tests and coverage gaps.`)
    }
  }

  private calculateCriticalTestCoverage(): number {
    // Define critical test areas and their weights
    const criticalAreas = {
      'paymentCategorization': 25, // Payment logic is critical
      'botBilling': 25,            // Bot billing is critical
      'excelGeneration': 20,       // Data integrity is important
      'endToEnd': 30               // Integration is most critical
    }

    let weightedCoverage = 0
    let totalWeight = 0

    this.testResults.forEach(result => {
      const suiteName = result.suite.replace('.test.ts', '')
      const weight = criticalAreas[suiteName as keyof typeof criticalAreas] || 0

      if (weight > 0) {
        weightedCoverage += result.coverage * weight
        totalWeight += weight
      }
    })

    return totalWeight > 0 ? weightedCoverage / totalWeight : 0
  }

  private generateRecommendations(): void {
    console.log(`\n💡 RECOMMENDATIONS:`)

    const recommendations: string[] = []

    // Coverage recommendations
    const lowCoverageSuites = this.testResults.filter(r => r.coverage < 80)
    if (lowCoverageSuites.length > 0) {
      recommendations.push(`Improve coverage for: ${lowCoverageSuites.map(s => s.suite).join(', ')}`)
    }

    // Performance recommendations
    const slowSuites = this.testResults.filter(r => r.duration > 5000)
    if (slowSuites.length > 0) {
      recommendations.push(`Optimize performance for: ${slowSuites.map(s => s.suite).join(', ')}`)
    }

    // Failed test recommendations
    const failedSuites = this.testResults.filter(r => r.failed > 0)
    if (failedSuites.length > 0) {
      recommendations.push(`Fix failing tests in: ${failedSuites.map(s => s.suite).join(', ')}`)
    }

    // General recommendations
    const avgTests = this.testResults.reduce((sum, r) => sum + r.tests, 0) / this.testResults.length
    if (avgTests < 20) {
      recommendations.push('Consider adding more edge case tests')
    }

    if (recommendations.length === 0) {
      console.log(`   🎉 No immediate recommendations! Test suite is comprehensive.`)
    } else {
      recommendations.forEach((rec, index) => {
        console.log(`   ${index + 1}. ${rec}`)
      })
    }

    console.log(`\n📚 ADDITIONAL IMPROVEMENTS:`)
    console.log(`   • Add property-based testing for mathematical formulas`)
    console.log(`   • Implement mutation testing for critical business logic`)
    console.log(`   • Add contract testing for API interfaces`)
    console.log(`   • Consider adding chaos engineering tests`)
  }

  private saveReportToFile(): void {
    const reportData = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: this.testResults.reduce((sum, r) => sum + r.tests, 0),
        totalPassed: this.testResults.reduce((sum, r) => sum + r.passed, 0),
        totalFailed: this.testResults.reduce((sum, r) => sum + r.failed, 0),
        totalDuration: this.testResults.reduce((sum, r) => sum + r.duration, 0),
        averageCoverage: this.testResults.reduce((sum, r) => sum + r.coverage, 0) / this.testResults.length
      },
      results: this.testResults,
      qualityGates: {
        allTestsPassed: this.testResults.every(r => r.failed === 0),
        minimumCoverage: this.testResults.every(r => r.coverage >= 75),
        performanceAcceptable: this.testResults.every(r => r.duration < 10000),
        productionReady: this.testResults.every(r => r.failed === 0) &&
                        this.testResults.every(r => r.coverage >= 80)
      }
    }

    const reportPath = join(process.cwd(), 'tests', 'financial', 'test-report.json')
    writeFileSync(reportPath, JSON.stringify(reportData, null, 2))

    console.log(`\n📄 Detailed report saved to: ${reportPath}`)
  }
}

// Performance benchmark runner
class PerformanceBenchmark {
  async runBenchmarks(): Promise<void> {
    console.log('\n⚡ PERFORMANCE BENCHMARKS:')

    await this.benchmarkCalculations()
    await this.benchmarkDataProcessing()
    await this.benchmarkMemoryUsage()
  }

  private async benchmarkCalculations(): Promise<void> {
    console.log('\n🧮 Mathematical Calculation Benchmarks:')

    // Benchmark service cost calculations
    const iterations = 100000
    const startTime = performance.now()

    for (let i = 0; i < iterations; i++) {
      // Simulate service cost calculations
      const cost = this.calculateServiceCost('neuro_photo', { num_images: Math.floor(Math.random() * 10) + 1 })
    }

    const endTime = performance.now()
    const avgTime = (endTime - startTime) / iterations

    console.log(`   Service Cost Calculation: ${avgTime.toFixed(3)}ms/operation`)
    console.log(`   Throughput: ${(iterations / (endTime - startTime) * 1000).toFixed(0)} ops/sec`)
  }

  private async benchmarkDataProcessing(): Promise<void> {
    console.log('\n📊 Data Processing Benchmarks:')

    // Generate test dataset
    const datasetSizes = [1000, 10000, 100000]

    for (const size of datasetSizes) {
      const dataset = this.generateTestData(size)

      const startTime = performance.now()
      const result = this.processFinancialData(dataset)
      const endTime = performance.now()

      const processingTime = endTime - startTime
      const throughput = size / processingTime * 1000

      console.log(`   ${size} records: ${processingTime.toFixed(2)}ms (${throughput.toFixed(0)} records/sec)`)
    }
  }

  private async benchmarkMemoryUsage(): Promise<void> {
    console.log('\n💾 Memory Usage Benchmarks:')

    const initialMemory = process.memoryUsage()

    // Process large dataset
    const largeDataset = this.generateTestData(50000)
    this.processFinancialData(largeDataset)

    const finalMemory = process.memoryUsage()

    console.log(`   Initial Heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`)
    console.log(`   Final Heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`)
    console.log(`   Memory Delta: ${((finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024).toFixed(2)} MB`)
  }

  private calculateServiceCost(serviceType: string, metadata: any): number {
    // Simplified service cost calculation for benchmarking
    const baseCosts: Record<string, number> = {
      'neuro_photo': 4,
      'kling_video': 10,
      'morphing': 84
    }

    const baseCost = baseCosts[serviceType] || 1
    const multiplier = serviceType === 'neuro_photo' ? (metadata.num_images || 1) : 1

    return baseCost * multiplier
  }

  private generateTestData(size: number): any[] {
    const data = []
    for (let i = 0; i < size; i++) {
      data.push({
        id: i,
        amount: Math.random() * 1000,
        type: Math.random() > 0.5 ? 'INCOME' : 'OUTCOME',
        timestamp: new Date().getTime() + i
      })
    }
    return data
  }

  private processFinancialData(data: any[]): any {
    return data.reduce((acc, item) => {
      acc.total += item.amount
      acc.count++
      return acc
    }, { total: 0, count: 0 })
  }
}

// Main execution
async function main() {
  const runner = new FinancialTestRunner()
  const benchmark = new PerformanceBenchmark()

  try {
    await runner.runAllTests()
    await benchmark.runBenchmarks()

    console.log('\n🎉 Financial testing completed successfully!')

  } catch (error) {
    console.error('❌ Testing failed:', error)
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  main()
}

export { FinancialTestRunner, PerformanceBenchmark }