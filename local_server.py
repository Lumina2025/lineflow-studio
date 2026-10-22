#!/usr/bin/env python3
"""Serve the editor locally using only Python's standard library."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import webbrowser

root = Path(__file__).resolve().parent / 'dist'
handler = partial(SimpleHTTPRequestHandler, directory=str(root))
for port in range(4189, 4200):
    try:
        server = ThreadingHTTPServer(('127.0.0.1', port), handler)
        break
    except OSError:
        continue
else:
    server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
url = f'http://127.0.0.1:{server.server_port}/'
print(f'Lineflow 已启动：{url}\n保持窗口打开。按 Ctrl+C 关闭。', flush=True)
webbrowser.open(url)
try:
    server.serve_forever()
except KeyboardInterrupt:
    print('\nLineflow 已关闭。')
finally:
    server.server_close()
