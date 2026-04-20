/**
 * ogilvy-write-sheets.js
 * Paso 2 del sistema Ogilvy Daily Headlines
 * Lee ogilvy-scraped-data.json, selecciona los 10 mejores titulares
 * y los escribe en Google Sheets automáticamente.
 * 
 * Criterios de selección:
 * - Prioridad a titulares con fecha reciente (hoy o ayer)
 * - Diversidad de fuentes (máx 3 por fuente)
 * - Keywords de alto valor (agentes IA, marketing, eCommerce, automatización)
 * - Descarte de titulares duplicados o sin URL válida
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const DIR = path.dirname(__filename);
const SCRAPED_FILE = path.join(DIR, 'ogilvy-scraped-data.json');
const CREDENTIALS_FILE = path.join(DIR, 'gcp-service-account.json');
const SHEET_ID = '1-PsI_Lb4RniVLeAhE-lk_jBTkJs0cQUwDXxCLP5IrpU';
const SHEET_NAME = 'Revision';
const LOG_FILE = path.join(DIR, 'ogilvy-daily-headlines.log');

// Keywords de alta relevancia para el perfil de Franco.com.co
const HIGH_VALUE_KEYWORDS = [
  'agente', 'agent', 'ai', 'ia', 'inteligencia artificial', 'llm', 'gpt', 'claude', 'gemini',
  'automatización', 'automation', 'ecommerce', 'b2b', 'marketing', 'growth',
  'startup', 'saas', 'openai', 'anthropic', 'google', 'microsoft', 'copilot',
  'mcp', 'agentic', 'machine learning', 'neural', 'modelo', 'model'
];

function log(msg) {
  const ts = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function getTodayBogota() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }); // YYYY-MM-DD
}

function getYesterdayBogota() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

function scoreHeadline(item) {
  let score = 0;
  const headlineLower = (item.headline || '').toLowerCase();
  const keywordsMatched = (item.keywordsMatched || []).length;
  const today = getTodayBogota();
  const yesterday = getYesterdayBogota();

  // Fecha reciente
  if (item.publishDate === today) score += 30;
  else if (item.publishDate === yesterday) score += 20;
  else if (item.publishDate && item.publishDate !== 'N/A') score += 5;

  // Keywords del config
  score += keywordsMatched * 10;

  // Keywords de alto valor
  HIGH_VALUE_KEYWORDS.forEach(kw => {
    if (headlineLower.includes(kw)) score += 8;
  });

  // Tiene autor
  if (item.author && item.author !== 'N/A') score += 5;

  // URL válida (no es solo el dominio raíz)
  if (item.link && item.link.split('/').length > 4) score += 5;

  // Penalizar titulares muy cortos o genéricos
  if ((item.headline || '').length < 20) score -= 20;

  return score;
}

function inferTopic(item) {
  const text = (item.headline + ' ' + (item.description || '')).toLowerCase();
  
  if (text.includes('agent') || text.includes('agente') || text.includes('mcp') || text.includes('agentic')) return 'Agentes IA';
  if (text.includes('ecommerce') || text.includes('checkout') || text.includes('stripe') || text.includes('commerce')) return 'eCommerce';
  if (text.includes('marketing') || text.includes('seo') || text.includes('ads') || text.includes('publicidad')) return 'Marketing Digital';
  if (text.includes('startup') || text.includes('funding') || text.includes('arr') || text.includes('venture')) return 'Startups / Negocios';
  if (text.includes('openai') || text.includes('anthropic') || text.includes('google') || text.includes('microsoft') || text.includes('llm') || text.includes('gpt') || text.includes('claude') || text.includes('gemini')) return 'IA Generativa';
  if (text.includes('seguridad') || text.includes('security') || text.includes('hack') || text.includes('cyber')) return 'Seguridad';
  if (text.includes('cloud') || text.includes('nube') || text.includes('aws') || text.includes('azure')) return 'Cloud / Infraestructura';
  if (text.includes('regulaci') || text.includes('law') || text.includes('legal') || text.includes('policy')) return 'Regulación IA';
  if (text.includes('robot') || text.includes('hardware') || text.includes('chip') || text.includes('nvidia')) return 'Hardware / Chips';
  
  // Usar keywords matched del config
  const kw = (item.keywordsMatched || []);
  if (kw.length > 0) return kw[0];
  
  return 'Tecnología';
}

async function main() {
  log('🚀 Iniciando Paso 2: Selección y escritura en Google Sheets');

  // Leer datos scrapeados
  if (!fs.existsSync(SCRAPED_FILE)) {
    log('❌ No se encontró ogilvy-scraped-data.json');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(SCRAPED_FILE, 'utf8'));
  const headlines = data.scrapedContent || [];
  log(`📊 Titulares disponibles: ${headlines.length}`);

  // Deduplicar por URL
  const seen = new Set();
  const unique = headlines.filter(item => {
    if (!item.link || seen.has(item.link)) return false;
    seen.add(item.link);
    return true;
  });
  log(`📋 Titulares únicos: ${unique.length}`);

  // Filtrar los que tienen headline y URL válida
  const valid = unique.filter(item => 
    item.headline && 
    item.headline.length > 15 && 
    item.link && 
    item.link.startsWith('http')
  );
  log(`✅ Titulares válidos: ${valid.length}`);

  // Puntuar y ordenar
  const scored = valid.map(item => ({ ...item, score: scoreHeadline(item) }));
  scored.sort((a, b) => b.score - a.score);

  // Seleccionar top 10 con diversidad de fuente (máx 3 por dominio)
  const sourceCounts = {};
  const selected = [];

  for (const item of scored) {
    if (selected.length >= 10) break;
    
    const domain = new URL(item.source || item.link).hostname;
    sourceCounts[domain] = (sourceCounts[domain] || 0) + 1;
    
    if (sourceCounts[domain] <= 3) {
      selected.push(item);
    }
  }

  log(`🏆 Seleccionados: ${selected.length} titulares`);
  selected.forEach((item, i) => {
    log(`  ${i+1}. [Score:${item.score}] [${inferTopic(item)}] ${item.headline.substring(0, 70)}`);
  });

  // Escribir en Google Sheets
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const today = getTodayBogota();
  const rows = selected.map(item => [
    item.headline,
    item.link,
    item.publishDate !== 'N/A' ? item.publishDate : '',
    item.author !== 'N/A' ? item.author : '',
    today,
    inferTopic(item)
  ]);

  // Verificar si la hoja ya tiene encabezados
  const existingData = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A1:F1`,
  });
  const hasHeaders = existingData.data.values && existingData.data.values.length > 0;

  if (!hasHeaders) {
    // Si la hoja está vacía, agregar encabezados primero
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['Encabezado', 'URL', 'Fecha de Publicación', 'Autor', 'Fecha de Generación', 'Tema (Filtro)']]
      }
    });
    log('📋 Encabezados creados en hoja nueva');
  }

  // Agregar filas al final (sin borrar lo existente)
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows }
  });

  log('✅ Google Sheets actualizado correctamente (filas agregadas)');

  // Generar resumen para Telegram
  const summary = selected.map((item, i) => 
    `${i+1}. ${item.headline}\n${item.link}`
  ).join('\n\n');

  const fullSummary = `📰 Ogilvy Daily Headlines – ${today}\n\nTop 10 titulares seleccionados:\n\n${summary}`;

  log('📱 Enviando resumen a Telegram...');

  // Enviar a Telegram vía openclaw
  const { execSync } = require('child_process');
  try {
    const escapedMsg = fullSummary.replace(/'/g, "'\''");
    execSync(`/home/smith/.npm-global/bin/openclaw agent --agent main -m 'Entrega este mensaje exacto a Telegram sin modificar nada, sin razonar, sin agregar texto: ${escapedMsg}' --channel telegram --deliver`, {
      timeout: 60000,
      stdio: 'pipe'
    });
    log('✅ Resumen enviado a Telegram');
  } catch (e) {
    log(`⚠️ Error enviando a Telegram: ${e.message}`);
  }

  log('✅ Proceso completado');
  
  console.log('\n===== RESUMEN =====');
  console.log(fullSummary);
  console.log('===================\n');
}

main().catch(err => {
  log(`❌ Error crítico: ${err.message}`);
  console.error(err);
  process.exit(1);
});
