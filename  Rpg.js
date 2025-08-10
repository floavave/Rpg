// JRPG Prototype – Canvas (aucune lib externe).
// 3 héros selon ta description + 1 groupe d'ennemis, tour par tour, magies, objets, combo, rage/dragon.

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const actionsEl = document.getElementById('actions');
  const logEl = document.getElementById('log');
  const actorNameEl = document.getElementById('actorName');
  const turnLabel = document.getElementById('turnLabel');
  document.getElementById('resetBtn').onclick = reset;

  const W = canvas.width, H = canvas.height, GROUND = 350;

  // --- Utils ---
  const clamp = (v,min,max)=> v<min?min:(v>max?max:v);
  const pick = arr => arr[Math.floor(Math.random()*arr.length)];
  const R = (a,b)=> Math.random()*(b-a)+a;

  function log(msg){
    const p = document.createElement('div'); p.innerHTML = msg; logEl.prepend(p);
  }
  function bar(x,y,w,h,ratio,color,back='rgba(255,255,255,.12)'){
    ctx.fillStyle = back; ctx.fillRect(x,y,w,h);
    ctx.fillStyle = color; ctx.fillRect(x,y,w*clamp(ratio,0,1),h);
    ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.strokeRect(x,y,w,h);
  }
  function rect(x,y,w,h,r=8){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

  // --- Data personnages (placeholder visuel stylisé) ---
  const heroesBase = [
    { key:'blonde_mage', name:'Yuna', role:'mage', color:'hsl(260 70% 65%)',
      desc:`Femme blonde (<i>cheveux très longs</i>), yeux <b>violet</b> & <b>bleu</b>, style <i>bourgeoise 1990</i>, bâton magique.`,
      maxHp: 110, hp:110, mpMax: 80, mp:80, atk: 12, mag: 26, rageMax:0, rage:0,
      skills:[
        { id:'staff_hit', name:'Coup de bâton', type:'atk', pow: 1.0, costMp:0, target:'enemy' },
        { id:'lumen', name:'Lumen (magie)', type:'mag', pow: 1.4, costMp:10, target:'enemy' },
        { id:'healing', name:'Soin', type:'heal', pow: 1.2, costMp:12, target:'ally' },
      ],
    },
    { key:'brunette_rogue', name:'Rikku', role:'rogue', color:'hsl(20 70% 60%)',
      desc:`Brune <i>sauvage</i>, dagues d'assassin, teint bronzé, yeux noirs profonds, coupe d'amazone, style amazone.`,
      maxHp: 120, hp:120, mpMax: 30, mp:30, atk: 20, mag: 8, rageMax:40, rage:0,
      skills:[
        { id:'dual_strike', name:'Double dague', type:'atk_multi', hits:2, pow: 0.75, costMp:0, target:'enemy' },
        { id:'shadow_step', name:'Pas de l\'ombre', type:'buff_evasion', costMp:8, target:'self' },
        { id:'bleed', name:'Entaille', type:'atk_bleed', pow: 0.9, costMp:6, target:'enemy' },
      ],
    },
    { key:'red_warrior', name:'Auron', role:'warrior', color:'hsl(0 70% 60%)',
      desc:`Homme grand et musclé, cheveux <b>rouges</b>, yeux <b>jaunes profonds</b>. Arme: épée/hache/nunchaku. Peut se <b>transformer en dragon</b> en rage.`,
      maxHp: 160, hp:160, mpMax: 20, mp:20, atk: 26, mag: 6, rageMax:100, rage:0, dragon:false,
      skills:[
        { id:'slash', name:'Entaille d\'épée', type:'atk', pow: 1.2, costMp:0, target:'enemy', rageGain:10 },
        { id:'cleave', name:'Coup de hache', type:'atk', pow: 1.5, costMp:4, target:'enemy', rageGain:15 },
        { id:'nunchaku', name:'Combo nunchaku', type:'atk_multi', hits:3, pow:0.6, costMp:6, target:'enemy', rageGain:12 },
        { id:'dragon_form', name:'Rage du Dragon', type:'transform', costRage:100, target:'self' },
      ],
    },
  ];

  const enemiesPool = [
    { key:'boar', name:'Sanglier', color:'hsl(120 35% 55%)', maxHp: 90, hp:90, atk: 14, mag:0, mpMax:0, mp:0,
      skills:[ {id:'tackle', name:'Charge', type:'atk', pow:1.0, target:'ally'} ] },
    { key:'harpy', name:'Harpie', color:'hsl(200 60% 60%)', maxHp: 110, hp:110, atk:16, mag:0, mpMax:0, mp:0,
      skills:[ {id:'slash', name:'Griffure', type:'atk', pow:1.0, target:'ally'} ] },
    { key:'wyvern', name:'Vouivre', color:'hsl(170 60% 55%)', maxHp: 130, hp:130, atk:18, mag:0, mpMax:0, mp:0,
      skills:[ {id:'bite', name:'Morsure', type:'atk', pow:1.2, target:'ally'} ] },
  ];

  // --- State ---
  let heroes = [];
  let enemies = [];
  let queue = []; // ordre de jeu
  let turn = 0;

  function reset(){
    heroes = JSON.parse(JSON.stringify(heroesBase));
    enemies = [ JSON.parse(JSON.stringify(pick(enemiesPool))) ];
    // positions
    heroes.forEach((h,i)=> h.pos = { x: 140 + i*120, y: GROUND });
    enemies.forEach((e,i)=> e.pos = { x: W-180 - i*120, y: GROUND });
    queue = [...heroes.map(h=>({side:'hero', id:h.key})), ...enemies.map(e=>({side:'enemy', id:e.key}))];
    turn = 1;
    turnLabel.textContent = turn;
    actionsEl.innerHTML = ''; logEl.innerHTML = '';
    render(); updateActions();
    log(`<b>Un ${enemies[0].name}</b> surgit !`);
  }

  function actorObj(){
    const actor = queue[0];
    if (!actor) return null;
    return actor.side==='hero' ? heroes.find(h=>h.key===actor.id) : enemies.find(e=>e.key===actor.id);
  }

  function endTurn(){
    // queue rotate
    queue.push(queue.shift());
    // skip morts
    while (queue.length && !aliveSlot(queue[0])) queue.shift();
    if (!queue.length) return;
    // nouveau tour lorsque l'on revient au 1er acteur héros
    if (queue[0].side==='hero' && queue[0].id===heroes[0].key){ turn++; turnLabel.textContent = turn; }
    updateActions();
    render();
  }

  function aliveSlot(slot){
    const list = slot.side==='hero' ? heroes : enemies;
    const obj = list.find(x=>x.key===slot.id);
    return obj && obj.hp>0;
  }

  // --- Combat helpers ---
  function dmg(attacker, basePow){
    const atk = attacker.atk || 10;
    return Math.round(atk * basePow + R(-3,3));
  }
  function mdmg(attacker, basePow){
    const mag = attacker.mag || 10;
    return Math.round(mag * 6 * basePow + R(-4,4));
  }
  function healPow(caster, basePow){
    return Math.round((caster.mag || 8) * 5 * basePow + R(2,6));
  }

  function isOver(){
    const heroesDead = heroes.every(h=>h.hp<=0);
    const enemiesDead = enemies.every(e=>e.hp<=0);
    if (heroesDead || enemiesDead){
      actionsEl.innerHTML = '';
      log( enemiesDead ? '<b>Victoire !</b>' : '<b>Défaite…</b>');
      return true;
    }
    return false;
  }

  // --- Actions UI ---
  function updateActions(){
    const actor = actorObj();
    if (!actor){ actionsEl.innerHTML=''; return; }
    actorNameEl.textContent = actor.name + (actor.dragon ? ' (Dragon)' : '');

    // Si c'est un ennemi : jouer auto
    if (queue[0].side==='enemy'){
      setTimeout(()=> enemyAct(actor), 600);
      actionsEl.innerHTML = '<em>Ennemi en action…</em>';
      return;
    }

    // Héros : liste des actions
    actionsEl.innerHTML = '';
    const makeBtn = (label, fn, disabled=false, title='') => {
      const b = document.createElement('button'); b.textContent = label; b.disabled = disabled; if (title) b.title = title;
      b.onclick = fn; actionsEl.appendChild(b);
    };

    if (actor.skills){
      for (const s of actor.skills){
        const needsMp = s.costMp && (actor.mp || 0) < s.costMp;
        const needsRage = s.costRage && (actor.rage || 0) < s.costRage;
        makeBtn(s.name, ()=> heroUse(actor, s), !!(needsMp||needsRage),
          needsMp ? `MP insuffisants (${actor.mp}/${s.costMp})` : (needsRage?`Rage insuffisante (${actor.rage}/${s.costRage})`:'') );
      }
    }
    // Objets simples
    makeBtn('Objet: Potion (+40 HP)', ()=> useItem(actor, {id:'potion', heal:40}));
    // Combo si conditions: Rogue + Warrior vivants -> Combo "Assaut croisé"
    const rogueAlive = heroes.find(h=>h.key==='brunette_rogue' && h.hp>0);
    const warAlive = heroes.find(h=>h.key==='red_warrior' && h.hp>0);
    if (rogueAlive && warAlive) makeBtn('Combo: Assaut croisé', ()=> comboCross(rogueAlive, warAlive));
  }

  function useItem(actor, item){
    if (queue[0].side!=='hero') return;
    if (item.id==='potion'){
      const heal = 40;
      actor.hp = clamp(actor.hp + heal, 0, actor.maxHp);
      log(`<b>${actor.name}</b> utilise une potion (+${heal} HP).`);
      if (!isOver()) endTurn();
    }
  }

  function heroUse(actor, skill){
    if (queue[0].side!=='hero') return;
    // coûts
    if (skill.costMp){ actor.mp -= skill.costMp; actor.mp = Math.max(0, actor.mp); }
    if (skill.costRage){ actor.rage -= skill.costRage; actor.rage = Math.max(0, actor.rage); }

    // ciblage par défaut
    let target = enemies.find(e=>e.hp>0);
    if (!target){ isOver(); return; }

    switch (skill.type){
      case 'atk': {
        const d = dmg(actor, skill.pow||1);
        target.hp -= d;
        if (skill.rageGain) actor.rage = clamp((actor.rage||0)+skill.rageGain, 0, actor.rageMax||0);
        log(`<b>${actor.name}</b> frappe ${target.name} (${d} dégâts).`);
        break;
      }
      case 'atk_multi': {
        const hits = skill.hits || 2;
        let total = 0;
        for (let i=0;i<hits;i++){ const dd = dmg(actor, skill.pow||0.6); total += dd; target.hp -= dd; }
        if (skill.rageGain) actor.rage = clamp((actor.rage||0)+skill.rageGain, 0, actor.rageMax||0);
        log(`<b>${actor.name}</b> enchaîne (${hits} coups) sur ${target.name} (${total} dégâts).`);
        break;
      }
      case 'mag': {
        const d = mdmg(actor, skill.pow||1);
        target.hp -= d;
        log(`<b>${actor.name}</b> lance une magie sur ${target.name} (${d} dégâts).`);
        break;
      }
      case 'heal': {
        // soigne l'allié le plus blessé
        const ally = heroes.slice().sort((a,b)=> (a.hp/a.maxHp)-(b.hp/b.maxHp))[0];
        const h = healPow(actor, skill.pow||1);
        ally.hp = clamp(ally.hp + h, 0, ally.maxHp);
        log(`<b>${actor.name}</b> soigne ${ally.name} (+${h} HP).`);
        break;
      }
      case 'buff_evasion': {
        actor.evasion = 0.35; // 35% d'esquive pour 2 tours
        actor.buffTurns = 2;
        log(`<b>${actor.name}</b> devient une ombre : esquive augmentée !`);
        break;
      }
      case 'atk_bleed': {
        const d = dmg(actor, skill.pow||0.9);
        target.hp -= d;
        target.bleed = (target.bleed||0) + 2; // 2 tours de saignement
        log(`<b>${actor.name}</b> entaille ${target.name} (${d} dégâts) → saignement !`);
        break;
      }
      case 'transform': {
        actor.dragon = true;
        actor.atk += 12;
        actor.evasion = 0.15;
        log(`<b>${actor.name}</b> libère la <span style="color:hsl(190 80% 70%)">Rage du Dragon</span> !`);
        break;
      }
    }
    if (!isOver()) endTurn();
    render();
  }

  function enemyAct(enemy){
    if (isOver()) return;
    // bleed tick
    if (enemy.bleed){ enemy.hp -= 6; enemy.bleed--; log(`<i>${enemy.name} saigne… (-6)</i>`); }

    const target = heroes.filter(h=>h.hp>0).sort(()=>Math.random()-0.5)[0];
    if (!target){ isOver(); return; }

    // Esquive ?
    if (target.evasion && Math.random() < target.evasion){
      log(`<b>${enemy.name}</b> attaque mais <b>${target.name}</b> esquive !`);
      target.buffTurns = (target.buffTurns||0)-1;
      if (target.buffTurns<=0) target.evasion = 0;
      endTurn(); render(); return;
    }

    const d = Math.round((enemy.atk||12) * R(0.8,1.2));
    target.hp -= d;
    log(`<b>${enemy.name}</b> touche ${target.name} (${d} dégâts).`);
    if (target.rageMax) target.rage = clamp((target.rage||0) + 12, 0, target.rageMax);
    if (!isOver()) endTurn();
    render();
  }

  function comboCross(rogue, warrior){
    if (queue[0].side!=='hero') return;
    const t = enemies.find(e=>e.hp>0);
    if (!t) return;
    const d1 = Math.round(rogue.atk*0.9 + R(0,6));
    const d2 = Math.round(warrior.atk*1.1 + R(0,8));
    const total = d1 + d2;
    t.hp -= total;
    log(`<b>${rogue.name}</b> & <b>${warrior.name}</b> exécutent <u>Assaut croisé</u> ! (${total} dégâts)`);
    endTurn(); render();
  }

  function drawChar(c){
    // silhouette stylisée (placeholder)
    ctx.save();
    ctx.translate(c.pos.x, c.pos.y);
    // ombre
    ctx.globalAlpha = .35; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(0, 34, 28, 10, 0, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    // corps
    ctx.fillStyle = c.color;
    rect(-22, -44, 44, 66, 10); ctx.fill();
    // tête
    ctx.fillStyle = 'hsl(45 70% 85%)';
    ctx.beginPath(); ctx.arc(0,-56,14,0,Math.PI*2); ctx.fill();
    // cheveux/visage indicatifs
    if (c.key==='blonde_mage'){ ctx.fillStyle = 'hsl(50 80% 70%)'; ctx.fillRect(-16,-66,32,20); ctx.fillRect(-4,-46,8,26); } // cheveux longs
    if (c.key==='brunette_rogue'){ ctx.fillStyle = 'hsl(25 60% 40%)'; ctx.fillRect(-16,-66,28,14); } // coupe amazone courte
    if (c.key==='red_warrior'){ ctx.fillStyle = 'hsl(4 80% 50%)'; ctx.fillRect(-16,-66,32,10); } // cheveux rouges

    // armes
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    if (c.role==='mage'){ ctx.fillRect(18,-28,6,56); } // bâton
    if (c.role==='rogue'){ ctx.fillRect(-30,-8,8,20); ctx.fillRect(22,-8,8,20); } // dagues
    if (c.role==='warrior'){ ctx.fillRect(22,-4,30,6); } // lame type épée

    // aura dragon
    if (c.dragon){ ctx.strokeStyle = 'hsl(190 90% 70%)'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(0,-56,20,0,Math.PI*2); ctx.stroke(); }
    ctx.restore();

    // barres
    bar(c.pos.x-46, c.pos.y+40, 92, 6, c.hp/c.maxHp, 'hsl(0 80% 60%)');
    if (c.mpMax) bar(c.pos.x-46, c.pos.y+50, 92, 6, (c.mp||0)/c.mpMax, 'hsl(240 70% 65%)');
    if (c.rageMax) bar(c.pos.x-46, c.pos.y+60, 92, 6, (c.rage||0)/c.rageMax, 'hsl(45 90% 60%)');
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.font = '12px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(c.name, c.pos.x, c.pos.y+82);
  }

  function render(){
    ctx.clearRect(0,0,W,H);
    // fond cadre
    ctx.fillStyle = 'rgba(255,255,255,.04)'; rect(10,10,W-20,220,14); ctx.fill();
    // sol
    ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(0,GROUND,W,2);

    // ennemis (droite)
    enemies.forEach(e=> drawChar(e));
    // héros (gauche)
    heroes.forEach(h=> drawChar(h));

    // marqueur d'acteur
    const actor = actorObj();
    if (actor){
      ctx.fillStyle = 'rgba(255,255,255,.12)'; rect(actor.pos.x-28, actor.pos.y-60, 56, 94, 10); ctx.fill();
    }
  }

  // --- Init ---
  reset();
})();