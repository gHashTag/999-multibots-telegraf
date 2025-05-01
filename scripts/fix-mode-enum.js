/**
 * Script to fix ModeEnum imports in TypeScript files.
 * ModeEnum is used both as a value and a type, so we need to ensure
 * it's imported correctly in each file.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Create backup directory
const timestamp = new Date().toISOString().replace(/[:.]/g, '').split('T')[0] + '_' + 
  new Date().toTimeString().split(' ')[0].replace(/:/g, '');
const backupDir = path.join(process.cwd(), `backup_mode_enum_${timestamp}`);

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// Use grep to find all TypeScript files that import ModeEnum
const findFilesCommand = 'grep -r --include="*.ts" "import.*ModeEnum" src/ __tests__/ || echo ""';
console.log(`Finding files with ModeEnum imports...`);
const grepOutput = execSync(findFilesCommand, { encoding: 'utf-8' });

// Extract file paths from grep output
const filePaths = grepOutput
  .split('\n')
  .filter(line => line.trim() !== '')
  .map(line => line.split(':')[0])
  .filter((value, index, self) => self.indexOf(value) === index); // Get unique file paths

console.log(`Found ${filePaths.length} files with ModeEnum imports.`);

let fixedFiles = 0;

// Process each file
for (const filePath of filePaths) {
  if (!fs.existsSync(filePath)) {
    console.log(`File ${filePath} does not exist. Skipping.`);
    continue;
  }

  // Create backup of the file
  const backupPath = path.join(backupDir, path.relative(process.cwd(), filePath));
  const backupDirPath = path.dirname(backupPath);
  
  if (!fs.existsSync(backupDirPath)) {
    fs.mkdirSync(backupDirPath, { recursive: true });
  }
  
  fs.copyFileSync(filePath, backupPath);
  
  // Read file content
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Check if ModeEnum is used as a value in the file
  const usedAsValue = 
    content.includes('ModeEnum.') || 
    content.includes('Object.values(ModeEnum)') || 
    content.includes('Object.keys(ModeEnum)') ||
    content.includes('ModeEnum[') ||
    content.includes('= ModeEnum') ||
    content.includes(' = ModeEnum') || 
    content.includes('(ModeEnum)');
  
  // Find the import statement for ModeEnum
  const importRegex = /import\s+(?:type\s+)?{([^}]*)(?:ModeEnum)(?:[^}]*?)}\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  let updatedContent = content;
  
  while ((match = importRegex.exec(content)) !== null) {
    const importStatement = match[0];
    const importedItems = match[1];
    const fromModule = match[2];
    
    // If ModeEnum is used as a value, we need to separate its import
    if (usedAsValue) {
      // Parse the imported items
      const items = importedItems.split(',').map(item => item.trim())
        .filter(item => item !== '' && !item.includes('ModeEnum'));
      
      // Create the new import statements
      let newImports = '';
      
      // Type imports
      if (items.length > 0) {
        newImports += `import type { ${items.join(', ')} } from '${fromModule}';\n`;
      }
      
      // Value import for ModeEnum
      newImports += `import { ModeEnum } from '${fromModule}';\n`;
      
      // Replace the original import statement
      updatedContent = updatedContent.replace(importStatement, newImports.trim());
      fixedFiles++;
      
      console.log(`Fixed ModeEnum import in ${filePath} (used as value).`);
    } else {
      // Just make sure it's imported as a type
      const newImportStatement = importStatement.replace('import {', 'import type {');
      if (newImportStatement !== importStatement) {
        updatedContent = updatedContent.replace(importStatement, newImportStatement);
        fixedFiles++;
        console.log(`Fixed ModeEnum import in ${filePath} (used as type only).`);
      }
    }
  }
  
  // Write the updated content back to the file
  if (updatedContent !== content) {
    fs.writeFileSync(filePath, updatedContent, 'utf-8');
  }
}

console.log(`Fixed ModeEnum imports in ${fixedFiles} files.`);
console.log(`Backup files saved to ${backupDir}`);
console.log('Done.'); 