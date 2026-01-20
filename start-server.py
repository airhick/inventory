#!/usr/bin/env python3
"""
Serveur HTTP simple pour l'application de scan de codes-barres
Démarre un serveur sur http://localhost:8000
"""

import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8000

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Ajouter les en-têtes CORS pour permettre les requêtes API
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def log_message(self, format, *args):
        # Personnaliser les logs
        print(f"[{self.log_date_time_string()}] {format % args}")

def main():
    # Changer vers le répertoire du script
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    Handler = MyHTTPRequestHandler
    
    try:
        with socketserver.TCPServer(("", PORT), Handler) as httpd:
            print("=" * 60)
            print(f"🚀 Serveur démarré sur http://localhost:{PORT}")
            print("=" * 60)
            print(f"📱 Ouvrez votre navigateur à l'adresse: http://localhost:{PORT}")
            print("=" * 60)
            print("Appuyez sur Ctrl+C pour arrêter le serveur")
            print("=" * 60)
            
            # Ouvrir automatiquement le navigateur
            try:
                webbrowser.open(f'http://localhost:{PORT}')
            except:
                pass
            
            httpd.serve_forever()
            
    except OSError as e:
        if e.errno == 98 or e.errno == 48:  # Port déjà utilisé
            print(f"❌ Erreur: Le port {PORT} est déjà utilisé.")
            print(f"   Fermez l'autre application ou changez le port dans le script.")
        else:
            print(f"❌ Erreur: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n\n🛑 Serveur arrêté.")
        sys.exit(0)

if __name__ == "__main__":
    main()
