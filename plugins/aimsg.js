const { cmd } = require('../command');
const axios = require('axios');

// Multiple AI APIs
const AI_APIS = [
    {
        name: "Chathura AI",
        url: "https://chai2.netlify.app/q",
        paramKey: "q",
        responseKey: "response"
    },
    {
        name: "BK9 Gemini",
        url: "https://api.bk9.dev/ai/gemini",
        paramKey: "q",
        responseKey: "BK9"
    }
];

cmd({
    pattern: "ai",
    alias: ["gemini", "ask"],
    react: "✨",
    desc: "Chat with AI",
    category: "ai",
    use: '.ai <prompt>',
    filename: __filename
},
async (conn, mek, m, { from, args, reply }) => {
    try {
        const question = args.join(" ");
        if (!question)
            return reply("⚠️ *Please ask a question!*\n\nExample: `.ai What is AI?`");

        await conn.sendMessage(from, { react: { text: '🤔', key: mek.key } });

        // Try APIs one by one
        for (let api of AI_APIS) {
            try {
                const response = await axios.get(api.url, {
                    params: { [api.paramKey]: question },
                    timeout: 15000
                });

                const aiResponse =
                    response.data[api.responseKey] ||
                    response.data.response ||
                    response.data.result;

                if (aiResponse) {

                    await conn.sendMessage(from, {
                        react: { text: '✅', key: mek.key }
                    });

                    return await conn.sendMessage(from, {
                        text: aiResponse
                    }, { quoted: mek });
                }

            } catch (err) {
                console.log(`${api.name} failed...`);
                continue;
            }
        }

        throw new Error("All APIs failed");

    } catch (error) {
        console.error("AI Error:", error.message);

        await conn.sendMessage(from, {
            react: { text: '❌', key: mek.key }
        });

        await reply("⚠️ AI service unavailable. Try again later.");
    }
});