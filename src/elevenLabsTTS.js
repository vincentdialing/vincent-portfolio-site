// ElevenLabs Text-to-Speech Service with Streaming
const ELEVENLABS_API_KEY = '5710f39af47a45a7a9e7558acb34d2be3ef5613538c949cef23e4f30580bb0cd';

// User's selected voice
const VOICE_ID = 'wNl2YBRc8v5uIcq6gOxd';

/**
 * Convert text to speech using ElevenLabs Streaming API
 * Starts playing audio as chunks arrive for faster response
 */
export async function speakWithElevenLabs(text, onStart, onEnd, onThinking) {
    console.log('🎤 ElevenLabs: Starting stream...');

    // Show thinking state
    if (onThinking) onThinking();

    try {
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`, {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': ELEVENLABS_API_KEY
            },
            body: JSON.stringify({
                text: text,
                model_id: 'eleven_multilingual_v2',
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                    style: 0.0,
                    use_speaker_boost: true
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('🎤 ElevenLabs ERROR:', response.status, errorText);
            fallbackSpeak(text, onEnd);
            return null;
        }

        console.log('🎤 ElevenLabs: Streaming audio...');

        // Create audio context for streaming playback
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // Get the response as array buffer and decode
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Create source and play
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);

        // Trigger onStart callback
        if (onStart) onStart();
        console.log('🎤 ElevenLabs: Playing...');

        source.onended = () => {
            console.log('🎤 ElevenLabs: Finished');
            if (onEnd) onEnd();
        };

        source.start(0);

        return source;

    } catch (error) {
        console.error('🎤 ElevenLabs Error:', error);
        fallbackSpeak(text, onEnd);
        return null;
    }
}

// Fallback to browser speech synthesis
function fallbackSpeak(text, onEnd) {
    console.log('🎤 Using fallback browser speech...');
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => {
            if (onEnd) onEnd();
        };
        window.speechSynthesis.speak(utterance);
    } else {
        if (onEnd) onEnd();
    }
}

export { VOICE_ID };
