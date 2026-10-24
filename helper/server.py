"""Paperlane AWS profile helper. Run explicitly; binds loopback only."""
import argparse
import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

LIMIT = 300_000
MODEL = "global.openai.gpt-6-astra"
LOCK = threading.Lock()


def invoke(payload, instructions):
    import boto3
    from botocore.config import Config
    # Keep profile authentication explicit even when a Bedrock bearer key exists in the shell.
    session = boto3.Session(profile_name=payload["profile"], region_name=payload["region"])
    client = session.client("bedrock-runtime", config=Config(
        connect_timeout=10, read_timeout=100, retries={"max_attempts": 0}))
    return client.converse(
        modelId=MODEL,
        system=[{"text": instructions}],
        messages=[{"role": "user", "content": [{"text": payload["document"]}]}],
        inferenceConfig={"maxTokens": 8192},
        additionalModelRequestFields={"reasoning": {"effort": "low"}},
    )


def consume_challenge(directory, nonce, token):
    if not isinstance(nonce, str) or not re.fullmatch(r"[a-f0-9]{64}", nonce):
        raise ValueError("Invalid challenge")
    path = directory / f"connection-{nonce}.json"
    with PAIR_LOCK:
        now = time.time() * 1000
        for key in list(CONSUMED):
            if CONSUMED[key] <= now:
                del CONSUMED[key]
        key = (str(directory.resolve()), nonce)
        if key in CONSUMED:
            raise ValueError("Challenge already consumed")
        if path.is_symlink() or not path.is_file() or path.stat().st_size > 1024:
            raise ValueError("Invalid challenge file")
        challenge = json.loads(path.read_text())
        now = time.time() * 1000
        if (not isinstance(challenge, dict) or challenge.get("nonce") != nonce
                or not isinstance(challenge.get("proof"), str) or not re.fullmatch(r"[a-f0-9]{64}", challenge["proof"])
                or not isinstance(challenge.get("expiresAt"), (int, float))
                or not now < challenge["expiresAt"] <= now + 125000):
            raise ValueError("Invalid or expired challenge")
        CONSUMED[key] = challenge["expiresAt"]  # Client removes the file through Vault API.
    signature = hmac.new(challenge["proof"].encode(), f"paperlane-pair-v1:{nonce}:{token}".encode(), hashlib.sha256).hexdigest()
    return {"token": token, "signature": signature}


PAIR_LOCK = threading.Lock()
CONSUMED = {}


def handler_type(token, instructions, run_model=invoke, pairing_directory=None):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass  # Never log documents, authorization headers, or model responses.

        def setup(self):
            super().setup()
            self.connection.settimeout(10)

        def reply(self, status, value):
            body = json.dumps(value).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self):
            self.reply(403, {"error": "Browser access is disabled"})

        def do_POST(self):
            if (self.path not in {"/review", "/pair"} or self.headers.get("Origin") is not None
                    or self.headers.get("Host") != "127.0.0.1:27183"):
                return self.reply(403, {"error": "Invalid local request"})
            if self.path == "/review" and not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + token):
                return self.reply(401, {"error": "Pairing token required"})
            if self.headers.get("Content-Type", "").split(";")[0] != "application/json" or self.headers.get("Transfer-Encoding"):
                return self.reply(400, {"error": "JSON required"})
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= (1024 if self.path == "/pair" else LIMIT):
                    return self.reply(413, {"error": "Document too large"})
                payload = json.loads(self.rfile.read(length))
                if self.path == "/pair":
                    if pairing_directory is None or not isinstance(payload, dict) or set(payload) != {"nonce"}:
                        raise ValueError()
                    return self.reply(200, consume_challenge(pairing_directory, payload["nonce"], token))
                if not isinstance(payload, dict) or set(payload) != {"profile", "region", "model", "document"}:
                    raise ValueError()
                if (not isinstance(payload["profile"], str) or not re.fullmatch(r"[\w.-]{1,128}", payload["profile"])
                        or not isinstance(payload["region"], str) or not re.fullmatch(r"[a-z]{2}(?:-[a-z]+)+-\d", payload["region"])
                        or payload["model"] != MODEL or not isinstance(payload["document"], str)
                        or len(payload["document"].encode()) > 240_000):
                    raise ValueError()
            except (ValueError, TypeError, KeyError, OSError):
                return self.reply(400, {"error": "Invalid review request"})
            if not LOCK.acquire(blocking=False):
                return self.reply(429, {"error": "A review is already running"})
            try:
                result = run_model(payload, instructions)
                # Return only the bounded response needed by Paperlane.
                output = {"output": result.get("output"), "stopReason": result.get("stopReason")}
                if len(json.dumps(output).encode()) > 100_000:
                    return self.reply(502, {"error": "Model response too large"})
                self.reply(200, output)
            except Exception as error:
                print("Review failed:", type(error).__name__, "Check AWS login, region, and model access.", flush=True)
                self.reply(502, {"error": "AWS request failed; check the helper terminal"})
            finally:
                LOCK.release()
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--protocol", default=str(Path(__file__).with_name("review-protocol.json")))
    args = parser.parse_args()
    try:
        import boto3  # noqa: F401
    except ImportError:
        raise SystemExit("Install boto3 in a virtual environment first. See the setup instructions in Paperlane.")
    instructions = json.loads(Path(args.protocol).read_text())["instructions"]
    # The user controls this process. No background service is installed.
    os.environ.pop("AWS_BEARER_TOKEN_BEDROCK", None)
    token_dir = Path.home() / ".config" / "paperlane"
    token_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    token_path = token_dir / "helper-token"
    if token_path.is_symlink():
        raise SystemExit("Refusing a symbolic link for the helper token.")
    try:
        fd = os.open(token_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as file:
            file.write(secrets.token_urlsafe(32))
    except FileExistsError:
        pass
    if token_path.stat().st_mode & 0o077:
        raise SystemExit("Helper token permissions must be private (chmod 600).")
    token = token_path.read_text().strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{40,100}", token):
        raise SystemExit("Invalid helper token file.")
    server = ThreadingHTTPServer(("127.0.0.1", 27183), handler_type(token, instructions, pairing_directory=Path(__file__).resolve().parent))
    server.daemon_threads = True
    print("Paperlane AWS helper is ready. Model: GPT-6 Astra (low), global cross-region.")
    print("Automatic connection is ready. Select AWS profile in Paperlane; no helper token is required.", flush=True)
    print("Keep this terminal open. Ctrl+C stops the helper. Connection authentication is handled automatically.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
