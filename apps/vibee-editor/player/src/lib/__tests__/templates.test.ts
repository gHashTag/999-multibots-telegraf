import { describe, it, expect, beforeEach } from 'vitest';
import { TemplateService } from '../templates';

describe('TemplateService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('saveTemplate', () => {
    it('should save a template and return id', () => {
      const template = {
        name: 'Test Template',
        description: 'A test template',
        topic: 'AI',
        duration: 60,
        language: 'ru' as const,
        niche: 'tech',
        style: 'educational' as const,
        tags: ['ai', 'tech'],
      };

      const id = TemplateService.saveTemplate(template);

      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
    });

    it('should store template in localStorage', () => {
      const template = {
        name: 'Test Template',
        description: 'A test template',
        topic: 'AI',
        duration: 60,
        language: 'ru' as const,
        niche: 'tech',
        style: 'educational' as const,
        tags: ['ai', 'tech'],
      };

      TemplateService.saveTemplate(template);
      const templates = TemplateService.getAll();

      expect(templates).toHaveLength(1);
      expect(templates[0].name).toBe('Test Template');
    });

    it('should add metadata to template', () => {
      const template = {
        name: 'Test Template',
        description: 'A test template',
        topic: 'AI',
        duration: 60,
        language: 'ru' as const,
        niche: 'tech',
        style: 'educational' as const,
        tags: ['ai', 'tech'],
      };

      const id = TemplateService.saveTemplate(template);
      const saved = TemplateService.getById(id);

      expect(saved).toBeTruthy();
      expect(saved?.id).toBe(id);
      expect(saved?.createdAt).toBeTruthy();
      expect(saved?.usageCount).toBe(0);
    });
  });

  describe('getAll', () => {
    it('should return empty array when no templates', () => {
      const templates = TemplateService.getAll();
      expect(templates).toEqual([]);
    });

    it('should return all templates', () => {
      TemplateService.saveTemplate({
        name: 'Template 1',
        description: 'First',
        topic: 'AI',
        duration: 60,
        language: 'ru',
        niche: 'tech',
        style: 'educational',
        tags: ['ai'],
      });

      TemplateService.saveTemplate({
        name: 'Template 2',
        description: 'Second',
        topic: 'ML',
        duration: 90,
        language: 'en',
        niche: 'tech',
        style: 'entertaining',
        tags: ['ml'],
      });

      const templates = TemplateService.getAll();
      expect(templates).toHaveLength(2);
    });
  });

  describe('getById', () => {
    it('should return template by id', () => {
      const id = TemplateService.saveTemplate({
        name: 'Test Template',
        description: 'A test',
        topic: 'AI',
        duration: 60,
        language: 'ru',
        niche: 'tech',
        style: 'educational',
        tags: ['ai'],
      });

      const template = TemplateService.getById(id);
      expect(template).toBeTruthy();
      expect(template?.id).toBe(id);
      expect(template?.name).toBe('Test Template');
    });

    it('should return undefined for non-existent id', () => {
      const template = TemplateService.getById('non-existent-id');
      expect(template).toBeUndefined();
    });
  });

  describe('deleteTemplate', () => {
    it('should delete template by id', () => {
      const id = TemplateService.saveTemplate({
        name: 'Test Template',
        description: 'A test',
        topic: 'AI',
        duration: 60,
        language: 'ru',
        niche: 'tech',
        style: 'educational',
        tags: ['ai'],
      });

      expect(TemplateService.getById(id)).toBeTruthy();

      TemplateService.deleteTemplate(id);

      expect(TemplateService.getById(id)).toBeUndefined();
    });

    it('should not affect other templates', () => {
      const id1 = TemplateService.saveTemplate({
        name: 'Template 1',
        description: 'First',
        topic: 'AI',
        duration: 60,
        language: 'ru',
        niche: 'tech',
        style: 'educational',
        tags: ['ai'],
      });

      const id2 = TemplateService.saveTemplate({
        name: 'Template 2',
        description: 'Second',
        topic: 'ML',
        duration: 90,
        language: 'en',
        niche: 'tech',
        style: 'entertaining',
        tags: ['ml'],
      });

      TemplateService.deleteTemplate(id1);

      expect(TemplateService.getById(id1)).toBeUndefined();
      expect(TemplateService.getById(id2)).toBeTruthy();
    });
  });

  describe('updateTemplate', () => {
    it('should update template fields', () => {
      const id = TemplateService.saveTemplate({
        name: 'Original Name',
        description: 'Original description',
        topic: 'AI',
        duration: 60,
        language: 'ru',
        niche: 'tech',
        style: 'educational',
        tags: ['ai'],
      });

      TemplateService.updateTemplate(id, {
        name: 'Updated Name',
        description: 'Updated description',
      });

      const template = TemplateService.getById(id);
      expect(template?.name).toBe('Updated Name');
      expect(template?.description).toBe('Updated description');
      expect(template?.topic).toBe('AI'); // Unchanged
    });

    it('should not update non-existent template', () => {
      const result = TemplateService.updateTemplate('non-existent', {
        name: 'New Name',
      });

      expect(result).toBe(false);
    });
  });

  describe('incrementUsage', () => {
    it('should increment usage count', () => {
      const id = TemplateService.saveTemplate({
        name: 'Test Template',
        description: 'A test',
        topic: 'AI',
        duration: 60,
        language: 'ru',
        niche: 'tech',
        style: 'educational',
        tags: ['ai'],
      });

      let template = TemplateService.getById(id);
      expect(template?.usageCount).toBe(0);

      TemplateService.incrementUsage(id);
      template = TemplateService.getById(id);
      expect(template?.usageCount).toBe(1);

      TemplateService.incrementUsage(id);
      template = TemplateService.getById(id);
      expect(template?.usageCount).toBe(2);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      TemplateService.saveTemplate({
        name: 'AI Tutorial',
        description: 'Learn about artificial intelligence',
        topic: 'AI basics',
        duration: 60,
        language: 'ru',
        niche: 'tech',
        style: 'educational',
        tags: ['ai', 'tutorial', 'beginner'],
      });

      TemplateService.saveTemplate({
        name: 'ML Advanced',
        description: 'Machine learning for experts',
        topic: 'Deep learning',
        duration: 120,
        language: 'en',
        niche: 'tech',
        style: 'educational',
        tags: ['ml', 'advanced', 'neural-networks'],
      });

      TemplateService.saveTemplate({
        name: 'Cooking Tips',
        description: 'Quick cooking recipes',
        topic: 'Italian cuisine',
        duration: 90,
        language: 'ru',
        niche: 'lifestyle',
        style: 'entertaining',
        tags: ['cooking', 'food', 'recipes'],
      });
    });

    it('should search by name', () => {
      const results = TemplateService.search('AI');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('AI Tutorial');
    });

    it('should search by description', () => {
      const results = TemplateService.search('experts');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('ML Advanced');
    });

    it('should search by tags', () => {
      const results = TemplateService.search('cooking');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Cooking Tips');
    });

    it('should be case-insensitive', () => {
      const results = TemplateService.search('ai');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('AI Tutorial');
    });

    it('should return empty array for no matches', () => {
      const results = TemplateService.search('nonexistent');
      expect(results).toHaveLength(0);
    });

    it('should return all templates for empty query', () => {
      const results = TemplateService.search('');
      expect(results).toHaveLength(3);
    });
  });

  describe('getPopular', () => {
    it('should return templates sorted by usage', () => {
      const id1 = TemplateService.saveTemplate({
        name: 'Template 1',
        description: 'First',
        topic: 'AI',
        duration: 60,
        language: 'ru',
        niche: 'tech',
        style: 'educational',
        tags: ['ai'],
      });

      const id2 = TemplateService.saveTemplate({
        name: 'Template 2',
        description: 'Second',
        topic: 'ML',
        duration: 90,
        language: 'en',
        niche: 'tech',
        style: 'entertaining',
        tags: ['ml'],
      });

      const id3 = TemplateService.saveTemplate({
        name: 'Template 3',
        description: 'Third',
        topic: 'DL',
        duration: 120,
        language: 'ru',
        niche: 'tech',
        style: 'educational',
        tags: ['dl'],
      });

      // Use templates in different amounts
      TemplateService.incrementUsage(id2);
      TemplateService.incrementUsage(id2);
      TemplateService.incrementUsage(id2);
      TemplateService.incrementUsage(id3);

      const popular = TemplateService.getPopular(2);
      expect(popular).toHaveLength(2);
      expect(popular[0].id).toBe(id2); // Most used
      expect(popular[1].id).toBe(id3); // Second most used
    });

    it('should limit results to specified count', () => {
      for (let i = 0; i < 5; i++) {
        TemplateService.saveTemplate({
          name: `Template ${i}`,
          description: `Template ${i}`,
          topic: 'AI',
          duration: 60,
          language: 'ru',
          niche: 'tech',
          style: 'educational',
          tags: ['ai'],
        });
      }

      const popular = TemplateService.getPopular(3);
      expect(popular).toHaveLength(3);
    });
  });

  describe('exportTemplates', () => {
    it('should export templates as JSON string', () => {
      TemplateService.saveTemplate({
        name: 'Test Template',
        description: 'A test',
        topic: 'AI',
        duration: 60,
        language: 'ru',
        niche: 'tech',
        style: 'educational',
        tags: ['ai'],
      });

      const exported = TemplateService.exportTemplates();
      expect(typeof exported).toBe('string');
      
      const parsed = JSON.parse(exported);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
    });
  });

  describe('importTemplates', () => {
    it('should import templates from JSON string', () => {
      const templates = [
        {
          id: 'test-id-1',
          name: 'Imported Template',
          description: 'Imported',
          topic: 'AI',
          duration: 60,
          language: 'ru',
          niche: 'tech',
          style: 'educational',
          tags: ['ai'],
          createdAt: Date.now(),
          usageCount: 5,
        },
      ];

      const json = JSON.stringify(templates);
      TemplateService.importTemplates(json);

      const imported = TemplateService.getAll();
      expect(imported).toHaveLength(1);
      expect(imported[0].name).toBe('Imported Template');
      expect(imported[0].usageCount).toBe(5);
    });

    it('should replace existing templates on import', () => {
      TemplateService.saveTemplate({
        name: 'Existing',
        description: 'Existing',
        topic: 'AI',
        duration: 60,
        language: 'ru',
        niche: 'tech',
        style: 'educational',
        tags: ['ai'],
      });

      const newTemplates = [
        {
          id: 'new-id',
          name: 'New Template',
          description: 'New',
          topic: 'ML',
          duration: 90,
          language: 'en',
          niche: 'tech',
          style: 'entertaining',
          tags: ['ml'],
          createdAt: Date.now(),
          usageCount: 0,
        },
      ];

      TemplateService.importTemplates(JSON.stringify(newTemplates));

      const templates = TemplateService.getAll();
      expect(templates).toHaveLength(1);
      expect(templates[0].name).toBe('New Template');
    });
  });
});
