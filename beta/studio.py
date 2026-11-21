"""Private loopback UI for the portfolio. GitHub CLI handles browser sign-in and the OS keychain."""
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
BIN = Path(sys.executable).parent if getattr(sys, "frozen", False) else ROOT
REPO = "repos/Alexeyhehey/anastasia-aistova"
FILES = {
    "": ("add-series.html", "text/html; charset=UTF-8"),
    "studio.css": ("studio.css", "text/css"),
    "studio-map.svg": ("studio-map.svg", "image/svg+xml"),
    "img/dims.js": ("img/dims.js", "text/javascript"),
    "studio-api.js": ("studio-api.js", "text/javascript"),
    "prepare-series.js": ("prepare-series.js", "text/javascript"),
}
RULES = {
    "GET": r"/(?:git/ref/heads/main|git/commits/[a-f0-9]{40}|contents/beta/catalog\.js\?ref=[a-f0-9]{40})",
    "POST": r"/git/(?:blobs|trees|commits)",
    "PATCH": r"/git/refs/heads/main",
}

class Studio(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def respond(self, status, data=b"", mime="application/json"):
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        self.end_headers()
        self.wfile.write(data)

    def handle_request(self):
        if self.headers.get("Host") != self.server.address:
            return self.respond(403)
        if self.command == "GET" and self.path.startswith(self.server.root):
            key = urlsplit(self.path).path[len(self.server.root):]
            item = FILES.get(key)
            if item:
                return self.respond(200, (ROOT / item[0]).read_bytes(), item[1])
        path = self.path.removeprefix("/api")
        if (not self.path.startswith("/api/") or
                self.headers.get("X-Studio-Session") != self.server.secret or
                self.headers.get("Origin", self.server.origin) != self.server.origin or
                not re.fullmatch(RULES[self.command], path)):
            return self.respond(403)
        length = int(self.headers.get("Content-Length", "0"))
        if length < 0 or length > 24 * 1024 * 1024:
            return self.respond(413)
        data = self.rfile.read(length) if length else None
        if self.command == "PATCH" and json.loads(data).get("force") is not False:
            return self.respond(400)
        cmd = [self.server.gh, "api", "--hostname", "github.com", "--method", self.command,
               "--include", REPO + path]
        if data is not None:
            cmd += ["--input", "-"]
        try:
            proc = subprocess.run(cmd, input=data, capture_output=True, timeout=100)
            headers, sep, body = proc.stdout.replace(b"\r\n", b"\n").partition(b"\n\n")
            status = re.match(rb"HTTP/\S+ (\d{3})", headers)
            if status and sep:
                return self.respond(int(status[1]), body)
        except (OSError, subprocess.TimeoutExpired):
            pass
        return self.respond(502)

    do_GET = do_POST = do_PATCH = handle_request

def main():
    installed = BIN / "gh.exe"
    gh = str(installed) if installed.is_file() else shutil.which("gh")
    if not gh:
        raise RuntimeError("Установите GitHub CLI с cli.github.com и снова откройте студию.")
    if subprocess.run([gh, "auth", "status", "--hostname", "github.com"], capture_output=True).returncode:
        print("Войдите в аккаунт GitHub, у которого есть доступ к портфолио. Следуйте подсказкам GitHub.", flush=True)
        subprocess.run([gh, "auth", "login", "--hostname", "github.com", "--web", "--git-protocol", "https"], check=True)
    with ThreadingHTTPServer(("127.0.0.1", 0), Studio) as server:
        server.gh = gh
        server.address = "127.0.0.1:" + str(server.server_port)
        server.origin = "http://" + server.address
        server.secret = secrets.token_urlsafe(32)
        server.root = "/studio/" + server.secret + "/"
        url = server.origin + server.root
        print("Бета-студия открыта в браузере. Чтобы завершить работу, закройте это окно.\n" + url, flush=True)
        threading.Timer(.2, webbrowser.open, args=(url,)).start()
        server.serve_forever()

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print("Не удалось открыть студию.", error)
        if sys.stdin.isatty():
            input("Нажмите Enter, чтобы закрыть окно.")
