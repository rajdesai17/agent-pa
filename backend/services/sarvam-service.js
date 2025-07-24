const axios = require('axios');

class SarvamService {
    constructor() {
        this.apiKey = process.env.SARVAM_API_KEY;
        this.baseUrl = 'https://api.sarvam.ai';
        if (!this.apiKey) {
            console.warn('SARVAM_API_KEY not found in environment variables');
        }
    }
    
    async textToSpeech(text, options = {}) {
        try {
            if (!this.apiKey) {
                return {
                    success: false,
                    error: 'Sarvam API key not configured'
                };
            }
            // Validate text length (max 1500 characters per Sarvam docs)
            if (text.length > 1500) {
                text = text.substring(0, 1500);
            }
            // Validate language code
            const allowedLangs = [
                'bn-IN','en-IN','gu-IN','hi-IN','kn-IN','ml-IN','mr-IN','od-IN','pa-IN','ta-IN','te-IN'
            ];
            let language = options.language || 'en-IN';
            if (!allowedLangs.includes(language)) language = 'en-IN';
            const requestBody = {
                text: text,
                target_language_code: language,
                speaker: options.speaker || 'anushka',
                pitch: options.pitch || 0,
                pace: options.pace || 1.0,
                loudness: options.loudness || 1.0,
                speech_sample_rate: options.sampleRate || 22050,
                model: options.model || 'bulbul:v2'
            };
            const response = await axios.post(`${this.baseUrl}/text-to-speech`, requestBody, {
                headers: {
                    'api-subscription-key': this.apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });
            if (response.status === 200 && response.data.audios && response.data.audios.length > 0) {
                const audioBase64 = response.data.audios[0];
                const audioBuffer = Buffer.from(audioBase64, 'base64');
                return {
                    success: true,
                    audio: audioBuffer,
                    requestId: response.data.request_id,
                    text: text,
                    language: requestBody.target_language_code
                };
            } else {
                return {
                    success: false,
                    error: 'No audio received from Sarvam API'
                };
            }
        } catch (error) {
            console.error('Sarvam TTS Error:', error.response?.data || error.message);
            let errorMessage = 'TTS conversion failed';
            if (error.response?.status === 400) {
                errorMessage = 'Bad request - check text and parameters';
            } else if (error.response?.status === 403) {
                errorMessage = 'API key invalid or forbidden';
            } else if (error.response?.status === 422) {
                errorMessage = 'Unprocessable entity - check language code';
            } else if (error.response?.status === 429) {
                errorMessage = 'Rate limit exceeded';
            } else if (error.response?.status === 500) {
                errorMessage = 'Sarvam API server error';
            }
            return {
                success: false,
                error: errorMessage,
                details: error.response?.data
            };
        }
    }
    async testConnection() {
        return await this.textToSpeech('Hello, this is a test.', { language: 'en-IN' });
    }
    getSupportedLanguages() {
        return [
            { code: 'en-IN', name: 'English (India)' },
            { code: 'hi-IN', name: 'Hindi' },
            { code: 'bn-IN', name: 'Bengali' },
            { code: 'ta-IN', name: 'Tamil' },
            { code: 'te-IN', name: 'Telugu' },
            { code: 'ml-IN', name: 'Malayalam' },
            { code: 'kn-IN', name: 'Kannada' },
            { code: 'gu-IN', name: 'Gujarati' },
            { code: 'mr-IN', name: 'Marathi' },
            { code: 'pa-IN', name: 'Punjabi' },
            { code: 'od-IN', name: 'Odia' }
        ];
    }
}

module.exports = SarvamService; 