/* Mystery Island 3D — roadmap, objective guidance and minimap.
 *
 * Pure logic, no rendering side effects beyond the canvas it is handed, so the
 * guidance can be tested without a browser. Nothing here reveals horror events:
 * the roadmap only ever points at items and exits that the rules already expose.
 */
(function (root) {
  'use strict';

  /* Where each room sits on the roadmap, in 0..1 space (y grows southwards). */
  const MAP = {
    Beach: { x: 0.30, y: 0.87 },
    Jungle: { x: 0.30, y: 0.62 },
    Cave: { x: 0.30, y: 0.37 },
    'Old Bridge': { x: 0.58, y: 0.37 },
    Lighthouse: { x: 0.82, y: 0.16 },
  };

  const ORDER = ['Beach', 'Jungle', 'Cave', 'Old Bridge', 'Lighthouse'];

  const DIR_LABEL = {
    north: 'north', south: 'south', east: 'east', west: 'west',
  };

  function rules() {
    return root.MI.rules;
  }

  function neighbours(room) {
    const data = rules().LOCATIONS[room];
    if (!data) return [];
    return Object.keys(data.exits).map((dir) => ({ dir, to: data.exits[dir].to }));
  }

  /* Breadth-first route between rooms, used for the dashed roadmap trail. */
  function pathBetween(from, to) {
    if (!MAP[from] || !MAP[to]) return [];
    if (from === to) return [from];
    const queue = [[from]];
    const seen = {};
    seen[from] = true;
    while (queue.length) {
      const path = queue.shift();
      const last = path[path.length - 1];
      const next = neighbours(last);
      for (let i = 0; i < next.length; i += 1) {
        const hop = next[i];
        if (seen[hop.to]) continue;
        const candidate = path.concat(hop.to);
        if (hop.to === to) return candidate;
        seen[hop.to] = true;
        queue.push(candidate);
      }
    }
    return [];
  }

  /* The overall goal, derived only from what the player is carrying. */
  function goal(state) {
    const has = (item) => state.inventory.indexOf(item) !== -1;
    if (!has('rope')) {
      return {
        room: 'Jungle', anchor: 'item-rope', kind: 'item', short: 'Rope',
        label: 'Find the rope in the Jungle',
      };
    }
    if (!has('lantern')) {
      return {
        room: 'Cave', anchor: 'item-lantern', kind: 'item', short: 'Lantern',
        label: 'Find the lantern in the Cave',
      };
    }
    return {
      room: 'Lighthouse', anchor: 'beacon', kind: 'final', short: 'Beacon',
      label: 'Cross the bridge and light the beacon',
    };
  }

  /* The immediate thing to walk to: an exit until you stand in the goal room. */
  function step(state) {
    const target = goal(state);
    if (state.location === target.room) {
      return {
        room: target.room, anchor: target.anchor, kind: target.kind,
        short: target.short, label: target.label, sameRoom: true,
        path: [state.location], goal: target,
      };
    }
    const path = pathBetween(state.location, target.room);
    if (path.length < 2) {
      return Object.assign({}, target, { sameRoom: false, path });
    }
    const nextRoom = path[1];
    const exit = neighbours(state.location).filter((n) => n.to === nextRoom)[0];
    return {
      room: nextRoom,
      anchor: 'exit-' + exit.dir,
      kind: target.kind,
      short: target.short,
      sameRoom: false,
      path,
      goal: target,
      label: 'Head ' + (DIR_LABEL[exit.dir] || exit.dir) + ' towards the ' + nextRoom,
    };
  }

  /* World bearing to a point, 0 = north (-z), growing clockwise. */
  function bearing(from, to) {
    return Math.atan2(to.x - from.x, from.z - to.z);
  }

  /* Rotation for an up-pointing arrow so it points at the target on screen. */
  function arrowAngle(from, to, cameraYaw) {
    return bearing(from, to) + (cameraYaw || 0);
  }

  function distance(from, to) {
    return Math.hypot(to.x - from.x, to.z - from.z);
  }

  function compass(radians) {
    const deg = ((radians * 180) / Math.PI + 360) % 360;
    const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
    return names[Math.round(deg / 45) % 8];
  }

  /* Project a world position into its room's patch of the roadmap. */
  function projectToMap(room, point) {
    const node = MAP[room];
    if (!node) return { x: 0.5, y: 0.5 };
    const spread = 0.085;
    const x = node.x + ((point ? point.x : 0) / 46) * spread;
    const y = node.y + ((point ? point.z : 0) / 46) * spread;
    return { x, y };
  }

  /* ------------------------------------------------------------------ draw */
  function drawMinimap(ctx, opts) {
    if (!ctx) return;
    const size = opts.size || 132;
    const state = opts.state;
    const player = opts.player || { x: 0, z: 0 };
    const guidance = opts.step || step(state);
    const dpr = opts.dpr || 1;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    ctx.fillStyle = 'rgba(6, 10, 14, 0.82)';
    ctx.fillRect(0, 0, size, size);

    const at = (p) => ({ x: p.x * size, y: p.y * size });

    /* roads */
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(120, 150, 170, 0.30)';
    ORDER.forEach((room) => {
      neighbours(room).forEach((hop) => {
        if (ORDER.indexOf(hop.to) < ORDER.indexOf(room)) return;
        const a = at(MAP[room]);
        const b = at(MAP[hop.to]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });
    });

    /* the route still to walk, dashed and warm */
    const trail = guidance.path || [];
    if (trail.length > 1) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(255, 168, 82, 0.85)';
      ctx.beginPath();
      trail.forEach((room, i) => {
        const p = at(MAP[room]);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      ctx.restore();
    }

    /* rooms */
    ORDER.forEach((room) => {
      const p = at(MAP[room]);
      const here = room === state.location;
      const done = trail.indexOf(room) !== -1 && !here;
      ctx.beginPath();
      ctx.arc(p.x, p.y, here ? 5.5 : 3.6, 0, Math.PI * 2);
      ctx.fillStyle = here ? '#ffa852' : done ? 'rgba(255, 168, 82, 0.55)' : 'rgba(150, 175, 190, 0.55)';
      ctx.fill();
      if (here) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 168, 82, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.font = '9px system-ui, sans-serif';
      ctx.fillStyle = here ? 'rgba(255, 214, 170, 0.95)' : 'rgba(150, 175, 190, 0.6)';
      ctx.textAlign = 'center';
      const short = room === 'Old Bridge' ? 'Bridge' : room;
      ctx.fillText(short, p.x, p.y + 16);
    });

    /* objective marker inside the current room */
    if (guidance.sameRoom && opts.anchor) {
      const spot = at(projectToMap(state.location, opts.anchor));
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#8ef0c0';
      ctx.fill();
    }

    /* the player */
    const me = at(projectToMap(state.location, player));
    ctx.beginPath();
    ctx.arc(me.x, me.y, 3.4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
  }

  root.MI = root.MI || {};
  root.MI.nav = {
    MAP, ORDER, neighbours, pathBetween, goal, step,
    bearing, arrowAngle, distance, compass, projectToMap, drawMinimap,
  };
})(typeof window !== 'undefined' ? window : globalThis);
