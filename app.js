// CONFIGURAÇÕES DO FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyAiCNzPp0XfrJtBoax-1B6O9ylYHN2NHI",
    authDomain: "plataformatemporeal.firebaseapp.com",
    databaseURL: "https://plataformatemporeal-default-rtdb.firebaseio.com/",
    projectId: "plataformatemporeal",
    storageBucket: "plataformatemporeal.appspot.com",
    messagingSenderId: "1014332115482",
    appId: "1:1014332115482:web:f7072f322d403c56c49fa3"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Estado Global
let currentChatId = null;
let selectedUsers = []; 
let globalPresenceRef = null;
let activeMessagesQuery = null;
let activeTypingQuery = null;
let msgLifespanMinutes = 30; // Tempo padrão inicial solicitado

// Áudio e UX
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let audioTimerInterval;
let audioSeconds = 0;
let typingTimeoutToken = null;

const zonaMensagens = document.getElementById('zona-mensagens');
const textoMensagemInput = document.getElementById('texto-mensagem');
const btnEnviar = document.getElementById('btn-enviar');
const btnAudio = document.getElementById('btn-audio');
const btnPhoto = document.getElementById('btn-photo');
const audioTimerBadge = document.getElementById('audio-timer-badge');
const typingBar = document.getElementById('typing-indicator-bar');

window.onload = function() {
    verificarCadastroExistente();

    if (textoMensagemInput) {
        textoMensagemInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') { enviarMensagem(); }
        });
        
        textoMensagemInput.addEventListener('input', () => {
            if (textoMensagemInput.value.trim() !== "") {
                btnEnviar.style.display = "flex";
                btnAudio.style.display = "none";
            } else {
                btnEnviar.style.display = "none";
                btnAudio.style.display = "flex";
            }
        });
    }
    if (btnEnviar) btnEnviar.addEventListener('click', enviarMensagem);

    applyAntiScreenshotProtection();
};

// Verifica se o usuário já tem registro local e preenche previamente
function verificarCadastroExistente() {
    const savedName = localStorage.getItem('na_escuta_username');
    const inputDisplay = document.getElementById('username');
    
    if (savedName) {
        inputDisplay.value = savedName;
        document.getElementById('display-profile-name').innerText = savedName;
        document.getElementById('new-username').value = savedName;
    } else {
        inputDisplay.value = "";
        inputDisplay.placeholder = "Nenhum usuário cadastrado...";
    }
}

function salvarCadastroDefinitivo() {
    const newName = document.getElementById('new-username').value.trim();
    if (newName === "") return alert("Por favor, digita um nome válido para o cadastro!");
    
    localStorage.setItem('na_escuta_username', newName);
    verificarCadastroExistente();
    alternarTela('screen-onboarding');
}

function voltarParaOnboarding() {
    verificarCadastroExistente();
    alternarTela('screen-onboarding');
}

function alternarTela(idDaTelaAtiva) {
    document.querySelectorAll('.screen').forEach(tela => tela.classList.remove('active'));
    document.getElementById(idDaTelaAtiva).classList.add('active');
}

// Inicializa a sessão na escuta
function enterApp() {
    const savedName = localStorage.getItem('na_escuta_username');
    if (!savedName) {
        return alert("Nenhum usuário cadastrado neste dispositivo! Clica em 'Cadastrar / Editar Usuário' primeiro.");
    }
    initUserPresenceAndLoadNetwork(savedName);
    alternarTela('screen-home');
}

/* CONFIGURAÇÃO DE TEMPO DE EXPIRAÇÃO DE MENSAGENS */
function setMessagesDuration(minutes, optionId) {
    msgLifespanMinutes = minutes;
    
    document.querySelectorAll('.time-option').forEach(opt => opt.classList.remove('active'));
    document.querySelectorAll('.time-option').forEach(opt => {
        opt.innerText = opt.innerText.replace('✓ ', '');
    });
    
    const selectedOpt = document.getElementById(`opt-time-${optionId}`);
    if (selectedOpt) {
        selectedOpt.classList.add('active');
        selectedOpt.innerText = '✓ ' + selectedOpt.innerText;
    }
}

/* PRESENÇA E MONITORAMENTO */
function initUserPresenceAndLoadNetwork(username) {
    globalPresenceRef = database.ref(`status_usuarios/${username}`);
    globalPresenceRef.set({ label: "Na escuta", css: "online" });
    globalPresenceRef.onDisconnect().remove();

    database.ref('status_usuarios').on('value', (snapshot) => {
        renderGlobalUsers(snapshot.val() || {}, username);
    });
    listenToMyConversations(username);
}

function changeUserStatusFromScreen(label, cssClass, optionId) {
    const myName = document.getElementById('display-profile-name').innerText;
    document.getElementById('display-profile-status').innerText = `🎧 ${label}`;
    document.getElementById('display-profile-status').className = `status-tag ${cssClass}`;
    
    document.querySelectorAll('.status-option').forEach(opt => opt.classList.remove('active'));
    const selectedOpt = document.getElementById(optionId);
    if (selectedOpt) selectedOpt.classList.add('active');

    database.ref(`status_usuarios/${myName}`).set({ label: label, css: cssClass });
}

function renderGlobalUsers(usersObj, myName) {
    const listContainer = document.getElementById('user-list');
    listContainer.innerHTML = '';
    Object.keys(usersObj).forEach((userKey) => {
        if (userKey === myName) return;
        const statusData = usersObj[userKey];
        const isChecked = selectedUsers.includes(userKey) ? 'checked' : '';
        const item = document.createElement('div');
        item.className = 'user-item';
        item.innerHTML = `
            <input type="checkbox" class="user-select-checkbox" data-user="${userKey}" ${isChecked} onclick="event.stopPropagation(); toggleUserSelection('${userKey}')">
            <div class="user-avatar" style="margin-left: 8px;">👤</div>
            <div style="flex:1; margin-left: 10px;">
                <div class="user-name">${userKey}</div>
                <div class="user-status">● ${statusData.label}</div>
            </div>
            <span class="status-tag ${statusData.css}">${statusData.label}</span>
        `;
        item.onclick = () => toggleUserSelection(userKey);
        listContainer.appendChild(item);
    });
}

function toggleUserSelection(username) {
    const idx = selectedUsers.indexOf(username);
    idx > -1 ? selectedUsers.splice(idx, 1) : selectedUsers.push(username);
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

/* PROCESSOS DE CHAT E CRIPTOGRAFIA */
function startChatWithSelected() {
    if (selectedUsers.length === 0) return alert("Escolha pelo menos 1 usuário disponível!");
    const myName = document.getElementById('display-profile-name').innerText;
    const todosParticipantes = [myName, ...selectedUsers].sort();
    const hashChatId = "SESSAO_" + todosParticipantes.join("_");

    todosParticipantes.forEach((membro) => {
        const parceiros = todosParticipantes.filter(n => n !== membro).join(", ");
        database.ref(`conversas_ativas/${membro}/${hashChatId}`).set({
            listaParceiros: parceiros,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    });

    selectedUsers = [];
    updateMultiChatButtonUI();
    document.querySelectorAll('.user-select-checkbox').forEach(c => c.checked = false);
    loadChatInterface(hashChatId, todosParticipantes.filter(n => n !== myName).join(", "));
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
                <button class="small-btn-end" onclick="event.stopPropagation(); promptEndEscutaSessionDirect('${idDoChat}')">Encerrar</button>
            `;
            listContainer.appendChild(chatItem);

            database.ref(`mensagens_canais/${idDoChat}`).limitToLast(1).on('child_added', (msgSnap) => {
                const txtEl = document.getElementById(`last-txt-${idDoChat}`);
                if (txtEl) {
                    const m = msgSnap.val();
                    if (m.tipo === 'texto') {
                        try {
                            const dec = CryptoJS.AES.decrypt(m.texto, idDoChat).toString(CryptoJS.enc.Utf8);
                            txtEl.innerText = `${m.autor}: ${dec || 'Mensagem Destruída'}`;
                        } catch(e) { txtEl.innerText = `${m.autor}: [Mensagem Protegida]`; }
                    } else {
                        txtEl.innerText = `${m.autor}: [Envio de Mídia]`;
                    }
                }
            });
        });
    });
}

function loadChatInterface(chatId, titleText) {
    currentChatId = chatId;
    zonaMensagens.innerHTML = `<div class="crypto-notice">🔒 Canal criptografado. Mensagens expiram conforme o seletor ativo.</div>`;
    
    // Procura e atualiza o elemento do cabeçalho
    const headerTitle = document.getElementById('chat-contact-name');
    if (headerTitle) headerTitle.innerText = titleText;

    alternarTela('screen-chat');

    if (activeMessagesQuery) activeMessagesQuery.off();
    if (activeTypingQuery) activeTypingQuery.off();

    activeMessagesQuery = database.ref(`mensagens_canais/${chatId}`).limitToLast(40);
    
    activeMessagesQuery.on('child_added', (snapshot) => {
        const msgId = snapshot.key;
        const msg = snapshot.val();
        const myName = document.getElementById('display-profile-name').innerText;
        const direction = (msg.autor === myName) ? 'sent' : 'received';

        if (direction === 'received' && (!msg.vistoPor || !msg.vistoPor[myName])) {
            database.ref(`mensagens_canais/${chatId}/${msgId}/vistoPor/${myName}`).set(true);
        }

        renderMessageBubble(msgId, msg, direction, myName);
    });

    activeMessagesQuery.on('child_changed', (snapshot) => {
        const msgId = snapshot.key;
        const msg = snapshot.val();
        const myName = document.getElementById('display-profile-name').innerText;
        if (msg.autor === myName) updateTickMarkUI(msgId, msg);
    });

    activeTypingQuery = database.ref(`digitando/${chatId}`);
    activeTypingQuery.on('value', (snap) => {
        const dados = snap.val() || {};
        const myName = document.getElementById('display-profile-name').innerText;
        const quemDigita = Object.keys(dados).filter(k => k !== myName && dados[k] === true);
        
        if (quemDigita.length > 0) {
            typingBar.innerText = `✍️ ${quemDigita.join(', ')} está digitando...`;
            typingBar.style.display = "block";
        } else {
            typingBar.style.display = "none";
        }
    });
}

function exitChatView() {
    const myName = document.getElementById('display-profile-name').innerText;
    if (currentChatId) database.ref(`digitando/${currentChatId}/${myName}`).remove();
    if (activeMessagesQuery) activeMessagesQuery.off();
    if (activeTypingQuery) activeTypingQuery.off();
    currentChatId = null;
    alternarTela('screen-home');
}

function enviarMensagem() {
    if (!currentChatId) return;
    const myName = document.getElementById('display-profile-name').innerText;
    const textoRaw = textoMensagemInput.value.trim();
    if (textoRaw === "") return;

    const textoCriptografado = CryptoJS.AES.encrypt(textoRaw, currentChatId).toString();
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const vistoPorInicial = {}; vistoPorInicial[myName] = true;

    const novaMensagemRef = database.ref(`mensagens_canais/${currentChatId}`).push();
    novaMensagemRef.set({
        autor: myName,
        texto: textoCriptografado,
        tipo: 'texto',
        hora: hora,
        vistoPor: vistoPorInicial
    });

    setTimeout(() => { novaMensagemRef.remove(); }, msgLifespanMinutes * 60 * 1000);

    textoMensagemInput.value = "";
    database.ref(`digitando/${currentChatId}/${myName}`).remove();
    btnEnviar.style.display = "none";
    btnAudio.style.display = "flex";
}

function handleTypingEvent() {
    if (!currentChatId) return;
    const myName = document.getElementById('display-profile-name').innerText;
    database.ref(`digitando/${currentChatId}/${myName}`).set(true);

    clearTimeout(typingTimeoutToken);
    typingTimeoutToken = setTimeout(() => {
        if (currentChatId) database.ref(`digitando/${currentChatId}/${myName}`).remove();
    }, 2000);
}

function triggerPhotoUpload() { document.getElementById('hidden-file-input').click(); }

function enviarFoto(input) {
    if (!currentChatId || !input.files || !input.files[0]) return;
    const myName = document.getElementById('display-profile-name').innerText;
    const reader = new FileReader();

    reader.onload = function(e) {
        const base64Image = e.target.result;
        const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const vistoPorInicial = {}; vistoPorInicial[myName] = true;

        const novaMidiaRef = database.ref(`mensagens_canais/${currentChatId}`).push();
        novaMidiaRef.set({
            autor: myName,
            tipo: 'foto',
            midia: base64Image,
            hora: hora,
            vistoPor: vistoPorInicial
        });

        setTimeout(() => { novaMidiaRef.remove(); }, msgLifespanMinutes * 60 * 1000);
    };
    reader.readAsDataURL(input.files[0]);
    input.value = "";
}

function toggleAudioRecording() {
    if (!isRecording) {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            audioSeconds = 0;
            audioTimerBadge.innerText = "00:00";
            audioTimerBadge.style.display = "block";
            textoMensagemInput.style.paddingRight = "60px";
            textoMensagemInput.placeholder = "Gravando áudio seguro...";
            textoMensagemInput.disabled = true;

            audioTimerInterval = setInterval(() => {
                audioSeconds++;
                const mins = String(Math.floor(audioSeconds / 60)).padStart(2, '0');
                const secs = String(audioSeconds % 60).padStart(2, '0');
                audioTimerBadge.innerText = `${mins}:${secs}`;
            }, 1000);
            
            mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
            mediaRecorder.onstop = () => {
                clearInterval(audioTimerInterval);
                audioTimerBadge.style.display = "none";
                textoMensagemInput.disabled = false;
                textoMensagemInput.placeholder = "Digita uma mensagem secreta...";
                textoMensagemInput.style.paddingRight = "18px";

                const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
                const reader = new FileReader();
                reader.onloadend = function() {
                    const myName = document.getElementById('display-profile-name').innerText;
                    const base64Audio = reader.result;
                    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                    const vistoPorInicial = {}; vistoPorInicial[myName] = true;

                    const novaMidiaRef = database.ref(`mensagens_canais/${currentChatId}`).push();
                    novaMidiaRef.set({
                        autor: myName,
                        tipo: 'audio',
                        midia: base64Audio,
                        hora: hora,
                        vistoPor: vistoPorInicial
                    });

                    setTimeout(() => { novaMidiaRef.remove(); }, msgLifespanMinutes * 60 * 1000);
                };
                reader.readAsDataURL(audioBlob);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            isRecording = true;
            btnAudio.innerText = "🛑";
            btnAudio.style.background = "var(--danger)";
            btnPhoto.style.opacity = "0.3"; btnPhoto.disabled = true;
        }).catch(() => alert("Permissão de microfone negada."));
    } else {
        mediaRecorder.stop();
        isRecording = false;
        btnAudio.innerText = "🎙️";
        btnAudio.style.background = "var(--bg-secondary)";
        btnPhoto.style.opacity = "1"; btnPhoto.disabled = false;
    }
}

function renderMessageBubble(msgId, msg, direction, myName) {
    if (document.getElementById(`msg-${msgId}`)) return;

    const bubble = document.createElement('div');
    bubble.className = `message ${direction}`;
    bubble.id = `msg-${msgId}`;

    const metadata = direction === 'received' ? `<span class="msg-meta">${msg.autor}</span>` : '';
    
    let conteudoMidia = '';
    if (msg.tipo === 'foto') {
        conteudoMidia = `<img src="${msg.midia}" class="chat-img-render" onclick="openFullImage('${msg.midia}')" /><small class="efemero-alert">⏱️ Expiração ativa</small>`;
    } else if (msg.tipo === 'audio') {
        conteudoMidia = `<audio controls src="${msg.midia}" class="chat-audio-render"></audio><small class="efemero-alert">⏱️ Expiração ativa</small>`;
    } else {
        let textoDecodificado = "Mensagem Corrompida";
        try {
            textoDecodificado = CryptoJS.AES.decrypt(msg.texto, currentChatId).toString(CryptoJS.enc.Utf8);
        } catch(e) { textoDecodificado = "[Erro de descriptografia]"; }
        conteudoMidia = `<p class="msg-texto">${textoDecodificado}</p>`;
    }

    bubble.innerHTML = `
        ${metadata}
        ${conteudoMidia}
        <span class="message-time">
            ${msg.hora} ${direction === 'sent' ? `<span id="tick-container-${msgId}">...</span>` : ''}
        </span>
    `;

    zonaMensagens.appendChild(bubble);
    zonaMensagens.scrollTop = zonaMensagens.scrollHeight;

    if (direction === 'sent') updateTickMarkUI(msgId, msg);

    database.ref(`mensagens_canais/${currentChatId}/${msgId}`).on('value', (snapshot) => {
        if (!snapshot.exists()) {
            const el = document.getElementById(`msg-${msgId}`);
            if (el) {
                el.style.opacity = "0.3";
                el.innerHTML = `<span style="font-size:0.8rem; font-style:italic;">🔥 Conteúdo expirado e destruído</span>`;
                setTimeout(() => el.remove(), 2000);
            }
        }
    });
}

function updateTickMarkUI(msgId, msg) {
    const el = document.getElementById('tick-container-' + msgId);
    if (!el || !currentChatId) return;

    const integrantesChat = currentChatId.replace("SESSAO_", "").split("_");
    const totalEsperado = integrantesChat.length;
    const totalVisualizacoes = msg.vistoPor ? Object.keys(msg.vistoPor).length : 1;

    if (totalVisualizacoes >= totalEsperado) {
        el.innerText = "✔️✔️"; el.style.color = "var(--accent)";
    } else {
        el.innerText = "✔️"; el.style.color = "rgba(255, 255, 255, 0.4)";
    }
}

let pendingDeletionChatId = null;

function promptEndEscutaSession() {
    if (!currentChatId) return;
    pendingDeletionChatId = currentChatId;
    document.getElementById('confirm-modal').classList.add('active');
}

function promptEndEscutaSessionDirect(chatId) {
    pendingDeletionChatId = chatId;
    document.getElementById('confirm-modal').classList.add('active');
}

function closeConfirmModal() {
    document.getElementById('confirm-modal').classList.remove('active');
    pendingDeletionChatId = null;
}

function executeForcedSessionDeletion() {
    if (!pendingDeletionChatId) return;
    const targetId = pendingDeletionChatId;
    closeConfirmModal();
    
    const myName = document.getElementById('display-profile-name').innerText;
    database.ref(`conversas_ativas/${myName}/${targetId}`).remove();
    
    const integrantes = targetId.replace("SESSAO_", "").split("_");
    
    database.ref(`conversas_ativas`).once('value', (snap) => {
        const tudo = snap.val() || {};
        let limparMensagensSeguras = true;
        integrantes.forEach((p) => {
            if (tudo[p] && tudo[p][targetId]) limparMensagensSeguras = false;
        });

        if (limparMensagensSeguras) {
            database.ref(`mensagens_canais/${targetId}`).remove();
            database.ref(`digitando/${targetId}`).remove();
        }
    });

    const el = document.getElementById(`chat-item-${targetId}`);
    if (el) el.remove();
    if (currentChatId === targetId) exitChatView();
}

function openFullImage(src) {
    const w = window.open();
    w.document.write(`<body style="margin:0; background:#0b111e; display:flex; align-items:center; justify-content:center;"><img src="${src}" style="max-width:100%; max-height:100vh; user-select:none;"></body>`);
}

/* SISTEMA REFORÇADO ANTI-PRINT E CAPTURA DE TELA */
function applyAntiScreenshotProtection() {
    window.addEventListener('blur', () => { 
        document.body.style.filter = 'blur(30px) grayscale(100%)'; 
    });
    window.addEventListener('focus', () => { 
        document.body.style.filter = 'none'; 
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'PrintScreen' || e.keyCode === 44) {
            e.preventDefault();
            aplicarBlackoutTemporario();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
            e.preventDefault();
            alert("Ação não permitida por políticas de segurança.");
        }
        if (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === '5')) {
            e.preventDefault();
            aplicarBlackoutTemporario();
        }
    });
}

function aplicarBlackoutTemporario() {
    document.body.style.display = 'none';
    setTimeout(() => {
        document.body.style.display = 'block';
    }, 1000);
}

function openAboutModal() { document.getElementById('about-modal').classList.add('active'); }
function closeAboutModal() { document.getElementById('about-modal').classList.remove('active'); }

// Função para apenas fechar/sair do app de forma segura sem apagar os dados locais
function sairApp() {
    if (globalPresenceRef) globalPresenceRef.remove();
    alternarTela('screen-onboarding');
}

// Função para levar o usuário para a tela de edição de codinome preenchendo o input anterior
function configAlterarUsuario() {
    const nomeAtual = document.getElementById('display-profile-name').innerText;
    const inputCadastro = document.getElementById('new-username');
    
    if (inputCadastro && nomeAtual && nomeAtual !== "Nome do Usuário") {
        inputCadastro.value = nomeAtual;
    }
    
    alternarTela('screen-cadastro');
}

// ==========================================================================
// NOVAS FUNÇÕES DE FECHAMENTO COMPATÍVEIS COM O PROJETO (ACODE / PYDROID 3)
// ==========================================================================

// Função para encerrar o aplicativo por completo limpando sessões ativas
function encerrarDefinitivoApp() {
    // 1. Remove a presença do banco de dados imediatamente antes de sair
    if (globalPresenceRef) {
        globalPresenceRef.remove();
    }
    
    // 2. Limpa dados de sessão voláteis
    sessionStorage.clear();

    // 3. Executa o fechamento forçado baseado na plataforma de execução (Pydroid/WebView/Cordova)
    if (navigator.app && navigator.app.exitApp) {
        navigator.app.exitApp();
    } else if (navigator.device && navigator.device.exitApp) {
        navigator.device.exitApp();
    } else {
        // Fallback: Se rodando direto em navegador desktop/mobile de testes
        window.location.reload();
    }
            }
