(() => {
  const $ = (id)=>document.getElementById(id);
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp = (a,b,t)=>a+(b-a)*t;

  function log(msg){
    $("log").textContent = (msg + "\n" + $("log").textContent).slice(0, 12000);
  }
  function ms(){ return performance.now(); }

  function randn(){
    let u=0,v=0;
    while(u===0) u=Math.random();
    while(v===0) v=Math.random();
    return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
  }

  const SCALE=5, W=180, H=130;
  const view=$("view");
  view.width=W*SCALE; view.height=H*SCALE;
  const vctx=view.getContext("2d");
  vctx.imageSmoothingEnabled=false;

  const low=document.createElement("canvas");
  low.width=W; low.height=H;
  const g=low.getContext("2d");
  g.imageSmoothingEnabled=false;

  const keys=new Set();
  window.addEventListener("keydown",(e)=>{
    if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
    keys.add(e.key);
  },{passive:false});
  window.addEventListener("keyup",(e)=>keys.delete(e.key));

  function loadDS(){
    try { return JSON.parse(localStorage.getItem("retro_ds_onefile_v4")||"{}")||{}; }
    catch { return {}; }
  }
  function saveDS(ds){
    localStorage.setItem("retro_ds_onefile_v4", JSON.stringify(ds));
  }
  let DS = loadDS();
  const dsFor = (env)=> (DS[env] ||= {X:[], Y:[]});
  function capDataset(envName, maxN=25000){
    const ds=dsFor(envName);
    if(ds.X.length > maxN){
      const cut = ds.X.length - maxN;
      ds.X.splice(0, cut);
      ds.Y.splice(0, cut);
    }
  }

  class CarEnv {
    constructor(){ this.name="car"; this.reset(); }
    reset(){
      this.track={cx:W*0.52, cy:H*0.56, rIn:26, rOut:54};
      this.x=this.track.cx+(this.track.rIn+this.track.rOut)/2;
      this.y=this.track.cy;
      this.v=0;
      this.yaw=-Math.PI/2;
      this.yawRate=0;
      this.steer=0;
      this.throttle=0;
      this.off=0;

      this.bestLapMs=null;
      this.lapStart=ms();
      this.lastAngle=this.angleAround();
    }
    angleAround(){ return Math.atan2(this.y-this.track.cy, this.x-this.track.cx); }
    onTrack(){
      const dx=this.x-this.track.cx, dy=this.y-this.track.cy;
      const r=Math.hypot(dx,dy);
      return r>=this.track.rIn && r<=this.track.rOut;
    }
    features(){
      const dx=(this.x-this.track.cx)/this.track.rOut;
      const dy=(this.y-this.track.cy)/this.track.rOut;
      const sinA=Math.sin(this.yaw), cosA=Math.cos(this.yaw);
      const ok=this.onTrack()?1:0;
      const r=Math.hypot(this.x-this.track.cx, this.y-this.track.cy);
      const mid=(this.track.rIn+this.track.rOut)/2;
      const radialErr=(r-mid)/(this.track.rOut-this.track.rIn);
      return [dx,dy,this.v/8,sinA,cosA,radialErr,ok];
    }
    manual(keys){
      let s=0;
      if(keys.has("ArrowLeft")) s-=1;
      if(keys.has("ArrowRight")) s+=1;

      let t=0;
      if(keys.has("ArrowUp")) t+=1;
      if(keys.has("ArrowDown")) t-=1;

      s=lerp(this.steer,s,0.35);
      t=lerp(this.throttle,t,0.30);
      return [clamp(s,-1,1), clamp(t,-1,1)];
    }
    step(a, dt){
      const steer=a[0], thr=a[1];
      this.steer=clamp(steer,-1,1);
      this.throttle=clamp(thr,-1,1);

      const grip=this.onTrack()?1.0:0.65;
      const maxSteer=0.75;
      const steerAng=this.steer*maxSteer;
      const wheelBase=10.0;
      const yawRateTarget=(this.v/wheelBase)*Math.tan(steerAng)*2.2*grip;
      this.yawRate=lerp(this.yawRate,yawRateTarget,0.35);
      this.yaw+=this.yawRate*dt*60;

      const accel=(this.throttle>=0)?(0.11*this.throttle):(0.16*this.throttle);
      this.v+=accel*dt*60;

      const drag=this.onTrack()?0.985:0.975;
      this.v*=Math.pow(drag,dt*60);
      this.v=clamp(this.v,-2.5,this.onTrack()?8.5:6.0);

      this.x+=Math.cos(this.yaw)*this.v*dt*60;
      this.y+=Math.sin(this.yaw)*this.v*dt*60;
      this.x=clamp(this.x,4,W-4);
      this.y=clamp(this.y,4,H-4);

      this.off=this.onTrack()?Math.max(0,this.off-dt*2):Math.min(1,this.off+dt*2);

      const ang=this.angleAround();
      const prev=this.lastAngle;
      this.lastAngle=ang;
      const crossed = (prev < -2.7 && ang > 2.7);
      if(crossed && this.onTrack() && Math.abs(this.v)>2.2){
        const lap=Math.round(ms()-this.lapStart);
        this.lapStart=ms();
        if(this.bestLapMs===null || lap<this.bestLapMs){
          this.bestLapMs=lap;
          log("NEW BEST LAP: " + lap + " ms");
        } else {
          log("Lap: " + lap + " ms");
        }
      }
    }
    render(ctx){
      ctx.fillStyle="#03060a";
      ctx.fillRect(0,0,W,H);

      ctx.save();
      ctx.translate(this.track.cx,this.track.cy);
      ctx.fillStyle="#0c1422";
      ctx.beginPath(); ctx.arc(0,0,this.track.rOut,0,Math.PI*2); ctx.fill();

      ctx.globalCompositeOperation="destination-out";
      ctx.beginPath(); ctx.arc(0,0,this.track.rIn,0,Math.PI*2); ctx.fill();
      ctx.globalCompositeOperation="source-over";

      ctx.strokeStyle="#23304d"; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(0,0,this.track.rOut,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0,0,this.track.rIn,0,Math.PI*2); ctx.stroke();

      ctx.rotate(-Math.PI/2);
      ctx.fillStyle="#57b8ff";
      ctx.fillRect(this.track.rIn+1,-1,(this.track.rOut-this.track.rIn)-2,2);
      ctx.restore();

      if(this.off>0){
        ctx.fillStyle="rgba(255,77,109," + (0.10*this.off) + ")";
        ctx.fillRect(0,0,W,H);
      }

      ctx.save();
      ctx.translate(this.x,this.y);
      ctx.rotate(this.yaw);
      ctx.fillStyle="#7CFF6B";
      ctx.fillRect(-4,-2,8,4);
      ctx.fillStyle="#57b8ff";
      ctx.fillRect(1,-1,3,2);
      ctx.restore();

      ctx.fillStyle="#9fb7d6";
      ctx.font='6px "Press Start 2P", monospace';
      ctx.fillText("SPD:"+this.v.toFixed(2),4,9);
      ctx.fillText(this.onTrack() ? "TRACK:OK" : "TRACK:OFF",4,18);
    }
    bestText(){ return this.bestLapMs==null ? "--" : (this.bestLapMs+" ms"); }
  }

  class FishEnv {
    constructor(){ this.name="fish"; this.reset(); }
    reset(){
      this.x=W*0.25; this.y=H*0.55;
      this.vx=0; this.vy=0;
      this.a=0;
      this.turn=0; this.thrust=0;
      this.bump=0;
      this.rock={x:W*0.62,y:H*0.62,r:12};

      this.bestScore=-Infinity;
      this.lastScore=null;
    }
    features(){
      const xn=this.x/W*2-1, yn=this.y/H*2-1;
      const sinA=Math.sin(this.a), cosA=Math.cos(this.a);
      const dxr=(this.x-this.rock.x)/W, dyr=(this.y-this.rock.y)/H;
      const dist=Math.hypot(this.x-this.rock.x,this.y-this.rock.y)/Math.max(W,H);
      const wall = Math.min(this.x/W, (W-this.x)/W, this.y/H, (H-this.y)/H);
      return [xn,yn,this.vx/5,this.vy/5,sinA,cosA,dxr,dyr,dist,wall*2-1];
    }
    manual(keys){
      let t=0;
      if(keys.has("ArrowLeft")) t-=1;
      if(keys.has("ArrowRight")) t+=1;

      let thr=0;
      if(keys.has("ArrowUp")) thr+=1;
      if(keys.has("ArrowDown")) thr-=1;

      t=lerp(this.turn,t,0.35);
      thr=lerp(this.thrust,thr,0.30);
      return [clamp(t,-1,1), clamp(thr,-1,1)];
    }
    step(a, dt){
      const turn=a[0], thr=a[1];
      this.turn=clamp(turn,-1,1);
      this.thrust=clamp(thr,-1,1);

      this.a += this.turn * 2.4 * dt;

      const currentX=0.25*Math.sin(performance.now()/1200);
      const currentY=0.18*Math.cos(performance.now()/1400);

      const fx=Math.cos(this.a), fy=Math.sin(this.a);
      const accel=10*this.thrust;

      this.vx += (fx*accel + currentX)*dt;
      this.vy += (fy*accel + currentY)*dt;

      this.vx *= Math.pow(0.92, dt*60);
      this.vy *= Math.pow(0.92, dt*60);

      const sp=Math.hypot(this.vx,this.vy);
      const maxSp=5.8;
      if(sp>maxSp){
        const k=maxSp/sp;
        this.vx*=k; this.vy*=k;
      }

      this.x += this.vx*dt*60;
      this.y += this.vy*dt*60;

      this.bump=Math.max(0,this.bump-dt*2);
      const m=6;
      if(this.x<m){ this.x=m; this.vx*=-0.5; this.bump=1; }
      if(this.x>W-m){ this.x=W-m; this.vx*=-0.5; this.bump=1; }
      if(this.y<m){ this.y=m; this.vy*=-0.5; this.bump=1; }
      if(this.y>H-m){ this.y=H-m; this.vy*=-0.5; this.bump=1; }

      const dx=this.x-this.rock.x, dy=this.y-this.rock.y;
      const d=Math.hypot(dx,dy);
      if(d < this.rock.r+4){
        const nx=dx/(d||1), ny=dy/(d||1);
        this.x=this.rock.x+nx*(this.rock.r+4);
        this.y=this.rock.y+ny*(this.rock.r+4);
        this.vx += nx*1.8;
        this.vy += ny*1.8;
        this.bump=1;
      }
    }
    reward(){
      const dist = Math.hypot(this.x-this.rock.x, this.y-this.rock.y);
      const distN = clamp(dist / 80, 0, 1);
      const wall = Math.min(this.x/W, (W-this.x)/W, this.y/H, (H-this.y)/H);
      const wallPenalty = (0.5 - wall) * 0.08;
      const bumpPenalty = this.bump > 0 ? 0.15 : 0;
      return 0.02 + 0.05*distN - wallPenalty - bumpPenalty;
    }
    render(ctx){
      ctx.fillStyle="#020812"; ctx.fillRect(0,0,W,H);
      for(let y=0;y<H;y+=6){
        const t=y/H;
        ctx.fillStyle="rgba(87,184,255," + (0.08*(1-t)) + ")";
        ctx.fillRect(0,y,W,1);
      }
      ctx.strokeStyle="#23304d"; ctx.lineWidth=2;
      ctx.strokeRect(2,2,W-4,H-4);

      ctx.fillStyle="#1d2a3d";
      ctx.beginPath(); ctx.arc(this.rock.x,this.rock.y,this.rock.r,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle="#2b3a58"; ctx.stroke();

      if(this.bump>0){
        ctx.fillStyle="rgba(255,209,102," + (0.10*this.bump) + ")";
        ctx.fillRect(0,0,W,H);
      }

      ctx.save();
      ctx.translate(this.x,this.y);
      ctx.rotate(this.a);
      ctx.fillStyle="#7CFF6B"; ctx.fillRect(-4,-2,7,4);
      ctx.fillStyle="#020812"; ctx.fillRect(1,-1,1,1);
      ctx.fillStyle="#57b8ff"; ctx.fillRect(-6,-1,2,2);
      ctx.fillStyle="#9fb7d6"; ctx.fillRect(-1,1,2,1);
      ctx.restore();

      ctx.fillStyle="#9fb7d6";
      ctx.font='6px "Press Start 2P", monospace';
      ctx.fillText("SPD:"+Math.hypot(this.vx,this.vy).toFixed(2),4,9);
      ctx.fillText("AVOID ROCK",4,18);
    }
    bestText(){
      if(this.bestScore === -Infinity) return "--";
      return this.bestScore.toFixed(2);
    }
  }

  class DroneEnv {
    constructor(){ this.name="drone"; this.reset(); }
    reset(){
      this.x = W*0.25;
      this.y = H*0.50;
      this.vx = 0;
      this.vy = 0;
      this.tilt = 0;
      this.power = 0;
      this.bump = 0;

      this.bestScore = -Infinity;
      this.lastScore = null;

      this.gapY = H*0.5;
      this.gapV = 0.6;
      this.gateX = W*0.72;
      this.gapH = 22;
    }
    features(){
      const xn = this.x/W*2-1;
      const yn = this.y/H*2-1;
      const vxn = this.vx/6;
      const vyn = this.vy/6;
      const dxGate = (this.gateX - this.x)/W;
      const dyGap = (this.gapY - this.y)/H;
      const wall = Math.min(this.x/W, (W-this.x)/W, this.y/H, (H-this.y)/H);
      return [xn,yn,vxn,vyn,this.tilt,this.power,dxGate,dyGap,wall*2-1];
    }
    manual(keys){
      let tilt=0;
      if(keys.has("ArrowLeft")) tilt -= 1;
      if(keys.has("ArrowRight")) tilt += 1;

      let pwr=0;
      if(keys.has("ArrowUp")) pwr += 1;
      if(keys.has("ArrowDown")) pwr -= 1;

      tilt = lerp(this.tilt, tilt, 0.35);
      pwr  = lerp(this.power, pwr, 0.30);
      return [clamp(tilt,-1,1), clamp(pwr,-1,1)];
    }
    step(a, dt){
      const tilt=a[0], pwr=a[1];
      this.tilt = clamp(tilt,-1,1);
      this.power = clamp(pwr,-1,1);

      this.gapY += this.gapV * dt * 60;
      if(this.gapY < 18 || this.gapY > H-18) this.gapV *= -1;

      const ax = 0.20 * this.tilt;
      const ay = -0.25 * this.power + 0.08;

      this.vx += ax * dt * 60;
      this.vy += ay * dt * 60;

      this.vx *= Math.pow(0.92, dt*60);
      this.vy *= Math.pow(0.92, dt*60);

      this.vx = clamp(this.vx, -4.5, 4.5);
      this.vy = clamp(this.vy, -4.5, 4.5);

      this.x += this.vx * dt * 60;
      this.y += this.vy * dt * 60;

      this.bump = Math.max(0, this.bump - dt*2);

      const m=6;
      if(this.x<m){ this.x=m; this.vx*=-0.5; this.bump=1; }
      if(this.x>W-m){ this.x=W-m; this.vx*=-0.5; this.bump=1; }
      if(this.y<m){ this.y=m; this.vy*=-0.5; this.bump=1; }
      if(this.y>H-m){ this.y=H-m; this.vy*=-0.5; this.bump=1; }

      const gx = this.gateX;
      const gapTop = this.gapY - this.gapH/2;
      const gapBot = this.gapY + this.gapH/2;

      const inGateX = (this.x > gx-2 && this.x < gx+6);
      if(inGateX){
        if(this.y < gapTop || this.y > gapBot){
          this.x = gx-3;
          this.vx *= -0.6;
          this.bump = 1;
        }
      }

      this.x += 0.06 * dt * 60;
    }
    render(ctx){
      ctx.fillStyle="#070812";
      ctx.fillRect(0,0,W,H);

      ctx.fillStyle="rgba(215,247,255,0.12)";
      for(let i=0;i<35;i++){
        const x = (i*23 + (performance.now()/18)) % W;
        const y = (i*17 + (performance.now()/31)) % H;
        ctx.fillRect(x|0, y|0, 1, 1);
      }

      const gx = this.gateX;
      const gapTop = this.gapY - this.gapH/2;
      const gapBot = this.gapY + this.gapH/2;

      ctx.fillStyle="#1d2a3d";
      ctx.fillRect(gx, 4, 4, Math.max(0, gapTop-4));
      ctx.fillRect(gx, gapBot, 4, (H-4-gapBot));

      ctx.fillStyle="#57b8ff";
      ctx.fillRect(gx-1, gapTop-1, 6, 1);
      ctx.fillRect(gx-1, gapBot,   6, 1);

      if(this.bump>0){
        ctx.fillStyle="rgba(255,77,109," + (0.12*this.bump) + ")";
        ctx.fillRect(0,0,W,H);
      }

      ctx.save();
      ctx.translate(this.x,this.y);
      ctx.fillStyle="#7CFF6B";
      ctx.fillRect(-4,-2,8,4);
      ctx.fillStyle="#57b8ff";
      ctx.fillRect(2,-1,2,2);
      if(this.power > 0.2){
        ctx.fillStyle="#FFD166";
        ctx.fillRect(-1,2,2,1);
      }
      ctx.restore();

      ctx.fillStyle="#9fb7d6";
      ctx.font='6px "Press Start 2P", monospace';
      ctx.fillText("DRONE", 4, 9);
      ctx.fillText("X:"+this.x.toFixed(0)+" Y:"+this.y.toFixed(0), 4, 18);
    }
    bestText(){
      if(this.bestScore === -Infinity) return "--";
      return this.bestScore.toFixed(2);
    }
  }

  const ENVS = { car: new CarEnv(), fish: new FishEnv(), drone: new DroneEnv() };
  let env = ENVS[$("envSel").value];

  let imiModel = { car: null, fish: null, drone: null };
  function imiKey(name){ return "indexeddb://retro_imi_" + name + "_v4"; } // [web:37]

  function buildImiModel(inputSize){
    const m = tf.sequential();
    m.add(tf.layers.dense({units:64, activation:"relu", inputShape:[inputSize]}));
    m.add(tf.layers.dense({units:64, activation:"relu"}));
    m.add(tf.layers.dense({units:2, activation:"tanh"}));
    m.compile({optimizer: tf.train.adam(1e-3), loss:"meanSquaredError"});
    return m;
  }

  let rlPolicy = null;
  let rlOpt = null;
  function rlKey(){ return "indexeddb://retro_rl_fish_v4"; } // [web:37]
  function buildRLPolicy(inputSize){
    const m = tf.sequential();
    m.add(tf.layers.dense({units:64, activation:"relu", inputShape:[inputSize]}));
    m.add(tf.layers.dense({units:64, activation:"relu"}));
    m.add(tf.layers.dense({units:2, activation:"tanh"}));
    return m;
  }
  function updateRLImage(){
    const img = $("rlImg");
    try { img.src = view.toDataURL("image/png"); } catch {}
  }

  function setTab(name){
    for(const b of document.querySelectorAll(".tab")) b.classList.toggle("active", b.dataset.tab===name);
    $("tab_sim").style.display = (name==="sim") ? "" : "none";
    $("tab_rl").style.display  = (name==="rl") ? "" : "none";
    $("tab_multi").style.display = (name==="multi") ? "" : "none";
    $("simTop").style.display = (name==="sim") ? "flex" : "none";
  }
  for(const b of document.querySelectorAll(".tab")) b.onclick = ()=>setTab(b.dataset.tab);

  let recording=false;
  let auto=false;
  let frameCounter=0;
  const sampleEvery=2;
  let trainingIMI=false;

  function manualAction(){ return env.manual(keys); }

  function imiAutoAction(){
    const m = imiModel[env.name];
    if(!m) return manualAction();
    const f = env.features();
    const pred = tf.tidy(() => m.predict(tf.tensor2d([f])).dataSync());
    const a0 = pred[0], a1 = pred[1];

    if(env.name==="car"){
      return [ clamp(lerp(env.steer, a0, 0.25), -1, 1), clamp(lerp(env.throttle, a1, 0.22), -1, 1) ];
    }
    if(env.name==="fish"){
      return [ clamp(lerp(env.turn, a0, 0.25), -1, 1), clamp(lerp(env.thrust, a1, 0.22), -1, 1) ];
    }
    return [ clamp(lerp(env.tilt, a0, 0.25), -1, 1), clamp(lerp(env.power, a1, 0.22), -1, 1) ];
  }

  $("envSel").onchange = () => {
    env = ENVS[$("envSel").value];
    env.reset();
    log("Switched to " + env.name.toUpperCase());
  };
  $("resetBtn").onclick = () => { env.reset(); log("Reset."); };

  $("recBtn").onclick = () => {
    recording=true;
    $("recBtn").disabled=true;
    $("stopBtn").disabled=false;
    log("REC ON.");
  };
  $("stopBtn").onclick = () => {
    recording=false;
    $("recBtn").disabled=false;
    $("stopBtn").disabled=true;
    saveDS(DS);
    log("REC OFF (saved).");
  };

  $("autoBtn").onclick = () => {
    auto=!auto;
    $("autoBtn").textContent = "AUTO: " + (auto ? "ON" : "OFF");
    log(auto ? "AUTO ON (imitation model drives)." : "AUTO OFF.");
  };

  $("clearBtn").onclick = () => {
    DS[env.name] = {X:[], Y:[]};
    saveDS(DS);
    log("Cleared dataset for " + env.name + ".");
  };

  // Shuffle indices fix: make sure indices are a plain flat array before tensor1d(). [web:37]
  function makeShuffledTensors(ds){
    const idxU = tf.util.createShuffledIndices(ds.X.length);
    const idxArr = Array.from(idxU);
    const idxT = tf.tensor1d(idxArr, "int32");

    const xs0 = tf.tensor2d(ds.X);
    const ys0 = tf.tensor2d(ds.Y);

    const xs = xs0.gather(idxT);
    const ys = ys0.gather(idxT);

    idxT.dispose(); xs0.dispose(); ys0.dispose();
    return {xs: xs, ys: ys};
  }

  $("trainBtn").onclick = async () => {
    if(trainingIMI){ log("Training already running..."); return; }
    const ds = dsFor(env.name);
    if(ds.X.length < 300){
      log("Need more samples (>=300). Have " + ds.X.length + ".");
      return;
    }
    const epochs = clamp(parseInt($("epochsIn").value||"25",10),1,200);
    const batch  = clamp(parseInt($("batchIn").value||"128",10),16,512);

    trainingIMI = true;
    $("trainBtn").disabled = true;
    log("Training imitation model (" + env.name + ") epochs=" + epochs + ", batch=" + batch + "...");

    try{
      let m = imiModel[env.name];
      if(!m) m = buildImiModel(ds.X[0].length);

      const out = makeShuffledTensors(ds);
      const xs = out.xs, ys = out.ys;

      await m.fit(xs, ys, {
        epochs: epochs,
        batchSize: batch,
        validationSplit: 0.15,
        callbacks:{
          onEpochEnd:(ep, logs) => {
            log("ep " + String(ep+1).padStart(3,"0") +
                " loss=" + logs.loss.toFixed(5) +
                " val=" + logs.val_loss.toFixed(5));
          }
        }
      });

      xs.dispose(); ys.dispose();
      imiModel[env.name] = m;
      log("Train done. Try AUTO.");
    } catch(e){
      log("Train error: " + (e && e.message ? e.message : e));
    } finally {
      $("trainBtn").disabled = false;
      trainingIMI = false;
    }
  };

  $("saveBtn").onclick = async () => {
    if(trainingIMI){ log("Wait: training in progress..."); return; }

    const ds = dsFor(env.name);
    if(!imiModel[env.name]){
      if(ds.X.length < 200){
        log("No imitation model yet. Record more first (~200+). Have " + ds.X.length + ".");
        return;
      }

      trainingIMI = true;
      log("No model yet → quick auto-train (5 epochs) then save...");

      try{
        let m = buildImiModel(ds.X[0].length);
        const out = makeShuffledTensors(ds);
        const xs = out.xs, ys = out.ys;

        await m.fit(xs, ys, { epochs: 5, batchSize: 128, validationSplit: 0.15 });

        xs.dispose(); ys.dispose();
        imiModel[env.name] = m;
        log("Quick train done.");
      } catch(e){
        log("Auto-train failed: " + (e && e.message ? e.message : e));
        trainingIMI = false;
        return;
      }
      trainingIMI = false;
    }

    await imiModel[env.name].save(imiKey(env.name));
    log("Saved imitation model to IndexedDB.");
  };

  $("loadBtn").onclick = async () => {
    try{
      imiModel[env.name] = await tf.loadLayersModel(imiKey(env.name));
      log("Loaded imitation model from IndexedDB.");
    } catch {
      log("No saved imitation model found (train + save first).");
    }
  };

  $("rlInitBtn").onclick = async () => {
    rlPolicy = buildRLPolicy(ENVS.fish.features().length);
    rlOpt = tf.train.adam(parseFloat($("rlLR").value || "0.003"));
    log("RL policy initialized (fish).");
  };

  async function runFishEpisodeTrain(maxSteps, gamma=0.99, sigma=0.25){
    const fish = ENVS.fish;
    fish.reset();

    const states = [];
    const actions = [];
    const rewards = [];

    for(let t=0; t<maxSteps; t++){
      const s = fish.features();
      const mean = tf.tidy(() => rlPolicy.predict(tf.tensor2d([s])).dataSync());

      let a0 = mean[0] + sigma*randn();
      let a1 = mean[1] + sigma*randn();
      a0 = clamp(a0, -1, 1);
      a1 = clamp(a1, -1, 1);

      fish.step([a0,a1], 1/60);
      const r = fish.reward();

      states.push(s);
      actions.push([a0,a1]);
      rewards.push(r);

      if(t % 6 === 0){
        fish.render(g);
        vctx.clearRect(0,0,view.width,view.height);
        vctx.drawImage(low, 0, 0, view.width, view.height);
        updateRLImage();
      }
      if(fish.bump > 0.8 && t > 60) break;
      if(t % 60 === 0) await tf.nextFrame();
    }

    const returns = new Array(rewards.length);
    let G=0;
    for(let i=rewards.length-1; i>=0; i--){
      G = rewards[i] + gamma*G;
      returns[i] = G;
    }

    const meanR = returns.reduce((a,b)=>a+b,0) / returns.length;
    const stdR = Math.sqrt(returns.reduce((a,b)=>a+(b-meanR)*(b-meanR),0)/returns.length) + 1e-8;
    const normReturns = returns.map(x => (x-meanR)/stdR);

    const lossVal = tf.tidy(() => {
      const S = tf.tensor2d(states);
      const A = tf.tensor2d(actions);
      const R = tf.tensor1d(normReturns);

      const sqrt2pi = Math.sqrt(2*Math.PI);
      const sig = tf.scalar(sigma);
      const logNorm = tf.log(sig.mul(sqrt2pi));

      const out = tf.variableGrads(() => {
        const M = rlPolicy.apply(S);
        const z = A.sub(M).div(sig);
        const logp = z.square().mul(-0.5).sub(logNorm);
        const logpSum = logp.sum(1);
        const loss = tf.neg(logpSum.mul(R).mean());
        return loss;
      });

      rlOpt.applyGradients(out.grads);
      Object.values(out.grads).forEach(t => t.dispose());

      const v = out.value.dataSync()[0];
      S.dispose(); A.dispose(); R.dispose(); sig.dispose(); logNorm.dispose(); out.value.dispose();
      return v;
    });

    const epReturn = rewards.reduce((a,b)=>a+b,0);
    fish.lastScore = epReturn;
    fish.bestScore = Math.max(fish.bestScore, epReturn);
    return { epReturn: epReturn, lossVal: lossVal, steps: rewards.length };
  }

  async function runFishEpisodeDemo(maxSteps){
    const fish = ENVS.fish;
    fish.reset();
    let total=0;

    for(let t=0; t<maxSteps; t++){
      const s = fish.features();
      const mean = rlPolicy ? tf.tidy(() => rlPolicy.predict(tf.tensor2d([s])).dataSync()) : [0,0];
      const a0 = clamp(mean[0], -1, 1);
      const a1 = clamp(mean[1], -1, 1);

      fish.step([a0,a1], 1/60);
      total += fish.reward();

      fish.render(g);
      vctx.clearRect(0,0,view.width,view.height);
      vctx.drawImage(low, 0, 0, view.width, view.height);
      updateRLImage();

      if(t % 2 === 0) await tf.nextFrame();
    }
    fish.lastScore = total;
    fish.bestScore = Math.max(fish.bestScore, total);
    return total;
  }

  $("rlTrainBtn").onclick = async () => {
    if(!rlPolicy || !rlOpt){
      log("Init RL policy first.");
      return;
    }
    const episodes = clamp(parseInt($("rlEpisodes").value||"25",10),1,500);
    const steps = clamp(parseInt($("rlSteps").value||"650",10),50,5000);

    $("rlTrainBtn").disabled = true;
    log("RL training start: episodes=" + episodes + ", steps=" + steps);

    let sum=0;
    for(let ep=1; ep<=episodes; ep++){
      const out = await runFishEpisodeTrain(steps);
      sum += out.epReturn;
      log("RL ep " + String(ep).padStart(3,"0") +
          " return=" + out.epReturn.toFixed(2) +
          " loss=" + out.lossVal.toFixed(5) +
          " steps=" + out.steps);
      await tf.nextFrame();
    }

    log("RL training done. Avg return=" + (sum/episodes).toFixed(2));
    $("rlTrainBtn").disabled = false;
  };

  $("rlRunBtn").onclick = async () => {
    if(!rlPolicy){
      log("Init RL policy first (or train).");
      return;
    }
    log("RL demo run...");
    const total = await runFishEpisodeDemo(900);
    log("RL demo total reward: " + total.toFixed(2));
  };

  async function saveRL(){
    if(!rlPolicy){ log("No RL policy to save."); return; }
    await rlPolicy.save(rlKey());
    log("Saved RL policy (fish) to IndexedDB.");
  }
  async function loadRL(){
    try{
      rlPolicy = await tf.loadLayersModel(rlKey());
      rlOpt = tf.train.adam(parseFloat($("rlLR").value || "0.003"));
      log("Loaded RL policy (fish) from IndexedDB.");
    }catch{
      log("No saved RL policy found.");
    }
  }
  window.addEventListener("keydown",(e)=>{
    if(e.key==="F6") saveRL();
    if(e.key==="F7") loadRL();
  });

  let bc = null;
  let roomName = null;
  function bcName(room){ return "retro_learn_room_" + room; }

  function joinRoom(room){
    leaveRoom();
    roomName = (room || "lobby").slice(0, 24);

    if(!("BroadcastChannel" in window)){
      log("BroadcastChannel not supported in this browser.");
      return;
    }

    bc = new BroadcastChannel(bcName(roomName));
    bc.onmessage = (ev) => {
      const msg = ev.data || {};
      if(msg.type==="chat"){
        log("[ROOM:"+roomName+"] " + (msg.user||"?") + ": " + (msg.text||""));
      } else if(msg.type==="best"){
        log("[ROOM:"+roomName+"] BEST from " + msg.user + ": " + msg.env + "=" + msg.value);
      } else if(msg.type==="dataset"){
        const envName = msg.env;
        if(envName !== "car" && envName !== "fish" && envName !== "drone") return;
        const incoming = msg.payload;
        if(!incoming || !incoming.X || !incoming.Y) return;

        const ds = dsFor(envName);
        ds.X.push(...incoming.X);
        ds.Y.push(...incoming.Y);
        capDataset(envName, 25000);
        saveDS(DS);

        log("[ROOM:"+roomName+"] got dataset from " + msg.user +
            " env=" + envName + " +" + incoming.X.length + " samples");
      }
    };

    log("Joined room: " + roomName);
  }

  function leaveRoom(){
    if(bc){ bc.close(); bc=null; }
    roomName = null;
  }

  $("joinRoomBtn").onclick = () => joinRoom($("roomIn").value);
  $("leaveRoomBtn").onclick = () => { leaveRoom(); log("Left room."); };
  $("clearNetBtn").onclick = () => log("---- NET LOG CLEARED ----");

  $("sendChatBtn").onclick = () => {
    if(!bc){ log("Join a room first."); return; }
    const user = ($("nameIn").value || "player").slice(0, 24);
    bc.postMessage({type:"chat", user:user, text:"hi"});
  };

  $("broadcastBestBtn").onclick = () => {
    if(!bc){ log("Join a room first."); return; }
    const user = ($("nameIn").value || "player").slice(0, 24);
    const value = env.bestText ? env.bestText() : "--";
    bc.postMessage({type:"best", user:user, env:env.name, value:value});
    log("Broadcasted best.");
  };

  $("shareDatasetBtn").onclick = () => {
    if(!bc){ log("Join a room first."); return; }
    const user = ($("nameIn").value || "player").slice(0, 24);
    const ds = dsFor(env.name);
    if(ds.X.length < 50){
      log("Record at least 50 samples before sharing.");
      return;
    }
    const N = Math.min(2000, ds.X.length);
    const payload = { X: ds.X.slice(ds.X.length - N), Y: ds.Y.slice(ds.Y.length - N) };
    bc.postMessage({type:"dataset", user:user, env:env.name, payload:payload});
    log("Shared dataset last " + N + " samples.");
  };

  let last = performance.now();
  function loop(t){
    const dt = Math.min(0.033, (t-last)/1000);
    last = t;

    const a = auto ? imiAutoAction() : manualAction();

    frameCounter++;
    if(recording && (frameCounter % sampleEvery === 0)){
      const ds = dsFor(env.name);
      ds.X.push(env.features());
      ds.Y.push([a[0], a[1]]);
      capDataset(env.name, 25000);
      if(ds.X.length % 120 === 0) saveDS(DS);
    }

    env.step(a, dt);
    env.render(g);

    vctx.clearRect(0,0,view.width,view.height);
    vctx.drawImage(low, 0, 0, view.width, view.height);

    requestAnimationFrame(loop);
  }

  setTab("sim");
  log("Ready.");
  requestAnimationFrame(loop);
})();
