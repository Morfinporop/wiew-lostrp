const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const path = require('path');
const Datastore = require('nedb-promises');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ADMIN_EMAIL = 'energoferon41@gmail.com';

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);

const usersDb = Datastore.create({ filename: path.join(dbDir, 'users.db'), autoload: true });
const postsDb = Datastore.create({ filename: path.join(dbDir, 'posts.db'), autoload: true });
const chatsDb = Datastore.create({ filename: path.join(dbDir, 'chats.db'), autoload: true });
const sessionsDb = Datastore.create({ filename: path.join(dbDir, 'sessions.db'), autoload: true });

function genId() { return crypto.randomBytes(16).toString('hex'); }
function genToken() { return crypto.randomBytes(32).toString('hex'); }

function hashPass(p) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(p, salt, 64).toString('hex');
    return salt + ':' + hash;
}

function verifyPass(p, stored) {
    const [salt, hash] = stored.split(':');
    const test = crypto.scryptSync(p, salt, 64).toString('hex');
    return test === hash;
}

async function auth(req, res, next) {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const session = await sessionsDb.findOne({ token });
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const user = await usersDb.findOne({ uid: session.userId });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    req.userId = user.uid;
    req.user = user;
    req.isAdmin = user.email === ADMIN_EMAIL;
    next();
}

async function adminOnly(req, res, next) {
    if (!req.isAdmin) return res.status(403).json({ error: 'Forbidden' });
    next();
}

function safeUser(u) {
    return {
        id: u.uid, name: u.name, handle: u.handle, bio: u.bio || '',
        avatar: u.avatar || null, banner: u.banner || null,
        followers: (u.followers || []).length, following: (u.following || []).length,
        created: u.created, email: u.email, isAdmin: u.email === ADMIN_EMAIL
    };
}

function safePost(p, viewerId) {
    return {
        id: p.pid, authorId: p.authorId, authorName: p.authorName,
        authorHandle: p.authorHandle, authorAvatar: p.authorAvatar,
        text: p.text, image: p.image,
        likes: (p.likes || []).length, liked: (p.likes || []).includes(viewerId),
        comments: (p.comments || []).map(function(c) {
            return {
                id: c.id, authorId: c.authorId, authorName: c.authorName,
                authorHandle: c.authorHandle, authorAvatar: c.authorAvatar,
                text: c.text, likes: (c.likes || []).length,
                liked: (c.likes || []).includes(viewerId), created: c.created
            };
        }),
        isOwn: p.authorId === viewerId, created: p.created
    };
}

app.post('/api/register', async (req, res) => {
    try {
        const { email, password, name, handle } = req.body;
        if (!email || !password || !name || !handle)
            return res.status(400).json({ error: 'Все поля обязательны' });
        if (password.length < 6)
            return res.status(400).json({ error: 'Пароль минимум 6 символов' });
        const emailLower = email.toLowerCase().trim();
        const existEmail = await usersDb.findOne({ email: emailLower });
        if (existEmail) return res.status(400).json({ error: 'Email уже зарегистрирован' });
        const h = handle.startsWith('@') ? handle : '@' + handle;
        const existHandle = await usersDb.findOne({ handle: h });
        if (existHandle) return res.status(400).json({ error: 'Никнейм уже занят' });
        const uid = genId();
        const user = {
            uid, email: emailLower, password: hashPass(password),
            name: name.trim(), handle: h, bio: '', avatar: null, banner: null,
            followers: [], following: [], created: new Date().toISOString()
        };
        await usersDb.insert(user);
        const token = genToken();
        await sessionsDb.insert({ token, userId: uid, created: new Date().toISOString() });
        res.json({ token, user: safeUser(user) });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password)
            return res.status(400).json({ error: 'Все поля обязательны' });
        const emailLower = email.toLowerCase().trim();
        const user = await usersDb.findOne({ email: emailLower });
        if (!user || !verifyPass(password, user.password))
            return res.status(401).json({ error: 'Неверный email или пароль' });
        const token = genToken();
        await sessionsDb.insert({ token, userId: user.uid, created: new Date().toISOString() });
        res.json({ token, user: safeUser(user) });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/me', auth, async (req, res) => {
    res.json({ user: safeUser(req.user) });
});

app.put('/api/profile', auth, async (req, res) => {
    try {
        const { name, handle, bio, avatar, banner } = req.body;
        const update = {};
        if (name) update.name = name.trim();
        if (handle) {
            const h = handle.startsWith('@') ? handle : '@' + handle;
            const exist = await usersDb.findOne({ handle: h, uid: { $ne: req.userId } });
            if (exist) return res.status(400).json({ error: 'Никнейм занят' });
            update.handle = h;
        }
        if (bio !== undefined) update.bio = bio;
        if (avatar !== undefined) update.avatar = avatar;
        if (banner !== undefined) update.banner = banner;
        await usersDb.update({ uid: req.userId }, { $set: update });
        const updated = await usersDb.findOne({ uid: req.userId });
        await postsDb.update(
            { authorId: req.userId },
            { $set: { authorName: updated.name, authorHandle: updated.handle, authorAvatar: updated.avatar } },
            { multi: true }
        );
        const allPosts = await postsDb.find({});
        for (const post of allPosts) {
            let changed = false;
            (post.comments || []).forEach(function(c) {
                if (c.authorId === req.userId) {
                    c.authorName = updated.name;
                    c.authorHandle = updated.handle;
                    c.authorAvatar = updated.avatar;
                    changed = true;
                }
            });
            if (changed) await postsDb.update({ _id: post._id }, { $set: { comments: post.comments } });
        }
        res.json({ user: safeUser(updated) });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.delete('/api/account', auth, async (req, res) => {
    try {
        await postsDb.remove({ authorId: req.userId }, { multi: true });
        const allPosts = await postsDb.find({});
        for (const post of allPosts) {
            const filtered = (post.comments || []).filter(function(c) { return c.authorId !== req.userId; });
            const likes = (post.likes || []).filter(function(l) { return l !== req.userId; });
            await postsDb.update({ _id: post._id }, { $set: { comments: filtered, likes } });
        }
        const allUsers = await usersDb.find({});
        for (const u of allUsers) {
            const followers = (u.followers || []).filter(function(f) { return f !== req.userId; });
            const following = (u.following || []).filter(function(f) { return f !== req.userId; });
            await usersDb.update({ uid: u.uid }, { $set: { followers, following } });
        }
        await chatsDb.remove({ members: req.userId }, { multi: true });
        await sessionsDb.remove({ userId: req.userId }, { multi: true });
        await usersDb.remove({ uid: req.userId });
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/posts', auth, async (req, res) => {
    try {
        const { text, image } = req.body;
        if (!text && !image) return res.status(400).json({ error: 'Пост не может быть пустым' });
        const post = {
            pid: genId(), authorId: req.userId, authorName: req.user.name,
            authorHandle: req.user.handle, authorAvatar: req.user.avatar,
            text: text || '', image: image || null,
            likes: [], comments: [], created: new Date().toISOString()
        };
        await postsDb.insert(post);
        const safe = safePost(post, req.userId);
        io.emit('newPost', safe);
        res.json({ post: safe });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/posts', auth, async (req, res) => {
    try {
        const posts = await postsDb.find({}).sort({ created: -1 });
        res.json({ posts: posts.map(function(p) { return safePost(p, req.userId); }) });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.put('/api/posts/:id', auth, async (req, res) => {
    try {
        const post = await postsDb.findOne({ pid: req.params.id });
        if (!post) return res.status(404).json({ error: 'Не найдено' });
        if (post.authorId !== req.userId && !req.isAdmin) return res.status(403).json({ error: 'Запрещено' });
        const update = {};
        if (req.body.text !== undefined) update.text = req.body.text;
        if (req.body.image !== undefined) update.image = req.body.image;
        await postsDb.update({ pid: req.params.id }, { $set: update });
        const updated = await postsDb.findOne({ pid: req.params.id });
        const safe = safePost(updated, req.userId);
        io.emit('updatePost', safe);
        res.json({ post: safe });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.delete('/api/posts/:id', auth, async (req, res) => {
    try {
        const post = await postsDb.findOne({ pid: req.params.id });
        if (!post) return res.status(404).json({ error: 'Не найдено' });
        if (post.authorId !== req.userId && !req.isAdmin) return res.status(403).json({ error: 'Запрещено' });
        await postsDb.remove({ pid: req.params.id });
        io.emit('deletePost', req.params.id);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/posts/:id/like', auth, async (req, res) => {
    try {
        const post = await postsDb.findOne({ pid: req.params.id });
        if (!post) return res.status(404).json({ error: 'Не найдено' });
        const likes = post.likes || [];
        const idx = likes.indexOf(req.userId);
        if (idx === -1) likes.push(req.userId); else likes.splice(idx, 1);
        await postsDb.update({ pid: req.params.id }, { $set: { likes } });
        const updated = await postsDb.findOne({ pid: req.params.id });
        const safe = safePost(updated, req.userId);
        io.emit('updatePost', safe);
        res.json({ post: safe });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/posts/:id/comments', auth, async (req, res) => {
    try {
        const post = await postsDb.findOne({ pid: req.params.id });
        if (!post) return res.status(404).json({ error: 'Не найдено' });
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: 'Комментарий пуст' });
        const comment = {
            id: genId(), authorId: req.userId, authorName: req.user.name,
            authorHandle: req.user.handle, authorAvatar: req.user.avatar,
            text, likes: [], created: new Date().toISOString()
        };
        const comments = post.comments || [];
        comments.push(comment);
        await postsDb.update({ pid: req.params.id }, { $set: { comments } });
        const updated = await postsDb.findOne({ pid: req.params.id });
        const safe = safePost(updated, req.userId);
        io.emit('updatePost', safe);
        res.json({ post: safe });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/posts/:pid/comments/:cid/like', auth, async (req, res) => {
    try {
        const post = await postsDb.findOne({ pid: req.params.pid });
        if (!post) return res.status(404).json({ error: 'Не найдено' });
        const comments = post.comments || [];
        const comment = comments.find(function(c) { return c.id === req.params.cid; });
        if (!comment) return res.status(404).json({ error: 'Не найден' });
        const likes = comment.likes || [];
        const idx = likes.indexOf(req.userId);
        if (idx === -1) likes.push(req.userId); else likes.splice(idx, 1);
        comment.likes = likes;
        await postsDb.update({ pid: req.params.pid }, { $set: { comments } });
        const updated = await postsDb.findOne({ pid: req.params.pid });
        const safe = safePost(updated, req.userId);
        io.emit('updatePost', safe);
        res.json({ post: safe });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/follow/:handle', auth, async (req, res) => {
    try {
        const handle = decodeURIComponent(req.params.handle);
        const target = await usersDb.findOne({ handle });
        if (!target) return res.status(404).json({ error: 'Не найден' });
        if (target.uid === req.userId) return res.status(400).json({ error: 'Нельзя' });
        const myFollowing = req.user.following || [];
        const targetFollowers = target.followers || [];
        const fi = myFollowing.indexOf(target.uid);
        let isFollowing;
        if (fi === -1) { myFollowing.push(target.uid); targetFollowers.push(req.userId); isFollowing = true; }
        else { myFollowing.splice(fi, 1); const ti = targetFollowers.indexOf(req.userId); if (ti !== -1) targetFollowers.splice(ti, 1); isFollowing = false; }
        await usersDb.update({ uid: req.userId }, { $set: { following: myFollowing } });
        await usersDb.update({ uid: target.uid }, { $set: { followers: targetFollowers } });
        const updatedMe = await usersDb.findOne({ uid: req.userId });
        const updatedTarget = await usersDb.findOne({ uid: target.uid });
        res.json({ user: safeUser(updatedMe), target: safeUser(updatedTarget), isFollowing });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/users/search', auth, async (req, res) => {
    try {
        const q = (req.query.q || '').toLowerCase().trim();
        if (!q) return res.json({ users: [] });
        const all = await usersDb.find({});
        const results = all.filter(function(u) {
            if (u.uid === req.userId) return false;
            return u.name.toLowerCase().includes(q) || u.handle.toLowerCase().includes(q);
        }).map(safeUser);
        res.json({ users: results });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/users/:handle', auth, async (req, res) => {
    try {
        const handle = decodeURIComponent(req.params.handle);
        const target = await usersDb.findOne({ handle });
        if (!target) return res.status(404).json({ error: 'Не найден' });
        const userPosts = await postsDb.find({ authorId: target.uid }).sort({ created: -1 });
        const isFollowing = (req.user.following || []).includes(target.uid);
        res.json({ user: safeUser(target), posts: userPosts.map(function(p) { return safePost(p, req.userId); }), isFollowing });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/chats', auth, async (req, res) => {
    try {
        const myChats = await chatsDb.find({ members: req.userId });
        const result = [];
        for (const chat of myChats) {
            const otherId = chat.members.find(function(m) { return m !== req.userId; });
            const otherUser = await usersDb.findOne({ uid: otherId });
            result.push({ id: chat.cid, user: otherUser ? safeUser(otherUser) : null, messages: (chat.messages || []).slice(-50), created: chat.created });
        }
        result.sort(function(a, b) {
            const aL = a.messages.length ? new Date(a.messages[a.messages.length - 1].created) : new Date(a.created);
            const bL = b.messages.length ? new Date(b.messages[b.messages.length - 1].created) : new Date(b.created);
            return bL - aL;
        });
        res.json({ chats: result });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/chats', auth, async (req, res) => {
    try {
        const { handle } = req.body;
        const target = await usersDb.findOne({ handle });
        if (!target) return res.status(404).json({ error: 'Не найден' });
        if (target.uid === req.userId) return res.status(400).json({ error: 'Нельзя' });
        const existing = await chatsDb.findOne({ $and: [{ members: req.userId }, { members: target.uid }] });
        if (existing) return res.json({ chat: { id: existing.cid, user: safeUser(target), messages: (existing.messages || []).slice(-50), created: existing.created } });
        const chat = { cid: genId(), members: [req.userId, target.uid], messages: [], created: new Date().toISOString() };
        await chatsDb.insert(chat);
        res.json({ chat: { id: chat.cid, user: safeUser(target), messages: [], created: chat.created } });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.delete('/api/chats/:id', auth, async (req, res) => {
    try {
        const chat = await chatsDb.findOne({ cid: req.params.id, members: req.userId });
        if (!chat) return res.status(404).json({ error: 'Не найдено' });
        await chatsDb.remove({ cid: req.params.id });
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/admin/users', auth, adminOnly, async (req, res) => {
    try {
        const all = await usersDb.find({});
        const users = all.map(function(u) {
            return { id: u.uid, name: u.name, handle: u.handle, email: u.email, bio: u.bio, avatar: u.avatar, banner: u.banner, followers: (u.followers || []).length, following: (u.following || []).length, created: u.created };
        });
        res.json({ users });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/admin/posts', auth, adminOnly, async (req, res) => {
    try {
        const posts = await postsDb.find({}).sort({ created: -1 });
        res.json({ posts: posts.map(function(p) { return safePost(p, req.userId); }) });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.put('/api/admin/users/:id', auth, adminOnly, async (req, res) => {
    try {
        const { name, handle, bio, avatar, banner } = req.body;
        const update = {};
        if (name !== undefined) update.name = name;
        if (handle !== undefined) update.handle = handle.startsWith('@') ? handle : '@' + handle;
        if (bio !== undefined) update.bio = bio;
        if (avatar !== undefined) update.avatar = avatar;
        if (banner !== undefined) update.banner = banner;
        await usersDb.update({ uid: req.params.id }, { $set: update });
        const updated = await usersDb.findOne({ uid: req.params.id });
        if (updated) {
            await postsDb.update({ authorId: req.params.id }, { $set: { authorName: updated.name, authorHandle: updated.handle, authorAvatar: updated.avatar } }, { multi: true });
        }
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.delete('/api/admin/users/:id', auth, adminOnly, async (req, res) => {
    try {
        const uid = req.params.id;
        await postsDb.remove({ authorId: uid }, { multi: true });
        const allPosts = await postsDb.find({});
        for (const post of allPosts) {
            const filtered = (post.comments || []).filter(function(c) { return c.authorId !== uid; });
            const likes = (post.likes || []).filter(function(l) { return l !== uid; });
            await postsDb.update({ _id: post._id }, { $set: { comments: filtered, likes } });
        }
        const allUsers = await usersDb.find({});
        for (const u of allUsers) {
            const followers = (u.followers || []).filter(function(f) { return f !== uid; });
            const following = (u.following || []).filter(function(f) { return f !== uid; });
            await usersDb.update({ uid: u.uid }, { $set: { followers, following } });
        }
        await chatsDb.remove({ members: uid }, { multi: true });
        await sessionsDb.remove({ userId: uid }, { multi: true });
        await usersDb.remove({ uid });
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.delete('/api/admin/posts/:id', auth, adminOnly, async (req, res) => {
    try {
        await postsDb.remove({ pid: req.params.id });
        io.emit('deletePost', req.params.id);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.delete('/api/admin/comments/:pid/:cid', auth, adminOnly, async (req, res) => {
    try {
        const post = await postsDb.findOne({ pid: req.params.pid });
        if (!post) return res.status(404).json({ error: 'Не найдено' });
        const comments = (post.comments || []).filter(function(c) { return c.id !== req.params.cid; });
        await postsDb.update({ pid: req.params.pid }, { $set: { comments } });
        const updated = await postsDb.findOne({ pid: req.params.pid });
        io.emit('updatePost', safePost(updated, req.userId));
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/admin/stats', auth, adminOnly, async (req, res) => {
    try {
        const userCount = await usersDb.count({});
        const postCount = await postsDb.count({});
        const chatCount = await chatsDb.count({});
        const sessionCount = await sessionsDb.count({});
        res.json({ users: userCount, posts: postCount, chats: chatCount, sessions: sessionCount });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

const onlineUsers = new Map();

io.on('connection', (socket) => {
    socket.on('auth', async (token) => {
        const session = await sessionsDb.findOne({ token });
        if (!session) return;
        socket.userId = session.userId;
        onlineUsers.set(session.userId, socket.id);
        io.emit('online', Array.from(onlineUsers.keys()));
    });

    socket.on('typing', (data) => {
        if (!socket.userId) return;
        chatsDb.findOne({ cid: data.chatId }).then(function(chat) {
            if (!chat) return;
            const other = chat.members.find(function(m) { return m !== socket.userId; });
            const otherSocket = onlineUsers.get(other);
            if (otherSocket) io.to(otherSocket).emit('typing', { chatId: data.chatId, userId: socket.userId });
        });
    });

    socket.on('message', async (data) => {
        if (!socket.userId) return;
        try {
            const chat = await chatsDb.findOne({ cid: data.chatId });
            if (!chat || !chat.members.includes(socket.userId)) return;
            const msg = { id: genId(), authorId: socket.userId, text: data.text, created: new Date().toISOString() };
            const messages = chat.messages || [];
            messages.push(msg);
            await chatsDb.update({ cid: data.chatId }, { $set: { messages } });
            chat.members.forEach(function(memberId) {
                const sid = onlineUsers.get(memberId);
                if (sid) io.to(sid).emit('message', { chatId: data.chatId, message: msg });
            });
        } catch (e) {}
    });

    socket.on('disconnect', () => {
        if (socket.userId) onlineUsers.delete(socket.userId);
        io.emit('online', Array.from(onlineUsers.keys()));
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('');
    console.log('================================');
    console.log('  Wiew LostRP Server Started');
    console.log('================================');
    console.log('  http://localhost:' + PORT);
    console.log('================================');
    console.log('');
});
