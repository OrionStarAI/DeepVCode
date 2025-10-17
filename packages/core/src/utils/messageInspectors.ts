/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content } from '../types/extendedContent.js';
import { MESSAGE_ROLES } from '../config/messageRoles.js';

export function isFunctionResponse(content: Content): boolean {
  return (
    content.role === MESSAGE_ROLES.USER &&
    !!content.parts &&
    content.parts.every((part) => !!part.functionResponse)
  );
}

export function isFunctionCall(content: Content): boolean {
  return (
    content.role === MESSAGE_ROLES.MODEL &&
    !!content.parts &&
    content.parts.every((part) => !!part.functionCall)
  );
}

export function hasFunctionCall(content: Content): boolean {
  return (
    content.role === MESSAGE_ROLES.MODEL &&
    !!content.parts &&
    content.parts.some((part) => !!part.functionCall)
  );
}
