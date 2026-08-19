/**
 * ЗАГЛУШКИ ВАЛИДАЦИИ БАЗЫ — в ЖИВОМ коде.
 *
 * Обе функции возвращают успех безусловно, ничего не проверяя. При этом их
 * вызывают две ЗАРЕГИСТРИРОВАННЫЕ Inngest-функции:
 *   functions/content/findCompetitors.ts:177 и :180
 *   functions/content/analyzeCompetitorReels.ts:254
 * — обе внутри шага `step.run('validate-project', ...)`, под комментарием
 * «Use proper project validation».
 *
 * Почему НЕ сделаны бросающими, в отличие от других заглушек проекта: эти
 * вызываются в проде, и падение сломало бы работающий поиск конкурентов.
 * Заглушка, которая врёт, плоха; заглушка, которая роняет живую функцию,
 * хуже.
 *
 * Что на самом деле не проверяется: project_id из события уходит в базу без
 * подтверждения существования проекта (findCompetitors.ts:253 кладёт его в
 * competitorData → db.saveCompetitors). Результат этих функций присваивается
 * переменной projectValidation и НИГДЕ НЕ ЧИТАЕТСЯ — то есть даже вернись
 * отсюда `{ valid: false }`, ничего бы не изменилось.
 *
 * Чинить надо не здесь: сначала научить вызывающих читать ответ, потом
 * заменить тела настоящими запросами. Пока этого нет, файл обязан честно
 * называться заглушками — и называется.
 */

export async function validateProjectInStep(projectId?: number | string) {
  console.log('[DB Validation Stub] validateProjectInStep', projectId);
  return { valid: true };
}

export async function ensureProjectsTableExists() {
  console.log('[DB Validation Stub] ensureProjectsTableExists');
  return { exists: true };
}
