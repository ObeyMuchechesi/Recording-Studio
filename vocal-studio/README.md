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

5. Open http://localhost:5173 and register. Each project starts with a vocal track. Use **+ Add Vocal** to create a named track for each singer or part (for example, “Maya — Alto” or “Jon — Bass”). Select an audio input, connect it, choose the track’s **Arm** button, then record that singer’s takes. In **Manage Takes**, drag across a take waveform to select a phrase, then add it to the comp lane. Phrase edits leave source takes intact; use Undo/Redo or Ctrl/⌘ Z to step through edits. Tracks stay aligned in the shared project timeline, and the mixer lets you balance each singer independently. Calibrate latency, set the tempo and count-in, then use the master controls to shape and export a 24-bit WAV mixdown.

Choose **Hardware direct** monitoring when your audio interface has a direct-monitor control; enable direct monitoring on the interface itself. This app mode bypasses its software monitor path. **Software** monitoring routes the dry microphone signal through the browser and can add latency, so use headphones. The browser reports its output base latency when available but does not expose a reliable buffer-size control.

## Deploy to Vercel

Import the GitHub repository and set the project Root Directory to vocal-studio. The build command is configured in vercel.json. Add these production environment variables in Vercel:

- MONGODB_URI: your MongoDB Atlas connection string
- JWT_SECRET: a long, randomly generated secret

The Vercel app serves the built client and Express API on the same domain. Configure the MongoDB Atlas network access list so the Vercel function can reach the cluster.

## Features

- Named vocal tracks for separate singers/parts, each with its own record arm and takes in one shared project; unwanted takes can be removed individually
- Per-track rename, input-device selection, live input metering, hardware-direct or software monitoring modes, and autosaved project settings/mix
- Non-destructive phrase comping with source takes, short region fades, and 50-step Undo/Redo history
- Timeline playback, latency calibration, count-in, and metronome
- Per-track gate, high-pass filter, de-esser, EQ, compressor, saturation, and reverb send
- Mixer controls for level, pan, mute, and solo
- Master EQ, glue compression, limiter, LUFS and true-peak metering
- Pitch tuner and offline 24-bit WAV mixdown
- JWT authentication and MongoDB session persistence

## Notes

Audio capture and microphone access require a secure browser context (localhost is supported). Headphones are recommended. The current session API stores WAV data in MongoDB documents; Vercel Function requests have a 4.5 MB payload limit, so longer takes or sessions with many takes need direct object storage before they can be saved reliably.
