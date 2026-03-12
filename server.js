const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const CONFIG = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || 'sua-chave-aqui',
  ZAPI_INSTANCE:     process.env.ZAPI_INSTANCE     || 'sua-instance-id',
  ZAPI_TOKEN:        process.env.ZAPI_TOKEN         || 'seu-token-zapi',
  ZAPI_CLIENT_TOKEN: process.env.ZAPI_CLIENT_TOKEN  || 'seu-client-token',
  PORT: process.env.PORT || 3000,
};

const SYSTEM_PROMPT = `Você é um vendedor especialista da Royal Celulares. Atenda com excelência, seja natural e amigável como WhatsApp. Respostas curtas, máximo 3-4 linhas, sem asteriscos. Venda iPhones novos/seminovos, Xiaomi e acessórios. Faça uma pergunta de cada vez para entender o cliente.`;

const conversations = new Map();

function getHistory(phone) {
  if (!conversations.has(phone)) conversations.set(phone, []);
  return conversations.get(phone);
}

function addToHistory(phone, role, content) {
  const history = getHistory(phone);
  history.push({ role, content });
  if (history.length > 20) history.splice(0, history.length - 20);
}

async function askClaude(phone, userMessage) {
  addToHistory(phone, 'user', userMessage);
  const history = getHistory(phone);
  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    { model: 'claude-sonnet-4-20250514', max_tokens: 500, system: SYSTEM_PROMPT, messages: history },
    { headers: { 'x-api-key': CONFIG.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' } }
  );
  const reply = response.data.content[0].text;
  addToHistory(phone, 'assistant', reply);
  return reply;
}

async function sendWhatsApp(phone, message) {
  const url = `https://api.z-api.io/instances/${CONFIG.ZAPI_INSTANCE}/token/${CONFIG.ZAPI_TOKEN}/send-text`;
  await axios.post(url, { phone, message }, { headers: { 'Client-Token': CONFIG.ZAPI_CLIENT_TOKEN } });
}

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    if (body.fromMe) return;
    if (body.type !== 'ReceivedCallback') return;
    if (!body.text?.message) return;
    const phone = body.phone;
    const message = body.text.message;
    console.log(`📩 [${phone}] ${message}`);
    const reply = await askClaude(phone, message);
    console.log(`🤖 [${phone}] ${reply}`);
    await sendWhatsApp(phone, reply);
  } catch (err) {
    console.error('Erro:', err.response?.data || err.message);
  }
});
