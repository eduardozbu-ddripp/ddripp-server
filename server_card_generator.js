const express = require('express');
const { createCanvas, loadImage } = require('canvas'); 
const fetch = require('node-fetch'); 
const app = express();

const PORT = process.env.PORT || 3000;

// O SEGREDO: O código lê a chave do cofre do Render (Environment Variable)
// Não cole sua chave aqui! Deixe como está.
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
    if (!GOOGLE_API_KEY) {
        console.error("ERRO CRÍTICO: Chave de API não encontrada no Environment do Render.");
        throw new Error("Servidor sem configuração de API Key.");
    }
    
    console.log(`🎨 Gerando imagem IA para: "${prompt}"...`);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${GOOGLE_API_KEY}`;
    
    const payload = {
        instances: [{ prompt: `Beautiful travel photography of ${prompt}, cinematic lighting, 8k resolution, photorealistic, landscape` }],
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
        throw new Error(`Google recusou a geração: ${errText}`);
    }

    const data = await response.json();
    if (!data.predictions) throw new Error("Nenhuma imagem retornada.");
    return Buffer.from(data.predictions[0].bytesBase64Encoded, 'base64');
}

app.get('/dynamic-cover', async (req, res) => {
    try {
        const { dest, date } = req.query;
        const destination = dest || 'Viagem';
        const dateText = date || '';

        const width = 1200;
        const height = 630;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Cache e Geração
        const cacheKey = `img_v2_${destination.toLowerCase()}`;
        let image;

        if (backgroundCache.has(cacheKey)) {
            console.log(`⚡ Cache Hit: ${destination}`);
            image = await loadImage(backgroundCache.get(cacheKey));
        } else {
            let imgBuffer;
            try {
                imgBuffer = await generateAIImage(destination);
            } catch (e) {
                console.error("Falha na IA, usando fallback:", e.message);
                // Fallback para Unsplash se a IA falhar
                const unsplash = await fetch(`https://source.unsplash.com/1200x630/?${encodeURIComponent(destination)},travel`);
                imgBuffer = await unsplash.buffer();
            }
            backgroundCache.set(cacheKey, imgBuffer);
            image = await loadImage(imgBuffer);
        }

        // Desenha
        ctx.drawImage(image, 0, 0, width, height);
        
        // Identidade Visual
        ctx.fillStyle = THEME.overlayColor;
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#3B82F6'; 
        ctx.font = 'bold 40px sans-serif';
        ctx.fillText('ddripp', 50, 80);

        ctx.fillStyle = THEME.colorText;
        ctx.textAlign = 'center';
        
        let fontSize = 70;
        ctx.font = `bold ${fontSize}px sans-serif`;
        while (ctx.measureText(destination.toUpperCase()).width > width - 100 && fontSize > 30) {
            fontSize -= 5;
            ctx.font = `bold ${fontSize}px sans-serif`;
        }
        
        ctx.fillText(destination.toUpperCase(), width / 2, height / 2);

        ctx.font = THEME.fontDate;
        ctx.fillText(`📅 ${dateText}`, width / 2, (height / 2) + 60);

        ctx.font = 'italic 20px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillText('Roteiro Personalizado', width / 2, height - 40);

        res.set('Content-Type', 'image/png');
        canvas.createPNGStream().pipe(res);

    } catch (error) {
        console.error(error);
        res.status(500).send('Erro interno no servidor');
    }
});

// Rota de Compartilhamento
app.get('/share', (req, res) => {
    const { title, date, dest, data } = req.query;
    const pageTitle = title ? `Roteiro: ${title}` : 'Meu Roteiro ddripp';
    const pageDesc = `Confira os detalhes da viagem para ${dest}.`;
    
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const dynamicImageUrl = `${protocol}://${host}/dynamic-cover?dest=${encodeURIComponent(dest||'')}&date=${encodeURIComponent(date||'')}`;

    // SEU SITE NO GITHUB PAGES
    const APP_URL = "https://eduardozbu-ddripp.github.io/ddripp-server/";

    const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta property="og:site_name" content="ddripp">
        <meta property="og:title" content="${pageTitle}">
        <meta property="og:description" content="${pageDesc}">
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
    `;
    res.send(html);
});

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
