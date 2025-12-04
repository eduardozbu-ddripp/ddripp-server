const express = require('express');
const { createCanvas, loadImage } = require('canvas'); 
const fetch = require('node-fetch'); 
const app = express();

const PORT = process.env.PORT || 3000;

// --- CONFIGURAÇÕES ---
// ⚠️ IMPORTANTE: Em produção real, use Variáveis de Ambiente.
// Para facilitar agora, cole sua chave aqui entre aspas.
const GOOGLE_API_KEY = "AIzaSyBsLkwr1JTIjQHkoCwARVG5O6hdZRyPtl0"; 

const THEME = {
    fontMain: 'bold 70px sans-serif',
    fontDate: '30px sans-serif',
    colorText: '#ffffff',
    overlayColor: 'rgba(0, 0, 0, 0.4)', 
    logoText: 'ddripp' 
};

// Cache em memória (RAM)
const backgroundCache = new Map();

// --- FUNÇÃO: GERAR IMAGEM COM IA (GEMINI/IMAGEN) ---
async function generateAIImage(prompt) {
    console.log(`🎨 Pedindo para a IA pintar: "${prompt}"...`);
    
    // Endpoint do Modelo Imagen 3 (Via API Gemini)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${GOOGLE_API_KEY}`;
    
    const payload = {
        instances: [{ prompt: prompt + ", realistic, cinematic lighting, 8k, high quality travel photography" }],
        parameters: { sampleCount: 1, aspectRatio: "16:9" }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Erro na API Google: ${err}`);
        }

        const data = await response.json();
        // A imagem vem em Base64
        const base64Image = data.predictions[0].bytesBase64Encoded;
        return Buffer.from(base64Image, 'base64');

    } catch (error) {
        console.error("Falha na geração IA:", error.message);
        return null; // Retorna null para usar fallback
    }
}

// --- ROTA GERADORA DE IMAGEM ---
app.get('/dynamic-cover', async (req, res) => {
    try {
        const { dest, date } = req.query;
        const destination = dest || 'Viagem';
        const dateText = date || '';

        const width = 1200;
        const height = 630;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // 1. Busca ou Gera o Fundo
        const cacheKey = `ia_img_${destination.toLowerCase()}`;
        let image;

        if (backgroundCache.has(cacheKey)) {
            console.log(`⚡ Cache Hit: Recuperando imagem de ${destination}`);
            image = await loadImage(backgroundCache.get(cacheKey));
        } else {
            console.log(`🐢 Cache Miss: Iniciando geração para ${destination}`);
            
            // Tenta gerar com IA
            let imageBuffer = await generateAIImage(destination);
            
            // Se a IA falhar (ou chave inválida), usa Unsplash como estepe
            if (!imageBuffer) {
                console.log("⚠️ Usando Unsplash como fallback");
                const unsplashUrl = `https://source.unsplash.com/1200x630/?${encodeURIComponent(destination)},travel`;
                const resp = await fetch(unsplashUrl);
                imageBuffer = await resp.buffer();
            }

            // Salva no cache e carrega
            backgroundCache.set(cacheKey, imageBuffer);
            image = await loadImage(imageBuffer);
        }

        // 2. Desenha o fundo
        ctx.drawImage(image, 0, 0, width, height);

        // 3. Aplica a Identidade Visual ddripp
        ctx.fillStyle = THEME.overlayColor;
        ctx.fillRect(0, 0, width, height);

        // Logo
        ctx.fillStyle = '#3B82F6'; 
        ctx.font = 'bold 40px sans-serif';
        ctx.fillText('ddripp', 50, 80);

        // Texto Destino
        ctx.fillStyle = THEME.colorText;
        ctx.textAlign = 'center';
        
        // Ajuste dinâmico de fonte para nomes longos
        let fontSize = 70;
        ctx.font = `bold ${fontSize}px sans-serif`;
        while (ctx.measureText(destination.toUpperCase()).width > width - 100 && fontSize > 30) {
            fontSize -= 5;
            ctx.font = `bold ${fontSize}px sans-serif`;
        }
        
        ctx.fillText(destination.toUpperCase(), width / 2, height / 2);

        // Data
        ctx.font = THEME.fontDate;
        ctx.fillText(`📅 ${dateText}`, width / 2, (height / 2) + 60);

        // Rodapé
        ctx.font = 'italic 20px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText('Roteiro Personalizado via Gemini AI', width / 2, height - 40);

        res.set('Content-Type', 'image/png');
        canvas.createPNGStream().pipe(res);

    } catch (error) {
        console.error(error);
        res.status(500).send('Erro interno');
    }
});

// --- ROTA DE COMPARTILHAMENTO ---
app.get('/share', (req, res) => {
    const { title, date, dest, data } = req.query;
    const pageTitle = title ? `Roteiro: ${title}` : 'Meu Roteiro ddripp';
    const pageDesc = `Confira os detalhes da viagem para ${dest || 'um destino incrível'}.`;
    
    // URL dinâmica da imagem (aponta para a rota acima)
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const dynamicImageUrl = `${protocol}://${host}/dynamic-cover?dest=${encodeURIComponent(dest||'')}&date=${encodeURIComponent(date||'')}`;

    // URL do APP (Frontend)
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
        <h2 style="margin-top:20px">Gerando visualização...</h2>
        <script>
            // Redireciona
            setTimeout(() => {
                window.location.href = "${APP_URL}?data=${data}";
            }, 500);
        </script>
    </body>
    </html>
    `;

    res.send(html);
});

app.listen(PORT, () => {
    console.log(`Servidor AI ddripp rodando na porta ${PORT}`);
});
