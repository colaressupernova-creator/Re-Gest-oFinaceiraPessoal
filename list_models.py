
import google.generativeai as genai

GEMINI_API_KEY = "AIzaSyCddzlnCbVDOP6Z6Kc6YMeraXnYystMGlE"
genai.configure(api_key=GEMINI_API_KEY)

print("--- LISTANDO TODOS OS MODELOS ACESSÍVEIS COM SUA CHAVE ---")
try:
    for m in genai.list_models():
        if 'generateContent' in m.supported_generation_methods:
            print(f"MODELO: {m.name}")
except Exception as e:
    print(f"ERRO AO LISTAR: {e}")
