# VS Code Standalone Setup Guide

## Prerequisites

- Node.js 18+ installed
- PostgreSQL database (local or remote)
- VS Code with TypeScript extensions

## Environment Setup

1. **Clone or copy the project to your local machine**

2. **Create `.env` file in the root directory:**

```env
# Database Configuration
DATABASE_URL="postgresql://username:password@localhost:5432/cardiocare"

# AI Service Configuration
HUME_API_KEY="your_hume_api_key_here"
OPENAI_API_KEY="your_openai_api_key_here"  # Optional

# Call Provider Configuration
TWILIO_ACCOUNT_SID="your_twilio_account_sid"
TWILIO_AUTH_TOKEN="your_twilio_auth_token"
TWILIO_PHONE_NUMBER="your_twilio_phone_number"

# Application Configuration
NODE_ENV="development"
PORT=5000
WEBHOOK_BASE_URL="http://localhost:5000"

# Email Configuration (Optional)
SENDGRID_API_KEY="your_sendgrid_api_key"
```

3. **Install dependencies:**

```bash
npm install
```

## Database Setup

1. **Install PostgreSQL locally or use a cloud service**

2. **Create database:**

```sql
CREATE DATABASE cardiocare;
```

3. **Run database migrations:**

```bash
npm run db:push
```

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Database commands
npm run db:push        # Push schema changes
npm run db:studio      # Open database studio
npm run db:generate    # Generate migrations

# Code quality
npm run lint           # Run linter
npm run type-check     # TypeScript type checking
```

## VS Code Configuration

Create `.vscode/settings.json`:

```json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.suggest.autoImports": true,
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.format.enable": true,
  "files.exclude": {
    "**/node_modules": true,
    "**/.git": true,
    "**/dist": true,
    "**/.next": true
  }
}
```

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Launch Server",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/server/index.ts",
      "env": {
        "NODE_ENV": "development"
      },
      "runtimeArgs": ["-r", "tsx/cjs"],
      "console": "integratedTerminal",
      "restart": true,
      "protocol": "inspector"
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": ["--runInBand"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "env": {
        "NODE_ENV": "test"
      }
    }
  ]
}
```

Create `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "type": "npm",
      "script": "dev",
      "label": "Start Development Server",
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared",
        "showReuseMessage": true,
        "clear": false
      },
      "runOptions": {
        "runOn": "folderOpen"
      }
    },
    {
      "type": "npm",
      "script": "build",
      "label": "Build Production",
      "group": "build"
    },
    {
      "type": "npm",
      "script": "db:push",
      "label": "Push Database Schema",
      "group": "build"
    }
  ]
}
```

## Project Structure

```
cardiocare-ai/
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/          # Page components
│   │   ├── lib/            # Utility libraries
│   │   └── App.tsx         # Main app component
│   └── index.html
├── server/                 # Backend Node.js application
│   ├── core/               # Core business logic (NEW OOP Architecture)
│   │   ├── interfaces.ts   # TypeScript interfaces
│   │   ├── CardioCareApp.ts # Main application class
│   │   ├── ai-services/    # AI service implementations
│   │   ├── call-providers/ # Call provider implementations
│   │   ├── orchestration/  # Call orchestration logic
│   │   └── events/         # Event handling
│   ├── services/           # Legacy service layer
│   ├── routes/             # API routes
│   ├── utils/              # Utility functions
│   └── index.ts            # Server entry point
├── shared/                 # Shared TypeScript definitions
│   └── schema.ts           # Database schema
├── .env                    # Environment variables
├── package.json            # Dependencies and scripts
└── tsconfig.json           # TypeScript configuration
```

## Key Features

### Object-Oriented Architecture
- **CardioCareApp**: Main application class that orchestrates all services
- **HumeAIService**: AI service implementation with Hume AI integration
- **TwilioCallProvider**: Call provider implementation with Twilio integration
- **CallOrchestrator**: Coordinates between AI and call services
- **DocumentManager**: Manages patient documents with strict data isolation

### Data Isolation
- Patient-specific document storage
- Secure access control preventing data mixing
- Audit trails for all document access

### Real-time Features
- WebSocket-based audio streaming
- Real-time call status updates
- Live conversation processing

## Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run with coverage
npm run test:coverage
```

## Deployment

### Local Production Build

```bash
# Build the application
npm run build

# Start production server
npm start
```

### Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 5000

CMD ["npm", "start"]
```

## Troubleshooting

### Common Issues

1. **Database connection errors**
   - Check PostgreSQL is running
   - Verify DATABASE_URL in .env
   - Check firewall settings

2. **API key errors**
   - Verify all API keys in .env
   - Check API key permissions
   - Ensure keys are not expired

3. **TypeScript errors**
   - Run `npm run type-check`
   - Check tsconfig.json configuration
   - Verify import paths

4. **Port conflicts**
   - Change PORT in .env
   - Check if port is already in use
   - Use different ports for different services

### Debug Mode

Set environment variables for detailed logging:

```bash
export DEBUG=cardiocare:*
export LOG_LEVEL=debug
npm run dev
```

## VS Code Extensions

Recommended extensions for development:

- TypeScript and JavaScript Language Features
- Prettier - Code formatter
- ESLint
- GitLens — Git supercharged
- Thunder Client (for API testing)
- PostgreSQL (for database management)
- Auto Rename Tag
- Bracket Pair Colorizer
- Path Intellisense

## Performance Tips

1. **Enable TypeScript strict mode** for better type safety
2. **Use ES modules** for better tree-shaking
3. **Implement connection pooling** for database connections
4. **Use Redis** for session storage in production
5. **Enable gzip compression** for API responses
6. **Implement proper error boundaries** in React components

## Security Considerations

1. **Environment variables** - Never commit .env files
2. **API keys** - Use proper secret management
3. **Database access** - Use connection pooling and prepared statements
4. **CORS** - Configure properly for production
5. **Rate limiting** - Implement for API endpoints
6. **Input validation** - Validate all user inputs
7. **Authentication** - Implement proper user authentication
8. **HTTPS** - Use HTTPS in production