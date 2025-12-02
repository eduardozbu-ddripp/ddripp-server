const express = require('express');
const { createCanvas, loadImage } = require('canvas'); 
const fetch = require('node-fetch'); 
const crypto = require('crypto'); // Para criar chaves únicas de cache
const app = express();

const PORT = process.env.PORT || 3000;

// --- CONFIGURAÇÕES DA MARCA DDRIPP ---
const THEME = {
    fontMain: 'bold 70px sans-serif',
    fontDate: '30px sans-serif',
    colorText: '#ffffff',
    overlayColor: 'rgba(0, 0, 0, 0.4)', 
    logoText: 'ddripp' 
};

// --- CAMADA DE CACHE (Memória RAM) ---
// Implementando o item 3 do seu PDF: "Cache Inteligente"
// Armazena os buffers das imagens de fundo para não chamar a API/IA repetidamente
const backgroundCache = new Map();

// --- CAMADA DE FUNDO (Seção 3.A do PDF) ---
async function getSmartBackground(destination, weather = 'sunny') {
    // 1. Cria uma chave única para esse cenário (ex: "paris_cloudy")
    const cacheKey = `${destination.toLowerCase()}_${weather.toLowerCase()}`;
    
    // 2. Verifica se já existe no Cache (Cache Hit)
    if (backgroundCache.has(cacheKey)) {
        console.log(`⚡ Cache Hit: Usando imagem salva para ${cacheKey}`);
        return backgroundCache.get(cacheKey);
    }

    // 3. Cache Miss: Busca nova imagem (Simulando Vertex AI com Unsplash)
    console.log(`🐢 Cache Miss: Gerando nova imagem para ${cacheKey}...`);
    const query = encodeURIComponent(`${destination} ${weather} travel`);
    const bgUrl = `https://source.unsplash.com/1200x630/?${query}`;
    
    try {
        const bgResponse = await fetch(bgUrl);
        let bgBuffer;
        
        if (bgResponse.ok) {
            bgBuffer = await bgResponse.buffer();
        } else {
            // Fallback de segurança
            const fallback = await fetch('https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1200&h=630&fit=crop');
            bgBuffer = await fallback.buffer();
        }

        // 4. Salva no Cache para o futuro (Economia Exponencial)
        backgroundCache.set(cacheKey, bgBuffer);
        return bgBuffer;

    } catch (e) {
        console.error("Erro ao buscar imagem:", e);
        // Retorna buffer vazio ou erro controlado em produção
        throw e;
    }
}

// --- ROTA GERADORA DE IMAGEM (A Camada de Identidade) ---
app.get('/dynamic-cover', async (req, res) => {
    try {
        const { dest, date } = req.query;
        const destination = dest || 'Viagem Incrível';
        const dateText = date || 'Data a definir';

        // Configuração do Canvas (1200x630 padrão WhatsApp/OpenGraph)
        const width = 1200;
        const height = 630;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // 1. Obtém o Fundo (Do Cache ou da Web)
        const bgBuffer = await getSmartBackground(destination);
        const image = await loadImage(bgBuffer);
        ctx.drawImage(image, 0, 0, width, height);

        // 2. Aplica a Identidade ddripp (Camada B - Seção 3.B do PDF)
        
        // A. Overlay Escuro
        ctx.fillStyle = THEME.overlayColor;
        ctx.fillRect(0, 0, width, height);

        // B. Logo ddripp
        ctx.fillStyle = '#3B82F6'; 
        ctx.font = 'bold 40px sans-serif';
        ctx.fillText('ddripp', 50, 80);

        // C. Título do Destino
        ctx.fillStyle = THEME.colorText;
        ctx.font = THEME.fontMain;
        ctx.textAlign = 'center';
        ctx.fillText(destination.toUpperCase(), width / 2, height / 2);

        // D. Data
        ctx.font = THEME.fontDate;
        ctx.fillText(`📅 ${dateText}`, width / 2, (height / 2) + 60);

        // E. Rodapé
        ctx.font = 'italic 20px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText('Roteiro Personalizado', width / 2, height - 40);

        // Entrega a imagem final
        res.set('Content-Type', 'image/png');
        canvas.createPNGStream().pipe(res);

    } catch (error) {
        console.error(error);
        res.status(500).send('Erro ao gerar capa');
    }
});

// --- ROTA DE COMPARTILHAMENTO (O Envelopador) ---
app.get('/share', (req, res) => {
    const { title, date, dest, data } = req.query;

    const pageTitle = title ? `Roteiro: ${title}` : 'Meu Roteiro ddripp';
    const pageDesc = `Confira os detalhes da viagem para ${dest || 'um destino incrível'}.`;
    
    // URL dinâmica para a imagem
    const protocol = req.headers['x-forwarded-proto'] || req.protocol; // Importante para HTTPS no Render
    const host = req.get('host');
    const dynamicImageUrl = `${protocol}://${host}/dynamic-cover?dest=${encodeURIComponent(dest || '')}&date=${encodeURIComponent(date || '')}`;

    const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta property="og:site_name" content="ddripp">
        <meta property="og:title" content="${pageTitle}">
        <meta property="og:description" content="${pageDesc}">
        
        <!-- O WhatsApp usa esta meta tag para mostrar a imagem -->
        <meta property="og:image" content="${dynamicImageUrl}">
        <meta property="og:image:width" content="1200">
        <meta property="og:image:height" content="630">
        
        <meta name="twitter:card" content="summary_large_image">
        <title>${pageTitle}</title>
        <style>
            body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #f0f9ff; color: #0c4a6e; }
            .loader { border: 4px solid #f3f3f3; border-top: 4px solid #3B82F6; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; }
            .btn { margin-top: 20px; padding: 10px 20px; background: #3B82F6; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="loader"></div>
        <h2 style="margin-top:20px">Abrindo roteiro...</h2>
        
        <script>
            // REDIRECIONAMENTO PARA O APP
            // Substitua pela URL final do seu Github Pages
            const APP_URL = "https://seu-usuario.github.io/ddripp/ddripp_app.html"; 
            
            // Pequeno delay para garantir que o crawler do WhatsApp leia os meta dados antes do redirect (para usuários reais)
            setTimeout(() => {
                window.location.href = APP_URL + "?data=${data}";
            }, 500);
        </script>
    </body>
    </html>
    `;

    res.send(html);
});

app.listen(PORT, () => {
    console.log(`Fábrica de Capas ddripp rodando na porta ${PORT}`);
});
