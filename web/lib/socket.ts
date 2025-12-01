import { io, Socket } from 'socket.io-client';

// Detect if we're using HTTPS and set the socket URL accordingly
const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const defaultPort = protocol === 'https:' ? '4000' : '4000';

// Get the Socket.IO server URL from environment variable or construct it
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 
  (protocol === 'https:' ? `https://${hostname}:${defaultPort}` : `http://${hostname}:${defaultPort}`);

// Initialize the socket connection
const socket: Socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
  secure: protocol === 'https:',
  rejectUnauthorized: false, // Allow self-signed certificates in development
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
