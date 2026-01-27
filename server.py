#!/usr/bin/env python3
"""
Serveur unique pour le CRM Code-Barres
Sert à la fois l'API REST et les fichiers statiques (HTML/CSS/JS)
Base de données SQLite locale
"""

from flask import Flask, request, jsonify, send_from_directory, Response, send_file
from flask_cors import CORS
import sqlite3
import os
from datetime import datetime
import requests
import threading
import queue
import json
import base64
import re
from io import BytesIO
from functools import wraps

# ==================== CONFIGURATION VIA VARIABLES D'ENVIRONNEMENT ====================

# Mode de l'application : 'development' ou 'production'
APP_MODE = os.environ.get('APP_MODE', 'development')

# Origines CORS autorisées (séparées par des virgules)
CORS_ORIGINS = os.environ.get('CORS_ORIGINS', 'http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001')
CORS_ORIGINS_LIST = [origin.strip() for origin in CORS_ORIGINS.split(',') if origin.strip()]

# En mode développement, on peut autoriser toutes les origines
if APP_MODE == 'development':
    CORS_ORIGINS_LIST = ["*"]

# Port du serveur
SERVER_PORT = int(os.environ.get('SERVER_PORT', 5000))

print(f'[CONFIG] Mode: {APP_MODE}')
print(f'[CONFIG] CORS Origins: {CORS_ORIGINS_LIST}')
print(f'[CONFIG] Port: {SERVER_PORT}')

# ==================== FONCTIONS DE VALIDATION ====================

def validate_required_fields(data, required_fields):
    """Valider que les champs requis sont présents et non vides"""
    missing = []
    for field in required_fields:
        if field not in data or data[field] is None or (isinstance(data[field], str) and not data[field].strip()):
            missing.append(field)
    return missing

def validate_email(email):
    """Valider le format d'un email"""
    if not email:
        return True  # Email optionnel
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def validate_phone(phone):
    """Valider le format d'un numéro de téléphone"""
    if not phone:
        return True  # Téléphone optionnel
    # Accepte les formats courants : +33, 06, 07, etc.
    pattern = r'^[\+]?[(]?[0-9]{1,3}[)]?[-\s\.]?[0-9]{1,4}[-\s\.]?[0-9]{1,4}[-\s\.]?[0-9]{1,9}$'
    return re.match(pattern, phone.replace(' ', '')) is not None

def sanitize_string(value, max_length=500):
    """Nettoyer et limiter la longueur d'une chaîne"""
    if value is None:
        return None
    if not isinstance(value, str):
        value = str(value)
    # Supprimer les caractères de contrôle dangereux
    value = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', value)
    return value[:max_length].strip()

def validate_positive_number(value, allow_zero=True):
    """Valider qu'une valeur est un nombre positif"""
    try:
        num = float(value)
        if allow_zero:
            return num >= 0
        return num > 0
    except (TypeError, ValueError):
        return False

# ==================== RECHERCHE TESSERACT ====================

def find_tesseract():
    """Trouver le chemin de Tesseract selon l'OS"""
    # D'abord vérifier la variable d'environnement
    env_path = os.environ.get('TESSERACT_PATH')
    if env_path and os.path.exists(env_path):
        return env_path
    
    # Chemins par défaut selon l'OS
    if os.name == 'nt':  # Windows
        default_paths = [
            r'C:\Program Files\Tesseract-OCR\tesseract.exe',
            r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
            os.path.expanduser(r'~\AppData\Local\Tesseract-OCR\tesseract.exe'),
        ]
    else:  # Linux/Mac
        default_paths = [
            '/usr/bin/tesseract',
            '/usr/local/bin/tesseract',
            '/opt/homebrew/bin/tesseract',  # Mac avec Homebrew ARM
        ]
    
    for path in default_paths:
        if os.path.exists(path):
            return path
    
    return None

# OCR avec Tesseract
try:
    import pytesseract
    from PIL import Image
    
    tesseract_path = find_tesseract()
    if tesseract_path:
        pytesseract.pytesseract.tesseract_cmd = tesseract_path
        OCR_AVAILABLE = True
        print(f'[OCR] Tesseract configuré: {tesseract_path}')
    else:
        OCR_AVAILABLE = False
        print('[OCR] Tesseract non trouvé. Définissez TESSERACT_PATH ou installez Tesseract.')
except ImportError:
    OCR_AVAILABLE = False
    print('[OCR] pytesseract non installé - pip install pytesseract Pillow')

# Génération DOCX
try:
    from docx import Document
    from docx.shared import Pt, Inches
    DOCX_AVAILABLE = True
    print('[DOCX] python-docx disponible')
except ImportError:
    DOCX_AVAILABLE = False
    print('[DOCX] python-docx non installé - pip install python-docx')

app = Flask(__name__, static_folder='.')

# Configuration pour gérer les URLs longues (éviter erreur 414)
# Augmenter la limite de taille de requête pour les données POST
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB

# Gestionnaire d'erreur pour les URLs trop longues (414)
@app.errorhandler(414)
def request_uri_too_large(error):
    """Gérer les erreurs 414 (Request-URI Too Long)"""
    print(f'[ERREUR] URL trop longue (414): {request.url[:200]}...')
    return jsonify({
        'success': False,
        'error': 'URL trop longue. Veuillez utiliser POST pour envoyer des données volumineuses.'
    }), 414

# Configuration CORS sécurisée
CORS(app, 
     resources={r"/api/*": {
         "origins": CORS_ORIGINS_LIST,
         "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
         "allow_headers": ["Content-Type", "Authorization"],
         "expose_headers": ["Content-Type"],
         "max_age": 3600
     }},
     supports_credentials=True if APP_MODE == 'production' else False)

# Système de broadcast pour Server-Sent Events
clients = []
clients_lock = threading.Lock()

def broadcast_event(event_type, data):
    """Diffuser un événement à tous les clients connectés"""
    message = f"data: {json.dumps({'type': event_type, 'data': data})}\n\n"
    with clients_lock:
        disconnected_clients = []
        for client_queue in clients:
            try:
                client_queue.put_nowait(message)
            except queue.Full:
                # Queue pleine, ignorer
                pass
            except:
                # Client déconnecté, le marquer pour suppression
                disconnected_clients.append(client_queue)
        
        # Retirer les clients déconnectés
        for client_queue in disconnected_clients:
            if client_queue in clients:
                clients.remove(client_queue)

# Configuration base de données
DB_PATH = os.environ.get('DB_PATH', os.path.join('data', 'inventory.db'))
print(f'[CONFIG] DB Path: {DB_PATH}')

def sanitize_string(text):
    """Nettoyer une chaîne de caractères pour éviter les problèmes d'encodage Unicode"""
    if not text:
        return text
    try:
        # Convertir en string si ce n'est pas déjà le cas
        text = str(text)
        
        # Remplacer les caractères Unicode problématiques par des équivalents ASCII
        replacements = {
            '→': '->',
            '←': '<-',
            '↑': '^',
            '↓': 'v',
            '…': '...',
            '–': '-',
            '—': '-',
            '"': '"',
            '"': '"',
            ''': "'",
            ''': "'",
        }
        
        for unicode_char, ascii_replacement in replacements.items():
            text = text.replace(unicode_char, ascii_replacement)
        
        # Encoder en UTF-8 puis décoder pour s'assurer que c'est valide
        # Cela élimine les caractères non-encodables
        try:
            text = text.encode('utf-8', errors='replace').decode('utf-8')
        except:
            # Si l'encodage échoue, utiliser une approche plus agressive
            text = text.encode('ascii', errors='replace').decode('ascii')
        
        return text
    except Exception as e:
        # En cas d'erreur, retourner un message par défaut
        try:
            error_msg = str(e).encode('ascii', errors='replace').decode('ascii')
            print(f'[ERREUR] Erreur lors de la sanitization: {error_msg}')
        except:
            print('[ERREUR] Erreur lors de la sanitization (encodage impossible)')
        return 'Message'

def sanitize_error(error):
    """Nettoyer un message d'erreur pour éviter les problèmes d'encodage Unicode"""
    try:
        if isinstance(error, Exception):
            error_str = str(error)
        else:
            error_str = str(error)
        return sanitize_string(error_str)
    except:
        return 'Une erreur est survenue'

def sanitize_notification_message(message):
    """Nettoyer un message de notification pour éviter les problèmes d'encodage"""
    return sanitize_string(message)

def clean_existing_notifications():
    """Nettoyer toutes les notifications existantes dans la base de données"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Récupérer toutes les notifications
        cursor.execute('SELECT id, message FROM notifications')
        rows = cursor.fetchall()
        
        updated_count = 0
        for row in rows:
            original_message = row['message']
            if original_message:
                clean_message = sanitize_notification_message(original_message)
                # Si le message a changé, mettre à jour
                if clean_message != original_message:
                    cursor.execute('''
                        UPDATE notifications 
                        SET message = ? 
                        WHERE id = ?
                    ''', (clean_message, row['id']))
                    updated_count += 1
        
        if updated_count > 0:
            conn.commit()
            print(f'[DB] {updated_count} notification(s) nettoyée(s) pour éviter les problèmes d\'encodage')
        
        conn.close()
    except Exception as e:
        print(f'[DB] Erreur lors du nettoyage des notifications: {str(e)}')

def create_notification(message, type, item_serial_number, conn, cursor):
    """Créer une notification dans la base de données"""
    try:
        # Nettoyer le message pour éviter les problèmes d'encodage
        clean_message = sanitize_notification_message(message)
        now = datetime.now().isoformat()
        cursor.execute('''
            INSERT INTO notifications (message, type, item_serial_number, created_at)
            VALUES (?, ?, ?, ?)
        ''', (
            clean_message,
            type,
            item_serial_number,
            now
        ))
        notification_id = cursor.lastrowid
        # Ne pas afficher le message dans la console car il peut contenir des caractères Unicode
        # qui causent des erreurs d'encodage sur Windows
        print(f'[API] Notification créée (ID: {notification_id})')
        
        # Limiter à 100 notifications (supprimer les plus anciennes)
        cursor.execute('''
            DELETE FROM notifications 
            WHERE id NOT IN (
                SELECT id FROM notifications 
                ORDER BY created_at DESC 
                LIMIT 100
            )
        ''')
        deleted_count = cursor.rowcount
        if deleted_count > 0:
            print(f'[API] {deleted_count} anciennes notifications supprimées')
    except Exception as e:
        print(f'[API] Erreur lors de la création de la notification: {str(e)}')
        import traceback
        traceback.print_exc()

def get_db():
    """Créer une connexion à la base de données"""
    os.makedirs('data', exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def generate_next_item_id(cursor):
    """Générer le prochain ID alphanumérique (aaa, aab, ..., aaz, aa0, aa1, ..., aa9, aba, etc.)"""
    # Récupérer le dernier item_id utilisé
    cursor.execute('SELECT item_id FROM items WHERE item_id IS NOT NULL ORDER BY item_id DESC LIMIT 1')
    last_id_row = cursor.fetchone()
    
    if not last_id_row or not last_id_row['item_id']:
        # Premier ID : aaa
        return 'aaa'
    
    last_id = last_id_row['item_id'].lower()
    
    # S'assurer que l'ID fait exactement 3 caractères
    if len(last_id) != 3:
        return 'aaa'
    
    # Caractères valides : a-z (26) puis 0-9 (10) = 36 caractères
    chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    
    # Convertir l'ID en liste de caractères
    id_chars = list(last_id)
    
    # Incrémenter de droite à gauche (position 2 -> 0)
    for i in range(2, -1, -1):
        char_index = chars.find(id_chars[i])
        if char_index == -1:
            # Caractère invalide, réinitialiser à 'a'
            id_chars[i] = 'a'
            continue
        
        if char_index < len(chars) - 1:
            # Incrémenter ce caractère
            id_chars[i] = chars[char_index + 1]
            # Réinitialiser tous les caractères à droite à 'a'
            for j in range(i + 1, 3):
                id_chars[j] = 'a'
            return ''.join(id_chars)
        else:
            # Ce caractère est '9' (dernier), le réinitialiser à 'a' et continuer avec le suivant
            id_chars[i] = 'a'
    
    # Si tous les caractères étaient '9', on recommence à aaa
    # (ne devrait jamais arriver avec seulement 3 caractères)
    return 'aaa'

def init_db():
    """Initialiser la base de données"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Table des items
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id TEXT,
            name TEXT NOT NULL,
            serial_number TEXT NOT NULL UNIQUE,
            quantity INTEGER DEFAULT 1,
            category TEXT,
            category_details TEXT,
            image TEXT,
            scanned_code TEXT,
            created_at TEXT NOT NULL,
            last_updated TEXT NOT NULL
        )
    ''')
    
    # Vérifier et ajouter les colonnes manquantes pour les bases de données existantes
    cursor.execute("PRAGMA table_info(items)")
    columns = [column[1] for column in cursor.fetchall()]
    print(f'[DB] Colonnes existantes dans items: {columns}')
    
    # Ajouter les nouvelles colonnes si elles n'existent pas
    new_columns = {
        'item_id': 'TEXT',
        'status': 'TEXT DEFAULT "en_stock"',
        'item_type': 'TEXT',
        'brand': 'TEXT',
        'model': 'TEXT',
        'rental_end_date': 'TEXT',
        'current_rental_id': 'INTEGER',
        'custom_data': 'TEXT'  # JSON pour stocker les champs personnalisés
    }
    
    for col_name, col_type in new_columns.items():
        if col_name not in columns:
            try:
                cursor.execute(f'ALTER TABLE items ADD COLUMN {col_name} {col_type}')
                print(f'[DB] Colonne {col_name} ajoutée')
            except sqlite3.OperationalError as e:
                print(f'[DB] Erreur ajout colonne {col_name}: {e}')
    
    conn.commit()
    
    # Table des champs personnalisés
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS custom_fields (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            field_key TEXT NOT NULL UNIQUE,
            field_type TEXT NOT NULL DEFAULT 'text',
            options TEXT,
            required INTEGER DEFAULT 0,
            display_order INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        )
    ''')
    conn.commit()
    
    # Table des catégories personnalisées
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS custom_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL
        )
    ''')
    
    # Table des catégories supprimées
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS deleted_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            deleted_at TEXT NOT NULL
        )
    ''')
    
    # Initialiser les nouvelles catégories d'équipement
    new_equipment_categories = ['ordinateur', 'casque_vr', 'camera', 'eclairage', 'accessoire']
    for cat_name in new_equipment_categories:
        try:
            cursor.execute(
                'INSERT OR IGNORE INTO custom_categories (name, created_at) VALUES (?, ?)',
                (cat_name, datetime.now().isoformat())
            )
        except sqlite3.IntegrityError:
            pass  # La catégorie existe déjà
    
    conn.commit()
    
    # Table d'historique des modifications d'items
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS item_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_serial_number TEXT NOT NULL,
            field_name TEXT NOT NULL,
            old_value TEXT,
            new_value TEXT,
            changed_at TEXT NOT NULL,
            FOREIGN KEY (item_serial_number) REFERENCES items(serial_number)
        )
    ''')
    
    # Table des notifications partagées
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message TEXT NOT NULL,
            type TEXT NOT NULL,
            item_serial_number TEXT,
            created_at TEXT NOT NULL
        )
    ''')
    
    conn.commit()
    
    # Nettoyer les notifications existantes pour éviter les problèmes d'encodage
    clean_existing_notifications()
    
    # Table des locations
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS rentals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            renter_name TEXT NOT NULL,
            renter_email TEXT NOT NULL,
            renter_phone TEXT NOT NULL,
            renter_address TEXT,
            rental_price REAL NOT NULL,
            rental_deposit REAL NOT NULL,
            rental_duration INTEGER NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'en_cours',
            items_data TEXT NOT NULL,
            attachments TEXT,
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    ''')
    
    # Ajouter colonnes manquantes à rentals
    cursor.execute("PRAGMA table_info(rentals)")
    rental_columns = [column[1] for column in cursor.fetchall()]
    
    rental_new_columns = {
        'attachments': 'TEXT',
        'notes': 'TEXT'
    }
    
    for col_name, col_type in rental_new_columns.items():
        if col_name not in rental_columns:
            try:
                cursor.execute(f'ALTER TABLE rentals ADD COLUMN {col_name} {col_type}')
                print(f'[DB] Colonne rentals.{col_name} ajoutée')
            except sqlite3.OperationalError as e:
                print(f'[DB] Erreur ajout colonne rentals.{col_name}: {e}')
    
    # Table des statuts personnalisés pour les locations
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS rental_statuses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT DEFAULT '#666',
            created_at TEXT NOT NULL
        )
    ''')
    
    # Insérer les statuts par défaut
    default_statuses = [
        ('en_cours', '#007bff'),
        ('contrat_envoye', '#ffc107'),
        ('fini', '#28a745')
    ]
    for status_name, color in default_statuses:
        cursor.execute('''
            INSERT OR IGNORE INTO rental_statuses (name, color, created_at)
            VALUES (?, ?, ?)
        ''', (status_name, color, datetime.now().isoformat()))
    
    # Index pour améliorer les performances
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_item_history_serial ON item_history(item_serial_number)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_rentals_start_date ON rentals(start_date)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_rentals_end_date ON rentals(end_date)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_rentals_status ON rentals(status)')
    
    conn.commit()
    conn.close()
    print(f"[OK] Base de donnees initialisee: {DB_PATH}")

# ==================== CONFIGURATION FRONTEND STATIQUE ====================

# Chemin vers le build du frontend Next.js
FRONTEND_BUILD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'horizon-ui-template', 'out')

def check_frontend_build():
    """Vérifier si le frontend est buildé"""
    if os.path.exists(FRONTEND_BUILD_DIR) and os.path.isdir(FRONTEND_BUILD_DIR):
        # Vérifier qu'il y a au moins un fichier index.html
        index_path = os.path.join(FRONTEND_BUILD_DIR, 'index.html')
        return os.path.exists(index_path)
    return False

FRONTEND_AVAILABLE = check_frontend_build()
if FRONTEND_AVAILABLE:
    print(f'[FRONTEND] Build trouvé dans: {FRONTEND_BUILD_DIR}')
else:
    print(f'[FRONTEND] Build non trouvé. Exécutez: cd horizon-ui-template && yarn build')

# ==================== ROUTES FRONTEND (fichiers statiques) ====================

@app.route('/')
def serve_index():
    """Servir la page d'accueil du frontend"""
    if FRONTEND_AVAILABLE:
        return send_from_directory(FRONTEND_BUILD_DIR, 'index.html')
    else:
        return '''
        <html>
        <head><title>Code Bar CRM - Build requis</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1>🔧 Frontend non buildé</h1>
            <p>Pour utiliser l'application, vous devez d'abord compiler le frontend :</p>
            <pre style="background: #f4f4f4; padding: 20px; display: inline-block; text-align: left;">
cd horizon-ui-template
yarn install
yarn build
            </pre>
            <p>Puis relancez le serveur :</p>
            <pre style="background: #f4f4f4; padding: 20px; display: inline-block;">python server.py</pre>
            <hr>
            <p>L'API est disponible sur <code>/api/*</code></p>
        </body>
        </html>
        ''', 200

@app.route('/favicon.ico')
def serve_favicon():
    """Servir le favicon"""
    if FRONTEND_AVAILABLE:
        favicon_path = os.path.join(FRONTEND_BUILD_DIR, 'favicon.ico')
        if os.path.exists(favicon_path):
            return send_from_directory(FRONTEND_BUILD_DIR, 'favicon.ico')
    return '', 204

@app.route('/logo-globalvision.png')
def serve_logo():
    """Servir le logo"""
    if os.path.exists('logo-globalvision.png'):
        return send_from_directory('.', 'logo-globalvision.png')
    return '', 404

# Route pour servir les fichiers statiques Next.js (_next, images, etc.)
@app.route('/_next/<path:filename>')
def serve_next_static(filename):
    """Servir les fichiers statiques Next.js (_next)"""
    if FRONTEND_AVAILABLE:
        return send_from_directory(os.path.join(FRONTEND_BUILD_DIR, '_next'), filename)
    return '', 404

@app.route('/fonts/<path:filename>')
def serve_fonts(filename):
    """Servir les polices"""
    if FRONTEND_AVAILABLE:
        fonts_dir = os.path.join(FRONTEND_BUILD_DIR, 'fonts')
        if os.path.exists(fonts_dir):
            return send_from_directory(fonts_dir, filename)
    return '', 404

@app.route('/img/<path:filename>')
def serve_images(filename):
    """Servir les images"""
    if FRONTEND_AVAILABLE:
        img_dir = os.path.join(FRONTEND_BUILD_DIR, 'img')
        if os.path.exists(img_dir):
            return send_from_directory(img_dir, filename)
    return '', 404

# Route catch-all pour les pages du frontend (doit être APRÈS les routes API)
@app.route('/<path:path>')
def serve_frontend_pages(path):
    """Servir les pages du frontend (catch-all)"""
    if not FRONTEND_AVAILABLE:
        return '', 404
    
    # Ne pas intercepter les routes API
    if path.startswith('api/'):
        return '', 404
    
    # Essayer de servir le fichier directement
    file_path = os.path.join(FRONTEND_BUILD_DIR, path)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        directory = os.path.dirname(file_path)
        filename = os.path.basename(file_path)
        return send_from_directory(directory, filename)
    
    # Essayer avec .html
    html_path = os.path.join(FRONTEND_BUILD_DIR, f'{path}.html')
    if os.path.exists(html_path):
        directory = os.path.dirname(html_path)
        filename = os.path.basename(html_path)
        return send_from_directory(directory, filename)
    
    # Essayer comme dossier avec index.html
    index_path = os.path.join(FRONTEND_BUILD_DIR, path, 'index.html')
    if os.path.exists(index_path):
        return send_from_directory(os.path.join(FRONTEND_BUILD_DIR, path), 'index.html')
    
    # Fallback: retourner index.html pour le routing côté client
    return send_from_directory(FRONTEND_BUILD_DIR, 'index.html')

# ==================== API ITEMS ====================

@app.route('/api/items', methods=['GET'])
def get_items():
    """Récupérer tous les items"""
    try:
        print('[API] GET /api/items - Récupération des items...')
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM items ORDER BY last_updated DESC')
        rows = cursor.fetchall()
        conn.close()
        
        items = []
        for row in rows:
            # Convertir le Row en dict pour accès sécurisé
            row_dict = dict(row)
            # Parser custom_data JSON
            custom_data = {}
            if row_dict.get('custom_data'):
                try:
                    custom_data = json.loads(row_dict['custom_data'])
                except:
                    pass
            
            items.append({
                'id': row_dict.get('id'),
                'itemId': row_dict.get('item_id'),
                'name': row_dict.get('name'),
                'serialNumber': row_dict.get('serial_number'),
                'quantity': row_dict.get('quantity', 1),
                'category': row_dict.get('category'),
                'categoryDetails': row_dict.get('category_details'),
                'image': row_dict.get('image'),
                'scannedCode': row_dict.get('scanned_code'),
                'status': row_dict.get('status', 'en_stock'),
                'itemType': row_dict.get('item_type'),
                'brand': row_dict.get('brand'),
                'model': row_dict.get('model'),
                'rentalEndDate': row_dict.get('rental_end_date'),
                'currentRentalId': row_dict.get('current_rental_id'),
                'customData': custom_data,
                'createdAt': row_dict.get('created_at'),
                'lastUpdated': row_dict.get('last_updated')
            })
        
        print(f'[API] GET /api/items - {len(items)} items retournés')
        return jsonify({'success': True, 'items': items}), 200
    except Exception as e:
        print(f'[API] ERREUR GET /api/items: {str(e)}')
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': sanitize_error(e)}), 500

@app.route('/api/items/search', methods=['GET'])
def search_item():
    """Rechercher un item par numéro de série ou code-barres"""
    try:
        query = request.args.get('q', '').strip()
        if not query:
            return jsonify({'success': False, 'error': 'Paramètre de recherche manquant'}), 400
        
        print(f'[API] GET /api/items/search - Recherche: {query}')
        conn = get_db()
        cursor = conn.cursor()
        
        # Rechercher par numéro de série exact ou par code scanné
        cursor.execute('''
            SELECT * FROM items 
            WHERE serial_number = ? OR scanned_code = ? OR item_id = ?
            LIMIT 1
        ''', (query, query, query))
        
        row = cursor.fetchone()
        conn.close()
        
        if row:
            row_dict = dict(row)
            item = {
                'id': row_dict.get('id'),
                'itemId': row_dict.get('item_id'),
                'name': row_dict.get('name'),
                'serialNumber': row_dict.get('serial_number'),
                'quantity': row_dict.get('quantity', 1),
                'category': row_dict.get('category'),
                'categoryDetails': row_dict.get('category_details'),
                'image': row_dict.get('image'),
                'scannedCode': row_dict.get('scanned_code'),
                'status': row_dict.get('status', 'en_stock'),
                'itemType': row_dict.get('item_type'),
                'brand': row_dict.get('brand'),
                'model': row_dict.get('model'),
                'rentalEndDate': row_dict.get('rental_end_date'),
                'currentRentalId': row_dict.get('current_rental_id'),
                'createdAt': row_dict.get('created_at'),
                'lastUpdated': row_dict.get('last_updated')
            }
            print(f'[API] GET /api/items/search - Item trouvé: {item["name"]}')
            return jsonify({'success': True, 'found': True, 'item': item}), 200
        else:
            print(f'[API] GET /api/items/search - Aucun item trouvé')
            return jsonify({'success': True, 'found': False, 'item': None}), 200
            
    except Exception as e:
        print(f'[API] ERREUR GET /api/items/search: {str(e)}')
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': sanitize_error(e)}), 500

@app.route('/api/items', methods=['POST'])
def create_item():
    """Créer ou mettre à jour un item"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Données JSON invalides'}), 400
        
        print(f'[API] POST /api/items - Données reçues: {data}')
        
        # Validation des champs requis
        missing_fields = validate_required_fields(data, ['name', 'serialNumber'])
        if missing_fields:
            print(f'[API] ERREUR: Champs manquants: {missing_fields}')
            return jsonify({'success': False, 'error': f'Champs obligatoires manquants: {", ".join(missing_fields)}'}), 400
        
        # Sanitization des données
        data['name'] = sanitize_string(data.get('name'), 200)
        data['serialNumber'] = sanitize_string(data.get('serialNumber'), 100)
        data['brand'] = sanitize_string(data.get('brand'), 100)
        data['model'] = sanitize_string(data.get('model'), 100)
        data['category'] = sanitize_string(data.get('category'), 50)
        data['categoryDetails'] = sanitize_string(data.get('categoryDetails'), 1000)
        
        # Validation de la quantité
        quantity = data.get('quantity', 1)
        if not validate_positive_number(quantity, allow_zero=False):
            return jsonify({'success': False, 'error': 'La quantité doit être un nombre positif'}), 400
        data['quantity'] = int(quantity)
        
        if not data.get('name') or not data.get('serialNumber'):
            print('[API] ERREUR: Nom ou numéro de série manquant après sanitization')
            return jsonify({'success': False, 'error': 'Le nom et le numéro de série sont obligatoires'}), 400
        
        now = datetime.now().isoformat()
        conn = get_db()
        cursor = conn.cursor()
        
        # Vérifier si l'item existe déjà
        cursor.execute('SELECT * FROM items WHERE serial_number = ?', (data['serialNumber'],))
        existing = cursor.fetchone()
        
        if existing:
            print(f'[API] Item existant trouvé (ID: {existing["id"]}), mise à jour...')
            # Mettre à jour l'item existant (ajouter la quantité)
            quantity_to_add = data.get('quantity', 1)
            old_quantity = existing['quantity']
            new_quantity = old_quantity + quantity_to_add
            
            # Enregistrer l'historique de la modification de quantité
            if quantity_to_add > 0:
                cursor.execute('''
                    INSERT INTO item_history (item_serial_number, field_name, old_value, new_value, changed_at)
                    VALUES (?, ?, ?, ?, ?)
                ''', (
                    data['serialNumber'],
                    'quantity',
                    str(old_quantity),
                    str(new_quantity),
                    now
                ))
            
            # Préparer custom_data
            custom_data = data.get('customData')
            custom_data_json = json.dumps(custom_data) if custom_data else None
            
            cursor.execute('''
                UPDATE items 
                SET name = ?, quantity = ?, category = ?, category_details = ?, 
                    image = ?, scanned_code = ?, item_type = ?, brand = ?, model = ?, custom_data = ?, last_updated = ?
                WHERE serial_number = ?
            ''', (
                data['name'],
                new_quantity,
                data.get('category'),
                data.get('categoryDetails'),
                data.get('image'),
                data.get('scannedCode', data['serialNumber']),
                data.get('itemType'),
                data.get('brand'),
                data.get('model'),
                custom_data_json,
                now,
                data['serialNumber']
            ))
            item_id = existing['id']
            print(f'[API] Item mis à jour (ID: {item_id}, quantité: {new_quantity})')
        else:
            print('[API] Nouvel item, création...')
            # Générer un nouvel item_id
            item_id_code = generate_next_item_id(cursor)
            print(f'[API] Nouvel item_id généré: {item_id_code}')
            
            # Préparer custom_data pour nouvel item
            custom_data = data.get('customData')
            custom_data_json = json.dumps(custom_data) if custom_data else None
            
            # Créer un nouvel item
            cursor.execute('''
                INSERT INTO items (item_id, name, serial_number, quantity, category, category_details, 
                                 image, scanned_code, item_type, brand, model, status, custom_data, created_at, last_updated)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                item_id_code,
                data['name'],
                data['serialNumber'],
                data.get('quantity', 1),
                data.get('category'),
                data.get('categoryDetails'),
                data.get('image'),
                data.get('scannedCode', data['serialNumber']),
                data.get('itemType'),
                data.get('brand'),
                data.get('model'),
                'en_stock',
                custom_data_json,
                now,
                now
            ))
            item_id = cursor.lastrowid
            
            # Enregistrer la création dans l'historique
            cursor.execute('''
                INSERT INTO item_history (item_serial_number, field_name, old_value, new_value, changed_at)
                VALUES (?, ?, ?, ?, ?)
            ''', (
                data['serialNumber'],
                'created',
                None,
                'Item créé',
                now
            ))
            
            print(f'[API] Nouvel item créé (ID: {item_id})')
        
        # Créer une notification avec heure
        try:
            time_str = datetime.now().strftime('%H:%M:%S')
            date_str = datetime.now().strftime('%d/%m/%Y')
        except:
            time_str = datetime.now().strftime('%H:%M:%S')
            date_str = datetime.now().strftime('%d/%m/%Y')
        
        if existing:
            create_notification(
                f'📊 Modification de quantité - Item "{data["name"]}" ({data["serialNumber"]}) : {old_quantity} -> {new_quantity} | {date_str} {time_str}',
                'success',
                data['serialNumber'],
                conn,
                cursor
            )
        else:
            create_notification(
                f'✨ Nouvel item créé - "{data["name"]}" ({data["serialNumber"]}) | {date_str} {time_str}',
                'success',
                data['serialNumber'],
                conn,
                cursor
            )
        
        conn.commit()
        conn.close()
        
        # Diffuser l'événement à tous les clients
        broadcast_event('items_changed', {'action': 'created' if not existing else 'updated', 'id': item_id})
        broadcast_event('notifications_changed', {})
        
        print(f'[API] POST /api/items - Succès (ID: {item_id})')
        return jsonify({'success': True, 'id': item_id}), 201
    except Exception as e:
        print(f'[API] ERREUR POST /api/items: {str(e)}')
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': sanitize_error(e)}), 500

@app.route('/api/items/<serial_number>', methods=['PUT'])
def update_item(serial_number):
    """Mettre à jour un item"""
    try:
        data = request.get_json()
        conn = get_db()
        cursor = conn.cursor()
        
        # Récupérer l'item existant pour comparer les valeurs
        cursor.execute('SELECT * FROM items WHERE serial_number = ?', (serial_number,))
        existing = cursor.fetchone()
        if not existing:
            conn.close()
            return jsonify({'success': False, 'error': 'Item non trouvé'}), 404
        
        now = datetime.now().isoformat()
        
        # Mapping des champs API vers colonnes DB
        field_mapping = {
            'name': 'name',
            'quantity': 'quantity',
            'category': 'category',
            'categoryDetails': 'category_details',
            'image': 'image',
            'scannedCode': 'scanned_code',
            'serialNumber': 'serial_number',
            'brand': 'brand',
            'model': 'model',
            'itemType': 'item_type',
            'status': 'status'
        }
        
        # Construire la requête de mise à jour et enregistrer l'historique
        update_fields = []
        update_values = []
        history_entries = []
        
        for api_field, db_column in field_mapping.items():
            if api_field in data:
                old_value = existing[db_column] if existing else None
                new_value = data[api_field]
                
                # Convertir en string pour la comparaison
                old_val_str = str(old_value) if old_value is not None else None
                new_val_str = str(new_value) if new_value is not None else None
                
                # Enregistrer dans l'historique si la valeur a changé
                if old_val_str != new_val_str:
                    update_fields.append(f'{db_column} = ?')
                    update_values.append(new_value)
                    
                    # Enregistrer dans l'historique
                    history_entries.append({
                        'item_serial_number': serial_number,
                        'field_name': api_field,
                        'old_value': old_val_str,
                        'new_value': new_val_str,
                        'changed_at': now
                    })
        
        # Gérer customData (champs personnalisés)
        if 'customData' in data:
            old_custom_data = {}
            if existing.get('custom_data'):
                try:
                    old_custom_data = json.loads(existing['custom_data'])
                except:
                    pass
            
            new_custom_data = data.get('customData', {})
            
            # Comparer chaque champ personnalisé
            all_custom_keys = set(list(old_custom_data.keys()) + list(new_custom_data.keys()))
            for custom_key in all_custom_keys:
                old_val = old_custom_data.get(custom_key)
                new_val = new_custom_data.get(custom_key)
                
                old_val_str = str(old_val) if old_val is not None else None
                new_val_str = str(new_val) if new_val is not None else None
                
                if old_val_str != new_val_str:
                    history_entries.append({
                        'item_serial_number': serial_number,
                        'field_name': f'custom_{custom_key}',
                        'old_value': old_val_str,
                        'new_value': new_val_str,
                        'changed_at': now
                    })
            
            # Mettre à jour custom_data dans la base
            custom_data_json = json.dumps(new_custom_data) if new_custom_data else None
            update_fields.append('custom_data = ?')
            update_values.append(custom_data_json)
        
        # Si le serialNumber change, mettre à jour la référence dans l'historique
        if 'serialNumber' in data and data['serialNumber'] != serial_number:
            new_serial = data['serialNumber']
            # Mettre à jour les références dans l'historique
            cursor.execute('UPDATE item_history SET item_serial_number = ? WHERE item_serial_number = ?', 
                         (new_serial, serial_number))
        
        if update_fields:
            update_fields.append('last_updated = ?')
            update_values.append(now)
            update_values.append(serial_number)
            
            cursor.execute(
                f'UPDATE items SET {", ".join(update_fields)} WHERE serial_number = ?',
                update_values
            )
            
            # Enregistrer l'historique et créer des notifications
            item_name = existing['name']
            for entry in history_entries:
                cursor.execute('''
                    INSERT INTO item_history (item_serial_number, field_name, old_value, new_value, changed_at)
                    VALUES (?, ?, ?, ?, ?)
                ''', (
                    entry['item_serial_number'],
                    entry['field_name'],
                    entry['old_value'],
                    entry['new_value'],
                    entry['changed_at']
                ))
                
                # Créer une notification pour chaque modification
                field_labels = {
                    'name': 'Nom',
                    'quantity': 'Quantité',
                    'category': 'Catégorie',
                    'categoryDetails': 'Détails',
                    'serialNumber': 'Numéro de série',
                    'scannedCode': 'Code scanné',
                    'brand': 'Marque',
                    'model': 'Modèle',
                    'itemType': 'Type',
                    'status': 'Statut',
                    'image': 'Image'
                }
                
                # Gérer les champs personnalisés
                field_name = entry['field_name']
                if field_name.startswith('custom_'):
                    # Récupérer le nom du champ personnalisé depuis la base
                    custom_key = field_name.replace('custom_', '')
                    cursor.execute('SELECT name FROM custom_fields WHERE field_key = ?', (custom_key,))
                    custom_field = cursor.fetchone()
                    field_label = custom_field['name'] if custom_field else custom_key
                else:
                    field_label = field_labels.get(field_name, field_name)
                
                # Formater l'heure complète
                try:
                    changed_time = datetime.fromisoformat(entry['changed_at'].replace('Z', '+00:00'))
                    time_str = changed_time.strftime('%H:%M:%S')
                    date_str = changed_time.strftime('%d/%m/%Y')
                except:
                    changed_time = datetime.now()
                    time_str = changed_time.strftime('%H:%M:%S')
                    date_str = changed_time.strftime('%d/%m/%Y')
                
                old_val_display = entry['old_value'] if entry['old_value'] else 'vide'
                new_val_display = entry['new_value'] if entry['new_value'] else 'vide'
                
                # Formater le message avec tous les détails
                if field_name == 'quantity':
                    notification_msg = f'📊 Modification de {field_label} - Item "{item_name}" ({serial_number}) : {old_val_display} -> {new_val_display} | {date_str} {time_str}'
                elif field_name == 'name':
                    notification_msg = f'✏️ Modification de {field_label} - Item "{old_val_display}" ({serial_number}) -> "{new_val_display}" | {date_str} {time_str}'
                elif field_name == 'category':
                    notification_msg = f'🏷️ Modification de {field_label} - Item "{item_name}" ({serial_number}) : {old_val_display or "aucune"} -> {new_val_display} | {date_str} {time_str}'
                elif field_name == 'status':
                    notification_msg = f'🔄 Modification de {field_label} - Item "{item_name}" ({serial_number}) : {old_val_display} -> {new_val_display} | {date_str} {time_str}'
                elif field_name.startswith('custom_'):
                    notification_msg = f'📝 Modification de {field_label} - Item "{item_name}" ({serial_number}) : {old_val_display} -> {new_val_display} | {date_str} {time_str}'
                else:
                    notification_msg = f'✏️ Modification de {field_label} - Item "{item_name}" ({serial_number}) : {old_val_display} -> {new_val_display} | {date_str} {time_str}'
                
                create_notification(notification_msg, 'success', serial_number, conn, cursor)
        
        conn.commit()
        conn.close()
        
        # Diffuser l'événement à tous les clients
        broadcast_event('items_changed', {'action': 'updated', 'serialNumber': serial_number})
        broadcast_event('notifications_changed', {})
        
        return jsonify({'success': True}), 200
    except Exception as e:
        print(f'[API] ERREUR PUT /api/items/{serial_number}: {str(e)}')
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': sanitize_error(e)}), 500

@app.route('/api/events', methods=['GET'])
def stream_events():
    """Stream Server-Sent Events pour la synchronisation en temps réel"""
    def event_stream():
        # Créer une queue pour ce client (taille limitée pour éviter l'accumulation)
        client_queue = queue.Queue(maxsize=10)
        
        with clients_lock:
            clients.append(client_queue)
        
        try:
            # Envoyer un message de connexion
            yield f"data: {json.dumps({'type': 'connected', 'data': {}})}\n\n"
            
            # Garder la connexion ouverte et envoyer les événements
            while True:
                try:
                    # Attendre un événement avec timeout pour vérifier la connexion
                    message = client_queue.get(timeout=30)
                    yield message
                except queue.Empty:
                    # Envoyer un keepalive pour maintenir la connexion
                    yield ": keepalive\n\n"
        except GeneratorExit:
            # Client déconnecté
            pass
        finally:
            # Retirer le client de la liste
            with clients_lock:
                if client_queue in clients:
                    clients.remove(client_queue)
    
    return Response(event_stream(), mimetype='text/event-stream', headers={
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        'Connection': 'keep-alive'
    })

@app.route('/api/items/<serial_number>/history', methods=['GET'])
def get_item_history(serial_number):
    """Récupérer l'historique des modifications d'un item"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT field_name, old_value, new_value, changed_at
            FROM item_history
            WHERE item_serial_number = ?
            ORDER BY changed_at DESC
            LIMIT 10
        ''', (serial_number,))
        
        rows = cursor.fetchall()
        history = [{
            'fieldName': row['field_name'],
            'oldValue': row['old_value'],
            'newValue': row['new_value'],
            'changedAt': row['changed_at']
        } for row in rows]
        
        conn.close()
        return jsonify({'success': True, 'history': history}), 200
    except Exception as e:
        print(f'[API] ERREUR GET /api/items/{serial_number}/history: {str(e)}')
        return jsonify({'success': False, 'error': sanitize_error(e)}), 500

@app.route('/api/items/<serial_number>', methods=['DELETE'])
def delete_item(serial_number):
    """Supprimer un item"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Récupérer le nom de l'item avant suppression
        cursor.execute('SELECT name FROM items WHERE serial_number = ?', (serial_number,))
        item = cursor.fetchone()
        item_name = item['name'] if item else 'Item'
        
        cursor.execute('DELETE FROM items WHERE serial_number = ?', (serial_number,))
        
        if cursor.rowcount == 0:
            conn.close()
            return jsonify({'success': False, 'error': 'Item non trouvé'}), 404
        
        # Créer une notification avec heure
        try:
            time_str = datetime.now().strftime('%H:%M:%S')
            date_str = datetime.now().strftime('%d/%m/%Y')
        except:
            time_str = datetime.now().strftime('%H:%M:%S')
            date_str = datetime.now().strftime('%d/%m/%Y')
        
        create_notification(
            f'🗑️ Item supprimé - "{item_name}" ({serial_number}) | {date_str} {time_str}',
            'success',
            serial_number,
            conn,
            cursor
        )
        
        conn.commit()
        conn.close()
        
        # Diffuser l'événement à tous les clients
        broadcast_event('items_changed', {'action': 'deleted', 'serialNumber': serial_number})
        broadcast_event('notifications_changed', {})
        
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': sanitize_error(e)}), 500

# ==================== API CATEGORIES ====================

@app.route('/api/categories', methods=['GET'])
def get_categories():
    """Récupérer toutes les catégories disponibles"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('SELECT name FROM custom_categories')
        custom_categories = [row['name'] for row in cursor.fetchall()]
        
        cursor.execute('SELECT name FROM deleted_categories')
        deleted_categories = [row['name'] for row in cursor.fetchall()]
        
        conn.close()
        
        default_categories = [
            'materiel', 
            'drone', 
            'video', 
            'audio', 
            'streaming', 
            'robot', 
            'ordinateur',
            'casque_vr',
            'camera',
            'eclairage',
            'accessoire',
            'autre'
        ]
        available_default = [c for c in default_categories if c not in deleted_categories]
        available_custom = [c for c in custom_categories if c not in deleted_categories]
        
        return jsonify({
            'success': True,
            'categories': available_default + available_custom,
            'customCategories': custom_categories,
            'deletedCategories': deleted_categories
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': sanitize_error(e)}), 500

@app.route('/api/categories', methods=['POST'])
def create_category():
    """Créer une nouvelle catégorie"""
    try:
        data = request.get_json()
        category_name = data.get('name', '').lower().strip()
        
        if not category_name:
            return jsonify({'success': False, 'error': 'Le nom de la catégorie est obligatoire'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Vérifier si la catégorie est supprimée (réactivation)
        cursor.execute('SELECT * FROM deleted_categories WHERE name = ?', (category_name,))
        if cursor.fetchone():
            cursor.execute('DELETE FROM deleted_categories WHERE name = ?', (category_name,))
            conn.commit()
            conn.close()
            return jsonify({'success': True, 'message': 'Catégorie réactivée'}), 200
        
        # Créer la catégorie
        cursor.execute(
            'INSERT INTO custom_categories (name, created_at) VALUES (?, ?)',
            (category_name, datetime.now().isoformat())
        )
        
        # Créer une notification
        create_notification(f'Catégorie "{category_name}" ajoutée', 'success', None, conn, cursor)
        
        conn.commit()
        conn.close()
        
        # Diffuser l'événement à tous les clients
        broadcast_event('categories_changed', {'action': 'created', 'category': category_name})
        broadcast_event('notifications_changed', {})
        
        return jsonify({'success': True}), 201
    except sqlite3.IntegrityError:
        return jsonify({'success': False, 'error': 'Cette catégorie existe déjà'}), 409
    except Exception as e:
        return jsonify({'success': False, 'error': sanitize_error(e)}), 500

@app.route('/api/categories/<category_name>', methods=['DELETE'])
def delete_category(category_name):
    """Supprimer une catégorie"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM deleted_categories WHERE name = ?', (category_name,))
        if not cursor.fetchone():
            cursor.execute(
                'INSERT INTO deleted_categories (name, deleted_at) VALUES (?, ?)',
                (category_name, datetime.now().isoformat())
            )
        
        cursor.execute('DELETE FROM custom_categories WHERE name = ?', (category_name,))
        
        cursor.execute(
            'UPDATE items SET category = ?, last_updated = ? WHERE category = ?',
            ('autre', datetime.now().isoformat(), category_name)
        )
        
        updated_count = cursor.rowcount
        
        # Créer une notification
        create_notification(f'Catégorie "{category_name}" supprimée. {updated_count} item(s) mis à jour.', 'success', None, conn, cursor)
        
        conn.commit()
        conn.close()
        
        # Diffuser l'événement à tous les clients (les items ont été modifiés)
        broadcast_event('items_changed', {'action': 'category_deleted', 'category': category_name, 'updatedCount': updated_count})
        broadcast_event('categories_changed', {'action': 'deleted', 'category': category_name})
        broadcast_event('notifications_changed', {})
        
        return jsonify({
            'success': True,
            'message': f'Catégorie supprimée. {updated_count} item(s) mis à jour.'
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': sanitize_error(e)}), 500

# ==================== API CUSTOM FIELDS (Colonnes personnalisées) ====================

@app.route('/api/custom-fields', methods=['GET'])
def get_custom_fields():
    """Récupérer tous les champs personnalisés"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, name, field_key, field_type, options, required, display_order, created_at
            FROM custom_fields
            ORDER BY display_order ASC, name ASC
        ''')
        
        rows = cursor.fetchall()
        fields = [{
            'id': row['id'],
            'name': row['name'],
            'fieldKey': row['field_key'],
            'fieldType': row['field_type'],
            'options': json.loads(row['options']) if row['options'] else None,
            'required': bool(row['required']),
            'displayOrder': row['display_order'],
            'createdAt': row['created_at']
        } for row in rows]
        
        conn.close()
        return jsonify({'success': True, 'fields': fields}), 200
    except Exception as e:
        print(f'[API] ERREUR GET /api/custom-fields: {str(e)}')
        return jsonify({'success': False, 'error': sanitize_error(e)}), 500

@app.route('/api/custom-fields', methods=['POST'])
def create_custom_field():
    """Créer un nouveau champ personnalisé"""
    try:
        data = request.get_json()
        name = data.get('name', '').strip()
        field_type = data.get('fieldType', 'text')
        options = data.get('options')  # Pour les champs de type 'select'
        required = data.get('required', False)
        
        if not name:
            return jsonify({'success': False, 'error': 'Le nom du champ est obligatoire'}), 400
        
        # Générer une clé unique à partir du nom
        field_key = re.sub(r'[^a-z0-9]', '_', name.lower())
        field_key = re.sub(r'_+', '_', field_key).strip('_')
        
        # Vérifier que le type est valide
        valid_types = ['text', 'number', 'date', 'select', 'checkbox', 'textarea', 'url', 'email']
        if field_type not in valid_types:
            return jsonify({'success': False, 'error': f'Type invalide. Types valides: {", ".join(valid_types)}'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Récupérer le prochain ordre d'affichage
        cursor.execute('SELECT MAX(display_order) FROM custom_fields')
        max_order = cursor.fetchone()[0] or 0
        
        cursor.execute('''
            INSERT INTO custom_fields (name, field_key, field_type, options, required, display_order, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            name,
            field_key,
            field_type,
            json.dumps(options) if options else None,
            1 if required else 0,
            max_order + 1,
            datetime.now().isoformat()
        ))
        
        field_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        print(f'[API] Champ personnalisé créé: {name} (type: {field_type})')
        
        # Diffuser l'événement
        broadcast_event('custom_fields_changed', {'action': 'created', 'fieldId': field_id, 'name': name})
        
        return jsonify({
            'success': True,
            'id': field_id,
            'fieldKey': field_key
        }), 201
        
    except sqlite3.IntegrityError:
        return jsonify({'success': False, 'error': 'Un champ avec ce nom existe déjà'}), 409
    except Exception as e:
        print(f'[API] ERREUR POST /api/custom-fields: {str(e)}')
        return jsonify({'success': False, 'error': sanitize_error(e)}), 500

@app.route('/api/custom-fields/<int:field_id>', methods=['PUT'])
def update_custom_field(field_id):
    """Mettre à jour un champ personnalisé"""
    try:
        data = request.get_json()
        name = data.get('name', '').strip()
        field_type = data.get('fieldType')
        options = data.get('options')
        required = data.get('required')
        display_order = data.get('displayOrder')
        
        conn = get_db()
        cursor = conn.cursor()
        
        # Construire la requête de mise à jour dynamiquement
        updates = []
        params = []
        
        if name:
            updates.append('name = ?')
            params.append(name)
            # Mettre à jour aussi la clé
            field_key = re.sub(r'[^a-z0-9]', '_', name.lower())
            field_key = re.sub(r'_+', '_', field_key).strip('_')
            updates.append('field_key = ?')
            params.append(field_key)
        
        if field_type:
            updates.append('field_type = ?')
            params.append(field_type)
        
        if options is not None:
            updates.append('options = ?')
            params.append(json.dumps(options) if options else None)
        
        if required is not None:
            updates.append('required = ?')
            params.append(1 if required else 0)
        
        if display_order is not None:
            updates.append('display_order = ?')
            params.append(display_order)
        
        if not updates:
            return jsonify({'success': False, 'error': 'Aucune donnée à mettre à jour'}), 400
        
        params.append(field_id)
        cursor.execute(f'''
            UPDATE custom_fields
            SET {', '.join(updates)}
            WHERE id = ?
        ''', params)
        
        if cursor.rowcount == 0:
            conn.close()
            return jsonify({'success': False, 'error': 'Champ non trouvé'}), 404
        
        conn.commit()
        conn.close()
        
        # Diffuser l'événement
        broadcast_event('custom_fields_changed', {'action': 'updated', 'fieldId': field_id})
        
        return jsonify({'success': True}), 200
        
    except Exception as e:
        print(f'[API] ERREUR PUT /api/custom-fields/{field_id}: {str(e)}')
        return jsonify({'success': False, 'error': sanitize_error(e)}), 500

@app.route('/api/custom-fields/<int:field_id>', methods=['DELETE'])
def delete_custom_field(field_id):
    """Supprimer un champ personnalisé"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Récupérer le nom du champ avant suppression
        cursor.execute('SELECT name, field_key FROM custom_fields WHERE id = ?', (field_id,))
        field = cursor.fetchone()
        
        if not field:
            conn.close()
            return jsonify({'success': False, 'error': 'Champ non trouvé'}), 404
        
        field_name = field['name']
        field_key = field['field_key']
        
        # Supprimer le champ de la table custom_fields
        cursor.execute('DELETE FROM custom_fields WHERE id = ?', (field_id,))
        
        # Optionnel: Supprimer les données de ce champ dans tous les items
        # (on garde les données pour l'instant, au cas où)
        
        conn.commit()
        conn.close()
        
        print(f'[API] Champ personnalisé supprimé: {field_name}')
        
        # Diffuser l'événement
        broadcast_event('custom_fields_changed', {'action': 'deleted', 'fieldId': field_id, 'fieldKey': field_key})
        
        return jsonify({'success': True}), 200
        
    except Exception as e:
        print(f'[API] ERREUR DELETE /api/custom-fields/{field_id}: {str(e)}')
        return jsonify({'success': False, 'error': sanitize_error(e)}), 500

# ==================== API NOTIFICATIONS ====================

@app.route('/api/notifications', methods=['GET'])
def get_notifications():
    """Récupérer les notifications"""
    try:
        print('[API] GET /api/notifications - Récupération des notifications...')
        conn = get_db()
        cursor = conn.cursor()
        
        # Récupérer les 50 dernières notifications
        cursor.execute('''
            SELECT id, message, type, item_serial_number, created_at
            FROM notifications
            ORDER BY created_at DESC
            LIMIT 50
        ''')
        
        rows = cursor.fetchall()
        notifications = []
        
        # Traiter chaque notification individuellement pour gérer les erreurs d'encodage
        for row in rows:
            try:
                # Récupérer le message et le sanitizer
                raw_message = row['message']
                if raw_message is None:
                    raw_message = ''
                
                # Sanitizer le message pour éviter les problèmes d'encodage
                clean_message = sanitize_notification_message(raw_message)
                
                notifications.append({
                    'id': row['id'],
                    'message': clean_message,
                    'type': row['type'],
                    'itemSerialNumber': row['item_serial_number'],
                    'timestamp': row['created_at'],
                    'created_at': row['created_at']  # Alias pour compatibilité
                })
            except Exception as msg_error:
                # Si une notification spécifique cause une erreur, la remplacer par un message par défaut
                print(f'[API] Erreur lors du traitement d\'une notification (ID: {row.get("id", "unknown")}): {str(msg_error)}')
                notifications.append({
                    'id': row.get('id', 0),
                    'message': 'Message de notification (erreur d\'encodage)',
                    'type': row.get('type', 'info'),
                    'itemSerialNumber': row.get('item_serial_number'),
                    'timestamp': row.get('created_at', ''),
                    'created_at': row.get('created_at', '')
                })
        
        conn.close()
        print(f'[API] GET /api/notifications - {len(notifications)} notifications retournées')
        # Ne pas afficher les messages dans la console car ils peuvent contenir des caractères Unicode
        # qui causent des erreurs d'encodage sur Windows
        return jsonify({'success': True, 'notifications': notifications}), 200
    except Exception as e:
        # Gérer les erreurs d'encodage de manière plus robuste
        error_msg = str(e)
        # Essayer de convertir l'erreur en ASCII si elle contient des caractères Unicode
        try:
            error_msg = error_msg.encode('ascii', errors='replace').decode('ascii')
        except:
            error_msg = 'Erreur lors de la récupération des notifications'
        
        print(f'[API] ERREUR GET /api/notifications: {error_msg}')
        import traceback
        try:
            traceback.print_exc()
        except:
            # Si même l'affichage de la traceback échoue, ignorer
            pass
        
        return jsonify({'success': False, 'error': sanitize_error(error_msg)}), 500

@app.route('/api/notifications/<int:notification_id>', methods=['DELETE'])
def delete_notification(notification_id):
    """Supprimer une notification spécifique"""
    try:
        print(f'[API] DELETE /api/notifications/{notification_id} - Suppression de la notification...')
        conn = get_db()
        cursor = conn.cursor()
        
        # Vérifier que la notification existe
        cursor.execute('SELECT id FROM notifications WHERE id = ?', (notification_id,))
        if not cursor.fetchone():
            conn.close()
            print(f'[API] DELETE /api/notifications/{notification_id} - Notification non trouvée')
            return jsonify({'success': False, 'error': 'Notification non trouvée'}), 404
        
        # Supprimer la notification
        cursor.execute('DELETE FROM notifications WHERE id = ?', (notification_id,))
        
        conn.commit()
        conn.close()
        
        print(f'[API] DELETE /api/notifications/{notification_id} - Notification supprimée avec succès')
        
        # Diffuser l'événement
        broadcast_event('notifications_changed', {})
        
        return jsonify({'success': True}), 200
    except Exception as e:
        print(f'[API] ERREUR DELETE /api/notifications/{notification_id}: {str(e)}')
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': sanitize_error(e)}), 500

@app.route('/api/notifications', methods=['DELETE'])
def clear_notifications():
    """Effacer toutes les notifications"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('DELETE FROM notifications')
        
        conn.commit()
        conn.close()
        
        # Diffuser l'événement
        broadcast_event('notifications_changed', {})
        
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': sanitize_error(e)}), 500

# ==================== PROXY POUR APIs EXTERNES ====================

@app.route('/api/proxy/gtinsearch', methods=['GET'])
def proxy_gtinsearch():
    """Proxy pour recherche de produit par code-barres (avec fallback multi-APIs)"""
    try:
        gtin = request.args.get('gtin')
        if not gtin:
            return jsonify({'success': False, 'error': 'Paramètre gtin manquant'}), 400
        
        print(f'[Proxy] Recherche produit pour code: {gtin}')
        
        # Headers communs pour simuler un navigateur
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
            'Referer': 'https://www.google.com/',
        }
        
        # 1. Essayer Open Food Facts d'abord (gratuit, pas de limite)
        try:
            print(f'[Proxy] Essai Open Food Facts...')
            off_url = f'https://world.openfoodfacts.org/api/v0/product/{gtin}.json'
            off_response = requests.get(off_url, timeout=8, headers=headers)
            
            if off_response.status_code == 200:
                off_data = off_response.json()
                if off_data.get('status') == 1 and off_data.get('product'):
                    product = off_data['product']
                    name = product.get('product_name') or product.get('product_name_fr') or product.get('generic_name')
                    if name:
                        print(f'[Proxy] Open Food Facts: trouvé "{name}"')
                        return jsonify({
                            'success': True,
                            'name': name,
                            'brand': product.get('brands', ''),
                            'category': product.get('categories', ''),
                            'image': product.get('image_url', ''),
                            'source': 'Open Food Facts'
                        }), 200
        except Exception as e:
            print(f'[Proxy] Open Food Facts erreur: {str(e)}')
        
        # 2. Essayer UPC Item DB (gratuit, limité)
        try:
            print(f'[Proxy] Essai UPC Item DB...')
            upc_url = f'https://api.upcitemdb.com/prod/trial/lookup?upc={gtin}'
            upc_response = requests.get(upc_url, timeout=8, headers={
                **headers,
                'Accept': 'application/json',
            })
            
            if upc_response.status_code == 200:
                upc_data = upc_response.json()
                if upc_data.get('items') and len(upc_data['items']) > 0:
                    item = upc_data['items'][0]
                    name = item.get('title')
                    if name:
                        print(f'[Proxy] UPC Item DB: trouvé "{name}"')
                        return jsonify({
                            'success': True,
                            'name': name,
                            'brand': item.get('brand', ''),
                            'category': item.get('category', ''),
                            'image': item.get('images', [''])[0] if item.get('images') else '',
                            'source': 'UPC Item DB'
                        }), 200
        except Exception as e:
            print(f'[Proxy] UPC Item DB erreur: {str(e)}')
        
        # 3. Essayer GTINsearch en dernier (souvent bloqué)
        try:
            print(f'[Proxy] Essai GTINsearch...')
            gtin_url = f'https://gtinsearch.org/api?gtin={gtin}'
            gtin_response = requests.get(gtin_url, timeout=8, headers=headers)
            
            if gtin_response.status_code == 200:
                gtin_data = gtin_response.json()
                if gtin_data.get('name'):
                    print(f'[Proxy] GTINsearch: trouvé "{gtin_data["name"]}"')
                    return jsonify({
                        'success': True,
                        'name': gtin_data['name'],
                        'brand': gtin_data.get('brand', ''),
                        'category': gtin_data.get('category', ''),
                        'source': 'GTINsearch'
                    }), 200
            else:
                print(f'[Proxy] GTINsearch: HTTP {gtin_response.status_code}')
        except Exception as e:
            print(f'[Proxy] GTINsearch erreur: {str(e)}')
        
        # Aucune API n'a trouvé le produit
        print(f'[Proxy] Aucun résultat trouvé pour: {gtin}')
        return jsonify({'success': False, 'error': 'Produit non trouvé', 'name': None}), 200
            
    except Exception as e:
        print(f'[Proxy] Erreur inattendue: {str(e)}')
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': sanitize_error(e)}), 200

@app.route('/api/proxy/openfoodfacts', methods=['GET'])
def proxy_openfoodfacts():
    """Proxy pour Open Food Facts (contourne CORS)"""
    try:
        barcode = request.args.get('barcode')
        if not barcode:
            return jsonify({'success': False, 'error': 'Paramètre barcode manquant'}), 400
        
        print(f'[Proxy] Requête Open Food Facts pour: {barcode}')
        url = f'https://world.openfoodfacts.org/api/v0/product/{barcode}.json'
        
        response = requests.get(url, timeout=10, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        
        print(f'[Proxy] Open Food Facts status: {response.status_code}')
        
        if response.status_code != 200:
            print(f'[Proxy] Open Food Facts erreur HTTP: {response.status_code}')
            return jsonify({'success': False, 'status': 0, 'error': f'HTTP {response.status_code}'}), 200
        
        try:
            data = response.json()
            print(f'[Proxy] Open Food Facts réponse reçue')
            return jsonify(data), 200
        except ValueError:
            print(f'[Proxy] Open Food Facts réponse non-JSON')
            return jsonify({'success': False, 'status': 0, 'error': 'Réponse invalide'}), 200
            
    except requests.exceptions.Timeout:
        print(f'[Proxy] Open Food Facts timeout')
        return jsonify({'success': False, 'status': 0, 'error': 'Timeout'}), 200
    except requests.exceptions.RequestException as e:
        print(f'[Proxy] Open Food Facts erreur: {str(e)}')
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'status': 0, 'error': sanitize_error(e)}), 200
    except Exception as e:
        print(f'[Proxy] Open Food Facts erreur inattendue: {str(e)}')
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'status': 0, 'error': sanitize_error(e)}), 200

@app.route('/api/proxy/openfoodfacts/search', methods=['GET'])
def proxy_openfoodfacts_search():
    """Proxy pour la recherche Open Food Facts (contourne CORS)"""
    try:
        query = request.args.get('query')
        if not query:
            return jsonify({'success': False, 'error': 'Paramètre query manquant'}), 400
        
        print(f'[Proxy] Recherche Open Food Facts pour: {query}')
        url = f'https://world.openfoodfacts.org/cgi/search.pl?search_terms={query}&search_simple=1&action=process&json=1&page_size=8'
        
        response = requests.get(url, timeout=10, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        
        print(f'[Proxy] Open Food Facts recherche status: {response.status_code}')
        
        if response.status_code != 200:
            print(f'[Proxy] Open Food Facts recherche erreur HTTP: {response.status_code}')
            return jsonify({'success': False, 'products': [], 'error': f'HTTP {response.status_code}'}), 200
        
        try:
            data = response.json()
            print(f'[Proxy] Open Food Facts recherche réponse reçue')
            return jsonify(data), 200
        except ValueError:
            print(f'[Proxy] Open Food Facts recherche réponse non-JSON')
            return jsonify({'success': False, 'products': [], 'error': 'Réponse invalide'}), 200
            
    except requests.exceptions.Timeout:
        print(f'[Proxy] Open Food Facts recherche timeout')
        return jsonify({'success': False, 'products': [], 'error': 'Timeout'}), 200
    except requests.exceptions.RequestException as e:
        print(f'[Proxy] Open Food Facts recherche erreur: {str(e)}')
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'products': [], 'error': sanitize_error(e)}), 200
    except Exception as e:
        print(f'[Proxy] Open Food Facts recherche erreur inattendue: {str(e)}')
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'products': [], 'error': sanitize_error(e)}), 200

# ==================== API LOCATIONS ====================

@app.route('/api/rentals', methods=['GET'])
def get_rentals():
    """Récupérer toutes les locations"""
    try:
        status_filter = request.args.get('status', '')
        conn = get_db()
        cursor = conn.cursor()
        
        if status_filter:
            cursor.execute('''
                SELECT * FROM rentals
                WHERE status = ?
                ORDER BY start_date DESC
            ''', (status_filter,))
        else:
            cursor.execute('''
                SELECT * FROM rentals
                ORDER BY start_date DESC
            ''')
        
        rows = cursor.fetchall()
        rentals = [{
            'id': row['id'],
            'renterName': row['renter_name'],
            'renterEmail': row['renter_email'],
            'renterPhone': row['renter_phone'],
            'renterAddress': row['renter_address'],
            'rentalPrice': row['rental_price'],
            'rentalDeposit': row['rental_deposit'],
            'rentalDuration': row['rental_duration'],
            'startDate': row['start_date'],
            'endDate': row['end_date'],
            'status': row['status'],
            'itemsData': json.loads(row['items_data']),
            'createdAt': row['created_at'],
            'updatedAt': row['updated_at']
        } for row in rows]
        
        conn.close()
        return jsonify({'success': True, 'rentals': rentals}), 200
    except Exception as e:
        print(f'[API] ERREUR GET /api/rentals: {str(e)}')
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': sanitize_error(e)}), 500

@app.route('/api/rentals', methods=['POST'])
def create_rental():
    """Créer une nouvelle location"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Données JSON invalides'}), 400
        
        # Validation des champs requis
        required_fields = ['renterName', 'renterEmail', 'renterPhone', 'rentalPrice', 'rentalDeposit', 'rentalDuration', 'startDate', 'endDate', 'itemsData']
        missing_fields = validate_required_fields(data, required_fields)
        if missing_fields:
            return jsonify({'success': False, 'error': f'Champs obligatoires manquants: {", ".join(missing_fields)}'}), 400
        
        # Validation de l'email
        if not validate_email(data.get('renterEmail')):
            return jsonify({'success': False, 'error': 'Format d\'email invalide'}), 400
        
        # Validation du téléphone
        if not validate_phone(data.get('renterPhone')):
            return jsonify({'success': False, 'error': 'Format de téléphone invalide'}), 400
        
        # Validation des montants
        if not validate_positive_number(data.get('rentalPrice')):
            return jsonify({'success': False, 'error': 'Le prix de location doit être un nombre positif'}), 400
        if not validate_positive_number(data.get('rentalDeposit')):
            return jsonify({'success': False, 'error': 'La caution doit être un nombre positif'}), 400
        
        # Validation de la durée
        if not validate_positive_number(data.get('rentalDuration'), allow_zero=False):
            return jsonify({'success': False, 'error': 'La durée doit être un nombre positif'}), 400
        
        # Validation des items
        if not isinstance(data.get('itemsData'), list) or len(data.get('itemsData', [])) == 0:
            return jsonify({'success': False, 'error': 'Au moins un item doit être sélectionné'}), 400
        
        # Sanitization
        data['renterName'] = sanitize_string(data.get('renterName'), 200)
        data['renterEmail'] = sanitize_string(data.get('renterEmail'), 200)
        data['renterPhone'] = sanitize_string(data.get('renterPhone'), 50)
        data['renterAddress'] = sanitize_string(data.get('renterAddress'), 500)
        data['notes'] = sanitize_string(data.get('notes'), 2000)
        
        now = datetime.now().isoformat()
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO rentals (
                renter_name, renter_email, renter_phone, renter_address,
                rental_price, rental_deposit, rental_duration,
                start_date, end_date, status, items_data,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            data['renterName'],
            data['renterEmail'],
            data['renterPhone'],
            data.get('renterAddress', ''),
            data['rentalPrice'],
            data['rentalDeposit'],
            data['rentalDuration'],
            data['startDate'],
            data['endDate'],
            data.get('status', 'en_cours'),
            json.dumps(data['itemsData']),
            now,
            now
        ))
        
        rental_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        # Diffuser l'événement
        broadcast_event('rentals_changed', {'action': 'created', 'id': rental_id})
        
        return jsonify({'success': True, 'id': rental_id}), 201
    except Exception as e:
        print(f'[API] ERREUR POST /api/rentals: {str(e)}')
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': sanitize_error(e)}), 500

@app.route('/api/rentals/<int:rental_id>', methods=['PUT'])
def update_rental(rental_id):
    """Mettre à jour une location"""
    try:
        data = request.get_json()
        now = datetime.now().isoformat()
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute('''
            UPDATE rentals
            SET renter_name = ?, renter_email = ?, renter_phone = ?, renter_address = ?,
                rental_price = ?, rental_deposit = ?, rental_duration = ?,
                start_date = ?, end_date = ?, status = ?, items_data = ?,
                updated_at = ?
            WHERE id = ?
        ''', (
            data['renterName'],
            data['renterEmail'],
            data['renterPhone'],
            data.get('renterAddress', ''),
            data['rentalPrice'],
            data['rentalDeposit'],
            data['rentalDuration'],
            data['startDate'],
            data['endDate'],
            data['status'],
            json.dumps(data['itemsData']),
            now,
            rental_id
        ))
        
        conn.commit()
        conn.close()
        
        # Diffuser l'événement
        broadcast_event('rentals_changed', {'action': 'updated', 'id': rental_id})
        
        return jsonify({'success': True}), 200
    except Exception as e:
        print(f'[API] ERREUR PUT /api/rentals/{rental_id}: {str(e)}')
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': sanitize_error(e)}), 500

@app.route('/api/rentals/<int:rental_id>', methods=['DELETE'])
def delete_rental(rental_id):
    """Supprimer une location"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM rentals WHERE id = ?', (rental_id,))
        conn.commit()
        conn.close()
        
        # Diffuser l'événement
        broadcast_event('rentals_changed', {'action': 'deleted', 'id': rental_id})
        
        return jsonify({'success': True}), 200
    except Exception as e:
        print(f'[API] ERREUR DELETE /api/rentals/{rental_id}: {str(e)}')
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': sanitize_error(e)}), 500

@app.route('/api/rentals/<int:rental_id>/caution-doc', methods=['GET'])
def get_rental_caution_doc(rental_id):
    """Générer et télécharger le document de caution pour une location"""
    try:
        if not DOCX_AVAILABLE:
            return jsonify({'success': False, 'error': 'python-docx non disponible'}), 500
        
        # Récupérer la location
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM rentals WHERE id = ?', (rental_id,))
        rental = cursor.fetchone()
        conn.close()
        
        if not rental:
            return jsonify({'success': False, 'error': 'Location non trouvée'}), 404
        
        # Charger le modèle DOCX
        template_path = os.path.join('.', 'Modèle pour caution Location.docx')
        if not os.path.exists(template_path):
            return jsonify({'success': False, 'error': 'Modèle DOCX non trouvé'}), 404
        
        doc = Document(template_path)
        
        # Formater les dates
        def format_date(date_str):
            if not date_str:
                return ''
            try:
                date_obj = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                return date_obj.strftime('%d/%m/%Y')
            except:
                return date_str
        
        # Extraire prénom et nom (format: "Prénom Nom")
        renter_name = rental['renter_name'] or ''
        name_parts = renter_name.split(' ', 1)
        prenom = name_parts[0] if len(name_parts) > 0 else ''
        nom = name_parts[1] if len(name_parts) > 1 else prenom  # Si un seul mot, c'est probablement le nom
        
        # Parser les items loués
        items_data = []
        try:
            items_data = json.loads(rental['items_data']) if rental['items_data'] else []
        except:
            items_data = []
        
        # Formater la liste des items
        items_list_str = ', '.join([
            f"{item.get('name', 'Item')} ({item.get('brand', '')} {item.get('model', '')})"
            for item in items_data
        ])
        
        # Dictionnaire de tous les placeholders possibles
        all_placeholders = {
            # Variations pour le nom
            '{{nom}}': nom,
            '{{NOM}}': nom.upper(),
            '{{prenom}}': prenom,
            '{{PRENOM}}': prenom.upper(),
            '{{nom_complet}}': renter_name,
            '{{NOM_COMPLET}}': renter_name.upper(),
            'nom_locataire': nom,
            'prenom_locataire': prenom,
            'NOM_LOCATAIRE': nom.upper(),
            'PRENOM_LOCATAIRE': prenom.upper(),
            '[NOM]': nom,
            '[PRENOM]': prenom,
            '[nom]': nom,
            '[prenom]': prenom,
            
            # Adresse
            '{{adresse}}': rental['renter_address'] or '',
            'adresse_locataire': rental['renter_address'] or '',
            '[ADRESSE]': rental['renter_address'] or '',
            '[adresse]': rental['renter_address'] or '',
            
            # Email
            '{{email}}': rental['renter_email'] or '',
            'email_locataire': rental['renter_email'] or '',
            '[EMAIL]': rental['renter_email'] or '',
            '[email]': rental['renter_email'] or '',
            
            # Téléphone
            '{{telephone}}': rental['renter_phone'] or '',
            '{{tel}}': rental['renter_phone'] or '',
            'telephone_locataire': rental['renter_phone'] or '',
            '[TELEPHONE]': rental['renter_phone'] or '',
            '[telephone]': rental['renter_phone'] or '',
            '[TEL]': rental['renter_phone'] or '',
            
            # Montants
            '{{caution}}': f"{rental['rental_deposit']:.2f} €" if rental['rental_deposit'] else '0.00 €',
            '{{montant_caution}}': f"{rental['rental_deposit']:.2f} €" if rental['rental_deposit'] else '0.00 €',
            'montant_caution': f"{rental['rental_deposit']:.2f} €" if rental['rental_deposit'] else '0.00 €',
            '[CAUTION]': f"{rental['rental_deposit']:.2f} €" if rental['rental_deposit'] else '0.00 €',
            '{{prix}}': f"{rental['rental_price']:.2f} €" if rental['rental_price'] else '0.00 €',
            '[PRIX]': f"{rental['rental_price']:.2f} €" if rental['rental_price'] else '0.00 €',
            
            # Dates
            '{{date_debut}}': format_date(rental['start_date']),
            '{{date_fin}}': format_date(rental['end_date']),
            'date_debut': format_date(rental['start_date']),
            'date_fin': format_date(rental['end_date']),
            '[DATE_DEBUT]': format_date(rental['start_date']),
            '[DATE_FIN]': format_date(rental['end_date']),
            '{{duree}}': f"{rental['rental_duration']} jour(s)" if rental['rental_duration'] else '',
            
            # Items
            '{{items}}': items_list_str,
            '{{materiel}}': items_list_str,
            '[ITEMS]': items_list_str,
            '[MATERIEL]': items_list_str,
            
            # Date du jour
            '{{date_jour}}': datetime.now().strftime('%d/%m/%Y'),
            '[DATE]': datetime.now().strftime('%d/%m/%Y'),
        }
        
        def replace_in_text(text):
            """Remplacer tous les placeholders dans un texte"""
            result = text
            
            # Remplacer les placeholders connus
            for placeholder, value in all_placeholders.items():
                result = result.replace(placeholder, str(value))
            
            # Patterns regex pour les placeholders avec "..."
            regex_patterns = [
                (r'Nom\s*[:\s]+\.{2,}', f"Nom : {renter_name}"),
                (r'Prénom\s*[:\s]+\.{2,}', f"Prénom : {prenom}"),
                (r'Adresse\s*[:\s]+\.{2,}', f"Adresse : {rental['renter_address'] or ''}"),
                (r'Email\s*[:\s]+\.{2,}', f"Email : {rental['renter_email'] or ''}"),
                (r'Téléphone\s*[:\s]+\.{2,}', f"Téléphone : {rental['renter_phone'] or ''}"),
                (r'Caution\s*[:\s]+\.{2,}', f"Caution : {rental['rental_deposit']:.2f} €" if rental['rental_deposit'] else 'Caution : 0.00 €'),
                (r'Montant\s*[:\s]+\.{2,}', f"Montant : {rental['rental_deposit']:.2f} €" if rental['rental_deposit'] else 'Montant : 0.00 €'),
                (r'Date\s+de\s+début\s*[:\s]+\.{2,}', f"Date de début : {format_date(rental['start_date'])}"),
                (r'Date\s+de\s+fin\s*[:\s]+\.{2,}', f"Date de fin : {format_date(rental['end_date'])}"),
                (r'Durée\s*[:\s]+\.{2,}', f"Durée : {rental['rental_duration']} jour(s)" if rental['rental_duration'] else 'Durée : '),
                (r'Matériel\s*[:\s]+\.{2,}', f"Matériel : {items_list_str}"),
            ]
            
            for pattern, replacement in regex_patterns:
                result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)
            
            return result
        
        def replace_in_paragraph(paragraph):
            """Remplacer les placeholders dans un paragraphe en préservant la mise en forme"""
            for run in paragraph.runs:
                original_text = run.text
                new_text = replace_in_text(original_text)
                if new_text != original_text:
                    run.text = new_text
            
            # Si pas de runs ou le texte du paragraphe n'a pas été traité
            full_text = paragraph.text
            new_full_text = replace_in_text(full_text)
            if new_full_text != full_text and not paragraph.runs:
                paragraph.clear()
                paragraph.add_run(new_full_text)
        
        # Parcourir tous les paragraphes
        for paragraph in doc.paragraphs:
            replace_in_paragraph(paragraph)
        
        # Parcourir les tableaux
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    for paragraph in cell.paragraphs:
                        replace_in_paragraph(paragraph)
        
        # Parcourir les en-têtes et pieds de page
        for section in doc.sections:
            # En-tête
            header = section.header
            for paragraph in header.paragraphs:
                replace_in_paragraph(paragraph)
            # Pied de page
            footer = section.footer
            for paragraph in footer.paragraphs:
                replace_in_paragraph(paragraph)
        
        # Sauvegarder dans un BytesIO
        output = BytesIO()
        doc.save(output)
        output.seek(0)
        
        # Nom de fichier sécurisé
        safe_name = re.sub(r'[^\w\s-]', '', rental['renter_name'] or 'inconnu').strip().replace(' ', '_')
        filename = f'caution_location_{rental_id}_{safe_name}.docx'
        
        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        print(f'[API] ERREUR GET /api/rentals/{rental_id}/caution-doc: {str(e)}')
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': sanitize_error(e)}), 500

@app.route('/api/rental-statuses', methods=['GET'])
def get_rental_statuses():
    """Récupérer tous les statuts de location"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM rental_statuses ORDER BY name')
        rows = cursor.fetchall()
        statuses = [{
            'id': row['id'],
            'name': row['name'],
            'color': row['color']
        } for row in rows]
        conn.close()
        return jsonify({'success': True, 'statuses': statuses}), 200
    except Exception as e:
        print(f'[API] ERREUR GET /api/rental-statuses: {str(e)}')
        return jsonify({'success': False, 'error': sanitize_error(e)}), 500

@app.route('/api/rental-statuses', methods=['POST'])
def create_rental_status():
    """Créer un nouveau statut de location"""
    try:
        data = request.get_json()
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO rental_statuses (name, color, created_at)
            VALUES (?, ?, ?)
        ''', (data['name'], data.get('color', '#666'), datetime.now().isoformat()))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'id': cursor.lastrowid}), 201
    except Exception as e:
        print(f'[API] ERREUR POST /api/rental-statuses: {str(e)}')
        return jsonify({'success': False, 'error': sanitize_error(e)}), 500

# ==================== OCR (TESSERACT) ====================

@app.route('/api/ocr', methods=['POST'])
def ocr_image():
    """Extraire le texte d'une image avec Tesseract OCR"""
    if not OCR_AVAILABLE:
        return jsonify({
            'success': False,
            'error': 'OCR non disponible - Installez pytesseract et Tesseract'
        }), 500
    
    try:
        data = request.get_json()
        image_data = data.get('image')
        
        if not image_data:
            return jsonify({'success': False, 'error': 'Image manquante'}), 400
        
        # Décoder l'image base64
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        
        image_bytes = base64.b64decode(image_data)
        image = Image.open(BytesIO(image_bytes))
        
        # Convertir en RGB si nécessaire (pour les PNG avec transparence)
        if image.mode in ('RGBA', 'LA', 'P'):
            background = Image.new('RGB', image.size, (255, 255, 255))
            if image.mode == 'P':
                image = image.convert('RGBA')
            background.paste(image, mask=image.split()[-1] if image.mode == 'RGBA' else None)
            image = background
        elif image.mode != 'RGB':
            image = image.convert('RGB')
        
        print(f'[OCR] Traitement image {image.size}...')
        
        # Configuration Tesseract pour de meilleures performances sur les étiquettes
        # PSM 6 = Assume a single uniform block of text
        # PSM 3 = Fully automatic page segmentation (default)
        custom_config = r'--oem 3 --psm 6 -l fra+eng'
        
        # Extraire le texte
        raw_text = pytesseract.image_to_string(image, config=custom_config)
        print(f'[OCR] Texte brut extrait:\n{raw_text[:500]}...')
        
        # Parser le texte pour extraire les informations
        parsed_data = parse_ocr_text(raw_text)
        
        return jsonify({
            'success': True,
            'rawText': raw_text,
            'parsed': parsed_data
        }), 200
        
    except Exception as e:
        print(f'[OCR] Erreur: {str(e)}')
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': sanitize_error(e)}), 500

def parse_ocr_text(text):
    """Parser le texte OCR pour extraire les informations utiles"""
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    
    result = {
        'name': None,
        'serialNumber': None,
        'brand': None,
        'model': None,
        'barcode': None,
        'description': None,
    }
    
    # Patterns pour détecter les champs
    patterns = {
        # Numéro de série
        'serialNumber': [
            r'(?:S/N|SN|Serial|N°\s*série|Numéro\s*de\s*série)[:\s]*([A-Z0-9\-]+)',
            r'(?:^|\s)([A-Z]{2,4}[0-9]{6,12})(?:\s|$)',  # Format type XX123456789
        ],
        # Code-barres / UPC / EAN
        'barcode': [
            r'(?:UPC|EAN|GTIN|Code[- ]?barre)[:\s]*(\d{8,14})',
            r'(?:^|\s)(\d{12,14})(?:\s|$)',  # 12-14 chiffres seuls
        ],
        # Modèle
        'model': [
            r'(?:Model|Modèle|Mod\.?|Ref\.?|Référence)[:\s]*([A-Z0-9\-\/\s]+)',
            r'(?:Part\s*(?:No|Number|#)|P/N)[:\s]*([A-Z0-9\-]+)',
        ],
        # Marque (liste de marques connues)
        'brand': [
            r'\b(Apple|Samsung|Sony|LG|Dell|HP|Lenovo|Asus|Acer|Microsoft|Google|DJI|GoPro|Canon|Nikon|Panasonic|Logitech|Bose|JBL|Meta|Oculus|HTC|Valve|Razer|Corsair|SteelSeries|Rode|Shure|Sennheiser|Audio-Technica|Blackmagic|Elgato|AVerMedia|OBS|Streamlabs|Insta360|Zhiyun|DJI)\b',
        ],
    }
    
    full_text = ' '.join(lines)
    
    for field, regex_list in patterns.items():
        for pattern in regex_list:
            match = re.search(pattern, full_text, re.IGNORECASE)
            if match:
                result[field] = match.group(1).strip()
                break
    
    # Si pas de nom détecté, utiliser la première ligne significative
    if not result['name']:
        for line in lines:
            # Ignorer les lignes trop courtes ou qui ressemblent à des numéros
            if len(line) > 3 and not re.match(r'^[\d\-\/\.\s]+$', line):
                # Ignorer si c'est déjà identifié comme autre chose
                if line not in [result['serialNumber'], result['model'], result['barcode']]:
                    result['name'] = line[:100]  # Limiter la longueur
                    break
    
    # Si pas de description, utiliser les lignes non utilisées
    used_values = [v for v in result.values() if v]
    description_lines = [l for l in lines if l not in used_values and len(l) > 5]
    if description_lines:
        result['description'] = ' | '.join(description_lines[:3])  # Max 3 lignes
    
    print(f'[OCR] Données parsées: {result}')
    return result

@app.route('/api/ocr/status', methods=['GET'])
def ocr_status():
    """Vérifier si l'OCR est disponible"""
    return jsonify({
        'success': True,
        'available': OCR_AVAILABLE,
        'tesseract_path': pytesseract.pytesseract.tesseract_cmd if OCR_AVAILABLE else None
    }), 200

# ==================== HEALTH CHECK ====================

@app.route('/api/health', methods=['GET'])
def health_check():
    """Vérifier l'état du serveur"""
    return jsonify({
        'success': True,
        'status': 'healthy',
        'mode': APP_MODE,
        'database': 'connected' if os.path.exists(DB_PATH) else 'not found',
        'ocr': 'available' if OCR_AVAILABLE else 'unavailable',
        'docx': 'available' if DOCX_AVAILABLE else 'unavailable'
    }), 200

# ==================== DÉMARRAGE ====================

import subprocess
import sys

# Configuration du démarrage
FLASK_DEBUG = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true' and APP_MODE == 'development'

def build_frontend():
    """Construire le frontend Next.js si nécessaire"""
    frontend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'horizon-ui-template')
    
    if not os.path.exists(frontend_dir):
        print(f"[ERREUR] Dossier frontend non trouvé: {frontend_dir}")
        return False
    
    # Vérifier si le build existe déjà
    if FRONTEND_AVAILABLE:
        print("[BUILD] Frontend déjà buildé, prêt à servir.")
        return True
    
    print("[BUILD] Frontend non buildé. Construction en cours...")
    print("[BUILD] Cela peut prendre quelques minutes...")
    
    try:
        # Installer les dépendances si nécessaire
        node_modules = os.path.join(frontend_dir, 'node_modules')
        if not os.path.exists(node_modules):
            print("[BUILD] Installation des dépendances (yarn install)...")
            result = subprocess.run(
                'yarn install' if sys.platform == 'win32' else ['yarn', 'install'],
                cwd=frontend_dir,
                shell=sys.platform == 'win32',
                capture_output=True,
                text=True
            )
            if result.returncode != 0:
                print(f"[BUILD] Erreur yarn install: {result.stderr}")
                return False
        
        # Build le frontend
        print("[BUILD] Construction du frontend (yarn build)...")
        result = subprocess.run(
            'yarn build' if sys.platform == 'win32' else ['yarn', 'build'],
            cwd=frontend_dir,
            shell=sys.platform == 'win32',
            capture_output=True,
            text=True
        )
        if result.returncode != 0:
            print(f"[BUILD] Erreur yarn build: {result.stderr}")
            return False
        
        print("[BUILD] Frontend buildé avec succès!")
        return True
        
    except Exception as e:
        print(f"[BUILD] Erreur lors du build: {e}")
        return False

if __name__ == '__main__':
    print("=" * 60)
    print("  CODE BAR CRM - Serveur Unifié")
    print("=" * 60)
    
    # Initialiser la base de données
    init_db()
    
    # Vérifier/construire le frontend si demandé
    auto_build = os.environ.get('AUTO_BUILD', 'false').lower() == 'true'
    if not FRONTEND_AVAILABLE and auto_build:
        build_frontend()
        # Recharger la vérification
        globals()['FRONTEND_AVAILABLE'] = check_frontend_build()
    
    print("\n" + "=" * 60)
    print("  SERVEUR UNIFIE ACTIF")
    print(f"    URL:      http://localhost:{SERVER_PORT}")
    print(f"    Mode:     {APP_MODE}")
    print(f"    Frontend: {'[OK] Disponible' if FRONTEND_AVAILABLE else '[KO] Non builde'}")
    print(f"    OCR:      {'[OK] Disponible' if OCR_AVAILABLE else '[KO] Non disponible'}")
    print(f"    DOCX:     {'[OK] Disponible' if DOCX_AVAILABLE else '[KO] Non disponible'}")
    print("=" * 60)
    
    if not FRONTEND_AVAILABLE:
        print("\n[ATTENTION] Pour activer le frontend, executez :")
        print("    cd horizon-ui-template")
        print("    yarn install")
        print("    yarn build")
        print("    Puis relancez: python server.py")
        print("\n    Ou lancez avec AUTO_BUILD=true :")
        print("    AUTO_BUILD=true python server.py")
    
    print("\nPour arrêter le serveur: Ctrl+C")
    print("=" * 60 + "\n")
    
    # Démarrer Flask (API + Frontend sur le même port)
    app.run(
        host='0.0.0.0',
        port=SERVER_PORT,
        debug=FLASK_DEBUG,
        threaded=True  # Permettre plusieurs connexions simultanées (SSE)
    )
