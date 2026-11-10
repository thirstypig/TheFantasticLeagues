(function(){
  var views={style:'view-style',flow:'view-flow',screens:'view-screens'};
  function show(){
    var h=(location.hash||'#style').slice(1); if(!views[h]) h='style';
    for(var k in views){document.getElementById(views[k]).hidden=(k!==h);document.getElementById('tab-'+k).setAttribute('aria-current',k===h?'page':'false');}
  }
  addEventListener('hashchange',function(){show();scrollTo(0,0)}); show();

  function store(k,v){try{localStorage.setItem(k,v)}catch(e){}}
  function load(k){try{return localStorage.getItem(k)}catch(e){return null}}

  var fbtns=[].slice.call(document.querySelectorAll('.fontpick button'));
  function pick(b){
    fbtns.forEach(function(x){x.setAttribute('aria-pressed',x===b?'true':'false')});
    document.documentElement.style.setProperty('--ui-font',b.dataset.ui);
    document.documentElement.style.setProperty('--head-font',b.dataset.head);
    store('font3',b.id);
  }
  fbtns.forEach(function(b){b.addEventListener('click',function(){pick(b)})});
  pick(document.getElementById(load('font3'))||fbtns[0]);

  var vb={phone:'vw-phone',desktop:'vw-desktop'};
  function view(v){document.documentElement.setAttribute('data-view',v);for(var k in vb) document.getElementById(vb[k]).setAttribute('aria-pressed',k===v?'true':'false');store('view',v);}
  for(var k1 in vb)(function(k){document.getElementById(vb[k]).addEventListener('click',function(){view(k)})})(k1);
  view(load('view')||(innerWidth<760?'phone':'desktop'));
  [].forEach.call(document.querySelectorAll('.seg.in,.seg.full'),function(g){var bs=[].slice.call(g.querySelectorAll('button'));bs.forEach(function(b){b.addEventListener('click',function(){bs.forEach(function(x){x.setAttribute('aria-pressed',x===b?'true':'false')})})})});

  [].forEach.call(document.querySelectorAll('#ctx-seg button'),function(b){b.addEventListener('click',function(){var c=b.dataset.ctx;[].forEach.call(document.querySelectorAll('.act'),function(a){a.textContent=a.dataset[c]})})});

  var tb={light:'th-light',dark:'th-dark',system:'th-system'};
  function theme(t){
    if(t==='system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme',t);
    for(var k in tb) document.getElementById(tb[k]).setAttribute('aria-pressed',k===t?'true':'false');
    store('theme',t);
  }
  for(var k in tb)(function(k){document.getElementById(tb[k]).addEventListener('click',function(){theme(k)})})(k);
  theme(load('theme')||'system');

  [].forEach.call(document.querySelectorAll('.toggle'),function(t){
    t.addEventListener('click',function(){
      var on=t.getAttribute('aria-checked')!=='true'; t.setAttribute('aria-checked',on?'true':'false');
      if(t.dataset.controls){[].forEach.call(document.querySelectorAll('[data-dep="'+t.dataset.controls+'"]'),function(r){r.classList.toggle('dim',!on)});}
    });
  });
})();
