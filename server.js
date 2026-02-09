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

app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.get('/api/health', function(req, res) {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);

const usersDb = Datastore.create({ filename: path.join(dbDir, 'users.db'), autoload: true });
const categoriesDb = Datastore.create({ filename: path.join(dbDir, 'categories.db'), autoload: true });
const threadsDb = Datastore.create({ filename: path.join(dbDir, 'threads.db'), autoload: true });
const repliesDb = Datastore.create({ filename: path.join(dbDir, 'replies.db'), autoload: true });
const sessionsDb = Datastore.create({ filename: path.join(dbDir, 'sessions.db'), autoload: true });
const rolesDb = Datastore.create({ filename: path.join(dbDir, 'roles.db'), autoload: true });
const reviewsDb = Datastore.create({ filename: path.join(dbDir, 'reviews.db'), autoload: true });

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

async function initRoles() {
    const count = await rolesDb.count({});
    if (count === 0) {
        await rolesDb.insert({ rid: 'admin', name: 'Администратор', color: '#ef4444', priority: 100, permissions: ['all'] });
        await rolesDb.insert({ rid: 'ml_admin', name: 'Мл. Администратор', color: '#f97316', priority: 80, permissions: ['create_threads', 'create_replies', 'create_categories', 'mod_threads', 'mod_replies', 'pin_threads', 'lock_threads', 'move_threads', 'tag_replies', 'react_replies'] });
        await rolesDb.insert({ rid: 'watching', name: 'Следящий', color: '#f59e0b', priority: 60, permissions: ['create_replies', 'react_replies', 'tag_replies_limited', 'assign_staff'] });
        await rolesDb.insert({ rid: 'staff', name: 'Персонал', color: '#8b5cf6', priority: 40, permissions: ['create_replies', 'tag_ban_deny'] });
        await rolesDb.insert({ rid: 'vip', name: 'VIP', color: '#7c6aef', priority: 20, permissions: ['create_threads', 'create_replies', 'upload_media'] });
        await rolesDb.insert({ rid: 'member', name: 'Участник', color: '#2dd4a0', priority: 10, permissions: ['create_threads', 'create_replies'] });
        await rolesDb.insert({ rid: 'newbie', name: 'Новичок', color: '#6b7280', priority: 1, permissions: ['create_replies'] });
    }
}
initRoles();

async function auth(req, res, next) {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const session = await sessionsDb.findOne({ token });
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const user = await usersDb.findOne({ uid: session.userId });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    req.userId = user.uid;
    req.user = user;
    req.isAdmin = user.email === ADMIN_EMAIL || (user.roles || []).includes('admin');
    req.isMlAdmin = (user.roles || []).includes('ml_admin');
    req.isWatching = (user.roles || []).includes('watching');
    req.isStaff = (user.roles || []).includes('staff');
    req.userRoles = user.roles || ['newbie'];
    next();
}

async function getUserPermissions(user) {
    const roleIds = user.roles || ['newbie'];
    const roles = await rolesDb.find({ rid: { $in: roleIds } });
    const perms = new Set();
    roles.forEach(function(r) { (r.permissions || []).forEach(function(p) { perms.add(p); }); });
    if (user.email === ADMIN_EMAIL) perms.add('all');
    return perms;
}

async function hasPermission(user, perm) {
    const perms = await getUserPermissions(user);
    return perms.has('all') || perms.has(perm);
}

async function getUserHighestRole(user) {
    const roleIds = user.roles || ['newbie'];
    const roles = await rolesDb.find({ rid: { $in: roleIds } });
    if (roles.length === 0) return { rid: 'newbie', name: 'Новичок', color: '#6b7280', priority: 1 };
    roles.sort(function(a, b) { return b.priority - a.priority; });
    return roles[0];
}

async function canManageReplies(user) {
    return await hasPermission(user, 'all') || await hasPermission(user, 'tag_replies') || await hasPermission(user, 'react_replies') || await hasPermission(user, 'tag_replies_limited') || await hasPermission(user, 'tag_ban_deny');
}

async function canLockThreads(user) {
    return await hasPermission(user, 'all') || await hasPermission(user, 'lock_threads');
}

async function canCreateCategories(user) {
    return await hasPermission(user, 'all') || await hasPermission(user, 'create_categories');
}

async function canCreateThreads(user) {
    return await hasPermission(user, 'all') || await hasPermission(user, 'create_threads');
}

async function canTagReplies(user) {
    return await hasPermission(user, 'all') || await hasPermission(user, 'tag_replies') || await hasPermission(user, 'tag_replies_limited') || await hasPermission(user, 'tag_ban_deny');
}

async function canReactReplies(user) {
    return await hasPermission(user, 'all') || await hasPermission(user, 'react_replies');
}

function getAvailableTags(user) {
    var roles = user.roles || ['newbie'];
    if (user.email === ADMIN_EMAIL || roles.includes('admin')) {
        return ['#одобрено', '#отклонено', '#забанен', '#принят', '#ожидание', '#рассмотрено'];
    }
    if (roles.includes('ml_admin')) {
        return ['#одобрено', '#отклонено', '#забанен', '#принят', '#ожидание', '#рассмотрено'];
    }
    if (roles.includes('watching')) {
        return ['#одобрено', '#отклонено', '#ожидание', '#рассмотрено'];
    }
    if (roles.includes('staff')) {
        return ['#забанен', '#отказано'];
    }
    return [];
}

function getTagColor(tag) {
    var colors = {
        '#одобрено': { bg: 'rgba(45,212,160,0.15)', color: '#2dd4a0' },
        '#отклонено': { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
        '#забанен': { bg: 'rgba(239,68,68,0.2)', color: '#ff6b6b' },
        '#принят': { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
        '#ожидание': { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
        '#рассмотрено': { bg: 'rgba(124,106,239,0.15)', color: '#7c6aef' },
        '#отказано': { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' }
    };
    return colors[tag] || { bg: 'rgba(255,255,255,0.1)', color: '#999' };
}

async function calcReputation(userId) {
    const reviews = await reviewsDb.find({ targetId: userId });
    if (reviews.length === 0) return 0;
    let total = 0;
    reviews.forEach(function(r) { total += r.rating; });
    return Math.round((total / reviews.length) * 10) / 10;
}

function safeUser(u, role) {
    return {
        id: u.uid, name: u.name, handle: u.handle, bio: u.bio || '',
        avatar: u.avatar || null, banner: u.banner || null,
        roles: u.roles || ['newbie'],
        role: role || null,
        threadCount: u.threadCount || 0, replyCount: u.replyCount || 0,
        reputation: u.reputation || 0,
        created: u.created, email: u.email,
        isAdmin: u.email === ADMIN_EMAIL || (u.roles || []).includes('admin'),
        isMlAdmin: (u.roles || []).includes('ml_admin'),
        isWatching: (u.roles || []).includes('watching'),
        isStaff: (u.roles || []).includes('staff'),
        online: onlineUsers.has(u.uid),
        availableTags: getAvailableTags(u),
        canCreateThreads: (u.email === ADMIN_EMAIL || (u.roles || []).includes('admin') || (u.roles || []).includes('ml_admin') || (u.roles || []).includes('member') || (u.roles || []).includes('vip')),
        canCreateCategories: (u.email === ADMIN_EMAIL || (u.roles || []).includes('admin') || (u.roles || []).includes('ml_admin')),
        canLockThreads: (u.email === ADMIN_EMAIL || (u.roles || []).includes('admin') || (u.roles || []).includes('ml_admin')),
        canPinThreads: (u.email === ADMIN_EMAIL || (u.roles || []).includes('admin') || (u.roles || []).includes('ml_admin')),
        canAccessAdmin: (u.email === ADMIN_EMAIL || (u.roles || []).includes('admin'))
    };
}

async function enrichUser(u) {
    const role = await getUserHighestRole(u);
    const rep = await calcReputation(u.uid);
    u.reputation = rep;
    return safeUser(u, role);
}

function safeCategory(c) {
    return {
        id: c.cid, name: c.name, description: c.description || '',
        icon: c.icon || '', color: c.color || '#7c6aef',
        order: c.order || 0, locked: c.locked || false,
        pinned: c.pinned || false,
        threadCount: c.threadCount || 0, lastActivity: c.lastActivity || c.created,
        allowedRoles: c.allowedRoles || [],
        created: c.created
    };
}

function safeThread(t, viewerId, isAdmin) {
    return {
        id: t.tid, categoryId: t.categoryId, categoryName: t.categoryName || '',
        authorId: t.authorId, authorName: t.authorName,
        authorHandle: t.authorHandle, authorAvatar: t.authorAvatar,
        authorRole: t.authorRole || null,
        title: t.title, content: t.content, image: t.image || null, video: t.video || null,
        pinned: t.pinned || false, locked: t.locked || false,
        replyCount: t.replyCount || 0,
        likes: (t.likes || []).length, liked: (t.likes || []).includes(viewerId),
        tags: t.tags || [],
        lastReply: t.lastReply || null,
        isOwn: t.authorId === viewerId,
        created: t.created, updated: t.updated || t.created
    };
}

function safeReply(r, viewerId) {
    return {
        id: r.rid, threadId: r.threadId,
        authorId: r.authorId, authorName: r.authorName,
        authorHandle: r.authorHandle, authorAvatar: r.authorAvatar,
        authorRole: r.authorRole || null,
        content: r.content, image: r.image || null, video: r.video || null,
        likes: (r.likes || []).length, liked: (r.likes || []).includes(viewerId),
        staffTag: r.staffTag || null,
        staffTagColor: r.staffTag ? getTagColor(r.staffTag) : null,
        staffReaction: r.staffReaction || null,
        parentReplyId: r.parentReplyId || null,
        parentReplyAuthor: r.parentReplyAuthor || null,
        isOwn: r.authorId === viewerId,
        edited: r.edited || false,
        created: r.created
    };
}

// ===== AUTH ROUTES =====

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
        const isFirstAdmin = emailLower === ADMIN_EMAIL;
        const user = {
            uid, email: emailLower, password: hashPass(password),
            name: name.trim(), handle: h, bio: '', avatar: null, banner: null,
            roles: isFirstAdmin ? ['admin'] : ['newbie'],
            threadCount: 0, replyCount: 0, reputation: 0,
            created: new Date().toISOString()
        };
        await usersDb.insert(user);
        const token = genToken();
        await sessionsDb.insert({ token, userId: uid, created: new Date().toISOString() });
        const enriched = await enrichUser(user);
        res.json({ token, user: enriched });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка сервера' }); }
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
        const enriched = await enrichUser(user);
        res.json({ token, user: enriched });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/me', auth, async (req, res) => {
    const enriched = await enrichUser(req.user);
    res.json({ user: enriched });
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
        await threadsDb.update({ authorId: req.userId }, { $set: { authorName: updated.name, authorHandle: updated.handle, authorAvatar: updated.avatar } }, { multi: true });
        await repliesDb.update({ authorId: req.userId }, { $set: { authorName: updated.name, authorHandle: updated.handle, authorAvatar: updated.avatar } }, { multi: true });
        const enriched = await enrichUser(updated);
        res.json({ user: enriched });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.delete('/api/account', auth, async (req, res) => {
    try {
        await threadsDb.remove({ authorId: req.userId }, { multi: true });
        await repliesDb.remove({ authorId: req.userId }, { multi: true });
        await reviewsDb.remove({ authorId: req.userId }, { multi: true });
        await reviewsDb.remove({ targetId: req.userId }, { multi: true });
        await sessionsDb.remove({ userId: req.userId }, { multi: true });
        await usersDb.remove({ uid: req.userId });
        res.json({ ok: true });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ===== ROLES =====

app.get('/api/roles', auth, async (req, res) => {
    try {
        const roles = await rolesDb.find({});
        roles.sort(function(a, b) { return b.priority - a.priority; });
        res.json({ roles });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/roles', auth, async (req, res) => {
    try {
        if (!req.isAdmin) return res.status(403).json({ error: 'Только главный админ' });
        const { name, color, priority, permissions } = req.body;
        if (!name) return res.status(400).json({ error: 'Название обязательно' });
        const role = { rid: genId(), name, color: color || '#6b7280', priority: priority || 1, permissions: permissions || ['create_replies'], created: new Date().toISOString() };
        await rolesDb.insert(role);
        res.json({ role });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.put('/api/roles/:id', auth, async (req, res) => {
    try {
        if (!req.isAdmin) return res.status(403).json({ error: 'Только главный админ' });
        const { name, color, priority, permissions } = req.body;
        const update = {};
        if (name !== undefined) update.name = name;
        if (color !== undefined) update.color = color;
        if (priority !== undefined) update.priority = priority;
        if (permissions !== undefined) update.permissions = permissions;
        await rolesDb.update({ rid: req.params.id }, { $set: update });
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.delete('/api/roles/:id', auth, async (req, res) => {
    try {
        if (!req.isAdmin) return res.status(403).json({ error: 'Только главный админ' });
        if (['admin', 'ml_admin', 'watching', 'staff', 'member', 'newbie', 'vip'].includes(req.params.id))
            return res.status(400).json({ error: 'Системную роль нельзя удалить' });
        await rolesDb.remove({ rid: req.params.id });
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ===== CATEGORIES =====

app.get('/api/categories', auth, async (req, res) => {
    try {
        const cats = await categoriesDb.find({});
        cats.sort(function(a, b) {
            if ((a.pinned || false) !== (b.pinned || false)) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
            return (a.order || 0) - (b.order || 0);
        });
        const result = [];
        for (const c of cats) {
            const tc = await threadsDb.count({ categoryId: c.cid });
            c.threadCount = tc;
            result.push(safeCategory(c));
        }
        res.json({ categories: result });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/categories', auth, async (req, res) => {
    try {
        if (!await canCreateCategories(req.user)) return res.status(403).json({ error: 'Нет прав' });
        const { name, description, icon, color, order, allowedRoles } = req.body;
        if (!name) return res.status(400).json({ error: 'Название обязательно' });
        const cat = {
            cid: genId(), name, description: description || '',
            icon: icon || '', color: color || '#7c6aef',
            order: order || 0, locked: false, pinned: false, threadCount: 0,
            allowedRoles: allowedRoles || [],
            lastActivity: new Date().toISOString(),
            created: new Date().toISOString()
        };
        await categoriesDb.insert(cat);
        io.emit('newCategory', safeCategory(cat));
        res.json({ category: safeCategory(cat) });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.put('/api/categories/:id', auth, async (req, res) => {
    try {
        if (!req.isAdmin && !req.isMlAdmin) return res.status(403).json({ error: 'Нет прав' });
        const { name, description, icon, color, order, locked, pinned, allowedRoles } = req.body;
        const update = {};
        if (name !== undefined) update.name = name;
        if (description !== undefined) update.description = description;
        if (icon !== undefined) update.icon = icon;
        if (color !== undefined) update.color = color;
        if (order !== undefined) update.order = order;
        if (locked !== undefined) update.locked = locked;
        if (pinned !== undefined) update.pinned = pinned;
        if (allowedRoles !== undefined) update.allowedRoles = allowedRoles;
        await categoriesDb.update({ cid: req.params.id }, { $set: update });
        const updated = await categoriesDb.findOne({ cid: req.params.id });
        io.emit('updateCategory', safeCategory(updated));
        res.json({ category: safeCategory(updated) });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/categories/:id/pin', auth, async (req, res) => {
    try {
        if (!req.isAdmin) return res.status(403).json({ error: 'Только админ' });
        const cat = await categoriesDb.findOne({ cid: req.params.id });
        if (!cat) return res.status(404).json({ error: 'Не найдено' });
        await categoriesDb.update({ cid: req.params.id }, { $set: { pinned: !cat.pinned } });
        const updated = await categoriesDb.findOne({ cid: req.params.id });
        io.emit('updateCategory', safeCategory(updated));
        res.json({ category: safeCategory(updated) });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.delete('/api/categories/:id', auth, async (req, res) => {
    try {
        if (!req.isAdmin) return res.status(403).json({ error: 'Только админ' });
        const threads = await threadsDb.find({ categoryId: req.params.id });
        for (const t of threads) { await repliesDb.remove({ threadId: t.tid }, { multi: true }); }
        await threadsDb.remove({ categoryId: req.params.id }, { multi: true });
        await categoriesDb.remove({ cid: req.params.id });
        io.emit('deleteCategory', req.params.id);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ===== THREADS =====

app.get('/api/categories/:id/threads', auth, async (req, res) => {
    try {
        const cat = await categoriesDb.findOne({ cid: req.params.id });
        if (!cat) return res.status(404).json({ error: 'Категория не найдена' });
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const total = await threadsDb.count({ categoryId: req.params.id });
        const pinned = await threadsDb.find({ categoryId: req.params.id, pinned: true }).sort({ updated: -1 });
        const regular = await threadsDb.find({ categoryId: req.params.id, $not: { pinned: true } }).sort({ updated: -1 }).skip(skip).limit(limit);
        const threads = [...pinned, ...regular].map(function(t) { return safeThread(t, req.userId, req.isAdmin); });
        res.json({ category: safeCategory(cat), threads, total, page, pages: Math.ceil(total / limit) });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/threads', auth, async (req, res) => {
    try {
        const { categoryId, title, content, image, video, tags } = req.body;
        if (!categoryId || !title || !content) return res.status(400).json({ error: 'Заполните все поля' });
        const cat = await categoriesDb.findOne({ cid: categoryId });
        if (!cat) return res.status(404).json({ error: 'Категория не найдена' });
        if (cat.locked && !await hasPermission(req.user, 'all') && !req.isMlAdmin) return res.status(403).json({ error: 'Категория закрыта' });
        if (!await canCreateThreads(req.user)) return res.status(403).json({ error: 'Нет прав на создание тем' });
        const role = await getUserHighestRole(req.user);
        const thread = {
            tid: genId(), categoryId, categoryName: cat.name,
            authorId: req.userId, authorName: req.user.name,
            authorHandle: req.user.handle, authorAvatar: req.user.avatar,
            authorRole: role,
            title: title.trim(), content, image: image || null, video: video || null,
            pinned: false, locked: false, replyCount: 0,
            likes: [], tags: tags || [],
            lastReply: null,
            created: new Date().toISOString(), updated: new Date().toISOString()
        };
        await threadsDb.insert(thread);
        await usersDb.update({ uid: req.userId }, { $inc: { threadCount: 1 } });
        await categoriesDb.update({ cid: categoryId }, { $set: { lastActivity: new Date().toISOString() } });
        io.emit('newThread', safeThread(thread, req.userId, req.isAdmin));
        res.json({ thread: safeThread(thread, req.userId, req.isAdmin) });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/threads/:id', auth, async (req, res) => {
    try {
        const thread = await threadsDb.findOne({ tid: req.params.id });
        if (!thread) return res.status(404).json({ error: 'Тема не найдена' });
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const totalReplies = await repliesDb.count({ threadId: req.params.id });
        const replies = await repliesDb.find({ threadId: req.params.id }).sort({ created: 1 }).skip(skip).limit(limit);
        const author = await usersDb.findOne({ uid: thread.authorId });
        let authorEnriched = null;
        if (author) authorEnriched = await enrichUser(author);
        res.json({
            thread: safeThread(thread, req.userId, req.isAdmin),
            replies: replies.map(function(r) { return safeReply(r, req.userId); }),
            author: authorEnriched,
            totalReplies, page, totalPages: Math.ceil(totalReplies / limit)
        });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.put('/api/threads/:id', auth, async (req, res) => {
    try {
        const thread = await threadsDb.findOne({ tid: req.params.id });
        if (!thread) return res.status(404).json({ error: 'Не найдено' });
        const canEdit = thread.authorId === req.userId || req.isAdmin || req.isMlAdmin || await hasPermission(req.user, 'mod_threads');
        if (!canEdit) return res.status(403).json({ error: 'Нет прав' });
        const update = {};
        if (req.body.title !== undefined) update.title = req.body.title;
        if (req.body.content !== undefined) update.content = req.body.content;
        if (req.body.image !== undefined) update.image = req.body.image;
        if (req.body.video !== undefined) update.video = req.body.video;
        if (req.body.tags !== undefined) update.tags = req.body.tags;
        update.updated = new Date().toISOString();
        await threadsDb.update({ tid: req.params.id }, { $set: update });
        const updated = await threadsDb.findOne({ tid: req.params.id });
        io.emit('updateThread', safeThread(updated, req.userId, req.isAdmin));
        res.json({ thread: safeThread(updated, req.userId, req.isAdmin) });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.delete('/api/threads/:id', auth, async (req, res) => {
    try {
        const thread = await threadsDb.findOne({ tid: req.params.id });
        if (!thread) return res.status(404).json({ error: 'Не найдено' });
        const canDelete = thread.authorId === req.userId || req.isAdmin || req.isMlAdmin || await hasPermission(req.user, 'mod_threads');
        if (!canDelete) return res.status(403).json({ error: 'Нет прав' });
        await repliesDb.remove({ threadId: req.params.id }, { multi: true });
        await threadsDb.remove({ tid: req.params.id });
        io.emit('deleteThread', req.params.id);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/threads/:id/pin', auth, async (req, res) => {
    try {
        if (!req.isAdmin && !req.isMlAdmin && !await hasPermission(req.user, 'pin_threads')) return res.status(403).json({ error: 'Нет прав' });
        const thread = await threadsDb.findOne({ tid: req.params.id });
        if (!thread) return res.status(404).json({ error: 'Не найдено' });
        await threadsDb.update({ tid: req.params.id }, { $set: { pinned: !thread.pinned } });
        const updated = await threadsDb.findOne({ tid: req.params.id });
        io.emit('updateThread', safeThread(updated, req.userId, req.isAdmin));
        res.json({ thread: safeThread(updated, req.userId, req.isAdmin) });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/threads/:id/lock', auth, async (req, res) => {
    try {
        if (!await canLockThreads(req.user)) return res.status(403).json({ error: 'Нет прав' });
        const thread = await threadsDb.findOne({ tid: req.params.id });
        if (!thread) return res.status(404).json({ error: 'Не найдено' });
        await threadsDb.update({ tid: req.params.id }, { $set: { locked: !thread.locked } });
        const updated = await threadsDb.findOne({ tid: req.params.id });
        io.emit('updateThread', safeThread(updated, req.userId, req.isAdmin));
        res.json({ thread: safeThread(updated, req.userId, req.isAdmin) });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/threads/:id/like', auth, async (req, res) => {
    try {
        const thread = await threadsDb.findOne({ tid: req.params.id });
        if (!thread) return res.status(404).json({ error: 'Не найдено' });
        const likes = thread.likes || [];
        const idx = likes.indexOf(req.userId);
        if (idx === -1) likes.push(req.userId); else likes.splice(idx, 1);
        await threadsDb.update({ tid: req.params.id }, { $set: { likes } });
        const updated = await threadsDb.findOne({ tid: req.params.id });
        io.emit('updateThread', safeThread(updated, req.userId, req.isAdmin));
        res.json({ thread: safeThread(updated, req.userId, req.isAdmin) });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ===== REPLIES =====

app.post('/api/threads/:id/replies', auth, async (req, res) => {
    try {
        const thread = await threadsDb.findOne({ tid: req.params.id });
        if (!thread) return res.status(404).json({ error: 'Не найдено' });
        if (thread.locked && !req.isAdmin && !req.isMlAdmin) return res.status(403).json({ error: 'Тема закрыта' });
        if (!await hasPermission(req.user, 'create_replies') && !await hasPermission(req.user, 'all')) return res.status(403).json({ error: 'Нет прав' });
        const { content, image, video, parentReplyId } = req.body;
        if (!content) return res.status(400).json({ error: 'Ответ пуст' });
        const role = await getUserHighestRole(req.user);
        var parentReplyAuthor = null;
        if (parentReplyId) {
            const parentReply = await repliesDb.findOne({ rid: parentReplyId });
            if (parentReply) parentReplyAuthor = parentReply.authorName;
        }
        const reply = {
            rid: genId(), threadId: req.params.id,
            authorId: req.userId, authorName: req.user.name,
            authorHandle: req.user.handle, authorAvatar: req.user.avatar,
            authorRole: role,
            content, image: image || null, video: video || null,
            staffTag: null, staffReaction: null,
            parentReplyId: parentReplyId || null,
            parentReplyAuthor: parentReplyAuthor,
            likes: [], edited: false,
            created: new Date().toISOString()
        };
        await repliesDb.insert(reply);
        await threadsDb.update({ tid: req.params.id }, {
            $inc: { replyCount: 1 },
            $set: { updated: new Date().toISOString(), lastReply: { authorName: req.user.name, authorHandle: req.user.handle, created: reply.created } }
        });
        await usersDb.update({ uid: req.userId }, { $inc: { replyCount: 1 } });
        await categoriesDb.update({ cid: thread.categoryId }, { $set: { lastActivity: new Date().toISOString() } });
        io.to('thread_' + req.params.id).emit('newReply', { threadId: req.params.id, reply: safeReply(reply, req.userId) });
        res.json({ reply: safeReply(reply, req.userId) });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/replies/:id/tag', auth, async (req, res) => {
    try {
        if (!await canTagReplies(req.user)) return res.status(403).json({ error: 'Нет прав' });
        const { tag } = req.body;
        const available = getAvailableTags(req.user);
        if (!available.includes(tag)) return res.status(403).json({ error: 'Этот тег вам недоступен' });
        const reply = await repliesDb.findOne({ rid: req.params.id });
        if (!reply) return res.status(404).json({ error: 'Не найдено' });
        const newTag = reply.staffTag === tag ? null : tag;
        await repliesDb.update({ rid: req.params.id }, { $set: { staffTag: newTag } });
        const updated = await repliesDb.findOne({ rid: req.params.id });
        io.to('thread_' + reply.threadId).emit('updateReply', safeReply(updated, req.userId));
        res.json({ reply: safeReply(updated, req.userId) });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/replies/:id/react', auth, async (req, res) => {
    try {
        if (!await canReactReplies(req.user)) return res.status(403).json({ error: 'Нет прав' });
        const { reaction } = req.body;
        if (reaction !== 'approved' && reaction !== 'rejected') return res.status(400).json({ error: 'Неверная реакция' });
        const reply = await repliesDb.findOne({ rid: req.params.id });
        if (!reply) return res.status(404).json({ error: 'Не найдено' });
        const newReaction = reply.staffReaction === reaction ? null : reaction;
        await repliesDb.update({ rid: req.params.id }, { $set: { staffReaction: newReaction } });
        const updated = await repliesDb.findOne({ rid: req.params.id });
        io.to('thread_' + reply.threadId).emit('updateReply', safeReply(updated, req.userId));
        res.json({ reply: safeReply(updated, req.userId) });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.delete('/api/replies/:id', auth, async (req, res) => {
    try {
        const reply = await repliesDb.findOne({ rid: req.params.id });
        if (!reply) return res.status(404).json({ error: 'Не найдено' });
        const canDelete = reply.authorId === req.userId || req.isAdmin || req.isMlAdmin || await hasPermission(req.user, 'mod_replies');
        if (!canDelete) return res.status(403).json({ error: 'Нет прав' });
        await repliesDb.remove({ rid: req.params.id });
        await threadsDb.update({ tid: reply.threadId }, { $inc: { replyCount: -1 } });
        io.to('thread_' + reply.threadId).emit('deleteReply', req.params.id);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/replies/:id/like', auth, async (req, res) => {
    try {
        const reply = await repliesDb.findOne({ rid: req.params.id });
        if (!reply) return res.status(404).json({ error: 'Не найдено' });
        const likes = reply.likes || [];
        const idx = likes.indexOf(req.userId);
        if (idx === -1) likes.push(req.userId); else likes.splice(idx, 1);
        await repliesDb.update({ rid: req.params.id }, { $set: { likes } });
        const updated = await repliesDb.findOne({ rid: req.params.id });
        io.to('thread_' + reply.threadId).emit('updateReply', safeReply(updated, req.userId));
        res.json({ reply: safeReply(updated, req.userId) });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ===== REVIEWS =====

app.get('/api/users/:handle/reviews', auth, async (req, res) => {
    try {
        const handle = decodeURIComponent(req.params.handle);
        const target = await usersDb.findOne({ handle });
        if (!target) return res.status(404).json({ error: 'Не найден' });
        const reviews = await reviewsDb.find({ targetId: target.uid }).sort({ created: -1 });
        const enrichedReviews = reviews.map(function(r) {
            return { id: r.revId, authorId: r.authorId, authorName: r.authorName, authorHandle: r.authorHandle, authorAvatar: r.authorAvatar, rating: r.rating, comment: r.comment, image: r.image || null, video: r.video || null, created: r.created };
        });
        const rep = await calcReputation(target.uid);
        res.json({ reviews: enrichedReviews, reputation: rep, total: reviews.length });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/users/:handle/reviews', auth, async (req, res) => {
    try {
        const handle = decodeURIComponent(req.params.handle);
        const target = await usersDb.findOne({ handle });
        if (!target) return res.status(404).json({ error: 'Не найден' });
        if (target.uid === req.userId) return res.status(400).json({ error: 'Нельзя оценить себя' });
        const { rating, comment, image, video } = req.body;
        if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Оценка от 1 до 5' });
        if (!comment) return res.status(400).json({ error: 'Комментарий обязателен' });
        const existing = await reviewsDb.findOne({ authorId: req.userId, targetId: target.uid });
        if (existing) return res.status(400).json({ error: 'Вы уже оставили отзыв' });
        const review = {
            revId: genId(), authorId: req.userId, targetId: target.uid,
            authorName: req.user.name, authorHandle: req.user.handle, authorAvatar: req.user.avatar,
            rating: parseInt(rating), comment, image: image || null, video: video || null,
            created: new Date().toISOString()
        };
        await reviewsDb.insert(review);
        const rep = await calcReputation(target.uid);
        await usersDb.update({ uid: target.uid }, { $set: { reputation: rep } });
        res.json({ ok: true, reputation: rep });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.delete('/api/reviews/:id', auth, async (req, res) => {
    try {
        if (!req.isAdmin) return res.status(403).json({ error: 'Только администраторы' });
        const review = await reviewsDb.findOne({ revId: req.params.id });
        if (!review) return res.status(404).json({ error: 'Не найдено' });
        await reviewsDb.remove({ revId: req.params.id });
        const rep = await calcReputation(review.targetId);
        await usersDb.update({ uid: review.targetId }, { $set: { reputation: rep } });
        res.json({ ok: true, reputation: rep });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ===== SEARCH =====

app.get('/api/search', auth, async (req, res) => {
    try {
        const q = (req.query.q || '').toLowerCase().trim();
        if (!q) return res.json({ threads: [], users: [] });
        const allThreads = await threadsDb.find({});
        const threads = allThreads.filter(function(t) {
            return t.title.toLowerCase().includes(q) || t.content.toLowerCase().includes(q) || (t.tags || []).some(function(tag) { return tag.toLowerCase().includes(q); });
        }).sort(function(a, b) { return new Date(b.created) - new Date(a.created); }).slice(0, 20).map(function(t) { return safeThread(t, req.userId, req.isAdmin); });
        const allUsers = await usersDb.find({});
        const users = [];
        for (const u of allUsers) {
            if (u.name.toLowerCase().includes(q) || u.handle.toLowerCase().includes(q)) users.push(await enrichUser(u));
        }
        res.json({ threads, users: users.slice(0, 10) });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/users/search', auth, async (req, res) => {
    try {
        const q = (req.query.q || '').toLowerCase().trim();
        if (!q) return res.json({ users: [] });
        const all = await usersDb.find({});
        const results = [];
        for (const u of all) {
            if (u.uid === req.userId) continue;
            if (u.name.toLowerCase().includes(q) || u.handle.toLowerCase().includes(q)) results.push(await enrichUser(u));
        }
        res.json({ users: results.slice(0, 20) });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/users/:handle', auth, async (req, res) => {
    try {
        const handle = decodeURIComponent(req.params.handle);
        const target = await usersDb.findOne({ handle });
        if (!target) return res.status(404).json({ error: 'Не найден' });
        const userThreads = await threadsDb.find({ authorId: target.uid }).sort({ created: -1 }).limit(20);
        const enriched = await enrichUser(target);
        res.json({ user: enriched, threads: userThreads.map(function(t) { return safeThread(t, req.userId, req.isAdmin); }) });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ===== ONLINE =====

app.get('/api/online', auth, async (req, res) => {
    try {
        const ids = Array.from(onlineUsers.keys());
        const users = [];
        for (const id of ids) { const u = await usersDb.findOne({ uid: id }); if (u) users.push(await enrichUser(u)); }
        res.json({ users, count: users.length });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ===== ADMIN =====

app.get('/api/admin/stats', auth, async (req, res) => {
    try {
        if (!req.isAdmin) return res.status(403).json({ error: 'Нет прав' });
        res.json({ users: await usersDb.count({}), categories: await categoriesDb.count({}), threads: await threadsDb.count({}), replies: await repliesDb.count({}), sessions: await sessionsDb.count({}) });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.get('/api/admin/users', auth, async (req, res) => {
    try {
        if (!req.isAdmin) return res.status(403).json({ error: 'Нет прав' });
        const all = await usersDb.find({});
        const users = [];
        for (const u of all) users.push(await enrichUser(u));
        res.json({ users });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.put('/api/admin/users/:id', auth, async (req, res) => {
    try {
        if (!req.isAdmin) return res.status(403).json({ error: 'Нет прав' });
        const { name, handle, bio, avatar, banner, roles, reputation } = req.body;
        const update = {};
        if (name !== undefined) update.name = name;
        if (handle !== undefined) update.handle = handle.startsWith('@') ? handle : '@' + handle;
        if (bio !== undefined) update.bio = bio;
        if (avatar !== undefined) update.avatar = avatar;
        if (banner !== undefined) update.banner = banner;
        if (roles !== undefined) update.roles = roles;
        if (reputation !== undefined) update.reputation = reputation;
        await usersDb.update({ uid: req.params.id }, { $set: update });
        const updated = await usersDb.findOne({ uid: req.params.id });
        if (updated) {
            const role = await getUserHighestRole(updated);
            await threadsDb.update({ authorId: req.params.id }, { $set: { authorName: updated.name, authorHandle: updated.handle, authorAvatar: updated.avatar, authorRole: role } }, { multi: true });
            await repliesDb.update({ authorId: req.params.id }, { $set: { authorName: updated.name, authorHandle: updated.handle, authorAvatar: updated.avatar, authorRole: role } }, { multi: true });
        }
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.delete('/api/admin/users/:id', auth, async (req, res) => {
    try {
        if (!req.isAdmin) return res.status(403).json({ error: 'Нет прав' });
        const uid = req.params.id;
        const userThreads = await threadsDb.find({ authorId: uid });
        for (const t of userThreads) await repliesDb.remove({ threadId: t.tid }, { multi: true });
        await threadsDb.remove({ authorId: uid }, { multi: true });
        await repliesDb.remove({ authorId: uid }, { multi: true });
        await reviewsDb.remove({ authorId: uid }, { multi: true });
        await reviewsDb.remove({ targetId: uid }, { multi: true });
        await sessionsDb.remove({ userId: uid }, { multi: true });
        await usersDb.remove({ uid });
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ===== ASSIGN STAFF ROLE (for watching) =====

app.post('/api/users/:id/assign-staff', auth, async (req, res) => {
    try {
        if (!req.isAdmin && !req.isWatching) return res.status(403).json({ error: 'Нет прав' });
        const target = await usersDb.findOne({ uid: req.params.id });
        if (!target) return res.status(404).json({ error: 'Не найден' });
        const roles = target.roles || ['newbie'];
        if (roles.includes('staff')) {
            // remove staff
            const newRoles = roles.filter(function(r) { return r !== 'staff'; });
            if (newRoles.length === 0) newRoles.push('newbie');
            await usersDb.update({ uid: req.params.id }, { $set: { roles: newRoles } });
        } else {
            roles.push('staff');
            const newRoles = roles.filter(function(r) { return r !== 'newbie'; });
            await usersDb.update({ uid: req.params.id }, { $set: { roles: newRoles } });
        }
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// ===== STATIC =====

app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const onlineUsers = new Map();

io.on('connection', (socket) => {
    socket.on('auth', async (token) => {
        const session = await sessionsDb.findOne({ token });
        if (!session) return;
        socket.userId = session.userId;
        onlineUsers.set(session.userId, socket.id);
        io.emit('online', Array.from(onlineUsers.keys()));
        io.emit('onlineCount', onlineUsers.size);
    });
    socket.on('joinThread', (threadId) => { socket.join('thread_' + threadId); });
    socket.on('leaveThread', (threadId) => { socket.leave('thread_' + threadId); });
    socket.on('disconnect', () => {
        if (socket.userId) onlineUsers.delete(socket.userId);
        io.emit('online', Array.from(onlineUsers.keys()));
        io.emit('onlineCount', onlineUsers.size);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('================================');
    console.log('  Wiew LostRP Forum Started');
    console.log('================================');
    console.log('  http://localhost:' + PORT);
    console.log('================================');
    console.log('');
});