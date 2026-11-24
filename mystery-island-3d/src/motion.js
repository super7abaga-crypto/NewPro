/* Mystery Island 3D — survivor motion.
 *
 * Pure state machine: no THREE, no DOM, no timers of its own. The caller feeds it
 * a timestep, the input, and a small world interface, and gets back a position and
 * a state name. That makes every rule here testable without a browser.
 *
 * World interface (all optional, sane defaults if omitted):
 *   groundAt(x, z)        -> number   height of the walkable surface
 *   waterAt(x, z)         -> { level, depth } | null
 *   ledgeAt(x, z, dir)    -> { y, out } | null    a grabbable lip in front
 *   blockedAt(x, z, y)    -> boolean  something solid at that point
 *
 * Input vectors are world-space: input.forward is the +x component and input.right
 * is the +z component. player.js resolves camera-relative input into these.
 */
(function (root) {
  'use strict';

  const CFG = {
    gravity: 22,
    jumpSpeed: 7.4,
    doubleJumpSpeed: 6.6,
    walk: 2.7,
    run: 5.2,
    rollTime: 0.55,
    rollCooldown: 0.4,
    rollSpeed: 7.4,
    coyote: 0.12,
    jumpBuffer: 0.14,
    staminaMax: 1,
    staminaDrain: 0.26,
    staminaRegen: 0.2,
    staminaGate: 0.12,
    breathMax: 1,
    breathDrain: 0.16,
    breathRegen: 0.42,
    swimSpeed: 2.3,
    diveSpeed: 2.7,
    buoyancy: 3.4,
    stepUp: 0.45,
    ledgeReach: 0.7,
    vaultReach: 0.9,
    vaultHeight: 1.1,
    hangDrop: 1.6,
  };

  function create(options) {
    const C = Object.assign({}, CFG, options || {});
    const s = {
      x: 0, y: 0, z: 0,
      vy: 0,
      speed: 0,
      grounded: true,
      jumps: 0,
      coyote: 0,
      buffer: 0,
      rolling: 0,
      rollCd: 0,
      stamina: C.staminaMax,
      tired: false,
      inWater: false,
      submerged: false,
      breath: C.breathMax,
      drowning: false,
      hang: null,
      climbing: 0,
      vaulting: 0,
      landTimer: 0,
      state: 'idle',
      events: [],
    };

    const world = {
      groundAt: () => 0,
      waterAt: () => null,
      ledgeAt: () => null,
      blockedAt: () => false,
    };

    function bind(w) {
      if (!w) return;
      if (typeof w.groundAt === 'function') world.groundAt = w.groundAt;
      if (typeof w.waterAt === 'function') world.waterAt = w.waterAt;
      if (typeof w.ledgeAt === 'function') world.ledgeAt = w.ledgeAt;
      if (typeof w.blockedAt === 'function') world.blockedAt = w.blockedAt;
    }

    function emit(name, detail) {
      s.events.push({ name, detail: detail || null });
    }

    function place(x, y, z) {
      s.x = x; s.y = y; s.z = z;
      s.vy = 0;
      s.grounded = true;
      s.jumps = 0;
      s.state = 'idle';
    }

    function waterHere() {
      const w = world.waterAt(s.x, s.z);
      if (!w) return null;
      const surface = w.level;
      const bottom = w.level - w.depth;
      if (s.y > surface + 0.05) return null;
      if (s.y < bottom - 2) return null;
      return { surface, bottom };
    }

    /* ---------------------------------------------------------------- water */
    function updateWater(dt, input) {
      const w = waterHere();
      if (!w) {
        if (s.inWater) { emit('exitwater'); s.inWater = false; s.submerged = false; }
        if (s.breath < C.breathMax) s.breath = Math.min(C.breathMax, s.breath + C.breathRegen * dt);
        if (s.drowning && s.breath > 0.25) s.drowning = false;
        return false;
      }
      if (!s.inWater) { emit('enterwater'); s.inWater = true; s.jumps = 0; }

      const dive = !!(input && input.down);
      const wantUp = !!(input && input.up);
      s.submerged = dive || s.y < w.surface - 1.15;

      if (s.submerged) {
        s.breath -= C.breathDrain * dt;
        if (s.breath <= 0) {
          s.breath = 0;
          if (!s.drowning) { s.drowning = true; emit('drown'); }
        }
        // Underwater there is no gravity: holding dive sinks, releasing it rises.
        s.vy = dive ? -C.diveSpeed : wantUp ? C.swimSpeed : C.swimSpeed * 0.7;
        s.y = Math.max(w.bottom, Math.min(w.surface - 0.9, s.y + s.vy * dt));
        s.submerged = s.y < w.surface - 1.15;
      } else {
        s.breath = Math.min(C.breathMax, s.breath + C.breathRegen * dt * 2);
        if (s.drowning && s.breath > 0.25) s.drowning = false;
        // floating at the surface
        s.y += (w.surface - 1.05 - s.y) * Math.min(1, dt * C.buoyancy);
        s.vy = 0;
        if (dive) s.y -= dt * C.diveSpeed * 0.6;
      }
      s.grounded = false;
      return true;
    }

    /* ---------------------------------------------------------------- ledges */
    function tryGrab(input, dir) {
      if (!s.hang) {
        if (!(input && input.grab)) return false;
        if (s.grounded || s.vy > 1.2) return false;
        const ledge = world.ledgeAt(s.x, s.z, dir);
        if (!ledge) return false;
        if (ledge.y < s.y + 0.4 || ledge.y > s.y + 2.3) return false;
        s.hang = { x: s.x, y: ledge.y, z: s.z, dir, t: 0 };
        s.vy = 0;
        s.y = ledge.y - 1.55;
        s.jumps = 0;
        emit('hang');
        return true;
      }
      return true;
    }

    function updateHang(dt, input) {
      if (!s.hang) return false;
      s.hang.t += dt;
      if (input && input.up) { s.climbing = 1; emit('climb'); s.hang = null; return true; }
      if (input && input.down) { s.hang = null; s.vy = -1; emit('drop'); return true; }
      if (input && input.jump) {
        s.hang = null;
        s.vy = C.jumpSpeed * 0.85;
        s.jumps = 1;
        emit('jump');
        return true;
      }
      return true;
    }

    /* ----------------------------------------------------------------- roll */
    function startRoll(input) {
      if (!(input && input.roll)) return false;
      if (s.rolling > 0 || s.rollCd > 0) return false;
      if (s.inWater || s.hang) return false;
      if (s.stamina < C.staminaGate) { s.tired = true; return false; }
      s.rolling = C.rollTime;
      s.stamina = Math.max(0, s.stamina - 0.18);
      emit('roll');
      return true;
    }

    /* --------------------------------------------------------------- update */
    function update(dt, input, w) {
      if (w) bind(w);
      const i = input || {};
      s.events.length = 0;

      const f = typeof i.forward === 'number' ? i.forward : 0;
      const r = typeof i.right === 'number' ? i.right : 0;
      const mag = Math.min(1, Math.hypot(f, r));

      s.rolling = Math.max(0, s.rolling - dt);
      s.rollCd = Math.max(0, s.rollCd - dt);
      s.landTimer = Math.max(0, s.landTimer - dt);
      s.coyote = Math.max(0, s.coyote - dt);
      s.buffer = Math.max(0, s.buffer - dt);
      if (i.jump) s.buffer = C.jumpBuffer;

      const dir = i.facing === undefined ? 0 : i.facing;

      if (updateHang(dt, i)) {
        s.state = 'hang';
        return s;
      }
      if (s.climbing > 0) {
        // a climb takes 0.45 s and ends standing on top of the lip
        s.climbing = Math.max(0, s.climbing - dt / 0.45);
        s.state = 'climb';
        if (s.climbing === 0) {
          const g = world.groundAt(s.x, s.z);
          s.y = Math.max(s.y, g);
          s.grounded = true;
          s.vy = 0;
        }
        return s;
      }
      if (s.vaulting > 0) {
        s.vaulting = Math.max(0, s.vaulting - dt / 0.5);
        s.state = 'vault';
        if (s.vaulting === 0) { s.grounded = true; s.vy = 0; }
        return s;
      }

      const swimming = updateWater(dt, i);

      if (!swimming && tryGrab(i, dir)) {
        s.state = 'hang';
        return s;
      }

      startRoll(i);

      /* --------------------------------------------------------- horizontal */
      let speed = 0;
      if (s.rolling > 0) {
        speed = C.rollSpeed;
      } else if (swimming) {
        speed = C.swimSpeed * mag;
      } else {
        const wantRun = !!(i.run || i.sprint) && s.stamina > C.staminaGate;
        speed = (wantRun ? C.run : C.walk) * mag;
        if (wantRun && mag > 0.1) {
          s.stamina = Math.max(0, s.stamina - C.staminaDrain * dt);
          if (s.stamina <= C.staminaGate && !s.tired) { s.tired = true; emit('tired'); }
        }
      }
      if (!(i.run || i.sprint) || mag < 0.1) {
        s.stamina = Math.min(C.staminaMax, s.stamina + C.staminaRegen * dt);
        if (s.stamina > C.staminaGate * 2) s.tired = false;
      }

      const targetSpeed = speed;
      s.speed = s.speed + (targetSpeed - s.speed) * Math.min(1, dt * 9);
      if (s.speed < 0.02) s.speed = 0;
      speed = s.speed;

      if (mag > 0.01 && !swimming) {
        const nx = s.x + (f / mag) * speed * dt;
        const nz = s.z + (r / mag) * speed * dt;
        if (!world.blockedAt(nx, s.z, s.y + 0.9)) s.x = nx;
        if (!world.blockedAt(s.x, nz, s.y + 0.9)) s.z = nz;
      } else if (mag > 0.01) {
        const nx = s.x + (f / mag) * speed * dt;
        const nz = s.z + (r / mag) * speed * dt;
        s.x = nx; s.z = nz;
      }

      /* ------------------------------------------------------------ vertical */
      if (!swimming) {
        const ground = world.groundAt(s.x, s.z);

        if (s.grounded && s.y > ground + C.stepUp) {
          // walked off an edge
          s.grounded = false;
          s.coyote = C.coyote;
          s.vy = 0;
        }

        if (s.buffer > 0) {
          if (s.grounded || s.coyote > 0) {
            s.vy = C.jumpSpeed;
            s.grounded = false;
            s.coyote = 0;
            s.buffer = 0;
            s.jumps = 1;
            emit('jump');
          } else if (s.jumps === 1) {
            s.vy = C.doubleJumpSpeed;
            s.jumps = 2;
            s.buffer = 0;
            emit('doublejump');
          } else if (s.jumps === 0) {
            // stepping off a ledge still leaves one jump in the air
            s.vy = C.jumpSpeed;
            s.jumps = 1;
            s.buffer = 0;
            emit('jump');
          }
        }

        if (!s.grounded) {
          s.vy -= C.gravity * dt;
          s.y += s.vy * dt;
        } else {
          s.y = ground;
          s.vy = 0;
        }

        if (s.y <= ground) {
          if (!s.grounded && s.vy < -2) { emit('land', Math.abs(s.vy)); s.landTimer = 0.22; }
          s.y = ground;
          s.vy = 0;
          s.grounded = true;
          s.jumps = 0;
        }

        // vaulting over a low obstacle instead of walking into it
        if (s.grounded && mag > 0.5 && (i.run || i.sprint)) {
          const lip = world.ledgeAt(s.x, s.z, dir);
          if (lip && lip.y > s.y + 0.35 && lip.y < s.y + C.vaultHeight) {
            s.vaulting = 1;
            s.y = lip.y + 0.05;
            s.grounded = false;
            emit('vault');
          }
        }
      }

      if (s.rolling > 0 && s.rollCd === 0 && s.rolling <= dt) s.rollCd = C.rollCooldown;

      /* --------------------------------------------------------------- state */
      s.state = s.rolling > 0 ? 'roll'
        : swimming ? (s.submerged ? 'dive' : 'swim')
        : !s.grounded ? (s.vy > 0.5 ? 'rise' : 'fall')
        : s.landTimer > 0 ? 'land'
        : mag < 0.05 ? 'idle'
        : s.speed > C.walk * 1.05 ? 'run' : 'walk';

      return s;
    }

    return {
      state: s,
      config: C,
      place,
      update,
      bind,
      takeEvents() {
        const out = s.events.slice();
        s.events.length = 0;
        return out;
      },
      jump() { s.buffer = C.jumpBuffer; },
      roll() { s.rolling = C.rollTime; },
    };
  }

  root.MI = root.MI || {};
  root.MI.motion = { create, CFG };
})(typeof window !== 'undefined' ? window : globalThis);
