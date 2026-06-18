import sqlite3
import os
import logging

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'notes.db')
logger = logging.getLogger(__name__)

def get_db_connection():
    """Establish a connection to the SQLite database with row factory enabled."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize the SQLite database and create the tables if they don't exist."""
    logger.info(f"Initializing database at {DB_PATH}")
    conn = get_db_connection()
    try:
        with conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS notes (
                    id TEXT PRIMARY KEY,
                    date TEXT,
                    updated TEXT,
                    link TEXT,
                    type TEXT,
                    content_html TEXT,
                    content_text TEXT,
                    email_sent INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
        logger.info("Database initialized successfully.")
    except Exception as e:
        logger.error(f"Error initializing database: {e}")
        raise e
    finally:
        conn.close()

def is_db_empty():
    """Check if the notes table is empty."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM notes")
        count = cursor.fetchone()[0]
        return count == 0
    except Exception as e:
        logger.error(f"Error checking if DB is empty: {e}")
        return True
    finally:
        conn.close()

def insert_notes(notes, mark_as_sent=False):
    """
    Insert a list of note dicts. 
    Returns a list of note dicts that were newly inserted.
    """
    if not notes:
        return []
        
    conn = get_db_connection()
    new_notes = []
    
    # We want to insert notes. If a note is not present, we add it.
    # We check if it exists first to identify if it's new.
    try:
        for note in notes:
            cursor = conn.cursor()
            cursor.execute("SELECT 1 FROM notes WHERE id = ?", (note['id'],))
            exists = cursor.fetchone() is not None
            
            if not exists:
                email_sent_value = 1 if mark_as_sent else 0
                with conn:
                    conn.execute('''
                        INSERT INTO notes (id, date, updated, link, type, content_html, content_text, email_sent)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        note['id'],
                        note['date'],
                        note['updated'],
                        note['link'],
                        note['type'],
                        note['content_html'],
                        note['content_text'],
                        email_sent_value
                    ))
                new_notes.append(note)
    except Exception as e:
        logger.error(f"Error inserting notes: {e}")
    finally:
        conn.close()
        
    return new_notes

def get_all_notes():
    """Retrieve all notes from the database, sorted by date (updated) descending."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM notes ORDER BY updated DESC, id DESC")
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    except Exception as e:
        logger.error(f"Error fetching all notes: {e}")
        return []
    finally:
        conn.close()

def get_unsent_notes():
    """Retrieve all notes that haven't been emailed yet."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM notes WHERE email_sent = 0 ORDER BY updated DESC")
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    except Exception as e:
        logger.error(f"Error fetching unsent notes: {e}")
        return []
    finally:
        conn.close()

def mark_as_sent(note_ids):
    """Mark the list of note IDs as email_sent = 1."""
    if not note_ids:
        return
        
    conn = get_db_connection()
    try:
        with conn:
            # Generate placeholder string (?, ?, ?)
            placeholders = ','.join('?' for _ in note_ids)
            conn.execute(f"UPDATE notes SET email_sent = 1 WHERE id IN ({placeholders})", tuple(note_ids))
        logger.info(f"Marked {len(note_ids)} notes as sent in the database.")
    except Exception as e:
        logger.error(f"Error marking notes as sent: {e}")
    finally:
        conn.close()

def get_db_stats():
    """Retrieve statistics about the stored notes."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM notes")
        total = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM notes WHERE email_sent = 1")
        sent = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM notes WHERE email_sent = 0")
        unsent = cursor.fetchone()[0]
        
        return {
            'total_notes': total,
            'emails_sent': sent,
            'emails_pending': unsent
        }
    except Exception as e:
        logger.error(f"Error fetching DB stats: {e}")
        return {'total_notes': 0, 'emails_sent': 0, 'emails_pending': 0}
    finally:
        conn.close()
