(function () {
    const grid = document.getElementById('clockGrid');
    const themeToggle = document.getElementById('themeToggle');
    const addBtn = document.getElementById('addClockBtn');
    const modal = document.getElementById('tzModal');
    const modalBackdrop = document.getElementById('modalBackdrop');
    const tzZone = document.getElementById('tzZone');
    const tzLabel = document.getElementById('tzLabel');
    const confirmAdd = document.getElementById('confirmAdd');
    const cancelAdd = document.getElementById('cancelAdd');

    let clocks = [], idCounter = 0, raf = null, paused = false, editingId = null;

    function setTheme(t) {
        document.body.setAttribute('data-theme', t);
        themeToggle.textContent = t === 'dark' ? 'Light' : 'Dark';
    }
    themeToggle.onclick = () => setTheme(document.body.getAttribute('data-theme') === 'light' ? 'dark' : 'light');

    function makeSVG(id) {
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 200 200');
        svg.classList.add('clock');

        const outer = document.createElementNS(svgNS, 'circle');
        outer.setAttribute('cx', '100'); outer.setAttribute('cy', '100'); outer.setAttribute('r', '95');
        outer.setAttribute('fill', 'none'); outer.setAttribute('stroke', 'var(--muted)');
        svg.appendChild(outer);

        // tick marks
        for (let i = 0; i < 60; i++) {
            const angle = i * 6 * Math.PI / 180;
            const inner = i % 5 === 0 ? 78 : 86;
            const outerR = 92;
            const x1 = 100 + inner * Math.sin(angle), y1 = 100 - inner * Math.cos(angle);
            const x2 = 100 + outerR * Math.sin(angle), y2 = 100 - outerR * Math.cos(angle);
            const line = document.createElementNS(svgNS, 'line');
            line.setAttribute('x1', x1); line.setAttribute('y1', y1);
            line.setAttribute('x2', x2); line.setAttribute('y2', y2);
            line.setAttribute('stroke', i % 5 === 0 ? 'var(--text)' : 'var(--muted)');
            line.setAttribute('stroke-width', i % 5 === 0 ? '2' : '1');
            svg.appendChild(line);
        }

        // numbers
        for (let n = 1; n <= 12; n++) {
            const angle = (n / 12) * 2 * Math.PI;
            const x = 100 + Math.sin(angle) * 70;
            const y = 100 - Math.cos(angle) * 70 + 4;
            const t = document.createElementNS(svgNS, 'text');
            t.setAttribute('x', x); t.setAttribute('y', y);
            t.setAttribute('text-anchor', 'middle');
            t.setAttribute('font-size', '14');
            t.setAttribute('fill', 'var(--text)');
            t.textContent = n;
            svg.appendChild(t);
        }

        const hour = document.createElementNS(svgNS, 'line');
        hour.id = `hour-${id}`; hour.setAttribute('x1', '100'); hour.setAttribute('y1', '100'); hour.setAttribute('x2', '100'); hour.setAttribute('y2', '64');
        hour.setAttribute('stroke', 'var(--text)'); hour.setAttribute('stroke-width', '6'); hour.setAttribute('stroke-linecap', 'round');
        svg.appendChild(hour);

        const minute = document.createElementNS(svgNS, 'line');
        minute.id = `minute-${id}`; minute.setAttribute('x1', '100'); minute.setAttribute('y1', '100'); minute.setAttribute('x2', '100'); minute.setAttribute('y2', '48');
        minute.setAttribute('stroke', 'var(--accent-minute)'); minute.setAttribute('stroke-width', '4'); minute.setAttribute('stroke-linecap', 'round');
        svg.appendChild(minute);

        const second = document.createElementNS(svgNS, 'line');
        second.id = `second-${id}`; second.setAttribute('x1', '100'); second.setAttribute('y1', '100'); second.setAttribute('x2', '100'); second.setAttribute('y2', '40');
        second.setAttribute('stroke', 'var(--accent-second)'); second.setAttribute('stroke-width', '2'); second.setAttribute('stroke-linecap', 'round');
        svg.appendChild(second);

        const pin = document.createElementNS(svgNS, 'circle');
        pin.setAttribute('cx', '100'); pin.setAttribute('cy', '100'); pin.setAttribute('r', '3'); pin.setAttribute('fill', 'var(--text)');
        svg.appendChild(pin);

        return svg;
    }

    function createClockCard(id, tz, label, removable) {
        const card = document.createElement('div');
        card.className = 'clock-card'; card.id = id; card.dataset.tz = tz;
        const head = document.createElement('div'); head.className = 'card-head';
        const left = document.createElement('div');
        left.innerHTML = `<div class="tz-label">${label}</div><div class="tz-sub">${tz === 'local' ? Intl.DateTimeFormat().resolvedOptions().timeZone : tz}</div>`;
        head.appendChild(left);
        card.appendChild(head);
        const wrap = document.createElement('div'); wrap.className = 'clock-svg-wrap';
        wrap.appendChild(makeSVG(id)); card.appendChild(wrap);
        const digital = document.createElement('div'); digital.className = 'digital'; digital.id = `digital-${id}`;
        card.appendChild(digital);
        grid.appendChild(card);
        clocks.push({ id, tz, label, removable });
    }

    function applyLayout() {
        const count = clocks.length;
        grid.className = '';
        if (count === 0) grid.classList.add('layout-1');
        else if (count === 1) grid.classList.add('layout-1');
        else if (count === 2) grid.classList.add('layout-2');
        else if (count === 3) grid.classList.add('layout-3');
        else if (count === 4) grid.classList.add('layout-4');
        else grid.classList.add('layout-gt4');
        const cards = Array.from(grid.children);
        cards.forEach(card => card.classList.remove('card-area-a', 'card-area-b', 'card-area-c'));
        const isMobile = window.matchMedia('(max-width:640px)').matches;
        if (!isMobile && count === 3) {
            cards.forEach((card, i) => { if (i === 0) card.classList.add('card-area-a'); if (i === 1) card.classList.add('card-area-b'); if (i === 2) card.classList.add('card-area-c'); });
        }
    }

    function getTimeForTZ(tz) {
        if (tz === 'local') return new Date();
        try { return new Date(new Date().toLocaleString('en-US', { timeZone: tz })); } catch (e) { return new Date(); }
    }

    function updateAll() {
        if (paused) return;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        clocks.forEach(c => {
            const dt = getTimeForTZ(c.tz);
            const ms = dt.getMilliseconds();
            const s = dt.getSeconds() + (reduced ? 0 : ms / 1000);
            const m = dt.getMinutes() + s / 60;
            const h = (dt.getHours() % 12) + m / 60;
            const hourAngle = h * 30, minuteAngle = m * 6, secondAngle = s * 6;
            document.getElementById(`hour-${c.id}`).setAttribute('transform', `rotate(${hourAngle} 100 100)`);
            document.getElementById(`minute-${c.id}`).setAttribute('transform', `rotate(${minuteAngle} 100 100)`);
            document.getElementById(`second-${c.id}`).setAttribute('transform', `rotate(${secondAngle} 100 100)`);
            document.getElementById(`digital-${c.id}`).textContent = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        });
        if (!reduced) raf = requestAnimationFrame(updateAll); else setTimeout(updateAll, 1000);
    }

    function openAddModal() {
        tzZone.value = 'local';
        tzLabel.value = `Clock-${Math.floor(Math.random() * 900 + 100)}`;
        editingId = null;
        modal.classList.remove('hidden');
    }
    function closeModal() { modal.classList.add('hidden'); editingId = null; }

    addBtn.onclick = openAddModal;
    cancelAdd.onclick = closeModal;
    modalBackdrop.onclick = (e) => { if (e.target === modalBackdrop) closeModal(); };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

    confirmAdd.onclick = () => {
        const tz = (tzZone.value || 'local').trim();
        const label = (tzLabel.value || tz).trim();
        if (editingId) {
            const c = clocks.find(x => x.id === editingId);
            if (c) { c.tz = tz; c.label = label; }
        } else {
            const removable = clocks.length >= 1;
            const id = `c${++idCounter}`;
            createClockCard(id, tz, label, removable);
        }
        applyLayout();
        closeModal();
    };

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            paused = true;
            if (raf) cancelAnimationFrame(raf);
        } else {
            paused = false;
            updateAll();
        }
    });

    function initDefaults() {
        if (clocks.length === 0) {
            const id = `c${++idCounter}`;
            createClockCard(id, 'local', 'Local Time', false);
            applyLayout();
        } else {
            applyLayout();
        }
        updateAll();
    }

    initDefaults();
})();