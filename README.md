# PhD Finder — Biomedical Engineering

An AI-powered web app that searches for open PhD positions in Biomedical Engineering worldwide using Claude AI with live web search.

## Project structure

```
phd-finder/
├── api/
│   └── search.js       ← Serverless API (keeps your API key secret)
├── public/
│   └── index.html      ← Frontend UI
├── vercel.json         ← Vercel routing config
└── README.md
```

---

## Deploy to Vercel (free, ~3 minutes)

### Step 1 — Get an Anthropic API key
1. Go to https://console.anthropic.com
2. Sign up / log in
3. Navigate to **API Keys** → **Create Key**
4. Copy the key (starts with `sk-ant-...`)

### Step 2 — Push to GitHub
1. Create a new repository at https://github.com/new
2. Upload all these files (or use Git):
   ```bash
   git init
   git add .
   git commit -m "initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/phd-finder.git
   git push -u origin main
   ```

### Step 3 — Deploy on Vercel
1. Go to https://vercel.com and sign in with GitHub
2. Click **Add New → Project**
3. Import your `phd-finder` repository
4. Click **Deploy** (leave all settings as default)

### Step 4 — Add your API key
1. After deployment, go to your project in Vercel dashboard
2. Click **Settings → Environment Variables**
3. Add a new variable:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** `sk-ant-...` (your key from Step 1)
4. Click **Save**
5. Go to **Deployments** → click the three dots on the latest → **Redeploy**

### Done!
Vercel gives you a public URL like `https://phd-finder-xyz.vercel.app`.
Share it with anyone — no login required.

---

## Customization

### Change the default search topics
Edit the `<span class="chip">` elements in `public/index.html`.

### Adjust number of results
In `api/search.js`, change `up to 8 positions` in the system prompt to any number.

### Add more filters
Add a `<select>` in the HTML and pass it in the fetch body. Then reference it in the system prompt inside `api/search.js`.

---

## Cost estimate
Each search call uses roughly 2,000–4,000 output tokens (Claude Sonnet).
At current pricing (~$3 / million output tokens), that's about $0.01 per search.
The free Anthropic tier covers initial testing.

---

## Tech stack
- **Frontend:** Vanilla HTML/CSS/JS (no build step needed)
- **Backend:** Vercel Edge Function (Node.js)
- **AI:** Claude claude-sonnet-4-20250514 with `web_search_20250305` tool
- **Hosting:** Vercel (free tier)
