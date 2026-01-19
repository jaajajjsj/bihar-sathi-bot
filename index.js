const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    delay,
    makeInMemoryStore
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const express = require('express');
const app = express();

// ═════════════════════════════════════════════
// ⚙️ USER SETTINGS
// ═════════════════════════════════════════════
const MY_NUMBER = "919341434302"; // आपका नंबर
const ADMIN_NUMBER = `${MY_NUMBER}@s.whatsapp.net`;
const BOT_NAME = 'Bihar Sathi AI';

// ═════════════════════════════════════════════
// 🟢 FORCE RESET (हर बार नया कोड जनरेट करेगा)
// ═════════════════════════════════════════════
// यह लाइन पुराने सेशन को डिलीट कर देती है ताकि कोड हर बार आए
if (fs.existsSync('./auth_info_baileys')) {
    console.log("♻️ Cleaning up old session for fresh pairing...");
    fs.rmSync('./auth_info_baileys', { recursive: true, force: true });
}

// ═════════════════════════════════════════════
// 🟢 SERVER KEEPER
// ═════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('✅ Bihar Sathi Bot: Waiting for Pairing...'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// ═════════════════════════════════════════════
// 🔌 CONNECTION LOGIC
// ═════════════════════════════════════════════
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false, // QR बंद
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        connectTimeoutMs: 60000,
        retryRequestDelayMs: 5000
    });

    // 🟢 PAIRING CODE GENERATOR
    if (!sock.authState.creds.registered) {
        console.log("⏳ Generating Pairing Code in 3 seconds...");
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(MY_NUMBER);
                console.log(`\n\n🟢 🟢 YOUR PAIRING CODE:  ${code}  🟢 🟢\n`);
                console.log(`⚠️ (Phone में डालें: Linked Devices > Link with phone number)\n`);
            } catch (err) {
                console.log("❌ Error generating code: " + err.message);
            }
        }, 3000);
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            if (reason === DisconnectReason.loggedOut) {
                console.log(`❌ Device Logged Out. Restarting...`);
            } else {
                console.log("⚠️ Connection Closed. Reconnecting...");
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log(`✅ ${BOT_NAME} IS CONNECTED SUCCESSFULY!`);
            console.log(`🔥 अब आप इस कोड को हटाकर 'Full Bot Code' डाल सकते हैं।`);
        }
    });

    sock.ev.on('creds.update', saveCreds);
    
    // (Pairing Mode में मैसेज लॉजिक की जरूरत नहीं है, पहले कनेक्ट करें)
}

process.on('uncaughtException', (err) => console.log('Caught exception: ' + err));

connectToWhatsApp();
