# Reddit Market Intelligence Dashboard

A private Streamlit dashboard for collecting archived Reddit conversations,
analyzing engagement and keywords, and conducting contextual research with
Google Gemini.

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
   ```

4. Save the secrets and reboot the app.

The Reddit extraction uses Arctic Shift and does not require Reddit credentials.
Users currently enter a Gemini API key in the private sidebar when they want to
use AI analysis or chat.

## Security

Never commit API keys. Local Streamlit secrets, `.env` files, and common generated
files are excluded through `.gitignore`.
