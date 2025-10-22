import 'dotenv/config';
import express from 'express';
import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 3000;
const SONIOX_API_KEY = process.env.SONIOX_API_KEY;
const SONIOX_WS_URL = process.env.SONIOX_WS_URL || 'wss://api.soniox.com/streaming';

if (!SONIOX_API_KEY) { console.error('Missing SONIOX_API_KEY'); process.exit(1); }

const app = express();
const server = http.createServer(app);

app.get('/', (_req, res) => res.send('Vapi↔Soniox bridge is up. WS path: /stt'));

const wss = new WebSocketServer({ server, path: '/stt' });

wss.on('connection', (vapiWS) => {
  const sonioxWS = new WebSocket(SONIOX_WS_URL, {
    headers: { Authorization: `Bearer ${SONIOX_API_KEY}` }
  });

  let lastChannel = 'customer';

  sonioxWS.on('open', () => {
    sonioxWS.send(JSON.stringify({
      type: 'start', language: 'he', sampleRate: 16000, encoding: 'pcm16',
      interimResults: true, diarization: false
    }));
  });

  vapiWS.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.channel === 'assistant' || msg.channel === 'customer') lastChannel = msg.channel;
      if (msg.type === 'input_audio_buffer' && msg.audio) {
        sonioxWS.send(JSON.stringify({ type: 'audio', audio: msg.audio }));
      }
      if (msg.type === 'input_audio_buffer.commit') {
        sonioxWS.send(JSON.stringify({ type: 'end' }));
      }
    } catch {}
  });

  sonioxWS.on('message', (raw) => {
    try {
      const s = JSON.parse(raw.toString());
      if (s.type === 'transcript' && s.text) {
        vapiWS.send(JSON.stringify({
          type: 'transcriber-response',
          transcription: s.text,
          final: !!s.isFinal,
          channel: lastChannel
        }));
      }
    } catch {}
  });

  const closeBoth = () => { try{sonioxWS.close()}catch{}; try{vapiWS.close()}catch{}; };
  vapiWS.on('close', closeBoth); vapiWS.on('error', closeBoth);
  sonioxWS.on('close', closeBoth); sonioxWS.on('error', closeBoth);
});

server.listen(PORT, () => console.log(`Bridge listening on :${PORT} (ws path: /stt)`));
