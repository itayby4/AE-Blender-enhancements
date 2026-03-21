import { GoogleGenAI } from '@google/genai';

console.log('Keys in GoogleGenAI instance:');
const ai = new GoogleGenAI({ apiKey: "test" });
console.log(Object.keys(ai));
if (ai.files) {
    console.log('ai.files Methods:');
    console.log(Object.keys(ai.files).filter(k => typeof ai.files[k] === 'function' || true));
} else {
    console.log('ai.files is undefined');
}
