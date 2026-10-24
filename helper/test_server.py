import importlib.util
import json
import tempfile
import time
import hashlib
import hmac
import threading
import unittest
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch, MagicMock
import sys
spec = importlib.util.spec_from_file_location("helper", Path(__file__).with_name("server.py"))
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class HelperTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.directory = tempfile.TemporaryDirectory()
        self.pairing = Path(self.directory.name)
        def run(payload, instructions):
            self.calls.append((payload, instructions))
            return {"stopReason": "end_turn", "output": {"message": {"content": [{"text": '{"changes":[],"findings":[]}'}]}}}
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), helper.handler_type("test-token", "trusted instructions", run, self.pairing))
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.server.server_port}/review"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.directory.cleanup()

    def request(self, headers=None, payload=None, path="/review"):
        body = {"profile": "default", "region": "us-west-2", "model": helper.MODEL, "document": "sample"}
        if payload is not None:
            body = payload
        h = {"Authorization": "Bearer test-token", "Host": "127.0.0.1:27183", "Content-Type": "application/json"}
        h.update(headers or {})
        request = urllib.request.Request(self.url.replace("/review", path), data=json.dumps(body).encode(), headers=h)
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, json.load(error)

    def test_authenticated_review(self):
        self.assertEqual(self.request()[0], 200)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.calls[0][1], "trusted instructions")

    def test_browser_and_foreign_host_denied(self):
        self.assertEqual(self.request({"Origin": "https://example.com"})[0], 403)
        self.assertEqual(self.request({"Host": "evil.example"})[0], 403)
        self.assertEqual(self.calls, [])

    def test_missing_token_denied(self):
        self.assertEqual(self.request({"Authorization": ""})[0], 401)
        self.assertEqual(self.calls, [])

    def test_model_and_input_are_bounded(self):
        for change in [{"model": "other-model"}, {"region": "evil.example"}, {"document": "x" * 240001}]:
            body = {"profile": "default", "region": "us-west-2", "model": helper.MODEL, "document": "sample", **change}
            self.assertEqual(self.request(payload=body)[0], 400)
        self.assertEqual(self.calls, [])

    def challenge(self, nonce="a" * 64, expires=None):
        proof = "b" * 64
        path = self.pairing / f"connection-{nonce}.json"
        path.write_text(json.dumps({"nonce": nonce, "proof": proof, "expiresAt": expires or time.time() * 1000 + 120000}))
        return nonce, proof, path

    def test_pairing_is_automatic_single_use_and_authenticated(self):
        nonce, proof, path = self.challenge()
        status, data = self.request({"Authorization": ""}, {"nonce": nonce}, "/pair")
        self.assertEqual(status, 200)
        expected = hmac.new(proof.encode(), f"paperlane-pair-v1:{nonce}:test-token".encode(), hashlib.sha256).hexdigest()
        self.assertEqual(data["signature"], expected)
        self.assertTrue(path.exists())  # The plugin performs cleanup through Vault API.
        self.assertEqual(self.request({"Authorization": ""}, {"nonce": nonce}, "/pair")[0], 400)
        self.assertEqual(self.calls, [])  # Pairing never invokes a paid model.

    def test_pairing_rejects_expired_missing_and_traversal_challenges(self):
        for nonce in ["../other", "a" * 64]:
            self.assertEqual(self.request({"Authorization": ""}, {"nonce": nonce}, "/pair")[0], 400)
        nonce, _, _ = self.challenge(expires=time.time() * 1000 - 1)
        self.assertEqual(self.request({"Authorization": ""}, {"nonce": nonce}, "/pair")[0], 400)

    def test_pairing_rejects_browser_origins_and_symlinks(self):
        nonce, _, path = self.challenge()
        self.assertEqual(self.request({"Origin": "https://example.com"}, {"nonce": nonce}, "/pair")[0], 403)
        target = path.with_name("target.json")
        path.rename(target)
        path.symlink_to(target)
        self.assertEqual(self.request({"Authorization": ""}, {"nonce": nonce}, "/pair")[0], 400)
        self.assertTrue(target.exists())

    def test_astra_low_profile_request(self):
        boto3 = MagicMock()
        botocore_config = MagicMock()
        with patch.dict(sys.modules, {"boto3": boto3, "botocore.config": botocore_config}):
            helper.invoke({"profile": "work", "region": "us-west-2", "document": "sample"}, "instructions")
        boto3.Session.assert_called_once_with(profile_name="work", region_name="us-west-2")
        request = boto3.Session.return_value.client.return_value.converse.call_args.kwargs
        self.assertEqual(request["modelId"], "global.openai.gpt-6-astra")
        self.assertEqual(request["additionalModelRequestFields"]["reasoning"]["effort"], "low")
        self.assertNotIn("toolConfig", request)


if __name__ == "__main__":
    unittest.main()
