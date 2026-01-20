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
const UPI_ID = '7633832024'; // आपकी UPI ID
const BOT_NAME = 'Bihar Sathi AI';
const SESSION_FILE = './sessions.json';

// ═════════════════════════════════════════════
// 🟢 SERVER KEEPER (24/7 AWS)
// ═════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('✅ Bihar Sathi Bot Running 🚀'));
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
// 🎨 UI & MENUS (UPDATED WITH BACK OPTION)
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

सेवा चुनें:
╔══ *POPULAR SERVICES* ══╗
║ 1️⃣ 🆔 आधार कार्ड
║ 2️⃣ 💳 पैन कार्ड
║ 3️⃣ 📜 आय / जाति / आवासी
║ 4️⃣ 🍚 राशन कार्ड
╚════════════════════╝

╔══ *OTHER SERVICES* ══╗
║ 8️⃣ 👵 वृद्धा पेंशन (Pension)
║ 9️⃣ 👷 ई-श्रम कार्ड (e-Shram)
╚════════════════════╝

╔══ *HELP* ══╗
║ 🔟 💰 रेट लिस्ट (Rates)
║ 📞 *0* दबाकर कॉल रिक्वेस्ट करें
╚════════════════════╝

👉 _सेवा चुनने के लिए **1-4** या **8-10** लिखें_`,

    RATE_LIST: `╔═══════════════════╗
║ 💰 *OFFICIAL RATE LIST*
╚═══════════════════╝
🔹 *आधार अपडेट:* ₹160
🔹 *पैन कार्ड:* ₹180
🔹 *आय / जाति /आवासी :* ₹50
🔹 *राशन कार्ड:* ₹100 - ₹150
🔹 *वृद्धा पेंशन (Pension) /e-Shram:* 100
🔹 *प्रिंट आउट:* ₹3/page

🔙 *0* दबाकर वापस जाएं`,

    PAYMENT: (orderId) => `╔═══════════════════╗
║ 🧾 *PAYMENT MODE*
╚═══════════════════╝
🆔 *Order ID:* \`${orderId}\`

पैसे कैसे देंगे?

1️⃣ *ONLINE (UPI):*
💠 UPI ID: \`${UPI_ID}\`
_(Payment करके Screenshot भेजें)_

2️⃣ *CASH (नकद):*
_(दुकान पर आकर देंगे)_

👇 *Instructions:*
अगर **Online** किया है तो **फोटो** भेजें।
अगर **Cash** देंगे तो बस **CASH** लिखें।

🔙 *0* दबाकर वापस जाएं (Main Menu)`,

    THANK_YOU: `╔═══════════════════╗
║ ✅ *आपकी जानकरी ले किया गया बहुत जल्द काम हो जाएगा*
╚═══════════════════╝
आप चाहे तो कॉल कर सकते है।`,

    UPLOAD: (srv, docs, note, memberName = "") => `📂 *DOCUMENT UPLOAD*
───────────────────────
🛠️ *Service:* ${srv}
${memberName ? `👤 *Member:* ${memberName}` : ""}

👇 *कृपया ये भेजें:*
${docs}
${note}

🎤 *नोट:* आप बोलकर भी बता सकते हैं।
✅ भेजने के बाद *DONE* लिखें।

🔙 *0* दबाकर वापस जाएं (Main Menu)`,

    ASK_NAME: (action) => `👤 *MEMBER NAME*
───────────────────────
सदस्य का **नाम (Name)** लिखें।

🔙 *0* दबाकर वापस जाएं`,

    VOICE_RECEIVED: `🎤 *VOICE RECEIVED* 🎧
───────────────────────
हमने आपकी आवाज़ सुन ली है!
आपका मैसेज एडमिन को भेज दिया गया है।
वे सुनकर जल्द ही जवाब देंगे।`
};

// ═════════════════════════════════════════════
// 🧠 SERVICE LOGIC (BIHAR SPECIAL)
// ═════════════════════════════════════════════
const SERVICES = {
    '1': {
        key: 'AADHAAR',
        title: 'आधार कार्ड सुधार',
        menu: `🆔 *आधार कार्ड सेवा*
──────────────────
1️⃣ पता अपडेट (Address Update)
2️⃣ नाम/जन्म तिथि (Name/DOB)
3️⃣ डॉक्यूमेंट अपडेट (Doc Update)
0️⃣ Go Back`,
        req: ["🔹 पुराना आधार कार्ड", "🔹 आवासी", "🔹आधार से जुदा हुवा मोबाइल नंबर "],
        note: "\n⚠️ *Note:* OTP के लिए तैयार रहें।"
    },
    '2': {
        key: 'PAN',
        title: 'पैन कार्ड अप्लाई',
        menu: `💳 *पैन कार्ड सेवा*
──────────────────
1️⃣ नया पैन कार्ड (New Apply)
2️⃣ पैन सुधार (Correction)
3️⃣ पैन-आधार लिंक (Link)
0️⃣ Go Back`,
        req: ["🔹 आधार कार्ड (दोनों साइड)", "🔹 2 पासपोर्ट साइज फोटो", "🔹 सादा कागज पर Sign", "🔹 मोबाइल नंबर"]
    },
    '3': {
        key: 'CERT',
        title: 'RTPS (आय/जाति/निवास)',
        menu: `📜 *बिहार RTPS सेवा*
──────────────────
1️⃣ आय प्रमाण पत्र (Income)
2️⃣ जाति प्रमाण पत्र (Caste)
3️⃣ आवासीय प्रमाण पत्र (Residence)
0️⃣ Go Back`,
        req: ["🔹 आधार कार्ड (दोनों साइड)", "🔹 एक फोटो", "🔹 मोबाइल नंबर","🔹 सादा कागज पर Sign", "🔹 जाती के लिए-- पुराना जाती डाले, घर में किसी का, नहीं तो कॉल करे) "]
    },
    '4': {
        key: 'RATION',
        title: 'राशन कार्ड (Bihar)',
        menu: `🍚 *बिहार राशन कार्ड*
──────────────────
1️⃣ नया राशन कार्ड (New Card)
2️⃣ नाम जोड़ें (Add Member)
3️⃣ नाम हटाए (Delete Member)
0️⃣ Go Back`,
        req: ["🔹 मुखिया (महिला) का आधार", "🔹 बैंक पासबुक", "🔹 आय, जाति, निवास", "🔹 पूरे परिवार का फोटो", "🔹 सभी का आधार", "🔹 सादा कागज पर Sign"]
    },
    '8': {
        key: 'PENSION',
        title: 'वृद्धा पेंशन (Pension)',
        menu: `👵 *वृद्धा पेंशन सेवा*
──────────────────
1️⃣ नया आवेदन (New Apply)
0️⃣ Go Back`,
        req: ["🔹 आधार कार्ड", "🔹 पहचान पत्र (Voter ID)", "🔹 बैंक पासबुक", "🔹 फोटो", "🔹 हस्ताक्षर (Sign)"]
    },
    '9': {
        key: 'ESHRAM',
        title: 'ई-श्रम कार्ड (e-Shram)',
        menu: `👷 *ई-श्रम कार्ड सेवा*
──────────────────
1️⃣ नया कार्ड (New Apply)
2️⃣ अपडेट/डाउनलोड
0️⃣ Go Back`,
        req: ["🔹 आधार कार्ड", "🔹 बैंक पासबुक", "🔹 मोबाइल नंबर"]
    }
};

// ═════════════════════════════════════════════
// 🔌 MAIN BOT LOGIC
// ═════════════════════════════════════════════
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        msgRetryCounterCache,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: true,
        retryRequestDelayMs: 5000
    });

    if (!sock.authState.creds.registered) {
        console.log("⏳ Waiting for Pairing Code...");
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(MY_NUMBER);
                console.log(`\n\n🟢 YOUR PAIRING CODE:  ${code}  🟢\n\n`);
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
            if (reason === DisconnectReason.badSession || reason === DisconnectReason.loggedOut) {
                fs.rmSync('./auth_info_baileys', { recursive: true, force: true });
                process.exit();
            } else {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log(`✅ ${BOT_NAME} IS ONLINE!`);
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

                if (msg.message.audioMessage) {
                    await smartReply(remoteJid, UI.VOICE_RECEIVED);
                    await sock.sendMessage(ADMIN_NUMBER, { 
                        text: `🎤 *VOICE RECEIVED* from +${remoteJid.split('@')[0]}` 
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
                        else if (textBody === '10' || lowerText.includes('rate')) await smartReply(remoteJid, UI.RATE_LIST);
                        else if (lowerText.includes('call')) {
                            await smartReply(remoteJid, "📞 *Call Request Sent!*");
                            await sock.sendMessage(ADMIN_NUMBER, { text: `🚨 CALL REQUEST: ${remoteJid.split('@')[0]}` });
                        }
                        else if (textBody.length > 0) await smartReply(remoteJid, "❌ गलत विकल्प। कृपया लिस्ट से चुनें।");
                        break;

                    case 'SUB_MENU':
                        if (textBody.length > 0) {
                            session.subService = textBody;
                            // Special Logic for Ration Add/Remove
                            if (session.service === 'RATION' && (textBody === '2' || textBody === '3')) {
                                session.step = 'AWAITING_NAME';
                                session.serviceData.title = textBody === '2' ? "Ration - Add Member" : "Ration - Remove Member";
                                await smartReply(remoteJid, UI.ASK_NAME());
                                return;
                            }
                            session.step = 'DOCS';
                            await sendUploadReq(sock, remoteJid, session);
                        }
                        break;

                    case 'AWAITING_NAME':
                        if (textBody.length > 0) {
                            session.memberName = textBody;
                            session.step = 'DOCS';
                            await sendUploadReq(sock, remoteJid, session);
                        }
                        break;

                    case 'DOCS':
                        if (['done', 'pay', 'ok', 'bhej diya'].includes(lowerText)) {
                            session.orderId = 'CSC-' + Math.floor(1000 + Math.random() * 9000);
                            session.step = 'PAYMENT';
                            await smartReply(remoteJid, UI.PAYMENT(session.orderId));
                        } 
                        else if (msg.message.imageMessage || msg.message.documentMessage) {
                            await sock.sendMessage(remoteJid, { text: "📥 *Document Received!* (और भेजें या DONE लिखें)" });
                        }
                        break;

                    case 'PAYMENT':
                        if (msg.message.imageMessage) { // Online Payment
                            await smartReply(remoteJid, UI.THANK_YOU);
                            let alertMsg = `🚨 *ORDER (ONLINE)* 🚨\n🆔: \`${session.orderId}\`\n👤: +${remoteJid.split('@')[0]}\n🛠: ${session.serviceData?.title}`;
                            if(session.memberName) alertMsg += `\n🧑 Name: ${session.memberName}`;
                            await sock.sendMessage(ADMIN_NUMBER, { text: alertMsg });
                            userSession.delete(remoteJid);
                            saveSessions();
                        } 
                        else if (lowerText.includes('cash')) { // Cash Payment
                            await smartReply(remoteJid, "✅ *Order Confirmed!* \nदुकान पर पेमेंट करें।");
                            let alertMsg = `🚨 *ORDER (CASH)* 🚨\n🆔: \`${session.orderId}\`\n👤: +${remoteJid.split('@')[0]}\n🛠: ${session.serviceData?.title}\n💰: CASH Payment Pending`;
                            if(session.memberName) alertMsg += `\n🧑 Name: ${session.memberName}`;
                            await sock.sendMessage(ADMIN_NUMBER, { text: alertMsg });
                            userSession.delete(remoteJid);
                            saveSessions();
                        }
                        else {
                            await smartReply(remoteJid, "❌ कृपया Screenshot भेजें या **CASH** लिखें।\n🔙 *0* दबाकर वापस जाएं।");
                        }
                        break;
                }
            } catch (err) {
                console.error("Bot Error:", err);
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

process.on('uncaughtException', function (err) { console.log('Caught exception: ' + err); });

connectToWhatsApp();
