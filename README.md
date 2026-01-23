# Galileo

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Status](https://img.shields.io/badge/Status-Alpha-orange)](https://github.com/yourusername/galileo)

Galileo is "Cursor for Designers" - a Figma-like design tool built with AI at its core. Using Rust + Tauri for performance and React for the UI.

## Tech Stack

- **App Shell**: Tauri v2 (Rust)
- **Frontend**: React 18 + TypeScript
- **Rendering**: Canvas 2D (upgradable to wgpu)
- **State Management**: Immer
- **Validation**: Zod
- **Package Manager**: Bun

## Architecture

```
┌─────────────────────────────────────┐
│  Tauri App Shell (Rust)              │
│  - File I/O                          │
│  - Native dialogs                    │
│  - Future: Exports, indexing         │
├─────────────────────────────────────┤
│  React Frontend                      │
│  ┌───────────────────────────────┐  │
│  │  Core Layer                    │  │
│  │  - Document/NodeMap AST        │  │
│  │  - Command System             │  │
│  │  - History (undo/redo)         │  │
│  ├───────────────────────────────┤  │
│  │  Interaction Layer             │  │
│  │  - Tools (select, rect, text) │  │
│  │  - Hit testing                 │  │
│  ├───────────────────────────────┤  │
│  │  Render Layer                  │  │
│  │  - Draw list builder           │  │
│  │  - Canvas renderer             │  │
│  ├───────────────────────────────┤  │
│  │  AI Layer (plumbing)          │  │
│  │  - Context builder             │  │
│  │  - Shadow apply                │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

## Key Features (Current)

- ✅ Core document model with NodeMap AST
- ✅ Command system with undo/redo
- ✅ Canvas rendering with draw list
- ✅ Basic tools: Select, Rectangle, Text, Pan
- ✅ Properties panel for editing
- ✅ File save/load (`.galileo` format)
- ✅ Keyboard shortcuts (V, R, T, H, Ctrl+Z, Ctrl+Shift+Z, Ctrl+S, Ctrl+O)

## Key Features (Planned)

- 🔄 AI integration with Shadow Mode
- 🔄 Auto layout engine
- 🔄 Components & variants
- 🔄 Generative vector paths
- 🔄 Smart selection
- 🔄 Auto-componentization

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) - `curl -fsSL https://bun.sh/install | bash`
- [Rust](https://rustup.rs) - `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- [Node.js](https://nodejs.org) 18+ (for Vite)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/yourusername/galileo.git
cd galileo

# Install dependencies
bun install

# Run development server
bun run dev
```

Open http://localhost:5173 in your browser.

### Run with Tauri

```bash
# Start Tauri development environment
bun run tauri dev
```

### Build for Production

```bash
# Build frontend and Tauri app
bun run build

# Then package the desktop app
bun run tauri build
```

### Development Scripts

```bash
bun run dev          # Start dev server
bun run typecheck    # Run type checking
bun run lint         # Run linting
bun run tauri dev    # Start Tauri dev
```

## File Structure

```
galileo/
├── src/                        # React frontend
│   ├── core/
│   │   ├── doc/               # Document model, Node types
│   │   ├── commands/           # Command types, executor, history
│   │   └── layout/             # Auto layout (future)
│   ├── interaction/
│   │   ├── tools/             # Tool implementations
│   │   └── transforms/        # Move, resize (future)
│   ├── render/
│   │   ├── draw-list/         # Draw list builder
│   │   └── canvas-renderer/   # Canvas 2D renderer
│   ├── ai/
│   │   ├── context-builder.ts # Selection → JSON
│   │   └── shadow-apply.ts    # Preview commands
│   ├── ui/                    # React components
│   └── hooks/                 # Custom React hooks
├── src-tauri/                 # Rust backend
│   ├── src/
│   │   └── main.rs           # File I/O commands
│   └── Cargo.toml
└── package.json
```

## Command System

All actions go through a unified command interface:

```typescript
type Command =
  | CreateNodeCommand
  | DeleteNodeCommand
  | MoveNodeCommand
  | ResizeNodeCommand
  | SetPropsCommand
  | BatchCommand;
```

This ensures both user interactions and AI modifications use the same API.

## Document Format (`.galileo`)

```json
{
  "version": 1,
  "rootId": "root",
  "nodes": {
    "root": {
      "id": "root",
      "type": "frame",
      "position": { "x": 0, "y": 0 },
      "size": { "width": 1280, "height": 800 },
      "children": []
    }
  }
}
```

## Keyboard Shortcuts

- `V` - Select tool
- `R` - Rectangle tool
- `T` - Text tool
- `H` - Pan tool
- `Ctrl+Z` - Undo
- `Ctrl+Shift+Z` - Redo
- `Ctrl+S` - Save document
- `Ctrl+O` - Open document

## Development

### Run Type Check

```bash
bun run typecheck
```

### Run Linter

```bash
bun run lint
```

## Roadmap

### Phase 1: Foundation ✅
- Tauri + React setup
- Document model
- Command system
- Canvas rendering

### Phase 2: Tools & Interaction ✅
- Basic tools (select, rectangle, text)
- Properties panel
- FContributing

We welcome contributions! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

MIT - see [LICENSE](LICENSE) file for details

## Acknowledgments

Inspired by [Cursor](https://cursor.sh) and [Figma](https://www.figma.com).

## Support

- 📖 [Documentation](https://github.com/yourusername/galileo/wiki)
- 🐛 [Report Issues](https://github.com/yourusername/galileo/issues)
- 💬 [Discussions](https://github.com/yourusername/galileo/discussions)
- Component definition system
- Variant creation
- Props interface

### Phase 5: AI Integration
- LLM API integration
- Cmd+K interface
- Shadow mode for preview

### Phase 6: AI Features
- Generative vector paths
- Smart selection
- Auto-componentization
- Layout inference

## License

MIT

## Acknowledgments

Inspired by [Cursor](https://cursor.sh) and [Figma](https://www.figma.com).
