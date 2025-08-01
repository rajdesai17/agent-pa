# 🎤 TTS Testing Guide

## Overview

Since Vexa API is currently unavailable, we've implemented a comprehensive TTS testing system that saves generated audio files to your project root for easy access and testing.

## 🚀 Quick Start

### 1. Web Interface Testing
1. Start the server: `cd backend && npm run dev`
2. Open: http://localhost:3001
3. Navigate to the "TTS Testing" section
4. Enter text, select language, and click "Generate & Save Audio"

### 2. Command Line Testing
```bash
# Install axios if not already installed
npm install axios

# Run the test script
node test-tts.js
```

## 📁 File Structure

Generated audio files are saved in:
```
google-meet-agent-mvp/
├── test-audio/                    # Generated audio files
│   ├── test_Hello_2024-01-01T12-00-00-000Z.wav
│   ├── test_Hello_2024-01-01T12-00-00-000Z.wav.json  # Metadata
│   └── ...
├── agent-responses/               # Meeting responses (if any)
└── ...
```

## 🌍 Supported Languages

Based on [Sarvam AI documentation](https://docs.sarvam.ai/api-reference-docs/introduction), we support:

| Language Code | Language | Script |
|---------------|----------|--------|
| `en-IN` | English (India) | Latin |
| `hi-IN` | Hindi | Devanagari |
| `ta-IN` | Tamil | Tamil |
| `te-IN` | Telugu | Telugu |
| `bn-IN` | Bengali | Bengali |
| `ml-IN` | Malayalam | Malayalam |
| `kn-IN` | Kannada | Kannada |
| `gu-IN` | Gujarati | Gujarati |
| `mr-IN` | Marathi | Devanagari |
| `pa-IN` | Punjabi | Gurmukhi |
| `od-IN` | Odia | Odia |

## 🎯 Features

### ✅ Working Features
- **Multi-language TTS**: Generate speech in 10+ Indian languages
- **Audio Storage**: Files saved to `test-audio/` directory
- **Metadata Tracking**: JSON files with text, language, timestamp
- **Web Interface**: Easy-to-use UI for testing
- **Audio Playback**: Play generated audio directly in browser
- **File Management**: Download and organize audio files

### 📊 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/test/tts-save` | POST | Generate and save TTS audio |
| `/api/test-audio` | GET | List all test audio files |
| `/api/test-audio/:filename` | GET | Download specific audio file |

### 🔧 Example Usage

#### Web Interface
```javascript
// Generate TTS via web interface
const response = await fetch('/api/test/tts-save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        text: "Hello, this is a test",
        language: "en-IN"
    })
});
```

#### Direct API Call
```bash
curl -X POST http://localhost:3001/api/test/tts-save \
  -H "Content-Type: application/json" \
  -d '{
    "text": "नमस्ते, यह एक परीक्षण है",
    "language": "hi-IN"
  }'
```

## 🎵 Audio Quality

- **Format**: WAV (uncompressed)
- **Sample Rate**: 22050 Hz (configurable)
- **Quality**: High-quality natural speech
- **Duration**: ~15 characters per second

## 📱 Demo Scenarios

### 1. Multi-language Demo
Generate the same text in different languages:
```javascript
const languages = ['en-IN', 'hi-IN', 'ta-IN', 'te-IN'];
const text = "Hello, how are you today?";
```

### 2. Meeting Assistant Demo
Generate realistic meeting responses:
```javascript
const responses = [
    "I understand your concern about the project timeline.",
    "Let me summarize the key points from our discussion.",
    "Based on the data, I recommend we proceed with option A."
];
```

### 3. Interactive Demo
Create a conversation flow:
```javascript
const conversation = [
    "Hello, I'm your AI meeting assistant.",
    "I can help you with note-taking and summaries.",
    "Would you like me to join your meeting?"
];
```

## 🔍 Troubleshooting

### Common Issues

1. **Audio not generating**
   - Check Sarvam API key in `.env`
   - Verify network connectivity
   - Check server logs for errors

2. **Files not saving**
   - Ensure `test-audio/` directory exists
   - Check file permissions
   - Verify disk space

3. **Audio playback issues**
   - Check browser audio settings
   - Try downloading and playing locally
   - Verify WAV file format

### Debug Commands
```bash
# Check server status
curl http://localhost:3001/health

# List generated files
curl http://localhost:3001/api/test-audio

# Test TTS directly
curl -X POST http://localhost:3001/api/test/tts-save \
  -H "Content-Type: application/json" \
  -d '{"text":"test","language":"en-IN"}'
```

## 🎉 Next Steps

1. **Test all languages** to ensure quality
2. **Create demo scripts** for presentations
3. **Integrate with meeting scenarios** when Vexa is available
4. **Add more voice options** if Sarvam supports them

## 📚 References

- [Sarvam AI Documentation](https://docs.sarvam.ai/api-reference-docs/introduction)
- [Supported Languages](https://docs.sarvam.ai/api-reference-docs/text-to-speech/convert)
- [Audio Processing Best Practices](https://github.com/sameermahajan/ML-Audio-Models)

---

**Ready to test?** Start the server and visit http://localhost:3001 to begin generating audio files! 🎤 