#!/usr/bin/env python3
"""
Serveur unique pour le CRM Code-Barres
Sert à la fois l'API REST et les fichiers statiques (HTML/CSS/JS)
Base de données SQLite locale
"""

from flask import Flask, request, jsonify, send_from_directory, Response
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

# OCR avec Tesseract
try:
    import pytesseract
    from PIL import Image
    # Configuration du chemin Tesseract pour Windows
    tesseract_path = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
    if os.path.exists(tesseract_path):
        pytesseract.pytesseract.tesseract_cmd = tesseract_path
        OCR_AVAILABLE = True
        print(f'[OCR] Tesseract configuré: {tesseract_path}')
    else:
        OCR_AVAILABLE = False
        print('[OCR] Tesseract non trouvé')
except ImportError:
    OCR_AVAILABLE = False
    print('[OCR] pytesseract non installé - pip install pytesseract Pillow')

app = Flask(__name__, static_folder='.')
CORS(app)

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

# Configuration
DB_PATH = os.path.join('data', 'inventory.db')

def create_notification(message, type, item_serial_number, conn, cursor):
    """Créer une notification dans la base de données"""
    try:
        now = datetime.now().isoformat()
        cursor.execute('''
            INSERT INTO notifications (message, type, item_serial_number, created_at)
            VALUES (?, ?, ?, ?)
        ''', (
            message,
            type,
            item_serial_number,
            now
        ))
        notification_id = cursor.lastrowid
        print(f'[API] Notification créée (ID: {notification_id}): {message}')
        
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
    """Générer le prochain ID alphanumérique (aaaa, aaab, ..., aaaz, aaa0, aaa1, ..., aaa9, aaba, etc.)"""
    # Récupérer le dernier item_id utilisé
    cursor.execute('SELECT item_id FROM items WHERE item_id IS NOT NULL ORDER BY item_id DESC LIMIT 1')
    last_id_row = cursor.fetchone()
    
    if not last_id_row or not last_id_row['item_id']:
        # Premier ID : aaaa
        return 'aaaa'
    
    last_id = last_id_row['item_id'].lower()
    
    # S'assurer que l'ID fait exactement 4 caractères
    if len(last_id) != 4:
        return 'aaaa'
    
    # Caractères valides : a-z (26) puis 0-9 (10) = 36 caractères
    chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    
    # Convertir l'ID en liste de caractères
    id_chars = list(last_id)
    
    # Incrémenter de droite à gauche (position 3 -> 0)
    for i in range(3, -1, -1):
        char_index = chars.find(id_chars[i])
        if char_index == -1:
            # Caractère invalide, réinitialiser à 'a'
            id_chars[i] = 'a'
            continue
        
        if char_index < len(chars) - 1:
            # Incrémenter ce caractère
            id_chars[i] = chars[char_index + 1]
            # Réinitialiser tous les caractères à droite à 'a'
            for j in range(i + 1, 4):
                id_chars[j] = 'a'
            return ''.join(id_chars)
        else:
            # Ce caractère est '9' (dernier), le réinitialiser à 'a' et continuer avec le suivant
            id_chars[i] = 'a'
    
    # Si tous les caractères étaient '9', on recommence à aaaa
    # (ne devrait jamais arriver avec seulement 4 caractères)
    return 'aaaa'

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

# ==================== ROUTES STATIQUES ====================

@app.route('/')
def serve_index():
    """Rediriger vers le frontend Next.js"""
    return '''
    <html>
    <head><title>API CRM Code-Barres</title></head>
    <body style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1>API CRM Code-Barres</h1>
        <p>Le frontend est maintenant accessible sur le port <strong>3001</strong></p>
        <p><a href="http://localhost:3001">Accéder au frontend</a></p>
        <hr>
        <p>API disponible sur <code>/api/*</code></p>
    </body>
    </html>
    ''', 200

@app.route('/favicon.ico')
def serve_favicon():
    """Servir le favicon (évite l'erreur 404)"""
    return '', 204

@app.route('/logo-globalvision.png')
def serve_logo():
    """Servir le logo"""
    if os.path.exists('logo-globalvision.png'):
        return send_from_directory('.', 'logo-globalvision.png')
    return '', 404

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
        return jsonify({'success': False, 'error': str(e)}), 500

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
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/items', methods=['POST'])
def create_item():
    """Créer ou mettre à jour un item"""
    try:
        data = request.get_json()
        print(f'[API] POST /api/items - Données reçues: {data}')
        
        if not data.get('name') or not data.get('serialNumber'):
            print('[API] ERREUR: Nom ou numéro de série manquant')
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
        
        # Créer une notification
        if existing:
            create_notification(f'Item "{data["name"]}" : quantité modifiée de {old_quantity} à {new_quantity}', 'success', data['serialNumber'], conn, cursor)
        else:
            create_notification(f'Item "{data["name"]}" créé', 'success', data['serialNumber'], conn, cursor)
        
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
        return jsonify({'success': False, 'error': str(e)}), 500

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
            'serialNumber': 'serial_number'
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
                    'scannedCode': 'Code scanné'
                }
                field_label = field_labels.get(entry['field_name'], entry['field_name'])
                
                if entry['field_name'] == 'quantity':
                    notification_msg = f'Item "{item_name}" : quantité modifiée de {entry["old_value"]} à {entry["new_value"]}'
                elif entry['field_name'] == 'name':
                    notification_msg = f'Item "{entry["old_value"]}" : nom modifié en "{entry["new_value"]}"'
                elif entry['field_name'] == 'category':
                    notification_msg = f'Item "{item_name}" : catégorie modifiée de "{entry["old_value"] or "aucune"}" à "{entry["new_value"]}"'
                else:
                    notification_msg = f'Item "{item_name}" : {field_label} modifié de "{entry["old_value"]}" à "{entry["new_value"]}"'
                
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
        return jsonify({'success': False, 'error': str(e)}), 500

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
        return jsonify({'success': False, 'error': str(e)}), 500

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
        
        # Créer une notification
        create_notification(f'Item "{item_name}" supprimé', 'success', serial_number, conn, cursor)
        
        conn.commit()
        conn.close()
        
        # Diffuser l'événement à tous les clients
        broadcast_event('items_changed', {'action': 'deleted', 'serialNumber': serial_number})
        broadcast_event('notifications_changed', {})
        
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

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
        
        default_categories = ['materiel', 'drone', 'video', 'audio', 'streaming', 'robot', 'autre']
        available_default = [c for c in default_categories if c not in deleted_categories]
        available_custom = [c for c in custom_categories if c not in deleted_categories]
        
        return jsonify({
            'success': True,
            'categories': available_default + available_custom,
            'customCategories': custom_categories,
            'deletedCategories': deleted_categories
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

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
        return jsonify({'success': False, 'error': str(e)}), 500

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
        return jsonify({'success': False, 'error': str(e)}), 500

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
        return jsonify({'success': False, 'error': str(e)}), 500

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
        return jsonify({'success': False, 'error': str(e)}), 500

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
        return jsonify({'success': False, 'error': str(e)}), 500

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
        return jsonify({'success': False, 'error': str(e)}), 500

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
        notifications = [{
            'id': row['id'],
            'message': row['message'],
            'type': row['type'],
            'itemSerialNumber': row['item_serial_number'],
            'timestamp': row['created_at'],
            'created_at': row['created_at']  # Alias pour compatibilité
        } for row in rows]
        
        conn.close()
        print(f'[API] GET /api/notifications - {len(notifications)} notifications retournées')
        for notif in notifications[:3]:  # Afficher les 3 premières pour debug
            print(f'[API]   - {notif["message"]} ({notif["type"]})')
        return jsonify({'success': True, 'notifications': notifications}), 200
    except Exception as e:
        print(f'[API] ERREUR GET /api/notifications: {str(e)}')
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

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
        return jsonify({'success': False, 'error': str(e)}), 500

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
        return jsonify({'success': False, 'error': str(e)}), 500

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
        return jsonify({'success': False, 'error': str(e)}), 200

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
        return jsonify({'success': False, 'status': 0, 'error': str(e)}), 200
    except Exception as e:
        print(f'[Proxy] Open Food Facts erreur inattendue: {str(e)}')
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'status': 0, 'error': str(e)}), 200

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
        return jsonify({'success': False, 'products': [], 'error': str(e)}), 200
    except Exception as e:
        print(f'[Proxy] Open Food Facts recherche erreur inattendue: {str(e)}')
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'products': [], 'error': str(e)}), 200

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
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/rentals', methods=['POST'])
def create_rental():
    """Créer une nouvelle location"""
    try:
        data = request.get_json()
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
        return jsonify({'success': False, 'error': str(e)}), 500

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
        return jsonify({'success': False, 'error': str(e)}), 500

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
        return jsonify({'success': False, 'error': str(e)}), 500

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
        return jsonify({'success': False, 'error': str(e)}), 500

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
        return jsonify({'success': False, 'error': str(e)}), 500

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
        return jsonify({'success': False, 'error': str(e)}), 500

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
        'database': 'connected' if os.path.exists(DB_PATH) else 'not found',
        'ocr': 'available' if OCR_AVAILABLE else 'unavailable'
    }), 200

# ==================== DÉMARRAGE ====================

import subprocess
import sys
import signal
import atexit

nextjs_process = None

def start_nextjs():
    """Démarrer le serveur Next.js en arrière-plan"""
    global nextjs_process
    frontend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'horizon-ui-template')
    
    if not os.path.exists(frontend_dir):
        print(f"[ERREUR] Dossier frontend non trouvé: {frontend_dir}")
        return None
    
    print("[Next.js] Démarrage du frontend...")
    
    # Déterminer la commande selon l'OS
    if sys.platform == 'win32':
        # Windows: utiliser shell=True pour que npx fonctionne
        nextjs_process = subprocess.Popen(
            'npx yarn dev',
            cwd=frontend_dir,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP
        )
    else:
        # Linux/Mac
        nextjs_process = subprocess.Popen(
            ['npx', 'yarn', 'dev'],
            cwd=frontend_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            preexec_fn=os.setsid
        )
    
    # Thread pour afficher les logs Next.js
    def print_nextjs_output():
        for line in iter(nextjs_process.stdout.readline, b''):
            try:
                print(f"[Next.js] {line.decode('utf-8', errors='ignore').rstrip()}")
            except:
                pass
    
    output_thread = threading.Thread(target=print_nextjs_output, daemon=True)
    output_thread.start()
    
    return nextjs_process

def cleanup():
    """Arrêter proprement le serveur Next.js"""
    global nextjs_process
    if nextjs_process:
        print("\n[Next.js] Arrêt du frontend...")
        try:
            if sys.platform == 'win32':
                nextjs_process.terminate()
            else:
                os.killpg(os.getpgid(nextjs_process.pid), signal.SIGTERM)
        except:
            pass

atexit.register(cleanup)

if __name__ == '__main__':
    print("=" * 60)
    print("  DEMARRAGE CODE BAR CRM (API + Frontend)")
    print("=" * 60)
    
    # Initialiser la base de données
    init_db()
    
    # Démarrer Next.js en arrière-plan
    start_nextjs()
    
    print("\n" + "=" * 60)
    print("  SERVEURS ACTIFS:")
    print("    - API Flask:    http://localhost:5000/api")
    print("    - Frontend:     http://localhost:3001")
    print("=" * 60)
    print("\nPour arreter les serveurs: Ctrl+C")
    print("=" * 60 + "\n")
    
    # Démarrer Flask
    app.run(host='0.0.0.0', port=5000, debug=False)
