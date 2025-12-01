import { io, Socket } from 'socket.io-client';

// Get the Socket.IO server URL from environment variable
// For production: Set NEXT_PUBLIC_SOCKET_URL to your deployed backend URL
// For development: defaults to http://localhost:4000
const getSocketURL = () => {
  // If environment variable is set, use it
  if (process.env.NEXT_PUBLIC_SOCKET_URL) {
    return process.env.NEXT_PUBLIC_SOCKET_URL;
  }

  // Development fallback
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    
    // Use localhost for development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:4000';
    }
    
    // For other domains (like Vercel preview deployments), require explicit configuration
    console.warn('NEXT_PUBLIC_SOCKET_URL not set. Socket connection may fail.');
  }

  return 'http://localhost:4000';
};

const SOCKET_URL = getSocketURL();

// Initialize the socket connection
const socket: Socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 10,
  timeout: 20000,
  transports: ['websocket', 'polling'], // Try websocket first, fall back to polling
});

// Connection event handlers
socket.on('connect', () => {
  console.log('Connected to Socket.IO server:', socket.id);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected from Socket.IO server:', reason);
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error.message);
});

// Export the socket instance
export default socket;
