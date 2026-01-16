/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Schema } from '@google/genai';
import AjvPkg from 'ajv';
// Ajv's ESM/CJS interop: use 'any' for compatibility as recommended by Ajv docs
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AjvClass = (AjvPkg as any).default || AjvPkg;
const ajValidator = new AjvClass();

/**
 * Simple utility to validate objects against JSON Schemas
 */
export class SchemaValidator {
  /**
   * Returns null if the data confroms to the schema described by schema (or if schema
   *  is null). Otherwise, returns a string describing the error.
   * @param schema The schema to validate against
   * @param data The data to validate
   * @param toolName Optional tool name for better error messages
   */
  static validate(schema: Schema | undefined, data: unknown, toolName?: string): string | null {
    if (!schema) {
      return null;
    }
    if (typeof data !== 'object' || data === null) {
      return this.buildParamsMustBeObjectError(schema, data, toolName);
    }
    const validate = ajValidator.compile(this.toObjectSchema(schema));
    const valid = validate(data);
    if (!valid && validate.errors) {
      return ajValidator.errorsText(validate.errors, { dataVar: 'params' });
    }
    return null;
  }

  /**
   * Builds a detailed error message when params is not an object.
   * Includes the correct format example based on the schema.
   */
  private static buildParamsMustBeObjectError(
    schema: Schema,
    receivedData: unknown,
    toolName?: string
  ): string {
    const receivedType = receivedData === null ? 'null' : typeof receivedData;
    const receivedPreview = typeof receivedData === 'string'
      ? `"${receivedData.substring(0, 100)}${receivedData.length > 100 ? '...' : ''}"`
      : String(receivedData);

    // Build example object from schema
    const exampleObj = this.buildExampleFromSchema(schema);
    const exampleJson = JSON.stringify(exampleObj, null, 2);

    const toolNameHint = toolName ? ` for tool "${toolName}"` : '';

    return `params must be an object${toolNameHint}, but received ${receivedType}: ${receivedPreview}

CORRECT FORMAT - params must be a JSON object like this:
${exampleJson}

COMMON MISTAKES:
1. Passing a string instead of an object: WRONG: "{\\"key\\": \\"value\\"}"  CORRECT: {"key": "value"}
2. Forgetting to parse JSON string to object
3. Passing null or undefined

Each parameter should be a proper key-value pair in the object.`;
  }

  /**
   * Builds an example object from a schema for error messages.
   */
  private static buildExampleFromSchema(schema: Schema): Record<string, unknown> {
    const example: Record<string, unknown> = {};

    if (schema.properties && typeof schema.properties === 'object') {
      const requiredFields = Array.isArray(schema.required) ? schema.required : [];

      for (const [key, propSchema] of Object.entries(schema.properties)) {
        const prop = propSchema as Schema;
        const isRequired = requiredFields.includes(key);

        // Generate example value based on type
        let exampleValue: unknown;
        const propType = String(prop.type || 'string').toLowerCase();

        switch (propType) {
          case 'string':
            if (prop.enum && Array.isArray(prop.enum) && prop.enum.length > 0) {
              exampleValue = prop.enum[0];
            } else if (key.toLowerCase().includes('path')) {
              exampleValue = '/absolute/path/to/file.ts';
            } else if (key.toLowerCase().includes('content') || key.toLowerCase().includes('string')) {
              exampleValue = 'your content here';
            } else {
              exampleValue = `<${key}>`;
            }
            break;
          case 'number':
          case 'integer':
            exampleValue = prop.minimum !== undefined ? Number(prop.minimum) : 1;
            break;
          case 'boolean':
            exampleValue = true;
            break;
          case 'array':
            exampleValue = [];
            break;
          case 'object':
            exampleValue = {};
            break;
          default:
            exampleValue = `<${key}>`;
        }

        // Only include required fields in the example to keep it concise
        if (isRequired) {
          example[key] = exampleValue;
        }
      }
    }

    return example;
  }

  /**
   * Converts @google/genai's Schema to an object compatible with avj.
   * This is necessary because it represents Types as an Enum (with
   * UPPERCASE values) and minItems and minLength as strings, when they should be numbers.
   */
  private static toObjectSchema(schema: Schema): object {
    const newSchema: Record<string, unknown> = { ...schema };
    if (newSchema.anyOf && Array.isArray(newSchema.anyOf)) {
      newSchema.anyOf = newSchema.anyOf.map((v) => this.toObjectSchema(v));
    }
    if (newSchema.items) {
      newSchema.items = this.toObjectSchema(newSchema.items);
    }
    if (newSchema.properties && typeof newSchema.properties === 'object') {
      const newProperties: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(newSchema.properties)) {
        newProperties[key] = this.toObjectSchema(value as Schema);
      }
      newSchema.properties = newProperties;
    }
    if (newSchema.type) {
      newSchema.type = String(newSchema.type).toLowerCase();
    }
    if (newSchema.minItems) {
      newSchema.minItems = Number(newSchema.minItems);
    }
    if (newSchema.minLength) {
      newSchema.minLength = Number(newSchema.minLength);
    }
    return newSchema;
  }
}
