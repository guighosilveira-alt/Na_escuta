// CONFIGURAÇÕES REAIS DO FIREBASE
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
let selectedUsers = []; 

let globalPresenceRef = null;
let activeMessagesQuery = null;

// Controle de Gravação de Áudio Móvel/Web
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

const zonaMensagens = document.getElementById('zona-mensagens');
const textoMensagemInput = document.getElementById('texto-mensagem');
const btnEnviar = document.getElementById('btn-enviar');
const btnAudio = document.getElementById('btn-audio');

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
        
        // Alternância visual fluida entre o ícone de enviar e o microfone
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
   SISTEMA DE DISPONIBILIDADE E PRESENÇA DIRETA (REATIVIDADE EM TEMPO REAL)
   ========================================================================== */
function initUserPresenceAndLoadNetwork(username) {
    globalPresenceRef = database.ref(`status_usuarios/${username}`);
    
    // Insere o registro e agenda a destruição atômica para quando o app fechar
    globalPresenceRef.set({ label: "Na escuta", css: "online" });
    globalPresenceRef.onDisconnect().remove();

    // Monitora instantaneamente qualquer alteração de entradas/saídas
    database.ref('status_usuarios').on('value', (snapshot) => {
        renderGlobalUsers(snapshot.val() || {}, username);
    });

    listenToMyConversations(username);
}

function changeUserStatus(label, cssClass) {
    const myName = document.getElementById('display-profile-name').innerText;
    document.getElementById('display-profile-status').innerText = `🎧 ${label}`;
    document.getElementById('display-profile-status').className = `status-tag ${cssClass}`;
    
    database.ref(`status_usuarios/${myName}`).set({ label: label, css: cssClass });
    toggleSettingsMenu();
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
        item.id = `user-row-${userKey}`;
        
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
    const todosParticipantes = [myName, ...selectedUsers].sort();
    const hashChatId = "SESSAO_" + todosParticipantes.join("_");

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

            database.ref(`mensagens_canais/${idDoChat}`).limitToLast(1).on('child_added', (msgSnap) => {
                const txtEl = document.getElementById(`last-txt-${idDoChat}`);
                if (txtEl) {
                    const m = msgSnap.val();
                    txtEl.innerText = m.tipo === 'texto' ? `${m.autor}: ${m.texto}` : `${m.autor}: [Envio de Mídia]`;
                }
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

        if (direction === 'received' && (!msg.vistoPor || !msg.vistoPor[myName])) {
            database.ref(`mensagens_canais/${chatId}/${msgId}/vistoPor/${myName}`).set(true);
        }

        renderMessageBubble(msgId, msg, direction, myName);
    });

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
   MENSAGENS TEXTO, CAPTURA DE FOTO E GRAVAÇÃO DE ÁUDIO INLINE
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
            tipo: 'texto',
            hora: horaFormatada,
            vistoPor: vistoPorInicial
        });

        textoMensagemInput.value = "";
        btnEnviar.style.display = "none";
        btnAudio.style.display = "flex";
    }
}

function triggerPhotoUpload() {
    document.getElementById('hidden-file-input').click();
}

function enviarFoto(input) {
    if (!currentChatId || !input.files || !input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = function(e) {
        const base64Image = e.target.result;
        const myName = document.getElementById('display-profile-name').innerText;
        const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        const vistoPorInicial = {};
        vistoPorInicial[myName] = true;

        database.ref(`mensagens_canais/${currentChatId}`).push({
            autor: myName,
            tipo: 'foto',
            midia: base64Image,
            hora: hora,
            vistoPor: vistoPorInicial
        });
    };
    reader.readAsDataURL(file);
}

function toggleAudioRecording() {
    if (!isRecording) {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
                const reader = new FileReader();
                reader.onloadend = function() {
                    const base64Audio = reader.result;
                    const myName = document.getElementById('display-profile-name').innerText;
                    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                    const vistoPorInicial = {};
                    vistoPorInicial[myName] = true;

                    database.ref(`mensagens_canais/${currentChatId}`).push({
                        autor: myName,
                        tipo: 'audio',
                        midia: base64Audio,
                        hora: hora,
                        vistoPor: vistoPorInicial
                    });
                };
                reader.readAsDataURL(audioBlob);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            isRecording = true;
            btnAudio.innerText = "🛑";
            btnAudio.style.background = "var(--danger)";
        }).catch(() => alert("Permissão de microfone negada."));
    } else {
        mediaRecorder.stop();
        isRecording = false;
        btnAudio.innerText = "🎙️";
        btnAudio.style.background = "var(--bg-secondary)";
    }
}

function renderMessageBubble(msgId, msg, direction, myName) {
    if (document.getElementById(`msg-${msgId}`)) return;

    const bubble = document.createElement('div');
    bubble.className = `message ${direction}`;
    bubble.id = `msg-${msgId}`;

    const metadata = direction === 'received' ? `<span class="msg-meta">${msg.autor}</span>` : '';
    
    let conteudoMídia = '';
    if (msg.tipo === 'foto') {
        conteudoMídia = `<img src="${msg.midia}" class="chat-img-render" onclick="openFullImage('${msg.midia}')" />`;
    } else if (msg.tipo === 'audio') {
        conteudoMídia = `<audio controls src="${msg.midia}" class="chat-audio-render"></audio>`;
    } else {
        conteudoMídia = `<p class="msg-texto">${msg.texto}</p>`;
    }

    bubble.innerHTML = `
        ${metadata}
        ${conteudoMídia}
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

function openFullImage(src) {
    const w = window.open();
    w.document.write(`<body style="margin:0; background:#0b111e; display:flex; align-items:center; justify-content:center;"><img src="${src}" style="max-width:100%; max-height:100vh; border-radius:8px;"></body>`);
}

function endEscutaSession() {
    if (!currentChatId) return;
    deleteConversationNode(currentChatId);
    exitChatView();
}

function deleteConversationNode(chatId) {
    const myName = document.getElementById('display-profile-name').innerText;
    database.ref(`conversas_ativas/${myName}/${chatId}`).remove();
    
    const integrantes = chatId.replace("SESSAO_", "").split("_");
    
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

function applyAntiScreenshotProtection() {
    window.addEventListener('blur', () => {
        document.body.style.filter = 'blur(20px) grayscale(100%)';
    });
    window.addEventListener('focus', () => {
        document.body.style.filter = 'none';
    });
}

function openAboutModal() { document.getElementById('about-modal').classList.add('active'); }
function closeAboutModal() { document.getElementById('about-modal').classList.remove('active'); }
function toggleSettingsMenu() { document.getElementById('settings-menu').classList.toggle('show'); }
function logoutApp() { 
    if (globalPresenceRef) globalPresenceRef.remove();
    localStorage.clear(); 
    location.reload(); 
            }
        
