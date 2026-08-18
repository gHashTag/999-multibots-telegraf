// Script Templates System
// Save and reuse successful scripts as templates

export interface ScriptTemplate {
  id: string;
  name: string;
  description: string;
  topic: string;
  duration: number;
  language: 'ru' | 'en';
  niche: string;
  style: 'educational' | 'entertaining' | 'promotional' | 'storytelling';
  tags: string[];
  createdAt: number;
  usageCount: number;
}

const STORAGE_KEY = 'vibee_script_templates';

export class TemplateService {
  /**
   * Get all templates
   */
  static getAll(): ScriptTemplate[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to load templates:', error);
      return [];
    }
  }

  /**
   * Save a new template
   */
  static saveTemplate(params: Omit<ScriptTemplate, 'id' | 'createdAt' | 'usageCount'>): string {
    const template: ScriptTemplate = {
      ...params,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      usageCount: 0,
    };

    const templates = this.getAll();
    templates.push(template);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    } catch (error) {
      console.error('Failed to save template:', error);
    }

    return template.id;
  }

  /**
   * Get template by ID
   */
  static getById(id: string): ScriptTemplate | undefined {
    const templates = this.getAll();
    return templates.find(t => t.id === id);
  }

  /**
   * Delete template
   */
  static deleteTemplate(id: string): void {
    const templates = this.getAll();
    const filtered = templates.filter(t => t.id !== id);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error('Failed to delete template:', error);
    }
  }

  /**
   * Update template
   */
  static updateTemplate(id: string, updates: Partial<Omit<ScriptTemplate, 'id' | 'createdAt'>>): boolean {
    const templates = this.getAll();
    const index = templates.findIndex(t => t.id === id);

    if (index === -1) {
      return false;
    }

    templates[index] = { ...templates[index], ...updates };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
      return true;
    } catch (error) {
      console.error('Failed to update template:', error);
      return false;
    }
  }

  /**
   * Increment usage count
   */
  static incrementUsage(id: string): void {
    const template = this.getById(id);
    if (template) {
      this.updateTemplate(id, { usageCount: template.usageCount + 1 });
    }
  }

  /**
   * Get popular templates
   */
  static getPopular(limit: number = 5): ScriptTemplate[] {
    const templates = this.getAll();
    return templates
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, limit);
  }

  /**
   * Search templates
   */
  static search(query: string): ScriptTemplate[] {
    if (!query) {
      return this.getAll();
    }

    const templates = this.getAll();
    const lowerQuery = query.toLowerCase();

    return templates.filter(t =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Export templates
   */
  static exportTemplates(): string {
    const templates = this.getAll();
    return JSON.stringify(templates, null, 2);
  }

  /**
   * Import templates
   */
  static importTemplates(jsonString: string): void {
    try {
      const imported = JSON.parse(jsonString) as ScriptTemplate[];
      
      if (!Array.isArray(imported)) {
        throw new Error('Invalid format');
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
    } catch (error) {
      console.error('Failed to import templates:', error);
      throw error;
    }
  }

  /**
   * Clear all templates
   */
  static clearAll(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear templates:', error);
    }
  }
}
