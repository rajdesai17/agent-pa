require('dotenv').config();
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

// Agent response audio endpoints
app.get('/api/agent/responses', (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        
        const audioDir = path.join(__dirname, '../agent-responses');
        if (!fs.existsSync(audioDir)) {
            return res.json({ responses: [] });
        }
        
        const files = fs.readdirSync(audioDir);
        const audioFiles = files.filter(file => file.endsWith('.wav'));
        const responses = audioFiles.map(file => {
            const stats = fs.statSync(path.join(audioDir, file));
            const parts = file.replace('.wav', '').split('_');
            return {
                filename: file,
                meetingId: parts[1],
                timestamp: parts.slice(2).join('_'),
                size: stats.size,
                created: stats.birthtime,
                downloadUrl: `/api/agent/responses/${file}`
            };
        }).sort((a, b) => new Date(b.created) - new Date(a.created));
        
        res.json({ responses });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/agent/responses/:filename', (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        
        const { filename } = req.params;
        const audioDir = path.join(__dirname, '../agent-responses');
        const filePath = path.join(audioDir, filename);
        
        if (!fs.existsSync(filePath) || !filename.endsWith('.wav')) {
            return res.status(404).json({ error: 'Audio file not found' });
        }
        
        res.set({
            'Content-Type': 'audio/wav',
            'Content-Disposition': `attachment; filename="${filename}"`
        });
        
        res.sendFile(filePath);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Agent management endpoints
app.post('/api/agent/start', async (req, res) => {
    try {
        const { meetingId, context, options } = req.body;
        if (!meetingId) {
            return res.status(400).json({ error: 'meetingId is required' });
        }
        
        const result = await agentCore.startMeetingSession(meetingId, context, options);
        res.json(result);
    } catch (error) {
        console.error('Start agent error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/agent/stop', async (req, res) => {
    try {
        const { meetingId } = req.body;
        if (!meetingId) {
            return res.status(400).json({ error: 'meetingId is required' });
        }
        
        const result = await agentCore.stopMeetingSession(meetingId);
        res.json(result);
    } catch (error) {
        console.error('Stop agent error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/agent/status/:meetingId', (req, res) => {
    try {
        const { meetingId } = req.params;
        const status = agentCore.getSessionStatus(meetingId);
        res.json({ success: true, ...status });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/agent/transcript/:meetingId', (req, res) => {
    try {
        const { meetingId } = req.params;
        const transcript = agentCore.getTranscript(meetingId);
        res.json({ success: true, transcript });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/agent/cleanup', async (req, res) => {
    try {
        const result = await agentCore.cleanupAllSessions();
        res.json(result);
    } catch (error) {
        console.error('Cleanup error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Test endpoints
app.post('/api/test/gemini', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) {
            return res.status(400).json({ error: 'text is required' });
        }
        
        const result = await agentCore.gemini.generateResponse(text, 'Test context');
        res.json(result);
    } catch (error) {
        console.error('Gemini test error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/test/vexa', async (req, res) => {
    try {
        const result = await agentCore.vexa.testConnection();
        res.json(result);
    } catch (error) {
        console.error('Vexa test error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Test TTS and save audio endpoint
app.post('/api/test/tts-save', async (req, res) => {
    try {
        const { text, language = 'en-IN', speaker = 'anushka' } = req.body;
        if (!text) {
            return res.status(400).json({ error: 'text is required' });
        }

        console.log(`🎤 Generating TTS for: "${text}" (${language})`);
        
        const result = await sarvamService.textToSpeech(text, {
            language: language,
            speaker: speaker
        });

        if (result.success) {
            // Save to project root for easy access
            const fs = require('fs');
            const path = require('path');
            
            // Create test-audio directory in project root
            const testAudioDir = path.join(__dirname, '../test-audio');
            if (!fs.existsSync(testAudioDir)) {
                fs.mkdirSync(testAudioDir, { recursive: true });
            }
            
            // Generate filename
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const safeText = text.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '_');
            const audioFileName = `test_${safeText}_${timestamp}.wav`;
            const audioPath = path.join(testAudioDir, audioFileName);
            
            // Save audio file
            fs.writeFileSync(audioPath, result.audio);
            
            // Create metadata file
            const metadataPath = path.join(testAudioDir, `${audioFileName}.json`);
            const metadata = {
                text: text,
                language: language,
                speaker: speaker,
                timestamp: new Date().toISOString(),
                fileSize: result.audio.length,
                duration: '~' + Math.ceil(text.length / 15) + ' seconds'
            };
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
            
            console.log(`💾 Test audio saved: ${audioPath}`);
            
            res.json({
                success: true,
                message: 'Audio generated and saved successfully',
                audioFile: audioFileName,
                filePath: audioPath,
                metadata: metadata,
                downloadUrl: `/api/test-audio/${audioFileName}`
            });
        } else {
            res.status(500).json({ error: result.error, details: result.details });
        }
    } catch (error) {
        console.error('TTS save test error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Serve test audio files
app.get('/api/test-audio/:filename', (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        
        const { filename } = req.params;
        const testAudioDir = path.join(__dirname, '../test-audio');
        const filePath = path.join(testAudioDir, filename);
        
        if (!fs.existsSync(filePath) || !filename.endsWith('.wav')) {
            return res.status(404).json({ error: 'Audio file not found' });
        }
        
        res.set({
            'Content-Type': 'audio/wav',
            'Content-Disposition': `attachment; filename="${filename}"`
        });
        
        res.sendFile(filePath);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List all test audio files
app.get('/api/test-audio', (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        
        const testAudioDir = path.join(__dirname, '../test-audio');
        if (!fs.existsSync(testAudioDir)) {
            return res.json({ files: [] });
        }
        
        const files = fs.readdirSync(testAudioDir);
        const audioFiles = files.filter(file => file.endsWith('.wav'));
        const audioList = audioFiles.map(file => {
            const stats = fs.statSync(path.join(testAudioDir, file));
            const metadataFile = file + '.json';
            let metadata = null;
            
            if (fs.existsSync(path.join(testAudioDir, metadataFile))) {
                try {
                    metadata = JSON.parse(fs.readFileSync(path.join(testAudioDir, metadataFile), 'utf8'));
                } catch (e) {
                    console.warn(`Could not parse metadata for ${file}`);
                }
            }
            
            return {
                filename: file,
                size: stats.size,
                created: stats.birthtime,
                downloadUrl: `/api/test-audio/${file}`,
                metadata: metadata
            };
        }).sort((a, b) => new Date(b.created) - new Date(a.created));
        
        res.json({ files: audioList });
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