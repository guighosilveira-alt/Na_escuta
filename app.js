let currentActiveRoom = null;
let activeConversations = {};

// Instancia a ponte de comunicação entre abas simulando o servidor
const networkBridge = new BroadcastChannel('na_escuta_network_bridge');

networkBridge.onmessage = function(event) {
    const packet = event.data;
    const myName = document.getElementById('display-profile-name').innerText;
    
    // Alguém na rede avisou que entrou numa sala ou te chamou
    if (packet.type === 'ROOM_JOINED' && currentActiveRoom === packet.roomCode && packet.senderName !== myName) {
        addNewContactToList(packet.senderName, packet.roomCode);
        
        // Devolve o sinal confirmando que tu também estás lá dentro
        networkBridge.postMessage({
            type: 'ROOM_SYNC',
            roomCode: packet.roomCode,
            senderName: myName
        });
    }

    if (packet.type === 'ROOM_SYNC' && currentActiveRoom === packet.roomCode && packet.senderName !== myName) {
        addNewContactToList(packet.senderName, packet.roomCode);
    }

    // Mensagens em Tempo Real
    if (packet.type === 'TEXT_MESSAGE' && currentActiveRoom === packet.roomCode) {
        receiveTextMessage(packet.text, packet.senderName, packet.roomCode);
    }

    if (packet.type === 'AUDIO_MESSAGE' && currentActiveRoom === packet.roomCode) {
        receiveAudioMessage(packet.senderName, packet.roomCode);
    }

    // Alguém clicou em sair do outro lado
    if (packet.type === 'ROOM_LEFT' && currentActiveRoom === packet.roomCode) {
        appendSystemNotice(`O utilizador remoto desconectou-se desta sala.`);
    }
};

/* ==========================================================================
   SISTEMA DE ISOLAMENTO DE TELAS (Otimizado para Mobile e Desktop)
   ========================================================================== */
function alternarTela(idDaTelaAtiva) {
    // Esconde absolutamente todas as telas primeiro, limpando resíduos visuais
    document.querySelectorAll('.screen').forEach(tela => {
        tela.classList.remove('active');
    });
    // Ativa apenas a tela desejada de forma limpa
    document.getElementById(idDaTelaAtiva).classList.add('active');
}

// ==========================================
// LOGICA DE SESSÃO E LOGIN
// ==========================================
window.onload = function() {
    const savedName = localStorage.getItem('na_escuta_username');
    if (savedName) {
        document.getElementById('display-profile-name').innerText = savedName;
        alternarTela('screen-home'); // Transição limpa para a Home
    }
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
    alternarTela('screen-home'); // Transição limpa para a Home após login
}

// ==========================================
// FLUXO DE ENTRAR AUTOMATICAMENTE / GERAR
// ==========================================
function openConnectModal() {
    document.getElementById('connect-modal').classList.add('active');
    document.getElementById('input-room-code').value = "";
}

function closeConnectModal() {
    document.getElementById('connect-modal').classList.remove('active');
}

// CASO 1: Clica em Gerar Código -> Entra Direto
function generateAndJoinRoom() {
    const randId = Math.floor(1000 + Math.random() * 9000);
    const code = `NE-${randId}`;
    
    closeConnectModal();
    navigateToRoom(code, `Sala ${code}`);
}

// CASO 2: Cola um código existente -> Entra Direto
function joinWithExistingCode() {
    const code = document.getElementById('input-room-code').value.trim().toUpperCase();
    if (code === "") {
        alert("Por favor, introduz um código válido!");
        return;
    }

    closeConnectModal();
    navigateToRoom(code, `Sala ${code}`);
}

// Executa a transição imediata para a sala ativa e sinaliza no "Socket"
function navigateToRoom(roomCode, titleName) {
    currentActiveRoom = roomCode;
    const myName = document.getElementById('display-profile-name').innerText;

    // Atualiza cabeçalho do chat
    document.getElementById('chat-contact-name').innerText = titleName;
    document.getElementById('chat-room-id-tag').innerText = roomCode;

    // Limpa tela de mensagens anteriores
    document.getElementById('chat-messages-container').innerHTML = `
        <div class="crypto-notice">
            🔒 Esta conversa está configurada para se autodestruir a cada <span id="current-timer-label">24 horas</span>.
        </div>
    `;

    // Inicializa estrutura de memória caso não exista
    if (!activeConversations[roomCode]) {
        activeConversations[roomCode] = { name: titleName, messages: [] };
    }

    // Troca de tela isolando o ambiente do Chat de forma segura
    alternarTela('screen-chat');

    // Avisa a rede distribuída que tu entraste nesta sala agora!
    networkBridge.postMessage({
        type: 'ROOM_JOINED',
        roomCode: roomCode,
        senderName: myName
    });
}

// ==========================================
// FLUXO DE DESCONECTAR E SAIR AUTOMATICAMENTE
// ==========================================
function disconnectAndLeaveRoom() {
    if (!currentActiveRoom) return;

    const myName = document.getElementById('display-profile-name').innerText;

    // 1. Envia aviso de desconexão para o outro dispositivo
    networkBridge.postMessage({
        type: 'ROOM_LEFT',
        roomCode: currentActiveRoom,
        senderName: myName
    });

    // 2. Remove o item visual correspondente da lista da Home
    const visualItem = document.getElementById(`chat-item-${currentActiveRoom}`);
    if (visualItem) visualItem.remove();

    // 3. Limpa a memória local desta sala
    delete activeConversations[currentActiveRoom];

    // 4. Se a lista ficou vazia, reinsere o estado vazio padrão
    const listContainer = document.getElementById('main-chat-list');
    if (listContainer.children.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-chat-state" id="empty-state">
                <span class="empty-icon">💬</span>
                <p>Nenhuma conversa ativa por aqui.</p>
                <p class="empty-subtext">Clica em "+ Conectar" para iniciar uma sessão de chat segura.</p>
            </div>
        `;
    }

    // 5. Retorna para a Home limpando a tela de chat
    currentActiveRoom = null;
    alternarTela('screen-home');
}

// ==========================================
// MENSAGENS, ÁUDIO E AUXILIARES
// ==========================================
function addNewContactToList(remoteName, roomCode) {
    const emptyState = document.getElementById('empty-state');
    if (emptyState) emptyState.remove();

    const listContainer = document.getElementById('main-chat-list');
    if (document.getElementById(`chat-item-${roomCode}`)) return; // evita duplicar

    // Altera dinamicamente o título do chat aberto para o nome real do utilizador que conectou
    if (currentActiveRoom === roomCode) {
        document.getElementById('chat-contact-name').innerText = remoteName;
    }

    const chatItem = document.createElement('div');
    chatItem.className = 'chat-item';
    chatItem.id = `chat-item-${roomCode}`;
    chatItem.onclick = function() { navigateToRoom(roomCode, remoteName); };
    
    chatItem.innerHTML = `
        <div class="avatar">👤</div>
        <div class="chat-info">
            <div class="chat-header">
                <h3>${remoteName}</h3>
                <span class="chat-time">Agora</span>
            </div>
            <p class="chat-last-message" id="last-msg-${roomCode}">🟢 Sincronizado na sala ${roomCode}</p>
        </div>
    `;
    listContainer.appendChild(chatItem);
}

function sendTextMessageAction(text) {
    if (!currentActiveRoom) return;
    const myName = document.getElementById('display-profile-name').innerText;
    const timeNow = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    activeConversations[currentActiveRoom].messages.push({ text: text, type: 'sent', sender: myName, time: timeNow });
    appendMessageBubble(text, 'sent', myName, timeNow);
    
    if(document.getElementById(`last-msg-${currentActiveRoom}`)) {
        document.getElementById(`last-msg-${currentActiveRoom}`).innerText = text;
    }

    networkBridge.postMessage({ type: 'TEXT_MESSAGE', roomCode: currentActiveRoom, senderName: myName, text: text });
}

function receiveTextMessage(text, senderName, roomCode) {
    const timeNow = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (activeConversations[roomCode]) {
        activeConversations[roomCode].messages.push({ text: text, type: 'received', sender: senderName, time: timeNow });
    }
    if (currentActiveRoom === roomCode) {
        appendMessageBubble(text, 'received', senderName, timeNow);
    }
    if (document.getElementById(`last-msg-${roomCode}`)) {
        document.getElementById(`last-msg-${roomCode}`).innerText = `${senderName}: ${text}`;
    }
}

// Gravação de Áudio simplificada integrada à rede
const audioBtn = document.getElementById('btn-audio');
if (audioBtn) {
    audioBtn.addEventListener('mousedown', () => { audioBtn.classList.add('recording'); audioBtn.innerText = "🛑"; });
    audioBtn.addEventListener('mouseup', () => {
        if (audioBtn.classList.contains('recording')) {
            audioBtn.classList.remove('recording'); audioBtn.innerText = "🎙️";
            if (!currentActiveRoom) return;
            const myName = document.getElementById('display-profile-name').innerText;
            const timeNow = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            
            appendMessageBubble("🔊 Áudio enviado (0:05)", 'sent', myName, timeNow);
            networkBridge.postMessage({ type: 'AUDIO_MESSAGE', roomCode: currentActiveRoom, senderName: myName });
        }
    });
}

function receiveAudioMessage(senderName, roomCode) {
    const timeNow = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (currentActiveRoom === roomCode) {
        appendMessageBubble("🔊 Áudio recebido (0:05)", 'received', senderName, timeNow);
    }
}

function appendMessageBubble(text, direction, sender, time) {
    const container = document.getElementById('chat-messages-container');
    const bubble = document.createElement('div');
    bubble.className = `message ${direction}`;
    bubble.innerHTML = `<p>${text}</p><span class="message-time">${time}</span>`;
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
}

function appendSystemNotice(text) {
    const container = document.getElementById('chat-messages-container');
    const notice = document.createElement('div');
    notice.className = 'crypto-notice';
    notice.style.background = 'rgba(230, 57, 70, 0.15)';
    notice.style.color = 'var(--danger)';
    notice.innerText = text;
    container.appendChild(notice);
}

function openAboutModal() { document.getElementById('about-modal').classList.add('active'); }
function closeAboutModal() { document.getElementById('about-modal').classList.remove('active'); }
function toggleSettingsMenu() { document.getElementById('settings-menu').classList.toggle('show'); }
function toggleTimerMenu() { document.getElementById('timer-menu').classList.toggle('show'); }
function changeUserStatus(t, c) { applyStatusInterface(t, c); toggleSettingsMenu(); }
function applyStatusInterface(t, c) {
    const tag = document.getElementById('display-profile-status');
    tag.innerText = t; tag.className = `status-tag ${c}`;
}
function logoutApp() { localStorage.clear(); location.reload(); }
