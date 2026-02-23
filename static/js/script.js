let dadosPorMes = {};
const agora = new Date();
const anoPadrao = agora.getFullYear();
const mesPadrao = String(agora.getMonth() + 1).padStart(2, '0');
let mesAtual = localStorage.getItem('mesSelecionado') || `${anoPadrao}-${mesPadrao}`;
let editandoIndex = null;
let editandoTipo = null;
let categoriasExpandidas = { receber: {}, pagar: {} };
let dicaAtual = 0;
let dicasFinanceiras = [];
let insightsIA = null;

window.onload = async () => {
    // Check authentication
    try {
        const authRes = await fetch('/api/me');
        if (!authRes.ok) {
            window.location.href = '/login.html';
            return;
        }
        const userData = await authRes.json();
        const userNameTop = document.getElementById('userNameTop');
        const userNameDropdown = document.getElementById('userNameDropdown');
        if (userNameTop) userNameTop.innerText = userData.username;
        if (userNameDropdown) userNameDropdown.innerText = userData.username;
        // Optionally update default avatar if no custom one exists
        if (!localStorage.getItem('fotoPerfilUsuario')) {
            document.getElementById('imgPerfil').src = `https://ui-avatars.com/api/?name=${userData.username}&background=6366f1&color=fff`;
        }
    } catch (e) {
        window.location.href = '/login.html';
        return;
    }

    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(() => console.log("Service Worker registrado"))
            .catch(err => console.log("Erro no Service Worker", err));
    }

    popularSelectsMes();

    const [anoIni, mesIni] = mesAtual.split('-');
    if (document.getElementById('mes')) document.getElementById('mes').value = mesIni;
    if (document.getElementById('ano')) document.getElementById('ano').value = anoIni;
    if (document.getElementById('mesMobile')) document.getElementById('mesMobile').value = mesIni;
    if (document.getElementById('anoMobile')) document.getElementById('anoMobile').value = anoIni;
    if (localStorage.getItem('darkMode') === 'enabled') document.body.classList.add('dark-mode');

    // Load tips from backend
    try {
        const tipsRes = await fetch('/api/tips');
        dicasFinanceiras = await tipsRes.json();
        iniciarSliderDicas();
    } catch (e) {
        console.error("Erro ao carregar dicas", e);
    }

    // Load all data from backend
    await carregarDadosBackend();

    atualizarLabelTopo();

    const fotoSalva = localStorage.getItem('fotoPerfilUsuario');
    if (fotoSalva) {
        const imgPerfil = document.getElementById('imgPerfil');
        if (imgPerfil) imgPerfil.src = fotoSalva;
    }

    const isMobile = window.innerWidth <= 1024;
    const navMobile = document.getElementById('navMobile');
    if (navMobile) navMobile.style.display = isMobile ? 'flex' : 'none';
};

async function carregarDadosBackend() {
    try {
        const res = await fetch(`/api/financeiro`);
        dadosPorMes = await res.json();
        render();

        // Chamar IA para carregar insights após os dados estarem prontos
        buscarInsightsIA();
    } catch (e) {
        console.error("Erro ao carregar dados do backend", e);
        dadosPorMes = JSON.parse(localStorage.getItem('financeiroDados') || '{}');
        render();
    }
}

async function buscarInsightsIA() {
    // ---- IA DESATIVADA TEMPORARIAMENTE A PEDIDO DO USUARIO ----
    // Para reativar as dicas e análises da IA, basta apagar a linha "return;" abaixo.
    return;
    // -----------------------------------------------------------

    const dadosMes = dadosPorMes[mesAtual];
    if (!dadosMes) return;

    // Calcular totais para enviar à IA
    let totalRec = 0, totalPag = 0;
    dadosMes.receber.forEach(i => totalRec += i.valor); // Alterado para incluir todos os itens
    dadosMes.pagar.forEach(i => totalPag += i.valor); // Alterado para incluir todos os itens

    try {
        if (document.getElementById('aiReceber')) document.getElementById('aiReceber').innerText = "Analisando...";
        if (document.getElementById('aiPagar')) document.getElementById('aiPagar').innerText = "Analisando...";
        if (document.getElementById('aiSaldo')) document.getElementById('aiSaldo').innerText = "Analisando...";

        const res = await fetch('/api/ai/insights', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mes: mesAtual,
                totalReceber: totalRec,
                totalPagar: totalPag,
                saldo: totalRec - totalPag,
                lancamentos: [...dadosMes.receber, ...dadosMes.pagar].slice(0, 30) // Mais contexto
            })
        });

        if (res.ok) {
            const insights = await res.json();
            insightsIA = insights;
            // Atualizar Cardes da IA
            if (document.getElementById('aiReceber')) document.getElementById('aiReceber').innerText = insights.dica_receber || "";
            if (document.getElementById('aiPagar')) document.getElementById('aiPagar').innerText = insights.dica_pagar || "";
            if (document.getElementById('aiSaldo')) document.getElementById('aiSaldo').innerText = insights.dica_saldo || "";
            if (document.getElementById('aiReserva')) document.getElementById('aiReserva').innerText = "IA Monitorando";

            // Atualizar dica principal do topo
            if (insights.insight_geral && document.getElementById('tipText')) {
                // Remove insight anterior se houver
                dicasFinanceiras = dicasFinanceiras.filter(d => !d.includes('IA Insight:'));
                dicasFinanceiras.unshift(`<strong>IA Insight:</strong> ${insights.insight_geral}`);
                document.getElementById('tipText').innerHTML = dicasFinanceiras[0];
            }
        }
    } catch (e) {
        console.error("Erro ao buscar insights da IA", e);
    }
}

async function salvarNoBackend() {
    try {
        await fetch(`/api/financeiro/${mesAtual}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosPorMes[mesAtual] || { receber: [], pagar: [] })
        });
        localStorage.setItem('financeiroDados', JSON.stringify(dadosPorMes));
    } catch (e) {
        console.error("Erro ao salvar no backend", e);
        localStorage.setItem('financeiroDados', JSON.stringify(dadosPorMes));
    }
}

window.onresize = () => {
    const isMobile = window.innerWidth <= 1024;
    const navMobile = document.getElementById('navMobile');
    if (navMobile) navMobile.style.display = isMobile ? 'flex' : 'none';
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.toggle('d-lg-flex', !isMobile);
}

function iniciarSliderDicas() {
    const tipEl = document.getElementById('tipText');
    if (!tipEl || dicasFinanceiras.length === 0) return;
    tipEl.innerHTML = dicasFinanceiras[dicaAtual];
    setInterval(() => {
        tipEl.classList.add('tip-hidden');
        setTimeout(() => {
            dicaAtual = (dicaAtual + 1) % dicasFinanceiras.length;
            tipEl.innerHTML = dicasFinanceiras[dicaAtual];
            tipEl.classList.remove('tip-hidden');
        }, 500);
    }, 30000);
}

function scrollToId(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode') ? 'enabled' : 'disabled');
    atualizarGrafico();
}

function garantirMes() { if (!dadosPorMes[mesAtual]) dadosPorMes[mesAtual] = { receber: [], pagar: [] }; }
function formatar(v) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

function atualizarLabelTopo() {
    const selectMes = document.getElementById('mes');
    const selectAno = document.getElementById('ano');
    if (!selectMes || !selectAno) return;
    const textoMes = selectMes.options[selectMes.selectedIndex].text;
    const textoAno = selectAno.value;
    const label = document.getElementById('labelMesAtivo');
    if (label) label.innerText = `${textoMes} / ${textoAno}`;
}

function mudarMes() {
    const m = document.getElementById('mes').value;
    const a = document.getElementById('ano').value;
    mesAtual = `${a}-${m}`;
    localStorage.setItem('mesSelecionado', mesAtual);

    if (document.getElementById('mesMobile')) document.getElementById('mesMobile').value = m;
    if (document.getElementById('anoMobile')) document.getElementById('anoMobile').value = a;

    atualizarLabelTopo();
    render();
    buscarInsightsIA();
}

function mudarMesMobile() {
    const m = document.getElementById('mesMobile').value;
    const a = document.getElementById('anoMobile').value;
    mesAtual = `${a}-${m}`;

    if (document.getElementById('mes')) document.getElementById('mes').value = m;
    if (document.getElementById('ano')) document.getElementById('ano').value = a;

    localStorage.setItem('mesSelecionado', mesAtual);
    atualizarLabelTopo();
    render();
    buscarInsightsIA();
    document.getElementById('modalConfig').style.display = 'none';
}

function abrirConfigMobile() { document.getElementById('modalConfig').style.display = 'flex'; fecharDropdown(); }
function fecharModalGeral(e, id) { if (e.target.id === id) e.target.style.display = 'none'; }

function popularSelectsMes() {
    const selectsMes = [document.getElementById('mes'), document.getElementById('mesMobile')];
    const selectsAno = [document.getElementById('ano'), document.getElementById('anoMobile')];
    const mesesNomes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

    selectsMes.forEach(sel => {
        if (!sel) return;
        sel.innerHTML = '';
        mesesNomes.forEach((nome, idx) => {
            const option = document.createElement('option');
            option.value = String(idx + 1).padStart(2, '0');
            option.innerText = nome;
            sel.appendChild(option);
        });
    });

    selectsAno.forEach(sel => {
        if (!sel) return;
        sel.innerHTML = '';
        const anoAtualFull = new Date().getFullYear();
        for (let ano = anoAtualFull - 1; ano <= anoAtualFull + 10; ano++) {
            const option = document.createElement('option');
            option.value = ano;
            option.innerText = ano;
            sel.appendChild(option);
        }
    });
}

function toggleProfileMenu() {
    const dropdown = document.getElementById('profileDropdown');
    const isVisible = dropdown.style.display === 'block';
    dropdown.style.display = isVisible ? 'none' : 'block';
}

function fecharDropdown() {
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) dropdown.style.display = 'none';
}

// Close dropdown when clicking outside
window.addEventListener('click', (e) => {
    if (!e.target.closest('.perfil-wrapper')) {
        fecharDropdown();
    }
});

function abrirModalSenha() {
    document.getElementById('modalSenha').style.display = 'flex';
    fecharDropdown();
}

async function salvarNovaSenha() {
    const novaSenha = document.getElementById('novaSenha').value;
    if (!novaSenha) return alert("Digite a nova senha");

    try {
        const res = await fetch('/api/update_password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_password: novaSenha })
        });

        if (res.ok) {
            alert("Senha atualizada com sucesso!");
            document.getElementById('modalSenha').style.display = 'none';
            document.getElementById('novaSenha').value = '';
        } else {
            const data = await res.json();
            alert("Erro: " + (data.detail || "Não foi possível atualizar"));
        }
    } catch (e) {
        alert("Erro de conexão");
    }
}

function carregarFotoPerfil(event) {
    const arquivo = event.target.files[0];
    if (arquivo) {
        const leitor = new FileReader();
        leitor.onload = function (e) {
            document.getElementById('imgPerfil').src = e.target.result;
            localStorage.setItem('fotoPerfilUsuario', e.target.result);
        }
        leitor.readAsDataURL(arquivo);
    }
}

function animarValor(id, valorFinal) {
    const elemento = document.getElementById(id);
    if (!elemento) return;
    const duracao = 1000; const inicio = 0; const startTime = performance.now();
    function update(tempoAtual) {
        const progresso = Math.min((tempoAtual - startTime) / duracao, 1);
        const ease = 1 - Math.pow(1 - progresso, 4);
        elemento.innerText = (inicio + (valorFinal - inicio) * ease).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        if (progresso < 1) requestAnimationFrame(update);
        else elemento.innerText = valorFinal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
    requestAnimationFrame(update);
}

function abrirFormularioMobile() {
    const form = document.getElementById('areaFormulario');
    if (form) form.classList.add('mobile-popup');
}

function fecharFormularioMobile() {
    const form = document.getElementById('areaFormulario');
    if (form) form.classList.remove('mobile-popup');
    if (editandoIndex === null) {
        document.getElementById('descricao').value = '';
        document.getElementById('valor').value = '';
        document.getElementById('repeticoes').value = '1';
    }
}

function realizarTransacaoReserva(tipo) {
    const input = document.getElementById('inputValorReserva');
    const valor = Number(input.value);

    if (!valor || valor <= 0) { alert("Digite um valor válido."); return; }
    const hoje = new Date().toISOString().split('T')[0];
    garantirMes();

    if (tipo === 'depositar') {
        dadosPorMes[mesAtual].pagar.push({
            descricao: 'Aporte Reserva', valor: valor, data: hoje, categoria: 'Reserva', marcado: true
        });
        categoriasExpandidas['pagar']['Reserva'] = true;
    } else {
        dadosPorMes[mesAtual].receber.push({
            descricao: 'Resgate Reserva', valor: valor, data: hoje, categoria: 'Resgate Reserva', marcado: true
        });
        categoriasExpandidas['receber']['ResgateReserva'] = true;
    }
    salvarNoBackend(); render(); abrirRelatorioCard('reserva');
}

async function adicionar() {
    const tipo = document.getElementById('tipo').value;
    const descricao = document.getElementById('descricao').value;
    const valor = Number(document.getElementById('valor').value);
    let dataInput = document.getElementById('data').value;
    const categoria = document.getElementById('categoria').value;
    const repeticoes = parseInt(document.getElementById('repeticoes').value) || 1;

    if (!descricao || !valor) return alert("Preencha descrição e valor");
    garantirMes();

    const idSafe = categoria.replace(/[^a-zA-Z0-9]/g, '');
    categoriasExpandidas[tipo][idSafe] = true;

    if (editandoIndex !== null) {
        const item = { descricao, valor, data: dataInput, categoria, marcado: dadosPorMes[mesAtual][editandoTipo][editandoIndex].marcado };
        dadosPorMes[mesAtual][editandoTipo][editandoIndex] = item;
        await salvarNoBackendNoMes(mesAtual);
    } else {
        // Handle repetitions
        let dataAux = new Date(dataInput + 'T12:00:00');
        for (let i = 0; i < repeticoes; i++) {
            const ano = dataAux.getFullYear();
            const mes = String(dataAux.getMonth() + 1).padStart(2, '0');
            const mesChave = `${ano}-${mes}`;
            const dataStr = dataAux.toISOString().split('T')[0];

            if (!dadosPorMes[mesChave]) dadosPorMes[mesChave] = { receber: [], pagar: [] };

            const item = {
                descricao: repeticoes > 1 ? `${descricao} (${i + 1}/${repeticoes})` : descricao,
                valor,
                data: dataStr,
                categoria,
                marcado: false
            };

            dadosPorMes[mesChave][tipo].push(item);
            await salvarNoBackendNoMes(mesChave);

            // Move to next month
            dataAux.setMonth(dataAux.getMonth() + 1);
        }
    }

    editandoIndex = null;
    document.getElementById('btnSalvar').innerHTML = '<i class="fas fa-plus-circle"></i> Adicionar Lançamento';
    document.getElementById('descricao').value = '';
    document.getElementById('valor').value = '';
    document.getElementById('repeticoes').value = '1';

    render();
    fecharFormularioMobile();
}

async function salvarNoBackendNoMes(mesAlvo) {
    try {
        await fetch(`/api/financeiro/${mesAlvo}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosPorMes[mesAlvo] || { receber: [], pagar: [] })
        });
        localStorage.setItem('financeiroDados', JSON.stringify(dadosPorMes));
    } catch (e) {
        console.error("Erro ao salvar no backend", e);
        localStorage.setItem('financeiroDados', JSON.stringify(dadosPorMes));
    }
}

function prepararEdicao(tipo, index) {
    editandoIndex = index; editandoTipo = tipo;
    const item = dadosPorMes[mesAtual][tipo][index];
    document.getElementById('tipo').value = tipo;
    document.getElementById('descricao').value = item.descricao;
    document.getElementById('valor').value = item.valor;
    document.getElementById('data').value = item.data;
    document.getElementById('categoria').value = item.categoria;
    document.getElementById('btnSalvar').innerHTML = '<i class="fas fa-save"></i> Salvar Alteração';

    const isMobile = window.innerWidth <= 1024;
    if (isMobile) abrirFormularioMobile();
    else scrollToId('areaFormulario');
}

function remover(tipo, i) {
    if (confirm("Excluir?")) {
        dadosPorMes[mesAtual][tipo].splice(i, 1);
        salvarNoBackend(); render();
    }
}

function toggle(tipo, i) {
    dadosPorMes[mesAtual][tipo][i].marcado = !dadosPorMes[mesAtual][tipo][i].marcado;
    salvarNoBackend(); render();
}

function toggleCategoriaRow(tipo, idSafe) {
    categoriasExpandidas[tipo][idSafe] = !categoriasExpandidas[tipo][idSafe];
    render();
}

function calcularTotalReservaAcumulado() {
    let total = 0;
    Object.keys(dadosPorMes).forEach(mesKey => {
        const mesDados = dadosPorMes[mesKey];
        if (mesDados.pagar) {
            mesDados.pagar.forEach(i => { if (i.marcado && i.categoria === 'Reserva') total += i.valor; });
        }
        if (mesDados.receber) {
            mesDados.receber.forEach(i => { if (i.marcado && i.categoria === 'Resgate Reserva') total -= i.valor; });
        }
    });
    return total;
}

function render() {
    garantirMes();
    const tRec = document.getElementById('tabelaReceber');
    const tPag = document.getElementById('tabelaPagar');
    if (!tRec || !tPag) return;

    let totalRec = 0, totalPag = 0, urgente = false;
    const hoje = new Date().toISOString().split('T')[0];

    ['receber', 'pagar'].forEach(tipo => {
        const categoriasGroup = {};
        let pendentesTotaisDoTipo = 0;

        dadosPorMes[mesAtual][tipo].forEach((item, idx) => {
            const itemWithIdx = { ...item, idxOriginal: idx };
            if (!categoriasGroup[item.categoria]) categoriasGroup[item.categoria] = { total: 0, items: [], pendentes: 0 };

            categoriasGroup[item.categoria].items.push(itemWithIdx);
            categoriasGroup[item.categoria].total += item.valor;

            if (item.marcado) {
                if (tipo === 'receber') totalRec += item.valor;
                else totalPag += item.valor;
            } else {
                categoriasGroup[item.categoria].pendentes++;
                pendentesTotaisDoTipo++;
            }

            const atrasado = (tipo === 'pagar' && !item.marcado && item.data && item.data < hoje);
            if (atrasado) urgente = true;
        });

        const iconeTitulo = tipo === 'receber' ? '<i class="fas fa-arrow-down"></i>' : '<i class="fas fa-arrow-up"></i>';
        const nomeTitulo = tipo === 'receber' ? 'Entradas' : 'Saídas';
        const badgeTitulo = pendentesTotaisDoTipo > 0 ? `<span class="badge-pendente"><i class="fas fa-exclamation-circle"></i> ${pendentesTotaisDoTipo} pendente(s)</span>` : '';

        const titEl = document.getElementById(tipo === 'receber' ? 'tituloReceber' : 'tituloPagar');
        if (titEl) titEl.innerHTML = `${iconeTitulo} ${nomeTitulo} ${badgeTitulo}`;

        const catKeys = Object.keys(categoriasGroup).sort((a, b) => categoriasGroup[b].total - categoriasGroup[a].total);
        let html = '';

        catKeys.forEach(cat => {
            const idSafe = cat.replace(/[^a-zA-Z0-9]/g, '');
            const isExpanded = categoriasExpandidas[tipo][idSafe] || false;
            const displayRow = isExpanded ? 'table-row' : 'none';
            const iconRot = isExpanded ? 'rotate(90deg)' : 'rotate(0deg)';
            const corBorda = tipo === 'receber' ? 'var(--success)' : 'var(--danger)';
            const badgeCategoria = categoriasGroup[cat].pendentes > 0 ? `<i class="fas fa-circle dot-pendente" title="Há itens pendentes"></i>` : '';

            html += `
                <tr class="row-category" onclick="toggleCategoriaRow('${tipo}', '${idSafe}')" style="border-left: 3px solid ${corBorda};">
                    <td style="font-weight:600; color:var(--text-dark);">
                        <div class="cat-title-wrapper">
                            <i class="fas fa-chevron-right" style="font-size:0.7rem; transition:0.3s; transform:${iconRot}"></i>
                            <span>${cat}</span>
                            <span style="font-size:0.75rem; color:var(--text-light); font-weight:normal;">(${categoriasGroup[cat].items.length})</span>
                            ${badgeCategoria}
                        </div>
                    </td>
                    <td style="font-weight:700; text-align:right;">${formatar(categoriasGroup[cat].total)}</td>
                    <td></td><td></td><td></td>
                </tr>
            `;

            categoriasGroup[cat].items.sort((a, b) => (a.data > b.data ? 1 : -1));

            categoriasGroup[cat].items.forEach(item => {
                const i = item.idxOriginal;
                const atrasado = (tipo === 'pagar' && !item.marcado && item.data && item.data < hoje);
                html += `
                    <tr style="display:${displayRow}; background: rgba(0,0,0,0.01);">
                        <td style="padding-left: 28px;">
                            <span class="desc-text ${atrasado ? 'vencido' : ''}" style="font-size: 0.8rem; color: var(--text-light);">
                                ${atrasado ? '⚠️ ' : ''}${item.descricao}
                            </span>
                        </td>
                        <td style="text-align:right; font-size:0.8rem;">${formatar(item.valor)}</td>
                        <td style="font-size:0.8rem; text-align:center;">${item.data ? item.data.split('-').reverse().slice(0, 2).join('/') : '-'}</td>
                        <td style="text-align:center;"><input type="checkbox" class="custom-check" ${item.marcado ? 'checked' : ''} onclick="toggle('${tipo}', ${i})"></td>
                        <td style="text-align:right;">
                            <button class="btn-action btn-edit" onclick="prepararEdicao('${tipo}', ${i})"><i class="fas fa-pen"></i></button>
                            <button class="btn-action btn-del" onclick="remover('${tipo}', ${i})"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            });
        });

        if (tipo === 'receber') tRec.innerHTML = html; else tPag.innerHTML = html;
    });

    const totalReservaAcumulado = calcularTotalReservaAcumulado();

    const banner = document.getElementById('bannerAlerta');
    if (banner) banner.style.display = urgente ? 'block' : 'none';

    animarValor('totalRecebido', totalRec);
    animarValor('totalPago', totalPag);
    animarValor('totalReserva', totalReservaAcumulado);
    animarValor('saldo', totalRec - totalPag);

    atualizarGrafico();
}

let chartSidebar = null; let chartMobile = null;
function atualizarGrafico() {
    if (!dadosPorMes[mesAtual]) return;
    const resumo = {};
    dadosPorMes[mesAtual].pagar.forEach(item => { if (item.marcado) resumo[item.categoria] = (resumo[item.categoria] || 0) + item.valor; });

    const chartConfig = {
        type: 'doughnut',
        data: {
            labels: Object.keys(resumo),
            datasets: [{
                data: Object.values(resumo),
                backgroundColor: ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.label || '';
                            if (label) label += ': ';
                            if (context.raw !== null) label += context.raw.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                            return label;
                        }
                    }
                }
            }
        }
    };

    const ctxSide = document.getElementById('graficoSidebar');
    if (chartSidebar) chartSidebar.destroy();
    if (ctxSide && Object.keys(resumo).length > 0) chartSidebar = new Chart(ctxSide, chartConfig);

    const ctxMob = document.getElementById('graficoMobile');
    if (chartMobile) chartMobile.destroy();
    if (ctxMob && Object.keys(resumo).length > 0) chartMobile = new Chart(ctxMob, chartConfig);
}

const msgsCategoria = {
    'Filho': "Os gastos com os pequenos estão no topo! Cuidar deles é prioridade.",
    'Supermercado': "O supermercado levou a maior fatia do orçamento. Fazer uma lista rigorosa ajuda!",
    'Alimentação': "Comer fora ou pedir delivery pesou bastante. Tente cozinhar mais em casa.",
    'Lazer': "Você curtiu bastante esse mês! Defina um teto máximo para o lazer.",
    'Transporte': "Gastos com transporte estão altos. Avalie rotas ou alternativas.",
    'Saúde': "A saúde cobrou seu preço. Lembre-se que bem-estar é investimento.",
    'Moradia': "Sua casa é o maior custo. Revise planos de internet e energia.",
    'Credito': "Cuidado com o cartão de crédito e juros!",
    'Assinaturas': "Muitos streamings? Cancele o que não usa.",
    'default': "Fique de olho nesta categoria! Ela foi a campeã de gastos."
};

function abrirRelatorioCard(tipo) {
    garantirMes();
    const corpo = document.getElementById('corpoRelatorio');
    const titulo = document.getElementById('modalRelatorioTitulo');
    if (!corpo || !titulo) return;
    corpo.innerHTML = '';

    let total = 0;

    if (tipo === 'receber') {
        titulo.innerText = "🟢 Resumo de Recebimentos";
        const recebidos = dadosPorMes[mesAtual].receber.filter(i => i.marcado);
        recebidos.forEach(i => total += i.valor);

        if (insightsIA && insightsIA.analise_receber) {
            corpo.innerHTML += `
                <div class="insight-card" style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3);">
                    <div class="insight-icon" style="background: var(--success); color: white;"><i class="fas fa-robot"></i></div>
                    <div>
                        <h4 style="margin:0; color: var(--text-dark);"><i class="fas fa-robot"></i> Análise da IA</h4>
                        <p style="margin: 5px 0 0 0; font-size: 0.9rem; color: var(--text-light);">
                            ${insightsIA.analise_receber}
                        </p>
                    </div>
                </div>
                <h4 style="margin-bottom:10px; color: var(--text-light); text-transform:uppercase; font-size:0.8rem;">Todas as Entradas Realizadas</h4>
            `;
        } else {
            corpo.innerHTML += `
                <div class="insight-card" style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3);">
                    <div class="insight-icon" style="background: var(--success); color: white;"><i class="fas fa-hand-holding-usd"></i></div>
                    <div>
                        <h4 style="margin:0; color: var(--text-dark);">Mandou muito bem!</h4>
                        <p style="margin: 5px 0 0 0; font-size: 0.9rem; color: var(--text-light);">
                            Você já garantiu <strong>${formatar(total)}</strong> neste mês. Continue focando em aumentar suas fontes de renda!
                        </p>
                    </div>
                </div>
                <h4 style="margin-bottom:10px; color: var(--text-light); text-transform:uppercase; font-size:0.8rem;">Todas as Entradas Realizadas</h4>
            `;
        }
        recebidos.forEach(item => {
            const data = item.data ? item.data.split('-').reverse().join('/') : '-';
            corpo.innerHTML += `<div class="item-list"><span>${data} - ${item.descricao}</span><span style="font-weight:bold; color:var(--success)">${formatar(item.valor)}</span></div>`;
        });

    } else if (tipo === 'pagar') {
        titulo.innerText = "🔴 Resumo de Saídas";
        const totaisCat = {};
        const pagos = dadosPorMes[mesAtual].pagar.filter(i => i.marcado);
        pagos.forEach(i => { total += i.valor; totaisCat[i.categoria] = (totaisCat[i.categoria] || 0) + i.valor; });

        let topCat = ''; let maxVal = 0;
        for (let c in totaisCat) { if (totaisCat[c] > maxVal) { maxVal = totaisCat[c]; topCat = c; } }

        if (maxVal > 0) {
            if (insightsIA && insightsIA.analise_pagar) {
                corpo.innerHTML += `
                    <div class="insight-card" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3);">
                        <div class="insight-icon" style="background: var(--danger); color: white;"><i class="fas fa-robot"></i></div>
                        <div>
                            <h4 style="margin:0; color: var(--text-dark);">Análise da IA</h4>
                            <p style="margin: 5px 0 0 0; font-size: 0.9rem; color: var(--text-light);">
                                ${insightsIA.analise_pagar}
                            </p>
                        </div>
                    </div>
                `;
            } else {
                let msgPersonalizada = msgsCategoria[topCat] || msgsCategoria['default'];
                corpo.innerHTML += `
                    <div class="insight-card" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3);">
                        <div class="insight-icon" style="background: var(--danger); color: white;"><i class="fas fa-exclamation-triangle"></i></div>
                        <div>
                            <h4 style="margin:0; color: var(--text-dark);">Maior Gasto: ${topCat}</h4>
                            <p style="margin: 5px 0 0 0; font-size: 0.9rem; color: var(--text-light);">
                                Você gastou <strong>${formatar(maxVal)}</strong> com isso.<br> ${msgPersonalizada}
                            </p>
                        </div>
                    </div>
                `;
            }
        }
        corpo.innerHTML += `<h4 style="margin-bottom:10px; color: var(--text-light); text-transform:uppercase; font-size:0.8rem;">Todas as Saídas Realizadas</h4>`;
        pagos.forEach(item => {
            const data = item.data ? item.data.split('-').reverse().join('/') : '-';
            corpo.innerHTML += `<div class="item-list"><span>${data} - ${item.descricao}</span><span style="font-weight:bold; color:var(--danger)">${formatar(item.valor)}</span></div>`;
        });

    } else if (tipo === 'reserva') {
        titulo.innerText = "💰 Detalhes da Reserva";
        const totalAcumulado = calcularTotalReservaAcumulado();
        let aportesMes = 0; dadosPorMes[mesAtual].pagar.filter(i => i.marcado && i.categoria === 'Reserva').forEach(i => aportesMes += i.valor);
        let resgatesMes = 0; dadosPorMes[mesAtual].receber.filter(i => i.marcado && i.categoria === 'Resgate Reserva').forEach(i => resgatesMes += i.valor);

        corpo.innerHTML += `
            <div class="insight-card" style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3);">
                <div class="insight-icon" style="background: var(--warning); color: white;"><i class="fas fa-piggy-bank"></i></div>
                <div>
                    <h4 style="margin:0; color: var(--text-dark);">Saldo Total Guardado</h4>
                    <p style="margin: 5px 0 0 0; font-size: 1.2rem; font-weight:bold; color: var(--warning);">
                        ${formatar(totalAcumulado)}
                    </p>
                </div>
            </div>

            <div style="background: rgba(0,0,0,0.03); padding: 15px; border-radius: 12px; margin-bottom: 20px; border: 1px dashed rgba(0,0,0,0.1);">
                <label style="display:block; margin-bottom:5px; font-weight:600; font-size:0.9rem;">Nova Movimentação</label>
                <input id="inputValorReserva" type="number" placeholder="Valor (R$)" style="margin-bottom: 10px;">
                <div style="display: flex; gap: 10px;">
                     <button class="btn-green" onclick="realizarTransacaoReserva('depositar')"><i class="fas fa-plus-circle"></i> Guardar</button>
                     <button class="btn-red" onclick="realizarTransacaoReserva('sacar')"><i class="fas fa-minus-circle"></i> Resgatar</button>
                </div>
            </div>
            
            <div style="display:flex; justify-content:space-between; margin-bottom:10px; padding:10px; background:var(--glass-bg); border-radius:8px;">
                 <span>Movimentação do Mês:</span>
                 <span style="font-weight:bold;">+${formatar(aportesMes)} / -${formatar(resgatesMes)}</span>
            </div>
        `;

    } else if (tipo === 'saldo') {
        titulo.innerText = "⚖️ Balanço Disponível";
        let totalRec = 0; dadosPorMes[mesAtual].receber.filter(i => i.marcado).forEach(i => totalRec += i.valor);
        let totalPag = 0; dadosPorMes[mesAtual].pagar.filter(i => i.marcado).forEach(i => totalPag += i.valor);
        let saldoFinal = totalRec - totalPag;
        const reservaTotal = calcularTotalReservaAcumulado();

        corpo.innerHTML += `
            <div style="background: var(--card-bg); border-radius: 12px; padding: 15px; border: 1px solid var(--border-color);">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <span>Saldo Disponível (Carteira):</span> <span style="font-weight:bold; font-size:1.1rem; color:var(--info)">${formatar(saldoFinal)}</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid rgba(0,0,0,0.1); padding-bottom:10px;">
                    <span>Guardado na Reserva:</span> <span style="font-weight:bold; color:var(--warning)">${formatar(reservaTotal)}</span>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:1.2rem; font-weight:bold;">
                    <span>Patrimônio Total:</span> <span style="color:var(--success)">${formatar(saldoFinal + reservaTotal)}</span>
                </div>
                <p style="font-size:0.8rem; color:var(--text-light); text-align:center; margin-top:10px;">* O saldo disponível já teve os valores da reserva descontados.</p>
            </div>
        `;
    }
    document.getElementById('modalRelatorio').style.display = 'flex';
}

function gerarRelatorioDiario() {
    garantirMes();
    let totalEntradasOk = 0, totalSaidasOk = 0, totalEntradasGeral = 0, totalSaidasGeral = 0;
    dadosPorMes[mesAtual].receber.forEach(item => { totalEntradasGeral += item.valor; if (item.marcado) totalEntradasOk += item.valor; });
    dadosPorMes[mesAtual].pagar.forEach(item => { totalSaidasGeral += item.valor; if (item.marcado) totalSaidasOk += item.valor; });

    const saldoGeral = totalEntradasGeral - totalSaidasGeral;
    const diferencaOk = totalEntradasOk - totalSaidasOk;
    const corBalanco = saldoGeral >= 0 ? '#10b981' : '#ef4444'; const corRealizado = diferencaOk >= 0 ? '#10b981' : '#ef4444';

    let msgMotivacional = "";
    if (diferencaOk > 2000) msgMotivacional = "🚀 <strong>Caixa Forte!</strong> Seu saldo real está excelente.";
    else if (diferencaOk > 500) msgMotivacional = "👏 <strong>No Azul!</strong> Você tem dinheiro sobrando.";
    else if (diferencaOk > 0) msgMotivacional = "😅 <strong>Positivo, mas cuidado!</strong>";
    else msgMotivacional = "⚠️ <strong>Alerta de Caixa!</strong>";

    const corpo = document.getElementById('corpoRelatorio');
    const tit = document.getElementById('modalRelatorioTitulo');
    if (!corpo || !tit) return;

    tit.innerText = "📊 Relatório Financeiro Global";

    corpo.innerHTML = `
        <div style="background: rgba(0,0,0,0.02); border-left: 5px solid ${corBalanco}; border-radius: 8px; padding: 15px; margin-bottom: 15px; border: 1px solid rgba(0,0,0,0.05);">
            <h4 style="margin: 0 0 10px 0; font-size: 0.8rem; color: var(--text-light); text-transform: uppercase;">📊 Previsão Geral (Lançado)</h4>
            <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 5px;">
                <span>Total Lançado:</span><span style="font-weight: bold;">${formatar(totalEntradasGeral)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 8px;">
                <span>Saídas Lançadas:</span><span style="font-weight: bold; color: var(--danger);">${formatar(totalSaidasGeral)}</span>
            </div>
            <div style="border-top: 1px solid rgba(0,0,0,0.1); padding-top: 8px; display: flex; justify-content: space-between; font-weight: bold;">
                <span>Saldo Final Previsto:</span><span style="color: ${corBalanco}">${formatar(saldoGeral)}</span>
            </div>
        </div>
        <div style="background: rgba(0,0,0,0.02); border-left: 5px solid ${corRealizado}; border-radius: 8px; padding: 15px; margin-bottom: 15px; border: 1px solid rgba(0,0,0,0.05);">
            <h4 style="margin: 0 0 5px 0; font-size: 0.8rem; color: var(--text-light); text-transform: uppercase;">💡 Realizado até agora (Pago/Recebido)</h4>
            <p style="margin: 0; font-size: 0.95rem; color: var(--text-dark);">
                ${diferencaOk >= 0 ? '✅ Seu caixa está positivo em ' : '⚠️ Você gastou ' + formatar(Math.abs(diferencaOk)) + ' a mais do que recebeu '} 
                <strong>${formatar(diferencaOk)}</strong>.
            </p>
        </div>
        <div style="background: ${corRealizado}15; border-left: 5px solid ${corRealizado}; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
            <p style="margin: 0; font-size: 0.9rem; color: var(--text-dark); line-height: 1.4;">${msgMotivacional}</p>
        </div>
        ${insightsIA ? `
        <div id="aiRelatorioGeral" style="background: var(--primary-gradient); color: white; padding: 15px; border-radius: 12px; margin-bottom: 15px;">
            <h4 style="margin-top:0; font-size:0.8rem; text-transform:uppercase;"><i class="fas fa-robot"></i> Análise da IA</h4>
            <p id="aiRelatorioTexto" style="font-size:0.85rem; margin:0; line-height:1.4;">${insightsIA.analise_geral || 'Analisando seus dados...'}</p>
        </div>` : ''}
    `;

    document.getElementById('modalRelatorio').style.display = 'flex';
}

function exportarDados() { const blob = new Blob([JSON.stringify(dadosPorMes)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = "financeiro_backup.json"; a.click(); }
function importarDados(e) {
    const reader = new FileReader(); reader.onload = async (ev) => {
        dadosPorMes = JSON.parse(ev.target.result);
        // Sync all months with backend
        for (const mes in dadosPorMes) {
            await fetch(`/api/financeiro/${mes}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dadosPorMes[mes])
            });
        }
        render();
        alert("Restaurado!");
    }; reader.readAsText(e.target.files[0]);
}


// Logout logic
window.fazerLogout = async function () {
    if (confirm("Deseja sair?")) {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/login.html';
    }
}
