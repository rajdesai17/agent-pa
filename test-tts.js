const axios = require('axios');

// Test TTS functionality
async function testTTS() {
    const testTexts = [
        {
            text: "Hello, this is a test of the Sarvam TTS system. How does this sound?",
            language: "en-IN"
        },
        {
            text: "नमस्ते, यह सर्वम टीटीएस सिस्टम का परीक्षण है। यह कैसा लग रहा है?",
            language: "hi-IN"
        },
        {
            text: "வணக்கம், இது சர்வம் TTS சிஸ்டத்தின் சோதனை. இது எப்படி இருக்கிறது?",
            language: "ta-IN"
        },
        {
            text: "హలో, ఇది సర్వం TTS సిస్టమ్ యొక్క పరీక్ష. ఇది ఎలా ఉంది?",
            language: "te-IN"
        }
    ];

    console.log("🎤 Testing Sarvam TTS with multiple languages...\n");

    for (const test of testTexts) {
        try {
            console.log(`📝 Testing: "${test.text}" (${test.language})`);
            
            const response = await axios.post('http://localhost:3001/api/test/tts-save', {
                text: test.text,
                language: test.language
            });

            if (response.data.success) {
                console.log(`✅ Success! Audio saved: ${response.data.audioFile}`);
                console.log(`📂 Path: ${response.data.filePath}\n`);
            } else {
                console.log(`❌ Failed: ${response.data.error}\n`);
            }
        } catch (error) {
            console.log(`❌ Error: ${error.message}\n`);
        }
    }

    console.log("🎵 Check the 'test-audio' folder in your project root for the generated files!");
    console.log("🌐 You can also test via the web interface at: http://localhost:3001");
}

// Run the test
testTTS().catch(console.error); 