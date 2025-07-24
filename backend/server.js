const express = require('express');
const cors = require('cors');
const path = require('path');
const AgentCore = require('./services/agent-core');
const SarvamService = require('./services/sarvam-service');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize services
const agentCore = new AgentCore();
const sarvamService = new SarvamService();

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Root endpoint - serve frontend or API info
app.get('/', (req, res) => {
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
        res.sendFile(path.join(__dirname, '../frontend/index.html'));
    } else {
        res.json({
            name: 'Google Meet Agent Backend',
            version: '1.0.0',
            status: 'running',
            endpoints: {
                health: '/health',
                agent: {
                    start: 'POST /api/agent/start',
                    stop: 'POST /api/agent/stop',
                    status: 'GET /api/agent/status/:meetingId',
                    sessions: 'GET /api/agent/sessions'
                },
                tts: {
                    test: 'POST /api/test/sarvam-tts',
                    connection: 'GET /api/test/sarvam-connection',
                    languages: 'GET /api/sarvam/languages',
                    speakers: 'GET /api/sarvam/speakers'
                }
            }
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
            gemini: !!process.env.GEMINI_API_KEY,
            sarvam: !!process.env.SARVAM_API_KEY,
            vexa: !!process.env.VEXA_API_KEY
        }
    });
});

// TTS test endpoints
app.post('/api/test/sarvam-tts', async (req, res) => {
    try {
        const { text, language, speaker } = req.body;
        if (!text) {
            return res.status(400).json({ error: 'text is required' });
        }
        const result = await sarvamService.textToSpeech(text, {
            language: language || 'en-IN',
            speaker: speaker || 'anushka'
        });
        if (result.success) {
            res.set({
                'Content-Type': 'audio/wav',
                'Content-Length': result.audio.length,
                'Content-Disposition': 'attachment; filename="tts-output.wav"'
            });
            res.send(result.audio);
        } else {
            res.status(500).json({ error: result.error, details: result.details });
        }
    } catch (error) {
        console.error('TTS test error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/test/sarvam-connection', async (req, res) => {
    try {
        const result = await sarvamService.testConnection();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/sarvam/languages', (req, res) => {
    try {
        const languages = sarvamService.getSupportedLanguages();
        res.json({ languages });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Fallback: serve frontend for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🎤 TTS test: http://localhost:${PORT}/api/test/sarvam-connection`);
    console.log('\n🔧 Service Configuration:');
    console.log(`   Sarvam API: ${process.env.SARVAM_API_KEY ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   Vexa API: ${process.env.VEXA_API_KEY ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   Gemini API: ${process.env.GEMINI_API_KEY ? '✅ Configured' : '❌ Missing'}`);
}); 