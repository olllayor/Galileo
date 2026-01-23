# Contributing to Galileo

Thank you for your interest in contributing to Galileo! This document provides guidelines and instructions for contributing.

## Getting Started

### Prerequisites
- Node.js 18+
- Rust 1.70+
- Bun (package manager)

### Setup Development Environment

1. Clone the repository:
```bash
git clone https://github.com/yourusername/galileo.git
cd galileo
```

2. Install dependencies:
```bash
bun install
```

3. Install Tauri dependencies:
```bash
bun run tauri
```

### Development Workflow

**Start development server:**
```bash
bun run dev
```

**Build for production:**
```bash
bun run build
```

**Run type checking:**
```bash
bun run typecheck
```

**Run linting:**
```bash
bun run lint
```

## Making Changes

### Branch Naming
- Feature: `feature/description`
- Bug fix: `fix/description`
- Documentation: `docs/description`

### Commit Messages
Follow conventional commits format:
- `feat:` - A new feature
- `fix:` - A bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, semicolons, etc.)
- `refactor:` - Code refactoring without feature changes
- `perf:` - Performance improvements
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

Example: `feat: add text tool to canvas`

### Code Style

- Use TypeScript for all new code
- Follow ESLint rules (run `bun run lint`)
- Keep functions small and focused
- Add comments for complex logic
- Use meaningful variable names

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes and commit with clear messages
3. Ensure all checks pass:
   - `bun run typecheck`
   - `bun run lint`
   - `bun run build`
4. Push your branch
5. Open a pull request with a clear description
6. Address review feedback

### PR Title Format
Use the same convention as commit messages:
- `feat: description`
- `fix: description`
- `docs: description`

## Reporting Issues

When reporting bugs, please include:
- Clear, descriptive title
- Step-by-step reproduction
- Expected behavior
- Actual behavior
- Environment (OS, browser if applicable)
- Screenshots if relevant

## Architecture Notes

### Key Directories
- `src/core/` - Core document model and command system
- `src/interaction/` - Tools, hit testing, transforms
- `src/render/` - Canvas rendering pipeline
- `src/ai/` - AI integration utilities
- `src-tauri/src/` - Rust backend

### Document Model
The project uses a NodeMap-based AST stored in `src/core/doc/`. Understanding this is crucial for feature work.

### Command System
Use the command system in `src/core/commands/` for any state changes to enable undo/redo.

## Questions?

- Open an issue with the `question` label
- Check existing documentation in the README
- Review architecture diagrams in README.md

Thank you for contributing!
