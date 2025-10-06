(function () {
  if (window.createHypertextExperience) {
    return;
  }

  function buildPalette(doc) {
    const palette = doc.createElement('div');
    palette.className = 'hx-palette';
    palette.style.cssText = [
      'position:absolute',
      'display:none',
      'background:rgba(255,255,255,0.98)',
      'border:1px solid rgba(139,0,0,0.25)',
      'border-radius:8px',
      'box-shadow:0 8px 18px rgba(0,0,0,0.12)',
      'padding:12px 14px',
      'width:320px',
      'font-size:13px',
      'z-index:2147483000'
    ].join(';');

    palette.innerHTML = `
      <h3 style="margin:0 0 6px 0;font-size:14px;color:#8b0000;">Hypertext this selection</h3>
      <div class="hx-selected-text" style="font-size:12px;color:#333;margin-bottom:6px;"></div>
      <label for="hx-instruction-input" style="display:block;font-size:11px;text-transform:uppercase;color:#666;margin-top:6px;">Instructions (optional)</label>
      <input id="hx-instruction-input" type="text" placeholder="e.g. Explain in plain language"
        style="width:100%;padding:6px 8px;border:1px solid rgba(139,0,0,0.25);border-radius:4px;font-size:12px;margin-top:4px;" />
      <div class="hx-palette-actions" style="display:flex;gap:8px;margin-top:12px;">
        <button id="hx-generate-button" type="button"
          style="flex:1;padding:7px 0;border:0;border-radius:6px;font-size:12px;cursor:pointer;background:#8b0000;color:#fff;">Generate Hypertext</button>
        <button id="hx-toggle-truncation" type="button"
          style="flex:1;padding:7px 0;border:1px solid rgba(139,0,0,0.25);border-radius:6px;font-size:12px;cursor:pointer;background:#fff;color:#8b0000;">Enable truncation</button>
      </div>
    `;

    doc.body.appendChild(palette);
    return {
      palette,
      selectedTextEl: palette.querySelector('.hx-selected-text'),
      instructionInput: palette.querySelector('#hx-instruction-input'),
      generateButton: palette.querySelector('#hx-generate-button'),
      toggleButton: palette.querySelector('#hx-toggle-truncation')
    };
  }

  function createHypertextExperience(options) {
    const {
      backendUrl = 'http://localhost:3100',
      contextProvider
    } = options || {};

    const doc = document;
    const {
      palette,
      selectedTextEl,
      instructionInput,
      generateButton,
      toggleButton
    } = buildPalette(doc);

    let truncateContext = false;
    let activeSubject = '';

    function updateToggleLabel() {
      toggleButton.textContent = truncateContext ? 'Disable truncation' : 'Enable truncation';
      toggleButton.setAttribute('aria-pressed', truncateContext ? 'true' : 'false');
    }

    updateToggleLabel();

    toggleButton.addEventListener('click', () => {
      truncateContext = !truncateContext;
      updateToggleLabel();
    });

    function positionPalette(range) {
      if (!range) return;
      const rect = range.getBoundingClientRect();
      const top = rect.bottom + window.scrollY + 12;
      const left = Math.max(rect.left + window.scrollX - 12, 12);
      palette.style.top = `${top}px`;
      palette.style.left = `${left}px`;
    }

    function showPalette(text, range) {
      activeSubject = text;
      selectedTextEl.textContent = `“${text}”`;
      palette.style.display = 'block';
      positionPalette(range);
      instructionInput.focus();
    }

    async function sendToBackend(session, instructions) {
      const context = typeof contextProvider === 'function'
        ? contextProvider(session, { truncateContext })
        : '';

      const messages = [
        { role: 'user', content: context }
      ];

      try {
        const response = await fetch(`${backendUrl}/api/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages, options: { instructions } })
        });
        await response.text();
      } catch (error) {
        console.warn('[hypertext-demo] backend call failed', error);
      }

      return context;
    }

    generateButton.addEventListener('click', async () => {
      if (!activeSubject) return;
      const instructions = instructionInput.value.trim();
      const session = { subject: activeSubject };
      await sendToBackend(session, instructions);
    });

    function triggerFromExternal() {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;
      const text = (selection.toString() || '').trim();
      if (!text) return;
      const range = selection.getRangeAt(0).cloneRange();
      showPalette(text, range);
    }

    return {
      triggerFromExternal
    };
  }

  window.createHypertextExperience = createHypertextExperience;
})();
