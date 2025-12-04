const express = require('express');
const { createCanvas, loadImage } = require('canvas'); 
const fetch = require('node-fetch'); 
const app = express();

const PORT = process.env.PORT || 3000;

// O servidor pega a chave do cofre do Render automaticamente
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY; 

const THEME = {
    fontMain: 'bold 70px sans-serif',
    fontDate: '30px sans-serif',
    colorText: '#ffffff',
    overlayColor: 'rgba(0, 0, 0, 0.5)', 
    logoText: 'ddripp' 
};

const backgroundCache = new Map();

// --- GERAR IMAGEM COM GEMINI (IMAGEN 3) ---
async function generateAIImage(prompt) {
    if (!GOOGLE_API_KEY) {
        console.error("ERRO: Chave de API não configurada no Render!");
        return null;
    }
    console.log(`🎨 Criando imagem com Gemini para: "${prompt}"...`);
    
    // Endpoint do Imagen 3 via API Generative Language
    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${GOOGLE_API_KEY}`;
    
    const payload = {
        instances: [{ prompt: `Beautiful travel photography of ${prompt}, cinematic lighting, 8k resolution, highly detailed, photorealistic` }],
        parameters: { sampleCount: 1, aspectRatio: "16:9" }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(await response.text());

        const data = await response.json();
        // Imagen retorna Base64
        const base64Image = data.predictions[0].bytesBase64Encoded;
        return Buffer.from(base64Image, 'base64');

    } catch (error) {
        console.error("Falha na geração Gemini:", error.message);
        return null; 
    }
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

        // Cache Inteligente
        const cacheKey = `gemini_img_${destination.toLowerCase()}`;
        let image;

        if (backgroundCache.has(cacheKey)) {
            console.log(`⚡ Cache Hit: ${destination}`);
            image = await loadImage(backgroundCache.get(cacheKey));
        } else {
            // Tenta gerar com Gemini
            let imageBuffer = await generateAIImage(destination);
            
            // Fallback para Unsplash se o Gemini falhar
            if (!imageBuffer) {
                console.log("⚠️ Fallback para Unsplash");
                const unsplashUrl = `https://source.unsplash.com/1200x630/?${encodeURIComponent(destination)},travel`;
                const resp = await fetch(unsplashUrl);
                imageBuffer = await resp.buffer();
            }

            backgroundCache.set(cacheKey, imageBuffer);
            image = await loadImage(imageBuffer);
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
        
        // Texto dinâmico
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
        ctx.fillText('Roteiro Gerado com IA', width / 2, height - 40);

        res.set('Content-Type', 'image/png');
        canvas.createPNGStream().pipe(res);

    } catch (error) {
        console.error(error);
        res.status(500).send('Erro ao gerar capa');
    }
});

// Rota de Compartilhamento (Card WhatsApp)
app.get('/share', (req, res) => {
    const { title, date, dest, data } = req.query;
    const pageTitle = title ? `Roteiro: ${title}` : 'Meu Roteiro ddripp';
    const pageDesc = `Confira os detalhes da viagem para ${dest || 'um destino incrível'}.`;
    
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const dynamicImageUrl = `${protocol}://${host}/dynamic-cover?dest=${encodeURIComponent(dest||'')}&date=${encodeURIComponent(date||'')}`;

    // SEU LINK DO GITHUB PAGES
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
        <style>
            body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #f0f9ff; color: #0c4a6e; }
            .loader { border: 4px solid #f3f3f3; border-top: 4px solid #3B82F6; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; }
        </style>
    </head>
    <body>
        <div class="loader"></div>
        <h2 style="margin-top:20px">Abrindo roteiro...</h2>
        <script>
            setTimeout(() => {
                window.location.href = "${APP_URL}?data=${data}";
            }, 1000);
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
