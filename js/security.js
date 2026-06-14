(function () {
  'use strict';

  const ALLOWED_TAGS = new Set([
    'B', 'BLOCKQUOTE', 'BR', 'DIV', 'EM', 'H1', 'H2', 'H3', 'H4',
    'I', 'IMG', 'LI', 'OL', 'P', 'SPAN', 'STRONG', 'TABLE', 'TBODY',
    'TD', 'TH', 'THEAD', 'TR', 'U', 'UL'
  ]);
  const ALLOWED_STYLE = new Set([
    'border', 'border-collapse', 'border-radius', 'display', 'font-style',
    'font-weight', 'margin', 'margin-bottom', 'margin-top', 'max-height',
    'max-width', 'object-fit', 'padding', 'text-align', 'width'
  ]);

  function escapeHTML(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeImageUrl(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(raw) && raw.length <= 2_800_000) {
      return raw;
    }
    try {
      const url = new URL(raw, window.location.href);
      if (url.protocol === 'https:') return url.href;
      if (url.protocol === 'http:' && url.origin === window.location.origin) return url.href;
      if (url.protocol === 'file:' && window.location.protocol === 'file:') return url.href;
      return '';
    } catch {
      return '';
    }
  }

  function cleanStyle(element, styleText) {
    const probe = document.createElement('span');
    probe.setAttribute('style', styleText || '');
    const safe = [];
    for (const name of Array.from(probe.style)) {
      if (!ALLOWED_STYLE.has(name)) continue;
      const value = probe.style.getPropertyValue(name);
      if (/url\s*\(|expression\s*\(|javascript:/i.test(value)) continue;
      safe.push(`${name}:${value}`);
    }
    if (safe.length) element.setAttribute('style', safe.join(';'));
  }

  function sanitizeHTML(html) {
    const doc = new DOMParser().parseFromString(`<body>${String(html ?? '')}</body>`, 'text/html');
    const nodes = Array.from(doc.body.querySelectorAll('*'));

    nodes.forEach((node) => {
      if (!ALLOWED_TAGS.has(node.tagName)) {
        node.replaceWith(...Array.from(node.childNodes));
        return;
      }

      const attributes = Array.from(node.attributes);
      attributes.forEach((attr) => node.removeAttribute(attr.name));

      if (node.tagName === 'IMG') {
        const src = safeImageUrl(attributes.find((attr) => attr.name.toLowerCase() === 'src')?.value);
        if (!src) {
          node.remove();
          return;
        }
        node.setAttribute('src', src);
        const alt = attributes.find((attr) => attr.name.toLowerCase() === 'alt')?.value;
        if (alt) node.setAttribute('alt', alt.slice(0, 160));
        node.setAttribute('loading', 'lazy');
      }

      if (node.tagName === 'TD' || node.tagName === 'TH') {
        ['colspan', 'rowspan'].forEach((name) => {
          const value = attributes.find((attr) => attr.name.toLowerCase() === name)?.value;
          if (/^[1-9]\d?$/.test(value || '')) node.setAttribute(name, value);
        });
      }

      const style = attributes.find((attr) => attr.name.toLowerCase() === 'style')?.value;
      if (style) cleanStyle(node, style);
    });

    return doc.body.innerHTML;
  }

  async function validateImageFile(file) {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    if (!(file instanceof File)) throw new Error('Файл таңдалмады');
    if (!allowed.has(file.type)) throw new Error('Тек JPG, PNG, WEBP немесе GIF суреттерін жүктеуге болады');
    if (file.size > 5 * 1024 * 1024) throw new Error('Сурет көлемі 5 МБ-тан аспауы керек');
    const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isGif = bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38;
    const isWebp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    if (!isJpeg && !isPng && !isGif && !isWebp) throw new Error('Файл мазмұны сурет форматына сәйкес емес');
    if ('createImageBitmap' in window) {
      const bitmap = await createImageBitmap(file);
      const tooLarge = bitmap.width > 6000 || bitmap.height > 6000 || bitmap.width * bitmap.height > 24000000;
      bitmap.close();
      if (tooLarge) throw new Error('Сурет өлшемі тым үлкен');
    }
    return true;
  }

  function normalizeClassName(value) {
    const cls = String(value ?? '').trim();
    return /^[0-9]{1,2}[A-Za-zА-Яа-яӘәҒғҚқҢңӨөҰұҮүІіЁё-]{0,3}$/.test(cls) ? cls : '';
  }

  window.escapeHTML = escapeHTML;
  window.escH = escapeHTML;
  window.sanitizeHTML = sanitizeHTML;
  window.safeImageUrl = safeImageUrl;
  window.validateImageFile = validateImageFile;
  window.normalizeClassName = normalizeClassName;
})();
