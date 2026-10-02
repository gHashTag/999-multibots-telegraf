// What failed, in words a person can act on, from vitest's JSON report.
//
// The gate used to say `${numFailedTests + numFailedTestSuites} failed test(s)
// or file(s)`. vitest counts every `describe` as a suite, so one failing test
// inside one describe in one file read "3 failed" (2026-10-02, deploy of
// 648d13fd8), and the next reader took the 3 for three problems, then for
// retries. Neither was true. This names each failing test by file and title,
// and a file that failed with no failing test (it did not load) by its error.

import path from 'node:path'

/**
 * @param {{ testResults?: Array<{ name: string, status: string, message?: string,
 *   assertionResults?: Array<{ ancestorTitles?: string[], title: string, status: string }> }> }} report
 * @param {string} root directory the file names are made relative to
 * @returns {{ tests: string[], files: string[], summary: string }}
 */
export function failures(report, root) {
  const tests = []
  const files = []
  for (const file of report.testResults ?? []) {
    const name = path.relative(root, file.name) || file.name
    const failed = (file.assertionResults ?? []).filter(
      a => a.status === 'failed'
    )
    for (const a of failed) {
      tests.push([name, ...(a.ancestorTitles ?? []), a.title].join(' > '))
    }
    if (file.status === 'failed' && failed.length === 0) {
      const why = (file.message ?? '').trim().split('\n')[0] || 'no message'
      files.push(`${name}: ${why}`)
    }
  }
  const touched = new Set(
    [...tests, ...files].map(line => line.split(/ > |: /)[0])
  )
  const parts = []
  if (tests.length) parts.push(`${tests.length} failed test(s)`)
  if (files.length) parts.push(`${files.length} file(s) that did not run`)
  const summary = parts.length
    ? `${parts.join(' and ')} in ${touched.size} file(s)`
    : ''
  return { tests, files, summary }
}
