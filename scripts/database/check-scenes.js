const fs = require('fs');
const path = require('path');

const SCENES_DIR = './src/scenes';
const SRC_DIR = './src';

function findSceneIds() {
  const ids = [];
  
  function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        walkDir(filePath);
      } else if (file.endsWith('.ts') && !file.endsWith('.test.ts')) {
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Строковые ID
        const regex1 = /new Scenes\.(WizardScene|BaseScene)[^(]*\(\s*['"]([^'"]+)['"]/g;
        let match;
        while ((match = regex1.exec(content)) !== null) {
          ids.push({ id: match[2], file: filePath, type: 'string' });
        }
        
        // ModeEnum ID
        const regex2 = /new Scenes\.(WizardScene|BaseScene)[^(]*\(\s*(ModeEnum\.\w+)/g;
        while ((match = regex2.exec(content)) !== null) {
          ids.push({ id: match[2], file: filePath, type: 'ModeEnum' });
        }
      }
    }
  }
  
  walkDir(SCENES_DIR);
  return ids;
}

function findEnterCalls() {
  const calls = [];
  
  function walkDir(dir) {
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory() && !filePath.includes('node_modules') && !filePath.includes('__tests__')) {
          walkDir(filePath);
        } else if (file.endsWith('.ts') && !file.endsWith('.test.ts')) {
          const content = fs.readFileSync(filePath, 'utf-8');
          const lines = content.split('\n');
          
          lines.forEach((line, index) => {
            // Строковые вызовы
            const strMatch = line.match(/ctx\.scene\.enter\s*\(\s*['"]([^'"]+)['"]/);
            if (strMatch) {
              calls.push({ id: strMatch[1], file: filePath, line: index + 1 });
            }
            // ModeEnum вызовы
            const modeMatch = line.match(/ctx\.scene\.enter\s*\(\s*(ModeEnum\.\w+)/);
            if (modeMatch) {
              calls.push({ id: modeMatch[1], file: filePath, line: index + 1 });
            }
          });
        }
      }
    } catch (e) {
      // Ignore errors
    }
  }
  
  walkDir(SRC_DIR);
  return calls;
}

const scenes = findSceneIds();
const calls = findEnterCalls();
const sceneIds = new Set(scenes.map(s => s.id));

console.log('═'.repeat(70));
console.log('🔍 ПРОВЕРКА СОГЛАСОВАННОСТИ СЦЕН');
console.log('═'.repeat(70));
console.log('');
console.log('📋 ЗАРЕГИСТРИРОВАННЫЕ СЦЕНЫ:', scenes.length);
scenes.forEach(s => console.log('  •', s.id, '-', s.file.replace('./src/', '')));
console.log('');
console.log('❌ НЕСУЩЕСТВУЮЩИЕ СЦЕНЫ (вызываемые но не зарегистрированные):');
const missing = [];
calls.forEach(c => {
  if (!c.id.startsWith('ModeEnum.') && !sceneIds.has(c.id)) {
    missing.push(c);
  }
});
if (missing.length === 0) {
  console.log('  ✅ Все вызываемые сцены существуют');
} else {
  missing.forEach(m => console.log('  ❌', m.id, '-', m.file + ':' + m.line));
}
console.log('');
console.log('⚠️  СТРОКОВЫЕ ЛИТЕРАЛЫ (рекомендуется ModeEnum):');
const strLiterals = calls.filter(c => !c.id.startsWith('ModeEnum.'));
console.log('  Найдено:', strLiterals.length, 'вызовов');
strLiterals.slice(0, 20).forEach(c => console.log('  •', c.id, '-', c.file.replace('./src/', '') + ':' + c.line));
if (strLiterals.length > 20) console.log('  ... и ещё', strLiterals.length - 20);
console.log('');
console.log('═'.repeat(70));
console.log('📊 ИТОГ:');
console.log('  • Сцен зарегистрировано:', scenes.length);
console.log('  • Уникальных ID:', sceneIds.size);
console.log('  • Вызовов scene.enter:', calls.length);
console.log('  • Строковых литералов:', strLiterals.length);
console.log('  • Ошибок:', missing.length > 0 ? '❌ ЕСТЬ (' + missing.length + ')' : '✅ НЕТ');
console.log('═'.repeat(70));
