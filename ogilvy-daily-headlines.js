const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const DIR = path.dirname(__filename);

async function runOgilvyDailyTask() {
  const config = JSON.parse(fs.readFileSync(path.join(DIR, 'ogilvy-config.json'), 'utf8'));

  let scrapedContent = [];
  let excludedSites = [];

  /**
   * Extrae metadata (autor, fecha, descripción) desde el contexto del elemento (tarjeta padre).
   * Estrategia: card context → JSON-LD → meta tags → N/A
   */
  const extractMetadataFromCard = ($, elem, link, siteUrl) => {
    let author = 'N/A';
    let publishDate = 'N/A';
    let description = '';

    const $elem = $(elem);

    // 1. Buscar el contenedor padre tipo "tarjeta de artículo"
    const card = $elem.closest(
      'article, [class*="article"], [class*="post"], [class*="story"], [class*="item"], [class*="card"], [class*="entry"], li'
    );
    const ctx = card.length ? card : $elem.parent();

    // 2. Fecha: buscar <time datetime> en la tarjeta
    ctx.find('time[datetime]').each((i, t) => {
      if (publishDate !== 'N/A') return false;
      const dt = $(t).attr('datetime');
      if (dt) {
        try {
          const d = new Date(dt);
          if (!isNaN(d) && d.getFullYear() >= 2020 && d.getFullYear() <= new Date().getFullYear() + 1) {
            publishDate = d.toISOString().split('T')[0];
          }
        } catch (e) {}
      }
    });

    // 3. Fecha: buscar en elementos con clases date/time/published
    if (publishDate === 'N/A') {
      ctx.find('[class*="date"], [class*="time-ago"], [itemprop="datePublished"], [data-date], [class*="published"], [class*="timestamp"]').each((i, el) => {
        if (publishDate !== 'N/A') return false;
        const dt = $(el).attr('datetime') || $(el).attr('data-date') || $(el).attr('content');
        const txt = dt || $(el).text().trim();
        if (txt && txt.length < 50) {
          try {
            const d = new Date(txt);
            if (!isNaN(d) && d.getFullYear() >= 2020 && d.getFullYear() <= new Date().getFullYear() + 1) {
              publishDate = d.toISOString().split('T')[0];
            }
          } catch (e) {}
        }
      });
    }

    // 4. Autor: buscar en elementos con clases author/byline en la tarjeta
    ctx.find('[rel="author"], [class*="author"], [class*="byline"], [itemprop="author"], .author, [class*="writer"]').each((i, el) => {
      if (author !== 'N/A') return false;
      const text = $(el).text().trim().replace(/^(By|Por|by|por)\s+/i, '').trim();
      if (text && text.length > 1 && text.length < 100 && !text.includes('\n') && !text.includes('  ')) {
        author = text;
      }
    });

    // 5. Descripción: buscar párrafos en la tarjeta
    if (!description) {
      ctx.find('p, [class*="desc"], [class*="excerpt"], [class*="summary"], [class*="teaser"], [class*="lead"]').each((i, el) => {
        if (description) return false;
        const text = $(el).text().trim();
        if (text.length > 40 && text.length < 500) {
          description = text;
        }
      });
    }

    // 6. JSON-LD: buscar artículos en el schema estructurado de la página
    if (author === 'N/A' || publishDate === 'N/A') {
      $('script[type="application/ld+json"]').each((_, scriptEl) => {
        if (author !== 'N/A' && publishDate !== 'N/A') return false;
        try {
          const raw = $(scriptEl).html();
          if (!raw) return;
          const data = JSON.parse(raw);
          const items = Array.isArray(data) ? data : (data['@graph'] ? data['@graph'] : [data]);

          for (const item of items) {
            if (!item || !item['@type']) continue;
            const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
            const isArticle = types.some(t =>
              ['Article', 'NewsArticle', 'BlogPosting', 'TechArticle', 'Report', 'WebPage'].includes(t)
            );
            if (!isArticle) continue;

            if (author === 'N/A' && item.author) {
              const a = item.author;
              const extracted = typeof a === 'string' ? a :
                Array.isArray(a) ? (a[0]?.name || a[0] || '') :
                (a.name || '');
              if (extracted && extracted.length > 0 && extracted.length < 100) author = extracted;
            }
            if (publishDate === 'N/A' && item.datePublished) {
              try {
                const d = new Date(item.datePublished);
                if (!isNaN(d) && d.getFullYear() >= 2020) {
                  publishDate = d.toISOString().split('T')[0];
                }
              } catch (e) {}
            }
            if (!description && item.description) description = item.description;
          }
        } catch (e) {}
      });
    }

    // 7. Meta tags: fallback último recurso
    if (author === 'N/A') {
      author = $('meta[name="author"]').attr('content') ||
               $('meta[property="article:author"]').attr('content') || 'N/A';
      if (author) author = author.replace(/^(By|Por|by|por)\s+/i, '').trim();
    }
    if (publishDate === 'N/A') {
      const metaDate = $('meta[property="article:published_time"]').attr('content') ||
                       $('meta[name="date"]').attr('content') ||
                       $('meta[name="publish-date"]').attr('content') ||
                       $('meta[property="og:updated_time"]').attr('content');
      if (metaDate) {
        try {
          const d = new Date(metaDate);
          if (!isNaN(d) && d.getFullYear() >= 2020) publishDate = d.toISOString().split('T')[0];
        } catch (e) {}
      }
    }
    if (!description) {
      description = $('meta[name="description"]').attr('content') ||
                    $('meta[property="og:description"]').attr('content') || '';
    }

    // Limpiar valores vacíos
    if (!author || author.trim() === '') author = 'N/A';
    if (!publishDate || publishDate.trim() === '') publishDate = 'N/A';

    return {
      author: author.substring(0, 100),
      publishDate,
      description: description.substring(0, 500),
    };
  };

  for (const siteUrl of config.sitesToMonitor) {
    try {
      console.log(`Buscando en: ${siteUrl}`);

      const response = await axios.get(siteUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
        },
      });
      const html = response.data;
      const $ = cheerio.load(html);

      // Deduplicar URLs dentro de cada sitio para evitar el mismo artículo
      // listado múltiples veces en distintas secciones de la misma página
      const seenLinksThisSite = new Set();

      // Solo h1, h2, h3 — los párrafos generan demasiado ruido en listings
      $('h1, h2, h3').each((i, elem) => {
        const text = $(elem).text().trim();

        // Buscar link: en el heading mismo → padre <a> → contenedor artículo → hermanos del contenedor
        // El último paso resuelve sitios como HBR donde el <a> es hermano del <h2> en un stream-item
        const container = $(elem).closest(
          'article, [class*="stream-item"], [class*="post"], [class*="item"], [class*="card"], [class*="entry"]'
        );

        let link =
          $(elem).find('a[href]').first().attr('href') ||
          $(elem).closest('a[href]').attr('href') ||
          container.find('a[href]').first().attr('href') ||
          $(elem).siblings('a[href]').first().attr('href');

        // Filtrar links que sean navegación genérica (sin path significativo)
        if (link && link !== '#' && !link.startsWith('http')) {
          try {
            link = new URL(link, siteUrl).href;
          } catch (e) {
            link = null;
          }
        }
        if (!link || link === '#') link = null;

        // Descartar si la URL ya fue vista en este sitio (evita duplicados por múltiples secciones)
        if (link && seenLinksThisSite.has(link)) return;
        if (link) seenLinksThisSite.add(link);

        const matchedKeywords = config.keywords.filter(keyword =>
          text.toLowerCase().includes(keyword.toLowerCase())
        );

        if (text.length > 30 && matchedKeywords.length > 0) {
          const { author, publishDate, description } = extractMetadataFromCard($, elem, link, siteUrl);

          scrapedContent.push({
            headline: text,
            source: siteUrl,
            link: link || 'N/A',
            author,
            publishDate,
            keywordsMatched: matchedKeywords,
            description,
          });
        }
      });

      console.log(`  → ${scrapedContent.filter(a => a.source === siteUrl).length} titulares encontrados`);

    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        console.error(`Error ${error.response.status} al buscar en ${siteUrl}:`, error.message);
        excludedSites.push({ url: siteUrl, reason: `Error HTTP ${error.response.status}` });
      } else {
        console.error(`Error al buscar en ${siteUrl}:`, error.message);
        excludedSites.push({ url: siteUrl, reason: `Error genérico: ${error.message}` });
      }
    }
  }

  // Post-procesamiento: eliminar autores que sean publishers/empresas, no personas
  // Heurística 1: si el mismo autor aparece 3+ veces en el mismo sitio, es probablemente el publisher
  const authorCountBySite = {};
  for (const item of scrapedContent) {
    if (item.author !== 'N/A') {
      const key = `${item.source}||${item.author}`;
      authorCountBySite[key] = (authorCountBySite[key] || 0) + 1;
    }
  }
  // Heurística 2: lista de publishers conocidos
  const KNOWN_PUBLISHERS = [
    'condé nast', 'conde nast', 'google llc', 'apple inc', 'microsoft', 'amazon',
    'meta platforms', 'the new york times', 'the verge', 'vox media', 'semrush',
    '@anthropicai', '@linear', 'linear', 'anthropic'
  ];
  for (const item of scrapedContent) {
    if (item.author !== 'N/A') {
      const key = `${item.source}||${item.author}`;
      const isRepeatedPublisher = authorCountBySite[key] >= 3;
      const isKnownPublisher = KNOWN_PUBLISHERS.some(p => item.author.toLowerCase().includes(p));
      if (isRepeatedPublisher || isKnownPublisher) {
        item.author = 'N/A';
      }
    }
  }

  const withAuthor = scrapedContent.filter(a => a.author !== 'N/A').length;
  const withDate = scrapedContent.filter(a => a.publishDate !== 'N/A').length;

  fs.writeFileSync(
    path.join(DIR, 'ogilvy-scraped-data.json'),
    JSON.stringify({ scrapedContent, excludedSites }, null, 2),
    'utf8'
  );
  console.log(`\n✅ Total: ${scrapedContent.length} titulares | Con autor: ${withAuthor} | Con fecha: ${withDate}`);
  console.log(`   Sitios excluidos: ${excludedSites.length} (${excludedSites.map(s => s.url).join(', ')})`);
}

runOgilvyDailyTask().catch(err => {
  console.error('❌ Error crítico:', err.message);
  process.exit(1);
});
