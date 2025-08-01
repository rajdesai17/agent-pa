class GoogleMeetAgent {
    constructor() {
        this.baseUrl = 'http://localhost:3001/api';
        this.currentMeetingId = null;
        this.isActive = false;
        this.statusInterval = null;
        this.transcriptInterval = null;
        
        this.initializeElements();
        this.attachEventListeners();
        this.checkServerConnection();
        this.initializeLogger();
    }

    initializeElements() {
        // Form elements
        this.meetingUrlInput = document.getElementById('meetingUrl');
        this.agentContextInput = document.getElementById('agentContext');
        this.agentNameInput = document.getElementById('agentName');
        
        // Buttons
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.testBtn = document.getElementById('testBtn');
        this.cleanupBtn = document.getElementById('cleanupBtn');
        this.refreshTranscriptBtn = document.getElementById('refreshTranscript');
        this.exportTranscriptBtn = document.getElementById('exportTranscript');
        this.refreshResponsesBtn = document.getElementById('refreshResponses');
        this.clearLogsBtn = document.getElementById('clearLogs');
        
        // TTS Testing elements
        this.ttsTextInput = document.getElementById('ttsText');
        this.ttsLanguageSelect = document.getElementById('ttsLanguage');
        this.generateTTSBtn = document.getElementById('generateTTS');
        this.refreshTestAudioBtn = document.getElementById('refreshTestAudio');
        this.testAudioContainer = document.getElementById('testAudioContainer');
        
        // Status elements
        this.connectionStatus = document.getElementById('connectionStatus');
        this.sessionDuration = document.getElementById('sessionDuration');
        this.participantCount = document.getElementById('participantCount');
        this.responseCount = document.getElementById('responseCount');
        this.transcriptCount = document.getElementById('transcriptCount');
        
        // Containers
        this.transcriptContainer = document.getElementById('transcriptContainer');
        this.responsesContainer = document.getElementById('responsesContainer');
        this.logsContainer = document.getElementById('logsContainer');
        this.loadingOverlay = document.getElementById('loadingOverlay');
    }

    attachEventListeners() {
        this.startBtn.addEventListener('click', () => this.startAgent());
        this.stopBtn.addEventListener('click', () => this.stopAgent());
        this.testBtn.addEventListener('click', () => this.testServices());
        this.cleanupBtn.addEventListener('click', () => this.cleanupSessions());
        this.refreshTranscriptBtn.addEventListener('click', () => this.refreshTranscript());
        this.exportTranscriptBtn.addEventListener('click', () => this.exportTranscript());
        this.refreshResponsesBtn.addEventListener('click', () => this.refreshResponses());
        this.clearLogsBtn.addEventListener('click', () => this.clearLogs());
        
        // TTS Testing event listeners
        this.generateTTSBtn.addEventListener('click', () => this.generateTTS());
        this.refreshTestAudioBtn.addEventListener('click', () => this.refreshTestAudio());
        
        // Auto-extract meeting ID from URL
        this.meetingUrlInput.addEventListener('input', (e) => this.extractMeetingId(e.target.value));
    }

    initializeLogger() {
        this.clearLogs();
        this.log('System initialized. Ready to start.', 'info');
        
        // Load any existing responses
        this.refreshResponses();
    }

    extractMeetingId(url) {
        if (url.includes('meet.google.com/')) {
            const match = url.match(/meet\.google\.com\/([a-z0-9-]+)/);
            if (match) {
                const meetingId = match[1];
                this.log(`Extracted meeting ID: ${meetingId}`, 'info');
                return meetingId;
            }
        }
        return null;
    }

    async checkServerConnection() {
        try {
            const response = await fetch(`${this.baseUrl.replace('/api', '')}/health`);
            if (response.ok) {
                const data = await response.json();
                this.updateConnectionStatus('online');
                this.log('Connected to server', 'success');
                
                // Check API key configuration
                const missingKeys = [];
                if (!data.services.gemini) missingKeys.push('Gemini');
                if (!data.services.sarvam) missingKeys.push('Sarvam');
                if (!data.services.vexa) missingKeys.push('Vexa');
                
                if (missingKeys.length > 0) {
                    this.log(`Warning: Missing API keys for: ${missingKeys.join(', ')}`, 'warning');
                } else {
                    this.log('All API keys configured', 'success');
                }
            } else {
                throw new Error('Server responded with error');
            }
        } catch (error) {
            this.updateConnectionStatus('offline');
            this.log('Failed to connect to server', 'error');
        }
    }

    updateConnectionStatus(status) {
        this.connectionStatus.className = `status ${status}`;
        this.connectionStatus.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    }

    async startAgent() {
        try {
            const meetingUrl = this.meetingUrlInput.value.trim();
            const meetingId = this.extractMeetingId(meetingUrl);
            
            if (!meetingId) {
                this.log('Please enter a valid Google Meet URL', 'error');
                return;
            }

            const context = this.agentContextInput.value.trim();
            const agentName = this.agentNameInput.value.trim() || 'AI Meeting Assistant';

            this.showLoading('Starting AI Agent...');
            this.log(`Starting agent for meeting: ${meetingId}`, 'info');

            const response = await fetch(`${this.baseUrl}/agent/start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    meetingId,
                    context,
                    options: {
                        botName: agentName,
                        language: 'en'
                    }
                })
            });

            const result = await response.json();
            
            if (result.success) {
                this.currentMeetingId = meetingId;
                this.isActive = true;
                this.startBtn.disabled = true;
                this.stopBtn.disabled = false;
                
                this.log('Agent started successfully!', 'success');
                this.log('Bot will join the meeting in ~10 seconds', 'info');
                
                // Start monitoring
                this.startStatusMonitoring();
                this.startTranscriptMonitoring();
                
            } else {
                throw new Error(result.error || 'Failed to start agent');
            }

        } catch (error) {
            this.log(`Error starting agent: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async stopAgent() {
        try {
            if (!this.currentMeetingId) {
                this.log('No active session to stop', 'warning');
                return;
            }

            this.showLoading('Stopping AI Agent...');
            this.log('Stopping agent...', 'info');

            const response = await fetch(`${this.baseUrl}/agent/stop`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    meetingId: this.currentMeetingId
                })
            });

            const result = await response.json();
            
            if (result.success) {
                this.isActive = false;
                this.startBtn.disabled = false;
                this.stopBtn.disabled = true;
                
                this.stopMonitoring();
                this.resetStats();
                
                this.log('Agent stopped successfully', 'success');
                
                if (result.summary) {
                    this.log('Meeting summary generated', 'info');
                    this.displayMeetingSummary(result.summary);
                }
                
                this.currentMeetingId = null;
                
            } else {
                throw new Error(result.error || 'Failed to stop agent');
            }

        } catch (error) {
            this.log(`Error stopping agent: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async testServices() {
        this.log('Testing services...', 'info');
        
        try {
            // Test Gemini
            this.log('Testing Gemini AI...', 'info');
            const geminiResponse = await fetch(`${this.baseUrl}/test/gemini`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: 'Hello, can you hear me?' })
            });
            
            const geminiResult = await geminiResponse.json();
            if (geminiResult.success) {
                this.log('✓ Gemini AI: Working', 'success');
            } else {
                this.log('✗ Gemini AI: Failed', 'error');
            }

            // Test Sarvam TTS
            this.log('Testing Sarvam TTS...', 'info');
            const ttsResponse = await fetch(`${this.baseUrl}/test/sarvam-tts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: 'This is a test message' })
            });
            
            if (ttsResponse.ok) {
                this.log('✓ Sarvam TTS: Working', 'success');
            } else {
                this.log('✗ Sarvam TTS: Failed', 'error');
            }

            // Test Vexa API
            this.log('Testing Vexa API connection...', 'info');
            const vexaResponse = await fetch(`${this.baseUrl}/test/vexa`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const vexaResult = await vexaResponse.json();
            if (vexaResult.success) {
                this.log('✓ Vexa API: Connected', 'success');
            } else {
                this.log(`✗ Vexa API: ${vexaResult.error}`, 'error');
            }

            this.log('Service testing completed', 'info');

        } catch (error) {
            this.log(`Service test error: ${error.message}`, 'error');
        }
    }

    startStatusMonitoring() {
        this.statusInterval = setInterval(async () => {
            if (!this.isActive || !this.currentMeetingId) return;

            try {
                const response = await fetch(`${this.baseUrl}/agent/status/${this.currentMeetingId}`);
                const result = await response.json();

                if (result.success && result.exists) {
                    this.updateStats({
                        duration: result.duration || '--',
                        participants: result.participants?.length || 0,
                        responses: result.responses || 0,
                        transcriptSegments: result.transcriptSegments || 0
                    });
                }
            } catch (error) {
                console.error('Status monitoring error:', error);
            }
        }, 3000); // Every 3 seconds
    }

    startTranscriptMonitoring() {
        this.transcriptInterval = setInterval(async () => {
            if (!this.isActive || !this.currentMeetingId) return;
            await this.refreshTranscript();
        }, 5000); // Every 5 seconds
    }

    stopMonitoring() {
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
            this.statusInterval = null;
        }
        
        if (this.transcriptInterval) {
            clearInterval(this.transcriptInterval);
            this.transcriptInterval = null;
        }
    }

    async refreshTranscript() {
        if (!this.currentMeetingId) return;

        try {
            const response = await fetch(`${this.baseUrl}/agent/transcript/${this.currentMeetingId}`);
            const result = await response.json();

            if (result.success && result.transcript && result.transcript.segments) {
                this.displayTranscript(result.transcript.segments);
            } else if (!result.success && result.error) {
                // Don't spam logs with transcript errors
                console.log('Transcript not yet available:', result.error);
            }
        } catch (error) {
            console.error('Refresh transcript error:', error);
        }
    }

    displayTranscript(segments) {
        if (!segments || segments.length === 0) {
            this.transcriptContainer.innerHTML = `
                <div class="transcript-placeholder">
                    <i class="fas fa-comment-dots"></i>
                    <p>Waiting for transcript data...</p>
                </div>
            `;
            return;
        }

        const transcriptHtml = segments.map(segment => `
            <div class="transcript-entry ${segment.speaker === 'agent' ? 'agent' : ''}">
                <div class="transcript-meta">
                    <span><i class="fas fa-user"></i> ${segment.speaker || 'Participant'}</span>
                    <span><i class="fas fa-clock"></i> ${new Date(segment.start * 1000).toLocaleTimeString()}</span>
                </div>
                <div class="transcript-text">${segment.text}</div>
            </div>
        `).join('');

        this.transcriptContainer.innerHTML = transcriptHtml;
        
        // Auto-scroll to bottom
        this.transcriptContainer.scrollTop = this.transcriptContainer.scrollHeight;
    }

    displayMeetingSummary(summary) {
        const summaryHtml = `
            <div class="transcript-entry agent">
                <div class="transcript-meta">
                    <span><i class="fas fa-robot"></i> Meeting Summary</span>
                    <span><i class="fas fa-clock"></i> ${new Date().toLocaleTimeString()}</span>
                </div>
                <div class="transcript-text">${summary.replace(/\n/g, '<br>')}</div>
            </div>
        `;
        
        this.transcriptContainer.insertAdjacentHTML('beforeend', summaryHtml);
        this.transcriptContainer.scrollTop = this.transcriptContainer.scrollHeight;
    }

    updateStats(stats) {
        this.sessionDuration.textContent = stats.duration;
        this.participantCount.textContent = stats.participants;
        this.responseCount.textContent = stats.responses;
        this.transcriptCount.textContent = stats.transcriptSegments;
    }

    resetStats() {
        this.sessionDuration.textContent = '--';
        this.participantCount.textContent = '--';
        this.responseCount.textContent = '--';
        this.transcriptCount.textContent = '--';
        
        this.transcriptContainer.innerHTML = `
            <div class="transcript-placeholder">
                <i class="fas fa-comment-dots"></i>
                <p>Transcript will appear here when the meeting starts...</p>
            </div>
        `;
    }

    exportTranscript() {
        const transcriptEntries = document.querySelectorAll('.transcript-entry');
        
        if (transcriptEntries.length === 0) {
            this.log('No transcript available to export', 'warning');
            return;
        }

        let transcriptText = `Meeting Transcript - ${new Date().toLocaleString()}\n`;
        transcriptText += '='.repeat(50) + '\n\n';

        transcriptEntries.forEach(entry => {
            const meta = entry.querySelector('.transcript-meta');
            const text = entry.querySelector('.transcript-text');
            
            if (meta && text) {
                const speaker = meta.textContent.split('•')[0].trim();
                transcriptText += `${speaker}: ${text.textContent}\n\n`;
            }
        });

        const blob = new Blob([transcriptText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `meeting-transcript-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.log('Transcript exported successfully', 'success');
    }

    showLoading(message = 'Loading...') {
        this.loadingOverlay.querySelector('p').textContent = message;
        this.loadingOverlay.classList.remove('hidden');
    }

    hideLoading() {
        this.loadingOverlay.classList.add('hidden');
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        logEntry.innerHTML = `
            <span class="log-time">${timestamp}</span>
            <span class="log-message">${message}</span>
        `;
        
        this.logsContainer.appendChild(logEntry);
        this.logsContainer.scrollTop = this.logsContainer.scrollHeight;
        
        // Keep only last 100 log entries
        const logs = this.logsContainer.querySelectorAll('.log-entry');
        if (logs.length > 100) {
            logs[0].remove();
        }

        console.log(`[${timestamp}] ${type.toUpperCase()}: ${message}`);
    }

    async cleanupSessions() {
        if (!confirm('This will stop and clean up all active sessions. Continue?')) {
            return;
        }
        
        try {
            this.log('Cleaning up all sessions...', 'info');
            
            const response = await fetch(`${this.baseUrl}/agent/cleanup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.log(`✓ Cleanup completed: ${result.message}`, 'success');
                
                // Reset UI state
                this.isActive = false;
                this.currentMeetingId = null;
                this.startBtn.disabled = false;
                this.stopBtn.disabled = true;
                this.stopMonitoring();
                this.resetStats();
                
            } else {
                this.log(`✗ Cleanup failed: ${result.error}`, 'error');
            }
            
        } catch (error) {
            this.log(`Cleanup error: ${error.message}`, 'error');
        }
    }

    async refreshResponses() {
        try {
            const response = await fetch(`${this.baseUrl}/agent/responses`);
            const result = await response.json();
            
            if (result.responses && result.responses.length > 0) {
                this.displayResponses(result.responses);
                this.log(`Found ${result.responses.length} agent responses`, 'info');
            } else {
                this.responsesContainer.innerHTML = `
                    <div class="responses-placeholder">
                        <i class="fas fa-microphone-slash"></i>
                        <p>No agent responses recorded yet.</p>
                    </div>
                `;
            }
        } catch (error) {
            this.log(`Error loading responses: ${error.message}`, 'error');
        }
    }

    displayResponses(responses) {
        const responsesHtml = responses.map(response => `
            <div class="response-entry">
                <div class="response-meta">
                    <span><i class="fas fa-calendar"></i> ${new Date(response.created).toLocaleString()}</span>
                    <span><i class="fas fa-users"></i> ${response.meetingId}</span>
                    <span><i class="fas fa-file-audio"></i> ${(response.size / 1024).toFixed(1)} KB</span>
                </div>
                <div class="response-controls">
                    <button data-audio-url="${response.downloadUrl}" class="btn btn-sm btn-primary play-audio-btn">
                        <i class="fas fa-play"></i> Play
                    </button>
                    <a href="${response.downloadUrl}" download="${response.filename}" class="btn btn-sm btn-secondary">
                        <i class="fas fa-download"></i> Download
                    </a>
                </div>
            </div>
        `).join('');

        this.responsesContainer.innerHTML = responsesHtml;
        
        // Add event listeners for play buttons
        this.responsesContainer.querySelectorAll('.play-audio-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const audioUrl = e.target.closest('button').dataset.audioUrl;
                this.playAudio(audioUrl);
            });
        });
    }

    playAudio(url) {
        try {
            const audio = new Audio(url);
            audio.play().catch(e => {
                this.log(`Audio playback error: ${e.message}`, 'error');
            });
        } catch (error) {
            this.log(`Error playing audio: ${error.message}`, 'error');
        }
    }

    clearLogs() {
        this.logsContainer.innerHTML = '';
        this.log('Logs cleared', 'info');
    }

    async generateTTS() {
        try {
            const text = this.ttsTextInput.value.trim();
            const language = this.ttsLanguageSelect.value;
            
            if (!text) {
                this.log('Please enter text to convert to speech', 'error');
                return;
            }

            this.showLoading('Generating audio...');
            this.log(`Generating TTS for: "${text}" (${language})`, 'info');

            const response = await fetch(`${this.baseUrl}/test/tts-save`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    language: language
                })
            });

            const result = await response.json();
            
            if (result.success) {
                this.log('✅ Audio generated and saved successfully!', 'success');
                this.log(`📁 File: ${result.audioFile}`, 'info');
                this.log(`📂 Path: ${result.filePath}`, 'info');
                
                // Refresh the test audio list
                await this.refreshTestAudio();
                
                // Auto-play the audio
                this.playAudio(result.downloadUrl);
                
            } else {
                throw new Error(result.error || 'Failed to generate audio');
            }

        } catch (error) {
            this.log(`Error generating TTS: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async refreshTestAudio() {
        try {
            const response = await fetch(`${this.baseUrl}/test-audio`);
            const result = await response.json();
            
            if (result.files && result.files.length > 0) {
                this.displayTestAudio(result.files);
                this.log(`Found ${result.files.length} test audio files`, 'info');
            } else {
                this.testAudioContainer.innerHTML = `
                    <div class="test-audio-placeholder">
                        <i class="fas fa-music"></i>
                        <p>No test audio files found. Generate some audio to see them here.</p>
                    </div>
                `;
            }
        } catch (error) {
            this.log(`Error loading test audio: ${error.message}`, 'error');
        }
    }

    displayTestAudio(files) {
        const audioHtml = files.map(file => `
            <div class="test-audio-entry">
                <div class="test-audio-meta">
                    <span><i class="fas fa-calendar"></i> ${new Date(file.created).toLocaleString()}</span>
                    <span><i class="fas fa-file-audio"></i> ${(file.size / 1024).toFixed(1)} KB</span>
                    ${file.metadata ? `<span><i class="fas fa-language"></i> ${file.metadata.language}</span>` : ''}
                </div>
                ${file.metadata ? `<div class="test-audio-text">"${file.metadata.text}"</div>` : ''}
                <div class="test-audio-controls">
                    <button data-audio-url="${file.downloadUrl}" class="btn btn-sm btn-primary play-audio-btn">
                        <i class="fas fa-play"></i> Play
                    </button>
                    <a href="${file.downloadUrl}" download="${file.filename}" class="btn btn-sm btn-secondary">
                        <i class="fas fa-download"></i> Download
                    </a>
                </div>
            </div>
        `).join('');

        this.testAudioContainer.innerHTML = audioHtml;
        
        // Add event listeners for play buttons
        this.testAudioContainer.querySelectorAll('.play-audio-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const audioUrl = e.target.closest('button').dataset.audioUrl;
                this.playAudio(audioUrl);
            });
        });
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.meetAgent = new GoogleMeetAgent();
});