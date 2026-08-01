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
  bindTabs();
  bindActions();
  render();
}

function showSetup() {
  $('setup').classList.remove('hidden');
  $('app').classList.add('hidden');
}

function showApp() {
  $('setup').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('my-meta').textContent = `${state.myName} (${state.myId.slice(0, 8)}...)`;
  $('my-uuid').textContent = state.myId;
}

function saveIdentity() {
  localStorage.setItem('dist-chat-identity', JSON.stringify({ id: state.myId, name: state.myName }));
}

function saveState() {
  const known = {};
  for (const [k, v] of Object.entries(state.known)) {
    known[k] = { name: v.name, friends: [...v.friends] };
  }
  localStorage.setItem('dist-chat-state', JSON.stringify({
    friends: [...state.friends],
    known,
    messages: state.messages,
    polls: state.polls,
    seen: [...state.seen]
  }));
}

function loadState() {
  const raw = localStorage.getItem('dist-chat-state');
  if (!raw) return;
  const data = JSON.parse(raw);
  state.friends = new Set(data.friends || []);
  state.known = {};
  for (const [k, v] of Object.entries(data.known || {})) {
    state.known[k] = { name: v.name, friends: new Set(v.friends || []) };
  }
  state.messages = data.messages || [];
  state.polls = data.polls || {};
  state.seen = new Set(data.seen || []);
}

function waitIce(pc) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') { resolve(); return; }
    pc.addEventListener('icegatheringstatechange', function check() {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    });
  });
}

function createPeer(isOfferer) {
  const pc = new RTCPeerConnection(ICE);
  const cid = 'pending-' + uuid();
  pc._cid = cid;
  let dc = null;
  if (isOfferer) {
    dc = pc.createDataChannel('chat');
    setupChannel(dc, cid);
  }
  pc.ondatachannel = (e) => setupChannel(e.channel, cid);
  pc.onconnectionstatechange = () => {
    if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
      cleanupPeer(pc._peerId || pc._cid);
    }
  };
  state.peers[cid] = { pc, dc, name: 'łączenie...' };
  return { pc, dc, cid };
}

function setupChannel(dc, cid) {
  dc._cid = cid;
  dc.onopen = () => sendRaw(dc, { type: 'hello', id: state.myId, name: state.myName, friends: [...state.friends] });
  dc.onmessage = (e) => {
    try { handleMessage(JSON.parse(e.data), e.target); } catch (err) { console.error(err); }
  };
}

function sendRaw(dc, obj) {
  if (dc.readyState === 'open') dc.send(JSON.stringify(obj));
}

async function createOffer() {
  const { pc, cid } = createPeer(true);
  state.sdpPending = { pc, cid, mode: 'offer' };
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitIce(pc);
  $('sdp-out').value = JSON.stringify(pc.localDescription);
  $('sdp-in').value = '';
  $('sdp-in').placeholder = 'Wklej SDP-answer';
  $('sdp-next-btn').textContent = 'Sfinalizuj';
  $('sdp-area').classList.remove('hidden');
}

async function acceptOffer() {
  const offer = JSON.parse($('sdp-in').value);
  const { pc, cid } = createPeer(false);
  state.sdpPending = { pc, cid, mode: 'answer' };
  await pc.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitIce(pc);
  $('sdp-out').value = JSON.stringify(pc.localDescription);
  $('sdp-next-btn').textContent = 'Zamknij';
}

async function finalizeAnswer() {
  const answer = JSON.parse($('sdp-in').value);
  if (!state.sdpPending || !state.sdpPending.pc) return;
  await state.sdpPending.pc.setRemoteDescription(answer);
  $('sdp-area').classList.add('hidden');
  state.sdpPending = null;
}

function cleanupPeer(key) {
  const p = state.peers[key];
  if (p) { try { p.pc.close(); } catch (e) {} delete state.peers[key]; }
  render();
}

function handleMessage(msg, dc) {
  if (msg.type === 'hello') {
    const cid = dc._cid;
    const p = state.peers[cid];
    if (!p) return;
    p.name = msg.name;
    p.pc._peerId = msg.id;
    dc._peerId = msg.id;
    delete state.peers[cid];
    state.peers[msg.id] = p;
    state.known[msg.id] = { name: msg.name, friends: new Set(msg.friends || []) };
    render();
    return;
  }
  const from = dc._peerId;
  if (!from) return;
  if (msg.mid && state.seen.has(msg.mid)) return;
  if (msg.mid) state.seen.add(msg.mid);
  if (msg.to && msg.to !== state.myId) {
    relay(msg, from);
    return;
  }
  processMessage(msg);
  if (['chat', 'poll', 'vote', 'friend-list'].includes(msg.type)) relay(msg, from);
}

function processMessage(msg) {
  if (msg.type === 'friend-request') {
    state.known[msg.from] = state.known[msg.from] || { name: '', friends: new Set() };
    state.known[msg.from].request = true;
    if (state.known[msg.from].sentRequest) acceptFriendUuid(msg.from);
    else render();
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
    state.messages.push({ mid: msg.mid, sender: msg.sender, text: msg.text, time: msg.time });
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

function relay(msg, from) {
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
  broadcast({ type: 'friend-accept', from: state.myId, to: target, mid: uuid() });
  broadcast({ type: 'friend-list', from: state.myId, friends: [...state.friends], mid: uuid() });
  render();
}

function addFriendByUuid() {
  const target = $('friend-uuid').value.trim();
  if (!target) return;
  if (!isUuid(target)) { alert('To nie wygląda na UUID'); return; }
  state.known[target] = state.known[target] || { name: '', friends: new Set() };
  state.known[target].sentRequest = true;
  broadcast({ type: 'friend-request', from: state.myId, to: target, mid: uuid() });
  if (state.known[target].request) acceptFriendUuid(target);
  $('friend-uuid').value = '';
  saveState();
  render();
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
  const text = $('chat-input').value.trim();
  if (!text) return;
  const msg = { type: 'chat', mid: uuid(), sender: state.myId, text, time: Date.now() };
  state.messages.push({ mid: msg.mid, sender: state.myId, text, time: msg.time });
  $('chat-input').value = '';
  saveState();
  broadcast(msg);
  renderChat();
}

function createPoll() {
  const question = $('poll-question').value.trim();
  const options = $('poll-options').value.split(',').map(s => s.trim()).filter(Boolean);
  if (!question || options.length < 2) { alert('Podaj pytanie i co najmniej 2 opcje'); return; }
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

function bindTabs() {
  document.querySelectorAll('.tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
      btn.classList.add('active');
      $(btn.dataset.view).classList.remove('hidden');
    });
  });
}

function bindActions() {
  $('start-btn').addEventListener('click', () => {
    const name = $('name-input').value.trim();
    if (!name) { alert('Wpisz swoje imię'); return; }
    state.myName = name;
    state.myId = uuid();
    saveIdentity();
    showApp();
    render();
  });

  $('copy-uuid-btn').addEventListener('click', () => {
    if (navigator.clipboard) navigator.clipboard.writeText(state.myId);
  });

  $('create-offer-btn').addEventListener('click', createOffer);
  $('accept-offer-btn').addEventListener('click', () => {
    $('sdp-area').classList.remove('hidden');
    $('sdp-out').value = '';
    $('sdp-in').value = '';
    $('sdp-in').placeholder = 'Wklej SDP-offer';
    $('sdp-next-btn').textContent = 'Utwórz odpowiedź';
    state.sdpPending = { mode: 'answer' };
  });

  $('sdp-next-btn').addEventListener('click', () => {
    if (!state.sdpPending) return;
    if (state.sdpPending.mode === 'offer') finalizeAnswer();
    else if (state.sdpPending.mode === 'answer' && !state.sdpPending.pc) acceptOffer();
    else if (state.sdpPending.mode === 'answer') {
      $('sdp-area').classList.add('hidden');
      state.sdpPending = null;
    }
  });

  $('add-friend-uuid-btn').addEventListener('click', addFriendByUuid);
  $('chat-send-btn').addEventListener('click', sendChat);
  $('chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
  $('poll-create-btn').addEventListener('click', createPoll);
}

function render() {
  renderPeers();
  renderGroups();
  renderChat();
  renderPolls();
}

function renderPeers() {
  const list = $('peers-list');
  list.innerHTML = '';
  for (const [pid, p] of Object.entries(state.peers)) {
    if (pid.startsWith('pending-')) continue;
    const li = document.createElement('li');
    const info = document.createElement('div');
    info.className = 'info';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = p.name || 'Nieznany';
    const id = document.createElement('div');
    id.className = 'id';
    id.textContent = pid.slice(0, 8);
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
      btn.type = 'button';
      btn.style.width = 'auto';
      btn.style.padding = '8px 12px';
      btn.style.marginBottom = '0';
      btn.onclick = () => acceptFriend(pid);
      li.appendChild(btn);
    } else if (known.sentRequest) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'Wysłano';
      li.appendChild(badge);
    } else {
      const btn = document.createElement('button');
      btn.className = 'btn secondary';
      btn.textContent = 'Dodaj';
      btn.type = 'button';
      btn.style.width = 'auto';
      btn.style.padding = '8px 12px';
      btn.style.marginBottom = '0';
      btn.onclick = () => addFriend(pid);
      li.appendChild(btn);
    }
    list.appendChild(li);
  }
}

function renderGroups() {
  const group = computeGroup();
  const empty = $('groups-empty');
  const list = $('groups-list');
  list.innerHTML = '';
  if (group.length <= 1) {
    empty.classList.remove('hidden');
  } else {
    empty.classList.add('hidden');
    group.forEach(id => {
      const li = document.createElement('li');
      li.textContent = id === state.myId ? `${state.myName} (Ty)` : (state.known[id]?.name || 'Nieznany');
      list.appendChild(li);
    });
  }
}

function renderChat() {
  const box = $('chat-messages');
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
  const list = $('polls-list');
  list.innerHTML = '';
  for (const [pollId, poll] of Object.entries(state.polls)) {
    const div = document.createElement('div');
    div.className = 'poll';
    const title = document.createElement('div');
    title.className = 'question';
    title.textContent = poll.question;
    div.appendChild(title);
    const counts = {};
    Object.values(poll.votes).forEach(o => { counts[o] = (counts[o] || 0) + 1; });
    poll.options.forEach(opt => {
      const row = document.createElement('div');
      row.className = 'option-row';
      const btn = document.createElement('button');
      btn.className = 'btn secondary';
      btn.type = 'button';
      btn.textContent = `${opt} (${counts[opt] || 0})`;
      btn.disabled = !!poll.votes[state.myId];
      if (poll.votes[state.myId] === opt) { btn.classList.add('success'); btn.disabled = false; }
      btn.onclick = () => vote(pollId, opt);
      row.appendChild(btn);
      div.appendChild(row);
    });
    list.appendChild(div);
  }
}

document.addEventListener('DOMContentLoaded', init);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
