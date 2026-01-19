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
// ⚙️ USER SETTINGS (PAIRING MODE)
// ═════════════════════════════════════════════
// 👇 Ensure your number is correct here (Country code 91)
const MY_NUMBER = "+919341434302"; 

const ADMIN_NUMBER = `${MY_NUMBER}@s.whatsapp.net`; 
const UPI_ID = '7633832024';
const BOT_NAME = 'Bihar Sathi AI';
const SESSION_FILE = './sessions.json';
const TIMEOUT_MS = 10 * 60 * 1000;

// ═════════════════════════════════════════════
// 🟢 SERVER KEEPER (24/7)
// ═════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('✅ Bihar Sathi Bot Running (Pairing Mode) 🚀'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// ═════════════════════════════════════════════
// 💾 STATE MANAGEMENT
// ═════════════════════════════════════════════
const msgRetryCounterCache = new Map();
let userSession = new Map();

if (fs.existsSync(SESSION_FILE)) {
    try {
        const rawData = fs.readFileSync(SESSION_FILE);
        userSession = new Map(JSON.parse(rawData));
    } catch (e) { /* Ignore */ }
}

function saveSessions() {
    try {
        const data = JSON.stringify([...userSession]);
        fs.writeFileSync(SESSION_FILE, data);
    } catch (e) { /* Ignore */ }
}

// ═════════════════════════════════════════════
// 🎨 UI & UX ASSETS (FULL EXPERT MENU)
// ═════════════════════════════════════════════
const getTimeGreeting = () => {
    const hr = new Date().getHours();
    if (hr < 12) return "Good Morning ☀️";
    if (hr < 18) return "Good Afternoon 🌤️";
    return "Good Evening 🌙";
};

const UI = {
    WELCOME: () => `╔═══════════════════╗
║ 🏛️ *BIHAR SATHI KENDRA*
╚═══════════════════╝
👋 *${getTimeGreeting()}*

आपका स्वागत है!
आप *लिखकर* या *बोलकर (Voice Note)* अपनी बात बता सकते हैं। 🎤

कृपया सेवा चुनें:
╔══ *SERVICES* ══╗
║ 1️⃣ 🆔 आधार कार्ड
║ 2️⃣ 💳 पैन कार्ड
║ 3️⃣ 📜 आय / जाति
║ 4️⃣ 🍚 राशन कार्ड
╚════════════════╝

╔══ *OPTIONS* ══╗
║ 5️⃣ 💰 मूल्य (Rates)
║ 6️⃣ 📞 सहायता (Help)
╚════════════════╝

👉 _सेवा चुनने के लिए **1-6** लिखें_`,

    RATE_LIST: `╔═══════════════════╗
║ 💰 *OFFICIAL RATE LIST*
╚═══════════════════╝
🔹 *आधार अपडेट:* ₹170
🔹 *पैन कार्ड:* ₹180
🔹 *प्रमाण पत्र:* ₹50
🔹 *राशन कार्ड:* ₹150
🔹 *प्रिंट आउट:* ₹5/page

🔙 *0* दबाकर वापस जाएं`,

    PAYMENT: (orderId) => `╔═══════════════════╗
║ 🧾 *PAYMENT INVOICE*
╚═══════════════════╝
🆔 *Order ID:* \`${orderId}\`
💠 *UPI ID:* \`${UPI_ID}\`

👇 *NEXT STEP:*
Payment का **Screenshot** भेजें।`,

    THANK_YOU: `╔═══════════════════╗
║ ✅ *ORDER CONFIRMED*
╚═══════════════════╝
धन्यवाद! आपका ऑर्डर ले लिया गया है।`,

    UPLOAD: (srv, docs, note, memberName = "") => `📂 *DOCUMENT UPLOAD*
───────────────────────
🛠️ *Service:* ${srv}
${memberName ? `👤 *Member:* ${memberName}` : ""}

👇 *कृपया ये भेजें:*
${docs}
${note}

🎤 *नोट:* आप बोलकर भी बता सकते हैं।
✅ भेजने के बाद *DONE* लिखें।`,

    ASK_NAME: (action) => `👤 *MEMBER NAME*
───────────────────────
सदस्य का **नाम (Name)** लिखें।

🔙 *0* दबाकर वापस जाएं`,

    VOICE_RECEIVED: `🎤 *VOICE RECEIVED* 🎧
───────────────────────
हमने आपकी आवाज़ सुन ली है!
आपका मैसेज एडमिन को भेज दिया गया है।
वे सुनकर जल्द ही जवाब देंगे।`,

    TIMEOUT: "⚠️ *Session Expired*\nदुबारा शुरू करने के लिए *Hi* लिखें."
};

// ═════════════════════════════════════════════
// 🧠 SERVICE LOGIC
// ═════════════════════════════════════════════
const SERVICES = {
    '1': {
        key: 'AADHAAR',
        title: 'आधार कार्ड',
        menu: `🆔 *आधार कार्ड सेवा*
──────────────────
1️⃣ पता अपडेट (Address)
2️⃣ पिता का नाम (Father Name)
3️⃣ पति का नाम (Husband Name)
0️⃣ Go Back`,
        req: ["🔹 आधार कार्ड (Original)", "🔹 आवासीय प्रमाण पत्र"],
        note: "\n⚠️ *Note:* OTP के लिए तैयार रहें।"
    },
    '2': {
        key: 'PAN',
        title: 'पैन कार्ड',
        menu: `💳 *पैन कार्ड सेवा*
──────────────────
1️⃣ नाम सुधार (Name Correction)
2️⃣ जन्म तिथि (DOB Update)
3️⃣ नया पैन (New Apply)
0️⃣ Go Back`,
        req: ["🔹 आधार कार्ड", "🔹 फोटो", "🔹 साइन"]
    },
    '3': {
        key: 'CERT',
        title: 'प्रमाण पत्र',
        menu: `📜 *प्रमाण पत्र सेवा*
──────────────────
1️⃣ आय प्रमाण पत्र
2️⃣ जाति प्रमाण पत्र
3️⃣ आवासीय प्रमाण पत्र
0️⃣ Go Back`,
        req: ["🔹 फोटो", "🔹 आधार कार्ड", "🔹 पुराना प्रमाण (यदि है)"]
    },
    '4': {
        key: 'RATION',
        title: 'राशन कार्ड',
        menu: `🍚 *राशन कार्ड सेवा*
──────────────────
1️⃣ नया आवेदन (New Application)
2️⃣ सदस्य जोड़ें (Add Member)
3️⃣ सदस्य हटाएं (Remove Member)
0️⃣ Go Back`,
        req: ["🔹 मुखिया का आधार", "🔹 बैंक खाता", "🔹 सभी सदस्यों का आधार", "🔹 फोटो"]
    }
};

// ═════════════════════════════════════════════
// 🔌 CONNECTION LOGIC (PAIRING CODE + ANTI-CRASH)
// ═════════════════════════════════════════════
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false, // 🔴 QR DISABLED
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '20.0.04'], // Linux Browser for Render
        msgRetryCounterCache, // Prevents Crash
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: true,
        retryRequestDelayMs: 5000
    });

    // 🟢 GENERATE PAIRING CODE
    if (!sock.authState.creds.registered) {
        console.log("⏳ Waiting for Pairing Code...");
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(MY_NUMBER);
                console.log(`\n\n🟢 🟢 🟢 YOUR PAIRING CODE:  ${code}  🟢 🟢 🟢\n\n`);
                console.log(`⚠️ (Logs में यह Code सिर्फ एक बार दिखेगा, जल्दी नोट करें!)\n`);
            } catch (err) {
                console.log("❌ Pairing Code Error: ", err.message);
            }
        }, 5000);
    }

    const smartReply = async (jid, text) => {
        await sock.readMessages([jid]);
        await sock.sendPresenceUpdate('composing', jid);
        await delay(1000); 
        await sock.sendPresenceUpdate('paused', jid);
        await sock.sendMessage(jid, { text: text });
    };

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            if (reason === DisconnectReason.badSession) {
                console.log(`❌ Bad Session - Deleting...`);
                fs.rmSync('./auth_info_baileys', { recursive: true, force: true });
                process.exit();
            } else if (reason === DisconnectReason.loggedOut) {
                console.log(`❌ Logged Out - Deleting Session...`);
                fs.rmSync('./auth_info_baileys', { recursive: true, force: true });
                process.exit();
            } else {
                console.log("⚠️ Connection Closed, Reconnecting...");
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log(`✅ ${BOT_NAME} IS ONLINE & STABLE!`);
            setInterval(() => saveSessions(), 60000);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            try {
                if (!msg.message || msg.key.fromMe) continue;
                const remoteJid = msg.key.remoteJid;
                const textBody = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
                const lowerText = textBody.toLowerCase();

                // 🎙️ VOICE HANDLING
                if (msg.message.audioMessage) {
                    await smartReply(remoteJid, UI.VOICE_RECEIVED);
                    await sock.sendMessage(ADMIN_NUMBER, { 
                        text: `🎤 *VOICE RECEIVED* from +${remoteJid.split('@')[0]}\n(Check chat list)` 
                    });
                    return;
                }

                if (!userSession.has(remoteJid)) {
                    userSession.set(remoteJid, { step: 'MAIN_MENU', service: '', lastActive: Date.now() });
                }
                const session = userSession.get(remoteJid);
                session.lastActive = Date.now();
                saveSessions();

                if (['hi', 'hello', 'menu', '0', 'start'].includes(lowerText)) {
                    session.step = 'MAIN_MENU';
                    session.memberName = null;
                    await smartReply(remoteJid, UI.WELCOME());
                    return;
                }

                // MENU LOGIC
                switch (session.step) {
                    case 'MAIN_MENU':
                        if (SERVICES[textBody]) {
                            session.service = SERVICES[textBody].key;
                            session.serviceData = JSON.parse(JSON.stringify(SERVICES[textBody]));
                            
                            if (session.serviceData.menu) {
                                session.step = 'SUB_MENU';
                                await smartReply(remoteJid, session.serviceData.menu);
                            } else {
                                session.step = 'DOCS';
                                await sendUploadReq(sock, remoteJid, session);
                            }
                        }
                        else if (textBody === '5') await smartReply(remoteJid, UI.RATE_LIST);
                        else if (textBody === '6') {
                            await smartReply(remoteJid, "📞 *Call Request Sent!*\nAn executive will call you shortly.");
                            await sock.sendMessage(ADMIN_NUMBER, { text: `🚨 CALL REQUEST: ${remoteJid.split('@')[0]}` });
                        }
                        else if (textBody.length > 0) await smartReply(remoteJid, "❌ गलत विकल्प। कृपया 1-6 चुनें।");
                        break;

                    case 'SUB_MENU':
                        if (textBody.length > 0) {
                            session.subService = textBody;

                            if (session.service === 'RATION') {
                                if (textBody === '2') { // Add
                                    session.step = 'AWAITING_NAME';
                                    session.serviceData.title = "Ration - Add Member";
                                    await smartReply(remoteJid, UI.ASK_NAME('add'));
                                    return;
                                } 
                                else if (textBody === '3') { // Remove
                                    session.step = 'AWAITING_NAME';
                                    session.serviceData.title = "Ration - Remove Member";
                                    await smartReply(remoteJid, UI.ASK_NAME('remove'));
                                    return;
                                }
                                else if (textBody === '1') {
                                    session.serviceData.title = "Ration - New Application";
                                }
                            }
                            session.step = 'DOCS';
                            await sendUploadReq(sock, remoteJid, session);
                        }
                        break;

                    case 'AWAITING_NAME':
                        if (textBody.length > 0) {
                            session.memberName = textBody;
                            session.step = 'DOCS';

                            if (session.serviceData.title.includes("Add")) {
                                session.serviceData.req = ["🔹 राशन कार्ड", "🔹 सभी का आधार", "🔹 सभी की फोटो", "🔹 मुखिया का जाति, आवासी, आय", "🔹 हस्ताक्षर"];
                            } else if (session.serviceData.title.includes("Remove")) {
                                session.serviceData.req = ["🔹 राशन कार्ड", "🔹 सभी का आधार", "🔹 मुखिया का जाति, आवासी, आय", "🔹 हस्ताक्षर", "🔹 फोटो"];
                            }
                            await sendUploadReq(sock, remoteJid, session);
                        }
                        break;

                    case 'DOCS':
                        if (['done', 'pay', 'ok'].includes(lowerText)) {
                            session.orderId = 'CSC-' + Math.floor(1000 + Math.random() * 9000);
                            session.step = 'PAYMENT';
                            await smartReply(remoteJid, UI.PAYMENT(session.orderId));
                        } 
                        else if (msg.message.imageMessage || msg.message.documentMessage) {
                            await sock.sendMessage(remoteJid, { text: "📥 *Document Received!* (Send more or type DONE)" });
                        }
                        break;

                    case 'PAYMENT':
                        if (msg.message.imageMessage) {
                            await smartReply(remoteJid, UI.THANK_YOU);
                            const sName = session.serviceData?.title || "General";
                            let alertMsg = `🚨 *NEW ORDER* 🚨\n\n🆔 ID: \`${session.orderId}\`\n👤 User: +${remoteJid.split('@')[0]}\n🛠 Service: ${sName}`;
                            if(session.memberName) alertMsg += `\n🧑 Member Name: ${session.memberName}`;
                            await sock.sendMessage(ADMIN_NUMBER, { text: alertMsg });
                            userSession.delete(remoteJid);
                            saveSessions();
                        } else {
                            await smartReply(remoteJid, "❌ Please send the *Payment Screenshot*.");
                        }
                        break;
                }
            } catch (err) {
                console.error("Bot Error:", err);
                if (userSession.has(msg.key.remoteJid)) {
                   userSession.get(msg.key.remoteJid).step = 'MAIN_MENU';
                }
            }
        }
    });
}

async function sendUploadReq(sock, jid, session) {
    await sock.sendPresenceUpdate('composing', jid);
    await delay(1000);
    await sock.sendPresenceUpdate('paused', jid);
    const d = session.serviceData;
    await sock.sendMessage(jid, { text: UI.UPLOAD(d.title, d.req.join("\n"), d.note || "", session.memberName) });
}

// 🔴 GLOBAL ERROR HANDLER
process.on('uncaughtException', function (err) {
    console.log('Caught exception: ' + err);
});

connectToWhatsApp();
