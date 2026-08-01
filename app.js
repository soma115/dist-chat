const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const state = {
  myId: '',
  myName: '',
  peers: {},
  friends: new Set(),
  known: {},
  messages: [],
  polls: {},
  seen: new Set(),
  sdpPending: null
};

const $ = (id) => document.getElementById(id);

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function init() {
  const saved = localStorage.getItem('dist-chat-identity');
  if (saved) {
    const data = JSON.parse(saved);
    state.myId = data.id;
    state.myName = data.name;
    loadState();
    showApp();
  } else {
    showSetup();
  }
  setupTabs();
  setupListeners();
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
}

function showSetup() {
  const setup = $('#setup');
  const app = $('#app');
  if (!setup || !app) { console.error('Brak elementu #setup lub #app'); return; }
  setup.style.display = 'flex';
  app.style.display = 'none';
}

function showApp() {
  const setup = $('#setup');
  const app = $('#app');
  if (!setup || !app) { console.error('Brak elementu #setup lub #app'); return; }
  setup.style.display = 'none';
  app.style.display = 'flex';
  $('#my-meta').textContent = `${state.myName} · ${state.myId.substr(0, 8)}`;
  $('#my-uuid').textContent = state.myId;
}

function copyUuid() {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(state.myId).then(() => alert('UUID skopiowany do schowka'));
  } else {
    const el = $('friend-uuid');
    el.value = state.myId;
    el.select();
    alert('Zaznaczono UUID; skopiuj ręcznie');
  }
}

function isUuid(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function acceptFriendUuid(target) {
  state.friends.add(target);
  state.known[target] = state.known[target] || { name: '', friends: new Set() };
  state.known[target].friend = true;
  state.known[target].request = false;
  state.known[target].sentRequest = false;
  saveState();
  broadcast({ type: 'friend-accept', from: state.myId, to: target, mid: uuid() }, state.myId);
  broadcast({ type: 'friend-list', from: state.myId, friends: [...state.friends], mid: uuid() });
  render();
}

function addFriendByUuid() {
  const target = $('friend-uuid').value.trim();
  if (!target) return;
  if (!isUuid(target)) { alert('Podany tekst nie wygląda na UUID'); return; }
  state.known[target] = state.known[target] || { name: '', friends: new Set() };
  state.known[target].sentRequest = true;
  broadcast({ type: 'friend-request', from: state.myId, to: target, mid: uuid() }, state.myId);
  if (state.known[target].request) acceptFriendUuid(target);
  $('friend-uuid').value = '';
  saveState();
  render();
}

function showQr() {
  const display = $('qr-display');
  const text = $('sdp-out').value.trim();
  if (!text) return;
  display.innerHTML = '';
  display.classList.remove('hidden');
  try {
    new QRCode(display, { text, width: 240, height: 240, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.H });
  } catch (e) { console.error(e); }
}

let qrStream = null;
let qrScanning = false;

async function startQrScan() {
  $('qr-overlay').classList.remove('hidden');
  qrScanning = true;
  try {
    qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const video = $('qr-video');
    video.srcObject = qrStream;
    await video.play();
    scanLoop();
  } catch (e) {
    alert('Nie udało się uruchomić kamery: ' + e.message);
    stopQrScan();
  }
}

function stopQrScan() {
  qrScanning = false;
  if (qrStream) { qrStream.getTracks().forEach(t => t.stop()); qrStream = null; }
  $('qr-overlay').classList.add('hidden');
}

function scanLoop() {
  if (!qrScanning) return;
  const video = $('qr-video');
  const canvas = $('qr-canvas');
  if (!video.videoWidth || !video.videoHeight) { requestAnimationFrame(scanLoop); return; }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(img.data, canvas.width, canvas.height);
  if (code && code.data) { onQrFound(code.data); }
  else { requestAnimationFrame(scanLoop); }
}

function onQrFound(data) {
  if (isUuid(data)) {
    $('friend-uuid').value = data;
    alert('Wykryto UUID. Kliknij "Wyślij prośbę o znajomość", aby potwierdzić.');
  } else {
    $('sdp-in').value = data;
    alert('Wykryto kod SDP. Wklejono w odpowiednie pole.');
  }
  stopQrScan();
}

function saveIdentity() {
  localStorage.setItem('dist-chat-identity', JSON.stringify({ id: state.myId, name: state.myName }));
}

function saveState() {
  const known = {};
  for (const [k, v] of Object.entries(state.known)) {
    known[k] = { name: v.name, friends: [...v.friends], direct: v.direct };
  }
  const payload = {
    friends: [...state.friends],
    known,
    messages: state.messages,
    polls: state.polls,
    seen: [...state.seen]
  };
  localStorage.setItem('dist-chat-state', JSON.stringify(payload));
}

function loadState() {
  const raw = localStorage.getItem('dist-chat-state');
  if (!raw) return;
  const data = JSON.parse(raw);
  state.friends = new Set(data.friends || []);
  state.known = {};
  for (const [k, v] of Object.entries(data.known || {})) {
    state.known[k] = { name: v.name, friends: new Set(v.friends || []), direct: v.direct };
  }
  state.messages = data.messages || [];
  state.polls = data.polls || {};
  state.seen = new Set(data.seen || []);
  data.messages.forEach(m => { if (m.mid) state.seen.add(m.mid); });
  Object.values(data.polls || {}).forEach(p => { if (p.mid) state.seen.add(p.mid); });
}

function waitIce(pc) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') { resolve(); return; }
    const check = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', check);
  });
}

function createPeer(isOfferer) {
  const pc = new RTCPeerConnection(ICE);
  const cid = 'pending-' + uuid();
  pc._cid = cid;
  let dc = null;
  if (isOfferer) {
    dc = pc.createDataChannel('chat', { ordered: true });
    dc._pc = pc;
    setupChannel(dc, cid);
  }
  pc.ondatachannel = (e) => {
    const ch = e.channel;
    ch._pc = e.target;
    setupChannel(ch, cid);
  };
  pc.onconnectionstatechange = () => {
    if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
      cleanupPeer(pc._peerId || pc._cid);
    }
  };
  state.peers[cid] = { pc, dc, name: 'łączenie...', isFriend: false };
  return { pc, dc, cid };
}

function setupChannel(dc, cid) {
  dc._cid = cid;
  dc.onopen = () => {
    sendRaw(dc, { type: 'hello', id: state.myId, name: state.myName, friends: [...state.friends] });
  };
  dc.onmessage = (e) => {
    try { handleMessage(JSON.parse(e.data), e.target); } catch (err) { console.error(err); }
  };
  dc.onclose = () => { if (dc._pc) cleanupPeer(dc._pc._peerId || dc._pc._cid); };
}

function sendRaw(dc, obj) {
  if (dc.readyState === 'open') dc.send(JSON.stringify(obj));
}

async function createOffer() {
  const { pc, dc, cid } = createPeer(true);
  state.sdpPending = { pc, dc, cid, mode: 'offer' };
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitIce(pc);
  $('qr-display').innerHTML = '';
  $('qr-display').classList.add('hidden');
  $('#sdp-out').value = JSON.stringify(pc.localDescription);
  $('#sdp-in').value = '';
  $('#sdp-in').placeholder = 'Wklej SDP-answer od drugiej osoby';
  $('#sdp-next-btn').textContent = 'Sfinalizuj połączenie';
  $('#sdp-area').classList.remove('hidden');
}

async function acceptOffer() {
  const offer = JSON.parse($('#sdp-in').value);
  const { pc, cid } = createPeer(false);
  state.sdpPending = { pc, cid, mode: 'answer' };
  await pc.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitIce(pc);
  $('#sdp-out').value = JSON.stringify(pc.localDescription);
  $('#sdp-next-btn').textContent = 'Zamknij';
}

async function acceptAnswer() {
  const answer = JSON.parse($('#sdp-in').value);
  if (!state.sdpPending || !state.sdpPending.pc) return;
  await state.sdpPending.pc.setRemoteDescription(answer);
  $('#sdp-area').classList.add('hidden');
  state.sdpPending = null;
}

function cleanupPeer(key) {
  const p = state.peers[key];
  if (p) { try { p.pc.close(); } catch (e) {} delete state.peers[key]; }
  if (state.known[key]) state.known[key].direct = false;
  render();
}

function handleMessage(msg, dc) {
  if (msg.type === 'hello') {
    const cid = dc._cid;
    const p = state.peers[cid];
    if (!p) return;
    p.name = msg.name;
    p.isFriend = state.friends.has(msg.id);
    dc._peerId = msg.id;
    p.pc._peerId = msg.id;
    delete state.peers[cid];
    state.peers[msg.id] = p;
    state.known[msg.id] = { name: msg.name, friends: new Set(msg.friends || []), direct: true };
    render();
    return;
  }
  const from = dc._peerId;
  if (!from) return;
  if (msg.mid && state.seen.has(msg.mid)) return;
  if (msg.mid) state.seen.add(msg.mid);
  if (msg.to && msg.to !== state.myId) {
    forward(msg, from);
    return;
  }
  processMessage(msg);
  if (['chat', 'poll', 'vote', 'friend-list'].includes(msg.type)) forward(msg, from);
}

function processMessage(msg) {
  if (msg.type === 'friend-request') {
    state.known[msg.from] = state.known[msg.from] || { name: '', friends: new Set() };
    state.known[msg.from].request = true;
    if (state.known[msg.from].sentRequest) {
      acceptFriendUuid(msg.from);
    } else {
      render();
    }
  } else if (msg.type === 'friend-accept') {
    if (msg.to === state.myId) {
      state.friends.add(msg.from);
      state.known[msg.from] = state.known[msg.from] || { name: '', friends: new Set() };
      state.known[msg.from].friend = true;
      state.known[msg.from].request = false;
      state.known[msg.from].sentRequest = false;
      saveState();
      broadcast({ type: 'friend-list', from: state.myId, friends: [...state.friends], mid: uuid() });
      render();
    }
  } else if (msg.type === 'friend-list') {
    state.known[msg.from] = state.known[msg.from] || { name: '', friends: new Set() };
    state.known[msg.from].friends = new Set(msg.friends);
    render();
  } else if (msg.type === 'chat') {
    state.messages.push({ mid: msg.mid, groupId: msg.groupId, sender: msg.sender, text: msg.text, time: msg.time });
    saveState();
    render();
  } else if (msg.type === 'poll') {
    state.polls[msg.pollId] = { question: msg.question, options: msg.options, votes: {}, creator: msg.creator, mid: msg.mid };
    saveState();
    render();
  } else if (msg.type === 'vote') {
    if (state.polls[msg.pollId]) {
      state.polls[msg.pollId].votes[msg.voter] = msg.option;
      saveState();
      render();
    }
  }
}

function forward(msg, from) {
  for (const [pid, p] of Object.entries(state.peers)) {
    if (pid === from) continue;
    if (p.dc && p.dc.readyState === 'open') sendRaw(p.dc, msg);
  }
}

function broadcast(msg, exclude) {
  msg.mid = msg.mid || uuid();
  for (const [pid, p] of Object.entries(state.peers)) {
    if (pid === exclude) continue;
    if (p.dc && p.dc.readyState === 'open') sendRaw(p.dc, msg);
  }
}

function sendTo(peerId, msg) {
  const p = state.peers[peerId];
  if (p && p.dc && p.dc.readyState === 'open') sendRaw(p.dc, { ...msg, mid: msg.mid || uuid() });
}

function addFriend(peerId) {
  state.known[peerId] = state.known[peerId] || { name: '', friends: new Set() };
  state.known[peerId].sentRequest = true;
  sendTo(peerId, { type: 'friend-request', from: state.myId, to: peerId });
  render();
}

function acceptFriend(peerId) {
  state.friends.add(peerId);
  state.known[peerId] = state.known[peerId] || { name: '', friends: new Set() };
  state.known[peerId].friend = true;
  state.known[peerId].request = false;
  saveState();
  sendTo(peerId, { type: 'friend-accept', from: state.myId, to: peerId });
  broadcast({ type: 'friend-list', from: state.myId, friends: [...state.friends], mid: uuid() });
  render();
}

function computeGroup() {
  const graph = { [state.myId]: [...state.friends] };
  for (const [id, info] of Object.entries(state.known)) {
    if (info.friends) graph[id] = [...info.friends];
  }
  const visited = new Set();
  const stack = [state.myId];
  while (stack.length) {
    const n = stack.pop();
    if (visited.has(n)) continue;
    visited.add(n);
    for (const f of graph[n] || []) if (!visited.has(f)) stack.push(f);
  }
  return [...visited];
}

function sendChat() {
  const text = $('#chat-input').value.trim();
  if (!text) return;
  const msg = { type: 'chat', mid: uuid(), sender: state.myId, groupId: 'main', text, time: Date.now() };
  state.messages.push({ mid: msg.mid, groupId: 'main', sender: state.myId, text, time: msg.time });
  $('#chat-input').value = '';
  saveState();
  broadcast(msg);
  renderChat();
}

function createPoll() {
  const question = $('#poll-question').value.trim();
  const options = $('#poll-options').value.split(',').map(s => s.trim()).filter(Boolean);
  if (!question || options.length < 2) return;
  const pollId = uuid();
  const msg = { type: 'poll', mid: uuid(), pollId, question, options, creator: state.myId };
  state.polls[pollId] = { question, options, votes: {}, creator: state.myId };
  broadcast(msg);
  saveState();
  renderPolls();
}

function vote(pollId, option) {
  const poll = state.polls[pollId];
  if (!poll || poll.votes[state.myId]) return;
  poll.votes[state.myId] = option;
  broadcast({ type: 'vote', mid: uuid(), pollId, voter: state.myId, option });
  saveState();
  renderPolls();
}

function setupListeners() {
  $('#start-btn').addEventListener('click', () => {
    const name = $('#name-input').value.trim();
    if (!name) { alert('Wpisz swoje imię lub nick'); return; }
    state.myName = name;
    state.myId = uuid();
    saveIdentity();
    showApp();
    render();
  });

  $('#copy-uuid-btn').addEventListener('click', copyUuid);
  $('#add-friend-uuid-btn').addEventListener('click', addFriendByUuid);
  $('#show-qr-btn').addEventListener('click', showQr);
  $('#scan-qr-btn').addEventListener('click', startQrScan);
  $('#qr-close-btn').addEventListener('click', stopQrScan);

  $('#create-offer-btn').addEventListener('click', () => createOffer());

  $('#accept-offer-btn').addEventListener('click', () => {
    $('#sdp-area').classList.remove('hidden');
    $('qr-display').innerHTML = '';
    $('qr-display').classList.add('hidden');
    $('#sdp-out').value = '';
    $('#sdp-in').value = '';
    $('#sdp-in').placeholder = 'Wklej SDP-offer od drugiej osoby';
    $('#sdp-next-btn').textContent = 'Utwórz odpowiedź';
    state.sdpPending = { mode: 'answer' };
  });

  $('#sdp-next-btn').addEventListener('click', () => {
    if (!state.sdpPending) return;
    if (state.sdpPending.mode === 'offer') acceptAnswer();
    else if (state.sdpPending.mode === 'answer' && !state.sdpPending.pc) {
      acceptOffer();
    } else if (state.sdpPending.mode === 'answer') {
      $('#sdp-area').classList.add('hidden');
      state.sdpPending = null;
    }
  });

  $('#chat-send-btn').addEventListener('click', sendChat);
  $('#chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
  $('#poll-create-btn').addEventListener('click', createPoll);
}

function setupTabs() {
  document.querySelectorAll('.tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $(btn.dataset.tab).classList.add('active');
    });
  });
}

function render() {
  renderPeers();
  renderGroups();
  renderChat();
  renderPolls();
}

function renderPeers() {
  const list = $('#peers-list');
  list.innerHTML = '';
  for (const [pid, p] of Object.entries(state.peers)) {
    const li = document.createElement('li');
    const info = document.createElement('div');
    info.className = 'info';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = p.name || 'Nieznany';
    const id = document.createElement('div');
    id.className = 'id';
    id.textContent = pid.substr(0, 8);
    info.appendChild(name);
    info.appendChild(id);
    li.appendChild(info);
    const known = state.known[pid] || {};
    if (state.friends.has(pid)) {
      const badge = document.createElement('span');
      badge.className = 'badge friend';
      badge.textContent = 'Znajomy';
      li.appendChild(badge);
    } else if (known.request) {
      const btn = document.createElement('button');
      btn.className = 'btn success';
      btn.textContent = 'Akceptuj';
      btn.style.width = 'auto';
      btn.style.padding = '8px 12px';
      btn.style.marginBottom = '0';
      btn.onclick = () => acceptFriend(pid);
      li.appendChild(btn);
    } else if (known.sentRequest) {
      const badge = document.createElement('span');
      badge.className = 'badge pending';
      badge.textContent = 'Wysłano';
      li.appendChild(badge);
    } else if (!pid.startsWith('pending-')) {
      const btn = document.createElement('button');
      btn.className = 'btn secondary';
      btn.textContent = 'Dodaj';
      btn.style.width = 'auto';
      btn.style.padding = '8px 12px';
      btn.style.marginBottom = '0';
      btn.onclick = () => addFriend(pid);
      li.appendChild(btn);
    } else {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'łączenie';
      li.appendChild(badge);
    }
    list.appendChild(li);
  }
}

function renderGroups() {
  const group = computeGroup();
  const empty = $('#groups-empty');
  const list = $('#groups-list');
  list.innerHTML = '';
  if (group.length <= 1) {
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    group.forEach(id => {
      const li = document.createElement('li');
      const isMe = id === state.myId;
      const name = isMe ? `${state.myName} (Ty)` : (state.known[id]?.name || 'Nieznany');
      li.textContent = name;
      list.appendChild(li);
    });
  }
}

function renderChat() {
  const box = $('#chat-messages');
  box.innerHTML = '';
  state.messages.forEach(m => {
    const div = document.createElement('div');
    div.className = 'message';
    const author = document.createElement('div');
    author.className = 'author';
    author.textContent = m.sender === state.myId ? 'Ty' : (state.known[m.sender]?.name || state.peers[m.sender]?.name || 'Nieznany');
    const text = document.createElement('div');
    text.className = 'text';
    text.textContent = m.text;
    const time = document.createElement('div');
    time.className = 'time';
    time.textContent = new Date(m.time).toLocaleTimeString();
    div.appendChild(author);
    div.appendChild(text);
    div.appendChild(time);
    box.appendChild(div);
  });
  box.scrollTop = box.scrollHeight;
}

function renderPolls() {
  const list = $('#polls-list');
  list.innerHTML = '';
  for (const [pollId, poll] of Object.entries(state.polls)) {
    const li = document.createElement('li');
    li.style.flexDirection = 'column';
    li.style.alignItems = 'flex-start';
    const title = document.createElement('div');
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '6px';
    title.textContent = poll.question;
    li.appendChild(title);
    const counts = {};
    Object.values(poll.votes).forEach(o => { counts[o] = (counts[o] || 0) + 1; });
    poll.options.forEach(opt => {
      const row = document.createElement('div');
      row.style.width = '100%';
      row.style.marginTop = '4px';
      const btn = document.createElement('button');
      btn.className = 'btn secondary';
      btn.textContent = `${opt} (${counts[opt] || 0})`;
      if (poll.votes[state.myId]) btn.disabled = true;
      if (poll.votes[state.myId] === opt) { btn.style.background = 'var(--success)'; btn.disabled = false; }
      btn.onclick = () => vote(pollId, opt);
      row.appendChild(btn);
      li.appendChild(row);
    });
    list.appendChild(li);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
