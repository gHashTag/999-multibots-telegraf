#!/usr/bin/env node

/**
 * 🚀 SMART FIXES CLI v1.0
 * Command-line interface for intelligent code fixes
 */

import { SmartFixesEngine, Fix, CodeHealthScore } from './smart-fixes-engine'
import { promises as fs } from 'fs'
import path from 'path'

class SmartFixesCLI {
  private engine: SmartFixesEngine
  
  constructor() {
    this.engine = new SmartFixesEngine(process.cwd())
  }

  async run(): Promise<void> {
    console.log('\n🚀 SMART FIXES SYSTEM v1.0')
    console.log('═══════════════════════════════════════════════')
    
    try {
      const { fixes, healthScore } = await this.engine.analyzeProject()
      
      this.displayHealthScore(healthScore)
      this.displayFixes(fixes)
      
      await this.promptForActions(fixes)
      
    } catch (error) {
      console.error('❌ Ошибка:', error)
      process.exit(1)
    }
  }

  private displayHealthScore(score: CodeHealthScore): void {
    console.log('\n🏥 CODE HEALTH SCORE')
    console.log('─────────────────────────────────')
    
    const getHealthEmoji = (score: number) => {
      if (score >= 9) return '🟢'
      if (score >= 7) return '🟡'
      if (score >= 5) return '🟠'
      return '🔴'
    }
    
    const getTrendEmoji = (direction: string) => {
      switch (direction) {
        case 'improving': return '📈'
        case 'declining': return '📉'
        default: return '➡️'
      }
    }
    
    console.log(`${getHealthEmoji(score.overall)} Общий скор: ${score.overall}/10`)
    console.log('')
    console.log('📊 Детализация:')
    console.log(`   📝 Code Quality:     ${score.breakdown.codeQuality}/10 ${getHealthEmoji(score.breakdown.codeQuality)}`)
    console.log(`   🛡️  Security:        ${score.breakdown.security}/10 ${getHealthEmoji(score.breakdown.security)}`)
    console.log(`   ⚡ Performance:      ${score.breakdown.performance}/10 ${getHealthEmoji(score.breakdown.performance)}`)
    console.log(`   🔧 Maintainability:  ${score.breakdown.maintainability}/10 ${getHealthEmoji(score.breakdown.maintainability)}`)
    console.log(`   🧪 Test Coverage:    ${score.breakdown.testCoverage}/10 ${getHealthEmoji(score.breakdown.testCoverage)}`)
    console.log(`   📚 Documentation:    ${score.breakdown.documentation}/10 ${getHealthEmoji(score.breakdown.documentation)}`)
    
    console.log(`\n${getTrendEmoji(score.trends.direction)} Тренд: ${score.trends.direction}`)
    score.trends.changes.forEach(change => console.log(`   • ${change}`))
  }

  private displayFixes(fixes: Fix[]): void {
    console.log('\n🔧 SMART FIXES RECOMMENDATIONS')
    console.log('─────────────────────────────────────────')
    
    if (fixes.length === 0) {
      console.log('✨ Проект в отличном состоянии! Критичных проблем не найдено.')
      return
    }
    
    const autoFixes = fixes.filter(f => f.autoFixAvailable)
    const manualFixes = fixes.filter(f => !f.autoFixAvailable)
    
    console.log(`📊 Найдено ${fixes.length} возможностей для улучшения:`)
    console.log(`   🤖 ${autoFixes.length} автоматических исправлений`)
    console.log(`   👨‍💻 ${manualFixes.length} ручных исправлений`)
    
    // Показываем топ-5 автоматических исправлений
    if (autoFixes.length > 0) {
      console.log('\n🤖 АВТОМАТИЧЕСКИЕ ИСПРАВЛЕНИЯ:')
      autoFixes.slice(0, 5).forEach((fix, index) => {
        this.displayFix(fix, index + 1)
      })
    }
    
    // Показываем топ-3 ручных исправления
    if (manualFixes.length > 0) {
      console.log('\n👨‍💻 РУЧНЫЕ ИСПРАВЛЕНИЯ:')
      manualFixes.slice(0, 3).forEach((fix, index) => {
        this.displayFix(fix, index + 1)
      })
    }
  }

  private displayFix(fix: Fix, index: number): void {
    const severityEmoji = {
      critical: '🚨',
      high: '⚠️',
      medium: '🟡',
      low: '🔵'
    }
    
    const typeEmoji = {
      auto: '🤖',
      manual: '👨‍💻',
      review: '👀'
    }
    
    console.log(`\n${index}. ${severityEmoji[fix.severity]} ${fix.title}`)
    console.log(`   ${typeEmoji[fix.type]} ${fix.type.toUpperCase()} | ⏱️  ${fix.estimatedTime} | 🎯 ${fix.confidence}% уверенности`)
    console.log(`   📝 ${fix.description}`)
    console.log(`   📈 Эффект: ${fix.impact.replace(/\n/g, '\n        ')}`)
    
    if (fix.files.length > 0 && fix.files.length <= 3) {
      console.log(`   📁 Файлы: ${fix.files.join(', ')}`)
    } else if (fix.files.length > 3) {
      console.log(`   📁 Файлы: ${fix.files.slice(0, 2).join(', ')} и еще ${fix.files.length - 2}`)
    }
  }

  private async promptForActions(fixes: Fix[]): Promise<void> {
    const autoFixes = fixes.filter(f => f.autoFixAvailable)
    
    if (autoFixes.length === 0) {
      console.log('\n✨ Автоматических исправлений нет. Проверьте ручные рекомендации выше.')
      return
    }
    
    console.log('\n🎯 ДЕЙСТВИЯ:')
    console.log('─────────────────')
    console.log('1. 🤖 Применить все автоматические исправления')
    console.log('2. 📋 Создать детальный отчет')
    console.log('3. 💾 Сохранить результаты анализа')
    console.log('4. ❌ Выйти без изменений')
    
    // Для демонстрации применим автоматические исправления
    console.log('\n🚀 Применяю автоматические исправления...')
    
    const { applied, skipped } = await this.engine.applyAutoFixes()
    
    if (applied.length > 0) {
      console.log('\n✅ ПРИМЕНЕНО:')
      applied.forEach(fix => console.log(`   ✓ ${fix}`))
    }
    
    if (skipped.length > 0) {
      console.log('\n⏭️  ПРОПУЩЕНО:')
      skipped.forEach(fix => console.log(`   - ${fix}`))
    }
    
    // Создаем отчет
    await this.generateReport(fixes)
  }

  private async generateReport(fixes: Fix[]): Promise<void> {
    const reportDir = path.join(process.cwd(), '.claude-flow', 'reports')
    await fs.mkdir(reportDir, { recursive: true })
    
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0]
    const reportPath = path.join(reportDir, `smart-fixes-report-${timestamp}.md`)
    
    const report = this.generateMarkdownReport(fixes)
    await fs.writeFile(reportPath, report)
    
    console.log(`\n📄 Детальный отчет сохранен: ${reportPath}`)
  }

  private generateMarkdownReport(fixes: Fix[]): string {
    const now = new Date().toLocaleString('ru-RU')
    
    let report = `# 🚀 Smart Fixes Report\n\n`
    report += `**Дата:** ${now}\n`
    report += `**Проект:** ${path.basename(process.cwd())}\n\n`
    
    report += `## 📊 Сводка\n\n`
    report += `- **Всего проблем:** ${fixes.length}\n`
    report += `- **Автоматических исправлений:** ${fixes.filter(f => f.autoFixAvailable).length}\n`
    report += `- **Критичных проблем:** ${fixes.filter(f => f.severity === 'critical').length}\n`
    report += `- **Высокий приоритет:** ${fixes.filter(f => f.severity === 'high').length}\n\n`
    
    report += `## 🔧 Рекомендации\n\n`
    
    fixes.forEach((fix, index) => {
      report += `### ${index + 1}. ${fix.title}\n\n`
      report += `**Тип:** ${fix.type} | **Серьезность:** ${fix.severity} | **Время:** ${fix.estimatedTime}\n\n`
      report += `${fix.description}\n\n`
      report += `**Ожидаемый эффект:**\n${fix.impact}\n\n`
      
      if (fix.files.length > 0) {
        report += `**Затронутые файлы:**\n`
        fix.files.slice(0, 10).forEach(file => {
          report += `- \`${file}\`\n`
        })
        if (fix.files.length > 10) {
          report += `- И еще ${fix.files.length - 10} файлов...\n`
        }
      }
      report += `\n---\n\n`
    })
    
    report += `## 🎯 Следующие шаги\n\n`
    report += `1. Примените автоматические исправления\n`
    report += `2. Проверьте ручные рекомендации\n`
    report += `3. Запустите тесты после изменений\n`
    report += `4. Проведите code review\n\n`
    
    report += `*Отчет сгенерирован Smart Fixes System v1.0*\n`
    
    return report
  }
}

// Запуск CLI
if (require.main === module) {
  const cli = new SmartFixesCLI()
  cli.run().catch(console.error)
}

export { SmartFixesCLI }