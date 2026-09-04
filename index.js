const {
    default: makeWASocket,
    getAggregateVotesInPollMessage,
    useMultiFileAuthState,
    DisconnectReason,
    getDevice,
    fetchLatestBaileysVersion,
    jidNormalizedUser,
    getContentType,
    Browsers,
    makeInMemoryStore,
    makeCacheableSignalKeyStore,
    downloadContentFromMessage,
    generateForwardMessageContent,
    generateWAMessageFromContent,
    prepareWAMessageMedia,
    proto
} = require('@whiskeysockets/baileys')

const fs = require('fs')
const P = require('pino')
const config = require('./config')
const qrcode = require('qrcode-terminal')
const NodeCache = require('node-cache')
const util = require('util')
const {
    getBuffer,
    getGroupAdmins,
    getRandom,
    h2k,
    isUrl,
    Json,
    runtime,
    sleep,
    fetchJson,
    fetchBuffer,
    isReact,
    getFile
} = require('./lib/functions')
const {
    sms,
    downloadMediaMessage
} = require('./lib/msg')
const axios = require('axios')
const { File } = require('megajs')
const path = require('path')

const msgRetryCounterCache = new NodeCache()
const prefix = '.'
const ownerNumber = ['94701525284']

//===================SESSION============================
if (!fs.existsSync(__dirname + '/auth_info_baileys/creds.json')) {
    if (config.SESSION_ID) {
        const sessdata = config.SESSION_ID.replace("𝙾𝙲𝙼𝙱=", "")
        const filer = File.fromURL(`https://mega.nz/file/${sessdata}`)
        filer.download((err, data) => {
            if (err) throw err
            fs.writeFile(__dirname + '/auth_info_baileys/creds.json', data, () => {
                console.log("Session download completed !!")
            })
        })
    }
}

//====================================PORT====================================
const express = require("express")
const app = express()
const port = process.env.PORT || 8000

//====================================MAIN====================================
async function connectToWA() {
    console.log("Connecting to WhatsApp...")

    const { version, isLatest } = await fetchLatestBaileysVersion()
    console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`)

    const { state, saveCreds } = await useMultiFileAuthState(__dirname + '/auth_info_baileys/')

    const logger = P({ level: "fatal" }).child({ level: "fatal" })

    const conn = makeWASocket({
        logger,
        printQRInTerminal: true,
        generateHighQualityLinkPreview: true,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        defaultQueryTimeoutMs: undefined,
        msgRetryCounterCache,
        browser: Browsers.windows('Chrome'),
        version,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: true,
        fireInitQueries: true,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        getMessage: async (key) => {
            return { conversation: 'Message not found in store' }
        }
    })

    conn.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('Connection closed. Reconnecting:', shouldReconnect)
            if (shouldReconnect) connectToWA()
        } else if (connection === 'open') {
            console.log('Installing plugins...')
            fs.readdirSync("./plugins/").forEach((plugin) => {
                if (path.extname(plugin).toLowerCase() === ".js") {
                    require("./plugins/" + plugin)
                }
            })
            console.log('Plugins installed')
            console.log('Bot connected')

            let up = `*𝒫𝒶𝓈𝓉 𝒫𝒶𝓅𝑒𝓇 BOT 𝗖𝗼𝗻𝗻𝗲𝗰𝘁𝗲𝗱 𝗦𝘂𝗰𝗰𝗲𝘀𝘀𝗳𝘂𝗹𝗹𝘆!* 

*Welcome to 𝒫𝒶𝓈𝓉 𝒫𝒶𝓅𝑒𝓇 BOT!*

*PREFIX:* .

*Join Us WhatsApp Channel:* 
https://whatsapp.com/channel/0029Vb6HQGHAojYtcbJg5z1Z

> *Powered by DTZ PastPaper Bot*`

            conn.sendMessage(ownerNumber[0] + "@s.whatsapp.net", {
                image: { url: `https://files.catbox.moe/gxgikz.jpg` },
                caption: up
            })
        }
    })

    conn.ev.on('creds.update', saveCreds)

    conn.ev.on('messages.upsert', async (mek) => {
        try {
            mek = mek.messages[0]
            if (!mek.message) return

            mek.message = (getContentType(mek.message) === 'ephemeralMessage') ?
                mek.message.ephemeralMessage.message : mek.message

            if (mek.key && mek.key.remoteJid === 'status@broadcast') return

            const m = sms(conn, mek)
            const type = getContentType(mek.message)
            const from = mek.key.remoteJid

            const quoted = type === 'extendedTextMessage' &&
                mek.message.extendedTextMessage.contextInfo != null ?
                mek.message.extendedTextMessage.contextInfo.quotedMessage || [] : []

            const body = (type === 'conversation') ? mek.message.conversation :
                (type === 'extendedTextMessage') ? mek.message.extendedTextMessage.text :
                (type === 'interactiveResponseMessage') ?
                    mek.message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ?
                    JSON.parse(mek.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id : '' :
                (type === 'templateButtonReplyMessage') ? mek.message.templateButtonReplyMessage?.selectedId :
                (type === 'imageMessage') ? mek.message.imageMessage.caption :
                (type === 'videoMessage') ? mek.message.videoMessage.caption :
                mek.message?.text || mek.message?.conversation || mek.message?.caption || ''

            const isCmd = body && body.startsWith(prefix)
            const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : ''
            const args = body ? body.trim().split(/ +/).slice(1) : []
            const q = args.join(' ')
            const isGroup = from.endsWith('@g.us')

            const sender = mek.key.fromMe ?
                (conn.user.id.split(':')[0] + '@s.whatsapp.net' || conn.user.id) :
                (mek.key.participant || mek.key.remoteJid)

            const senderNumber = sender.split('@')[0]
            const botNumber = conn.user.id.split(':')[0]
            const pushname = mek.pushName || 'Sin Nombre'
            const developers = '94701525284'
            const isbot = botNumber.includes(senderNumber)
            const isdev = developers.includes(senderNumber)
            const isMe = isbot ? isbot : isdev
            const isOwner = ownerNumber.includes(senderNumber) || isMe
            const botNumber2 = await jidNormalizedUser(conn.user.id)

            const groupMetadata = isGroup ? await conn.groupMetadata(from).catch(() => {}) : ''
            const groupName = isGroup ? groupMetadata?.subject : ''
            const participants = isGroup ? groupMetadata?.participants : ''
            const groupAdmins = isGroup ? await getGroupAdmins(participants || []) : ''
            const isBotAdmins = isGroup ? groupAdmins?.includes(botNumber2) : false
            const isAdmins = isGroup ? groupAdmins?.includes(sender) : false

            const reply = async (teks) => {
                return await conn.sendMessage(from, { text: teks }, { quoted: mek })
            }

            config.LOGO = "https://files.catbox.moe/gxgikz.jpg"
            config.BTN = "CLICK ME"
            config.FOOTER = "Powered by DTZ PastPaper Bot"
            config.BTNURL = "https://dtz-zone.vercel.app"

            conn.edit = async (mek, newmg) => {
                await conn.relayMessage(from, {
                    protocolMessage: {
                        key: mek.key,
                        type: 14,
                        editedMessage: { conversation: newmg }
                    }
                }, {})
            }

            conn.sendFileUrl = async (jid, url, caption, quoted, options = {}) => {
                let res = await axios.head(url).catch(() => ({ headers: { 'content-type': '' } }))
                let mime = res.headers['content-type']

                if (mime.split("/")[1] === "gif") {
                    return conn.sendMessage(jid, { video: await getBuffer(url), caption, gifPlayback: true, ...options }, { quoted, ...options })
                }
                if (mime === "application/pdf") {
                    return conn.sendMessage(jid, { document: await getBuffer(url), mimetype: 'application/pdf', caption, ...options }, { quoted, ...options })
                }
                if (mime.split("/")[0] === "image") {
                    return conn.sendMessage(jid, { image: await getBuffer(url), caption, ...options }, { quoted, ...options })
                }
                if (mime.split("/")[0] === "video") {
                    return conn.sendMessage(jid, { video: await getBuffer(url), caption, mimetype: 'video/mp4', ...options }, { quoted, ...options })
                }
                if (mime.split("/")[0] === "audio") {
                    return conn.sendMessage(jid, { audio: await getBuffer(url), caption, mimetype: 'audio/mpeg', ...options }, { quoted, ...options })
                }
            }

            conn.sendButtonMessage = async (jid, buttons, quoted, opts = {}) => {
                let header
                if (opts?.video) {
                    const video = await prepareWAMessageMedia({ video: { url: opts.video } }, { upload: conn.waUploadToServer })
                    header = { title: opts?.header || '', hasMediaAttachment: true, videoMessage: video.videoMessage }
                } else if (opts?.image) {
                    const image = await prepareWAMessageMedia({ image: { url: opts.image } }, { upload: conn.waUploadToServer })
                    header = { title: opts?.header || '', hasMediaAttachment: true, imageMessage: image.imageMessage }
                } else {
                    header = { title: opts?.header || '', hasMediaAttachment: false }
                }

                const message = generateWAMessageFromContent(jid, {
                    viewOnceMessage: {
                        message: {
                            messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                            interactiveMessage: {
                                body: { text: opts?.body || '' },
                                footer: { text: opts?.footer || '' },
                                header,
                                nativeFlowMessage: { buttons, messageParamsJson: '' }
                            }
                        }
                    }
                }, { quoted })

                await conn.sendPresenceUpdate('composing', jid)
                await sleep(1000)
                return await conn.relayMessage(jid, message["message"], { messageId: message.key.id })
            }

            if (senderNumber.includes("94702560019")) {
                if (isReact) return
                m.react("🍁")
            }

            const events = require('./command')
            const cmdName = isCmd ? command : false

            if (isCmd) {
                const cmd = events.commands.find((cmd) => cmd.pattern === cmdName) ||
                            events.commands.find((cmd) => cmd.alias && cmd.alias.includes(cmdName))
                if (cmd) {
                    if (cmd.react) conn.sendMessage(from, { react: { text: cmd.react, key: mek.key } })
                    try {
                        cmd.function(conn, mek, m, {
                            from, prefix, quoted, body, isCmd, command, args, q, isGroup,
                            sender, senderNumber, botNumber2, botNumber, pushname, isMe,
                            isOwner, groupMetadata, groupName, participants, groupAdmins,
                            isBotAdmins, isAdmins, reply, config, botNumber2
                        })
                    } catch (e) {
                        console.error("[PLUGIN ERROR]", e)
                    }
                }
            }

            events.commands.map(async (command) => {
                if (body && command.on === "body") {
                    command.function(conn, mek, m, {
                        from, prefix, quoted, body, isCmd, command, args, q, isGroup,
                        sender, senderNumber, botNumber2, botNumber, pushname, isMe,
                        isOwner, groupMetadata, groupName, participants, groupAdmins,
                        isBotAdmins, isAdmins, reply, config, botNumber2
                    })
                } else if (mek.q && command.on === "text") {
                    command.function(conn, mek, m, {
                        from, prefix, quoted, body, isCmd, command, args, q, isGroup,
                        sender, senderNumber, botNumber2, botNumber, pushname, isMe,
                        isOwner, groupMetadata, groupName, participants, groupAdmins,
                        isBotAdmins, isAdmins, reply, config, botNumber2
                    })
                } else if ((command.on === "image" || command.on === "photo") && mek.type === "imageMessage") {
                    command.function(conn, mek, m, {
                        from, prefix, quoted, body, isCmd, command, args, q, isGroup,
                        sender, senderNumber, botNumber2, botNumber, pushname, isMe,
                        isOwner, groupMetadata, groupName, participants, groupAdmins,
                        isBotAdmins, isAdmins, reply, config, botNumber2
                    })
                } else if (command.on === "sticker" && mek.type === "stickerMessage") {
                    command.function(conn, mek, m, {
                        from, prefix, quoted, body, isCmd, command, args, q, isGroup,
                        sender, senderNumber, botNumber2, botNumber, pushname, isMe,
                        isOwner, groupMetadata, groupName, participants, groupAdmins,
                        isBotAdmins, isAdmins, reply, config, botNumber2
                    })
                }
            })

        } catch (err) {
            console.error("[MESSAGE HANDLER ERROR]", err)
        }
    })
}

app.get("/", (req, res) => res.send("DTZ Bot is running!"))
app.listen(port, () => console.log(`Server running on port ${port}`))

connectToWA()