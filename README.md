# 🚀 Replit Setup Guide

## Quick Start

### 1. Import to Replit
1. Go to [replit.com](https://replit.com)
2. Click **"Create Repl"**
3. Choose **"Import from GitHub"**
4. Paste your repository URL

### 2. Configure Agent
Create agent `.env` files in `agents/` directory:
```bash
# agents/bot1.env
API_KEY=your_api_key_here
AGENT_NAME=MyBot
AGGRO_MODE=balanced
WALLET_ADDRESS=0xYourWalletAddress
```

### 3. Run
Click **"Run"** - starts backend (3000) and frontend (5173)

## Commands
- `npm run start` - Both servers
- `npm run dev` - Frontend only
- `npm run server` - Backend only
