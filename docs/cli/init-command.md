# `/init` Command

The `/init` command is a powerful feature in DeepV Code that automatically analyzes your project and creates a tailored `DEEPV.md` file to provide context for future AI interactions.

## Overview

The `/init` command helps you quickly set up project-specific context by:
1. Analyzing your project structure and files
2. Identifying the project type (code project vs. non-code project)
3. Generating a comprehensive `DEEPV.md` file with relevant project information

## Usage

Simply type `/init` in the DeepV Code CLI:

```
/init
```

## What it does

### Project Analysis Process

1. **Initial Exploration**: Lists files and directories to understand the project structure
2. **Deep Dive**: Analyzes up to 10 key files including:
   - README files
   - Configuration files (package.json, requirements.txt, etc.)
   - Main source files
   - Documentation
3. **Project Type Detection**: Determines if this is a software project or other type of content

### Generated Content

For **Code Projects**, the generated `DEEPV.md` includes:
- **Project Overview**: Purpose, technologies, and architecture
- **Building and Running**: Key commands for build, run, and test
- **Development Conventions**: Coding styles, testing practices, contribution guidelines
- **Special Considerations**: DeepV Code specific configurations and AI assistance patterns

For **Non-Code Projects**, it includes:
- **Directory Overview**: Purpose and contents description
- **Key Files**: Important files and their contents
- **Usage**: How the directory contents are intended to be used

## Behavior

- **File Exists**: If `DEEPV.md` already exists, the command will inform you and make no changes
- **New File**: Creates an empty `DEEPV.md` file, then analyzes the project to populate it
- **Error Handling**: Provides clear error messages if configuration is unavailable

## Integration with DeepV Code

The generated `DEEPV.md` file becomes part of DeepV Code's memory system, providing:
- Project-specific context for AI interactions
- Development workflow understanding
- Build and testing command awareness
- Project convention knowledge

## Example Generated Content

```markdown
# My React App

## Project Overview
This is a React application built with TypeScript and Vite, designed for...

## Building and Running
- `npm install` - Install dependencies
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm test` - Run tests

## Development Conventions
- Uses TypeScript for type safety
- ESLint configuration enforces code style
- Jest for unit testing
- Prettier for code formatting
```

## Related Commands

- `/memory` - Manage AI memory and context
- `/help` - View all available commands
- `/chat save` - Save conversation state

This command is inspired by the Gemini CLI's `/init` command but adapted specifically for DeepV Code's workflow and `DEEPV.md` context system.