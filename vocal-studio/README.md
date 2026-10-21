# Vocal Studio — MERN

A browser-based multitrack vocal recording, mixing, and mastering studio.

## Requirements

- Node.js 18 or newer
- MongoDB 6 or newer, local or MongoDB Atlas
- Chrome or Edge (Safari 15+ may work; Firefox may require media.navigator.permission)
- Headphones for monitoring to reduce feedback risk

## Local setup

1. From this directory, copy .env.example to .env.
2. Set MONGODB_URI to your MongoDB connection string and replace JWT_SECRET with a long, random value.
3. Install the server dependencies and start the API:

       npm install
       npm run dev

   The API listens on http://localhost:4000.

4. In another terminal, install and start the client:

       cd client
       npm install
       npm run dev

5. Open http://localhost:5173, register, select Connect Input, and grant microphone access. Calibrate latency, set the tempo and count-in, then record each part. Use the mixer and master controls to shape the session and export a 24-bit WAV mixdown.

## Features

- Multiple vocal tracks with takes, timeline playback, and recording
- Input connection, latency calibration, count-in, and metronome
- Per-track gate, high-pass filter, de-esser, EQ, compressor, saturation, and reverb send
- Mixer controls for level, pan, mute, and solo
- Master EQ, glue compression, limiter, LUFS and true-peak metering
- Pitch tuner and offline 24-bit WAV mixdown
- JWT authentication and MongoDB session persistence

## Notes

Audio capture and microphone access require a secure browser context (localhost is supported). Headphones are recommended. MongoDB Atlas credentials and the JWT secret belong in environment variables; never commit .env.
