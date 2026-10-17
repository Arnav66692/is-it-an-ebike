# Local-only static server for the pilot pages, with the two headers that make a page cross-origin
# isolated, so WASM threads can run. Serves only clip-pilot/ and binds to 127.0.0.1.
import functools, os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "clip-pilot")

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "credentialless")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass

ThreadingHTTPServer(("127.0.0.1", 8793), functools.partial(Handler, directory=ROOT)).serve_forever()
