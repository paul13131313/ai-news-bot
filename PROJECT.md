# AI News Global - Telegram Bot

## 概要
多言語AIニュースを自動配信するTelegramチャンネルbot。
RSSからAIニュースを取得 → Claude APIで要約・翻訳 → Telegram Bot APIで各チャンネルに投稿。

## 技術構成
- Cloudflare Workers (cron trigger)
- Claude API (要約・翻訳)
- Telegram Bot API (チャンネル投稿)
- Cloudflare KV (重複排除用)

## 環境変数 (Cloudflare Workers Secrets)
- `TELEGRAM_BOT_TOKEN` - Telegram Bot APIトークン
- `ANTHROPIC_API_KEY` - Claude APIキー

## チャンネル
- @ainews_en_hq (English)
- 今後追加: ja, es, pt, fr, de, ko, ar, hi, id, tr, ru, th, vi...

## デプロイ
```bash
npm install
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler deploy
```

## 手動テスト
```bash
npx wrangler dev
curl http://localhost:8787/test
```
