# Reddit Market Intelligence Dashboard

A private Streamlit dashboard for collecting archived Reddit conversations,
analyzing engagement and keywords, and conducting contextual research with
Google Gemini.

## Search modes 

- **Community Search** retrieves archived posts from one specific subreddit.
- **Keyword Search** searches archived posts across communities using one keyword
  or up to five comma-separated keywords with AND/OR matching. 
 
## Run locally

```bash
pip install -r requirements.txt
streamlit run app.py
```

Create `.streamlit/secrets.toml` before starting the app:

```toml
APP_PASSWORD = "choose-a-strong-team-password"
```

## Deploy on Streamlit Community Cloud

1. Open [share.streamlit.io](https://share.streamlit.io/) and sign in with GitHub.
2. Create an app from this repository and select `app.py` as the entry point.
3. Open the app's **Settings → Secrets** and add:

   ```toml
   APP_PASSWORD = "choose-a-strong-team-password"
   GEMINI_API_KEY = "your-gemini-key"
   # Model priority order. Falls back to the next on rate limit/overload/unknown model.
   GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]
   ```

4. Save the secrets and reboot the app.

Reddit extraction uses the Arctic Shift and PullPush public archives and does
not require Reddit credentials.
The Gemini key is read from Streamlit secrets (`GEMINI_API_KEY`). AI requests try
each model in order and fall back to the next when one hits its quota.

## Security

Never commit API keys. Local Streamlit secrets, `.env` files, and common generated
files are excluded through `.gitignore`.


## Next.js version (Vercel)

The Next.js rewrite lives at the repo root (`app/`, `components/`, `lib/`) with the same features as the Streamlit app: community search, keyword search, filters, CSV export, keyword analytics, AI strategist and research chat with Gemini model fallback.

Run locally:

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

Deploy: import the repo into Vercel (framework: Next.js) and add these environment variables:

| Variable | Purpose |
| --- | --- |
| `APP_PASSWORD` | Team password for the login screen |
| `GEMINI_API_KEY` | Gemini key (server-side only) |
| `GEMINI_MODELS` | Optional. Comma-separated model priority list, falls back on quota/overload |

Extraction routes allow up to 300 seconds (`maxDuration`), which needs a Vercel Pro plan.

### Keyword search blocked on Vercel (HTTP 403 "Just a moment...")

PullPush sits behind Cloudflare, which can challenge Vercel's server IPs. Deploy `cloudflare-worker/pullpush-relay.js` as a Cloudflare Worker, set a `RELAY_KEY` secret on it, then add `PULLPUSH_PROXY_URL` (the Worker URL) and `PULLPUSH_PROXY_KEY` (the same secret) in Vercel and redeploy.
