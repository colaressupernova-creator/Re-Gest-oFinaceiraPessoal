
import google.generativeai as genai
import os

GEMINI_API_KEY = "AIzaSyCddzlnCbVDOP6Z6Kc6YMeraXnYystMGlE"
genai.configure(api_key=GEMINI_API_KEY)

print("--- TESTANDO MODELOS DISPONÍVEIS NA SUA CHAVE ---")

models_to_test = [
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-pro',
    'gemini-1.0-pro'
]

for model_name in models_to_test:
    print(f"\nTestando: {model_name}...")
    try:
        model = genai.GenerativeModel(model_name)
        response = model.generate_content("Diga OK se estiver funcionando")
        print(f"RESPOSTA: {response.text.strip()}")
        print(f"VEREDITO: {model_name} está FUNCIONANDO!")
    except Exception as e:
        print(f"ERRO com {model_name}: {e}")

print("\n--- TESTE FINALIZADO ---")
