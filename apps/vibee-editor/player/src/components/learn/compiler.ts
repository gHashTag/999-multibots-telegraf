import type { CompilationResult } from './types';

class VibeeCompiler {
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
      (_match, name, variants) => {
        const variantList = variants.split(',').map((v: string) => v.trim()).join('\n  ');
        return `pub type ${name} {\n  ${variantList}\n}`;
      }
    );

    // Transform @record macro
    gleamCode = gleamCode.replace(
      /@record\s+(\w+):\s*\{([^}]+)\}/g,
      (_match, name, fields) => {
        const fieldList = fields.trim().split(',').map((f: string) => {
          const [fieldName, fieldType] = f.trim().split(':').map((s: string) => s.trim());
          return `    ${fieldName}: ${fieldType}`;
        }).join(',\n');
        return `pub type ${name} {\n  ${name}(\n${fieldList}\n  )\n}`;
      }
    );

    // Transform decorators
    gleamCode = gleamCode.replace(/@cache\([^)]+\)\s*/g, '// @cache decorator\n');
    gleamCode = gleamCode.replace(/@retry\([^)]+\)\s*/g, '// @retry decorator\n');
    gleamCode = gleamCode.replace(/@log\([^)]+\)\s*/g, '// @log decorator\n');

    // Transform intent to pub fn
    gleamCode = gleamCode.replace(
      /intent\s+(\w+)\s*\((.*?)\)\s*(?:->\s*(\w+(?:<.*?>)?))?\s*/g,
      (_match, name, params, returnType) => {
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
    const printMatches = gleamCode.match(/io\.println\("(.*)"\)/g);
    if (printMatches) {
      return printMatches
        .map(match => {
          const content = match.match(/"(.*)"/)?.[1] || '';
          return content;
        })
        .join('\n');
    }

    const functionMatch = gleamCode.match(/pub fn \w+\([^)]*\)[^{]*\{([^}]+)\}/);
    if (functionMatch) {
      const body = functionMatch[1].trim();
      const result = body.replace(/\s*<>\s*/g, '');
      return `Function returns: ${result}`;
    }

    return 'Code compiled successfully!';
  }
}

export const compiler = new VibeeCompiler();
