import json
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional
from core.config import settings

class Database:
    def __init__(self, db_path: str = None):
        self.db_path = db_path or settings.SQLITE_PATH
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_sqlite()

    def _init_sqlite(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS documents (
                    collection TEXT,
                    id TEXT,
                    data TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (collection, id)
                )
            """)
            conn.commit()

    def get_document(self, collection: str, doc_id: str) -> Optional[Dict[str, Any]]:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM documents WHERE collection = ? AND id = ?", (collection, doc_id))
            row = cursor.fetchone()
            if row:
                return json.loads(row[0])
            return None

    def set_document(self, collection: str, doc_id: str, data: Dict[str, Any]):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO documents (collection, id, data) VALUES (?, ?, ?)",
                (collection, doc_id, json.dumps(data)),
            )
            conn.commit()

    def list_documents(self, collection: str, filters: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM documents WHERE collection = ?", (collection,))
            rows = cursor.fetchall()
            docs = [json.loads(r[0]) for r in rows]
            if filters:
                docs = [
                    d for d in docs
                    if all(d.get(k) == v for k, v in filters.items())
                ]
            return docs

    def delete_document(self, collection: str, doc_id: str):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM documents WHERE collection = ? AND id = ?", (collection, doc_id))
            conn.commit()


def get_db() -> Database:
    return Database()
