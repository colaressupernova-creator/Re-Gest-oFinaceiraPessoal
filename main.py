from fastapi import FastAPI, HTTPException, Response, Cookie
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional
import re
import os
import uuid
import hashlib
import firebase_admin
from firebase_admin import credentials, firestore, auth
import google.generativeai as genai

# Configuração Gemini
GEMINI_API_KEY = "AIzaSyCddzlnCbVDOP6Z6Kc6YMeraXnYystMGlE" 
try:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-2.0-flash')
    print("[OK] Agente de IA Gemini (v2.0 Flash) configurado com sucesso!")
except Exception as e:
    print(f"[ERRO] Falha ao configurar Gemini: {e}")

# Inicializar Firebase
if os.path.exists("serviceAccountKey.json"):
    try:
        cred = credentials.Certificate("serviceAccountKey.json")
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        USE_FIREBASE = True
        print("[OK] Firebase Firestore conectado com sucesso!")
    except Exception as e:
        print(f"[ERRO] Falha ao conectar Firebase: {e}")
        USE_FIREBASE = False
else:
    print("[AVISO] serviceAccountKey.json nao encontrado. Usando local JSON.")
    USE_FIREBASE = False

app = FastAPI(title="RE Solution API")

@app.on_event("startup")
async def startup_event():
    import sys
    print("-" * 50, flush=True)
    print("RE SOLUTION - STATUS DO SISTEMA", flush=True)
    print(f"Database: {'Firebase Firestore [ATIVO]' if USE_FIREBASE else 'JSON Local [ATIVO]'}", flush=True)
    print(f"Inteligencia Artificial: {'Gemini [ATIVO]' if GEMINI_API_KEY else 'Desativada'}", flush=True)
    print("-" * 50, flush=True)
    sys.stdout.flush()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_FILE = "data.json"
USERS_FILE = "users.json"
SESSIONS = {} # In-memory sessions (id: username/uid)
SESSION_NAMES = {} # In-memory names (id: display_name)

class User(BaseModel):
    username: str
    password: str

class FinanceiroItem(BaseModel):
    descricao: str
    valor: float
    data: str
    categoria: str
    marcado: bool

class MesData(BaseModel):
    receber: List[FinanceiroItem] = []
    pagar: List[FinanceiroItem] = []

def load_json(filename):
    if not os.path.exists(filename):
        return {}
    with open(filename, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except:
            return {}

def save_json(filename, data):
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

import re

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def validate_password(password):
    if len(password) < 8:
        return False, "A senha deve ter pelo menos 8 caracteres"
    if not re.search("[A-Z]", password):
        return False, "A senha deve conter pelo menos uma letra maiúscula"
    if not re.search("[0-9]", password):
        return False, "A senha deve conter pelo menos um número"
    if not re.search("[!@#$%^&*(),.?\":{}|<>]", password):
        return False, "A senha deve conter pelo menos um caractere especial"
    return True, ""

@app.post("/api/register")
async def register(user: User):
    if USE_FIREBASE:
        user_ref = db.collection("users").document(user.username)
        if user_ref.get().exists:
            raise HTTPException(status_code=400, detail="Usuário já existe")
        
        is_valid, error_msg = validate_password(user.password)
        if not is_valid: raise HTTPException(status_code=400, detail=error_msg)
        
        user_ref.set({"password": hash_password(user.password)})
        return {"status": "success"}
    else:
        users = load_json(USERS_FILE)
        if user.username in users:
            raise HTTPException(status_code=400, detail="Usuário já existe")
        is_valid, error_msg = validate_password(user.password)
        if not is_valid: raise HTTPException(status_code=400, detail=error_msg)
        users[user.username] = hash_password(user.password)
        save_json(USERS_FILE, users)
        return {"status": "success"}

@app.post("/api/update_password")
async def update_password(data: dict, session_id: Optional[str] = Cookie(None)):
    if not session_id or session_id not in SESSIONS:
        raise HTTPException(status_code=401, detail="Não autorizado")
    
    username = SESSIONS[session_id]
    new_password = data.get("new_password")
    
    is_valid, error_msg = validate_password(new_password)
    if not is_valid: raise HTTPException(status_code=400, detail=error_msg)
    
    if USE_FIREBASE:
        db.collection("users").document(username).update({"password": hash_password(new_password)})
    else:
        users = load_json(USERS_FILE)
        users[username] = hash_password(new_password)
        save_json(USERS_FILE, users)
    return {"status": "success"}

@app.post("/api/login")
async def login(user: User, response: Response):
    if USE_FIREBASE:
        user_ref = db.collection("users").document(user.username).get()
        if not user_ref.exists or user_ref.to_dict().get("password") != hash_password(user.password):
            raise HTTPException(status_code=401, detail="Credenciais inválidas")
    else:
        users = load_json(USERS_FILE)
        if user.username not in users or users[user.username] != hash_password(user.password):
            raise HTTPException(status_code=401, detail="Credenciais inválidas")
    
    session_id = str(uuid.uuid4())
    SESSIONS[session_id] = user.username
    SESSION_NAMES[session_id] = user.username
    response.set_cookie(key="session_id", value=session_id, httponly=True)
    return {"status": "success", "username": user.username}

@app.post("/api/auth/google")
async def google_auth(data: dict, response: Response):
    id_token = data.get("id_token")
    if not id_token:
        raise HTTPException(status_code=400, detail="Token não fornecido")
    
    try:
        decoded_token = auth.verify_id_token(id_token)
        # Usamos o UID único do Firebase para bater com os dados existentes
        user_identifier = decoded_token.get("uid") 
        
        session_id = str(uuid.uuid4())
        SESSIONS[session_id] = user_identifier
        SESSION_NAMES[session_id] = decoded_token.get("name", "Usuário Google")
        response.set_cookie(key="session_id", value=session_id, httponly=True)
        return {"status": "success", "username": decoded_token.get("name", "Usuário Google")}
    except Exception as e:
        print(f"Erro ao verificar token Google: {e}")
        raise HTTPException(status_code=401, detail="Token inválido")

@app.post("/api/logout")
async def logout(response: Response, session_id: Optional[str] = Cookie(None)):
    if session_id in SESSIONS:
        del SESSIONS[session_id]
    if session_id in SESSION_NAMES:
        del SESSION_NAMES[session_id]
    response.delete_cookie("session_id")
    return {"status": "success"}

@app.get("/api/me")
async def get_me(session_id: Optional[str] = Cookie(None)):
    if not session_id or session_id not in SESSIONS:
        raise HTTPException(status_code=401, detail="Não autorizado")
    
    display_name = SESSION_NAMES.get(session_id, SESSIONS[session_id])
    
    # Se ainda for o UID feio, mas temos acesso ao displayName real:
    # A atualização via auth Google resolve este problema de qualquer forma para novos logins.
    return {"username": display_name}

@app.get("/api/financeiro")
async def get_all_data(session_id: Optional[str] = Cookie(None)):
    if not session_id or session_id not in SESSIONS:
        raise HTTPException(status_code=401, detail="Não autorizado")
    
    user_uid = SESSIONS[session_id]
    print(f"DEBUG: Buscando dados em 'usuarios' para o UID: {user_uid}")

    if USE_FIREBASE:
        doc = db.collection("usuarios").document(user_uid).get()
        if doc.exists:
            data_to_process = doc.to_dict()
            print(f"DEBUG: Campos no topo: {list(data_to_process.keys())}")
            
            # Se os dados estiverem aninhados em 'financeiro', desce um nível
            if "financeiro" in data_to_process and isinstance(data_to_process["financeiro"], dict):
                print(f"DEBUG: Entrando no campo 'financeiro'. Chaves internas: {list(data_to_process['financeiro'].keys())}")
                data_to_process = data_to_process["financeiro"]
            else:
                print(f"DEBUG: 'financeiro' não encontrado ou não é dict. Chaves atuais: {list(data_to_process.keys())}")

            organized_data = {}
            # Categorias de Entrada
            categorias_entrada = ['Salário', 'Vale Alimentação', 'Resgate Reserva']

            def process_item(key, item, target_dict):
                if not isinstance(item, dict): return
                
                # Se a chave já for um mês (ex: '2026-02'), e tiver listas dentro
                if re.match(r"^\d{4}-\d{2}$", key) and ("receber" in item or "pagar" in item):
                    print(f"DEBUG: Chave '{key}' já está no formato de mês. Incorporando diretamente.")
                    if key not in target_dict: target_dict[key] = {"receber": [], "pagar": []}
                    target_dict[key]["receber"].extend(item.get("receber", []))
                    target_dict[key]["pagar"].extend(item.get("pagar", []))
                    return

                # Se for um item individual (com 'valor' ou 'data')
                if 'data' in item or 'valor' in item:
                    try:
                        data_str = item.get('data', '2026-02-01')
                        mes_chave = data_str[:7]
                        if mes_chave not in target_dict: target_dict[mes_chave] = {"receber": [], "pagar": []}
                        
                        item_render = {
                            "descricao": item.get('descricao') or item.get('descricão') or "Sem descrição",
                            "valor": float(item.get('valor', 0)),
                            "data": data_str,
                            "categoria": item.get('categoria', 'Outros'),
                            "marcado": item.get('marcado', False)
                        }
                        tipo = "receber" if item_render['categoria'] in categorias_entrada else "pagar"
                        target_dict[mes_chave][tipo].append(item_render)
                        print(f"DEBUG: Item '{item_render['descricao']}' adicionado ao mês {mes_chave}")
                    except: pass
                
                # Se for um dicionário aninhado que não é mês nem item, varre ele (recursivo simples)
                elif key == "financeiro":
                    for k, v in item.items():
                        process_item(k, v, target_dict)

            for key, item in data_to_process.items():
                process_item(key, item, organized_data)
            
            return organized_data
        return {}
    else:
        data = load_json(DATA_FILE)
        return data.get(user_uid, {})

@app.get("/api/financeiro/{mes}")
async def get_mes_data(mes: str, session_id: Optional[str] = Cookie(None)):
    if not session_id or session_id not in SESSIONS:
        raise HTTPException(status_code=401, detail="Não autorizado")
    
    user = SESSIONS[session_id]
    if USE_FIREBASE:
        # Reutilizamos a lógica do get_all para manter consistência
        res = await get_all_data(session_id)
        return res.get(mes, {"receber": [], "pagar": []})
    else:
        data = load_json(DATA_FILE)
        user_data = data.get(user, {})
        return user_data.get(mes, {"receber": [], "pagar": []})

@app.post("/api/financeiro/{mes}")
async def update_mes_data(mes: str, mes_data: MesData, session_id: Optional[str] = Cookie(None)):
    if not session_id or session_id not in SESSIONS:
        raise HTTPException(status_code=401, detail="Não autorizado")
    
    user = SESSIONS[session_id]
    if USE_FIREBASE:
        # Para salvar de volta na estrutura original (numerada), precisamos de um contador
        doc_ref = db.collection("usuarios").document(user)
        doc = doc_ref.get()
        
        # Unificamos as listas para salvar como campos numerados
        total_items = mes_data.receber + mes_data.pagar
        
        # Pegamos os dados atuais para não apagar meses diferentes
        current_data = doc.to_dict() if doc.exists else {}
        
        # Removemos os itens do mês atual para sobrescrever com os novos
        # (Nessa estrutura o update é mais complexo, vamos salvar o que for novo)
        new_data = {}
        idx = 0
        for item in total_items:
            new_data[str(idx + 1000)] = item.dict() # Usamos um range alto ou nova lógica
            idx += 1
            
        doc_ref.set(new_data, merge=True)
    else:
        data = load_json(DATA_FILE)
        if user not in data:
            data[user] = {}
        data[user][mes] = mes_data.dict()
        save_json(DATA_FILE, data)
    return {"status": "success"}

@app.post("/api/ai/insights")
async def get_ai_insights(data: dict, session_id: Optional[str] = Cookie(None)):
    if not session_id or session_id not in SESSIONS:
        raise HTTPException(status_code=401, detail="Não autorizado")
    
    if GEMINI_API_KEY == "SUA_CHAVE_AQUI":
        return {"insight_geral": "IA não configurada.", "dica_receber": "", "dica_pagar": "", "dica_saldo": "", "analise_receber": "", "analise_pagar": "", "analise_geral": ""}

    try:
        # Preparar dados para a IA
        resumo = f"Dados financeiros do mês: {data.get('mes', 'Atual')}\n"
        resumo += f"Total Previsto Receber: R$ {data.get('totalReceber', 0):.2f}\n"
        resumo += f"Total Previsto Pagar: R$ {data.get('totalPagar', 0):.2f}\n"
        resumo += f"Saldo Projetado: R$ {data.get('saldo', 0):.2f}\n"
        resumo += "Lancamentos detalhados do mês:\n"
        for item in data.get('lancamentos', []):
            status = "PAGO" if item.get('marcado', False) else "PENDENTE"
            resumo += f"- [{status}] {item['descricao']}: R$ {item['valor']:.2f} (Tag: {item['categoria']})\n"

        prompt = f"""
        Como consultor financeiro pessoal, analise rigorosamente os dados detalhados abaixo e retorne APENAS um JSON com 7 campos:
        1. 'insight_geral': Frase curta (1 linha) sobre a saúde financeira do mês para o banner principal.
        2. 'dica_receber': Micro-mensagem motivacional (max 8 palavras) sobre as entradas do mês.
        3. 'dica_pagar': Micro-alerta (max 8 palavras) indicando onde cortar ou elogio se estiver baixo.
        4. 'dica_saldo': Micro-dica (max 8 palavras) sobre o que fazer com o saldo previsto.
        5. 'analise_receber': Análise escrita focada na composição das receitas (1 a 2 sentenças para o relatório de resumos).
        6. 'analise_pagar': Análise crítica das maiores fontes de despesa, citando nomes e sugerindo onde apertar o cinto (1 a 2 sentenças para o relatório de grandes gastos).
        7. 'analise_geral': Parecer global da IA sobre a harmonia entre o que foi recebido e gasto, citando valores para contexto (2 a 3 sentenças curtas para o relatório geral de balanço).
        
        Dados para análise:
        {resumo}
        
        Importante: Seu retorno deve ser 100% no formato JSON, sem cabeçalhos ou comentários adicionais.
        """
        
        response = model.generate_content(prompt)
        raw_text = response.text.strip()
        
        # Limpar markdown se houver
        json_str = raw_text.replace('```json', '').replace('```', '').strip()
        
        # fallback caso a IA responda fora de formato
        import re
        json_match = re.search(r'\{.*\}', json_str, re.DOTALL)
        if json_match:
            json_str = json_match.group(0)

        return json.loads(json_str)
    except Exception as e:
        error_str = str(e)
        print(f"[ERRO] Falha na IA: {error_str}")
        
        msg_geral = "Análise temporarily indisponível."
        msg_relatorio = "Aguarde um momento. Muitos acessos à inteligência artificial ao mesmo tempo."
        
        if "quota" in error_str.lower() or "429" in error_str:
            msg_geral = "Limite gratuito da IA atingido."
            msg_relatorio = "A IA precisa de uma pausa (limite de uso por minuto atingido). Tente novamente em breve."

        return {
            "insight_geral": msg_geral, 
            "dica_receber": "Dados recebidos", 
            "dica_pagar": "Gastos registrados", 
            "dica_saldo": "Acompanhe seu saldo", 
            "analise_receber": msg_relatorio, 
            "analise_pagar": msg_relatorio, 
            "analise_geral": msg_relatorio
        }
@app.get("/api/tips")
async def get_static_tips():
    return [
        "Economize pelo menos 10% do seu salário este mês.",
        "Evite compras por impulso na primeira semana do mês.",
        "Revise suas assinaturas de streaming parados."
    ]

# Mount static files com no-cache customizado
from starlette.responses import FileResponse
from starlette.staticfiles import StaticFiles

class NoCacheStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response

if os.path.exists("static"):
    app.mount("/", NoCacheStaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
