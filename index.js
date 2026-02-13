// ============================================
// AI News Global - Telegram Bot
// Cloudflare Worker
// ============================================

// --- Configuration ---

const RSS_FEEDS = [
  { name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
  { name: 'The Verge AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml' },
  { name: 'VentureBeat AI', url: 'https://venturebeat.com/category/ai/feed/' },
  { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/' },
  { name: 'Ars Technica AI', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab' },
];

// Telegram channels per language
// Add more as you create them
const CHANNELS = [
  { lang: 'English', code: 'en', chatId: '@ainews_en_hq' },
  // { lang: '日本語', code: 'ja', chatId: '@ainews_ja_hq' },
  // { lang: 'Español', code: 'es', chatId: '@ainews_es_hq' },
  // { lang: 'Português', code: 'pt', chatId: '@ainews_pt_hq' },
  // { lang: 'Français', code: 'fr', chatId: '@ainews_fr_hq' },
  // { lang: 'Deutsch', code: 'de', chatId: '@ainews_de_hq' },
  // { lang: '한국어', code: 'ko', chatId: '@ainews_ko_hq' },
  // { lang: 'العربية', code: 'ar', chatId: '@ainews_ar_hq' },
  // { lang: 'हिन्दी', code: 'hi', chatId: '@ainews_hi_hq' },
  // { lang: 'Bahasa Indonesia', code: 'id', chatId: '@ainews_id_hq' },
  // { lang: 'Türkçe', code: 'tr', chatId: '@ainews_tr_hq' },
  // { lang: 'Русский', code: 'ru', chatId: '@ainews_ru_hq' },
];

const MAX_NEWS_ITEMS = 5;

// --- Main Handler ---

export default {
  // Cron trigger handler
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runNewsBot(env));
  },

  // HTTP handler for manual testing
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/test') {
      ctx.waitUntil(runNewsBot(env));
      return new Response('News bot triggered! Check your Telegram channels.', {
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', channels: CHANNELS.length }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('AI News Global Bot\n\nGET /test - Trigger news\nGET /health - Health check', {
      headers: { 'Content-Type': 'text/plain' },
    });
  },
};

// --- Core Logic ---

async function runNewsBot(env) {
  try {
    console.log('🚀 Starting news bot...');

    // 1. Fetch RSS feeds
    const articles = await fetchAllFeeds();
    console.log(`📰 Fetched ${articles.length} articles total`);

    if (articles.length === 0) {
      console.log('⚠️ No articles found, skipping');
      return;
    }

    // 2. Deduplicate (skip articles we've already posted)
    const newArticles = await filterNewArticles(articles, env);
    console.log(`🆕 ${newArticles.length} new articles after dedup`);

    if (newArticles.length === 0) {
      console.log('✅ No new articles, skipping');
      return;
    }

    // 3. Select top articles and summarize with Claude
    const topArticles = newArticles.slice(0, MAX_NEWS_ITEMS);
    const summary = await summarizeWithClaude(topArticles, env);
    console.log('🤖 Claude summary generated');

    // 4. Translate and post to each channel
    for (const channel of CHANNELS) {
      try {
        let message;
        if (channel.code === 'en') {
          message = summary;
        } else {
          message = await translateWithClaude(summary, channel.lang, env);
        }
        await postToTelegram(channel.chatId, message, env);
        console.log(`✅ Posted to ${channel.chatId}`);

        // Small delay to avoid rate limits
        await sleep(1000);
      } catch (err) {
        console.error(`❌ Failed to post to ${channel.chatId}:`, err.message);
      }
    }

    // 5. Mark articles as posted
    for (const article of topArticles) {
      await markAsPosted(article, env);
    }

    console.log('🎉 News bot completed successfully');
  } catch (err) {
    console.error('💥 News bot error:', err);
  }
}

// --- RSS Fetching ---

async function fetchAllFeeds() {
  const allArticles = [];

  const results = await Promise.allSettled(
    RSS_FEEDS.map(feed => fetchFeed(feed))
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      allArticles.push(...result.value);
    }
  }

  // Sort by date (newest first) and remove duplicates by title similarity
  allArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  return deduplicateByTitle(allArticles);
}

async function fetchFeed(feed) {
  try {
    const response = await fetch(feed.url, {
      headers: { 'User-Agent': 'AI-News-Global-Bot/1.0' },
    });

    if (!response.ok) {
      console.warn(`⚠️ Feed ${feed.name} returned ${response.status}`);
      return [];
    }

    const xml = await response.text();
    return parseRSS(xml, feed.name);
  } catch (err) {
    console.warn(`⚠️ Feed ${feed.name} error:`, err.message);
    return [];
  }
}

function parseRSS(xml, sourceName) {
  const articles = [];

  // Match <item> or <entry> blocks
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>|<entry[^>]*>([\s\S]*?)<\/entry>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const content = match[1] || match[2];

    const title = extractTag(content, 'title');
    const link = extractLink(content);
    const pubDate = extractTag(content, 'pubDate') || extractTag(content, 'published') || extractTag(content, 'updated');
    const description = extractTag(content, 'description') || extractTag(content, 'summary') || '';

    if (title && link) {
      articles.push({
        title: cleanHTML(title),
        link,
        pubDate: pubDate || new Date().toISOString(),
        description: cleanHTML(description).slice(0, 500),
        source: sourceName,
      });
    }
  }

  return articles;
}

function extractTag(content, tagName) {
  // Handle CDATA
  const regex = new RegExp(
    `<${tagName}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tagName}>`,
    'i'
  );
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

function extractLink(content) {
  // Try <link>url</link>
  const linkTag = content.match(/<link[^>]*>([^<]+)<\/link>/i);
  if (linkTag) return linkTag[1].trim();

  // Try <link href="url" />
  const linkAttr = content.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i);
  if (linkAttr) return linkAttr[1].trim();

  return null;
}

function cleanHTML(str) {
  return str
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function deduplicateByTitle(articles) {
  const seen = new Set();
  return articles.filter(article => {
    const key = article.title.toLowerCase().slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// --- KV Deduplication ---

async function filterNewArticles(articles, env) {
  if (!env.NEWS_KV) return articles; // Skip if KV not configured

  const newArticles = [];
  for (const article of articles) {
    const key = `posted:${hashString(article.title)}`;
    const exists = await env.NEWS_KV.get(key);
    if (!exists) {
      newArticles.push(article);
    }
  }
  return newArticles;
}

async function markAsPosted(article, env) {
  if (!env.NEWS_KV) return;

  const key = `posted:${hashString(article.title)}`;
  // Expire after 7 days
  await env.NEWS_KV.put(key, '1', { expirationTtl: 60 * 60 * 24 * 7 });
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// --- Claude API ---

async function summarizeWithClaude(articles, env) {
  const articleList = articles
    .map((a, i) => `${i + 1}. [${a.source}] ${a.title}\nURL: ${a.link}\nSummary: ${a.description}`)
    .join('\n\n');

  const prompt = `You are an AI news curator for a Telegram channel. Given these AI-related articles, create a concise news digest in English.

Format each news item as:
🔹 **Headline** (rewritten to be concise and engaging)
Brief 2-3 sentence summary of the key point.
🔗 Read more: [URL]

At the top, add today's date and a brief greeting like:
🤖 **AI News Daily** - [Date]

At the bottom, add:
---
📢 Follow @ainews_en_hq for daily AI updates

Keep the total message under 4000 characters (Telegram limit).
Use clear, accessible language. No jargon.
Do NOT use markdown headers (#). Only use bold (**) for emphasis.

Here are today's articles:

${articleList}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

async function translateWithClaude(englishMessage, targetLang, env) {
  const prompt = `Translate this Telegram channel news post to ${targetLang}. 
Keep the exact same formatting (emojis, bold, links). 
Do not add or remove any content. 
Translate naturally, not literally.
Replace the channel handle at the bottom with the appropriate language version.

${englishMessage}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude translate error: ${response.status} ${err}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// --- Telegram API ---

async function postToTelegram(chatId, text, env) {
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Telegram API error: ${response.status} ${err}`);
  }

  return response.json();
}

// --- Utilities ---

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
