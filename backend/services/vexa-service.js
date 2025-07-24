const axios = require('axios');

class VexaService {
    constructor() {
        this.apiKey = process.env.VEXA_API_KEY;
        this.baseUrl = process.env.VEXA_BASE_URL;
        
        this.headers = {
            'X-API-Key': this.apiKey,
            'Content-Type': 'application/json'
        };

        this.activeBots = new Map(); // Track active bots
    }

    async requestBot(meetingId, options = {}, retries = 3) {
        const payload = {
            platform: "google_meet",
            native_meeting_id: meetingId
        };

        // Add optional bot_name if provided
        if (options.botName || process.env.AGENT_NAME) {
            payload.bot_name = options.botName || process.env.AGENT_NAME;
        }

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                console.log(`Vexa Bot Request - Attempt ${attempt}/${retries} for meeting: ${meetingId}`);
                
                const response = await axios.post(`${this.baseUrl}/bots`, payload, {
                    headers: this.headers,
                    timeout: 30000
                });

                if (response.data) {
                    this.activeBots.set(meetingId, {
                        platform: "google_meet",
                        botData: response.data,
                        requestedAt: new Date().toISOString()
                    });

                    return {
                        success: true,
                        botId: response.data.id || meetingId,
                        data: response.data,
                        message: 'Bot requested successfully. It will join in ~10 seconds.'
                    };
                }

                return {
                    success: false,
                    error: 'No response data received'
                };

            } catch (error) {
                console.error(`Vexa Bot Request Error (Attempt ${attempt}/${retries}):`, error.response?.data || error.message);
                
                // Handle 409 - Bot already exists for this meeting
                if (error.response?.status === 409) {
                    console.log(`Bot already exists for meeting ${meetingId}, attempting to get existing bot info...`);
                    
                    // Try to get existing bot info
                    try {
                        const existingBot = await this.getBotInfo(meetingId);
                        if (existingBot.success) {
                            this.activeBots.set(meetingId, {
                                platform: "google_meet",
                                botData: existingBot.data,
                                requestedAt: new Date().toISOString(),
                                reused: true
                            });
                            
                            return {
                                success: true,
                                botId: existingBot.data.id || meetingId,
                                data: existingBot.data,
                                message: 'Using existing bot for this meeting.',
                                reused: true
                            };
                        }
                    } catch (getBotError) {
                        console.warn('Could not get existing bot info:', getBotError.message);
                    }
                    
                    // If we can't reuse, return a helpful error
                    return {
                        success: false,
                        error: 'A bot is already active for this meeting. Please stop the existing session first or wait for it to finish.',
                        code: 409
                    };
                }
                
                if (attempt === retries) {
                    return {
                        success: false,
                        error: `Failed after ${retries} attempts: ${error.response?.data?.message || error.message}`
                    };
                }
                
                // Wait before retry (exponential backoff)
                const delay = Math.pow(2, attempt) * 1000;
                console.log(`Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    async getTranscript(meetingId, platform = "google_meet") {
        try {
            const response = await axios.get(
                `${this.baseUrl}/transcripts/${platform}/${meetingId}`,
                { headers: this.headers, timeout: 5000 }
            );

            if (response.data) {
                return {
                    success: true,
                    transcript: response.data,
                    meetingId: meetingId,
                    lastUpdated: new Date().toISOString()
                };
            }

            return {
                success: false,
                error: 'No transcript data available'
            };

        } catch (error) {
            // Don't log errors for transcript requests - they're frequent
            return {
                success: false,
                error: error.response?.data?.message || error.message
            };
        }
    }

    async getBotStatus() {
        try {
            const response = await axios.get(`${this.baseUrl}/bots/status`, {
                headers: this.headers,
                timeout: 5000
            });

            return {
                success: true,
                bots: response.data || [],
                activeBotCount: response.data?.length || 0
            };

        } catch (error) {
            console.error('Vexa Status Error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async stopBot(meetingId, platform = "google_meet") {
        try {
            const response = await axios.delete(
                `${this.baseUrl}/bots/${platform}/${meetingId}`,
                { headers: this.headers, timeout: 10000 }
            );

            // Remove from active bots tracking
            this.activeBots.delete(meetingId);

            return {
                success: true,
                data: response.data,
                message: 'Bot stopped successfully'
            };

        } catch (error) {
            console.error('Vexa Stop Bot Error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || error.message
            };
        }
    }

    async updateBotConfig(meetingId, config, platform = "google_meet") {
        try {
            const response = await axios.put(
                `${this.baseUrl}/bots/${platform}/${meetingId}/config`,
                config,
                { headers: this.headers, timeout: 5000 }
            );

            return {
                success: true,
                data: response.data
            };

        } catch (error) {
            console.error('Vexa Update Config Error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getBotInfo(meetingId, platform = "google_meet") {
        try {
            const response = await axios.get(
                `${this.baseUrl}/bots/${platform}/${meetingId}`,
                { headers: this.headers, timeout: 5000 }
            );

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data?.message || error.message
            };
        }
    }

    async sendAudioToBot(meetingId, audioBuffer, platform = "google_meet") {
        try {
            console.log(`Attempting to send audio to bot for meeting: ${meetingId}, audio size: ${audioBuffer.length} bytes`);
            
            // Try different possible endpoints for sending audio
            const possibleEndpoints = [
                `${this.baseUrl}/bots/${platform}/${meetingId}/audio`,
                `${this.baseUrl}/bots/${platform}/${meetingId}/speak`,
                `${this.baseUrl}/bots/${platform}/${meetingId}/message`,
                `${this.baseUrl}/meetings/${platform}/${meetingId}/audio`,
                `${this.baseUrl}/meetings/${platform}/${meetingId}/speak`
            ];
            
            // Create form data to send audio file
            const FormData = require('form-data');
            const form = new FormData();
            
            // Convert buffer to audio file
            form.append('audio', audioBuffer, {
                filename: 'response.wav',
                contentType: 'audio/wav'
            });
            
            for (const endpoint of possibleEndpoints) {
                try {
                    console.log(`Trying endpoint: ${endpoint}`);
                    const response = await axios.post(
                        endpoint,
                        form,
                        {
                            headers: {
                                ...this.headers,
                                ...form.getHeaders()
                            },
                            timeout: 10000
                        }
                    );

                    console.log(`✅ Audio sent successfully via ${endpoint}`);
                    return {
                        success: true,
                        message: `Audio sent successfully via ${endpoint}`,
                        data: response.data,
                        endpoint
                    };
                } catch (endpointError) {
                    console.log(`❌ ${endpoint} failed: ${endpointError.response?.status} ${endpointError.response?.data?.detail || endpointError.message}`);
                    continue;
                }
            }
            
            return {
                success: false,
                error: 'All audio endpoints failed - Vexa may not support direct audio upload'
            };
        } catch (error) {
            console.error('Vexa Send Audio Error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || 'Failed to send audio to bot'
            };
        }
    }

    async sendTextToBot(meetingId, text, platform = "google_meet") {
        try {
            console.log(`Attempting to send text to bot for meeting: ${meetingId}, text: ${text}`);
            
            // Try different possible endpoints for sending text
            const possibleEndpoints = [
                `${this.baseUrl}/bots/${platform}/${meetingId}/speak`,
                `${this.baseUrl}/bots/${platform}/${meetingId}/message`,
                `${this.baseUrl}/bots/${platform}/${meetingId}/chat`,
                `${this.baseUrl}/meetings/${platform}/${meetingId}/message`,
                `${this.baseUrl}/meetings/${platform}/${meetingId}/speak`
            ];
            
            for (const endpoint of possibleEndpoints) {
                try {
                    console.log(`Trying endpoint: ${endpoint}`);
                    const response = await axios.post(
                        endpoint,
                        { 
                            text: text,
                            message: text,
                            content: text
                        },
                        {
                            headers: this.headers,
                            timeout: 10000
                        }
                    );

                    console.log(`✅ Text sent successfully via ${endpoint}`);
                    return {
                        success: true,
                        message: `Text sent successfully via ${endpoint}`,
                        data: response.data,
                        endpoint
                    };
                } catch (endpointError) {
                    console.log(`❌ ${endpoint} failed: ${endpointError.response?.status} ${endpointError.response?.data?.detail || endpointError.message}`);
                    continue;
                }
            }
            
            return {
                success: false,
                error: 'All text endpoints failed - Vexa may not support direct text sending'
            };
        } catch (error) {
            console.error('Vexa Send Text Error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || 'Failed to send text to bot'
            };
        }
    }

    async testConnection() {
        try {
            if (!this.apiKey || !this.baseUrl) {
                return {
                    success: false,
                    status: 'Configuration error',
                    error: 'Vexa API key or base URL not configured'
                };
            }

            console.log('Testing Vexa API connection...');
            console.log(`Base URL: ${this.baseUrl}`);
            console.log(`Using API Key: ${this.apiKey ? 'Configured' : 'Missing'}`);
            
            // Test connection by getting user info or health endpoint
            const response = await axios.get(`${this.baseUrl}/user`, {
                headers: this.headers,
                timeout: 10000
            });
            
            return {
                success: true,
                status: 'Connected',
                message: 'Vexa API is accessible',
                data: response.data
            };
        } catch (error) {
            console.error('Vexa API connection test failed:', error.response?.status, error.response?.data || error.message);
            
            if (error.response?.status === 401) {
                return {
                    success: false,
                    status: 'Authentication failed',
                    error: 'Invalid Vexa API key'
                };
            } else if (error.response?.status === 404) {
                return {
                    success: false,
                    status: 'Endpoint not found',
                    error: 'Vexa API endpoint not found - check base URL configuration'
                };
            } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                return {
                    success: false,
                    status: 'Connection failed',
                    error: 'Cannot reach Vexa API server'
                };
            }
            
            return {
                success: false,
                status: 'Connection failed',
                error: error.response?.data?.message || error.message
            };
        }
    }

    async getMeetings() {
        try {
            const response = await axios.get(`${this.baseUrl}/meetings`, {
                headers: this.headers,
                timeout: 5000
            });

            return {
                success: true,
                meetings: response.data || []
            };
        } catch (error) {
            console.error('Vexa Get Meetings Error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || error.message
            };
        }
    }

    async updateMeetingData(meetingId, meetingData, platform = "google_meet") {
        try {
            const response = await axios.patch(
                `${this.baseUrl}/meetings/${platform}/${meetingId}`,
                meetingData,
                { headers: this.headers, timeout: 5000 }
            );

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('Vexa Update Meeting Error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || error.message
            };
        }
    }

    async setWebhook(webhookUrl) {
        try {
            const response = await axios.put(
                `${this.baseUrl}/user/webhook`,
                { webhook_url: webhookUrl },
                { headers: this.headers, timeout: 5000 }
            );

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('Vexa Set Webhook Error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || error.message
            };
        }
    }

    getActiveBots() {
        return Array.from(this.activeBots.entries()).map(([meetingId, data]) => ({
            meetingId,
            ...data
        }));
    }
}

module.exports = VexaService;