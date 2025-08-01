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