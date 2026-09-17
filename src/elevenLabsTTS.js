// ElevenLabs Text-to-Speech Service with robust fallback
const ELEVENLABS_API_KEY = '5710f39af47a45a7a9e7558acb34d2be3ef5613538c949cef23e4f30580bb0cd';

// User's selected ElevenLabs voice.
const VOICE_ID = 'wNl2YBRc8v5uIcq6gOxd';

// Pre-load browser voices (they load async in many browsers)
let cachedVoices = [];
if ('speechSynthesis' in window) {
  cachedVoices = window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoices = window.speechSynthesis.getVoices();
  };
}

/**
 * Convert text to speech using ElevenLabs Streaming API
 * Falls back to browser speech synthesis if ElevenLabs fails
 */
export async function speakWithElevenLabs(text, onStart, onEnd, onThinking) {
    console.log('🎤 ElevenLabs: Starting stream...');

    // Show thinking state
    if (onThinking) onThinking();

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

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
            }),
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('🎤 ElevenLabs ERROR:', response.status, errorText);
            fallbackSpeak(text, onStart, onEnd);
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
        fallbackSpeak(text, onStart, onEnd);
        return null;
    }
}

// Fallback to browser speech synthesis (always works)
function fallbackSpeak(text, onStart, onEnd) {
    console.log('🎤 Using fallback browser speech...');

    if (!('speechSynthesis' in window)) {
        console.log('🎤 No speech synthesis available');
        if (onStart) onStart();
        if (onEnd) onEnd();
        return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    // Get voices (use cached or try fresh)
    const voices = cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices();

    // Try to find a good English male voice
    const preferred = voices.find(v =>
        /en/i.test(v.lang || '') && /male/i.test(v.name || '')
    ) || voices.find(v =>
        /en-US|en-GB/i.test(v.lang || '')
    ) || voices[0]; // Just use whatever is available

    if (preferred) {
        utterance.voice = preferred;
        console.log('🎤 Using voice:', preferred.name);
    }

    utterance.pitch = 1.0;
    utterance.rate = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => {
        console.log('🎤 Browser speech started');
        if (onStart) onStart();
    };

    utterance.onend = () => {
        console.log('🎤 Browser speech finished');
        if (onEnd) onEnd();
    };

    utterance.onerror = (e) => {
        console.error('🎤 Browser speech error:', e);
        if (onEnd) onEnd();
    };

    // Chrome bug workaround: speechSynthesis needs a small delay sometimes
    setTimeout(() => {
        window.speechSynthesis.speak(utterance);
    }, 100);
}

export { VOICE_ID };
