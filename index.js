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
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const express = require('express');
const AdmZip = require('adm-zip'); // NEW: For Unzipping
const app = express();

// ═════════════════════════════════════════════
// 📦 AUTO-UNZIP LOGIC (THE FIX)
// ═════════════════════════════════════════════
if (!fs.existsSync('./auth_info_baileys') && fs.existsSync('./auth_info_baileys.zip')) {
    console.log("📦 Found Zip Session! Unzipping...");
    const zip = new AdmZip('./auth_info_baileys.zip');
    zip.extractAllTo('./', true);
    console.log("✅ Unzip Complete! Starting Bot...");
}

// ═════════════════════════════════════════════
// ⚙️ SERVER KEEPER (MAKES IT 24/7)
// ═════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is Running! 🚀'));
app.listen(PORT, () => console.log(`Server is keeping bot alive on port ${PORT}`));

// ═════════════════════════════════════════════
// ⚙️ BOT CONFIGURATION
// ═════════════════════════════════════════════
const ADMIN_NUMBER = '919341434302@s.whatsapp.net'; 
const UPI_ID = '7633832024';
const SESSION_FILE = './sessions.json';
const TIMEOUT_MS = 10 * 60 * 1000; 

// --- STATE MANAGEMENT ---
let userSession = new Map();
let intervalId = null;

if (fs.existsSync(SESSION_FILE)) {
    try {
        const rawData = fs.readFileSync(SESSION_FILE);
        userSession = new Map(JSON.parse(rawData));
    } catch (e) { console.error("Session Error, starting fresh."); }
}

function saveSessions() {
    try {
        const data = JSON.stringify([...userSession]);
        fs.writeFileSync(SESSION_FILE, data);
    } catch (e) { console.error("Save Error", e); }
}

// --- TEXT ASSETS ---
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

// --- SERVICES ---
const SERVICES = {
    '1': { key: 'AADHAAR', title: 'आधार कार्ड', menu: `🆔 *आधार कार्ड सेवा*\n──────────────────\n1️⃣ पता अपडेट (Address)\n2️⃣ पिता का नाम (Father Name)\n3️⃣ पति का नाम (Husband Name)\n0️⃣ Go Back`, req: ["🔹 आधार कार्ड (Original)", "🔹 आवासीय प्रमाण पत्र"], note: "\n⚠️ *Note:* OTP के लिए तैयार रहें।" },
    '2': { key: 'PAN', title: 'पैन कार्ड', menu: `💳 *पैन कार्ड सेवा*\n──────────────────\n1️⃣ नाम सुधार (Name Correction)\n2️⃣ जन्म तिथि (DOB Update)\n3️⃣ नया पैन (New Apply)\n0️⃣ Go Back`, req: ["🔹 आधार कार्ड", "🔹 फोटो", "🔹 साइन"] },
    '3': { key: 'CERT', title: 'प्रमाण पत्र', menu: `📜 *प्रमाण पत्र सेवा*\n──────────────────\n1️⃣ आय प्रमाण पत्र\n2️⃣ जाति प्रमाण पत्र\n3️⃣ आवासीय प्रमाण पत्र\n0️⃣ Go Back`, req: ["🔹 फोटो", "🔹 आधार कार्ड", "🔹 पुराना प्रमाण (यदि है)"] },
    '4': { key: 'RATION', title: 'राशन कार्ड', menu: `🍚 *राशन कार्ड सेवा*\n──────────────────\n1️⃣ नया आवेदन (New Application)\n2️⃣ सदस्य जोड़ें (Add Member)\n3️⃣ सदस्य हटाएं (Remove Member)\n0️⃣ Go Back`, req: ["🔹 मुखिया का आधार", "🔹 बैंक खाता", "🔹 सभी सदस्यों का आधार", "🔹 फोटो"] }
};

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }),
        browser: ['Bihar-Sathi-Cloud', 'Chrome', '1.0.0'],
        keepAliveIntervalMs: 10000,
        emitOwnEvents: false,
        retryRequestDelayMs: 2000 
    });

    const smartReply = async (jid, text) => {
        await sock.readMessages([jid]);
        await sock.sendPresenceUpdate('composing', jid);
        await delay(500 + Math.random() * 1000); 
        await sock.sendPresenceUpdate('paused', jid);
        await sock.sendMessage(jid, { text: text });
    };

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        // Check if QR code is needed (only if zip failed or expired)
        if (qr && !fs.existsSync('./auth_info_baileys')) { 
            console.log("⚠️ Session missing or expired. Please scan QR.");
        }

        if (connection === 'close') {
            if (intervalId) clearInterval(intervalId);
            const shouldReconnect = (lastDisconnect.error instanceof Boom) ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut : true;
            if (shouldReconnect) setTimeout(connectToWhatsApp, 2000);
        } else if (connection === 'open') {
            console.log('✅ BOT IS ONLINE ON CLOUD!');
            intervalId = setInterval(() => {
                const now = Date.now();
                userSession.forEach((session, jid) => {
                    if (now - session.lastActive > TIMEOUT_MS) {
                        userSession.delete(jid);
                        sock.sendMessage(jid, { text: UI.TIMEOUT }).catch(() => {});
                    }
                });
                saveSessions();
            }, 60000);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
            if (!msg.message || msg.key.fromMe) continue;
            const remoteJid = msg.key.remoteJid;

            // VOICE MESSAGE
            if (msg.message.audioMessage) {
                await smartReply(remoteJid, UI.VOICE_RECEIVED);
                await sock.sendMessage(ADMIN_NUMBER, { text: `🎤 *VOICE RECEIVED* from +${remoteJid.split('@')[0]}\n(Check chat)` });
                return;
            }

            const textBody = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
            const lowerText = textBody.toLowerCase();

            if (!userSession.has(remoteJid)) userSession.set(remoteJid, { step: 'MAIN_MENU', service: '', lastActive: Date.now() });
            const session = userSession.get(remoteJid);
            session.lastActive = Date.now();
            saveSessions();

            if (['hi', 'hello', 'menu', '0', 'start'].includes(lowerText)) {
                session.step = 'MAIN_MENU';
                await smartReply(remoteJid, UI.WELCOME());
                return;
            }

            try {
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
                        } else if (textBody === '5') await smartReply(remoteJid, UI.RATE_LIST);
                        else if (textBody === '6') await smartReply(remoteJid, "📞 *Call Request Sent!*");
                        break;
                    
                    case 'SUB_MENU':
                        if(textBody.length > 0) {
                            session.subService = textBody;
                            if(session.service === 'RATION' && (textBody === '2' || textBody === '3')) {
                                session.step = 'AWAITING_NAME';
                                session.serviceData.title = textBody === '2' ? "Add Member" : "Remove Member";
                                await smartReply(remoteJid, UI.ASK_NAME(textBody === '2' ? 'Add' : 'Remove'));
                                return;
                            }
                            session.step = 'DOCS';
                            await sendUploadReq(sock, remoteJid, session);
                        }
                        break;

                    case 'AWAITING_NAME':
                        if(textBody.length > 0) {
                            session.memberName = textBody;
                            session.step = 'DOCS';
                            // Dynamic Reqs
                            if (session.serviceData.title.includes("Add")) {
                                session.serviceData.req = ["🔹 राशन कार्ड", "🔹 सभी का आधार", "🔹 सभी की फोटो", "🔹 मुखिया का जाति, आवासी, आय", "🔹 हस्ताक्षर"];
                            } else if (session.serviceData.title.includes("Remove")) {
                                session.serviceData.req = ["🔹 राशन कार्ड", "🔹 सभी का आधार", "🔹 मुखिया का जाति, आवासी, आय", "🔹 हस्ताक्षर", "🔹 फोटो"];
                            }
                            await sendUploadReq(sock, remoteJid, session);
                        }
                        break;

                    case 'DOCS':
                        if(['done', 'pay'].includes(lowerText)) {
                            session.orderId = 'CSC-' + Math.floor(Math.random() * 9000);
                            session.step = 'PAYMENT';
                            await smartReply(remoteJid, UI.PAYMENT(session.orderId));
                        } else if (msg.message.imageMessage || msg.message.documentMessage) {
                            await sock.sendMessage(remoteJid, { text: "📥 *Received!*" });
                        }
                        break;

                    case 'PAYMENT':
                        if(msg.message.imageMessage) {
                            await smartReply(remoteJid, UI.THANK_YOU);
                            let alert = `🚨 *NEW ORDER*\n🆔 ${session.orderId}\n👤 +${remoteJid.split('@')[0]}\n🛠 ${session.serviceData.title}`;
                            if(session.memberName) alert += `\n🧑 ${session.memberName}`;
                            await sock.sendMessage(ADMIN_NUMBER, { text: alert });
                            userSession.delete(remoteJid);
                            saveSessions();
                        }
                        break;
                }
            } catch (e) { session.step = 'MAIN_MENU'; }
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
connectToWhatsApp();