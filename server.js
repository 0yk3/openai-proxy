require('dotenv').config(); // Load environment variables from .env file if it exists
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

// 💡 TARGET ENDPOINT: Pulls dynamically from environment config variables
const BACKEND_CHAT_URL = process.env.BACKEND_CHAT_URL; 

if (!BACKEND_CHAT_URL) {
    console.error('❌ ERROR: "BACKEND_CHAT_URL" environment variable is not defined!');
    process.exit(1);
}

// Extract the base domain dynamically for browser spoofing
let TARGET_DOMAIN = '';
try {
    TARGET_DOMAIN = new URL(BACKEND_CHAT_URL).origin;
} catch (e) {
    console.error('❌ ERROR: "BACKEND_CHAT_URL" is not a valid absolute URL layout string.');
    process.exit(1);
}

// 1. Resolve Frontend Browser CORS errors instantly
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with']
}));

app.use(express.json());

// Friendly health check endpoint for Render to ping
app.get('/', (req, res) => res.send('🚀 Proxy Status: Online & Operational'));

// 2. Emulate standard OpenAI Chat Completions endpoint
app.post('/v1/chat/completions', async (req, res) => {
    try {
        const { messages, model } = req.body;

        const proxyRequestBody = {
            messages: messages || [],
            model: model || 'gemini-2.5-flash-lite'
        };

        console.log(`[Proxy] Routing request to target server: ${BACKEND_CHAT_URL}`);

        // 3. Spoof browser fingerprints to bypass server-side blocks
        const spoofedHeaders = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Origin': TARGET_DOMAIN,
            'Referer': `${TARGET_DOMAIN}/`,
            
            // Forward client authentication strings if passed dynamically
            ...(req.headers['authorization'] && { 'Authorization': req.headers['authorization'] }),
            ...(req.headers['cookie'] && { 'Cookie': req.headers['cookie'] })
        };

        // Forward the spoofed request
        const backendResponse = await axios.post(BACKEND_CHAT_URL, proxyRequestBody, {
            headers: spoofedHeaders,
            timeout: 30000 
        });

        const customData = backendResponse.data;
        let assistantContent = "";

        // 4. Map the site's unique flat text payload back to OpenAI standard format
        if (customData && customData.text) {
            try {
                const innerJSON = JSON.parse(customData.text);
                assistantContent = innerJSON.text || customData.text;
            } catch (e) {
                assistantContent = customData.text; 
            }
        }

        // Return perfectly structured OpenAI schema back to your client environment
        const openAIResponse = {
            id: `chatcmpl-${Math.random().toString(36).substr(2, 9)}`,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: customData.model || model || "gemini-2.5-flash-lite",
            choices: [
                {
                    index: 0,
                    message: {
                        role: "assistant",
                        content: assistantContent
                    },
                    logprobs: null,
                    finish_reason: "stop"
                }
            ],
            usage: {
                prompt_tokens: -1,
                completion_tokens: -1,
                total_tokens: -1
            }
        };

        console.log(`[Proxy] Successfully unpacked payload and returned OpenAI mapping!`);
        return res.json(openAIResponse);

    } catch (error) {
        console.error('[Proxy Error]:', error.message);
        if (error.response) {
            console.error('[Target Server Error Logs Body]:', error.response.data);
        }

        return res.status(error.response?.status || 500).json({
            error: {
                message: "Failed passing through spoofing proxy engine.",
                type: "proxy_spoof_error",
                details: error.response?.data || error.message
            }
        });
    }
});

// Render automatically passes a random port via process.env.PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Proxy active and listening on port ${PORT}`);
});
