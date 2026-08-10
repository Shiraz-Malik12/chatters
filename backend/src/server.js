import 'dotenv/config';
import http from 'http';
import mongoose from 'mongoose';
import app from './app.js';
import connectDB from './config/db.js';
import { initSocket } from './sockets/index.js';

const PORT = Number(process.env.PORT) || 5000;

/**
 * Starts the HTTP server after MongoDB is connected.
 * @returns {Promise<import('http').Server>} Running HTTP server instance.
 */
const startServer = async () => {
  await connectDB();

  const httpServer = http.createServer(app);
  const io = initSocket(httpServer);
  app.set('io', io);

  return new Promise((resolve) => {
    httpServer.listen(PORT, () => {
      console.log(`[server] listening on port ${PORT}`);
      resolve(httpServer);
    });
  });
};

/**
 * Gracefully shuts down HTTP and MongoDB connections.
 * @param {import('http').Server | null} server - Server instance to close.
 * @returns {Promise<void>}
 */
const gracefulShutdown = async (server) => {
  console.log('[server] SIGTERM received, shutting down gracefully');

  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  await mongoose.connection.close(false);
  console.log('[server] shutdown complete');
};

let serverInstance = null;

/**
 * Handles process termination signals and closes resources safely.
 * @returns {Promise<void>}
 */
const handleTerminationSignal = async () => {
  try {
    await gracefulShutdown(serverInstance);
    process.exit(0);
  } catch (error) {
    console.error('[server] graceful shutdown failed:', error);
    process.exit(1);
  }
};

startServer()
  .then((server) => {
    serverInstance = server;
  })
  .catch((error) => {
    console.error('[server] startup failed:', error);
    process.exit(1);
  });

process.on('SIGTERM', handleTerminationSignal);
process.on('SIGINT', handleTerminationSignal);
