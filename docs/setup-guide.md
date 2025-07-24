# Setup Guide

## Prerequisites
1. Node.js 18+ installed
2. API Keys for:
   - Google Gemini AI
   - Sarvam AI  
   - Vexa

## Installation Steps

1. **Clone/Create Project**
   ```bash
   # Follow the project structure from the main guide
   ```

2. **Install Dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Configure Environment**
   - Copy `.env.example` to `.env`
   - Add your API keys
   - Verify all keys are working

4. **Start Development Server**
   ```bash
   npm run dev
   ```

5. **Open Frontend**
   - Navigate to `http://localhost:3001`
   - Test all services before using

## API Key Setup

### Gemini AI
1. Go to Google AI Studio
2. Create new API key
3. Add to .env as `GEMINI_API_KEY`

### Sarvam AI  
1. Sign up at sarvam.ai
2. Get API key from dashboard
3. Add to .env as `SARVAM_API_KEY`

### Vexa
1. Join Vexa Discord
2. Request API key
3. Add to .env as `VEXA_API_KEY`