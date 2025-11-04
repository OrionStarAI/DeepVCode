/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const INSTALL_WARNING_MESSAGE = `
⚠️  Installing extensions grants them significant access to your DVCode environment.
⚠️  Only install extensions from sources you trust.
`;

export async function requestConsentNonInteractive(
  message: string,
): Promise<boolean> {
  // In non-interactive mode, always require explicit consent
  return false;
}

export async function maybeRequestConsentOrFail(
  message: string,
  requestConsent: (msg: string) => Promise<boolean>,
): Promise<void> {
  const granted = await requestConsent(message);
  if (!granted) {
    throw new Error('Consent required');
  }
}
