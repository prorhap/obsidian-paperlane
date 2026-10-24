import importlib.util
import json
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
        def run(payload, instructions):
            self.calls.append((payload, instructions))
            return {"stopReason": "end_turn", "output": {"message": {"content": [{"text": '{"changes":[],"findings":[]}'}]}}}
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), helper.handler_type("test-token", "trusted instructions", run))
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.server.server_port}/review"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()

    def request(self, headers=None, payload=None):
        body = {"profile": "default", "region": "us-west-2", "model": helper.MODEL, "document": "sample"}
        if payload is not None:
            body = payload
        h = {"Authorization": "Bearer test-token", "Host": "127.0.0.1:27183", "Content-Type": "application/json"}
        h.update(headers or {})
        request = urllib.request.Request(self.url, data=json.dumps(body).encode(), headers=h)
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
