import { OpenAI } from 'openai';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config({ path: '../../apps/backend/.env' });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const testAudioPath = process.argv[2];

async function test() {
  if (!testAudioPath) {
    console.error(
      'Please provide an audio path: node test_whisper.js C:\\path\\to\\file.mp4'
    );
    process.exit(1);
  }
  console.log(`Testing Whisper on file: ${testAudioPath}`);
  if (!fs.existsSync(testAudioPath)) {
    console.error('File does not exist! Please double check the path.');
    process.exit(1);
  }
  const stats = fs.statSync(testAudioPath);
  console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  if (stats.size > 25 * 1024 * 1024) {
    console.warn(
      'WARNING: File is larger than 25MB. OpenAI Whisper API has a strict 25MB limit and will fail.'
    );
  }

  try {
    const response = await openai.audio.transcriptions.create({
      file: fs.createReadStream(testAudioPath),
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });
    console.log('Success! Transcription text snippet:');
    console.log(
      response.text ? response.text.substring(0, 500) + '...' : response
    );
  } catch (err) {
    console.error('Error from OpenAI API:');
    console.error(err);
  }
}
test();
