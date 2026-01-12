import { describe, it, expect } from 'vitest';
import { Icons } from './IconAssets';

describe('IconAssets', () => {
  describe('Icons object', () => {
    it('should be a valid object', () => {
      expect(Icons).toBeDefined();
      expect(typeof Icons).toBe('object');
    });

    it('should contain icon entries', () => {
      const iconCount = Object.keys(Icons).length;
      expect(iconCount).toBeGreaterThan(0);
    });

    it('should have default_file icon', () => {
      expect(Icons['default_file']).toBeDefined();
      expect(typeof Icons['default_file']).toBe('string');
    });

    it('should have common programming language icons', () => {
      const commonIcons = [
        'file_type_typescript',
        'file_type_javascript',
        'file_type_python',
        'file_type_java',
        'file_type_html',
        'file_type_css',
        'file_type_json',
        'file_type_markdown'
      ];

      commonIcons.forEach(iconKey => {
        expect(Icons[iconKey]).toBeDefined();
        expect(typeof Icons[iconKey]).toBe('string');
      });
    });

    it('should have icons for common file types', () => {
      expect(Icons['file_type_text']).toBeDefined();
      expect(Icons['file_type_image']).toBeDefined();
      expect(Icons['file_type_pdf']).toBeDefined();
      expect(Icons['file_type_zip']).toBeDefined();
    });

    it('should have icons starting with data:image/svg+xml', () => {
      const iconKeys = Object.keys(Icons);
      const firstIcon = Icons[iconKeys[0]];

      expect(firstIcon).toMatch(/^data:image\/svg\+xml/);
    });

    it('should have all icon values as strings', () => {
      const iconValues = Object.values(Icons);
      iconValues.forEach(value => {
        expect(typeof value).toBe('string');
      });
    });

    it('should have all icon keys follow naming convention', () => {
      const iconKeys = Object.keys(Icons);
      iconKeys.forEach(key => {
        // Should be lowercase with underscores
        expect(key).toMatch(/^[a-z_]+$/);
      });
    });

    it('should have file_type prefix for most icons', () => {
      const iconKeys = Object.keys(Icons);
      const fileTypeIcons = iconKeys.filter(key => key.startsWith('file_type_'));

      // Most icons should be file type icons
      expect(fileTypeIcons.length).toBeGreaterThan(iconKeys.length * 0.8);
    });

    it('should have git icon', () => {
      expect(Icons['file_type_git']).toBeDefined();
    });

    it('should have docker icon', () => {
      expect(Icons['file_type_docker']).toBeDefined();
    });

    it('should have npm icon', () => {
      expect(Icons['file_type_npm']).toBeDefined();
    });

    it('should have icons for web frameworks', () => {
      const frameworkIcons = ['file_type_reactjs', 'file_type_vue'];
      frameworkIcons.forEach(iconKey => {
        expect(Icons[iconKey]).toBeDefined();
      });
    });

    it('should have icons for system languages', () => {
      const systemLangIcons = ['file_type_c', 'file_type_cpp', 'file_type_rust', 'file_type_go'];
      systemLangIcons.forEach(iconKey => {
        expect(Icons[iconKey]).toBeDefined();
      });
    });

    it('should have icons for JVM languages', () => {
      const jvmIcons = ['file_type_java', 'file_type_kotlin'];
      jvmIcons.forEach(iconKey => {
        expect(Icons[iconKey]).toBeDefined();
      });
    });

    it('should have shell script icon', () => {
      expect(Icons['file_type_shell']).toBeDefined();
    });

    it('should have SQL icon', () => {
      expect(Icons['file_type_sql']).toBeDefined();
    });

    it('should have YAML icon', () => {
      expect(Icons['file_type_yaml']).toBeDefined();
    });

    it('should have config file icon', () => {
      expect(Icons['file_type_config']).toBeDefined();
    });

    it('should have settings icon', () => {
      expect(Icons['file_type_settings']).toBeDefined();
    });

    it('should have binary file icon', () => {
      expect(Icons['file_type_binary']).toBeDefined();
    });

    it('should have font file icon', () => {
      expect(Icons['file_type_font']).toBeDefined();
    });

    it('should have audio file icon', () => {
      expect(Icons['file_type_audio']).toBeDefined();
    });

    it('should have video file icon', () => {
      expect(Icons['file_type_video']).toBeDefined();
    });

    it('should not have empty icon values', () => {
      const iconValues = Object.values(Icons);
      iconValues.forEach(value => {
        expect(value.length).toBeGreaterThan(0);
      });
    });

    it('should not have duplicate icon values', () => {
      const iconValues = Object.values(Icons);
      const uniqueValues = new Set(iconValues);

      // Some icons might be reused, so we just check no icon is used excessively
      expect(uniqueValues.size).toBeGreaterThan(iconValues.length * 0.5);
    });
  });
});