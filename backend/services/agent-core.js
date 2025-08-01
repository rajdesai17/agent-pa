const GeminiService = require('./gemini-service');
const SarvamService = require('./sarvam-service');
const VexaService = require('./vexa-service.js');
const DuplicateDetector = require('../utils/duplicate-detector');

class AgentCore {
    constructor() {
        this.gemini = new GeminiService();
        this.sarvam = new SarvamService();
        this.vexa = new VexaService();
        this.duplicateDetector = new DuplicateDetector();
        this.activeSessions = new Map();
        this.transcriptBuffer = new Map();
        this.responseQueue = new Map();
        this.lastResponseTime = new Map(); // Track last response time per meeting
    }

    async startMeetingSession(meetingId, context, options = {}) {
        try {
            const botResult = await this.vexa.requestBot(meetingId, {
                botName: options.botName || 'AI Assistant'
            });
            if (!botResult.success) {
                console.warn(`⚠️ Vexa bot request failed: ${botResult.error}`);
                console.log(`📡 Starting session with mock transcript mode`);
                // Continue with session even if Vexa fails
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
        const processedSegments = new Set(); // Track processed segments to prevent duplicates
        
        const monitor = setInterval(async () => {
            const session = this.activeSessions.get(meetingId);
            if (!session || !session.isActive) {
                clearInterval(monitor);
                return;
            }
            try {
                // Try to get real transcript first
                const transcriptResult = await this.vexa.getTranscript(meetingId);
                if (transcriptResult.success && transcriptResult.transcript) {
                    const segments = transcriptResult.transcript.segments || [];
                    if (segments.length > lastTranscriptLength) {
                        const newSegments = segments.slice(lastTranscriptLength);
                        lastTranscriptLength = segments.length;
                        
                        for (const segment of newSegments) {
                            // Create a unique identifier for this segment
                            const segmentId = `${segment.start}-${segment.end}-${segment.text}`;
                            
                            // Only process if we haven't seen this segment before
                            if (!processedSegments.has(segmentId)) {
                                processedSegments.add(segmentId);
                                await this.processTranscriptSegment(meetingId, segment);
                            } else {
                                console.log(`🔄 Skipping duplicate segment: "${segment.text.substring(0, 50)}..."`);
                            }
                        }
                        session.lastActivity = new Date().toISOString();
                    }
                } else {
                    // Vexa API failed, use mock transcript for testing
                    console.log(`📡 Vexa API unavailable, using mock transcript for testing`);
                    await this.generateMockTranscript(meetingId, processedSegments);
                }
            } catch (error) {
                console.error(`Transcript monitoring error for ${meetingId}:`, error);
                // Fallback to mock transcript
                console.log(`📡 Using mock transcript due to error`);
                await this.generateMockTranscript(meetingId, processedSegments);
            }
        }, pollInterval);
        this.activeSessions.get(meetingId).monitor = monitor;
    }

    async generateMockTranscript(meetingId, processedSegments) {
        const session = this.activeSessions.get(meetingId);
        if (!session) return;

        // Generate mock transcript segments for testing
        const mockSegments = [
            {
                text: "Hi, can you hear me?",
                speaker: "Raj",
                start: Date.now() - 10000,
                end: Date.now() - 8000
            },
            {
                text: "How much work is done on the website redesign?",
                speaker: "Raj", 
                start: Date.now() - 5000,
                end: Date.now() - 3000
            },
            {
                text: "What's the timeline for completion?",
                speaker: "Raj",
                start: Date.now() - 2000,
                end: Date.now() - 1000
            }
        ];

        // Add random mock segments every few seconds
        if (Math.random() < 0.3) { // 30% chance each poll
            const mockTexts = [
                "Can you show me the latest designs?",
                "What feedback do you have so far?",
                "When can we expect the final version?",
                "Are there any issues we need to address?",
                "How does the mobile version look?"
            ];
            
            const randomText = mockTexts[Math.floor(Math.random() * mockTexts.length)];
            const now = Date.now();
            
            const newSegment = {
                text: randomText,
                speaker: "Raj",
                start: now - 2000,
                end: now - 1000
            };
            
            const segmentId = `${newSegment.start}-${newSegment.end}-${newSegment.text}`;
            
            if (!processedSegments.has(segmentId)) {
                processedSegments.add(segmentId);
                await this.processTranscriptSegment(meetingId, newSegment);
                console.log(`🎭 Mock transcript: "${randomText}"`);
            }
        }
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
            
            // Check if we've already responded to this exact text recently
            const recentResponses = this.responseQueue.get(meetingId) || [];
            const recentTexts = recentResponses.map(r => r.text).slice(-5); // Check last 5 responses
            if (recentTexts.includes(segment.text)) {
                console.log(`🔄 Skipping duplicate response for: "${segment.text.substring(0, 50)}..."`);
                return;
            }
            
            const shouldRespond = this.shouldGenerateResponse(segment, buffer);
            if (shouldRespond) {
                // Check cooldown to prevent rapid-fire responses
                const lastResponse = this.lastResponseTime.get(meetingId);
                const now = Date.now();
                if (lastResponse && (now - lastResponse) < 3000) { // 3 second cooldown
                    console.log(`⏰ Skipping response due to cooldown for: "${segment.text.substring(0, 50)}..."`);
                    return;
                }
                this.lastResponseTime.set(meetingId, now);
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
                    
                    // Check for duplicate audio first
                    const duplicateCheck = this.duplicateDetector.checkDuplicate(response.response, ttsLang, 'anushka');
                    
                    let ttsResult;
                    if (duplicateCheck.isDuplicate) {
                        console.log(`🎵 Using existing audio for duplicate response: "${response.response.substring(0, 50)}..."`);
                        // Create a mock result using existing file
                        const fs = require('fs');
                        const audioData = fs.readFileSync(duplicateCheck.existingFile);
                        ttsResult = {
                            success: true,
                            audio: audioData,
                            isDuplicate: true
                        };
                    } else {
                        ttsResult = await this.sarvam.textToSpeech(response.response, {
                            language: ttsLang
                        });
                    }
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
                        
                        // Play audio locally and store for later listening
                        try {
                            const fs = require('fs');
                            const path = require('path');
                            const { exec } = require('child_process');
                            
                            // Create audio storage directory if it doesn't exist
                            const audioDir = path.join(__dirname, '../../agent-responses');
                            if (!fs.existsSync(audioDir)) {
                                fs.mkdirSync(audioDir, { recursive: true });
                            }
                            
                            // Generate filename with timestamp and meeting info
                            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                            const audioFileName = `response_${meetingId}_${timestamp}.wav`;
                            const audioPath = path.join(audioDir, audioFileName);
                            
                            // Save audio file
                            fs.writeFileSync(audioPath, ttsResult.audio);
                            console.log(`💾 Audio saved: ${audioPath}`);
                            
                            // Register in duplicate detector if not a duplicate
                            if (!ttsResult.isDuplicate) {
                                const downloadUrl = `/api/agent/responses/${audioFileName}`;
                                this.duplicateDetector.registerAudioFile(response.response, ttsLang, 'anushka', audioPath, downloadUrl);
                            }
                            
                            // Play audio locally (participants will hear via your microphone)
                            const command = process.platform === 'win32' 
                                ? `powershell -c "(New-Object Media.SoundPlayer '${audioPath}').PlaySync()"` 
                                : process.platform === 'darwin' 
                                ? `afplay "${audioPath}"` 
                                : `aplay "${audioPath}"`;
                            
                            exec(command, (error, stdout, stderr) => {
                                if (error) {
                                    console.error(`🔊 Audio playback error: ${error.message}`);
                                } else {
                                    console.log(`🔊 Audio played successfully for ${meetingId}`);
                                }
                            });
                            
                            // Also save a transcript log
                            const logPath = path.join(audioDir, `transcript_${meetingId}_${timestamp}.txt`);
                            const logContent = `Timestamp: ${new Date().toISOString()}\nMeeting ID: ${meetingId}\nResponse: ${response.response}\nAudio File: ${audioFileName}\n\n`;
                            fs.appendFileSync(logPath, logContent);
                            
                        } catch (audioError) {
                            console.error(`Audio processing error for ${meetingId}:`, audioError.message);
                        }
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

    async stopMeetingSession(meetingId) {
        try {
            const session = this.activeSessions.get(meetingId);
            if (!session) {
                return {
                    success: false,
                    error: 'No active session found for this meeting'
                };
            }

            // Stop transcript monitoring
            if (session.monitor) {
                clearInterval(session.monitor);
            }

            // Stop the bot via Vexa
            const stopResult = await this.vexa.stopBot(meetingId);
            
            // Generate meeting summary
            const summary = await this.generateMeetingSummary(meetingId);

            // Clean up session data
            this.activeSessions.delete(meetingId);
            this.transcriptBuffer.delete(meetingId);
            this.responseQueue.delete(meetingId);

            return {
                success: true,
                message: 'Meeting session stopped successfully',
                summary: summary,
                botStopResult: stopResult
            };
        } catch (error) {
            console.error('Stop Session Error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async cleanupAllSessions() {
        try {
            const sessions = Array.from(this.activeSessions.keys());
            const results = [];

            for (const meetingId of sessions) {
                const result = await this.stopMeetingSession(meetingId);
                results.push({ meetingId, result });
            }

            return {
                success: true,
                message: `Cleaned up ${sessions.length} active sessions`,
                results: results
            };
        } catch (error) {
            console.error('Cleanup Error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    getTranscript(meetingId) {
        const buffer = this.transcriptBuffer.get(meetingId);
        if (!buffer || buffer.length === 0) {
            return {
                success: false,
                error: 'No transcript available for this meeting'
            };
        }

        return {
            success: true,
            transcript: {
                segments: buffer,
                totalSegments: buffer.length,
                lastUpdated: new Date().toISOString()
            }
        };
    }
}

module.exports = AgentCore; 