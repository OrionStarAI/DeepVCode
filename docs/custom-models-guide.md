# Custom Models Configuration Guide

DeepV Code supports custom model configurations, allowing you to use any OpenAI-compatible API or Claude API endpoint.

## Configuration

Add custom models to your `custom-models.json` file (located at `~/.deepv/custom-models.json`):

**💡 Why a separate file?**
- Prevents conflicts with `settings.json` being updated by cloud models
- Avoids race conditions when multiple DeepV Code instances are running
- Your custom models won't be overwritten by cloud updates

```json
{
  "models": [
    {
      "id": "custom-openai-gpt4",
      "displayName": "GPT-4 Custom",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "${OPENAI_API_KEY}",
      "modelId": "gpt-4-turbo",
      "maxTokens": 128000,
      "enabled": true
    },
    {
      "id": "custom-claude-sonnet",
      "displayName": "Claude Sonnet Custom",
      "provider": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "apiKey": "${ANTHROPIC_API_KEY}",
      "modelId": "claude-sonnet-4-5",
      "maxTokens": 200000,
      "enabled": true
    },
    {
      "id": "custom-local-llama",
      "displayName": "Local Llama",
      "provider": "openai",
      "baseUrl": "http://localhost:1234/v1",
      "apiKey": "not-needed",
      "modelId": "llama-3-70b",
      "maxTokens": 8192,
      "enabled": true
    }
  ]
}
```

## Configuration Fields

### Required Fields

- **id**: Unique identifier (must start with `custom-`)
- **displayName**: Display name in the model selection dialog
- **provider**: Provider type (`openai`, `anthropic`, or `deepv`)
- **baseUrl**: API base URL
- **apiKey**: API key (supports environment variables like `${OPENAI_API_KEY}`)
- **modelId**: Actual model ID passed to the API

### Optional Fields

- **maxTokens**: Maximum context window size (default: varies by provider)
- **enabled**: Whether the model is enabled (default: true)
- **headers**: Additional HTTP headers as key-value pairs
- **timeout**: Request timeout in milliseconds (default: 300000)
- **enableThinking**: Enable extended thinking for Anthropic models (default: auto-detect)
  - `true`: Force enable thinking
  - `false`: Force disable thinking
  - Omitted: Auto-detect based on model (Claude Sonnet 4.x, Opus 4.x, Haiku 4.x are auto-enabled)

## Environment Variables

You can use environment variables in the configuration:

```json
{
  "apiKey": "${OPENAI_API_KEY}",
  "baseUrl": "${CUSTOM_API_URL}"
}
```

Supported formats:
- `${VAR_NAME}` (recommended)
- `$VAR_NAME`

## Provider Types

### OpenAI Compatible (`openai`)

For any API that follows the OpenAI chat completions format:
- OpenAI official API
- Azure OpenAI
- Local models (LM Studio, Ollama, etc.)
- Third-party OpenAI-compatible services

Example:
```json
{
  "provider": "openai",
  "baseUrl": "https://api.openai.com/v1",
  "apiKey": "${OPENAI_API_KEY}",
  "modelId": "gpt-4-turbo"
}
```

### Anthropic Claude (`anthropic`)

For Claude API endpoints:

Example:
```json
{
  "provider": "anthropic",
  "baseUrl": "https://api.anthropic.com",
  "apiKey": "${ANTHROPIC_API_KEY}",
  "modelId": "claude-sonnet-4-5"
}
```

**Extended Thinking**: For Claude 4.x and 3.7 models, extended thinking is automatically enabled. The thinking process will be displayed in the UI before the response. To disable it, set `"enableThinking": false`.

Supported models for extended thinking:
- Claude Sonnet 4.5 / 4.x series
- Claude Opus 4.5 / 4.x series
- Claude Haiku 4.5 / 4.x series
- Claude 3.7 Sonnet

### DeepV Custom (`deepv`)

For custom DeepV-compatible endpoints (uses OpenAI format):

Example:
```json
{
  "provider": "deepv",
  "baseUrl": "https://your-custom-endpoint.com/v1",
  "apiKey": "${CUSTOM_API_KEY}",
  "modelId": "custom-model-id"
}
```

## Using Custom Models

### In Model Selection Dialog

Custom models appear in the model selection dialog with a `[Custom]` tag and cyan color:

```
/model
```

Select your custom model from the list.

### Direct Command

You can also switch to a custom model directly:

```
/model custom-openai-gpt4
```

### In Code

Custom models are automatically available in all contexts where model selection is supported.

## Features

### Visual Distinction

- Custom models are displayed with a **cyan color** in the UI
- `[Custom]` tag in the display name
- No credits consumption displayed (custom models don't use DeepV credits)

### Coexistence with Cloud Models

Custom models and cloud models work together seamlessly:
- Both appear in the same model selection dialog
- You can switch between them at any time
- Custom models persist across sessions

### Security

- API keys can be stored as environment variables
- Configuration file (`settings.json`) should be kept secure
- Never commit API keys to version control

## Example Configurations

### Local LM Studio

```json
{
  "id": "custom-lm-studio",
  "displayName": "LM Studio Local",
  "provider": "openai",
  "baseUrl": "http://localhost:1234/v1",
  "apiKey": "not-needed",
  "modelId": "local-model",
  "enabled": true
}
```

### Azure OpenAI

```json
{
  "id": "custom-azure-gpt4",
  "displayName": "Azure GPT-4",
  "provider": "openai",
  "baseUrl": "https://your-resource.openai.azure.com/openai/deployments/your-deployment",
  "apiKey": "${AZURE_OPENAI_KEY}",
  "modelId": "gpt-4",
  "headers": {
    "api-version": "2024-02-01"
  },
  "enabled": true
}
```

### Groq

```json
{
  "id": "custom-groq-llama",
  "displayName": "Groq Llama 3",
  "provider": "openai",
  "baseUrl": "https://api.groq.com/openai/v1",
  "apiKey": "${GROQ_API_KEY}",
  "modelId": "llama-3-70b-8192",
  "enabled": true
}
```

## Troubleshooting

### Model Not Appearing

1. Check that `id` starts with `custom-`
2. Verify `enabled` is not set to `false`
3. Restart DeepV Code after configuration changes

### API Errors

1. Verify API key is correct and active
2. Check base URL format (should not end with `/`)
3. Ensure model ID is correct for the provider
4. Check network connectivity

### Environment Variables Not Working

1. Ensure variables are set in your shell environment
2. Use the format `${VAR_NAME}` (with curly braces)
3. Restart DeepV Code after setting environment variables

## Limitations

- Custom models currently support non-streaming mode only
- Tool calling support depends on the provider's API capabilities
- Some advanced features may not be available for all custom models

## Best Practices

1. **Use environment variables** for API keys
2. **Test with a simple prompt** after configuration
3. **Set appropriate timeouts** for slow or local models
4. **Monitor token usage** with your provider's dashboard
5. **Keep configuration file secure** and backed up
