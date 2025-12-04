import { useEffect, useRef, useState } from 'react';

interface SpeechRecognitionConfig {
  onResult?: (transcript: string) => void;
  onError?: (error: string) => void;
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
}

interface SpeechRecognitionHook {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  start: () => void;
  stop: () => void;
  isFallbackMode: boolean;
}

// Extend the Window interface for webkit Speech Recognition
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

export function useSpeechRecognition(
  config: SpeechRecognitionConfig = {}
): SpeechRecognitionHook {
  const {
    onResult,
    onError,
    lang = 'en-US',
    continuous = true,
    interimResults = true,
  } = config;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [isFallbackMode, setIsFallbackMode] = useState(false);
  const recognitionRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const accumulatedTranscriptRef = useRef<string>(''); // Store accumulated transcript
  // Track whether stop() was intentionally invoked by user (manual stop)
  const manualStopRequestedRef = useRef<boolean>(false);

  useEffect(() => {
    // Check if browser supports Speech Recognition
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      console.warn('Speech Recognition is not supported in this browser');
      return;
    }

    console.log('Initializing Speech Recognition');
    setIsSupported(true);

    // Initialize Speech Recognition
    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    // Mobile browsers (iOS/Android) are more reliable with non-continuous, no interim
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
    const isMobile = /iphone|ipad|ipod|android/.test(ua);
    // Keep listening on mobile until user manually stops
    recognition.continuous = isMobile ? true : continuous;
    recognition.interimResults = isMobile ? false : interimResults;
    
    console.log('Speech Recognition configured:', { lang, continuous, interimResults });

    // Handle result event
    recognition.onresult = (event: any) => {
      const lastResultIndex = event.results.length - 1;
      const result = event.results[lastResultIndex];
      const transcriptText = result[0].transcript;

      setTranscript(transcriptText);

      // Accumulate final results but don't send yet
      if (result.isFinal) {
        accumulatedTranscriptRef.current = transcriptText;
      }
    };

    // Handle error event
    recognition.onerror = (event: any) => {
      console.error('Speech Recognition error:', event.error);
      setIsListening(false);

      // Provide user-friendly error messages
      let errorMessage = event.error;
      if (event.error === 'network') {
        errorMessage = 'Network error - Speech recognition requires internet connection. Try manual input.';
      } else if (event.error === 'not-allowed' || event.error === 'permission-denied') {
        errorMessage = 'Microphone permission denied. Please allow microphone access in browser settings.';
      } else if (event.error === 'no-speech') {
        errorMessage = 'No speech detected. Please speak clearly into your microphone.';
      } else if (event.error === 'audio-capture') {
        errorMessage = 'No microphone found. Please check your microphone connection.';
      }

      if (onError) {
        onError(errorMessage);
      }
    };

    // Handle audio end (some mobile browsers fire audioend before end)
    // We still only emit on manual stop
    recognition.onaudioend = () => {
      try {
        const text = accumulatedTranscriptRef.current?.trim();
        if (manualStopRequestedRef.current && text && onResult) {
          console.log('onaudioend (manual): Sending accumulated transcript:', text);
          onResult(text);
          accumulatedTranscriptRef.current = '';
        }
      } catch {}
    };

    // Handle end event
    recognition.onend = () => {
      // Recognition ended (mobile browsers may auto-stop)
      setIsListening(false);
      // Only send result if user explicitly turned off mic via stop()
      try {
        const text = accumulatedTranscriptRef.current?.trim();
        if (manualStopRequestedRef.current && text && onResult) {
          console.log('onend (manual): Sending accumulated transcript:', text);
          onResult(text);
          accumulatedTranscriptRef.current = '';
        }
      } catch (e) {
        // swallow errors
      } finally {
        // reset manual flag regardless
        manualStopRequestedRef.current = false;
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (error) {
          // Ignore errors on cleanup
        }
      }
    };
  }, [lang, continuous, interimResults]);

  const start = () => {
    console.log('Speech.start() called - isSupported:', isSupported, 'isListening:', isListening, 'recognitionRef exists:', !!recognitionRef.current);
    
    if (!isSupported) {
      console.warn('Cannot start: Speech Recognition is not supported');
      return;
    }

    if (!isListening && recognitionRef.current) {
      try {
        console.log('Calling recognition.start()');
        recognitionRef.current.start();
        setIsListening(true);
        setTranscript('');
        accumulatedTranscriptRef.current = ''; // Clear accumulated transcript
        setIsFallbackMode(false);
      } catch (error) {
        console.error('Error starting speech recognition:', error);
        const errorMsg = (error as Error).message || 'Failed to start speech recognition';
        
        if (onError) {
          onError(errorMsg);
        }
      }
    } else {
      console.warn('Cannot start - already listening or no recognition ref');
    }
  };

  const stop = () => {
    console.log('Speech.stop() called - isListening:', isListening, 'recognitionRef exists:', !!recognitionRef.current);
    
    if (isListening && recognitionRef.current) {
      try {
        console.log('Calling recognition.stop()');;
        // mark that this end is manual
        manualStopRequestedRef.current = true;
        recognitionRef.current.stop();
        setIsListening(false);
        
        // Do not emit here; rely on onend to fire and handle manual case
      } catch (error) {
        console.error('Error stopping speech recognition:', error);
      }
    }

    // Clean up media stream if in fallback mode
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
  };

  return {
    isListening,
    isSupported,
    transcript,
    start,
    stop,
    isFallbackMode,
  };
}
