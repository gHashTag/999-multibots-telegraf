import { CompilationResult, CompilationError } from './types';

/**
 * Simplified Vibee to Gleam compiler for educational purposes
 * Shows the transformation from Vibee syntax to Gleam
 */
export class VibeeCompiler {
  compile(vibeeCode: string): CompilationResult {
    try {
      const gleamCode = this.transformToGleam(vibeeCode);
      const output = this.executeCode(gleamCode);
      
      return {
        success: true,
        vibeeCode,
        gleamCode,
        output,
        errors: [],
      };
    } catch (error) {
      return {
        success: false,
        vibeeCode,
        gleamCode: '',
        output: '',
        errors: [{
          line: 1,
          column: 1,
          message: error instanceof Error ? error.message : 'Unknown error',
          severity: 'error',
        }],
      };
    }
  }

  private transformToGleam(vibeeCode: string): string {
    let gleamCode = vibeeCode;

    // Transform @enum macro
    gleamCode = gleamCode.replace(
      /@enum\s+(\w+):\s*\[([\w,\s]+)\]/g,
      (match, name, variants) => {
        const variantList = variants.split(',').map(v => v.trim()).join('\n  ');
        return `pub type ${name} {\n  ${variantList}\n}`;
      }
    );

    // Transform @record macro
    gleamCode = gleamCode.replace(
      /@record\s+(\w+):\s*\{([^}]+)\}/g,
      (match, name, fields) => {
        const fieldList = fields.trim().split(',').map(f => {
          const [fieldName, fieldType] = f.trim().split(':').map(s => s.trim());
          return `    ${fieldName}: ${fieldType}`;
        }).join(',\n');
        return `pub type ${name} {\n  ${name}(\n${fieldList}\n  )\n}`;
      }
    );

    // Transform @fn macro
    gleamCode = gleamCode.replace(
      /@fn\s+(\w+)\s*\((.*?)\)\s*->\s*(\w+):\s*\n\s*(.+)/g,
      (match, name, params, returnType, body) => {
        const formattedParams = this.formatParameters(params);
        return `pub fn ${name}(${formattedParams}) -> ${returnType} {\n  ${body}\n}`;
      }
    );

    // Transform @smart_constructor
    gleamCode = gleamCode.replace(
      /@smart_constructor\(validate:\s*(\w+)\)\s*\ntype\s+(\w+)\s*\{([^}]+)\}/g,
      (match, validateFn, typeName, typeBody) => {
        return `pub type ${typeName} {${typeBody}}\n\npub fn new_${typeName.toLowerCase()}(value: String) -> Result(${typeName}, String) {\n  case ${validateFn}(value) {\n    Ok(valid) -> Ok(${typeName}(valid))\n    Error(e) -> Error(e)\n  }\n}`;
      }
    );

    // Transform @intent declarations (simplified for display)
    gleamCode = gleamCode.replace(
      /@intent\s+(\w+):/g,
      '// Intent: $1\n// (Full intent system requires runtime)'
    );

    // Transform decorators
    gleamCode = gleamCode.replace(/@cache\([^)]+\)\s*/g, '// @cache decorator\n');
    gleamCode = gleamCode.replace(/@retry\([^)]+\)\s*/g, '// @retry decorator\n');
    gleamCode = gleamCode.replace(/@log\([^)]+\)\s*/g, '// @log decorator\n');

    // Transform intent to pub fn
    gleamCode = gleamCode.replace(
      /intent\s+(\w+)\s*\((.*?)\)\s*(?:->\s*(\w+(?:<.*?>)?))?\s*/g,
      (match, name, params, returnType) => {
        const formattedParams = this.formatParameters(params);
        const returnTypeStr = returnType ? ` -> ${returnType}` : ' -> String';
        return `pub fn ${name}(${formattedParams})${returnTypeStr} {\n`;
      }
    );

    // Transform end to }
    gleamCode = gleamCode.replace(/\bend\b/g, '}');

    // Transform pipe operators
    gleamCode = gleamCode.replace(/\|>>/g, '|> tap');
    gleamCode = gleamCode.replace(/\|\?/g, '|> result.try');
    gleamCode = gleamCode.replace(/\|@/g, '|> list.index_map');

    // Transform operator sections
    gleamCode = gleamCode.replace(/\(\s*>\s*(\d+)\s*\)/g, 'fn(x) { x > $1 }');
    gleamCode = gleamCode.replace(/\(\s*<\s*(\d+)\s*\)/g, 'fn(x) { x < $1 }');
    gleamCode = gleamCode.replace(/\(\s*==\s*(\d+)\s*\)/g, 'fn(x) { x == $1 }');
    gleamCode = gleamCode.replace(/\(\s*\*\s*(\d+)\s*\)/g, 'fn(x) { x * $1 }');
    gleamCode = gleamCode.replace(/\(\s*\+\s*(\d+)\s*\)/g, 'fn(x) { x + $1 }');
    gleamCode = gleamCode.replace(/\(\s*-\s*(\d+)\s*\)/g, 'fn(x) { x - $1 }');
    gleamCode = gleamCode.replace(/\(\s*\/\s*(\d+)\s*\)/g, 'fn(x) { x / $1 }');

    // Transform string interpolation {var} to <> var <>
    gleamCode = gleamCode.replace(
      /"([^"]*)\{(\w+(?:\.\w+)?)\}([^"]*)"/g,
      (match, before, varName, after) => {
        let result = '';
        if (before) result += '"' + before + '" <> ';
        
        // Handle conversions for non-string types
        if (varName.includes('.')) {
          result += varName;
        } else {
          result += varName;
        }
        
        if (after) result += ' <> "' + after + '"';
        else if (!before) result = varName;
        
        return result;
      }
    );

    // Add imports if needed
    const imports: string[] = [];
    if (gleamCode.includes('io.println') || gleamCode.includes('io.debug')) {
      imports.push('import gleam/io');
    }
    if (gleamCode.includes('list.')) {
      imports.push('import gleam/list');
    }
    if (gleamCode.includes('string.')) {
      imports.push('import gleam/string');
    }
    if (gleamCode.includes('int.')) {
      imports.push('import gleam/int');
    }
    if (gleamCode.includes('result.')) {
      imports.push('import gleam/result');
    }
    if (gleamCode.includes('option.')) {
      imports.push('import gleam/option');
    }

    if (imports.length > 0) {
      gleamCode = imports.join('\n') + '\n\n' + gleamCode;
    }

    return gleamCode;
  }

  private formatParameters(params: string): string {
    if (!params.trim()) return '';
    
    return params
      .split(',')
      .map(param => {
        const [name, type] = param.trim().split(':').map(s => s.trim());
        return type ? `${name}: ${type}` : `${name}: String`;
      })
      .join(', ');
  }

  private executeCode(gleamCode: string): string {
    // Simplified execution - in real implementation, this would use WASM Gleam compiler
    // For now, we'll simulate execution for educational purposes
    
    // Extract function calls and simulate output
    const printMatches = gleamCode.match(/io\.println\("(.*)"\)/g);
    if (printMatches) {
      return printMatches
        .map(match => {
          const content = match.match(/"(.*)"/)?.[1] || '';
          return content;
        })
        .join('\n');
    }

    // If it's a simple function, show what it would return
    const functionMatch = gleamCode.match(/pub fn \w+\([^)]*\)[^{]*\{([^}]+)\}/);
    if (functionMatch) {
      const body = functionMatch[1].trim();
      // Remove string concatenation operators for display
      const result = body.replace(/\s*<>\s*/g, '');
      return `Function returns: ${result}`;
    }

    return 'Code compiled successfully! ✅';
  }

  /**
   * Validate Vibee code syntax
   */
  validate(vibeeCode: string): CompilationError[] {
    const errors: CompilationError[] = [];
    const lines = vibeeCode.split('\n');

    lines.forEach((line, index) => {
      // Check for unclosed intent blocks
      if (line.includes('intent') && !vibeeCode.includes('end')) {
        errors.push({
          line: index + 1,
          column: 1,
          message: 'Intent block must end with "end"',
          severity: 'error',
        });
      }

      // Check for invalid string interpolation
      if (line.includes('{') && line.includes('}') && !line.includes('"')) {
        errors.push({
          line: index + 1,
          column: line.indexOf('{') + 1,
          message: 'String interpolation must be inside quotes',
          severity: 'error',
        });
      }
    });

    return errors;
  }

  /**
   * Get code mapping between Vibee and Gleam for highlighting
   */
  getCodeMapping(vibeeCode: string, gleamCode: string): Map<number, number> {
    const mapping = new Map<number, number>();
    const vibeeLines = vibeeCode.split('\n');
    const gleamLines = gleamCode.split('\n');

    let gleamOffset = 0;
    
    // Account for imports
    if (gleamCode.startsWith('import')) {
      gleamOffset = gleamCode.split('\n').findIndex(line => line.includes('pub fn'));
    }

    vibeeLines.forEach((line, index) => {
      if (line.trim()) {
        mapping.set(index, index + gleamOffset);
      }
    });

    return mapping;
  }
}

export const compiler = new VibeeCompiler();
