#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Understanding NMR Spectroscopy -- local reading server.

Pure standard library: Static file server + SQLite persistence for
reading progress / bookmarks / notes.

Usage:
    python server.py            # starts on 8765 and opens the browser
    NMR_PORT=9000 python server.py
    NMR_NO_BROWSER=1 python server.py
    NMR_DB=/path/to/other.db python server.py
"""

import json
import os
import socket
import sqlite3
import sys
import threading
import webbrowser
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("NMR_DB") or os.path.join(ROOT, "nmr-reader.db")
ENTRY = "/reader/index.html"
DEFAULT_PORT = 8765
WRITE_LOCK = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS progress (
    chapter  INTEGER PRIMARY KEY,
    pct      REAL    NOT NULL DEFAULT 0,
    block    INTEGER NOT NULL DEFAULT 0,
    ratio    REAL    NOT NULL DEFAULT 0,
    updated  TEXT
);
CREATE TABLE IF NOT EXISTS bookmarks (
    id       TEXT PRIMARY KEY,
    chapter  INTEGER NOT NULL,
    block    INTEGER NOT NULL DEFAULT 0,
    page     INTEGER NOT NULL DEFAULT 0,
    label    TEXT    NOT NULL DEFAULT '',
    ratio    REAL    NOT NULL DEFAULT 0,
    created  TEXT
);
CREATE TABLE IF NOT EXISTS notes (
    id       TEXT PRIMARY KEY,
    chapter  INTEGER NOT NULL,
    block    INTEGER NOT NULL DEFAULT 0,
    page     INTEGER NOT NULL DEFAULT 0,
    start    INTEGER NOT NULL DEFAULT 0,
    "end"    INTEGER NOT NULL DEFAULT 0,
    quote    TEXT    NOT NULL DEFAULT '',
    body     TEXT    NOT NULL DEFAULT '',
    color    TEXT    NOT NULL DEFAULT 'yellow',
    created  TEXT,
    updated  TEXT
);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
"""


def _now():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def connect():
    con = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA synchronous=NORMAL")
    return con


CON = connect()


def init_db():
    with WRITE_LOCK:
        CON.executescript(SCHEMA)
        CON.commit()


def _num(v, default=0):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return default
    return f


def _int(v, default=0):
    return int(_num(v, default))


def read_state():
    with WRITE_LOCK:
        progress = {}
        for r in CON.execute("SELECT * FROM progress"):
            progress[str(r["chapter"])] = {
                "pct": round(r["pct"], 4),
                "block": r["block"],
                "ratio": round(r["ratio"], 4),
                "updated": r["updated"],
            }
        bookmarks = [
            {
                "id": r["id"],
                "chapter": r["chapter"],
                "block": r["block"],
                "page": r["page"],
                "label": r["label"],
                "ratio": round(r["ratio"], 4),
                "created": r["created"],
            }
            for r in CON.execute("SELECT * FROM bookmarks ORDER BY created")
        ]
        notes = [
            {
                "id": r["id"],
                "chapter": r["chapter"],
                "block": r["block"],
                "page": r["page"],
                "start": r["start"],
                "end": r["end"],
                "quote": r["quote"],
                "body": r["body"],
                "color": r["color"],
                "created": r["created"],
                "updated": r["updated"],
            }
            for r in CON.execute("SELECT * FROM notes ORDER BY created")
        ]
        meta = {r["k"]: r["v"] for r in CON.execute("SELECT * FROM meta")}
    return {
        "version": 1,
        "mode": "sqlite",
        "storage": os.path.basename(DB_PATH),
        "progress": progress,
        "bookmarks": bookmarks,
        "notes": notes,
        "meta": meta,
        "updated": _now(),
    }


def write_state(state):
    """Full-state transactional replace (data volume is tiny, this is safest)."""
    state = state or {}
    with WRITE_LOCK:
        CON.execute("BEGIN IMMEDIATE")
        try:
            CON.execute("DELETE FROM progress")
            for key, p in (state.get("progress") or {}).items():
                if not isinstance(p, dict):
                    continue
                CON.execute(
                    "INSERT INTO progress(chapter,pct,block,ratio,updated)"
                    " VALUES(?,?,?,?,?)",
                    (
                        _int(key, -1),
                        _num(p.get("pct")),
                        _int(p.get("block")),
                        _num(p.get("ratio")),
                        p.get("updated") or _now(),
                    ),
                )

            CON.execute("DELETE FROM bookmarks")
            for b in state.get("bookmarks") or []:
                if not isinstance(b, dict) or b.get("id") in (None, ""):
                    continue
                CON.execute(
                    "INSERT INTO bookmarks(id,chapter,block,page,label,ratio,created)"
                    " VALUES(?,?,?,?,?,?,?)",
                    (
                        str(b["id"]),
                        _int(b.get("chapter"), -1),
                        _int(b.get("block")),
                        _int(b.get("page")),
                        str(b.get("label") or ""),
                        _num(b.get("ratio")),
                        b.get("created") or _now(),
                    ),
                )

            CON.execute("DELETE FROM notes")
            for n in state.get("notes") or []:
                if not isinstance(n, dict) or n.get("id") in (None, ""):
                    continue
                CON.execute(
                    "INSERT INTO notes(id,chapter,block,page,start,\"end\",quote,"
                    "body,color,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                    (
                        str(n["id"]),
                        _int(n.get("chapter"), -1),
                        _int(n.get("block")),
                        _int(n.get("page")),
                        _int(n.get("start")),
                        _int(n.get("end")),
                        str(n.get("quote") or ""),
                        str(n.get("body") or ""),
                        str(n.get("color") or "yellow"),
                        n.get("created") or _now(),
                        n.get("updated") or _now(),
                    ),
                )

            CON.execute("DELETE FROM meta")
            for k, v in (state.get("meta") or {}).items():
                CON.execute(
                    "INSERT INTO meta(k,v) VALUES(?,?)", (str(k), str(v))
                )
            CON.execute("COMMIT")
        except Exception:
            CON.execute("ROLLBACK")
            raise
    return read_state()


class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "NMRReader/2.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    # ---------- helpers ----------
    def _send_json(self, obj, status=200):
        payload = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def _read_body(self):
        length = _int(self.headers.get("Content-Length"))
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return {}

    def end_headers(self):
        path = urlparse(self.path).path.lower()
        if path.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif", ".pdf")):
            self.send_header("Cache-Control", "public, max-age=86400")
        elif path.endswith((".html", ".js", ".css")):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        if os.environ.get("NMR_VERBOSE"):
            sys.stderr.write("  %s\n" % (fmt % args))

    # ---------- routes ----------
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/state":
            try:
                self._send_json(read_state())
            except Exception as exc:  # pragma: no cover
                self._send_json({"error": str(exc)}, 500)
            return
        if path == "/api/ping":
            self._send_json({"ok": True, "mode": "sqlite", "time": _now()})
            return
        if path in ("/", "/index.html"):
            self.send_response(302)
            self.send_header("Location", ENTRY)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        super().do_GET()

    def do_PUT(self):
        if urlparse(self.path).path == "/api/state":
            try:
                self._send_json(write_state(self._read_body()))
            except Exception as exc:
                self._send_json({"error": str(exc)}, 500)
            return
        self._send_json({"error": "not found"}, 404)

    def do_POST(self):
        if urlparse(self.path).path == "/api/state":
            try:
                self._send_json(write_state(self._read_body()))
            except Exception as exc:
                self._send_json({"error": str(exc)}, 500)
            return
        self._send_json({"error": "not found"}, 404)

    def do_DELETE(self):
        if urlparse(self.path).path == "/api/state":
            try:
                self._send_json(write_state({}))
            except Exception as exc:
                self._send_json({"error": str(exc)}, 500)
            return
        self._send_json({"error": "not found"}, 404)


def free_port(start):
    for port in range(start, start + 30):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise SystemExit("no free port available near %d" % start)


def main():
    init_db()
    port = free_port(_int(os.environ.get("NMR_PORT"), DEFAULT_PORT))
    url = "http://127.0.0.1:%d%s" % (port, ENTRY)
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    httpd.daemon_threads = True

    line = "=" * 62
    print(line)
    print("  Understanding NMR Spectroscopy  -  local reader")
    print(line)
    print("  reader  : %s" % url)
    print("  database: %s" % DB_PATH)
    print("  stop    : Ctrl + C")
    print(line)

    if not os.environ.get("NMR_NO_BROWSER"):
        threading.Timer(0.7, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nbye.")
    finally:
        httpd.server_close()
        CON.close()


if __name__ == "__main__":
    main()
