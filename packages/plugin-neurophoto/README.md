# @999-agents/plugin-neurophoto

> 🎨 ElizaOS plugin for AI image generation with Replicate

[![npm version](https://img.shields.io/npm/v/@999-agents/plugin-neurophoto.svg)](https://www.npmjs.com/package/@999-agents/plugin-neurophoto)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Generate beautiful AI images directly from your ElizaOS Telegram bot using Replicate's powerful models!

## ✨ Features

- 🎨 **AI Image Generation** - Generate images using state-of-the-art models
- ⚡️ **Fast & Reliable** - Built on Replicate's infrastructure
- 🤖 **ElizaOS Native** - Seamless integration with ElizaOS framework
- 📱 **Telegram Ready** - Works out-of-the-box with Telegram bots
- 🔧 **Customizable** - Configure models, settings, and behavior
- 📝 **TypeScript** - Full type safety and IntelliSense support

## 📦 Installation

```bash
# Using npm
npm install @999-agents/plugin-neurophoto

# Using bun
bun add @999-agents/plugin-neurophoto

# Using yarn
yarn add @999-agents/plugin-neurophoto
```

## 🚀 Quick Start

### 1. Get Replicate API Key

1. Sign up at [replicate.com](https://replicate.com)
2. Go to your [API tokens page](https://replicate.com/account/api-tokens)
3. Create a new API token

### 2. Add Plugin to Your Agent

```typescript
// src/character.ts
import { Character } from '@elizaos/core';
import { neurophotoPlugin } from '@999-agents/plugin-neurophoto';

export const character: Character = {
  name: 'MyAgent',

  // Add the plugin
  plugins: [
    '@elizaos/plugin-bootstrap',
    '@elizaos/plugin-telegram',
    neurophotoPlugin, // 👈 Add this
  ],

  // Configure settings
  settings: {
    REPLICATE_API_KEY: process.env.REPLICATE_API_KEY, // From .env
    // Optional: DEFAULT_MODEL: 'black-forest-labs/flux-pro',
  },
};
```

### 3. Configure Environment

```bash
# .env
REPLICATE_API_KEY=r8_your_replicate_api_key_here
```

### 4. Start Using!

In Telegram, users can now use:

```
/neurophoto beautiful sunset over the ocean
нарисуй футуристический город
create image of a cat in space
```

## 📖 Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/neurophoto <prompt>` | Generate image with English prompt | `/neurophoto cyberpunk city` |
| `нарисуй <описание>` | Generate image in Russian | `нарисуй закат на море` |
| `create image <desc>` | Natural language command | `create image of a dragon` |

## ⚙️ Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REPLICATE_API_KEY` | ✅ Yes | - | Your Replicate API key |
| `DEFAULT_MODEL` | ❌ No | `flux-schnell` | Model to use for generation |
| `REPLICATE_TIMEOUT` | ❌ No | `300000` | Timeout in milliseconds |
| `REPLICATE_MAX_RETRIES` | ❌ No | `3` | Max retry attempts |

### Available Models

```typescript
import { DEFAULT_MODELS } from '@999-agents/plugin-neurophoto';

// In your character settings:
settings: {
  DEFAULT_MODEL: DEFAULT_MODELS.FLUX_SCHNELL,  // Fast (default)
  // or
  DEFAULT_MODEL: DEFAULT_MODELS.FLUX_PRO,      // High quality
  // or
  DEFAULT_MODEL: DEFAULT_MODELS.SDXL,          // General purpose
  // or custom model:
  DEFAULT_MODEL: 'your-username/your-model:version',
}
```

## 🎯 Examples

### Basic Usage

```typescript
import { neurophotoPlugin } from '@999-agents/plugin-neurophoto';

export const character: Character = {
  name: 'ArtBot',
  plugins: [neurophotoPlugin],
  settings: {
    REPLICATE_API_KEY: process.env.REPLICATE_API_KEY,
  },
};
```

### With Custom Model

```typescript
import { neurophotoPlugin, DEFAULT_MODELS } from '@999-agents/plugin-neurophoto';

export const character: Character = {
  name: 'ProArtBot',
  plugins: [neurophotoPlugin],
  settings: {
    REPLICATE_API_KEY: process.env.REPLICATE_API_KEY,
    DEFAULT_MODEL: DEFAULT_MODELS.FLUX_PRO, // High-quality model
  },
};
```

### Multiple Plugins

```typescript
import { neurophotoPlugin } from '@999-agents/plugin-neurophoto';

export const character: Character = {
  name: 'MultiBot',
  plugins: [
    '@elizaos/plugin-bootstrap',
    '@elizaos/plugin-telegram',
    '@elizaos/plugin-sql',
    neurophotoPlugin, // Works with other plugins
  ],
  settings: {
    REPLICATE_API_KEY: process.env.REPLICATE_API_KEY,
  },
};
```

## 🧪 Development

### Setup

```bash
# Clone the repo
git clone https://github.com/999-agents/plugin-neurophoto.git
cd plugin-neurophoto

# Install dependencies
bun install

# Create .env file
cp .env.example .env
# Add your REPLICATE_API_KEY

# Build
bun run build

# Run tests
bun test

# Watch mode for development
bun run dev
```

### Project Structure

```
packages/plugin-neurophoto/
├── src/
│   ├── actions/
│   │   └── generateImage.ts      # Main action
│   ├── providers/
│   │   └── replicateProvider.ts  # Context provider
│   ├── services/
│   │   └── replicateService.ts   # Replicate integration
│   ├── types/
│   │   └── index.ts              # TypeScript types
│   └── index.ts                  # Plugin export
├── package.json
├── tsconfig.json
└── README.md
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

MIT © 999-agents

## 🔗 Links

- [ElizaOS Documentation](https://docs.elizaos.ai)
- [Replicate API Docs](https://replicate.com/docs)
- [GitHub Repository](https://github.com/999-agents/plugin-neurophoto)
- [NPM Package](https://www.npmjs.com/package/@999-agents/plugin-neurophoto)

## 💬 Support

- 📧 Email: support@999-agents.com
- 💬 Telegram: [@999agents](https://t.me/999agents)
- 🐛 Issues: [GitHub Issues](https://github.com/999-agents/plugin-neurophoto/issues)

## 🎉 Acknowledgments

- Built with [ElizaOS](https://elizaos.ai)
- Powered by [Replicate](https://replicate.com)
- Inspired by the amazing AI community

---

Made with ❤️ by [999-agents](https://github.com/999-agents)
