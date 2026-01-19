const { makeWASocket, useMultiFileAuthState, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const express = require('express');
const app = express();

// 1. Render को ज़िंदा रखने के लिए छोटा सर्वर
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Generating Code... Check Logs!'));
app.listen(PORT, () => console.log("Server Started."));

async function getCode() {
    // 2. पुराना कचरा हटाओ (FORCE DELETE)
    console.log("🧹 Cleaning old session...");
    if (fs.existsSync('./auth_info_baileys')) {
        fs.rmSync('./auth_info_baileys', { recursive: true, force: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    // 3. WhatsApp से कनेक्ट करो
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // QR नहीं चाहिए
        logger: pino({ level: 'silent' }), // फालतू लॉग्स बंद
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
    });

    sock.ev.on('creds.update', saveCreds);

    // 4. कोड मांगो (सिर्फ़ 5 सेकंड बाद)
    await delay(5000);
    
    if (!sock.authState.creds.registered) {
        try {
            // आपका नंबर (सही फॉर्मेट में)
            const code = await sock.requestPairingCode("919341434302");
            
            console.log("\n\n✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅");
            console.log(`YOUR CODE:   ${code}`);
            console.log("✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅\n\n");
            
        } catch (err) {
            console.log("❌ Error getting code: ", err.message);
        }
    }
}

getCode();
