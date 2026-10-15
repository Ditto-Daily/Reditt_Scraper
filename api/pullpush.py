"""Vercel Python function: relays PullPush submission searches for the Next.js app.

Uses only the standard library and mimics the python-requests client the original
Streamlit app used, because PullPush's Cloudflare layer treated that as a normal client.
Callers must send x-relay-key = HMAC-SHA256(APP_PASSWORD, "reddit-intel-session-v1"),
the same value as the app's session cookie, so this endpoint is not an open proxy.
"""

import hashlib
import hmac
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlsplit

UPSTREAM = "https://api.pullpush.io/reddit/search/submission/"


def expected_key() -> str:
    password = os.environ.get("APP_PASSWORD", "")
    if not password:
        return ""
    return hmac.new(password.encode(), b"reddit-intel-session-v1", hashlib.sha256).hexdigest()


class handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: bytes, content_type: str = "application/json") -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        expected = expected_key()
        provided = self.headers.get("x-relay-key", "")
        if not expected or not hmac.compare_digest(provided, expected):
            self._send(401, b'{"error":"Unauthorized"}')
            return

        query = urlsplit(self.path).query
        request = urllib.request.Request(
            f"{UPSTREAM}?{query}",
            headers={
                "User-Agent": "python-requests/2.34.2",
                "Accept-Encoding": "gzip, deflate",
                "Accept": "application/json",
                "Connection": "keep-alive",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                body = response.read()
                if response.headers.get("Content-Encoding") == "gzip":
                    import gzip

                    body = gzip.decompress(body)
                self._send(response.status, body, response.headers.get("Content-Type", "application/json"))
        except urllib.error.HTTPError as error:
            body = error.read()
            if error.headers.get("Content-Encoding") == "gzip":
                import gzip

                body = gzip.decompress(body)
            self._send(error.code, body, error.headers.get("Content-Type", "text/plain"))
        except Exception as error:  # network failure or timeout
            self._send(502, ('{"error":"%s"}' % str(error).replace('"', "'")).encode())
