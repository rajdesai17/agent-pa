const GeminiService = require('./gemini-service');
const SarvamService = require('./sarvam-service');
const VexaService = require('./vexa-service.js');

class AgentCore {
    constructor() {
        this.gemini = new GeminiService();
        this.sarvam = new SarvamService();
        this.vexa = new VexaService();
        this.activeSessions = new Map();
        this.transcriptBuffer = new Map();
        this.responseQueue = new Map();
    }

    async startMeetingSession(meetingId, context, options = {}) {
        try {
            const botResult = await this.vexa.requestBot(meetingId, {
                botName: options.botName || 'AI Assistant'
            });
            if (!botResult.success) {
                throw new Error(`Failed to request bot: ${botResult.error}`);
            }
            if (options.language && options.language !== 'en') {
                console.log(`Configuring bot language to: ${options.language}`);
                const configResult = await this.vexa.updateBotConfig(meetingId, {
                    language: options.language
                });
                if (!configResult.success) {
                    console.warn(`Failed to set bot language: ${configResult.error}`);
                }
            }
            const session = {
                meetingId,
                context,
                startTime: new Date().toISOString(),
                isActive: true,
                participantCount: 0,
                lastActivity: new Date().toISOString(),
                options
            };
            this.activeSessions.set(meetingId, session);
            this.transcriptBuffer.set(meetingId, []);
            this.responseQueue.set(meetingId, []);
            this.startTranscriptMonitoring(meetingId);
            return {
                success: true,
                sessionId: meetingId,
                message: 'Meeting session started successfully',
                botInfo: botResult.data
            };
        } catch (error) {
            console.error('Start Session Error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    startTranscriptMonitoring(meetingId) {
        const pollInterval = 2000;
        let lastTranscriptLength = 0;
        const monitor = setInterval(async () => {
            const session = this.activeSessions.get(meetingId);
            if (!session || !session.isActive) {
                clearInterval(monitor);
                return;
            }
            try {
                const transcriptResult = await this.vexa.getTranscript(meetingId);
                if (transcriptResult.success && transcriptResult.transcript) {
                    const segments = transcriptResult.transcript.segments || [];
                    if (segments.length > lastTranscriptLength) {
                        const newSegments = segments.slice(lastTranscriptLength);
                        lastTranscriptLength = segments.length;
                        for (const segment of newSegments) {
                            await this.processTranscriptSegment(meetingId, segment);
                        }
                        session.lastActivity = new Date().toISOString();
                    }
                }
            } catch (error) {
                console.error(`Transcript monitoring error for ${meetingId}:`, error);
            }
        }, pollInterval);
        this.activeSessions.get(meetingId).monitor = monitor;
    }

    async processTranscriptSegment(meetingId, segment) {
        try {
            const session = this.activeSessions.get(meetingId);
            if (!session) return;
            const buffer = this.transcriptBuffer.get(meetingId);
            buffer.push({
                ...segment,
                processed: false,
                timestamp: new Date().toISOString()
            });
            const shouldRespond = this.shouldGenerateResponse(segment, buffer);
            if (shouldRespond) {
                const response = await this.generateContextualResponse(
                    meetingId, 
                    segment.text, 
                    session.context
                );
                if (response.success) {
                    // Validate Sarvam TTS language code
                    const allowedLangs = [
                        'bn-IN','en-IN','gu-IN','hi-IN','kn-IN','ml-IN','mr-IN','od-IN','pa-IN','ta-IN','te-IN'
                    ];
                    let ttsLang = session.options.language || 'en-IN';
                    if (!allowedLangs.includes(ttsLang)) ttsLang = 'en-IN';
                    const ttsResult = await this.sarvam.textToSpeech(response.response, {
                        language: ttsLang
                    });
                    const queue = this.responseQueue.get(meetingId);
                    queue.push({
                        text: response.response,
                        audio: ttsResult.success ? ttsResult.audio : null,
                        audioError: ttsResult.success ? null : ttsResult.error,
                        timestamp: new Date().toISOString(),
                        triggerSegment: segment
                    });
                    segment.processed = true;
                    console.log(`Generated response for ${meetingId}: ${response.response}`);
                    if (ttsResult.success) {
                        console.log(`TTS conversion successful: ${ttsResult.audio.length} bytes`);
                        // TODO: Send audio to Vexa or frontend for playback
                    } else {
                        console.error(`TTS conversion failed: ${ttsResult.error}`);
                    }
                }
            }
        } catch (error) {
            console.error('Process segment error:', error);
        }
    }

    shouldGenerateResponse(segment, buffer) {
        const text = segment.text.toLowerCase();
        if (text.includes('ai') || text.includes('assistant') || text.includes('bot')) {
            return true;
        }
        if (text.trim().endsWith('?')) {
            return true;
        }
        const lastSegment = buffer[buffer.length - 2];
        if (lastSegment && segment.start - lastSegment.end > 5) {
            return true;
        }
        if (text.includes('summary') || text.includes('wrap up') || text.includes('next steps')) {
            return true;
        }
        return false;
    }

    async generateContextualResponse(meetingId, transcript, context) {
        const session = this.activeSessions.get(meetingId);
        const buffer = this.transcriptBuffer.get(meetingId);
        const meetingState = {
            duration: this.calculateDuration(session.startTime),
            participants: this.extractParticipants(buffer),
            topic: context || 'General discussion'
        };
        return await this.gemini.generateResponse(transcript, context, meetingState);
    }

    calculateDuration(startTime) {
        const start = new Date(startTime);
        const now = new Date();
        const diff = Math.floor((now - start) / 1000);
        const min = Math.floor(diff / 60);
        const sec = diff % 60;
        return `${min}m ${sec}s`;
    }

    extractParticipants(buffer) {
        const speakers = new Set();
        for (const seg of buffer) {
            if (seg.speaker) speakers.add(seg.speaker);
        }
        return Array.from(speakers);
    }

    getSessionStatus(meetingId) {
        const session = this.activeSessions.get(meetingId);
        const buffer = this.transcriptBuffer.get(meetingId);
        const queue = this.responseQueue.get(meetingId);
        if (!session) {
            return { exists: false };
        }
        return {
            exists: true,
            isActive: session.isActive,
            startTime: session.startTime,
            duration: this.calculateDuration(session.startTime),
            transcriptSegments: buffer?.length || 0,
            responses: queue?.length || 0,
            lastActivity: session.lastActivity,
            participants: this.extractParticipants(buffer || [])
        };
    }

    async generateMeetingSummary(meetingId) {
        const buffer = this.transcriptBuffer.get(meetingId);
        const session = this.activeSessions.get(meetingId);
        if (!buffer || buffer.length === 0) {
            return 'No transcript available for summary.';
        }
        const fullTranscript = buffer.map(segment => 
            `${segment.speaker || 'Speaker'}: ${segment.text}`
        ).join('\n');
        const metadata = {
            date: session.startTime,
            duration: this.calculateDuration(session.startTime),
            participants: this.extractParticipants(buffer)
        };
        const summaryResult = await this.gemini.generateMeetingSummary(fullTranscript, metadata);
        return summaryResult.success ? summaryResult.summary : 'Summary generation failed.';
    }
}

module.exports = AgentCore; 