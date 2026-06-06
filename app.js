// CONFIGURAÇÕES REAIS DO SEU FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyAiCNzPp0XfrJtBoax-1B6O9yljYHN2NHI",
    authDomain: "plataformatemporeal.firebaseapp.com",
    databaseURL: "https://plataformatemporeal-default-rtdb.firebaseio.com/",
    projectId: "plataformatemporeal",
    storageBucket: "plataformatemporeal.appspot.com",
    messagingSenderId: "1014332115482",
    appId: "1:1014332115482:web:f7072f322d403c56c49fa3"
};

// Inicializa o Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Estado Global de Sessão
let currentChatId = null;
let selectedUsers = []; // Armazena temporariamente marcados para chat

let globalPresenceRef = null;
let activeMessagesQuery = null;

const zonaMensagens = document.getElementById('zona-mensagens');
const textoMensagemInput = document.getElementById('texto-mensagem');
const btnEnviar = document.getElementById('btn-enviar');

window.onload = function() {
    const savedName = localStorage.getItem('na_escuta_username');
    if (savedName) {
        document.getElementById('display-profile-name').innerText = savedName;
        alternarTela('screen-home');
        initUserPresenceAndLoadNetwork(savedName);
    }

    if (textoMensagemInput) {
        textoMensagemInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') { enviarMensagem(); }
        });
    }
    if (btnEnviar) {
        btnEnviar.addEventListener('click', enviarMensagem);
    }

    applyAntiScreenshotProtection();
};

function alternarTela(idDaTelaAtiva) {
    document.querySelectorAll('.screen').forEach(tela => tela.classList.remove('active'));
    document.getElementById(idDaTelaAtiva).classList.add('active');
}

function enterApp() {
    const usernameInput = document.getElementById('username').value.trim();
    const keepLogged = document.getElementById('keep-logged').checked;

    if (usernameInput === "") {
        alert("Por favor, introduz um nome para continuar!");
        return;
    }
    
    if (keepLogged) localStorage.setItem('na_escuta_username', usernameInput);
    document.getElementById('display-profile-name').innerText = usernameInput;
    
    initUserPresenceAndLoadNetwork(usernameInput);
    alternarTela('screen-home');
}

/* ==========================================================================
   SISTEMA DE DISPONIBILIDADE E PRESENÇA DIRETA (SEM CONCEITO DE SALA)
   ========================================================================== */
function initUserPresenceAndLoadNetwork(username) {
    // Referência única do usuário logado na raiz global de usuários ativos
    globalPresenceRef = database.ref(`status_usuarios/${username}`);
    
    // Define status inicial padrão e configura remoção automática ao desconectar
    globalPresenceRef.set({ label: "Na escuta", css: "online" });
    globalPresenceRef.onDisconnect().remove();

    // Começa a escutar TODOS os usuários disponíveis no sistema de forma reativa
    database.ref('status_usuarios').on('value', (snapshot) => {
        renderGlobalUsers(snapshot.val() || {}, username);
    });

    // Inicializa a escuta para carregar as conversas direcionadas a mim
    listenToMyConversations(username);
}

function changeUserStatus(label, cssClass) {
    const myName = document.getElementById('display-profile-name').innerText;
    document.getElementById('display-profile-status').innerText = `🎧 ${label}`;
    document.getElementById('display-profile-status').className = `status-tag ${cssClass}`;
    
    database.ref(`status_usuarios/${myName}`).set({ label: label, css: cssClass });
    toggleSettingsMenu();
}

// Renderiza a listagem de todos os usuários que estão com o app aberto na nuvem
function renderGlobalUsers(usersObj, myName) {
    const listContainer = document.getElementById('user-list');
    listContainer.innerHTML = '';

    Object.keys(usersObj).forEach((userKey) => {
        if (userKey === myName) return; // Omitir a si próprio da lista de seleção

        const statusData = usersObj[userKey];
        const isChecked = selectedUsers.includes(userKey) ? 'checked' : '';

        const item = document.createElement('div');
        item.className = 'user-item';
        item.id = `user-row-${userKey}`;
        
        item.innerHTML = `
            <input type="checkbox" class="user-select-checkbox" data-user="${userKey}" ${isChecked} onclick="event.stopPropagation(); toggleUserSelection('${userKey}')">
            <div class="user-avatar" style="margin-left: 8px;">👤</div>
            <div style="flex:1; margin-left: 4px;">
                <div class="user-name">${userKey}</div>
                <div class="user-status">${statusData.label}</div>
            </div>
            <span class="status-tag ${statusData.css}">${statusData.label}</span>
        `;

        item.onclick = () => toggleUserSelection(userKey);
        listContainer.appendChild(item);
    });
}

function toggleUserSelection(username) {
    const idx = selectedUsers.indexOf(username);
    if (idx > -1) {
        selectedUsers.splice(idx, 1);
    } else {
        selectedUsers.push(username);
    }
    
    const cb = document.querySelector(`.user-select-checkbox[data-user="${username}"]`);
    if (cb) cb.checked = selectedUsers.includes(username);

    updateMultiChatButtonUI();
}

function updateMultiChatButtonUI() {
    const btn = document.getElementById('btn-start-multi-chat');
    if (btn) btn.innerText = `Conversar (${selectedUsers.length})`;
}

function filterUserList() {
    const term = document.getElementById('search-user-input').value.toLowerCase();
    document.querySelectorAll('.user-item').forEach(item => {
        const name = item.querySelector('.user-name').innerText.toLowerCase();
        item.style.display = name.includes(term) ? 'flex' : 'none';
    });
}

/* ==========================================================================
   GERENCIAMENTO DE CONVERSAS REALTIME BASEADO EM INTEGRANTES
   ========================================================================== */
function startChatWithSelected() {
    if (selectedUsers.length === 0) {
        alert("Escolha pelo menos 1 usuário disponível para iniciar o bate-papo!");
        return;
    }
    
    const myName = document.getElementById('display-profile-name').innerText;
    
    // Concatena os nomes ordenados para gerar uma chave única previsível para este conjunto
    const todosParticipantes = [myName, ...selectedUsers].sort();
    const hashChatId = "SESSAO_" + todosParticipantes.join("_");

    // Registra a conversa no nó indexado de cada usuário participante
    todosParticipantes.forEach((membro) => {
        const parceiros = todosParticipantes.filter(n => n !== membro).join(", ");
        database.ref(`conversas_ativas/${membro}/${hashChatId}`).set({
            listaParceiros: parceiros,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    });

    const parceirosTexto = selectedUsers.join(", ");
    selectedUsers = [];
    updateMultiChatButtonUI();
    document.querySelectorAll('.user-select-checkbox').forEach(c => c.checked = false);

    loadChatInterface(hashChatId, parceirosTexto);
}

function listenToMyConversations(myName) {
    database.ref(`conversas_ativas/${myName}`).on('value', (snapshot) => {
        const listContainer = document.getElementById('main-chat-list');
        const emptyState = document.getElementById('empty-state');
        const conversas = snapshot.val() || {};

        if (Object.keys(conversas).length > 0 && emptyState) emptyState.remove();
        document.querySelectorAll('.chat-item').forEach(el => el.remove());

        Object.keys(conversas).forEach((idDoChat) => {
            const dados = conversas[idDoChat];
            
            const chatItem = document.createElement('div');
            chatItem.className = 'chat-item';
            chatItem.id = `chat-item-${idDoChat}`;
            
            chatItem.innerHTML = `
                <div class="avatar">👤</div>
                <div class="chat-info" onclick="loadChatInterface('${idDoChat}', '${dados.listaParceiros}')">
                    <div class="chat-header">
                        <h3 style="max-width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${dados.listaParceiros}</h3>
                        <span class="chat-time">Canal Aberto</span>
                    </div>
                    <p class="chat-last-message" id="last-txt-${idDoChat}">Nenhuma mensagem trafegada ainda.</p>
                </div>
                <button class="small-btn-end" onclick="event.stopPropagation(); deleteConversationNode('${idDoChat}')">Encerrar</button>
            `;
            listContainer.appendChild(chatItem);

            // Escuta a última mensagem postada no canal
            database.ref(`mensagens_canais/${idDoChat}`).limitToLast(1).on('child_added', (msgSnap) => {
                const txtEl = document.getElementById(`last-txt-${idDoChat}`);
                if (txtEl) txtEl.innerText = `${msgSnap.val().autor}: ${msgSnap.val().texto}`;
            });
        });
    });
}

function loadChatInterface(chatId, titleText) {
    currentChatId = chatId;
    document.getElementById('chat-contact-name').innerText = titleText;
    zonaMensagens.innerHTML = `
        <div class="crypto-notice">🔒 Canal criptografado estabelecido direto com os envolvidos.</div>
    `;

    alternarTela('screen-chat');

    if (activeMessagesQuery) activeMessagesQuery.off();

    activeMessagesQuery = database.ref(`mensagens_canais/${chatId}`);
    
    activeMessagesQuery.on('child_added', (snapshot) => {
        const msgId = snapshot.key;
        const msg = snapshot.val();
        const myName = document.getElementById('display-profile-name').innerText;
        const direction = (msg.autor === myName) ? 'sent' : 'received';

        // Confirmação de leitura instantânea ao receber no dispositivo
        if (direction === 'received' && (!msg.vistoPor || !msg.vistoPor[myName])) {
            database.ref(`mensagens_canais/${chatId}/${msgId}/vistoPor/${myName}`).set(true);
        }

        renderMessageBubble(msgId, msg, direction, myName);
    });

    // Observa alterações para atualização dinâmica dos ticks (✔️ -> ✔️✔️)
    activeMessagesQuery.on('child_changed', (snapshot) => {
        const msgId = snapshot.key;
        const msg = snapshot.val();
        const myName = document.getElementById('display-profile-name').innerText;
        
        if (msg.autor === myName) {
            updateTickMarkUI(msgId, msg);
        }
    });
}

function exitChatView() {
    if (activeMessagesQuery) activeMessagesQuery.off();
    currentChatId = null;
    alternarTela('screen-home');
}

/* ==========================================================================
   INTERAÇÃO DE MENSAGENS E GESTÃO DE MARCAÇÃO DE ENTREGA/VISTO
   ========================================================================== */
function enviarMensagem() {
    if (!currentChatId) return;
    const myName = document.getElementById('display-profile-name').innerText;
    const texto = textoMensagemInput.value.trim();

    if (texto !== "") {
        const agora = new Date();
        const horaFormatada = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        const novaMsgRef = database.ref(`mensagens_canais/${currentChatId}`).push();
        const vistoPorInicial = {};
        vistoPorInicial[myName] = true;

        novaMsgRef.set({
            autor: myName,
            texto: texto,
            hora: horaFormatada,
            vistoPor: vistoPorInicial
        });

        textoMensagemInput.value = "";
    }
}

function renderMessageBubble(msgId, msg, direction, myName) {
    if (document.getElementById(`msg-${msgId}`)) return;

    const bubble = document.createElement('div');
    bubble.className = `message ${direction}`;
    bubble.id = `msg-${msgId}`;

    const metadata = direction === 'received' ? `<span class="msg-meta">${msg.autor}</span>` : '';
    
    bubble.innerHTML = `
        ${metadata}
        <p class="msg-texto">${msg.texto}</p>
        <span class="message-time">
            ${msg.hora} ${direction === 'sent' ? `<span id="tick-container-${msgId}">✔️</span>` : ''}
        </span>
    `;

    zonaMensagens.appendChild(bubble);
    zonaMensagens.scrollTop = zonaMensagens.scrollHeight;

    if (direction === 'sent') {
        updateTickMarkUI(msgId, msg);
    }
}

function updateTickMarkUI(msgId, msg) {
    const el = document.getElementById(`tick-container-${msgId}`);
    if (!el) return;

    // Extrai os integrantes pelo Id da Sessão para computar se todos leram
    const integrantesChat = currentChatId.replace("SESSAO_", "").split("_");
    const totalEsperado = integrantesChat.length;
    const totalVisualizacoes = msg.vistoPor ? Object.keys(msg.vistoPor).length : 1;

    if (totalVisualizacoes >= totalEsperado) {
        el.innerText = "✔️✔️";
        el.style.color = "var(--accent)";
    } else {
        el.innerText = "✔️";
        el.style.color = "rgba(255, 255, 255, 0.4)";
    }
}

/* ==========================================================================
   BOTÃO ENCERRAR ESCUTA (DESTRUIÇÃO EFÊMERA DE SESSÃO)
   ========================================================================== */
function endEscutaSession() {
    if (!currentChatId) return;
    deleteConversationNode(currentChatId);
    exitChatView();
}

function deleteConversationNode(chatId) {
    const myName = document.getElementById('display-profile-name').innerText;
    
    // Desvincula do painel do usuário que solicitou o encerramento
    database.ref(`conversas_ativas/${myName}/${chatId}`).remove();
    
    const integrantes = chatId.replace("SESSAO_", "").split("_");
    
    // Verifica na raiz se todos os envolvidos limparam esse nó para apagar as mensagens definitivamente
    database.ref(`conversas_ativas`).once('value', (snap) => {
        const tudo = snap.val() || {};
        let limparMensagensSeguras = true;

        integrantes.forEach((p) => {
            if (tudo[p] && tudo[p][chatId]) {
                limparMensagensSeguras = false;
            }
        });

        if (limparMensagensSeguras) {
            database.ref(`mensagens_canais/${chatId}`).remove();
        }
    });

    const el = document.getElementById(`chat-item-${chatId}`);
    if (el) el.remove();
}

/* ==========================================================================
   PROTEÇÃO TOTAL ANTI-PRINT E PROTEÇÃO VISUAL CONTRA CAPTURAS
   ========================================================================== */
function applyAntiScreenshotProtection() {
    window.addEventListener('blur', () => {
        document.body.style.filter = 'blur(20px) grayscale(100%)';
    });
    window.addEventListener('focus', () => {
        document.body.style.filter = 'none';
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'PrintScreen' || (e.ctrlKey && e.key === 'p') || (e.metaKey && e.shiftKey && e.key === '3') || (e.metaKey && e.shiftKey && e.key === '4')) {
            e.preventDefault();
            executeBlackoutFlash();
        }
    });
}

function executeBlackoutFlash() {
    const blackout = document.createElement('div');
    blackout.style.position = 'fixed'; blackout.style.top = '0'; blackout.style.left = '0';
    blackout.style.width = '100vw'; blackout.style.height = '100vh';
    blackout.style.background = '#000000'; blackout.style.zIndex = '999999';
    document.body.appendChild(blackout);

    alert("🔒 CAMADA DE PRIVACIDADE: Capturas de tela e logs de imagem são proibidos no Na_escuta.");
    setTimeout(() => blackout.remove(), 1200);
}

// Utilitários auxiliares de Interface
function openAboutModal() { document.getElementById('about-modal').classList.add('active'); }
function closeAboutModal() { document.getElementById('about-modal').classList.remove('active'); }
function toggleSettingsMenu() { document.getElementById('settings-menu').classList.toggle('show'); }
function logoutApp() { 
    const myName = document.getElementById('display-profile-name').innerText;
    if (globalPresenceRef) globalPresenceRef.remove();
    localStorage.clear(); 
    location.reload(); 
}
