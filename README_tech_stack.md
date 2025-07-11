# Vibewriter Technical Stack

## Overview

Vibewriter is a web-based collaborative creative writing tool that pairs human writers with AI to create dynamic, back-and-forth storytelling experiences. The application features real-time writing sessions, multiple genre modes, and an adaptive AI that matches user input length.

## Architecture

### Frontend
- **Vanilla JavaScript ES6+** - Modern JavaScript without heavy frameworks
- **TipTap Editor** - Rich text editing with ProseMirror foundation
- **Tailwind CSS** - Utility-first CSS framework for styling
- **PostCSS** - CSS processing pipeline
- **Firebase Authentication** - User authentication and session management

### Backend
- **Node.js** - JavaScript runtime
- **Express.js** - Web application framework
- **OpenAI GPT API** - AI text generation
- **Firebase Admin SDK** - Server-side Firebase integration

### Development & Build Tools
- **npm workspaces** - Monorepo package management
- **nodemon** - Development server with auto-reload
- **concurrently** - Run multiple npm scripts simultaneously
- **Prettier** - Code formatting

## Detailed Technology Breakdown

### Core Dependencies

#### Frontend (`package.json`)
```json
{
  "@tiptap/core": "^2.1.12",           // Rich text editor core
  "@tiptap/starter-kit": "^2.1.12",   // Essential editor extensions
  "@tailwindcss/postcss": "^4.1.11",  // Tailwind CSS integration
  "express-rate-limit": "^7.5.1",     // API rate limiting
  "postcss-import": "^16.1.1"         // CSS import processing
}
```

#### Backend (`server/package.json`)
```json
{
  "express": "^4.18.2",               // Web framework
  "openai": "^4.20.1",               // OpenAI API client
  "firebase-admin": "^11.11.0",      // Firebase server SDK
  "cors": "^2.8.5",                  // Cross-origin resource sharing
  "express-rate-limit": "^7.1.5",    // Rate limiting middleware
  "rotating-file-stream": "^3.1.0",  // Log rotation
  "jsonwebtoken": "^9.0.2",          // JWT token handling
  "dotenv": "^16.3.1",               // Environment variables
  "node-fetch": "^2.7.0"             // HTTP client for Node.js
}
```

### Editor Technology

#### TipTap/ProseMirror Stack
- **TipTap Core**: Modern rich text editor built on ProseMirror
- **Starter Kit**: Essential extensions (bold, italic, lists, etc.)
- **Custom Extensions**: Font family and size controls
- **Real-time Editing**: Collaborative editing capabilities
- **Extensible**: Plugin architecture for custom functionality

#### Editor Features
- Spell checking support
- Drag-and-drop functionality
- Resizable editor windows
- Multiple UI modes (Standard/TUI)
- Real-time word counting
- Turn-based editing control

### Styling & UI

#### Tailwind CSS Implementation
- **Utility-first approach**: Rapid UI development
- **Custom fonts**: JetBrains Mono, 3270 terminal fonts
- **Responsive design**: Mobile-first responsive layouts
- **Custom components**: Brutal/skeuomorphic button styles
- **Dark/TUI mode**: Terminal-inspired interface option

#### PostCSS Pipeline
```javascript
// postcss.config.js
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {}
  }
}
```

### Authentication & Security

#### Firebase Authentication
- **Client-side**: Firebase web SDK for user authentication
- **Server-side**: Firebase Admin SDK for token verification
- **JWT tokens**: Additional server-side session management
- **Rate limiting**: Multiple tiers of API protection
- **CORS protection**: Configurable cross-origin policies

#### Security Features
- Environment variable protection
- Rate limiting (API, LLM, Admin endpoints)
- JWT token expiration (8-hour sessions)
- Admin route protection
- Input validation and sanitization

### AI Integration

#### OpenAI GPT Integration
- **Model**: GPT-4.1-nano-2025-04-14 (configurable)
- **Dynamic token limits**: Adaptive response length
- **Temperature control**: Different creativity levels for initial vs. continuation
- **Genre-specific prompts**: Tailored system prompts for different writing styles
- **Usage tracking**: OpenAI API usage monitoring

#### AI Response Modes
1. **Short**: ~1 sentence (30-40 tokens)
2. **Medium**: ~80 words (80-100 tokens)
3. **Long**: ~150 words (140-180 tokens)
4. **Match User**: Adaptive length based on user input (10-200 tokens)

### Data Management

#### Logging & Analytics
- **Rotating file streams**: Automated log rotation with gzip compression
- **Conversation logging**: Complete writing session tracking
- **Usage analytics**: OpenAI API usage monitoring
- **Admin dashboard**: Real-time log viewing and analytics
- **In-memory caching**: Performance optimization for log data

#### Session Management
- **Conversation history**: Turn-by-turn writing tracking
- **Metadata logging**: Settings, timestamps, user context
- **Export capabilities**: JSON-based data export
- **Cache invalidation**: Efficient memory management

### Development Workflow

#### Build Process
```bash
npm run dev:full     # Full development with CSS watching
npm run watch:css    # CSS compilation with file watching
npm run dev          # Backend development server
npm run build:css    # Production CSS build
```

#### File Structure
```
vibewriter-web-edition/
├── vanilla/                 # Frontend assets
│   ├── editor.html         # Main application
│   ├── admin.html          # Admin dashboard
│   ├── main.js             # Core application logic
│   ├── style.css           # Custom styles
│   ├── tailwind-build.css  # Compiled Tailwind
│   └── fonts/              # Custom font files
├── server/                 # Backend application
│   ├── index.js            # Express server
│   ├── firebase-admin.js   # Firebase configuration
│   └── logs/               # Application logs
└── temp_fonts/             # Font resources
```

### Performance Features

#### Optimization Strategies
- **Font loading**: Local fonts with Google Fonts fallback
- **Image optimization**: WebP format with size variants
- **CSS optimization**: PostCSS minification for production
- **Memory management**: In-memory caching with cleanup
- **Rate limiting**: Prevents API abuse and ensures performance

#### Real-time Features
- **Floating timer**: Draggable countdown timer
- **Live console**: Real-time status updates
- **Dynamic UI**: Responsive editor resizing
- **Turn indicators**: Visual feedback for writing turns

### Browser Compatibility

#### Modern Web Standards
- **ES6+ modules**: Native module support
- **CSS Grid/Flexbox**: Modern layout techniques
- **Web APIs**: Drag and drop, local storage
- **Progressive enhancement**: Graceful degradation

#### Font Technology
- **WOFF2/WOFF**: Optimized web font formats
- **Font display swap**: Performance-optimized loading
- **Custom font stacks**: Terminal and monospace fonts

## Environment Configuration

### Required Environment Variables
```bash
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4.1-nano-2025-04-14
OPENAI_ADMIN_KEY=your_admin_key (optional)

# Admin Authentication
ADMIN_USERNAME=admin_username
ADMIN_PASSWORD=admin_password
JWT_SECRET=your_jwt_secret

# Server Configuration
PORT=3000
NODE_ENV=production|development
```

### Firebase Configuration
- Firebase project setup required
- Service account key for admin operations
- Web app configuration for client-side auth

## Deployment Considerations

### Production Setup
- SSL/HTTPS required for Firebase Auth
- Environment variables properly configured
- Log rotation and monitoring enabled
- Rate limiting tuned for production traffic
- CORS origins configured for production domains

### Scalability Features
- Stateless server design
- In-memory caching with cleanup
- Rate limiting prevents abuse
- Modular architecture for easy scaling

This technical stack provides a modern, performant, and scalable foundation for collaborative AI-assisted creative writing applications.
