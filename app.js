var API='',token=localStorage.getItem('wiew_token'),me=null,onlineList=[];
var currentPage='forum',currentCategoryId=null,currentThreadId=null,editingThreadId=null;
var currentThreadPage=1,currentReplyPage=1;
var uploadType=null,uploadData=null,viewingUser=null,pendingAction=null;
var threadImgData=null,threadVidData=null,replyImgData=null,replyVidData=null;
var reviewImgData=null,reviewVidData=null,reviewRating=0;
var socket=null,publishing=false;
var captchaState={login:false,register:false},captchaTarget=null,privacyAccepted=false;
var allCategories=[],allRoles=[];
var replyToId=null,replyToAuthor=null;
var tagSelectorReplyId=null;
var titles={forum:'Форум',members:'Участники',profile:'Профиль',settings:'Настройки',category:'Категория',thread:'Тема'};
var navPages=['forum','members','profile','settings'];

function esc(s){if(!s)return'';var d=document.createElement('div');d.textContent=s;return d.innerHTML}
function timeAgo(d){var s=Math.floor((Date.now()-new Date(d).getTime())/1000);if(s<60)return'только что';if(s<3600)return Math.floor(s/60)+' мин назад';if(s<86400)return Math.floor(s/3600)+' ч назад';if(s<604800)return Math.floor(s/86400)+' дн назад';return new Date(d).toLocaleDateString('ru-RU')}
function toast(m){var t=document.getElementById('toast');t.textContent=m;t.classList.add('show');setTimeout(function(){t.classList.remove('show')},2400)}

async function api(method,url,body){
var o={method:method,headers:{'Content-Type':'application/json'}};
if(token)o.headers['Authorization']=token;
if(body)o.body=JSON.stringify(body);
var r=await fetch(API+url,o);var d=await r.json();
if(!r.ok)throw new Error(d.error||'Error');return d;
}

function readFileAsDataURL(file,cb){var r=new FileReader();r.onload=function(e){cb(e.target.result)};r.readAsDataURL(file)}

// ===== AUTH =====

function switchAuth(tab){
document.querySelectorAll('.auth-tab').forEach(function(t){t.classList.remove('on')});
document.querySelectorAll('.auth-form').forEach(function(f){f.classList.remove('active')});
if(tab==='login'){document.querySelectorAll('.auth-tab')[0].classList.add('on');document.getElementById('loginForm').classList.add('active')}
else{document.querySelectorAll('.auth-tab')[1].classList.add('on');document.getElementById('registerForm').classList.add('active')}
}

function togglePrivacy(){privacyAccepted=!privacyAccepted;document.getElementById('privacyCheck').classList.toggle('checked',privacyAccepted);checkAuthBtns()}

function checkAuthBtns(){
document.getElementById('loginBtn').disabled=!(document.getElementById('loginEmail').value.trim()&&document.getElementById('loginPass').value.trim()&&captchaState.login);
document.getElementById('regBtn').disabled=!(document.getElementById('regName').value.trim()&&document.getElementById('regHandle').value.trim()&&document.getElementById('regEmail').value.trim()&&document.getElementById('regPass').value.trim()&&captchaState.register&&privacyAccepted);
}

document.querySelectorAll('.auth-field input').forEach(function(i){i.addEventListener('input',checkAuthBtns)});

// ===== CAPTCHA =====

var captchaGameType=0;
function openCaptchaGame(target){
if(captchaState[target])return;
captchaTarget=target;captchaGameType=Math.floor(Math.random()*4);
document.getElementById('captchaSkip').style.display='none';
document.getElementById('captchaOv').classList.add('show');startCaptchaGame();
}
function closeCaptcha(){document.getElementById('captchaOv').classList.remove('show')}
function startCaptchaGame(){
var canvas=document.getElementById('captchaCanvas'),ctx=canvas.getContext('2d'),info=document.getElementById('captchaInfo');
canvas.width=300;canvas.height=300;
if(captchaGameType===0)startSliderPuzzle(canvas,ctx,info);
else if(captchaGameType===1)startPathTrace(canvas,ctx,info);
else if(captchaGameType===2)startColorMatch(canvas,ctx,info);
else startRotateGame(canvas,ctx,info);
}
function captchaPassed(){
if(!captchaTarget)return;captchaState[captchaTarget]=true;
document.getElementById(captchaTarget==='login'?'loginCaptcha':'regCaptcha').classList.add('checked');
checkAuthBtns();document.getElementById('captchaSkip').style.display='block';
document.getElementById('captchaInfo').textContent='Проверка пройдена!';setTimeout(closeCaptcha,800);
}

function startSliderPuzzle(canvas,ctx,info){
info.textContent='Перетащите кусок в правильное место';
var pw=60,ph=60,tx=Math.floor(Math.random()*200)+40,ty=Math.floor(Math.random()*200)+40,px=20,py=20,dragging=false,ox=0,oy=0;
function draw(){ctx.clearRect(0,0,300,300);ctx.fillStyle='#1a1a1a';ctx.fillRect(0,0,300,300);for(var i=0;i<6;i++)for(var j=0;j<6;j++){ctx.fillStyle=(i+j)%2===0?'#222':'#2a2a2a';ctx.fillRect(i*50,j*50,50,50)}ctx.strokeStyle='rgba(45,212,160,.5)';ctx.lineWidth=2;ctx.setLineDash([5,5]);ctx.strokeRect(tx,ty,pw,ph);ctx.setLineDash([]);ctx.fillStyle='#7c6aef';ctx.fillRect(px,py,pw,ph);ctx.fillStyle='#fff';ctx.font='bold 14px Inter';ctx.textAlign='center';ctx.fillText('★',px+pw/2,py+ph/2+5)}draw();
canvas.onmousedown=canvas.ontouchstart=function(e){e.preventDefault();var r=canvas.getBoundingClientRect();var cx=((e.touches?e.touches[0].clientX:e.clientX)-r.left)*(300/r.width);var cy=((e.touches?e.touches[0].clientY:e.clientY)-r.top)*(300/r.height);if(cx>=px&&cx<=px+pw&&cy>=py&&cy<=py+ph){dragging=true;ox=cx-px;oy=cy-py}};
canvas.onmousemove=canvas.ontouchmove=function(e){if(!dragging)return;e.preventDefault();var r=canvas.getBoundingClientRect();px=((e.touches?e.touches[0].clientX:e.clientX)-r.left)*(300/r.width)-ox;py=((e.touches?e.touches[0].clientY:e.clientY)-r.top)*(300/r.height)-oy;draw()};
canvas.onmouseup=canvas.ontouchend=function(){if(!dragging)return;dragging=false;if(Math.abs(px-tx)<15&&Math.abs(py-ty)<15){px=tx;py=ty;draw();canvas.onmousedown=canvas.ontouchstart=canvas.onmousemove=canvas.ontouchmove=null;captchaPassed()}};
}

function startPathTrace(canvas,ctx,info){
info.textContent='Проведите линию по точкам по порядку';
var points=[];for(var i=0;i<5;i++)points.push({x:Math.floor(Math.random()*240)+30,y:Math.floor(Math.random()*240)+30,hit:false});
var currentIdx=0,drawing=false,trail=[];
function draw(){ctx.clearRect(0,0,300,300);ctx.fillStyle='#1a1a1a';ctx.fillRect(0,0,300,300);for(var i=0;i<points.length;i++){ctx.beginPath();ctx.arc(points[i].x,points[i].y,18,0,Math.PI*2);ctx.fillStyle=points[i].hit?'#2dd4a0':i===currentIdx?'#7c6aef':'#333';ctx.fill();ctx.fillStyle='#fff';ctx.font='bold 14px Inter';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(''+(i+1),points[i].x,points[i].y)}if(trail.length>1){ctx.beginPath();ctx.moveTo(trail[0].x,trail[0].y);for(var i=1;i<trail.length;i++)ctx.lineTo(trail[i].x,trail[i].y);ctx.strokeStyle='rgba(124,106,239,.6)';ctx.lineWidth=3;ctx.stroke()}}draw();
function getPos(e){var r=canvas.getBoundingClientRect();return{x:((e.touches?e.touches[0].clientX:e.clientX)-r.left)*(300/r.width),y:((e.touches?e.touches[0].clientY:e.clientY)-r.top)*(300/r.height)}}
canvas.onmousedown=canvas.ontouchstart=function(e){e.preventDefault();drawing=true;trail=[];var p=getPos(e);trail.push(p);checkHit(p)};
canvas.onmousemove=canvas.ontouchmove=function(e){if(!drawing)return;e.preventDefault();var p=getPos(e);trail.push(p);checkHit(p);draw()};
canvas.onmouseup=canvas.ontouchend=function(){drawing=false;if(currentIdx<points.length){currentIdx=0;points.forEach(function(p){p.hit=false});trail=[];draw()}};
function checkHit(pos){if(currentIdx>=points.length)return;var p=points[currentIdx];var dx=pos.x-p.x,dy=pos.y-p.y;if(Math.sqrt(dx*dx+dy*dy)<22){p.hit=true;currentIdx++;draw();if(currentIdx>=points.length){canvas.onmousedown=canvas.ontouchstart=canvas.onmousemove=canvas.ontouchmove=null;captchaPassed()}}}
}

function startColorMatch(canvas,ctx,info){
info.textContent='Нажмите на все фиолетовые круги';
var circles=[],target='#7c6aef',colors=['#ef4444','#2dd4a0','#3b82f6','#f59e0b','#7c6aef'],targetCount=0,clicked=0;
for(var i=0;i<12;i++){var c=colors[Math.floor(Math.random()*colors.length)];if(i<3)c=target;circles.push({x:Math.floor(Math.random()*240)+30,y:Math.floor(Math.random()*240)+30,r:20,color:c,found:false});if(c===target)targetCount++}
circles.sort(function(){return Math.random()-.5});
function draw(){ctx.clearRect(0,0,300,300);ctx.fillStyle='#1a1a1a';ctx.fillRect(0,0,300,300);circles.forEach(function(c){if(c.found)return;ctx.beginPath();ctx.arc(c.x,c.y,c.r,0,Math.PI*2);ctx.fillStyle=c.color;ctx.fill();ctx.strokeStyle='rgba(255,255,255,.2)';ctx.lineWidth=1;ctx.stroke()})}draw();
canvas.onmousedown=canvas.ontouchstart=function(e){e.preventDefault();var r=canvas.getBoundingClientRect();var mx=((e.touches?e.touches[0].clientX:e.clientX)-r.left)*(300/r.width);var my=((e.touches?e.touches[0].clientY:e.clientY)-r.top)*(300/r.height);circles.forEach(function(c){if(c.found)return;var dx=mx-c.x,dy=my-c.y;if(Math.sqrt(dx*dx+dy*dy)<c.r+5){if(c.color===target){c.found=true;clicked++;draw();if(clicked>=targetCount){canvas.onmousedown=canvas.ontouchstart=null;captchaPassed()}}else{clicked=0;circles.forEach(function(cc){cc.found=false});draw();info.textContent='Неверно! Нажмите фиолетовые круги'}}})};canvas.onmousemove=canvas.ontouchmove=null;
}

function startRotateGame(canvas,ctx,info){
info.textContent='Нажимайте чтобы повернуть вертикально';
var angle=Math.floor(Math.random()*6+2)*30;
function draw(){ctx.clearRect(0,0,300,300);ctx.fillStyle='#1a1a1a';ctx.fillRect(0,0,300,300);ctx.save();ctx.translate(150,150);ctx.rotate(angle*Math.PI/180);ctx.fillStyle='#7c6aef';ctx.fillRect(-20,-70,40,140);ctx.fillStyle='#9d8ffa';ctx.beginPath();ctx.moveTo(0,-90);ctx.lineTo(-15,-70);ctx.lineTo(15,-70);ctx.closePath();ctx.fill();ctx.restore();ctx.strokeStyle='rgba(45,212,160,.3)';ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(150,30);ctx.lineTo(150,270);ctx.stroke();ctx.setLineDash([])}draw();
canvas.onmousedown=canvas.ontouchstart=function(e){e.preventDefault();angle=(angle+30)%360;draw();if(angle%360===0){canvas.onmousedown=canvas.ontouchstart=null;captchaPassed()}};canvas.onmousemove=canvas.ontouchmove=null;
}

// ===== LOGIN / REGISTER =====

async function doLogin(){
try{document.getElementById('loginError').textContent='';
var d=await api('POST','/api/login',{email:document.getElementById('loginEmail').value.trim(),password:document.getElementById('loginPass').value.trim()});
token=d.token;me=d.user;localStorage.setItem('wiew_token',token);enterApp();
}catch(e){document.getElementById('loginError').textContent=e.message}}

async function doRegister(){
try{document.getElementById('regError').textContent='';
var h=document.getElementById('regHandle').value.trim();if(!h.startsWith('@'))h='@'+h;
var d=await api('POST','/api/register',{name:document.getElementById('regName').value.trim(),handle:h,email:document.getElementById('regEmail').value.trim(),password:document.getElementById('regPass').value.trim()});
token=d.token;me=d.user;localStorage.setItem('wiew_token',token);enterApp();
}catch(e){document.getElementById('regError').textContent=e.message}}

function doLogout(){token=null;me=null;localStorage.removeItem('wiew_token');document.getElementById('authScreen').classList.remove('hidden');document.getElementById('appMain').classList.add('hidden');if(socket)socket.disconnect()}

function confirmDeleteAccount(){
pendingAction=async function(){try{await api('DELETE','/api/account');doLogout();toast('Аккаунт удалён')}catch(e){toast(e.message)}};
document.getElementById('confirmTitle').textContent='Удалить аккаунт?';document.getElementById('confirmText').textContent='Все данные будут удалены навсегда.';document.getElementById('confirmOv').classList.add('show');
}
function confirmAction(){if(pendingAction)pendingAction();pendingAction=null;document.getElementById('confirmOv').classList.remove('show')}
function closeConfirm(){pendingAction=null;document.getElementById('confirmOv').classList.remove('show')}

// ===== ENTER APP =====

async function enterApp(){
document.getElementById('authScreen').classList.add('hidden');document.getElementById('appMain').classList.remove('hidden');
connectSocket();await loadAll();
if(me&&me.canAccessAdmin)document.getElementById('adminGroup').style.display='block';
else document.getElementById('adminGroup').style.display='none';
}

function connectSocket(){
socket=io();
socket.on('connect',function(){socket.emit('auth',token)});
socket.on('online',function(l){onlineList=l});
socket.on('onlineCount',function(c){document.getElementById('onlineCount').textContent=c});
socket.on('newCategory',function(){loadCategories()});
socket.on('updateCategory',function(){loadCategories()});
socket.on('deleteCategory',function(){loadCategories()});
socket.on('newThread',function(t){if(currentPage==='category'&&currentCategoryId===t.categoryId)loadCategoryThreads(currentCategoryId,currentThreadPage)});
socket.on('updateThread',function(t){if(currentPage==='thread'&&currentThreadId===t.id)loadThread(currentThreadId,currentReplyPage);if(currentPage==='category')loadCategoryThreads(currentCategoryId,currentThreadPage)});
socket.on('deleteThread',function(id){if(currentPage==='thread'&&currentThreadId===id)goBackToCategory();if(currentPage==='category')loadCategoryThreads(currentCategoryId,currentThreadPage)});
socket.on('newReply',function(d){if(currentPage==='thread'&&currentThreadId===d.threadId)loadThread(currentThreadId,currentReplyPage)});
socket.on('updateReply',function(){if(currentPage==='thread')loadThread(currentThreadId,currentReplyPage)});
socket.on('deleteReply',function(){if(currentPage==='thread')loadThread(currentThreadId,currentReplyPage)});
}

async function loadAll(){
try{var d=await api('GET','/api/me');me=d.user}catch(e){doLogout();return}
await loadCategories();await loadRoles();renderProfile();updateStats();updateNavBg();updateFab();
}
async function loadCategories(){try{var d=await api('GET','/api/categories');allCategories=d.categories;renderCategories()}catch(e){}}
async function loadRoles(){try{var d=await api('GET','/api/roles');allRoles=d.roles}catch(e){}}

// ===== ICON URLS =====

var ICON_PIN='https://cdn-icons-png.flaticon.com/512/2776/2776000.png';
var ICON_LOCK='https://cdn-icons-png.flaticon.com/512/3064/3064197.png';
var ICON_APPROVED='https://cdn-icons-png.flaticon.com/512/7518/7518748.png';
var ICON_REJECTED='https://cdn-icons-png.flaticon.com/512/753/753345.png';
var ICON_REPLY='https://cdn-icons-png.flaticon.com/512/3031/3031774.png';
var ICON_HEART='https://cdn-icons-png.flaticon.com/512/833/833472.png';
var ICON_HEART_FILLED='https://cdn-icons-png.flaticon.com/512/833/833472.png';
var ICON_TAG='https://cdn-icons-png.flaticon.com/512/1006/1006555.png';
var ICON_DELETE='https://cdn-icons-png.flaticon.com/512/3096/3096673.png';
var ICON_EDIT='https://cdn-icons-png.flaticon.com/512/1159/1159633.png';

// ===== RENDER CATEGORIES =====

function renderCategories(){
var cl=document.getElementById('categoriesList'),ef=document.getElementById('emptyForum');
if(allCategories.length===0){ef.style.display='flex';cl.innerHTML='';return}
ef.style.display='none';cl.innerHTML='';
allCategories.forEach(function(c){
var el=document.createElement('div');el.className='category-card';el.onclick=function(){openCategory(c.id)};
var iconHtml=c.icon?'<img src="'+esc(c.icon)+'" onerror="this.style.display=\'none\'">':'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
var badges='';
if(c.pinned)badges+='<img src="'+ICON_PIN+'" class="cat-badge-icon" title="Закреплено">';
if(c.locked)badges+='<img src="'+ICON_LOCK+'" class="cat-badge-icon" title="Закрыто">';
el.innerHTML='<div class="cat-card-icon" style="background:'+c.color+'20;color:'+c.color+'">'+iconHtml+'</div><div class="cat-card-body"><div class="cat-card-name">'+esc(c.name)+badges+'</div><div class="cat-card-desc">'+esc(c.description)+'</div><div class="cat-card-meta"><span>'+c.threadCount+' тем</span><span>·</span><span>'+timeAgo(c.lastActivity)+'</span></div></div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" class="cat-card-arrow"><polyline points="9 18 15 12 9 6"/></svg>';
cl.appendChild(el);
});
}

// ===== CATEGORY =====

async function openCategory(id){
currentCategoryId=id;currentThreadPage=1;currentPage='category';showPage('category');
document.getElementById('mTitle').textContent='Категория';document.getElementById('catSearchInput').value='';
await loadCategoryThreads(id,1);updateFab();
}

async function loadCategoryThreads(id,page){
try{
var d=await api('GET','/api/categories/'+id+'/threads?page='+(page||1)+'&limit=10');
var cat=d.category;
document.getElementById('catName').textContent=cat.name;document.getElementById('catDesc').textContent=cat.description;
var tl=document.getElementById('threadsList'),et=document.getElementById('emptyThreads');
if(d.threads.length===0&&page===1){et.style.display='flex';tl.innerHTML='';document.getElementById('threadsPagination').innerHTML='';return}
et.style.display='none';tl.innerHTML='';
d.threads.forEach(function(t){tl.appendChild(createThreadCard(t))});
renderPagination('threadsPagination',d.page,d.pages,function(p){currentThreadPage=p;loadCategoryThreads(id,p)});
}catch(e){toast(e.message)}
}

function searchThreadsInCategory(q){
var cards=document.querySelectorAll('#threadsList .thread-card');
var ql=q.toLowerCase();
cards.forEach(function(c){
var title=c.querySelector('.tc-title');
var text=title?title.textContent.toLowerCase():'';
c.style.display=text.includes(ql)?'flex':'none';
});
}

function createThreadCard(t){
var el=document.createElement('div');el.className='thread-card'+(t.pinned?' pinned':'')+(t.locked?' locked':'');
var ava=t.authorAvatar?'<img src="'+t.authorAvatar+'">':esc((t.authorName||'U').charAt(0).toUpperCase());
var roleTag=t.authorRole?'<span class="role-tag" style="color:'+t.authorRole.color+'">'+esc(t.authorRole.name)+'</span>':'';
var tags='';if(t.tags&&t.tags.length>0){tags='<div class="thread-tags">';t.tags.forEach(function(tag){tags+='<span class="thread-tag">'+esc(tag)+'</span>'});tags+='</div>'}
var badges='';
if(t.pinned)badges+='<span class="thread-badge pinned-badge"><img src="'+ICON_PIN+'" class="badge-icon"> Закреп</span>';
if(t.locked)badges+='<span class="thread-badge locked-badge"><img src="'+ICON_LOCK+'" class="badge-icon"> Закрыт</span>';
var lr='';if(t.lastReply)lr='<div class="thread-last-reply">Последний: <span>'+esc(t.lastReply.authorName)+'</span> · '+timeAgo(t.lastReply.created)+'</div>';
el.innerHTML='<div class="tc-left"><div class="tc-ava" onclick="event.stopPropagation();openUserProfile(\''+esc(t.authorHandle)+'\')">'+ava+'</div></div><div class="tc-body"><div class="tc-top"><div class="tc-title">'+esc(t.title)+'</div>'+badges+'</div><div class="tc-author">'+esc(t.authorName)+' '+roleTag+' · '+timeAgo(t.created)+'</div>'+tags+'<div class="tc-stats"><span><img src="'+ICON_REPLY+'" class="stat-icon">'+t.replyCount+'</span><span><img src="'+ICON_HEART+'" class="stat-icon">'+t.likes+'</span></div>'+lr+'</div>';
el.onclick=function(){openThread(t.id)};return el;
}

// ===== THREAD =====

async function openThread(id){
currentThreadId=id;currentReplyPage=1;currentPage='thread';showPage('thread');
document.getElementById('mTitle').textContent='Тема';
if(socket)socket.emit('joinThread',id);
await loadThread(id,1);updateFab();
}

async function loadThread(id,page){
try{
var d=await api('GET','/api/threads/'+id+'?page='+(page||1)+'&limit=10');
var t=d.thread,author=d.author;
document.getElementById('threadTitle').textContent=t.title;
document.getElementById('threadMeta').textContent=t.replyCount+' ответов';
var tc=document.getElementById('threadContent');
var ava=t.authorAvatar?'<img src="'+t.authorAvatar+'">':esc((t.authorName||'U').charAt(0).toUpperCase());
var roleTag=t.authorRole?'<span class="role-tag" style="color:'+t.authorRole.color+'">'+esc(t.authorRole.name)+'</span>':'';
var authorStats=author?'<div class="thread-author-stats"><span>Тем: '+(author.threadCount||0)+'</span><span>Ответов: '+(author.replyCount||0)+'</span><span>Реп: '+(author.reputation||0)+'</span></div>':'';
var mediaHtml='';
if(t.image)mediaHtml+='<img class="thread-body-img" src="'+t.image+'" onclick="openMedia(\'image\',this.src)">';
if(t.video)mediaHtml+='<video class="thread-body-vid" controls><source src="'+t.video+'"></video>';
var tags='';if(t.tags&&t.tags.length>0){tags='<div class="thread-tags">';t.tags.forEach(function(tag){tags+='<span class="thread-tag">'+esc(tag)+'</span>'});tags+='</div>'}

var likeIcon=t.liked?ICON_HEART_FILLED:ICON_HEART;

tc.innerHTML='<div class="thread-op"><div class="thread-op-left"><div class="thread-op-ava" onclick="openUserProfile(\''+esc(t.authorHandle)+'\')">'+ava+'</div><div class="thread-op-author-info"><div class="thread-op-name" onclick="openUserProfile(\''+esc(t.authorHandle)+'\')">'+esc(t.authorName)+'</div>'+roleTag+authorStats+'</div></div><div class="thread-op-body"><div class="thread-op-text">'+formatContent(t.content)+'</div>'+mediaHtml+tags+'<div class="thread-op-bar"><button class="pb'+(t.liked?' liked':'')+'" onclick="likeThread(\''+t.id+'\')"><img src="'+likeIcon+'" class="like-icon'+(t.liked?' liked-icon':'')+'">'+t.likes+'</button><span class="thread-op-date">'+timeAgo(t.created)+'</span></div></div></div>';

// Thread actions
var actions=document.getElementById('threadActions');actions.innerHTML='';
var canEdit=me&&(me.isAdmin||me.isMlAdmin||t.isOwn);
var canPin=me&&(me.canPinThreads);
var canLock=me&&(me.canLockThreads);

if(canEdit){
actions.innerHTML+='<button class="post-act" onclick="editThread(\''+t.id+'\')" title="Редактировать"><img src="'+ICON_EDIT+'" class="act-icon"></button>';
actions.innerHTML+='<button class="post-act" onclick="confirmDeleteThread(\''+t.id+'\')" title="Удалить"><img src="'+ICON_DELETE+'" class="act-icon"></button>';
}
if(canPin){
actions.innerHTML+='<button class="post-act" onclick="togglePin(\''+t.id+'\')" title="Закрепить"><img src="'+ICON_PIN+'" class="act-icon"></button>';
}
if(canLock){
actions.innerHTML+='<button class="post-act" onclick="toggleLock(\''+t.id+'\')" title="'+(t.locked?'Открыть':'Закрыть')+'"><img src="'+ICON_LOCK+'" class="act-icon"></button>';
}

// Replies
document.getElementById('repliesCount').textContent=d.totalReplies;
var rl=document.getElementById('repliesList');rl.innerHTML='';
d.replies.forEach(function(r){rl.appendChild(createReplyEl(r))});
renderPagination('repliesPagination',d.page,d.totalPages,function(p){currentReplyPage=p;loadThread(id,p)});
var ris=document.getElementById('replyInputSection');
if(t.locked&&!(me&&(me.isAdmin||me.isMlAdmin)))ris.style.display='none';else ris.style.display='block';
var rs=document.getElementById('repliesScroll');rs.scrollTop=0;
}catch(e){toast(e.message)}
}

// ===== REPLY ELEMENT =====

function createReplyEl(r){
var el=document.createElement('div');el.className='reply';
var ava=r.authorAvatar?'<img src="'+r.authorAvatar+'">':esc((r.authorName||'U').charAt(0).toUpperCase());
var roleTag=r.authorRole?'<span class="role-tag" style="color:'+r.authorRole.color+'">'+esc(r.authorRole.name)+'</span>':'';
var mediaHtml='';
if(r.image)mediaHtml+='<img class="reply-body-img" src="'+r.image+'" onclick="openMedia(\'image\',this.src)">';
if(r.video)mediaHtml+='<video class="reply-body-vid" controls><source src="'+r.video+'"></video>';
var canDel=r.isOwn||(me&&(me.isAdmin||me.isMlAdmin));
var delBtn=canDel?'<button class="post-act" onclick="event.stopPropagation();confirmDeleteReply(\''+r.id+'\')"><img src="'+ICON_DELETE+'" class="act-icon"></button>':'';

// Staff tag display
var staffTagHtml='';
if(r.staffTag&&r.staffTagColor){
staffTagHtml='<span class="staff-tag-badge" style="background:'+r.staffTagColor.bg+';color:'+r.staffTagColor.color+'">'+esc(r.staffTag)+'</span>';
}

// Staff reaction display
var staffReactionHtml='';
if(r.staffReaction==='approved'){
staffReactionHtml='<span class="staff-reaction-badge approved"><img src="'+ICON_APPROVED+'" class="reaction-badge-icon"> Одобрено</span>';
}else if(r.staffReaction==='rejected'){
staffReactionHtml='<span class="staff-reaction-badge rejected"><img src="'+ICON_REJECTED+'" class="reaction-badge-icon"> Отклонено</span>';
}

// Reply-to banner
var replyToBanner='';
if(r.parentReplyAuthor){
replyToBanner='<div class="reply-parent-ref">↩ Ответ на '+esc(r.parentReplyAuthor)+'</div>';
}

// Tag button (for staff+)
var tagBtn='';
if(me&&me.availableTags&&me.availableTags.length>0){
tagBtn='<button class="post-act tag-act" onclick="event.stopPropagation();openTagSelector(\''+r.id+'\')" title="Тег"><img src="'+ICON_TAG+'" class="act-icon"></button>';
}

// React buttons (approved/rejected for admins/ml_admin/watching)
var reactBtns='';
if(me&&(me.isAdmin||me.isMlAdmin||me.isWatching)){
reactBtns+='<button class="post-act react-act" onclick="event.stopPropagation();reactReply(\''+r.id+'\',\'approved\')" title="Одобрить"><img src="'+ICON_APPROVED+'" class="act-icon"></button>';
reactBtns+='<button class="post-act react-act" onclick="event.stopPropagation();reactReply(\''+r.id+'\',\'rejected\')" title="Отклонить"><img src="'+ICON_REJECTED+'" class="act-icon"></button>';
}

// Reply to reply button
var replyBtn='<button class="post-act" onclick="event.stopPropagation();setReplyTo(\''+r.id+'\',\''+esc(r.authorName)+'\')" title="Ответить"><img src="'+ICON_REPLY+'" class="act-icon"></button>';

var likeIcon=r.liked?ICON_HEART_FILLED:ICON_HEART;

el.innerHTML='<div class="reply-left"><div class="reply-ava" onclick="openUserProfile(\''+esc(r.authorHandle)+'\')">'+ava+'</div></div><div class="reply-body">'+replyToBanner+'<div class="reply-head"><div class="reply-author" onclick="openUserProfile(\''+esc(r.authorHandle)+'\')">'+esc(r.authorName)+'</div>'+roleTag+'<span class="reply-date">'+timeAgo(r.created)+(r.edited?' · изм.':'')+'</span><div class="spacer"></div>'+delBtn+'</div><div class="reply-text">'+formatContent(r.content)+'</div>'+mediaHtml+'<div class="reply-bar"><button class="pb'+(r.liked?' liked':'')+'" onclick="likeReply(\''+r.id+'\')"><img src="'+likeIcon+'" class="like-icon'+(r.liked?' liked-icon':'')+'">'+r.likes+'</button>'+staffTagHtml+staffReactionHtml+replyBtn+tagBtn+reactBtns+'</div></div>';
return el;
}

// ===== FORMAT CONTENT =====

function formatContent(text){
if(!text)return'';var s=esc(text);
s=s.replace(/\n/g,'<br>');
s=s.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
s=s.replace(/\*(.+?)\*/g,'<em>$1</em>');
s=s.replace(/`(.+?)`/g,'<code>$1</code>');
s=s.replace(/#(\S+)/g,'<span class="hashtag">#$1</span>');
return s;
}

// ===== TAG SELECTOR =====

function openTagSelector(replyId){
tagSelectorReplyId=replyId;
var list=document.getElementById('tagSelectorList');list.innerHTML='';
if(!me||!me.availableTags)return;
me.availableTags.forEach(function(tag){
var btn=document.createElement('button');btn.className='tag-selector-item';
var colors=getTagColorClient(tag);
btn.style.background=colors.bg;btn.style.color=colors.color;btn.style.borderColor=colors.color;
btn.textContent=tag;
btn.onclick=function(){applyTag(replyId,tag)};
list.appendChild(btn);
});
document.getElementById('tagSelectorOv').classList.add('show');
}
function closeTagSelectorOv(e){if(e.target===document.getElementById('tagSelectorOv'))closeTagSelector()}
function closeTagSelector(){document.getElementById('tagSelectorOv').classList.remove('show');tagSelectorReplyId=null}

function getTagColorClient(tag){
var colors={
'#одобрено':{bg:'rgba(45,212,160,0.15)',color:'#2dd4a0'},
'#отклонено':{bg:'rgba(239,68,68,0.15)',color:'#ef4444'},
'#забанен':{bg:'rgba(239,68,68,0.2)',color:'#ff6b6b'},
'#принят':{bg:'rgba(59,130,246,0.15)',color:'#3b82f6'},
'#ожидание':{bg:'rgba(245,158,11,0.15)',color:'#f59e0b'},
'#рассмотрено':{bg:'rgba(124,106,239,0.15)',color:'#7c6aef'},
'#отказано':{bg:'rgba(239,68,68,0.15)',color:'#ef4444'}
};
return colors[tag]||{bg:'rgba(255,255,255,0.1)',color:'#999'};
}

async function applyTag(replyId,tag){
try{
await api('POST','/api/replies/'+replyId+'/tag',{tag:tag});
toast('Тег установлен');closeTagSelector();
await loadThread(currentThreadId,currentReplyPage);
}catch(e){toast(e.message)}
}

async function reactReply(replyId,reaction){
try{
await api('POST','/api/replies/'+replyId+'/react',{reaction:reaction});
toast('Реакция обновлена');
await loadThread(currentThreadId,currentReplyPage);
}catch(e){toast(e.message)}
}

// ===== REPLY TO REPLY =====

function setReplyTo(replyId,authorName){
replyToId=replyId;replyToAuthor=authorName;
document.getElementById('replyToBanner').style.display='flex';
document.getElementById('replyToText').textContent='Ответ на: '+authorName;
document.getElementById('replyInput').focus();
}
function cancelReplyTo(){
replyToId=null;replyToAuthor=null;
document.getElementById('replyToBanner').style.display='none';
document.getElementById('replyToText').textContent='';
}

// ===== PAGINATION =====

function renderPagination(containerId,current,total,onPage){
var c=document.getElementById(containerId);c.innerHTML='';
if(total<=1)return;
var html='<div class="pag-wrap">';
if(current>1)html+='<button class="pag-btn" data-action="prev">‹</button>';
for(var i=1;i<=total;i++){
if(total>7&&i>2&&i<total-1&&Math.abs(i-current)>1){if(i===3||i===total-2)html+='<span class="pag-dots">...</span>';continue}
html+='<button class="pag-btn'+(i===current?' on':'')+'" data-p="'+i+'">'+i+'</button>';
}
if(current<total)html+='<button class="pag-btn" data-action="next">›</button>';
html+='</div>';c.innerHTML=html;
c.querySelectorAll('.pag-btn').forEach(function(btn){
btn.addEventListener('click',function(){
if(btn.dataset.action==='prev')onPage(current-1);
else if(btn.dataset.action==='next')onPage(current+1);
else{var p=parseInt(btn.dataset.p);if(p)onPage(p)}
});
});
}

// ===== LIKES =====

async function likeThread(id){try{await api('POST','/api/threads/'+id+'/like');await loadThread(id,currentReplyPage)}catch(e){toast(e.message)}}
async function likeReply(id){try{await api('POST','/api/replies/'+id+'/like');await loadThread(currentThreadId,currentReplyPage)}catch(e){toast(e.message)}}
async function togglePin(id){try{await api('POST','/api/threads/'+id+'/pin');await loadThread(id,currentReplyPage);toast('Обновлено')}catch(e){toast(e.message)}}
async function toggleLock(id){try{await api('POST','/api/threads/'+id+'/lock');await loadThread(id,currentReplyPage);toast('Обновлено')}catch(e){toast(e.message)}}

// ===== DELETE =====

function confirmDeleteThread(id){
pendingAction=async function(){try{await api('DELETE','/api/threads/'+id);toast('Тема удалена');goBackToCategory()}catch(e){toast(e.message)}};
document.getElementById('confirmTitle').textContent='Удалить тему?';document.getElementById('confirmText').textContent='Тема и все ответы будут удалены.';document.getElementById('confirmOv').classList.add('show');
}
function confirmDeleteReply(id){
pendingAction=async function(){try{await api('DELETE','/api/replies/'+id);toast('Ответ удалён');await loadThread(currentThreadId,currentReplyPage)}catch(e){toast(e.message)}};
document.getElementById('confirmTitle').textContent='Удалить ответ?';document.getElementById('confirmText').textContent='Ответ будет удалён.';document.getElementById('confirmOv').classList.add('show');
}

// ===== REPLY MEDIA =====

function previewReplyMedia(e,type){
var f=e.target.files[0];if(!f)return;
var prev=document.getElementById('replyMediaPreview');
if(type==='image'){readFileAsDataURL(f,function(data){replyImgData=data;replyVidData=null;prev.innerHTML='<img src="'+data+'" class="media-thumb"><button class="media-remove" onclick="clearReplyMedia()">✕</button>'})}
else{readFileAsDataURL(f,function(data){replyVidData=data;replyImgData=null;prev.innerHTML='<video src="'+data+'" class="media-thumb" muted></video><button class="media-remove" onclick="clearReplyMedia()">✕</button>'})}
}
function clearReplyMedia(){replyImgData=null;replyVidData=null;document.getElementById('replyMediaPreview').innerHTML='';document.getElementById('replyImgInput').value='';document.getElementById('replyVidInput').value=''}

// ===== SEND REPLY =====

async function sendReply(){
var inp=document.getElementById('replyInput');var t=inp.value.trim();
if(!t&&!replyImgData&&!replyVidData)return;
try{
var body={content:t};
if(replyImgData)body.image=replyImgData;
if(replyVidData)body.video=replyVidData;
if(replyToId)body.parentReplyId=replyToId;
await api('POST','/api/threads/'+currentThreadId+'/replies',body);
inp.value='';clearReplyMedia();cancelReplyTo();
toast('Ответ добавлен');await loadThread(currentThreadId,currentReplyPage);
}catch(e){toast(e.message)}
}

// ===== NEW THREAD =====

function openNewThread(){
editingThreadId=null;threadImgData=null;threadVidData=null;
document.getElementById('threadOvTitle').textContent='Новая тема';
document.getElementById('threadSend').textContent='Опубликовать';
document.getElementById('newThreadTitle').value='';document.getElementById('newThreadContent').value='';
document.getElementById('newThreadTags').value='';document.getElementById('threadMediaPreview').innerHTML='';
document.getElementById('threadOv').classList.add('show');checkThreadSend();
}

function editThread(id){
api('GET','/api/threads/'+id).then(function(d){
var t=d.thread;editingThreadId=id;
document.getElementById('threadOvTitle').textContent='Редактировать';
document.getElementById('threadSend').textContent='Сохранить';
document.getElementById('newThreadTitle').value=t.title;
document.getElementById('newThreadContent').value=t.content;
document.getElementById('newThreadTags').value=(t.tags||[]).join(', ');
var prev=document.getElementById('threadMediaPreview');prev.innerHTML='';
if(t.image){threadImgData=t.image;prev.innerHTML='<img src="'+t.image+'" class="media-thumb">'}
if(t.video){threadVidData=t.video;prev.innerHTML='<video src="'+t.video+'" class="media-thumb" muted></video>'}
document.getElementById('threadOv').classList.add('show');checkThreadSend();
}).catch(function(e){toast(e.message)});
}

function previewThreadMedia(e,type){
var f=e.target.files[0];if(!f)return;var prev=document.getElementById('threadMediaPreview');
if(type==='image'){readFileAsDataURL(f,function(data){threadImgData=data;threadVidData=null;prev.innerHTML='<img src="'+data+'" class="media-thumb"><button class="media-remove" onclick="clearThreadMedia()">✕</button>';checkThreadSend()})}
else{readFileAsDataURL(f,function(data){threadVidData=data;threadImgData=null;prev.innerHTML='<video src="'+data+'" class="media-thumb" muted></video><button class="media-remove" onclick="clearThreadMedia()">✕</button>';checkThreadSend()})}
}
function clearThreadMedia(){threadImgData=null;threadVidData=null;document.getElementById('threadMediaPreview').innerHTML='';document.getElementById('threadImgInput').value='';document.getElementById('threadVidInput').value=''}

function closeThreadOv(e){if(e.target===document.getElementById('threadOv'))document.getElementById('threadOv').classList.remove('show')}
function checkThreadSend(){document.getElementById('threadSend').disabled=!document.getElementById('newThreadTitle').value.trim()||!document.getElementById('newThreadContent').value.trim()}

async function publishThread(){
if(publishing)return;
var title=document.getElementById('newThreadTitle').value.trim();
var content=document.getElementById('newThreadContent').value.trim();
var tagsStr=document.getElementById('newThreadTags').value.trim();
var tags=tagsStr?tagsStr.split(',').map(function(t){return t.trim()}).filter(function(t){return t}):[];
if(!title||!content)return;publishing=true;document.getElementById('threadSend').disabled=true;
try{
if(editingThreadId){
await api('PUT','/api/threads/'+editingThreadId,{title:title,content:content,image:threadImgData,video:threadVidData,tags:tags});
toast('Тема обновлена');await loadThread(editingThreadId,currentReplyPage);
}else{
if(!currentCategoryId){toast('Выберите категорию');publishing=false;return}
await api('POST','/api/threads',{categoryId:currentCategoryId,title:title,content:content,image:threadImgData,video:threadVidData,tags:tags});
toast('Тема создана');await loadCategoryThreads(currentCategoryId,currentThreadPage);
}
document.getElementById('threadOv').classList.remove('show');threadImgData=null;threadVidData=null;editingThreadId=null;
}catch(e){toast(e.message)}publishing=false;
}

// ===== CATEGORY CREATION =====

function openCreateCategory(){
document.getElementById('newCatName').value='';document.getElementById('newCatDesc').value='';
document.getElementById('newCatIcon').value='';document.getElementById('newCatColor').value='#7c6aef';
document.getElementById('newCatOrder').value='0';document.getElementById('catOv').classList.add('show');
}
function closeCatOv(e){if(e.target===document.getElementById('catOv'))document.getElementById('catOv').classList.remove('show')}
async function createCategory(){
var name=document.getElementById('newCatName').value.trim();
if(!name){toast('Введите название');return}
try{
await api('POST','/api/categories',{name:name,description:document.getElementById('newCatDesc').value.trim(),icon:document.getElementById('newCatIcon').value.trim(),color:document.getElementById('newCatColor').value,order:parseInt(document.getElementById('newCatOrder').value)||0});
toast('Категория создана');document.getElementById('catOv').classList.remove('show');await loadCategories();
}catch(e){toast(e.message)}
}

// ===== NAVIGATION =====

function goBackToForum(){currentCategoryId=null;currentPage='forum';showPage('forum');document.getElementById('mTitle').textContent='Форум';updateFab()}
function goBackToCategory(){
if(socket&&currentThreadId)socket.emit('leaveThread',currentThreadId);currentThreadId=null;cancelReplyTo();
if(currentCategoryId){currentPage='category';showPage('category');document.getElementById('mTitle').textContent='Категория';loadCategoryThreads(currentCategoryId,currentThreadPage)}
else goBackToForum();updateFab();
}

async function searchForum(q){
if(!q.trim()){renderCategories();return}
try{
var d=await api('GET','/api/search?q='+encodeURIComponent(q));
var cl=document.getElementById('categoriesList');cl.innerHTML='';
if(d.threads.length===0&&d.users.length===0){cl.innerHTML='<div style="text-align:center;padding:40px;color:var(--text3)">Ничего не найдено</div>';return}
if(d.threads.length>0){cl.innerHTML+='<div class="search-section-title">Темы</div>';d.threads.forEach(function(t){cl.appendChild(createThreadCard(t))})}
if(d.users.length>0){cl.innerHTML+='<div class="search-section-title">Участники</div>';d.users.forEach(function(u){cl.appendChild(createMemberEl(u))})}
}catch(e){}
}

// ===== MEMBERS =====

async function searchMembers(q){
var ml=document.getElementById('membersList');
if(!q.trim()){loadAllMembers();return}
try{var d=await api('GET','/api/users/search?q='+encodeURIComponent(q));ml.innerHTML='';d.users.forEach(function(u){ml.appendChild(createMemberEl(u))});if(d.users.length===0)ml.innerHTML='<div style="text-align:center;padding:40px;color:var(--text3)">Не найдено</div>'}catch(e){}
}

async function loadAllMembers(){
try{var d=await api('GET','/api/online');var ml=document.getElementById('membersList');ml.innerHTML='<div class="members-online-title">Сейчас онлайн ('+d.count+')</div>';d.users.forEach(function(u){ml.appendChild(createMemberEl(u))})}catch(e){}
}

function createMemberEl(u){
var el=document.createElement('div');el.className='member-card';
var ava=u.avatar?'<img src="'+u.avatar+'">':esc(u.name.charAt(0).toUpperCase());
var roleTag=u.role?'<span class="role-tag" style="color:'+u.role.color+'">'+esc(u.role.name)+'</span>':'';
var onlineDot=u.online?'<span class="member-online-dot"></span>':'';
el.innerHTML='<div class="member-ava">'+ava+onlineDot+'</div><div class="member-info"><div class="member-name">'+esc(u.name)+' '+roleTag+'</div><div class="member-handle">'+esc(u.handle)+'</div><div class="member-stats">Тем: '+(u.threadCount||0)+' · Ответов: '+(u.replyCount||0)+' · Реп: '+(u.reputation||0)+'</div></div>';
el.onclick=function(){openUserProfile(u.handle)};return el;
}

// ===== PAGE SWITCHING =====

function showPage(p){document.querySelectorAll('.page').forEach(function(x){x.classList.remove('active')});document.getElementById('p-'+p).classList.add('active');document.getElementById('mScroll').scrollTop=0}

function navTo(p,el){
currentPage=p;if(p==='forum'){currentCategoryId=null;currentThreadId=null}showPage(p);
document.querySelectorAll('.nav-item').forEach(function(x){x.classList.remove('on')});el.classList.add('on');
document.getElementById('mTitle').textContent=titles[p]||p;syncMobileNav(p);updateFab();
if(p==='members')loadAllMembers();if(p==='profile'){renderProfile();loadMyReviews()}
}
function navToM(p,el){
currentPage=p;if(p==='forum'){currentCategoryId=null;currentThreadId=null}showPage(p);
document.querySelectorAll('.ni').forEach(function(x){x.classList.remove('on')});el.classList.add('on');
document.getElementById('mTitle').textContent=titles[p]||p;syncSidebarNav(p);updateFab();
if(p==='members')loadAllMembers();if(p==='profile'){renderProfile();loadMyReviews()}
}
function syncMobileNav(p){document.querySelectorAll('.ni').forEach(function(x,i){x.classList.toggle('on',i===navPages.indexOf(p))})}
function syncSidebarNav(p){document.querySelectorAll('.nav-item').forEach(function(x,i){x.classList.toggle('on',i===navPages.indexOf(p))})}
function updateNavBg(){var it=document.querySelectorAll('.nav-item');document.getElementById('navBg').style.height=(it.length*54+(it.length-1)*6+20)+'px'}

function updateFab(){
var show=false;
if(currentPage==='category'&&currentCategoryId&&me&&me.canCreateThreads)show=true;
if(currentPage==='forum'&&me&&me.canCreateCategories)show=true;
document.getElementById('fabBtn').classList.toggle('visible',show);
}
function onFabClick(){
if(currentPage==='category'&&currentCategoryId)openNewThread();
else if(currentPage==='forum'&&me&&me.canCreateCategories)openCreateCategory();
}

// ===== PROFILE =====

function renderProfile(){
if(!me)return;
var a=document.getElementById('pAva');
if(me.avatar)a.innerHTML='<img src="'+me.avatar+'">';else a.textContent=me.name.charAt(0).toUpperCase();
document.getElementById('pName').textContent=me.name;document.getElementById('pHandle').textContent=me.handle;
var roleEl=document.getElementById('pRole');
if(me.role){roleEl.innerHTML='<span class="role-tag big" style="color:'+me.role.color+';border-color:'+me.role.color+'">'+esc(me.role.name)+'</span>';roleEl.style.display='block'}else roleEl.style.display='none';
var bioEl=document.getElementById('pBio');if(me.bio){bioEl.textContent=me.bio;bioEl.style.display='block'}else{bioEl.textContent='';bioEl.style.display='none'}
var b=document.getElementById('bannerImg');if(me.banner){b.src=me.banner;b.style.display='block'}else b.style.display='none';
}
function updateStats(){if(!me)return;document.getElementById('statThreads').textContent=me.threadCount||0;document.getElementById('statReplies').textContent=me.replyCount||0;document.getElementById('statRep').textContent=me.reputation||0}

async function loadMyReviews(){
try{
var d=await api('GET','/api/users/'+encodeURIComponent(me.handle)+'/reviews');
document.getElementById('statRep').textContent=d.reputation||0;
var rl=document.getElementById('profileReviewsList');rl.innerHTML='';
if(d.reviews.length===0){rl.innerHTML='<div style="text-align:center;padding:30px;color:var(--text3);font-size:13px">Отзывов пока нет</div>';return}
d.reviews.forEach(function(r){rl.appendChild(createReviewEl(r,true))});
}catch(e){}
}

function createReviewEl(r,isOwnProfile){
var el=document.createElement('div');el.className='review-card';
var ava=r.authorAvatar?'<img src="'+r.authorAvatar+'">':esc(r.authorName.charAt(0).toUpperCase());
var stars='';for(var i=1;i<=5;i++)stars+='<span class="rev-star'+(i<=r.rating?' active':'')+'">★</span>';
var media='';
if(r.image)media+='<img class="review-media" src="'+r.image+'" onclick="openMedia(\'image\',this.src)">';
if(r.video)media+='<video class="review-media" controls><source src="'+r.video+'"></video>';
var delBtn='';if(me&&me.isAdmin)delBtn='<button class="post-act" onclick="event.stopPropagation();deleteReview(\''+r.id+'\','+(isOwnProfile?'true':'false')+')"><img src="'+ICON_DELETE+'" class="act-icon"></button>';
el.innerHTML='<div class="review-head"><div class="review-ava" onclick="openUserProfile(\''+esc(r.authorHandle)+'\')">'+ava+'</div><div class="review-info"><div class="review-author">'+esc(r.authorName)+'</div><div class="review-stars-row">'+stars+'</div></div><span class="review-date">'+timeAgo(r.created)+'</span>'+delBtn+'</div><div class="review-comment">'+esc(r.comment)+'</div>'+media;
return el;
}

async function deleteReview(id,isOwn){
pendingAction=async function(){
try{
await api('DELETE','/api/reviews/'+id);toast('Отзыв удалён');
if(isOwn)loadMyReviews();
else if(viewingUser)loadUserReviews(viewingUser.user.handle);
}catch(e){toast(e.message)}
};
document.getElementById('confirmTitle').textContent='Удалить отзыв?';document.getElementById('confirmText').textContent='Отзыв будет удалён вместе с оценкой.';document.getElementById('confirmOv').classList.add('show');
}

// ===== EDIT PROFILE =====

function openEditProfile(){document.getElementById('editName').value=me.name;document.getElementById('editHandle').value=me.handle;document.getElementById('editBio').value=me.bio||'';document.getElementById('editOv').classList.add('show')}
function closeEditOv(e){if(e.target===document.getElementById('editOv'))closeEdit()}
function closeEdit(){document.getElementById('editOv').classList.remove('show')}
async function saveProfile(){var n=document.getElementById('editName').value.trim(),h=document.getElementById('editHandle').value.trim(),b=document.getElementById('editBio').value.trim();if(!n){toast('Имя обязательно');return}try{var d=await api('PUT','/api/profile',{name:n,handle:h,bio:b});me=d.user;renderProfile();updateStats();closeEdit();toast('Профиль обновлён')}catch(e){toast(e.message)}}
function shareProfile(){if(navigator.share)navigator.share({title:me.name,url:location.href});else navigator.clipboard.writeText(location.href).then(function(){toast('Скопировано')}).catch(function(){})}

// ===== UPLOAD =====

function openUpload(type){uploadType=type;uploadData=null;document.getElementById('uploadTitle').textContent=type==='avatar'?'Фото профиля':'Обложка';document.getElementById('uploadPreview').classList.toggle('banner',type==='banner');document.getElementById('uploadPreviewImg').style.display='none';document.getElementById('uploadPreview').querySelector('svg').style.display='block';document.getElementById('uploadInput').value='';document.getElementById('uploadOv').classList.add('show')}
function closeUploadOv(e){if(e.target===document.getElementById('uploadOv'))closeUpload()}
function closeUpload(){document.getElementById('uploadOv').classList.remove('show')}
function previewUpload(e){var f=e.target.files[0];if(!f)return;readFileAsDataURL(f,function(data){uploadData=data;var i=document.getElementById('uploadPreviewImg');i.src=data;i.style.display='block';document.getElementById('uploadPreview').querySelector('svg').style.display='none'})}
async function saveUpload(){if(!uploadData){toast('Выберите фото');return}try{var body={};if(uploadType==='avatar')body.avatar=uploadData;else body.banner=uploadData;var d=await api('PUT','/api/profile',body);me=d.user;renderProfile();closeUpload();toast('Фото обновлено')}catch(e){toast(e.message)}}

// ===== USER PROFILE VIEW =====

async function openUserProfile(handle){
if(!handle)return;
if(handle===me.handle){navTo('profile',document.querySelectorAll('.nav-item')[2]);syncMobileNav('profile');renderProfile();loadMyReviews();return}
try{
var d=await api('GET','/api/users/'+encodeURIComponent(handle));viewingUser=d;var u=d.user;
var ae=document.getElementById('profileShAva');if(u.avatar)ae.innerHTML='<img src="'+u.avatar+'">';else ae.textContent=u.name.charAt(0).toUpperCase();
var be=document.getElementById('profileShBanner');if(u.banner)be.innerHTML='<img src="'+u.banner+'">';else be.innerHTML='';
document.getElementById('profileShName').textContent=u.name;document.getElementById('profileShHandle').textContent=u.handle;
var roleEl=document.getElementById('profileShRole');
if(u.role){roleEl.innerHTML='<span class="role-tag big" style="color:'+u.role.color+';border-color:'+u.role.color+'">'+esc(u.role.name)+'</span>';roleEl.style.display='block'}else roleEl.style.display='none';
document.getElementById('profileShBio').textContent=u.bio||'';
document.getElementById('profileShThreads').textContent=u.threadCount||0;
document.getElementById('profileShReplies').textContent=u.replyCount||0;
document.getElementById('profileShRep').textContent=u.reputation||0;
await loadUserReviews(handle);
document.getElementById('profileOv').classList.add('show');
}catch(e){toast(e.message)}
}

async function loadUserReviews(handle){
try{
var d=await api('GET','/api/users/'+encodeURIComponent(handle)+'/reviews');
document.getElementById('profileShRep').textContent=d.reputation||0;
var rl=document.getElementById('profileShReviews');rl.innerHTML='';
if(d.reviews.length>0){rl.innerHTML='<div class="profile-sh-reviews-title">Отзывы ('+d.total+')</div>';d.reviews.forEach(function(r){rl.appendChild(createReviewEl(r,false))})}
else rl.innerHTML='<div style="text-align:center;padding:20px;color:var(--text3);font-size:12px">Отзывов нет</div>';
var form=document.getElementById('profileShReviewForm');form.innerHTML='';
if(viewingUser&&viewingUser.user.id!==me.id){
var alreadyReviewed=d.reviews.some(function(r){return r.authorId===me.id});
if(!alreadyReviewed){
form.innerHTML='<div class="profile-sh-reviews-title">Оставить отзыв</div><div class="review-rating-row"><span>Оценка:</span><div class="review-stars" id="profileReviewStars"><span class="rev-star" onclick="setProfileReviewRating(1)">★</span><span class="rev-star" onclick="setProfileReviewRating(2)">★</span><span class="rev-star" onclick="setProfileReviewRating(3)">★</span><span class="rev-star" onclick="setProfileReviewRating(4)">★</span><span class="rev-star" onclick="setProfileReviewRating(5)">★</span></div></div><textarea id="profileReviewComment" placeholder="Ваш отзыв..." rows="2"></textarea><div class="review-media-row"><div class="sh-t" onclick="document.getElementById(\'profileReviewImgInput\').click()"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div><div class="sh-t" onclick="document.getElementById(\'profileReviewVidInput\').click()"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg></div><input type="file" id="profileReviewImgInput" accept="image/*" style="display:none" onchange="previewProfileReviewMedia(event,\'image\')"><input type="file" id="profileReviewVidInput" accept="video/*" style="display:none" onchange="previewProfileReviewMedia(event,\'video\')"><div id="profileReviewMediaPreview" class="review-media-preview"></div><button class="sh-send" onclick="submitProfileReview()">Отправить</button></div>';
}
}
}catch(e){}
}

var profileReviewRating=0,profileReviewImgData=null,profileReviewVidData=null;
function setProfileReviewRating(n){profileReviewRating=n;document.querySelectorAll('#profileReviewStars .rev-star').forEach(function(s,i){s.classList.toggle('active',i<n)})}
function previewProfileReviewMedia(e,type){
var f=e.target.files[0];if(!f)return;var prev=document.getElementById('profileReviewMediaPreview');
if(type==='image'){readFileAsDataURL(f,function(data){profileReviewImgData=data;profileReviewVidData=null;prev.innerHTML='<img src="'+data+'" class="media-thumb">'})}
else{readFileAsDataURL(f,function(data){profileReviewVidData=data;profileReviewImgData=null;prev.innerHTML='<video src="'+data+'" class="media-thumb" muted></video>'})}
}
async function submitProfileReview(){
if(profileReviewRating<1){toast('Выберите оценку');return}
var comment=document.getElementById('profileReviewComment').value.trim();
if(!comment){toast('Напишите отзыв');return}
if(!viewingUser)return;
try{
await api('POST','/api/users/'+encodeURIComponent(viewingUser.user.handle)+'/reviews',{rating:profileReviewRating,comment:comment,image:profileReviewImgData,video:profileReviewVidData});
toast('Отзыв отправлен');profileReviewRating=0;profileReviewImgData=null;profileReviewVidData=null;
await loadUserReviews(viewingUser.user.handle);
}catch(e){toast(e.message)}
}

function closeProfileOv(e){if(e.target===document.getElementById('profileOv'))closeProfileView()}
function closeProfileView(){document.getElementById('profileOv').classList.remove('show');viewingUser=null}

// ===== MEDIA VIEWER =====

function openMedia(type,src){
if(type==='image'){document.getElementById('imgOvImg').src=src;document.getElementById('imgOvImg').style.display='block';document.getElementById('imgOvVid').style.display='none'}
else{document.getElementById('imgOvVid').src=src;document.getElementById('imgOvVid').style.display='block';document.getElementById('imgOvImg').style.display='none'}
document.getElementById('imgOv').classList.add('show');
}
function closeImgOv(){document.getElementById('imgOv').classList.remove('show');document.getElementById('imgOvVid').pause()}

// ===== ADMIN PANEL =====

async function openAdmin(){
document.getElementById('adminOv').classList.add('show');
try{var s=await api('GET','/api/admin/stats');document.getElementById('adminStats').innerHTML='<div class="admin-stat-row"><div class="admin-stat-card"><div class="admin-stat-val">'+s.users+'</div><div class="admin-stat-lbl">Пользователи</div></div><div class="admin-stat-card"><div class="admin-stat-val">'+s.categories+'</div><div class="admin-stat-lbl">Категории</div></div><div class="admin-stat-card"><div class="admin-stat-val">'+s.threads+'</div><div class="admin-stat-lbl">Темы</div></div><div class="admin-stat-card"><div class="admin-stat-val">'+s.replies+'</div><div class="admin-stat-lbl">Ответы</div></div></div>'}catch(e){}
loadAdminUsers();
}
function closeAdminOv(e){if(e.target===document.getElementById('adminOv'))closeAdmin()}
function closeAdmin(){document.getElementById('adminOv').classList.remove('show')}
function switchAdminTab(tab,el){document.querySelectorAll('.admin-tab').forEach(function(t){t.classList.remove('on')});el.classList.add('on');if(tab==='users')loadAdminUsers();else if(tab==='categories')loadAdminCategories();else loadAdminRoles()}

async function loadAdminUsers(){
var body=document.getElementById('adminBody');
try{var d=await api('GET','/api/admin/users');body.innerHTML='';d.users.forEach(function(u){
var el=document.createElement('div');el.className='admin-user';
var ava=u.avatar?'<img src="'+u.avatar+'">':esc(u.name.charAt(0).toUpperCase());
var roleTag=u.role?'<span class="role-tag" style="color:'+u.role.color+'">'+esc(u.role.name)+'</span>':'';
el.innerHTML='<div class="admin-user-ava">'+ava+'</div><div class="admin-user-info"><div class="admin-user-name">'+esc(u.name)+' '+roleTag+'</div><div class="admin-user-email">'+esc(u.email)+'</div><div class="admin-user-meta">Роли: '+(u.roles||['newbie']).join(', ')+'</div></div><div class="admin-user-actions"><button class="admin-btn edit" onclick="adminEditUserRoles(\''+u.id+'\',\''+(u.roles||['newbie']).join(',')+'\')">Роли</button><button class="admin-btn del" onclick="adminDeleteUser(\''+u.id+'\',\''+esc(u.name)+'\')">Удл.</button></div>';
body.appendChild(el)})}catch(e){body.innerHTML='<div style="padding:20px;color:var(--text3)">Ошибка</div>'}
}

async function loadAdminCategories(){
var body=document.getElementById('adminBody');body.innerHTML='';
try{var d=await api('GET','/api/categories');d.categories.forEach(function(c){
var el=document.createElement('div');el.className='admin-post';
var pinLabel=c.pinned?'Открепить':'Закрепить';
var lockLabel=c.locked?'Открыть':'Закрыть';
el.innerHTML='<div class="admin-post-head"><strong>'+esc(c.name)+'</strong><span style="color:var(--text3);margin-left:auto;font-size:11px">'+c.threadCount+' тем</span></div><div class="admin-post-text">'+esc(c.description||'Без описания')+'</div><div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap"><button class="admin-btn edit" onclick="adminEditCategory(\''+c.id+'\')">Изм.</button><button class="admin-btn edit" onclick="adminToggleCatLock(\''+c.id+'\','+c.locked+')">'+lockLabel+'</button><button class="admin-btn edit" onclick="adminToggleCatPin(\''+c.id+'\')">'+pinLabel+'</button><button class="admin-btn del" onclick="adminDeleteCategory(\''+c.id+'\',\''+esc(c.name)+'\')">Удалить</button></div>';
body.appendChild(el)})}catch(e){}
}

async function loadAdminRoles(){
var body=document.getElementById('adminBody');body.innerHTML='<button class="admin-btn edit" style="margin-bottom:12px;height:40px;padding:0 20px;font-size:13px" onclick="adminCreateRole()">+ Новая роль</button>';
try{var d=await api('GET','/api/roles');d.roles.forEach(function(r){
var el=document.createElement('div');el.className='admin-post';
el.innerHTML='<div class="admin-post-head"><strong style="color:'+r.color+'">'+esc(r.name)+'</strong><span style="color:var(--text3);margin-left:auto;font-size:11px">P:'+r.priority+'</span></div><div class="admin-post-text">'+((r.permissions||[]).join(', '))+'</div><div style="display:flex;gap:6px;margin-top:8px"><button class="admin-btn edit" onclick="adminEditRole(\''+r.rid+'\',\''+esc(r.name)+'\',\''+r.color+'\','+r.priority+',\''+(r.permissions||[]).join(',')+'\')">Изм.</button><button class="admin-btn del" onclick="adminDeleteRole(\''+r.rid+'\',\''+esc(r.name)+'\')">Удл.</button></div>';
body.appendChild(el)})}catch(e){}
}

function adminEditUserRoles(id,cur){var r=prompt('Роли (через запятую):',cur);if(r===null)return;var roles=r.split(',').map(function(x){return x.trim()}).filter(function(x){return x});api('PUT','/api/admin/users/'+id,{roles:roles}).then(function(){toast('Обновлено');loadAdminUsers()}).catch(function(e){toast(e.message)})}
function adminDeleteUser(id,name){pendingAction=async function(){try{await api('DELETE','/api/admin/users/'+id);toast('Удалён');loadAdminUsers()}catch(e){toast(e.message)}};document.getElementById('confirmTitle').textContent='Удалить?';document.getElementById('confirmText').textContent='Удалить '+name+'?';document.getElementById('confirmOv').classList.add('show')}
function adminEditCategory(id){var name=prompt('Название:');if(!name)return;var desc=prompt('Описание:','');api('PUT','/api/categories/'+id,{name:name,description:desc||''}).then(function(){toast('Обновлено');loadAdminCategories();loadCategories()}).catch(function(e){toast(e.message)})}
function adminToggleCatLock(id,locked){api('PUT','/api/categories/'+id,{locked:!locked}).then(function(){toast('Обновлено');loadAdminCategories();loadCategories()}).catch(function(e){toast(e.message)})}
function adminToggleCatPin(id){api('POST','/api/categories/'+id+'/pin').then(function(){toast('Обновлено');loadAdminCategories();loadCategories()}).catch(function(e){toast(e.message)})}
function adminDeleteCategory(id,name){pendingAction=async function(){try{await api('DELETE','/api/categories/'+id);toast('Удалена');loadAdminCategories();loadCategories()}catch(e){toast(e.message)}};document.getElementById('confirmTitle').textContent='Удалить категорию?';document.getElementById('confirmText').textContent=name+' и все темы будут удалены.';document.getElementById('confirmOv').classList.add('show')}
function adminCreateRole(){var name=prompt('Название:');if(!name)return;var color=prompt('Цвет:','#6b7280');var priority=prompt('Приоритет:','1');var perms=prompt('Права (через запятую):','create_replies');if(!perms)return;var permissions=perms.split(',').map(function(p){return p.trim()}).filter(function(p){return p});api('POST','/api/roles',{name:name,color:color||'#6b7280',priority:parseInt(priority)||1,permissions:permissions}).then(function(){toast('Создана');loadAdminRoles();loadRoles()}).catch(function(e){toast(e.message)})}
function adminEditRole(id,name,color,priority,perms){var n=prompt('Название:',name);if(!n)return;var c=prompt('Цвет:',color);var p=prompt('Приоритет:',priority);var pp=prompt('Права:',perms);if(!pp)return;api('PUT','/api/roles/'+id,{name:n,color:c,priority:parseInt(p)||1,permissions:pp.split(',').map(function(x){return x.trim()}).filter(function(x){return x})}).then(function(){toast('Обновлена');loadAdminRoles();loadRoles()}).catch(function(e){toast(e.message)})}
function adminDeleteRole(id,name){pendingAction=async function(){try{await api('DELETE','/api/roles/'+id);toast('Удалена');loadAdminRoles();loadRoles()}catch(e){toast(e.message)}};document.getElementById('confirmTitle').textContent='Удалить роль?';document.getElementById('confirmText').textContent=name;document.getElementById('confirmOv').classList.add('show')}

// ===== LEGAL =====

var legalContent={
privacy:{title:'Политика конфиденциальности',body:'<h4>1. Сбор данных</h4><ul><li>Email для идентификации</li><li>Имя и никнейм</li><li>Медиа файлы</li><li>Публикации на форуме</li></ul><h4>2. Использование</h4><ul><li>Работа форума</li><li>Персонализация</li><li>Улучшение сервиса</li></ul><h4>3. Защита</h4><ul><li>Шифрование паролей</li><li>Защищённое соединение</li></ul><h4>4. Права</h4><ul><li>Удаление аккаунта</li><li>Изменение данных</li></ul>'},
terms:{title:'Условия использования',body:'<h4>1. Правила</h4><ul><li>Запрещён спам</li><li>Запрещён незаконный контент</li><li>Запрещены оскорбления</li></ul><h4>2. Контент</h4><ul><li>Ответственность на авторе</li><li>Модерация контента</li></ul><h4>3. Аккаунт</h4><ul><li>Один аккаунт на человека</li><li>Блокировка за нарушения</li></ul>'}
};
function openLegal(t){var c=legalContent[t];if(!c)return;document.getElementById('legalTitle').textContent=c.title;document.getElementById('legalBody').innerHTML=c.body;document.getElementById('legalOv').classList.add('show')}
function closeLegalOv(e){if(e.target===document.getElementById('legalOv'))closeLegal()}
function closeLegal(){document.getElementById('legalOv').classList.remove('show')}

// ===== INIT =====

async function checkAuth(){if(!token){document.getElementById('authScreen').classList.remove('hidden');document.getElementById('appMain').classList.add('hidden');return}try{var d=await api('GET','/api/me');me=d.user;enterApp()}catch(e){localStorage.removeItem('wiew_token');token=null;document.getElementById('authScreen').classList.remove('hidden');document.getElementById('appMain').classList.add('hidden')}}
checkAuth();
