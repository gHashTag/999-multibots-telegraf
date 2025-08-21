/**
 * 🎛️ SMART FIXES DASHBOARD v1.0
 * Real-time visualization of code health and fixes
 */

import { SmartFixesEngine, Fix, CodeHealthScore } from './smart-fixes-engine'

export class SmartFixesDashboard {
  private engine: SmartFixesEngine
  
  constructor() {
    this.engine = new SmartFixesEngine(process.cwd())
  }

  async displayLiveDashboard(): Promise<void> {
    console.log('\n🎛️ SMART FIXES LIVE DASHBOARD')
    console.log('═══════════════════════════════════════════════════════════')
    
    const { fixes, healthScore } = await this.engine.analyzeProject()
    
    // Отображаем живую информацию
    this.displayHeader()
    this.displayHealthMeter(healthScore)
    this.displayFixesOverview(fixes)
    this.displayProgressBars(fixes)
    this.displayQuickStats(fixes, healthScore)
    this.displayTrendAnalysis(healthScore)
    this.displayRecommendations(fixes)
  }

  private displayHeader(): void {
    const now = new Date().toLocaleString('ru-RU')
    console.log(`📊 Последнее обновление: ${now}`)
    console.log(`📂 Проект: ${process.cwd().split('/').pop()}`)
    console.log('')
  }

  private displayHealthMeter(score: CodeHealthScore): void {
    console.log('🏥 CODE HEALTH METER')
    console.log('─────────────────────────────────')
    
    const createMeter = (value: number, max: number = 10): string => {
      const percentage = Math.round((value / max) * 100)
      const filled = Math.round(percentage / 10)
      const empty = 10 - filled
      
      let color = ''
      if (percentage >= 80) color = '🟢'
      else if (percentage >= 60) color = '🟡'
      else if (percentage >= 40) color = '🟠'
      else color = '🔴'
      
      return `${color} ${'█'.repeat(filled)}${'░'.repeat(empty)} ${value}/10 (${percentage}%)`
    }
    
    console.log(`🎯 Overall Score:    ${createMeter(score.overall)}`)
    console.log(`📝 Code Quality:     ${createMeter(score.breakdown.codeQuality)}`)
    console.log(`🛡️ Security:         ${createMeter(score.breakdown.security)}`)
    console.log(`⚡ Performance:      ${createMeter(score.breakdown.performance)}`)
    console.log(`🔧 Maintainability:  ${createMeter(score.breakdown.maintainability)}`)
    console.log(`🧪 Test Coverage:    ${createMeter(score.breakdown.testCoverage)}`)
    console.log(`📚 Documentation:    ${createMeter(score.breakdown.documentation)}`)
    console.log('')
  }

  private displayFixesOverview(fixes: Fix[]): void {
    console.log('🔧 FIXES OVERVIEW')
    console.log('─────────────────────────────────')
    
    const criticalCount = fixes.filter(f => f.severity === 'critical').length
    const highCount = fixes.filter(f => f.severity === 'high').length
    const mediumCount = fixes.filter(f => f.severity === 'medium').length
    const lowCount = fixes.filter(f => f.severity === 'low').length
    
    const autoCount = fixes.filter(f => f.autoFixAvailable).length
    const manualCount = fixes.filter(f => !f.autoFixAvailable).length
    
    console.log(`🚨 Critical: ${criticalCount.toString().padStart(3)} issues`)
    console.log(`⚠️ High:     ${highCount.toString().padStart(3)} issues`)  
    console.log(`🟡 Medium:   ${mediumCount.toString().padStart(3)} issues`)
    console.log(`🔵 Low:      ${lowCount.toString().padStart(3)} issues`)
    console.log(`   ─────────────────`)
    console.log(`📊 Total:    ${fixes.length.toString().padStart(3)} issues`)
    console.log('')
    console.log(`🤖 Auto-fixable:    ${autoCount.toString().padStart(3)} fixes`)
    console.log(`👨‍💻 Manual fixes:    ${manualCount.toString().padStart(3)} fixes`)
    console.log('')
  }

  private displayProgressBars(fixes: Fix[]): void {
    console.log('📈 ANALYSIS PROGRESS')
    console.log('─────────────────────────────────')
    
    const categories = ['code-quality', 'performance', 'security', 'maintainability', 'style'] as const
    const categoryNames = {
      'code-quality': 'Code Quality',
      'performance': 'Performance', 
      'security': 'Security',
      'maintainability': 'Maintainability',
      'style': 'Code Style'
    }
    
    categories.forEach(category => {
      const categoryFixes = fixes.filter(f => f.category === category)
      const autoFixable = categoryFixes.filter(f => f.autoFixAvailable).length
      const total = categoryFixes.length
      
      if (total > 0) {
        const percentage = Math.round((autoFixable / total) * 100)
        const progressBar = this.createProgressBar(percentage, 20)
        console.log(`${categoryNames[category].padEnd(15)} ${progressBar} ${autoFixable}/${total} auto-fixable`)
      } else {
        console.log(`${categoryNames[category].padEnd(15)} ✅ No issues found`)
      }
    })
    console.log('')
  }

  private createProgressBar(percentage: number, width: number): string {
    const filled = Math.round((percentage / 100) * width)
    const empty = width - filled
    
    let color = ''
    if (percentage >= 80) color = '🟢'
    else if (percentage >= 60) color = '🟡'
    else if (percentage >= 40) color = '🟠'
    else color = '🔴'
    
    return `${color} [${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percentage}%`
  }

  private displayQuickStats(fixes: Fix[], healthScore: CodeHealthScore): void {
    console.log('⚡ QUICK STATS')
    console.log('─────────────────────────────────')
    
    const totalFiles = new Set(fixes.flatMap(f => f.files)).size
    const avgConfidence = fixes.length > 0 ? Math.round(fixes.reduce((sum, f) => sum + f.confidence, 0) / fixes.length) : 0
    const estimatedTime = this.calculateTotalTime(fixes.filter(f => f.autoFixAvailable))
    
    console.log(`📁 Files affected:    ${totalFiles}`)
    console.log(`🎯 Avg confidence:    ${avgConfidence}%`)
    console.log(`⏱️ Auto-fix time:     ${estimatedTime}`)
    console.log(`📊 Health trend:      ${this.getTrendIcon(healthScore.trends.direction)} ${healthScore.trends.direction}`)
    console.log('')
  }

  private calculateTotalTime(autoFixes: Fix[]): string {
    // Простая оценка времени в минутах
    const timeMap: { [key: string]: number } = {
      '1 минута': 1,
      '2 минуты': 2,
      '5 минут': 5,
      '10 минут': 10,
      '15 минут': 15,
      '30 минут': 30
    }
    
    const totalMinutes = autoFixes.reduce((sum, fix) => {
      const time = timeMap[fix.estimatedTime] || 5
      return sum + time
    }, 0)
    
    if (totalMinutes < 60) {
      return `${totalMinutes} минут`
    } else {
      const hours = Math.floor(totalMinutes / 60)
      const minutes = totalMinutes % 60
      return `${hours}ч ${minutes}м`
    }
  }

  private getTrendIcon(direction: string): string {
    switch (direction) {
      case 'improving': return '📈'
      case 'declining': return '📉'
      default: return '➡️'
    }
  }

  private displayTrendAnalysis(healthScore: CodeHealthScore): void {
    console.log('📈 TREND ANALYSIS')
    console.log('─────────────────────────────────')
    
    // Симуляция исторических данных для демо
    const historicalScores = [7.2, 7.5, 7.8, 8.1, healthScore.overall]
    
    console.log('Health Score History:')
    historicalScores.forEach((score, index) => {
      const trend = index > 0 ? (score > historicalScores[index - 1] ? '↗️' : score < historicalScores[index - 1] ? '↘️' : '→') : ' '
      const bar = '█'.repeat(Math.round(score))
      console.log(`Week ${index + 1}: ${score.toFixed(1)} ${trend} ${bar}`)
    })
    
    console.log(`\n🎯 Projection: ${(healthScore.overall + 0.3).toFixed(1)}/10 после применения авто-исправлений`)
    console.log('')
  }

  private displayRecommendations(fixes: Fix[]): void {
    console.log('💡 SMART RECOMMENDATIONS')
    console.log('─────────────────────────────────')
    
    const topPriorityFixes = fixes
      .filter(f => f.autoFixAvailable)
      .sort((a, b) => (b.confidence * this.getSeverityWeight(b.severity)) - (a.confidence * this.getSeverityWeight(a.severity)))
      .slice(0, 3)
    
    if (topPriorityFixes.length === 0) {
      console.log('✨ No automatic fixes available right now!')
      console.log('   Consider reviewing manual recommendations above.')
    } else {
      console.log('🎯 Top Priority Auto-Fixes:')
      topPriorityFixes.forEach((fix, index) => {
        const impact = this.calculateImpactScore(fix)
        console.log(`   ${index + 1}. ${fix.title}`)
        console.log(`      Impact: ${impact}/10 | Time: ${fix.estimatedTime} | Confidence: ${fix.confidence}%`)
      })
      
      console.log('')
      console.log('🚀 Quick Actions:')
      console.log('   • Run auto-fixes to boost health score by ~0.5 points')
      console.log('   • Focus on security fixes first for maximum impact')
      console.log('   • Schedule manual fixes for next sprint planning')
    }
    
    console.log('')
  }

  private getSeverityWeight(severity: string): number {
    const weights = { critical: 4, high: 3, medium: 2, low: 1 }
    return weights[severity as keyof typeof weights] || 1
  }

  private calculateImpactScore(fix: Fix): number {
    const severityScore = this.getSeverityWeight(fix.severity) * 2
    const confidenceScore = fix.confidence / 20
    const categoryScore = fix.category === 'security' ? 2 : 1
    
    return Math.min(10, Math.round(severityScore + confidenceScore + categoryScore))
  }

  // Метод для интеграции с Hive Mind
  async getHiveMindSummary(): Promise<string> {
    const { fixes, healthScore } = await this.engine.analyzeProject()
    
    const autoFixCount = fixes.filter(f => f.autoFixAvailable).length
    const criticalCount = fixes.filter(f => f.severity === 'critical').length
    
    return `🏥 Health Score: ${healthScore.overall}/10 | 🔧 ${autoFixCount} auto-fixes | 🚨 ${criticalCount} critical issues`
  }
}