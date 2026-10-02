export interface GateReport {
  testResults?: Array<{
    name: string
    status: string
    message?: string
    assertionResults?: Array<{
      ancestorTitles?: string[]
      title: string
      status: string
    }>
  }>
}

export function failures(
  report: GateReport,
  root: string
): { tests: string[]; files: string[]; summary: string }
