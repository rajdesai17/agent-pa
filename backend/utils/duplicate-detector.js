const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class DuplicateDetector {
    constructor() {
        this.audioHashFile = path.join(__dirname, '../../audio-hash-cache.json');
        this.hashCache = this.loadHashCache();
    }

    // Load existing hash cache
    loadHashCache() {
        try {
            if (fs.existsSync(this.audioHashFile)) {
                const data = fs.readFileSync(this.audioHashFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.warn('Could not load hash cache:', error.message);
        }
        return {};
    }

    // Save hash cache
    saveHashCache() {
        try {
            fs.writeFileSync(this.audioHashFile, JSON.stringify(this.hashCache, null, 2));
        } catch (error) {
            console.warn('Could not save hash cache:', error.message);
        }
    }

    // Generate hash for text content
    generateTextHash(text, language = 'en-IN', speaker = 'anushka') {
        const content = `${text.toLowerCase().trim()}_${language}_${speaker}`;
        return crypto.createHash('md5').update(content).digest('hex');
    }

    // Check if audio already exists for this text
    checkDuplicate(text, language = 'en-IN', speaker = 'anushka') {
        const hash = this.generateTextHash(text, language, speaker);
        
        if (this.hashCache[hash]) {
            const existingFile = this.hashCache[hash];
            
            // Check if the file still exists
            if (fs.existsSync(existingFile.filePath)) {
                console.log(`🎵 Duplicate detected for: "${text.substring(0, 50)}..."`);
                console.log(`📁 Using existing file: ${existingFile.filePath}`);
                return {
                    isDuplicate: true,
                    existingFile: existingFile.filePath,
                    downloadUrl: existingFile.downloadUrl
                };
            } else {
                // File doesn't exist, remove from cache
                delete this.hashCache[hash];
            }
        }
        
        return { isDuplicate: false };
    }

    // Register new audio file
    registerAudioFile(text, language, speaker, filePath, downloadUrl) {
        const hash = this.generateTextHash(text, language, speaker);
        
        this.hashCache[hash] = {
            text: text,
            language: language,
            speaker: speaker,
            filePath: filePath,
            downloadUrl: downloadUrl,
            timestamp: new Date().toISOString()
        };
        
        this.saveHashCache();
        console.log(`💾 Registered new audio file: ${path.basename(filePath)}`);
    }

    // Get statistics
    getStats() {
        const totalEntries = Object.keys(this.hashCache).length;
        const validFiles = Object.values(this.hashCache).filter(entry => 
            fs.existsSync(entry.filePath)
        ).length;
        
        return {
            totalEntries,
            validFiles,
            cacheSize: Object.keys(this.hashCache).length
        };
    }

    // Clean up invalid entries
    cleanupCache() {
        let cleaned = 0;
        const keysToRemove = [];
        
        for (const [hash, entry] of Object.entries(this.hashCache)) {
            if (!fs.existsSync(entry.filePath)) {
                keysToRemove.push(hash);
                cleaned++;
            }
        }
        
        keysToRemove.forEach(key => delete this.hashCache[key]);
        
        if (cleaned > 0) {
            this.saveHashCache();
            console.log(`🧹 Cleaned up ${cleaned} invalid cache entries`);
        }
        
        return cleaned;
    }

    // List all cached entries
    listCache() {
        return Object.entries(this.hashCache).map(([hash, entry]) => ({
            hash: hash,
            text: entry.text.substring(0, 50) + (entry.text.length > 50 ? '...' : ''),
            language: entry.language,
            speaker: entry.speaker,
            filePath: entry.filePath,
            exists: fs.existsSync(entry.filePath),
            timestamp: entry.timestamp
        }));
    }
}

module.exports = DuplicateDetector; 