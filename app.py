import time
import hashlib
import logging
import xml.etree.ElementTree as ET
import requests
from bs4 import BeautifulSoup
from flask import Flask, render_template, jsonify, request

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Cache configuration
cached_notes = None
last_cache_time = 0
CACHE_DURATION_SECS = 300  # 5 minutes cache

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
namespaces = {'atom': 'http://www.w3.org/2005/Atom'}

def create_note_item(date_str, updated_str, link_href, note_type, content_parts):
    """Reconstruct HTML from parts, generate plain text, and assign a unique hash-based ID."""
    html_desc = "".join(content_parts).strip()
    
    # Use BeautifulSoup to strip HTML tags for plain text (useful for Tweet preview)
    soup = BeautifulSoup(html_desc, 'html.parser')
    
    # Clean up excess spaces in text conversion
    plain_text = soup.get_text(separator=' ', strip=True)
    # Re-spacing logic to avoid run-on sentences
    plain_text = " ".join(plain_text.split())
    
    content_hash = hashlib.md5(html_desc.encode('utf-8')).hexdigest()[:8]
    note_id = f"{date_str.replace(' ', '_')}-{note_type.lower()}-{content_hash}"
    
    return {
        'id': note_id,
        'date': date_str,
        'updated': updated_str,
        'link': link_href,
        'type': note_type,
        'content_html': html_desc,
        'content_text': plain_text
    }

def fetch_and_parse_release_notes():
    """Fetch release notes XML and parse them into structured list of individual updates."""
    logger.info(f"Fetching XML feed from {FEED_URL}")
    response = requests.get(FEED_URL, timeout=15)
    response.raise_for_status()
    
    root = ET.fromstring(response.content)
    notes = []
    
    for entry in root.findall('atom:entry', namespaces):
        title_el = entry.find('atom:title', namespaces)
        updated_el = entry.find('atom:updated', namespaces)
        link_el = entry.find('atom:link[@rel="alternate"]', namespaces)
        if link_el is None:
            link_el = entry.find('atom:link', namespaces)
            
        content_el = entry.find('atom:content', namespaces)
        
        date_str = title_el.text if title_el is not None else "Unknown Date"
        updated_str = updated_el.text if updated_el is not None else ""
        link_href = link_el.attrib.get('href', '') if link_el is not None else ""
        
        if content_el is not None and content_el.text:
            html_content = content_el.text
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Find if there are h3 headers
            h3_headers = soup.find_all('h3')
            
            if not h3_headers:
                # Fallback: treat the entire content as a single item if no h3 structure is found
                notes.append({
                    'id': f"{date_str.replace(' ', '_')}-update-{hashlib.md5(html_content.encode('utf-8')).hexdigest()[:8]}",
                    'date': date_str,
                    'updated': updated_str,
                    'link': link_href,
                    'type': 'Update',
                    'content_html': html_content.strip(),
                    'content_text': soup.get_text(separator=' ', strip=True)
                })
                continue
                
            current_type = None
            current_content_parts = []
            
            for child in soup.contents:
                if child.name == 'h3':
                    if current_type and current_content_parts:
                        notes.append(create_note_item(date_str, updated_str, link_href, current_type, current_content_parts))
                    current_type = child.get_text(strip=True)
                    current_content_parts = []
                elif current_type:
                    if hasattr(child, 'name') and child.name is not None:
                        current_content_parts.append(str(child))
                    elif isinstance(child, str) and child.strip():
                        current_content_parts.append(child)
            
            # Save the final parsed item for this entry
            if current_type and current_content_parts:
                notes.append(create_note_item(date_str, updated_str, link_href, current_type, current_content_parts))
                
    return notes

def get_notes(force_refresh=False):
    """Retrieve notes with in-memory caching support."""
    global cached_notes, last_cache_time
    now = time.time()
    
    if force_refresh or not cached_notes or (now - last_cache_time > CACHE_DURATION_SECS):
        try:
            cached_notes = fetch_and_parse_release_notes()
            last_cache_time = now
            logger.info("Successfully fetched and cached release notes.")
        except Exception as e:
            logger.error(f"Error fetching notes: {e}")
            if cached_notes:
                logger.info("Returning cached copy as fallback.")
            else:
                raise e
    return cached_notes

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/notes')
def api_notes():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    try:
        notes = get_notes(force_refresh=force_refresh)
        return jsonify({
            'success': True,
            'notes': notes,
            'last_updated': time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(last_cache_time))
        })
    except Exception as e:
        logger.error(f"API Error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
