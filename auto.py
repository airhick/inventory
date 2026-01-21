import requests
import json

def get_tech_suggestions(query):
    """
    Utilise l'autocomplétion de Google.
    C'est beaucoup plus rapide et stable qu'Amazon.
    """
    # L'URL magique utilisée par Chrome/Firefox
    url = "http://suggestqueries.google.com/complete/search"
    
    params = {
        "client": "chrome",  # On demande le format JSON style "Chrome"
        "q": query,
        "hl": "fr"           # "en" pour anglais, "fr" pour français
    }
    
    try:
        response = requests.get(url, params=params)
        
        if response.status_code == 200:
            data = json.loads(response.text)
            # La structure est : ["query", ["sugg1", "sugg2"...], ...]
            suggestions = data[1] 
            return suggestions
        else:
            return []
            
    except Exception as e:
        print(f"Erreur : {e}")
        return []

# --- TEST ---
user_input = "dji laval"
print(f"🔍 Recherche pour : '{user_input}'...\n")

resultats = get_tech_suggestions(user_input)

if resultats:
    print("✅ Suggestions trouvées :")
    for item in resultats:
        print(f"👉 {item}")
else:
    print("❌ Rien trouvé.")