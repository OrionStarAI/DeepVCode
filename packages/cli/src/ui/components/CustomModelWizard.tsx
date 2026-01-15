/**
 * @license
 * Copyright 2025 DeepV Code team
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { SimpleTextInput } from './shared/SimpleTextInput.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { useKeypress, Key } from '../hooks/useKeypress.js';
import { CustomModelConfig, CustomModelProvider, validateCustomModelConfig } from 'deepv-code-core';
import { t } from '../utils/i18n.js';

interface CustomModelWizardProps {
  onComplete: (config: CustomModelConfig) => void;
  onCancel: () => void;
}

enum WizardStep {
  PROVIDER = 'provider',
  DISPLAY_NAME = 'displayName',
  BASE_URL = 'baseUrl',
  API_KEY = 'apiKey',
  MODEL_ID = 'modelId',
  MAX_TOKENS = 'maxTokens',
  CONFIRM = 'confirm',
}

const PROVIDER_OPTIONS: Array<{ value: CustomModelProvider; label: string; description: string }> = [
  {
    value: 'openai',
    label: 'OpenAI Compatible',
    description: 'OpenAI API, Azure OpenAI, LM Studio, Ollama, Groq, Together AI, etc.'
  },
  {
    value: 'anthropic',
    label: 'Anthropic Claude',
    description: 'Claude API (claude.ai)'
  },
];

export function CustomModelWizard({ onComplete, onCancel }: CustomModelWizardProps): React.JSX.Element {
  const [currentStep, setCurrentStep] = useState<WizardStep>(WizardStep.PROVIDER);
  const [selectedProviderIndex, setSelectedProviderIndex] = useState(0);
  const [config, setConfig] = useState<Partial<CustomModelConfig>>({
    enabled: true,
  });
  const [inputValue, setInputValue] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // 处理提供商选择
  const handleProviderKeypress = useCallback((key: Key) => {
    if (key.name === 'up' || key.sequence === 'k') {
      setSelectedProviderIndex(prev =>
        prev > 0 ? prev - 1 : PROVIDER_OPTIONS.length - 1
      );
    } else if (key.name === 'down' || key.sequence === 'j') {
      setSelectedProviderIndex(prev =>
        prev < PROVIDER_OPTIONS.length - 1 ? prev + 1 : 0
      );
    } else if (key.name === 'return') {
      setConfig(prev => ({ ...prev, provider: PROVIDER_OPTIONS[selectedProviderIndex].value }));
      setCurrentStep(WizardStep.DISPLAY_NAME);
    } else if (key.name === 'escape') {
      onCancel();
    }
  }, [selectedProviderIndex, onCancel]);

  useKeypress(handleProviderKeypress, { isActive: currentStep === WizardStep.PROVIDER });

  // 处理确认步骤的选择
  const handleConfirmSelect = useCallback((value: string) => {
    if (value === 'save') {
      const fullConfig: CustomModelConfig = {
        displayName: config.displayName!,
        provider: config.provider!,
        baseUrl: config.baseUrl!,
        apiKey: config.apiKey!,
        modelId: config.modelId!,
        maxTokens: config.maxTokens,
        enabled: true,
      };

      const errors = validateCustomModelConfig(fullConfig);
      if (errors.length > 0) {
        setValidationError(errors.join(', '));
        return;
      }

      onComplete(fullConfig);
    } else {
      onCancel();
    }
  }, [config, onComplete, onCancel]);

  // 确认步骤的菜单选项
  const confirmMenuItems = [
    { label: '✓ Save configuration', value: 'save' },
    { label: '✗ Cancel', value: 'cancel' },
  ];

  const handleInputSubmit = useCallback((value: string) => {
    const trimmedValue = value.trim();

    switch (currentStep) {
      case WizardStep.DISPLAY_NAME:
        if (!trimmedValue) {
          setValidationError('Display name cannot be empty');
          return;
        }
        setConfig(prev => ({ ...prev, displayName: trimmedValue }));
        setInputValue('');
        setValidationError(null);
        setCurrentStep(WizardStep.BASE_URL);
        break;

      case WizardStep.BASE_URL:
        if (!trimmedValue) {
          setValidationError('Base URL cannot be empty');
          return;
        }
        if (!trimmedValue.startsWith('http://') && !trimmedValue.startsWith('https://')) {
          setValidationError('Base URL must start with http:// or https://');
          return;
        }
        setConfig(prev => ({ ...prev, baseUrl: trimmedValue.replace(/\/+$/, '') }));
        setInputValue('');
        setValidationError(null);
        setCurrentStep(WizardStep.API_KEY);
        break;

      case WizardStep.API_KEY:
        if (!trimmedValue) {
          setValidationError('API key cannot be empty');
          return;
        }
        setConfig(prev => ({ ...prev, apiKey: trimmedValue }));
        setInputValue('');
        setValidationError(null);
        setCurrentStep(WizardStep.MODEL_ID);
        break;

      case WizardStep.MODEL_ID:
        if (!trimmedValue) {
          setValidationError('Model ID cannot be empty');
          return;
        }
        setConfig(prev => ({ ...prev, modelId: trimmedValue }));
        setInputValue('');
        setValidationError(null);
        setCurrentStep(WizardStep.MAX_TOKENS);
        break;

      case WizardStep.MAX_TOKENS:
        if (trimmedValue) {
          const maxTokens = parseInt(trimmedValue, 10);
          if (isNaN(maxTokens) || maxTokens <= 0) {
            setValidationError('Max tokens must be a positive number');
            return;
          }
          setConfig(prev => ({ ...prev, maxTokens }));
        }
        setInputValue('');
        setValidationError(null);
        setCurrentStep(WizardStep.CONFIRM);
        break;
    }
  }, [currentStep, config]);

  const getStepTitle = (step: WizardStep): string => {
    switch (step) {
      case WizardStep.PROVIDER:
        return 'Select Provider Type';
      case WizardStep.DISPLAY_NAME:
        return 'Enter Display Name';
      case WizardStep.BASE_URL:
        return 'Enter API Base URL';
      case WizardStep.API_KEY:
        return 'Enter API Key';
      case WizardStep.MODEL_ID:
        return 'Enter Model Name';
      case WizardStep.MAX_TOKENS:
        return 'Enter Max Tokens (Optional)';
      case WizardStep.CONFIRM:
        return 'Confirm Configuration';
      default:
        return '';
    }
  };

  const getStepDescription = (step: WizardStep): string => {
    switch (step) {
      case WizardStep.PROVIDER:
        return 'Choose the API format for your custom model';
      case WizardStep.DISPLAY_NAME:
        return 'This name will appear in the model selection dialog (also used as unique identifier)';
      case WizardStep.BASE_URL:
        return 'API endpoint base URL (e.g., https://api.openai.com/v1)';
      case WizardStep.API_KEY:
        return 'Your API key (or use ${ENV_VAR} for environment variable)';
      case WizardStep.MODEL_ID:
        return 'The model name to use with the API (e.g., gpt-4-turbo)';
      case WizardStep.MAX_TOKENS:
        return 'Maximum context window size (press Enter to skip)';
      case WizardStep.CONFIRM:
        return 'Review your configuration and confirm';
      default:
        return '';
    }
  };

  const getStepExample = (step: WizardStep): string | null => {
    switch (step) {
      case WizardStep.DISPLAY_NAME:
        return 'Example: My GPT-4 Turbo';
      case WizardStep.BASE_URL:
        if (config.provider === 'openai') return 'Example: https://api.openai.com/v1';
        if (config.provider === 'anthropic') return 'Example: https://api.anthropic.com';
        return 'Example: http://localhost:1234/v1';
      case WizardStep.API_KEY:
        return 'Example: ${OPENAI_API_KEY} or sk-...';
      case WizardStep.MODEL_ID:
        if (config.provider === 'openai') return 'Example: gpt-4-turbo';
        if (config.provider === 'anthropic') return 'Example: claude-sonnet-4-5';
        return 'Example: llama-3-70b';
      case WizardStep.MAX_TOKENS:
        return 'Example: 128000';
      default:
        return null;
    }
  };

  const renderProviderSelection = () => (
    <Box flexDirection="column">
      {PROVIDER_OPTIONS.map((option, index) => {
        const isSelected = index === selectedProviderIndex;
        return (
          <Box key={option.value} marginTop={index > 0 ? 1 : 0}>
            <Box width={2}>
              <Text color={isSelected ? Colors.AccentGreen : Colors.Gray}>
                {isSelected ? '▶' : ' '}
              </Text>
            </Box>
            <Box flexDirection="column" flexGrow={1}>
              <Text color={isSelected ? Colors.AccentGreen : Colors.Foreground} bold={isSelected}>
                {option.label}
              </Text>
              <Text color={Colors.Gray}>
                {option.description}
              </Text>
            </Box>
          </Box>
        );
      })}
      <Box marginTop={2}>
        <Text color={Colors.Gray}>
          Use ↑/↓ arrows or k/j to select, Enter to confirm, Esc to cancel
        </Text>
      </Box>
    </Box>
  );

  // Handle Escape key for text input steps
  const handleTextInputCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

  // Determine if we're in a text input step
  const isTextInputStep = currentStep !== WizardStep.PROVIDER && currentStep !== WizardStep.CONFIRM;

  const renderTextInput = () => {
    const example = getStepExample(currentStep);
    return (
      <Box flexDirection="column">
        <SimpleTextInput
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleInputSubmit}
          onCancel={handleTextInputCancel}
          isActive={isTextInputStep}
        />
        {example && (
          <Box marginTop={1}>
            <Text color={Colors.Gray}>
              {example}
            </Text>
          </Box>
        )}
        {validationError && (
          <Box marginTop={1}>
            <Text color={Colors.AccentRed}>✗ {validationError}</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text color={Colors.Gray}>
            Press Enter to continue, Esc to cancel
          </Text>
        </Box>
      </Box>
    );
  };

  const renderConfirmation = () => (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={Colors.AccentYellow} bold>
          Please review your configuration:
        </Text>
      </Box>

      <Box marginLeft={2} flexDirection="column">
        <Text>
          <Text color={Colors.AccentCyan} bold>Provider:     </Text>
          <Text>{PROVIDER_OPTIONS.find(p => p.value === config.provider)?.label}</Text>
        </Text>
        <Text>
          <Text color={Colors.AccentCyan} bold>Display Name: </Text>
          <Text>{config.displayName}</Text>
        </Text>
        <Text>
          <Text color={Colors.AccentCyan} bold>Base URL:     </Text>
          <Text>{config.baseUrl}</Text>
        </Text>
        <Text>
          <Text color={Colors.AccentCyan} bold>API Key:      </Text>
          <Text>{config.apiKey?.includes('${') ? config.apiKey : '***' + config.apiKey?.slice(-4)}</Text>
        </Text>
        <Text>
          <Text color={Colors.AccentCyan} bold>Model ID:     </Text>
          <Text>{config.modelId}</Text>
        </Text>
        {config.maxTokens && (
          <Text>
            <Text color={Colors.AccentCyan} bold>Max Tokens:   </Text>
            <Text>{config.maxTokens}</Text>
          </Text>
        )}
      </Box>

      {validationError && (
        <Box marginTop={1}>
          <Text color={Colors.AccentRed}>✗ Validation Error: {validationError}</Text>
        </Box>
      )}

      <Box marginTop={2}>
        <RadioButtonSelect
          items={confirmMenuItems}
          initialIndex={0}
          onSelect={handleConfirmSelect}
          onHighlight={() => {}}
          isFocused={currentStep === WizardStep.CONFIRM}
        />
      </Box>
    </Box>
  );

  const stepNumber = Object.values(WizardStep).indexOf(currentStep) + 1;
  const totalSteps = Object.values(WizardStep).length;

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.AccentCyan}
      flexDirection="column"
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      paddingRight={2}
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text color={Colors.AccentCyan} bold>
          ✨ Custom Model Configuration Wizard
        </Text>
      </Box>

      {/* Progress */}
      <Box marginBottom={1}>
        <Text color={Colors.Gray}>
          Step {stepNumber}/{totalSteps}: {getStepTitle(currentStep)}
        </Text>
      </Box>

      {/* Description */}
      <Box marginBottom={1}>
        <Text color={Colors.Comment}>
          {getStepDescription(currentStep)}
        </Text>
      </Box>

      <Box borderStyle="single" borderColor={Colors.Gray} paddingX={1} paddingY={1}>
        {currentStep === WizardStep.PROVIDER && renderProviderSelection()}
        {currentStep !== WizardStep.PROVIDER && currentStep !== WizardStep.CONFIRM && renderTextInput()}
        {currentStep === WizardStep.CONFIRM && renderConfirmation()}
      </Box>
    </Box>
  );
}
