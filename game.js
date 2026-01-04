// =====================
// Config / Constants
// =====================
const CONFIG = {
  fov: Math.PI / 3,
  sensitivity: 0.002,
  moveSpeed: 3.2,
  sprintMultiplier: 1.6,
  staminaMax: 5,
  staminaRegen: 1.4,
  staminaDrain: 2.4,
  healthMax: 100,
  healthRegenDelay: 3,
  healthRegenRate: 6,
  hitmarkerDuration: 0.1,
  rayCount: 320,
  maxDepth: 20,
  zombieCap: 30,
  baseWaveZombies: 6,
  waveGrowth: 1.3,
  spawnRate: 0.7,
  grenadeFuse: 2.2,
  grenadeRadius: 2.5,
  grenadeCount: 3,
  grenadeCooldown: 0.8,
  adsFov: Math.PI / 4,
  adsSpeedMultiplier: 0.7,
  bobAmplitude: 0.04,
  bobSpeed: 9,
  interactRange: 1.2,
  doorCost: 750,
};

// =====================
// Utils
// =====================
const Utils = {
  clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
  lerp: (a, b, t) => a + (b - a) * t,
  dist: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
  randRange: (a, b) => a + Math.random() * (b - a),
};

// =====================
// Input
// =====================
class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouseDown = false;
    this.rightDown = false;
    this.yawDelta = 0;
    this.canvas = canvas;
    this.pointerLocked = false;
    this.paused = false;
    this.init();
  }
  init() {
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.rightDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.rightDown = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) this.yawDelta += e.movementX;
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  consumeYaw() {
    const delta = this.yawDelta;
    this.yawDelta = 0;
    return delta;
  }
  isDown(code) {
    return this.keys.has(code);
  }
}

// =====================
// Audio
// =====================
class AudioSystem {
  constructor() {
    this.ctx = null;
    this.lastGroan = 0;
  }
  init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  beep(freq, duration = 0.08, type = 'sine', gain = 0.06) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g).connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }
  noise(duration = 0.2, gain = 0.08) {
    if (!this.ctx) return;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * duration, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1);
    const source = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    g.gain.value = gain;
    source.buffer = buffer;
    source.connect(g).connect(this.ctx.destination);
    source.start();
  }
  shoot() {
    this.beep(220, 0.06, 'square', 0.08);
  }
  reload() {
    this.beep(120, 0.12, 'triangle', 0.06);
  }
  hitmarker() {
    this.beep(880, 0.05, 'sine', 0.05);
  }
  grenade() {
    this.noise(0.4, 0.2);
  }
  groan() {
    const now = performance.now();
    if (now - this.lastGroan < 2000) return;
    this.lastGroan = now;
    this.beep(60, 0.5, 'sawtooth', 0.03);
  }
}

// =====================
// Map
// =====================
class GameMap {
  constructor() {
    this.grid = [
      '111111111111111',
      '100000000000001',
      '101111011111101',
      '101000010000101',
      '101011110110101',
      '101010000010101',
      '101010111010101',
      '100010100010001',
      '111010101110111',
      '100000000000001',
      '101111101111101',
      '100000100000001',
      '111111111111111',
    ];
    this.width = this.grid[0].length;
    this.height = this.grid.length;
    this.buyStations = [
      { x: 3.5, y: 2.5, type: 'rifle', cost: 500 },
      { x: 11.5, y: 9.5, type: 'shotgun', cost: 700 },
      { x: 6.5, y: 10.5, type: 'ammo', cost: 250 },
    ];
    this.door = { x: 7, y: 8, open: false, cost: CONFIG.doorCost };
    this.spawns = [
      { x: 1.5, y: 1.5 },
      { x: 13.5, y: 1.5 },
      { x: 1.5, y: 11.5 },
      { x: 13.5, y: 11.5 },
    ];
  }
  isWall(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return true;
    const gx = Math.floor(x);
    const gy = Math.floor(y);
    if (gx === this.door.x && gy === this.door.y && !this.door.open) return true;
    return this.grid[gy][gx] === '1';
  }
  openDoor() {
    this.door.open = true;
  }
}

// =====================
// Raycaster Renderer
// =====================
class RaycasterRenderer {
  constructor(canvas, map) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.map = map;
    this.width = canvas.width;
    this.height = canvas.height;
  }
  resize() {
    this.width = this.canvas.width;
    this.height = this.canvas.height;
  }
  render(player, zombies, grenades, hitFlash) {
    const { ctx, width, height } = this;
    ctx.clearRect(0, 0, width, height);
    const halfH = height / 2;
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(0, 0, width, halfH);
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, halfH, width, halfH);

    const rays = CONFIG.rayCount;
    const fov = player.isADS ? CONFIG.adsFov : CONFIG.fov;
    for (let i = 0; i < rays; i += 1) {
      const rayAngle = (player.yaw - fov / 2) + (i / rays) * fov;
      let dist = 0;
      let hit = false;
      let hitX = 0;
      let hitY = 0;
      while (!hit && dist < CONFIG.maxDepth) {
        dist += 0.02;
        hitX = player.x + Math.cos(rayAngle) * dist;
        hitY = player.y + Math.sin(rayAngle) * dist;
        if (this.map.isWall(hitX, hitY)) hit = true;
      }
      const corrected = dist * Math.cos(rayAngle - player.yaw);
      const wallHeight = Math.min(height, (height / corrected) * 1.2);
      const shade = Math.max(0, 200 - corrected * 25);
      ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
      const x = Math.floor((i / rays) * width);
      const w = Math.ceil(width / rays);
      ctx.fillRect(x, halfH - wallHeight / 2 + player.bobOffset, w, wallHeight);
    }

    const sprites = zombies.map((z) => ({
      x: z.x,
      y: z.y,
      dist: Utils.dist(player.x, player.y, z.x, z.y),
      color: z.hitFlash ? '#ff5555' : '#77ff77',
    }));
    for (const grenade of grenades) {
      sprites.push({
        x: grenade.x,
        y: grenade.y,
        dist: Utils.dist(player.x, player.y, grenade.x, grenade.y),
        color: '#ffaa33',
      });
    }
    sprites.sort((a, b) => b.dist - a.dist);

    for (const sprite of sprites) {
      const angle = Math.atan2(sprite.y - player.y, sprite.x - player.x) - player.yaw;
      const fov = player.isADS ? CONFIG.adsFov : CONFIG.fov;
      if (Math.abs(angle) > fov / 1.5) continue;
      const size = Math.min(200, (height / sprite.dist) * 1.2);
      const sx = (0.5 + angle / fov) * width;
      ctx.fillStyle = sprite.color;
      ctx.fillRect(sx - size / 4, halfH - size / 2 + player.bobOffset, size / 2, size);
    }

    if (hitFlash > 0) {
      ctx.fillStyle = `rgba(255,0,0,${hitFlash})`;
      ctx.fillRect(0, 0, width, height);
    }
  }
}

// =====================
// Entities
// =====================
class Zombie {
  constructor(x, y, wave) {
    this.x = x;
    this.y = y;
    this.speed = 0.8 + wave * 0.05;
    this.health = 40 + wave * 8;
    this.attackCooldown = 0;
    this.hitFlash = 0;
  }
  update(dt, player, map) {
    const angle = Math.atan2(player.y - this.y, player.x - this.x);
    const nextX = this.x + Math.cos(angle) * this.speed * dt;
    const nextY = this.y + Math.sin(angle) * this.speed * dt;
    if (!map.isWall(nextX, this.y)) this.x = nextX;
    if (!map.isWall(this.x, nextY)) this.y = nextY;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
  }
  tryAttack(player) {
    if (this.attackCooldown > 0) return false;
    if (Utils.dist(this.x, this.y, player.x, player.y) < 0.9) {
      this.attackCooldown = 1.2;
      return true;
    }
    return false;
  }
  takeDamage(amount) {
    this.health -= amount;
    this.hitFlash = 0.1;
    return this.health <= 0;
  }
}

class Grenade {
  constructor(x, y, dir) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(dir) * 4;
    this.vy = Math.sin(dir) * 4;
    this.timer = CONFIG.grenadeFuse;
    this.exploded = false;
  }
  update(dt, map) {
    if (this.exploded) return;
    this.timer -= dt;
    const nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;
    if (!map.isWall(nx, this.y)) this.x = nx; else this.vx *= -0.4;
    if (!map.isWall(this.x, ny)) this.y = ny; else this.vy *= -0.4;
  }
  shouldExplode() {
    return this.timer <= 0 && !this.exploded;
  }
}

// =====================
// Weapons
// =====================
class Weapon {
  constructor(config) {
    Object.assign(this, config);
    this.cooldown = 0;
    this.reloadTimer = 0;
    this.ammo = this.magSize;
    this.reserve = this.reserveAmmo;
  }
  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.reloadTimer > 0) this.reloadTimer -= dt;
    if (this.reloadTimer <= 0 && this.reloading) {
      const needed = this.magSize - this.ammo;
      const take = Math.min(needed, this.reserve);
      this.ammo += take;
      this.reserve -= take;
      this.reloading = false;
    }
  }
  canShoot() {
    return this.cooldown <= 0 && !this.reloading && this.ammo > 0;
  }
  shoot() {
    if (!this.canShoot()) return false;
    this.ammo -= 1;
    this.cooldown = 1 / this.fireRate;
    return true;
  }
  startReload() {
    if (this.reloading || this.ammo === this.magSize || this.reserve <= 0) return false;
    this.reloading = true;
    this.reloadTimer = this.reloadTime;
    return true;
  }
  addReserve(amount) {
    this.reserve += amount;
  }
  refill() {
    this.reserve = this.reserveMax;
  }
}

const WEAPONS = {
  pistol: {
    name: 'Pistol',
    damage: 20,
    fireRate: 4,
    magSize: 12,
    reloadTime: 1.2,
    spread: 0.02,
    pellets: 1,
    reserveAmmo: 36,
    reserveMax: 60,
    cost: 0,
  },
  rifle: {
    name: 'Rifle',
    damage: 12,
    fireRate: 10,
    magSize: 30,
    reloadTime: 1.8,
    spread: 0.03,
    pellets: 1,
    reserveAmmo: 90,
    reserveMax: 180,
    cost: 500,
  },
  shotgun: {
    name: 'Shotgun',
    damage: 8,
    fireRate: 1.2,
    magSize: 6,
    reloadTime: 2.2,
    spread: 0.12,
    pellets: 7,
    reserveAmmo: 24,
    reserveMax: 48,
    cost: 700,
  },
};

// =====================
// Player
// =====================
class Player {
  constructor(map) {
    this.x = 7.5;
    this.y = 6.5;
    this.yaw = 0;
    this.health = CONFIG.healthMax;
    this.stamina = CONFIG.staminaMax;
    this.weapon = new Weapon(WEAPONS.pistol);
    this.grenades = CONFIG.grenadeCount;
    this.points = 500;
    this.hitTimer = 0;
    this.regenTimer = 0;
    this.isADS = false;
    this.bobTime = 0;
    this.bobOffset = 0;
    this.map = map;
  }
  update(dt, input) {
    this.yaw += input.consumeYaw() * CONFIG.sensitivity;
    const forward = input.isDown('KeyW') ? 1 : 0;
    const back = input.isDown('KeyS') ? 1 : 0;
    const left = input.isDown('KeyA') ? 1 : 0;
    const right = input.isDown('KeyD') ? 1 : 0;
    const moveX = right - left;
    const moveY = forward - back;
    const mag = Math.hypot(moveX, moveY);
    const isMoving = mag > 0;
    const sprinting = input.isDown('ShiftLeft') && this.stamina > 0 && !this.isADS;
    let speed = CONFIG.moveSpeed * (sprinting ? CONFIG.sprintMultiplier : 1);
    if (this.isADS) speed *= CONFIG.adsSpeedMultiplier;
    const dir = this.yaw + Math.atan2(moveY, moveX) - Math.PI / 2;
    const vx = isMoving ? Math.cos(dir) * speed * dt : 0;
    const vy = isMoving ? Math.sin(dir) * speed * dt : 0;
    this.tryMove(vx, vy);

    if (sprinting && isMoving) {
      this.stamina = Math.max(0, this.stamina - CONFIG.staminaDrain * dt);
    } else {
      this.stamina = Math.min(CONFIG.staminaMax, this.stamina + CONFIG.staminaRegen * dt);
    }

    this.bobTime += isMoving ? CONFIG.bobSpeed * dt : 0;
    this.bobOffset = Math.sin(this.bobTime) * CONFIG.bobAmplitude * (isMoving ? 14 : 0);

    if (this.hitTimer > 0) this.hitTimer -= dt;
    if (this.regenTimer > 0) this.regenTimer -= dt;
    if (this.regenTimer <= 0 && this.health < CONFIG.healthMax) {
      this.health = Math.min(CONFIG.healthMax, this.health + CONFIG.healthRegenRate * dt);
    }

    this.weapon.update(dt);
  }
  tryMove(vx, vy) {
    const nx = this.x + vx;
    const ny = this.y + vy;
    if (!this.map.isWall(nx, this.y)) this.x = nx;
    if (!this.map.isWall(this.x, ny)) this.y = ny;
  }
  takeDamage(amount) {
    this.health -= amount;
    this.hitTimer = 0.2;
    this.regenTimer = CONFIG.healthRegenDelay;
  }
}

// =====================
// Wave Manager
// =====================
class WaveManager {
  constructor(map) {
    this.map = map;
    this.wave = 1;
    this.toSpawn = 0;
    this.spawnTimer = 0;
    this.between = 0;
    this.bannerTimer = 0;
    this.startWave();
  }
  startWave() {
    this.toSpawn = Math.floor(CONFIG.baseWaveZombies * Math.pow(CONFIG.waveGrowth, this.wave - 1));
    this.spawnTimer = 0;
    this.between = 0;
    this.bannerTimer = 2;
  }
  update(dt, zombies) {
    if (this.bannerTimer > 0) this.bannerTimer -= dt;
    if (this.toSpawn <= 0 && zombies.length === 0) {
      this.between += dt;
      if (this.between > 3) {
        this.wave += 1;
        this.startWave();
      }
      return;
    }
    if (this.toSpawn > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && zombies.length < CONFIG.zombieCap) {
        const spawn = this.map.spawns[Math.floor(Math.random() * this.map.spawns.length)];
        zombies.push(new Zombie(spawn.x, spawn.y, this.wave));
        this.toSpawn -= 1;
        this.spawnTimer = 1 / (CONFIG.spawnRate + this.wave * 0.1);
      }
    }
  }
}

// =====================
// Shop System
// =====================
class ShopSystem {
  constructor(map) {
    this.map = map;
  }
  getPrompt(player) {
    const doorDist = Utils.dist(player.x, player.y, this.map.door.x + 0.5, this.map.door.y + 0.5);
    if (!this.map.door.open && doorDist < CONFIG.interactRange) {
      return { text: `Press E to open door (${this.map.door.cost})`, action: 'door' };
    }
    for (const station of this.map.buyStations) {
      const dist = Utils.dist(player.x, player.y, station.x, station.y);
      if (dist < CONFIG.interactRange) {
        if (station.type === 'ammo') {
          return { text: `Press E to buy Ammo (${station.cost})`, action: 'ammo', cost: station.cost };
        }
        return { text: `Press E to buy ${station.type} (${station.cost})`, action: station.type, cost: station.cost };
      }
    }
    return null;
  }
  handleInteract(player, prompt) {
    if (!prompt) return false;
    if (prompt.action === 'door') {
      if (player.points >= this.map.door.cost) {
        player.points -= this.map.door.cost;
        this.map.openDoor();
        return true;
      }
      return false;
    }
    if (prompt.action === 'ammo') {
      if (player.points >= prompt.cost) {
        player.points -= prompt.cost;
        player.weapon.refill();
        return true;
      }
      return false;
    }
    if (prompt.action === 'rifle' || prompt.action === 'shotgun') {
      const weaponData = WEAPONS[prompt.action];
      if (player.points >= prompt.cost) {
        player.points -= prompt.cost;
        player.weapon = new Weapon(weaponData);
        return true;
      }
    }
    return false;
  }
}

// =====================
// UI / HUD
// =====================
class UI {
  constructor() {
    this.healthFill = document.querySelector('#healthBar .fill');
    this.staminaFill = document.querySelector('#staminaBar .fill');
    this.ammoText = document.getElementById('ammoText');
    this.grenadeText = document.getElementById('grenadeText');
    this.waveText = document.getElementById('waveText');
    this.pointsText = document.getElementById('pointsText');
    this.prompt = document.getElementById('prompt');
    this.banner = document.getElementById('banner');
    this.pause = document.getElementById('pause');
    this.crosshair = document.getElementById('crosshair');
    this.minimap = document.getElementById('minimap');
  }
  update(player, waveManager, promptText, hitmarker) {
    this.healthFill.style.width = `${(player.health / CONFIG.healthMax) * 100}%`;
    this.staminaFill.style.width = `${(player.stamina / CONFIG.staminaMax) * 100}%`;
    this.ammoText.textContent = `${player.weapon.ammo}/${player.weapon.reserve}`;
    this.grenadeText.textContent = `${player.grenades}`;
    this.waveText.textContent = `${waveManager.wave}`;
    this.pointsText.textContent = `${player.points}`;
    this.prompt.textContent = promptText || '';
    this.banner.textContent = waveManager.bannerTimer > 0 ? `Wave ${waveManager.wave}` : '';
    this.crosshair.classList.toggle('hit', hitmarker);
  }
  setPaused(paused) {
    this.pause.style.display = paused ? 'flex' : 'none';
  }
  setADS(isADS) {
    this.crosshair.style.transform = isADS ? 'scale(0.7)' : 'scale(1)';
  }
}

// =====================
// Game Loop
// =====================
class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.map = new GameMap();
    this.player = new Player(this.map);
    this.input = new Input(this.canvas);
    this.audio = new AudioSystem();
    this.renderer = new RaycasterRenderer(this.canvas, this.map);
    this.ui = new UI();
    this.waveManager = new WaveManager(this.map);
    this.prevWave = this.waveManager.wave;
    this.shop = new ShopSystem(this.map);
    this.zombies = [];
    this.grenades = [];
    this.lastTime = 0;
    this.accumulator = 0;
    this.fixedStep = 1 / 60;
    this.hitmarkerTimer = 0;
    this.grenadeCooldown = 0;
    this.damageFlash = 0;
    this.init();
  }
  init() {
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('click', () => {
      if (!this.input.pointerLocked) {
        this.canvas.requestPointerLock();
        this.audio.init();
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.input.pointerLocked) document.exitPointerLock();
        this.input.paused = !this.input.paused;
        this.ui.setPaused(this.input.paused);
      }
      if (e.code === 'KeyR') {
        if (this.player.weapon.startReload()) this.audio.reload();
      }
      if (e.code === 'KeyG') this.throwGrenade();
      if (e.code === 'KeyE') this.interact();
      if (e.code === 'KeyF') this.input.rightDown = !this.input.rightDown;
    });
    requestAnimationFrame((t) => this.loop(t));
  }
  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.renderer.resize();
  }
  loop(time) {
    const delta = (time - this.lastTime) / 1000;
    this.lastTime = time;
    if (!this.input.paused) {
      this.accumulator += Math.min(0.1, delta);
      while (this.accumulator >= this.fixedStep) {
        this.update(this.fixedStep);
        this.accumulator -= this.fixedStep;
      }
    }
    this.render();
    requestAnimationFrame((t) => this.loop(t));
  }
  update(dt) {
    this.player.isADS = this.input.rightDown;
    this.ui.setADS(this.player.isADS);
    this.player.update(dt, this.input);
    this.waveManager.update(dt, this.zombies);

    if (this.waveManager.wave !== this.prevWave) {
      this.prevWave = this.waveManager.wave;
      this.player.grenades = CONFIG.grenadeCount;
    }

    for (const zombie of this.zombies) {
      zombie.update(dt, this.player, this.map);
      if (zombie.tryAttack(this.player)) {
        this.player.takeDamage(10 + this.waveManager.wave * 0.5);
        this.damageFlash = 0.35;
      }
    }
    this.zombies = this.zombies.filter((z) => z.health > 0);
    if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt * 2);

    if (this.input.mouseDown) this.shoot();
    if (this.hitmarkerTimer > 0) this.hitmarkerTimer -= dt;
    if (this.grenadeCooldown > 0) this.grenadeCooldown -= dt;

    for (const grenade of this.grenades) {
      grenade.update(dt, this.map);
      if (grenade.shouldExplode()) {
        grenade.exploded = true;
        this.explodeGrenade(grenade);
      }
    }
    this.grenades = this.grenades.filter((g) => !g.exploded);

    if (this.zombies.length > 0) this.audio.groan();
  }
  shoot() {
    const weapon = this.player.weapon;
    if (!weapon.shoot()) return;
    this.audio.shoot();
    const hits = this.fireRay(weapon);
    if (hits > 0) {
      this.hitmarkerTimer = CONFIG.hitmarkerDuration;
      this.audio.hitmarker();
    }
    if (weapon.ammo <= 0) weapon.startReload();
  }
  fireRay(weapon) {
    let hits = 0;
    for (let p = 0; p < weapon.pellets; p += 1) {
      const spread = Utils.randRange(-weapon.spread, weapon.spread);
      const angle = this.player.yaw + spread;
      let dist = 0;
      let hitZombie = null;
      while (dist < CONFIG.maxDepth) {
        dist += 0.05;
        const rx = this.player.x + Math.cos(angle) * dist;
        const ry = this.player.y + Math.sin(angle) * dist;
        if (this.map.isWall(rx, ry)) break;
        for (const zombie of this.zombies) {
          if (Utils.dist(rx, ry, zombie.x, zombie.y) < 0.4) {
            hitZombie = zombie;
            break;
          }
        }
        if (hitZombie) break;
      }
      if (hitZombie) {
        const killed = hitZombie.takeDamage(weapon.damage);
        this.player.points += killed ? 60 : 10;
        hits += 1;
      }
    }
    return hits;
  }
  throwGrenade() {
    if (this.player.grenades <= 0 || this.grenadeCooldown > 0) return;
    this.player.grenades -= 1;
    this.grenadeCooldown = CONFIG.grenadeCooldown;
    this.grenades.push(new Grenade(this.player.x, this.player.y, this.player.yaw));
  }
  explodeGrenade(grenade) {
    this.audio.grenade();
    for (const zombie of this.zombies) {
      const d = Utils.dist(grenade.x, grenade.y, zombie.x, zombie.y);
      if (d < CONFIG.grenadeRadius) {
        const damage = Utils.lerp(60, 20, d / CONFIG.grenadeRadius);
        const killed = zombie.takeDamage(damage);
        if (killed) this.player.points += 80;
      }
    }
  }
  interact() {
    const prompt = this.shop.getPrompt(this.player);
    this.shop.handleInteract(this.player, prompt);
    if (prompt && prompt.action === 'ammo') {
      this.player.grenades = Math.min(CONFIG.grenadeCount, this.player.grenades + 1);
    }
  }
  render() {
    this.renderer.render(this.player, this.zombies, this.grenades, this.damageFlash);
    const prompt = this.shop.getPrompt(this.player);
    this.ui.update(this.player, this.waveManager, prompt ? prompt.text : '', this.hitmarkerTimer > 0);
    this.renderMinimap();
    if (this.player.health <= 0) {
      const ctx = this.renderer.ctx;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.fillStyle = '#ff4444';
      ctx.font = '48px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('You Died', this.canvas.width / 2, this.canvas.height / 2);
    }
  }
  renderMinimap() {
    const mm = this.ui.minimap;
    const ctx = mm.getContext('2d');
    const scale = mm.width / this.map.width;
    ctx.clearRect(0, 0, mm.width, mm.height);
    for (let y = 0; y < this.map.height; y += 1) {
      for (let x = 0; x < this.map.width; x += 1) {
        if (this.map.grid[y][x] === '1') {
          ctx.fillStyle = '#444';
          ctx.fillRect(x * scale, y * scale, scale, scale);
        }
      }
    }
    if (!this.map.door.open) {
      ctx.fillStyle = '#888';
      ctx.fillRect(this.map.door.x * scale, this.map.door.y * scale, scale, scale);
    }
    ctx.fillStyle = '#00aaff';
    ctx.beginPath();
    ctx.arc(this.player.x * scale, this.player.y * scale, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#77ff77';
    for (const zombie of this.zombies) {
      ctx.fillRect(zombie.x * scale - 2, zombie.y * scale - 2, 4, 4);
    }
    ctx.fillStyle = '#ffaa33';
    for (const grenade of this.grenades) {
      ctx.fillRect(grenade.x * scale - 2, grenade.y * scale - 2, 4, 4);
    }
  }
}

// Start Game
new Game();
