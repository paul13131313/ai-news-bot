#!/bin/bash
# ============================================
# AI News Global Bot - Setup Script
# Run this with Claude Code
# ============================================

echo "🤖 AI News Global Bot Setup"
echo "=========================="
echo ""

# Step 1: Install dependencies
echo "📦 Installing dependencies..."
npm install

# Step 2: Login to Cloudflare (if not already)
echo ""
echo "☁️ Logging into Cloudflare..."
npx wrangler whoami || npx wrangler login

# Step 3: Create KV namespace
echo ""
echo "📁 Creating KV namespace..."
npx wrangler kv namespace create "NEWS_KV"
echo ""
echo "⚠️  IMPORTANT: Copy the 'id' from above and update wrangler.toml"
echo "   Replace REPLACE_WITH_KV_ID with the actual ID"
echo ""

# Step 4: Set secrets
echo "🔑 Setting secrets..."
echo "   Enter your Telegram Bot Token when prompted:"
npx wrangler secret put TELEGRAM_BOT_TOKEN

echo ""
echo "   Enter your Anthropic API Key when prompted:"
npx wrangler secret put ANTHROPIC_API_KEY

# Step 5: Deploy
echo ""
echo "🚀 Deploying..."
npx wrangler deploy

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Test: curl https://ai-news-bot.<your-subdomain>.workers.dev/test"
echo "   2. Check your Telegram channel for the first post"
echo "   3. Cron will run automatically at 8:00 AM and 6:00 PM JST"
