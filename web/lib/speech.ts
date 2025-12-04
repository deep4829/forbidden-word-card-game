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
  // Track mobile detection
  const isMobileRef = useRef<boolean>(false);
  // Track if user called stop (to avoid restart loops)
  const userStoppedRef = useRef<boolean>(false);

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
    // Mobile browsers (iOS/Android) need continuous + interim for reliable listening
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
    const isMobile = /iphone|ipad|ipod|android/.test(ua);
    isMobileRef.current = isMobile;
    // Keep listening on mobile until user manually stops
    recognition.continuous = isMobile ? true : continuous;
    // Enable interim results on mobile to get real-time feedback and keep session alive
    recognition.interimResults = isMobile ? true : interimResults;
    
    console.log('🎤 Speech Recognition configured:', { 
      isMobile, 
      continuous: recognition.continuous, 
      interimResults: recognition.interimResults 
    });

    // Handle result event
    recognition.onresult = (event: any) => {
      let transcriptText = '';
      
      // Accumulate all results (both interim and final)
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcriptText += event.results[i][0].transcript;
      }

      setTranscript(transcriptText);

      // Store final results for later sending
      if (event.results[event.results.length - 1].isFinal) {
        accumulatedTranscriptRef.current = transcriptText;
        console.log('✓ Final result received:', transcriptText, '| isMobile:', isMobileRef.current);
        // Let onend handle mobile restart logic
      } else {
        console.log('~ Interim result:', transcriptText);
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
      console.log('🔴 recognition.onend fired:', {
        userStopped: userStoppedRef.current,
        isMobile: isMobileRef.current,
        manualStop: manualStopRequestedRef.current,
        accumulatedTranscript: accumulatedTranscriptRef.current?.substring(0, 50),
      });
      setIsListening(false);
      
      // If user manually stopped, send the result
      if (manualStopRequestedRef.current) {
        try {
          const text = accumulatedTranscriptRef.current?.trim();
          if (text && onResult) {
            console.log('📤 onend (manual stop): Sending accumulated transcript:', text);
            onResult(text);
            accumulatedTranscriptRef.current = '';
          }
        } catch (e) {
          console.error('Error in onend:', e);
        } finally {
          manualStopRequestedRef.current = false;
        }
      } else if (isMobileRef.current && !userStoppedRef.current) {
        // Mobile auto-stopped (Chrome Android behavior) - restart to keep listening
        console.log('📱 Mobile: Recognition auto-stopped, restarting to keep listening...');
        try {
          if (recognitionRef.current) {
            recognitionRef.current.start();
            setIsListening(true);
            console.log('✓ Recognition restarted successfully');
          }
        } catch (e) {
          console.error('❌ Error restarting recognition:', e);
        }
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
    console.log('🎙️ Speech.start() called', { isSupported, isListening, hasRef: !!recognitionRef.current });
    
    if (!isSupported) {
      console.warn('Cannot start: Speech Recognition is not supported');
      return;
    }

    if (!isListening && recognitionRef.current) {
      try {
        console.log('▶️ Calling recognition.start()');
        recognitionRef.current.start();
        setIsListening(true);
        setTranscript('');
        accumulatedTranscriptRef.current = '';
        setIsFallbackMode(false);
        console.log('✓ Recognition started successfully');
      } catch (error) {
        console.error('❌ Error starting speech recognition:', error);
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
    console.log('⏹️ Speech.stop() called', { isListening, hasRef: !!recognitionRef.current });
    
    if (isListening && recognitionRef.current) {
      try {
        console.log('🛑 User manually stopping - setting manualStopRequestedRef = true');
        // Mark that user is manually stopping (before calling stop)
        manualStopRequestedRef.current = true;
        userStoppedRef.current = true;
        recognitionRef.current.stop();
        setIsListening(false);
        
        // Reset after a small delay to allow onend to check userStoppedRef
        setTimeout(() => {
          userStoppedRef.current = false;
          console.log('✓ userStoppedRef reset after manual stop');
        }, 100);
        console.log('✓ Recognition stopped, waiting for onend to send result...');
      } catch (error) {
        console.error('❌ Error stopping speech recognition:', error);
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
