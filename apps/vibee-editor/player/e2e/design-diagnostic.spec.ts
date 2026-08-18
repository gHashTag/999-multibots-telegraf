import { test, expect } from '@playwright/test'

test.describe('Design Diagnostic - Tab Issues', () => {
  test('should analyze sidebar tabs dimensions', async ({ page }) => {
    await page.goto('/editor', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('.editor', { timeout: 30000 })

    // Check sidebar content tabs
    const sidebarTabs = page.locator('.content-tab')
    const tabCount = await sidebarTabs.count()

    console.log('\n📊 SIDEBAR TABS ANALYSIS:')
    console.log('=' .repeat(50))

    for (let i = 0; i < tabCount; i++) {
      const tab = sidebarTabs.nth(i)
      const box = await tab.boundingBox()
      const text = await tab.textContent()
      const computedStyles = await tab.evaluate((el) => {
        const styles = window.getComputedStyle(el)
        const labelEl = el.querySelector('span:last-child')
        const labelStyles = labelEl ? window.getComputedStyle(labelEl) : null
        return {
          width: styles.width,
          fontSize: labelStyles?.fontSize || 'N/A',
          padding: styles.padding,
        }
      })

      console.log(`Tab ${i}: "${text?.trim()}"`)
      console.log(`  - Size: ${box?.width?.toFixed(0)}x${box?.height?.toFixed(0)}px`)
      console.log(`  - Label font-size: ${computedStyles.fontSize}`)
      console.log(`  - Padding: ${computedStyles.padding}`)

      // Check if text might be truncated
      if (box && box.width < 50 && text && text.trim().length > 8) {
        console.log(`  ⚠️  WARNING: Tab might truncate text (width=${box.width}px, text="${text.trim()}")`)
      }
    }
  })

  test('should analyze properties panel tabs', async ({ page }) => {
    await page.goto('/editor', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('.editor', { timeout: 30000 })

    // Click on timeline item to show properties panel
    const timelineItem = page.locator('[class*="item-content"]').first()
    if (await timelineItem.isVisible()) {
      await timelineItem.click()
      await page.waitForTimeout(500)
    }

    // Check properties tabs
    const propsTabs = page.locator('.properties-tab')
    const tabCount = await propsTabs.count()

    console.log('\n📊 PROPERTIES PANEL TABS ANALYSIS:')
    console.log('=' .repeat(50))

    if (tabCount === 0) {
      console.log('No properties tabs found (no item selected or panel not visible)')
      return
    }

    for (let i = 0; i < tabCount; i++) {
      const tab = propsTabs.nth(i)
      if (!(await tab.isVisible())) continue

      const box = await tab.boundingBox()
      const emoji = await tab.locator('.tab-emoji').textContent()
      const label = await tab.locator('.tab-label').textContent()

      const labelStyles = await tab.locator('.tab-label').evaluate((el) => {
        const styles = window.getComputedStyle(el)
        return {
          fontSize: styles.fontSize,
          overflow: styles.overflow,
          textOverflow: styles.textOverflow,
        }
      }).catch(() => ({ fontSize: 'N/A', overflow: 'N/A', textOverflow: 'N/A' }))

      console.log(`Tab ${i}: ${emoji} "${label}"`)
      console.log(`  - Size: ${box?.width?.toFixed(0)}x${box?.height?.toFixed(0)}px`)
      console.log(`  - Label font-size: ${labelStyles.fontSize}`)
      console.log(`  - Overflow: ${labelStyles.overflow}, text-overflow: ${labelStyles.textOverflow}`)
    }
  })

  test('should check font consistency across UI', async ({ page }) => {
    await page.goto('/editor', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('.editor', { timeout: 30000 })

    console.log('\n📊 FONT SIZE INVENTORY:')
    console.log('=' .repeat(50))

    // Check various UI elements
    const elements = [
      { selector: '.content-tab span:last-child', name: 'Sidebar tab label' },
      { selector: '.properties-tab .tab-label', name: 'Properties tab label' },
      { selector: '.track-name', name: 'Track name' },
      { selector: '.transport-time', name: 'Transport time' },
      { selector: '.header', name: 'Header' },
    ]

    for (const el of elements) {
      const element = page.locator(el.selector).first()
      if (await element.isVisible()) {
        const fontSize = await element.evaluate((e) => window.getComputedStyle(e).fontSize)
        console.log(`${el.name}: ${fontSize}`)
      } else {
        console.log(`${el.name}: (not visible)`)
      }
    }
  })

  test('should identify design inconsistencies', async ({ page }) => {
    await page.goto('/editor', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('.editor', { timeout: 30000 })

    console.log('\n🔍 DESIGN INCONSISTENCIES CHECK:')
    console.log('=' .repeat(50))

    const issues: string[] = []

    // 1. Check if sidebar tabs have consistent width
    const sidebarTabs = page.locator('.content-tab')
    const tabWidths: number[] = []
    const tabCount = await sidebarTabs.count()

    for (let i = 0; i < tabCount; i++) {
      const box = await sidebarTabs.nth(i).boundingBox()
      if (box) tabWidths.push(box.width)
    }

    const uniqueWidths = [...new Set(tabWidths.map(w => Math.round(w)))]
    if (uniqueWidths.length > 1) {
      issues.push(`Sidebar tabs have inconsistent widths: ${uniqueWidths.join(', ')}px`)
    }

    // 2. Check font sizes too small
    const smallFontElements = await page.$$eval('*', (elements) => {
      return elements
        .filter(el => {
          const style = window.getComputedStyle(el)
          const size = parseFloat(style.fontSize)
          const text = el.textContent?.trim()
          return size < 10 && text && text.length > 0 && el.childNodes.length <= 1
        })
        .map(el => ({
          tag: el.tagName,
          class: el.className,
          fontSize: window.getComputedStyle(el).fontSize,
          text: el.textContent?.trim().substring(0, 20)
        }))
        .slice(0, 10) // Limit to 10
    })

    if (smallFontElements.length > 0) {
      issues.push(`Found ${smallFontElements.length} elements with font-size < 10px`)
      smallFontElements.forEach(el => {
        console.log(`  - ${el.tag}.${el.class}: ${el.fontSize} - "${el.text}"`)
      })
    }

    // Summary
    console.log('\n📋 SUMMARY:')
    if (issues.length === 0) {
      console.log('✅ No major design inconsistencies found')
    } else {
      console.log(`⚠️  Found ${issues.length} issue(s):`)
      issues.forEach((issue, i) => console.log(`  ${i + 1}. ${issue}`))
    }
  })
})
