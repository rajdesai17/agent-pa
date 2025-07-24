const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiService {
    constructor() {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        this.conversationHistory = [];
    }

    async generateResponse(transcript, context = "", meetingState = {}) {
        try {
            const prompt = this.buildPrompt(transcript, context, meetingState);
            
            const result = await this.model.generateContent(prompt);
            const response = result.response.text();
            
            // Store in conversation history
            this.conversationHistory.push({
                timestamp: new Date().toISOString(),
                input: transcript,
                output: response
            });
            
            return {
                success: true,
                response: response,
                metadata: {
                    model: "gemini-2.5-flash",
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            console.error('Gemini API Error:', error);
            return {
                success: false,
                error: error.message,
                fallbackResponse: "I apologize, I'm having trouble processing that right now."
            };
        }
    }

    buildPrompt(transcript, context, meetingState) {
        return `
You are an AI meeting assistant participating in a Google Meet call. 

CONTEXT: ${context}

CURRENT MEETING STATE:
- Participants: ${meetingState.participants?.join(', ') || 'Unknown'}
- Duration: ${meetingState.duration || 'Unknown'}
- Topic: ${meetingState.topic || 'General discussion'}

LATEST TRANSCRIPT: "${transcript}"

CONVERSATION HISTORY (last 3 exchanges):
${this.conversationHistory.slice(-3).map(h => `Human: ${h.input}\nAssistant: ${h.output}`).join('\n')}

INSTRUCTIONS:
1. Respond naturally and helpfully to the conversation
2. Keep responses concise (1-2 sentences max)
3. Stay relevant to the meeting context
4. Don't repeat information unless asked
5. If asked to summarize, provide key points only
6. Be professional but conversational

Respond now:`;
    }

    async generateMeetingSummary(fullTranscript, meetingMetadata) {
        try {
            const summaryPrompt = `
Please provide a comprehensive meeting summary based on this transcript:

MEETING METADATA:
- Date: ${meetingMetadata.date}
- Duration: ${meetingMetadata.duration}
- Participants: ${meetingMetadata.participants?.join(', ')}

FULL TRANSCRIPT:
${fullTranscript}

Generate a summary with:
1. Key Discussion Points (3-5 bullet points)
2. Decisions Made
3. Action Items
4. Next Steps
5. Important Quotes or Insights

Format as structured text.`;

            const result = await this.model.generateContent(summaryPrompt);
            return {
                success: true,
                summary: result.response.text()
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    clearHistory() {
        this.conversationHistory = [];
    }
}

module.exports = GeminiService;