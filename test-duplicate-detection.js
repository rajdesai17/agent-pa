const axios = require('axios');

// Test duplicate detection functionality
async function testDuplicateDetection() {
    const testTexts = [
        "Hello, this is a test message.",
        "Hello, this is a test message.", // Duplicate
        "How are you today?",
        "How are you today?", // Duplicate
        "This is a unique message.",
        "नमस्ते, यह एक परीक्षण संदेश है।",
        "नमस्ते, यह एक परीक्षण संदेश है।" // Duplicate in Hindi
    ];

    console.log("🎤 Testing Duplicate Detection System...\n");

    for (let i = 0; i < testTexts.length; i++) {
        const text = testTexts[i];
        const isDuplicate = i % 2 === 1; // Every odd index is a duplicate
        
        try {
            console.log(`📝 Test ${i + 1}: "${text}"`);
            
            const response = await axios.post('http://localhost:3001/api/test/tts-save', {
                text: text,
                language: text.includes('नमस्ते') ? 'hi-IN' : 'en-IN'
            });

            if (response.data.success) {
                if (response.data.isDuplicate) {
                    console.log(`✅ Duplicate detected! Using existing file: ${response.data.audioFile}`);
                } else {
                    console.log(`🆕 New audio generated: ${response.data.audioFile}`);
                }
                console.log(`📂 Path: ${response.data.filePath}\n`);
            } else {
                console.log(`❌ Failed: ${response.data.error}\n`);
            }
        } catch (error) {
            console.log(`❌ Error: ${error.message}\n`);
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Test duplicate detector stats
    try {
        console.log("📊 Checking duplicate detector stats...");
        const statsResponse = await axios.get('http://localhost:3001/api/duplicate-detector/stats');
        console.log(`📈 Stats: ${JSON.stringify(statsResponse.data.stats, null, 2)}\n`);
    } catch (error) {
        console.log(`❌ Error getting stats: ${error.message}\n`);
    }

    console.log("🎵 Check the 'test-audio' folder for generated files!");
    console.log("🌐 You can also test via the web interface at: http://localhost:3001");
}

// Run the test
testDuplicateDetection().catch(console.error); 