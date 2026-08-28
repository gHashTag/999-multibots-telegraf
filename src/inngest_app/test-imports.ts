/**
 * Test imports from functions/index.ts
 */

import * as allFunctions from './functions/index'

console.log('\n=== ALL EXPORTED NAMES ===')
const exportedNames = Object.keys(allFunctions)
exportedNames.forEach((name, index) => {
  console.log(`${(index + 1).toString().padStart(2, '0')}. ${name}`)
})

console.log(`\nTotal exports: ${exportedNames.length}`)

console.log('\n=== FUNCTION-LIKE EXPORTS ===')
const functionExports = exportedNames.filter(name => {
  const exported = (allFunctions as any)[name]
  return typeof exported === 'object' && exported?.id
})

functionExports.forEach((name, index) => {
  const fn = (allFunctions as any)[name]
  console.log(
    `${(index + 1).toString().padStart(2, '0')}. ${name} => ${fn?.id}`
  )
})

console.log(`\nTotal functions: ${functionExports.length}`)

try {
  const functionsArray = allFunctions.getAllFunctions()
  console.log(`\n=== getAllFunctions() Result ===`)
  console.log(`Returned ${functionsArray.length} functions`)
  functionsArray.forEach((fn: any, index: number) => {
    console.log(`${(index + 1).toString().padStart(2, '0')}. ${fn.id}`)
  })
} catch (error) {
  console.error('\n=== getAllFunctions() ERROR ===')
  console.error(error)
}
