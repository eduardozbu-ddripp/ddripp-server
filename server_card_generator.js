const express = require('express');
const { createCanvas, loadImage } = require('canvas'); 
const fetch = require('node-fetch'); 
const app = express();

const PORT = process.env.PORT || 3000;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY; 

const THEME = {
    fontMain: 'bold 70px sans-serif',
    fontDate: '30px sans-serif',
    colorText: '#ffffff',
    overlayColor: 'rgba(0, 0, 0, 0.5)', 
    logoText: 'ddripp' 
};

const backgroundCache = new Map();

async function generateAIImage(prompt) {
    if (!GOOGLE_API_KEY) throw new Error("Chave de API (GOOGLE_API_KEY) não encontrada no Render.");
    
    console.log(`🎨 Tentando gerar imagem para: "${prompt}"...`);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${GOOGLE_API_KEY}`;
    
    const payload = {
        instances: [{ prompt: `Beautiful travel photography of ${prompt}, cinematic lighting, 8k` }],
        parameters: { sampleCount: 1, aspectRatio: "16:9" }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error("Erro Google API:", errText);
        throw new Error(`Google recusou: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    if (!data.predictions) throw new Error("Google não retornou imagem.");
    return Buffer.from(data.predictions[0].bytesBase64Encoded, 'base64');
}

app.get('/dynamic-cover', async (req, res) => {
    try {
        const { dest, date } = req.query;
        const destination = dest || 'Destino';
        const dateText = date || '';

        const width = 1200;
        const height = 630;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Lógica de Imagem
        const cacheKey = `img_${destination.toLowerCase()}`;
        let image;

        try {
            if (backgroundCache.has(cacheKey)) {
                console.log("⚡ Cache Hit");
                image = await loadImage(backgroundCache.get(cacheKey));
            } else {
                let imgBuffer;
                try {
                    imgBuffer = await generateAIImage(destination);
                } catch (aiError) {
                    console.error("Falha na IA, tentando Unsplash:", aiError.message);
                    // Fallback Unsplash
                    const unsplash = await fetch(`https://source.unsplash.com/1200x630/?${encodeURIComponent(destination)},travel`);
                    if (!unsplash.ok) throw new Error("Unsplash também falhou");
                    imgBuffer = await unsplash.buffer();
                }
                backgroundCache.set(cacheKey, imgBuffer);
                image = await loadImage(imgBuffer);
            }
        } catch (e) {
            // Se tudo falhar, desenha um fundo cinza com o erro escrito (para debug visual)
            console.error("Erro Fatal Imagem:", e.message);
            ctx.fillStyle = '#333';
            ctx.fillRect(0,0,width,height);
            ctx.fillStyle = '#ff5555';
            ctx.font = '20px sans-serif';
            ctx.fillText(`Erro: ${e.message.substring(0, 50)}...`, 50, 50);
            // Não retorna, continua para desenhar o texto por cima
        }

        // Se imagem carregou (ou fundo cinza de erro), desenha
        if (image) ctx.drawImage(image, 0, 0, width, height);

        // Identidade Visual
        ctx.fillStyle = THEME.overlayColor;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#3B82F6'; 
        ctx.font = 'bold 40px sans-serif';
        ctx.fillText('ddripp', 50, 80);
        ctx.fillStyle = THEME.colorText;
        ctx.textAlign = 'center';
        ctx.font = 'bold 70px sans-serif';
        ctx.fillText(destination.substring(0,20).toUpperCase(), width / 2, height / 2);
        ctx.font = THEME.fontDate;
        ctx.fillText(`📅 ${dateText}`, width / 2, (height / 2) + 60);

        res.set('Content-Type', 'image/png');
        canvas.createPNGStream().pipe(res);

    } catch (error) {
        res.status(500).send(`Erro Crítico no Servidor: ${error.message}`);
    }
});

// Rota de Compartilhamento
app.get('/share', (req, res) => {
    const { title, date, dest, data } = req.query;
    // ... (mesmo código HTML anterior, sem mudanças aqui)
    const pageTitle = title || 'Roteiro ddripp';
    const dynamicImageUrl = `${req.protocol}://${req.get('host')}/dynamic-cover?dest=${encodeURIComponent(dest||'')}&date=${encodeURIComponent(date||'')}`;
    const APP_URL = "https://eduardozbu-ddripp.github.io/ddripp-server/"; // Seu link correto

    res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta property="og:site_name" content="ddripp">
        <meta property="og:title" content="${pageTitle}">
        <meta property="og:description" content="Confira o roteiro de viagem.">
        <meta property="og:image" content="${dynamicImageUrl}">
        <meta property="og:image:width" content="1200">
        <meta property="og:image:height" content="630">
        <meta name="twitter:card" content="summary_large_image">
        <title>${pageTitle}</title>
        <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#f0f9ff;color:#0c4a6e}</style>
    </head>
    <body>
        <h2>Redirecionando...</h2>
        <script>setTimeout(() => { window.location.href = "${APP_URL}?data=${data}"; }, 100);</script>
    </body>
    </html>
    `);
});

app.listen(PORT, () => console.log(`Servidor Diagnóstico rodando na porta ${PORT}`));
