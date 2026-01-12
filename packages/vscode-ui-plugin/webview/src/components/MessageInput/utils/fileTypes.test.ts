import { describe, it, expect } from 'vitest';
import {
  FileType,
  SUPPORTED_TEXT_EXTENSIONS,
  DISALLOWED_BINARY_EXTENSIONS,
  SUPPORTED_IMAGE_EXTENSIONS,
  LANGUAGE_MAP,
  type FileUploadResult,
} from './fileTypes';

describe('fileTypes', () => {
  describe('FileType enum', () => {
    it('should define IMAGE and TEXT types', () => {
      expect(FileType.IMAGE).toBe('image');
      expect(FileType.TEXT).toBe('text');
    });

    it('should only have two file types', () => {
      const types = Object.values(FileType);
      expect(types.length).toBe(2);
    });
  });

  describe('SUPPORTED_TEXT_EXTENSIONS', () => {
    it('should include TypeScript/JavaScript extensions', () => {
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('ts');
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('tsx');
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('js');
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('jsx');
    });

    it('should include Python extensions', () => {
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('py');
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('pyw');
    });

    it('should include JVM language extensions', () => {
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('java');
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('kt');
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('scala');
    });

    it('should include system language extensions', () => {
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('go');
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('rs');
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('cpp');
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('c');
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('h');
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('hpp');
    });

    it('should include shell script extensions', () => {
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('sh');
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('bash');
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('zsh');
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('fish');
    });

    it('should include configuration file extensions', () => {
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('json');
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('yaml');
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('yml');
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('xml');
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('toml');
    });

    it('should include web file extensions', () => {
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('html');
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('css');
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('scss');
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('less');
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('vue');
    });

    it('should include markdown extensions', () => {
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('md');
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('markdown');
    });

    it('should include text file extensions', () => {
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('txt');
      expect(SUPPORTED_TEXT_EXTENSIONS).toContain('log');
    });

    it('should be an array', () => {
      expect(Array.isArray(SUPPORTED_TEXT_EXTENSIONS)).toBe(true);
    });

    it('should not have duplicate extensions', () => {
      const unique = new Set(SUPPORTED_TEXT_EXTENSIONS);
      expect(unique.size).toBe(SUPPORTED_TEXT_EXTENSIONS.length);
    });

    it('should all be lowercase', () => {
      SUPPORTED_TEXT_EXTENSIONS.forEach(ext => {
        expect(ext).toBe(ext.toLowerCase());
      });
    });
  });

  describe('DISALLOWED_BINARY_EXTENSIONS', () => {
    it('should include archive extensions', () => {
      expect(DISALLOWED_BINARY_EXTENSIONS).toContain('zip');
      expect(DISALLOWED_BINARY_EXTENSIONS).toContain('tar');
      expect(DISALLOWED_BINARY_EXTENSIONS).toContain('gz');
      expect(DISALLOWED_BINARY_EXTENSIONS).toContain('7z');
      expect(DISALLOWED_BINARY_EXTENSIONS).toContain('rar');
    });

    it('should include executable extensions', () => {
      expect(DISALLOWED_BINARY_EXTENSIONS).toContain('exe');
      expect(DISALLOWED_BINARY_EXTENSIONS).toContain('dll');
      expect(DISALLOWED_BINARY_EXTENSIONS).toContain('so');
      expect(DISALLOWED_BINARY_EXTENSIONS).toContain('bin');
      expect(DISALLOWED_BINARY_EXTENSIONS).toContain('class');
      expect(DISALLOWED_BINARY_EXTENSIONS).toContain('jar');
    });

    it('should include font extensions', () => {
      expect(DISALLOWED_BINARY_EXTENSIONS).toContain('ttf');
      expect(DISALLOWED_BINARY_EXTENSIONS).toContain('otf');
      expect(DISALLOWED_BINARY_EXTENSIONS).toContain('woff');
      expect(DISALLOWED_BINARY_EXTENSIONS).toContain('woff2');
      expect(DISALLOWED_BINARY_EXTENSIONS).toContain('eot');
    });

    it('should include media extensions', () => {
      expect(DISALLOWED_BINARY_EXTENSIONS).toContain('mp3');
      expect(DISALLOWED_BINARY_EXTENSIONS).toContain('mp4');
      expect(DISALLOWED_BINARY_EXTENSIONS).toContain('mov');
      expect(DISALLOWED_BINARY_EXTENSIONS).toContain('wav');
      expect(DISALLOWED_BINARY_EXTENSIONS).toContain('flac');
    });

    it('should not overlap with SUPPORTED_TEXT_EXTENSIONS', () => {
      const textSet = new Set(SUPPORTED_TEXT_EXTENSIONS);
      const binarySet = new Set(DISALLOWED_BINARY_EXTENSIONS);

      SUPPORTED_TEXT_EXTENSIONS.forEach(ext => {
        expect(binarySet.has(ext)).toBe(false);
      });
    });

    it('should not overlap with SUPPORTED_IMAGE_EXTENSIONS', () => {
      const imageSet = new Set(SUPPORTED_IMAGE_EXTENSIONS);
      const binarySet = new Set(DISALLOWED_BINARY_EXTENSIONS);

      SUPPORTED_IMAGE_EXTENSIONS.forEach(ext => {
        expect(binarySet.has(ext)).toBe(false);
      });
    });
  });

  describe('SUPPORTED_IMAGE_EXTENSIONS', () => {
    it('should include common image formats', () => {
      expect(SUPPORTED_IMAGE_EXTENSIONS).toContain('jpg');
      expect(SUPPORTED_IMAGE_EXTENSIONS).toContain('jpeg');
      expect(SUPPORTED_IMAGE_EXTENSIONS).toContain('png');
      expect(SUPPORTED_IMAGE_EXTENSIONS).toContain('gif');
      expect(SUPPORTED_IMAGE_EXTENSIONS).toContain('webp');
      expect(SUPPORTED_IMAGE_EXTENSIONS).toContain('bmp');
      expect(SUPPORTED_IMAGE_EXTENSIONS).toContain('svg');
    });

    it('should have 7 image extensions', () => {
      expect(SUPPORTED_IMAGE_EXTENSIONS.length).toBe(7);
    });

    it('should all be lowercase', () => {
      SUPPORTED_IMAGE_EXTENSIONS.forEach(ext => {
        expect(ext).toBe(ext.toLowerCase());
      });
    });
  });

  describe('LANGUAGE_MAP', () => {
    it('should map TypeScript/JavaScript extensions', () => {
      expect(LANGUAGE_MAP['ts']).toBe('TypeScript');
      expect(LANGUAGE_MAP['tsx']).toBe('TypeScript');
      expect(LANGUAGE_MAP['js']).toBe('JavaScript');
      expect(LANGUAGE_MAP['jsx']).toBe('JavaScript');
    });

    it('should map Python extensions', () => {
      expect(LANGUAGE_MAP['py']).toBe('Python');
    });

    it('should map system languages', () => {
      expect(LANGUAGE_MAP['go']).toBe('Go');
      expect(LANGUAGE_MAP['rs']).toBe('Rust');
      expect(LANGUAGE_MAP['cpp']).toBe('C++');
      expect(LANGUAGE_MAP['c']).toBe('C');
    });

    it('should map shell script extensions', () => {
      expect(LANGUAGE_MAP['sh']).toBe('Shell');
      expect(LANGUAGE_MAP['bash']).toBe('Bash');
      expect(LANGUAGE_MAP['zsh']).toBe('Zsh');
      expect(LANGUAGE_MAP['fish']).toBe('Fish');
    });

    it('should map configuration formats', () => {
      expect(LANGUAGE_MAP['json']).toBe('JSON');
      expect(LANGUAGE_MAP['yaml']).toBe('YAML');
      expect(LANGUAGE_MAP['yml']).toBe('YAML');
      expect(LANGUAGE_MAP['xml']).toBe('XML');
      expect(LANGUAGE_MAP['toml']).toBe('TOML');
    });

    it('should map web file extensions', () => {
      expect(LANGUAGE_MAP['html']).toBe('HTML');
      expect(LANGUAGE_MAP['css']).toBe('CSS');
      expect(LANGUAGE_MAP['scss']).toBe('SCSS');
      expect(LANGUAGE_MAP['less']).toBe('LESS');
      expect(LANGUAGE_MAP['vue']).toBe('Vue');
    });

    it('should map markdown extensions', () => {
      expect(LANGUAGE_MAP['md']).toBe('Markdown');
      expect(LANGUAGE_MAP['markdown']).toBe('Markdown');
    });

    it('should have unique language names for primary extensions', () => {
      const primaryLanguages = ['TypeScript', 'JavaScript', 'Python', 'Go', 'Rust'];
      const values = Object.values(LANGUAGE_MAP);

      primaryLanguages.forEach(lang => {
        expect(values.includes(lang)).toBe(true);
      });
    });

    it('should only map extensions that are in SUPPORTED_TEXT_EXTENSIONS', () => {
      const textExtSet = new Set(SUPPORTED_TEXT_EXTENSIONS);
      const mappedExts = Object.keys(LANGUAGE_MAP);

      mappedExts.forEach(ext => {
        expect(textExtSet.has(ext)).toBe(true);
      });
    });
  });

  describe('FileUploadResult interface', () => {
    it('should accept valid image upload result', () => {
      const imageResult: FileUploadResult = {
        type: FileType.IMAGE,
        id: 'img-123',
        fileName: 'test.png',
        size: 1024,
        imageData: {
          data: 'base64data',
          mimeType: 'image/png',
          originalSize: 2048,
          compressedSize: 1024,
          width: 800,
          height: 600
        }
      };

      expect(imageResult.type).toBe(FileType.IMAGE);
      expect(imageResult.imageData).toBeDefined();
      expect(imageResult.textData).toBeUndefined();
    });

    it('should accept valid text upload result', () => {
      const textResult: FileUploadResult = {
        type: FileType.TEXT,
        id: 'txt-456',
        fileName: 'code.ts',
        size: 512,
        textData: {
          content: 'const x = 1;',
          language: 'TypeScript',
          encoding: 'utf-8'
        }
      };

      expect(textResult.type).toBe(FileType.TEXT);
      expect(textResult.textData).toBeDefined();
      expect(textResult.imageData).toBeUndefined();
    });

    it('should accept result without optional data fields', () => {
      const minimalResult: FileUploadResult = {
        type: FileType.TEXT,
        id: 'min-789',
        fileName: 'readme.md',
        size: 256
      };

      expect(minimalResult.id).toBe('min-789');
      expect(minimalResult.imageData).toBeUndefined();
      expect(minimalResult.textData).toBeUndefined();
    });
  });

  describe('Extension coverage', () => {
    it('should have language mapping for most common text extensions', () => {
      const commonExts = ['ts', 'js', 'py', 'java', 'go', 'rs', 'cpp', 'c'];

      commonExts.forEach(ext => {
        expect(LANGUAGE_MAP[ext]).toBeDefined();
      });
    });

    it('should support all major programming language categories', () => {
      const categories = {
        'Web': ['html', 'css', 'js'],
        'System': ['c', 'cpp', 'rs', 'go'],
        'JVM': ['java', 'kt', 'scala'],
        'Scripting': ['py', 'rb', 'php'],
        'Config': ['json', 'yaml', 'toml']
      };

      Object.entries(categories).forEach(([category, extensions]) => {
        extensions.forEach(ext => {
          expect(SUPPORTED_TEXT_EXTENSIONS).toContain(ext);
        });
      });
    });
  });
});