/* Mystery Island 3D — input: keyboard + mouse on desktop, touch on mobile. */
(function (root) {
  'use strict';

  function create(opts) {
    const canvas = opts.canvas;
    const doc = opts.document || root.document;
    const input = { forward: 0, right: 0, lookX: 0, lookY: 0, sprint: false };
    const keys = Object.create(null);
    const handlers = opts.handlers || {};
    const isTouch = 'ontouchstart' in root || (root.matchMedia && root.matchMedia('(pointer: coarse)').matches);

    const touch = {
      moveId: null,
      moveOrigin: { x: 0, y: 0 },
      lookId: null,
      lookLast: { x: 0, y: 0 },
      vector: { x: 0, y: 0 },
    };

    /* ------------------------------------------------------------ keyboard */
    function onKeyDown(e) {
      const k = e.key.toLowerCase();
      keys[k] = true;
      if (k === 'f') { if (handlers.onFlashlight) handlers.onFlashlight(); }
      if (k === 'e' || k === ' ') { if (handlers.onInteract) handlers.onInteract(); e.preventDefault(); }
      if (k === 'escape') { if (handlers.onPause) handlers.onPause(); }
      if (k === 'm') { if (handlers.onMute) handlers.onMute(); }
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(k) !== -1) {
        e.preventDefault();
      }
    }
    function onKeyUp(e) {
      keys[e.key.toLowerCase()] = false;
    }

    function pollKeys() {
      const f = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0);
      const r = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
      input.sprint = !!(keys.shift);
      if (isTouch && (touch.vector.x || touch.vector.y)) return;
      input.forward = f;
      input.right = r;
    }

    /* --------------------------------------------------------------- mouse */
    function onMouseMove(e) {
      if (doc.pointerLockElement !== canvas) return;
      input.lookX += e.movementX || 0;
      input.lookY += e.movementY || 0;
    }
    function onClick() {
      if (doc.pointerLockElement !== canvas && canvas.requestPointerLock) {
        const p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      }
    }

    /* --------------------------------------------------------------- touch */
    function onTouchStart(e) {
      const half = (root.innerWidth || 800) / 2;
      for (let i = 0; i < e.changedTouches.length; i += 1) {
        const t = e.changedTouches[i];
        if (t.clientX < half && touch.moveId === null) {
          touch.moveId = t.identifier;
          touch.moveOrigin.x = t.clientX;
          touch.moveOrigin.y = t.clientY;
        } else if (t.clientX >= half && touch.lookId === null) {
          touch.lookId = t.identifier;
          touch.lookLast.x = t.clientX;
          touch.lookLast.y = t.clientY;
        }
      }
    }
    function onTouchMove(e) {
      for (let i = 0; i < e.changedTouches.length; i += 1) {
        const t = e.changedTouches[i];
        if (t.identifier === touch.moveId) {
          const dx = (t.clientX - touch.moveOrigin.x) / 62;
          const dy = (t.clientY - touch.moveOrigin.y) / 62;
          touch.vector.x = Math.max(-1, Math.min(1, dx));
          touch.vector.y = Math.max(-1, Math.min(1, dy));
          input.right = touch.vector.x;
          input.forward = -touch.vector.y;
        } else if (t.identifier === touch.lookId) {
          input.lookX += (t.clientX - touch.lookLast.x) * 1.5;
          input.lookY += (t.clientY - touch.lookLast.y) * 1.5;
          touch.lookLast.x = t.clientX;
          touch.lookLast.y = t.clientY;
        }
      }
      if (e.cancelable) e.preventDefault();
    }
    function onTouchEnd(e) {
      for (let i = 0; i < e.changedTouches.length; i += 1) {
        const t = e.changedTouches[i];
        if (t.identifier === touch.moveId) {
          touch.moveId = null;
          touch.vector.x = 0;
          touch.vector.y = 0;
          input.forward = 0;
          input.right = 0;
        }
        if (t.identifier === touch.lookId) touch.lookId = null;
      }
    }

    function bind() {
      doc.addEventListener('keydown', onKeyDown);
      doc.addEventListener('keyup', onKeyUp);
      doc.addEventListener('mousemove', onMouseMove);
      canvas.addEventListener('click', onClick);
      canvas.addEventListener('touchstart', onTouchStart, { passive: true });
      canvas.addEventListener('touchmove', onTouchMove, { passive: false });
      canvas.addEventListener('touchend', onTouchEnd);
      canvas.addEventListener('touchcancel', onTouchEnd);
    }

    function unbind() {
      doc.removeEventListener('keydown', onKeyDown);
      doc.removeEventListener('keyup', onKeyUp);
      doc.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
    }

    bind();

    return {
      input,
      isTouch,
      update: pollKeys,
      release() {
        input.forward = 0;
        input.right = 0;
        input.lookX = 0;
        input.lookY = 0;
        touch.vector.x = 0;
        touch.vector.y = 0;
      },
      exitPointerLock() {
        if (doc.pointerLockElement === canvas && doc.exitPointerLock) doc.exitPointerLock();
      },
      destroy: unbind,
      joystick: touch.vector,
    };
  }

  root.MI = root.MI || {};
  root.MI.controls = { create };
})(typeof window !== 'undefined' ? window : globalThis);
