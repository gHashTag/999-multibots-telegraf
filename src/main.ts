import { simpleHelper } from '@/utils/helper'

export const mainFunction = () => {
  const result = simpleHelper('hello')
  console.log(result)
  return result
}

mainFunction() // Вызовем функцию для проверки
