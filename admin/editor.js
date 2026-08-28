/* NYC Fintech Women — admin: form state, block list, preview, downloads.
 * Classic script. Depends on WIF_TEMPLATES and WIF_TYPES being loaded first.
 */
(function () {
  'use strict';

  var T = window.WIF_TEMPLATES;
  var TYPES = window.WIF_TYPES;
  var META = window.WIF_TYPES_META;
  var STORAGE_KEY = 'wif.admin.draft.v1';

  var typeKey = (new URLSearchParams(location.search).get('type')) || 'fff';
  if (!TYPES[typeKey]) typeKey = 'fff';
  var def = TYPES[typeKey];

  var model = emptyModel();
  var slugTouched = false;
  var cover = { file: null, blobUrl: null, ext: 'jpg' };
  var previewTimer = null;

  var $ = function (id) { return document.getElementById(id); };

  function emptyModel() {
    var m = { type: typeKey, blocks: [] };
    def.fields.forEach(function (f) { m[f.key] = ''; });
    m.coverPath = '';
    return m;
  }

  /* ------------------------------------------------------------------ misc */

  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 1800);
  }

  function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = Math.max(el.scrollHeight, 38) + 'px';
  }

  /* file:// is not a secure context in some browsers, so clipboard access can
     fail outright — fall back through execCommand to a manual selection. */
  function copyText(text, sourceEl) {
    function fallback() {
      if (sourceEl) { sourceEl.focus(); sourceEl.select(); }
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      toast(ok ? 'Copied' : 'Select the text and press ⌘C');
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast('Copied'); }, fallback);
    } else {
      fallback();
    }
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* -------------------------------------------------------- model plumbing */

  /* The model the generator sees: the cover path resolves to the manual
     override, else the uploaded file's canonical name. */
  function resolved() {
    var m = {};
    Object.keys(model).forEach(function (k) { m[k] = model[k]; });
    m.slug = model.slug || T.slugify(model.name);
    m.coverPath = (model.coverPath || '').trim() ||
      ('images/fff-' + (m.slug || 'post') + '.' + outputExt());
    m.headshot = m.coverPath;
    return m;
  }

  function onChange() {
    save();
    schedulePreview();
    renderSnippets();
    renderImagePanel();
  }

  /* ------------------------------------------------------------- rendering */

  function renderFields() {
    var host = $('fields');
    host.innerHTML = '';
    def.fields.forEach(function (f) {
      var wrap = document.createElement('div');
      wrap.className = 'field';

      var label = document.createElement('label');
      label.setAttribute('for', 'f-' + f.key);
      label.innerHTML = f.label + (f.required ? ' <span class="req">*</span>' : '');
      wrap.appendChild(label);

      var input;
      if (f.type === 'textarea') {
        input = document.createElement('textarea');
        input.rows = f.rows || 4;
      } else {
        input = document.createElement('input');
        input.type = f.type === 'date' ? 'date' : (f.type === 'url' ? 'url' : 'text');
      }
      input.id = 'f-' + f.key;
      if (f.placeholder) input.placeholder = f.placeholder;
      if (f.maxlength) input.maxLength = f.maxlength;
      if (f.mono) input.className = 'mono';
      input.value = model[f.key] || '';

      if (f.prefix || f.suffix) {
        var affixed = document.createElement('div');
        affixed.className = 'affixed';
        if (f.prefix) {
          var pre = document.createElement('span');
          pre.className = 'affix';
          pre.textContent = f.prefix;
          affixed.appendChild(pre);
        }
        affixed.appendChild(input);
        if (f.suffix) {
          var suf = document.createElement('span');
          suf.className = 'affix';
          suf.textContent = f.suffix;
          affixed.appendChild(suf);
        }
        wrap.appendChild(affixed);
      } else {
        wrap.appendChild(input);
      }

      if (f.help) {
        var help = document.createElement('div');
        help.className = 'help';
        help.innerHTML = f.help;
        wrap.appendChild(help);
      }
      var warn = document.createElement('div');
      warn.className = 'warn';
      warn.style.display = 'none';
      wrap.appendChild(warn);

      input.addEventListener('input', function () {
        model[f.key] = input.value;

        if (f.key === 'name' && !slugTouched) {
          model.slug = T.slugify(input.value);
          var slugInput = $('f-slug');
          if (slugInput) slugInput.value = model.slug;
        }
        if (f.key === 'slug') slugTouched = true;

        // URL fields warn loudly rather than silently emitting '#'.
        if ((f.type === 'url' || f.key === 'ogImage') && input.value.trim()) {
          var bad = !T.isUrlSafe(input.value);
          warn.style.display = bad ? '' : 'none';
          warn.textContent = bad ? 'Not a usable URL — this will be dropped.' : '';
          wrap.classList.toggle('invalid', bad);
        } else {
          warn.style.display = 'none';
          wrap.classList.remove('invalid');
        }

        if (f.type === 'textarea') autoGrow(input);
        onChange();
      });

      if (f.type === 'textarea') setTimeout(function () { autoGrow(input); }, 0);
      host.appendChild(wrap);
    });
  }

  function renderBlocks() {
    var host = $('blocks');
    host.innerHTML = '';

    if (!model.blocks.length) {
      var empty = document.createElement('div');
      empty.className = 'blk-empty';
      empty.textContent = 'No body blocks yet — add a Q & A to start the interview.';
      host.appendChild(empty);
      return;
    }

    model.blocks.forEach(function (block, index) {
      var card = document.createElement('div');
      card.className = 'blk';

      var head = document.createElement('div');
      head.className = 'blk-head';
      head.innerHTML = '<span class="type">' + (META.BLOCK_LABELS[block.type] || block.type) + '</span>';

      head.appendChild(iconBtn('↑', 'Move up', index === 0, function () { move(index, -1); }));
      head.appendChild(iconBtn('↓', 'Move down', index === model.blocks.length - 1, function () { move(index, 1); }));
      head.appendChild(iconBtn('⧉', 'Duplicate', false, function () { duplicate(index); }));
      head.appendChild(iconBtn('✕', 'Delete', false, function () { remove(index); }));
      card.appendChild(head);

      var body = document.createElement('div');
      body.className = 'blk-body';

      (META.BLOCK_FIELDS[block.type] || []).forEach(function (f) {
        var wrap = document.createElement('div');
        wrap.className = 'field';

        if (f.control === 'checkbox') {
          var checkLabel = document.createElement('label');
          checkLabel.className = 'check';
          var check = document.createElement('input');
          check.type = 'checkbox';
          check.checked = !!block[f.key];
          check.addEventListener('change', function () {
            block[f.key] = check.checked;
            onChange();
          });
          checkLabel.appendChild(check);
          checkLabel.appendChild(document.createTextNode(' ' + f.label));
          wrap.appendChild(checkLabel);
          body.appendChild(wrap);
          return;
        }

        var label = document.createElement('label');
        label.textContent = f.label;
        wrap.appendChild(label);

        var input;
        if (f.control === 'text') {
          input = document.createElement('input');
          input.type = 'text';
          if (f.placeholder) input.placeholder = f.placeholder;
          input.value = block[f.key] || '';
        } else {
          input = document.createElement('textarea');
          input.rows = f.rows || 3;
          input.value = f.control === 'lines'
            ? (block[f.key] || []).join('\n')
            : (block[f.key] || '');
        }

        input.addEventListener('input', function () {
          block[f.key] = f.control === 'lines'
            ? input.value.split('\n')
            : input.value;
          if (input.tagName === 'TEXTAREA') autoGrow(input);
          onChange();
        });

        wrap.appendChild(input);
        if (f.help) {
          var help = document.createElement('div');
          help.className = 'help';
          help.textContent = f.help;
          wrap.appendChild(help);
        }
        body.appendChild(wrap);
        if (input.tagName === 'TEXTAREA') setTimeout(function () { autoGrow(input); }, 0);
      });

      card.appendChild(body);
      host.appendChild(card);
    });
  }

  function iconBtn(glyph, title, disabled, handler) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-icon';
    b.textContent = glyph;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.disabled = !!disabled;
    b.addEventListener('click', handler);
    return b;
  }

  function move(index, delta) {
    var target = index + delta;
    if (target < 0 || target >= model.blocks.length) return;
    var tmp = model.blocks[index];
    model.blocks[index] = model.blocks[target];
    model.blocks[target] = tmp;
    renderBlocks();
    onChange();
  }

  function duplicate(index) {
    var copy = JSON.parse(JSON.stringify(model.blocks[index]));
    copy.id = 'b' + Math.random().toString(36).slice(2, 9);
    model.blocks.splice(index + 1, 0, copy);
    renderBlocks();
    onChange();
  }

  function remove(index) {
    model.blocks.splice(index, 1);
    renderBlocks();
    onChange();
  }

  function renderAddRow() {
    var host = $('add-row');
    host.innerHTML = '';
    def.blocks.forEach(function (type) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-sm';
      b.textContent = '+ ' + (META.BLOCK_LABELS[type] || type);
      b.addEventListener('click', function () {
        model.blocks.push(META.blankBlock(type));
        renderBlocks();
        onChange();
      });
      host.appendChild(b);
    });
  }

  function renderSnippets() {
    var host = $('snippets');
    host.innerHTML = '';
    def.snippets(resolved()).forEach(function (snip) {
      var wrap = document.createElement('div');
      wrap.className = 'snip';

      var head = document.createElement('div');
      head.className = 'snip-head';
      var h3 = document.createElement('h3');
      h3.textContent = snip.label;
      head.appendChild(h3);

      var area = document.createElement('textarea');
      area.readOnly = true;
      area.value = snip.code;

      var copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'btn btn-sm';
      copy.textContent = 'Copy';
      copy.addEventListener('click', function () { copyText(snip.code, area); });
      head.appendChild(copy);
      wrap.appendChild(head);

      if (snip.note) {
        var note = document.createElement('p');
        note.className = 'note';
        note.textContent = snip.note;
        wrap.appendChild(note);
      }
      wrap.appendChild(area);
      host.appendChild(wrap);
    });
  }

  function renderImagePanel() {
    var m = resolved();
    $('img-path').textContent = m.coverPath;
    $('btn-img-download').disabled = !cover.file;

    var thumb = $('img-thumb');
    if (cover.blobUrl) {
      thumb.style.backgroundImage = 'url("' + cover.blobUrl + '")';
      thumb.textContent = '';
    } else if ((model.coverPath || '').trim()) {
      thumb.style.backgroundImage = 'url("../' + (model.coverPath || '').trim() + '")';
      thumb.textContent = '';
    } else {
      thumb.style.backgroundImage = '';
      thumb.textContent = 'No image';
    }
  }

  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 250);
  }

  function renderPreview() {
    $('preview').srcdoc = def.previewPage(resolved(), cover.blobUrl);
  }

  /* ------------------------------------------------------------- persistence */

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        model: model, slugTouched: slugTouched, ext: cover.ext, savedAt: Date.now()
      }));
      $('save-status').textContent = 'Draft saved';
    } catch (e) {
      $('save-status').textContent = 'Draft not saved (storage full?)';
    }
  }

  function loadDraft() {
    var raw;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function applyDraft(draft) {
    model = draft.model;
    if (!model.blocks) model.blocks = [];
    slugTouched = !!draft.slugTouched;
    cover.ext = draft.ext || 'jpg';
    renderAll();
  }

  function showRestoreBanner(draft) {
    var host = $('restore-banner');
    var bar = document.createElement('div');
    bar.className = 'banner';
    bar.style.margin = '20px 20px 0';
    var label = document.createElement('span');
    var who = (draft.model && draft.model.name) || 'Untitled';
    label.textContent = 'Unsaved draft found: “' + who + '”. The image file must be re-selected; its path is kept.';
    bar.appendChild(label);

    var restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'btn btn-sm';
    restore.textContent = 'Restore';
    restore.addEventListener('click', function () {
      applyDraft(draft);
      host.innerHTML = '';
      toast('Draft restored');
    });
    bar.appendChild(restore);

    var discard = document.createElement('button');
    discard.type = 'button';
    discard.className = 'btn btn-sm';
    discard.textContent = 'Discard';
    discard.addEventListener('click', function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
      host.innerHTML = '';
    });
    bar.appendChild(discard);

    host.appendChild(bar);
  }

  /* ------------------------------------------------------------------ image */

  /* The resize path re-encodes to JPEG, so the file that lands on disk is
     .jpg regardless of what was uploaded. The path baked into the post and the
     card snippets has to match, or every cover 404s. */
  function outputExt() {
    if (!cover.file) return cover.ext;
    return $('img-keep') && $('img-keep').checked ? cover.ext : 'jpg';
  }

  var EXT_BY_MIME = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
    'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif'
  };

  function onFilePicked(file) {
    if (!file) return;
    if (cover.blobUrl) URL.revokeObjectURL(cover.blobUrl);
    cover.file = file;
    cover.ext = EXT_BY_MIME[file.type] || (file.name.split('.').pop() || 'jpg').toLowerCase();
    cover.blobUrl = URL.createObjectURL(file);
    renderImagePanel();
    schedulePreview();
    renderSnippets();
  }

  /* Downscale to 1600px wide and re-encode — the existing Wix-era assets are
     far larger than the layout needs. The checkbox bypasses it for PNGs with
     transparency, which JPEG would flatten. */
  function downloadRenamedImage() {
    if (!cover.file) return;
    var m = resolved();
    var name = m.coverPath.split('/').pop();

    if ($('img-keep').checked) {
      downloadBlob(cover.file, name);   // name already carries the source ext
      return;
    }

    var img = new Image();
    img.onload = function () {
      var maxW = 1600;
      var scale = Math.min(1, maxW / img.naturalWidth);
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(function (blob) {
        if (!blob) { downloadBlob(cover.file, name); return; }
        downloadBlob(blob, name.replace(/\.[a-z0-9]+$/i, '.jpg'));
      }, 'image/jpeg', 0.82);
    };
    img.onerror = function () { downloadBlob(cover.file, name); };
    img.src = cover.blobUrl;
  }

  /* --------------------------------------------------------------- actions */

  function downloadHtml() {
    var m = resolved();
    if (!m.slug) { toast('Add a name first'); return; }
    var html = def.buildPage(m);
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), def.filename(m));
  }

  function exportJson() {
    var payload = JSON.stringify({ model: model, ext: cover.ext }, null, 2);
    var m = resolved();
    downloadBlob(
      new Blob([payload], { type: 'application/json' }),
      (m.slug || 'post') + '.json'
    );
  }

  function importJson(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(String(reader.result));
        applyDraft({ model: data.model || data, slugTouched: true, ext: data.ext });
        save();
        toast('Imported');
      } catch (e) {
        toast('Could not read that JSON');
      }
    };
    reader.readAsText(file);
  }

  function clearAll() {
    if (!confirm('Start a new post? The current draft will be discarded.')) return;
    if (cover.blobUrl) URL.revokeObjectURL(cover.blobUrl);
    cover = { file: null, blobUrl: null, ext: 'jpg' };
    model = emptyModel();
    slugTouched = false;
    $('img-file').value = '';
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    renderAll();
  }

  /* ------------------------------------------------------------------ init */

  function renderAll() {
    var coverInput = $('f-coverPath');
    if (coverInput) coverInput.value = model.coverPath || '';
    renderFields();
    renderBlocks();
    renderSnippets();
    renderImagePanel();
    renderPreview();
  }

  function init() {
    var select = $('type-select');
    Object.keys(TYPES).forEach(function (key) {
      var opt = document.createElement('option');
      opt.value = key;
      opt.textContent = TYPES[key].label;
      select.appendChild(opt);
    });
    select.value = typeKey;
    select.disabled = Object.keys(TYPES).length < 2;

    renderAddRow();
    renderAll();

    var draft = loadDraft();
    if (draft && draft.model) showRestoreBanner(draft);

    $('btn-download').addEventListener('click', downloadHtml);
    $('btn-export').addEventListener('click', exportJson);
    $('btn-clear').addEventListener('click', clearAll);
    $('btn-import').addEventListener('click', function () { $('import-file').click(); });
    $('import-file').addEventListener('change', function (e) {
      if (e.target.files[0]) importJson(e.target.files[0]);
      e.target.value = '';
    });
    $('img-file').addEventListener('change', function (e) { onFilePicked(e.target.files[0]); });
    $('btn-img-download').addEventListener('click', downloadRenamedImage);
    $('img-keep').addEventListener('change', function () {
      renderImagePanel();   // the target extension changes with this checkbox
      renderSnippets();
      schedulePreview();
    });
    $('f-coverPath').addEventListener('input', function (e) {
      model.coverPath = e.target.value;
      onChange();
    });
    $('btn-desktop').addEventListener('click', function () {
      $('preview').classList.remove('mobile');
      fitPreview();
    });
    $('btn-mobile').addEventListener('click', function () {
      $('preview').classList.add('mobile');
      fitPreview();
    });
    window.addEventListener('resize', fitPreview);
    fitPreview();
  }

  /* Scale the iframe down to fit the pane. The iframe keeps its real pixel
     width so the post's own media queries fire at the width being previewed;
     only the visual result is scaled. The stage element reserves the scaled
     footprint, since transforms don't affect layout. */
  function fitPreview() {
    var frame = $('preview');
    var stage = $('preview-stage');
    var wrap = frame.parentNode.parentNode;
    if (!frame || !stage || !wrap) return;

    var available = wrap.clientWidth - 32;   // .preview-wrap padding
    var natural = frame.classList.contains('mobile') ? 390 : 1240;
    var scale = Math.min(1, available / natural);

    frame.style.transform = 'scale(' + scale + ')';
    stage.style.width = Math.round(natural * scale) + 'px';
    stage.style.height = Math.round(frame.offsetHeight * scale) + 'px';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.WIF_EDITOR = {
    getModel: function () { return resolved(); },
    setModel: function (m) { applyDraft({ model: m, slugTouched: true }); },
    build: function () { return def.buildPage(resolved()); }
  };
})();
