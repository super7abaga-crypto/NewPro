/* Mystery Island 3D — presentation layer: screens, HUD, settings widgets.
 * Knows nothing about the rules; main.js tells it what to display.
 */
(function (root) {
  'use strict';

  function create(opts) {
    const doc = root.document;
    const handlers = opts.handlers || {};
    const $ = (id) => doc.getElementById(id);
    const screens = ['menu', 'settings', 'credits', 'end', 'pause', 'survivor'];
    let sayTimer = 0;
    let promptKeyDefault = 'E';

    function show(name) {
      screens.forEach((s) => {
        const el = $('screen-' + s);
        if (el) el.classList.toggle('on', s === name);
      });
    }
    function hideScreens() {
      screens.forEach((s) => {
        const el = $('screen-' + s);
        if (el) el.classList.remove('on');
      });
    }

    /* -------------------------------------------------------------- boot */
    function setBoot(pct, text) {
      const bar = $('bootBar');
      if (bar) bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
      if (text) {
        const t = $('bootText');
        if (t) t.textContent = text;
      }
    }
    function bootDone() {
      const boot = $('boot');
      if (boot) {
        boot.style.transition = 'opacity .6s';
        boot.style.opacity = '0';
        setTimeout(() => { boot.style.display = 'none'; }, 620);
      }
    }
    function fatal(message, detail) {
      const box = $('errorBox');
      const boot = $('boot');
      if (boot) { boot.style.opacity = '1'; boot.style.display = 'flex'; }
      const t = $('bootText');
      if (t) t.textContent = 'Could not start the game';
      if (box) {
        box.style.display = 'block';
        box.innerHTML = '<b>' + message + '</b><br />' + (detail || '');
      }
    }

    /* --------------------------------------------------------------- HUD */
    const hud = {
      on() { const h = $('hud'); if (h) h.classList.add('on'); },
      off() { const h = $('hud'); if (h) h.classList.remove('on'); },
      location(name) { const el = $('hud-location'); if (el) el.textContent = name; },
      objective(text) { const el = $('hud-objective'); if (el) el.textContent = text || ''; },
      energy(value, max) {
        const el = $('hud-energy');
        if (!el) return;
        if (el.children.length !== max) {
          el.innerHTML = '';
          for (let i = 0; i < max; i += 1) {
            const pip = doc.createElement('i');
            pip.className = 'pip';
            el.appendChild(pip);
          }
        }
        Array.prototype.forEach.call(el.children, (pip, i) => {
          pip.className = 'pip' + (i < value ? (value <= 1 ? ' on crit' : ' on') : '');
        });
      },
      inventory(list) {
        const el = $('hud-inventory');
        if (!el) return;
        if (!list.length) {
          el.innerHTML = '<span class="chip">empty pockets</span>';
          return;
        }
        el.innerHTML = list
          .map((item) => '<span class="chip ' + item + '">' + item + '</span>')
          .join('');
      },
      guidance(info) {
        const arrow = $('guide-arrow');
        const text = $('guide-text');
        const meta = $('guide-meta');
        if (arrow && info && typeof info.angle === 'number') {
          arrow.style.transform = 'rotate(' + info.angle.toFixed(3) + 'rad)';
        }
        if (text) text.textContent = (info && info.text) || '';
        if (meta) meta.textContent = (info && info.meta) || '';
      },
      prompt(text) {
        const el = $('prompt');
        const span = $('prompt-text');
        if (!el || !span) return;
        if (!text) { el.classList.remove('on'); return; }
        span.textContent = text;
        el.classList.add('on');
      },
      promptKey(key) {
        const el = $('prompt-key');
        if (el) el.textContent = key;
        promptKeyDefault = key;
      },
      say(text, ms) {
        const el = $('subtitle');
        if (!el || !text) return;
        el.textContent = text;
        el.classList.add('on');
        clearTimeout(sayTimer);
        sayTimer = setTimeout(() => el.classList.remove('on'), ms || 5200);
      },
    };

    function flashDamage() {
      const v = $('vignette');
      if (!v) return;
      v.classList.add('on');
      setTimeout(() => v.classList.remove('on'), 480);
    }
    function lightning() {
      const f = $('flash');
      if (!f) return;
      f.style.opacity = '0.5';
      setTimeout(() => { f.style.opacity = '0'; }, 90);
      setTimeout(() => { f.style.opacity = '0.28'; }, 150);
      setTimeout(() => { f.style.opacity = '0'; }, 260);
    }
    function fade(ms) {
      const f = $('fade');
      if (!f) return Promise.resolve();
      const dur = ms || 220;
      f.style.transition = 'opacity ' + dur + 'ms ease';
      f.style.opacity = '1';
      return new Promise((resolve) => {
        setTimeout(() => {
          f.style.opacity = '0';
          setTimeout(resolve, dur);
        }, dur);
      });
    }

    function end(result) {
      const scr = $('screen-end');
      if (scr) {
        scr.classList.toggle('win', !!result.won);
        scr.classList.toggle('lose', !result.won);
      }
      const title = $('endTitle');
      if (title) title.textContent = result.title || (result.won ? 'You escaped' : 'The island keeps you');
      const text = $('endText');
      if (text) text.textContent = result.text || '';
      show('end');
      hud.off();
    }

    function touch(on) {
      const el = $('touch');
      if (el) el.classList.toggle('on', !!on);
      hud.promptKey(on ? 'Tap' : 'E');
    }

    function joystick(x, y) {
      const knob = $('joyKnob');
      if (!knob) return;
      knob.style.transform = 'translate(' + x * 30 + 'px,' + y * 30 + 'px)';
    }

    function setContinueMeta(text, enabled) {
      const meta = $('continueMeta');
      if (meta) meta.textContent = text;
      const btn = $('btn-continue');
      if (btn) btn.disabled = !enabled;
    }

    function readSettings() {
      return {
        volume: Number($('set-volume').value),
        brightness: Number($('set-bright').value),
        look: Number($('set-look').value),
        quality: $('set-quality').value,
        subtitles: $('set-subtitles').checked,
      };
    }
    function bindSettings(settings) {
      $('set-volume').value = settings.volume;
      $('set-bright').value = settings.brightness;
      $('set-look').value = settings.look;
      $('set-quality').value = settings.quality;
      $('set-subtitles').checked = !!settings.subtitles;
      ['set-volume', 'set-bright', 'set-look', 'set-quality', 'set-subtitles'].forEach((id) => {
        const el = $(id);
        if (el) el.addEventListener('input', () => {
          if (handlers.onSettingsChange) handlers.onSettingsChange(readSettings());
        });
      });
    }

    /* ------------------------------------------------- survivor creation */
    const survivor = {
      open(prefill) {
        show('survivor');
        survivor.error('');
        survivor.busy(false); // a previous run may have left it disabled
        survivor.character = survivor.character || 'castaway';
        const input = $('survivor-name');
        if (input) {
          input.value = prefill || '';
          setTimeout(() => { try { input.focus(); } catch (e) { /* ignore */ } }, 60);
        }
      },
      close() { survivor.error(''); },
      error(msg) {
        const el = $('survivor-error');
        if (!el) return;
        if (!msg) { el.classList.remove('show'); el.textContent = ''; return; }
        el.textContent = msg;
        el.classList.add('show');
      },
      value() {
        const input = $('survivor-name');
        return input ? input.value : '';
      },
      onSubmit(fn) {
        let firing = false;
        const fire = () => {
          // A click can also submit the form; collapse only that same-tick pair
          // so a genuine second attempt is never swallowed.
          if (firing) return;
          firing = true;
          setTimeout(() => { firing = false; }, 0);
          fn(survivor.value());
        };
        const form = $('form-survivor');
        if (form) form.addEventListener('submit', (e) => { e.preventDefault(); fire(); });
        const go = $('survivor-go');
        if (go) go.addEventListener('click', (e) => { e.preventDefault(); fire(); });
        const input = $('survivor-name');
        if (input) {
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); fire(); }
          });
          // The mobile keyboard halves the viewport; keep the button in reach.
          input.addEventListener('focus', () => {
            setTimeout(() => {
              const b = $('survivor-go');
              try { if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest' }); } catch (err) { /* ignore */ }
            }, 320);
          });
        }
      },
      busy(on) {
        const go = $('survivor-go');
        if (!go) return;
        go.disabled = !!on;
        go.textContent = on ? 'Stepping ashore...' : 'Step onto the beach';
      },
      onBack(fn) { bind('survivor-back', fn); },
      character: 'castaway',
      onCharacter(fn) {
        const cards = document.querySelectorAll('#surv-pick .surv-card');
        Array.prototype.forEach.call(cards, (card) => {
          card.addEventListener('click', () => {
            survivor.character = card.getAttribute('data-character') || 'castaway';
            Array.prototype.forEach.call(cards, (c) => {
              const on = c === card;
              c.classList.toggle('on', on);
              c.setAttribute('aria-checked', on ? 'true' : 'false');
            });
            if (fn) fn(survivor.character);
          });
        });
      },
    };

    /* ------------------------------------------------------------ wiring */
    const bind = (id, fn) => {
      const el = $(id);
      if (el && fn) el.addEventListener('click', fn);
    };
    bind('btn-new', handlers.onNew);
    bind('btn-continue', handlers.onContinue);
    bind('btn-settings', handlers.onSettings);
    bind('btn-credits', handlers.onCredits);
    bind('btn-settings-back', handlers.onBack);
    bind('btn-credits-back', handlers.onBack);
    bind('btn-resume', handlers.onResume);
    bind('btn-pause-settings', handlers.onPauseSettings);
    bind('btn-quit', handlers.onQuit);
    bind('btn-again', handlers.onAgain);
    bind('btn-to-menu', handlers.onToMenu);
    bind('btn-interact', handlers.onInteract);
    bind('btn-light', handlers.onFlashlight);
    bind('btn-pause', handlers.onPause);

    return {
      show, hideScreens, setBoot, bootDone, fatal,
      hud, survivor, flashDamage, lightning, fade, end, touch, joystick,
      setContinueMeta, readSettings, bindSettings,
      get promptKey() { return promptKeyDefault; },
    };
  }

  root.MI = root.MI || {};
  root.MI.ui = { create };
})(typeof window !== 'undefined' ? window : globalThis);
