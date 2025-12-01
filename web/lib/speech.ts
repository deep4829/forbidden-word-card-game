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

  useEffect(() => {
    // Check if browser supports Speech Recognition
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      console.warn('Speech Recognition is not supported in this browser');
      return;
    }

    setIsSupported(true);

    // Initialize Speech Recognition
    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;

    // Handle result event
    recognition.onresult = (event: any) => {
      const lastResultIndex = event.results.length - 1;
      const result = event.results[lastResultIndex];
      const transcriptText = result[0].transcript;

      setTranscript(transcriptText);

      if (result.isFinal && onResult) {
        onResult(transcriptText);
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

    // Handle end event
    recognition.onend = () => {
      // If we're still supposed to be listening, restart
      if (isListening && recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (error) {
          console.error('Error restarting recognition:', error);
          setIsListening(false);
        }
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (error) {
          // Ignore errors on cleanup
        }
      }
    };
  }, [lang, continuous, interimResults, onResult, onError, isListening]);

  const start = () => {
    if (!isSupported) {
      console.warn('Cannot start: Speech Recognition is not supported');
      return;
    }

    if (!isListening && recognitionRef.current) {
      try {
        recognitionRef.current.start();
        setIsListening(true);
        setTranscript('');
        setIsFallbackMode(false);
      } catch (error) {
        console.error('Error starting speech recognition:', error);
        const errorMsg = (error as Error).message || 'Failed to start speech recognition';
        
        // If WebRTC speech fails, we might need a fallback
        if (onError) {
          onError(errorMsg);
        }
      }
    }
  };

  const stop = () => {
    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        setIsListening(false);
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
