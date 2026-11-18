/* Sitio demo de Motomontaña. Sin dependencias y sin servicios de terceros. */
(function () {
    "use strict";
    document.documentElement.classList.add("js");

    const digits = (value) => {
        const text = String(value || "").trim();
        const decimal = text.match(/^(\d+)\.(\d{1,2})$/);
        if (decimal) { return parseInt(decimal[1], 10) || 0; }
        return parseInt(text.replace(/\D/g, ""), 10) || 0;
    };

    // Menú del celular
    const menuButton = document.querySelector("[data-menu]");
    const mobileNav = document.getElementById("mm-mnav");
    if (menuButton && mobileNav) {
        menuButton.addEventListener("click", () => {
            const open = mobileNav.hidden;
            mobileNav.hidden = !open;
            menuButton.setAttribute("aria-expanded", String(open));
        });
    }

    // Filtros del catálogo: aplican al cambiar
    document.querySelectorAll("form[data-autosubmit] select").forEach((select) => {
        select.addEventListener("change", () => select.form.requestSubmit());
    });

    // Carrusel de la ficha
    document.querySelectorAll("[data-carousel]").forEach((carousel) => {
        const track = carousel.querySelector("[data-track]");
        const thumbs = Array.from(carousel.querySelectorAll("[data-go]"));
        const slides = track.children.length;
        const current = () => Math.round(track.scrollLeft / track.clientWidth);
        const go = (index) => {
            const target = (index + slides) % slides;
            track.scrollTo({ left: target * track.clientWidth, behavior: "smooth" });
        };
        const mark = () => {
            const index = current();
            thumbs.forEach((thumb, i) => thumb.setAttribute("aria-current", i === index ? "true" : "false"));
        };
        carousel.querySelector("[data-prev]")?.addEventListener("click", () => go(current() - 1));
        carousel.querySelector("[data-next]")?.addEventListener("click", () => go(current() + 1));
        thumbs.forEach((thumb) => thumb.addEventListener("click", () => go(digits(thumb.dataset.go))));
        track.addEventListener("scroll", () => window.requestAnimationFrame(mark), { passive: true });
        track.addEventListener("keydown", (event) => {
            if (event.key === "ArrowRight") { event.preventDefault(); go(current() + 1); }
            if (event.key === "ArrowLeft") { event.preventDefault(); go(current() - 1); }
        });
    });

    // Simulador conservado. No se muestra: PUBLIC_FINANCING está en falso
    // (controllers/main.py). No volver a enlazar /financiacion sin confirmación escrita.
    // El servidor calcula con la usura vigente y no devuelve la tasa.
    const sim = document.querySelector("form[data-sim]");
    if (sim) {
        let quoteTimer = null;
        const update = () => {
            const price = digits(sim.elements.precio.value);
            const minPct = Number(sim.dataset.minPct) || 50;
            const minimum = Math.ceil((price * minPct) / 100);
            let down = digits(sim.elements.inicial.value);
            if (down < minimum) { down = minimum; }
            if (down > price) { down = price; }
            if (digits(sim.elements.inicial.value) !== down) {
                sim.elements.inicial.value = down ? down.toLocaleString("es-CO").replace(/,/g, ".") : "";
            }
            const months = digits((sim.querySelector("input[name=plazo]:checked") || {}).value) || 12;
            document.querySelector("[data-sim-months]").textContent = months;
            const copies = { precio: price, inicial: down, plazo: months };
            document.querySelectorAll("[data-sim-copy]").forEach((input) => {
                input.value = copies[input.dataset.simCopy];
            });
            window.clearTimeout(quoteTimer);
            quoteTimer = window.setTimeout(async () => {
                try {
                    const response = await fetch("/financiacion/cuota", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { precio: price, inicial: down, plazo: months, placa: sim.elements.placa.value }, id: Date.now() }),
                    });
                    const data = await response.json();
                    const result = data.result;
                    if (!result || !result.months) { return; }
                    document.querySelector("[data-sim-ok]").hidden = !result.quotable;
                    document.querySelector("[data-sim-cap]").hidden = result.quotable;
                    const wa = document.querySelector(".mm-js-sim-wa");
                    if (wa && result.whatsapp) { wa.href = result.whatsapp[String(months)] || wa.href; }
                    document.querySelector("[data-sim-value]").textContent = result.months[String(months)];
                    document.querySelector("[data-sim-principal]").textContent = result.principal;
                    document.querySelectorAll("[data-sim-term]").forEach((cell) => {
                        cell.textContent = result.months[String(digits(cell.dataset.simTerm))] || "";
                    });
                } catch (error) { /* se conserva la cuota que trajo la página */ }
            }, 250);
        };
        sim.querySelectorAll("[data-money]").forEach((input) => {
            input.value = digits(input.value).toLocaleString("es-CO").replace(/,/g, ".");
            input.addEventListener("input", () => {
                const value = digits(input.value);
                input.value = value ? value.toLocaleString("es-CO").replace(/,/g, ".") : "";
                update();
            });
        });
        sim.addEventListener("change", update);
        sim.addEventListener("submit", (event) => { event.preventDefault(); update(); });
        update();
    }

    // Chat del asistente
    const chat = document.getElementById("mm-chat");
    if (!chat) { return; }
    const fab = document.querySelector("[data-chat-open]");
    const log = chat.querySelector("[data-chat-log]");
    const consentForm = chat.querySelector("[data-chat-consent]");
    const form = chat.querySelector("[data-chat-form]");
    const input = form.querySelector("input[name=message]");
    const modeLabel = chat.querySelector("[data-chat-mode]");
    const KEY = "mmDemoChat";
    let token = window.localStorage.getItem(KEY) || "";
    let lastId = 0;
    let poll = null;
    let busy = false;

    const rpc = async (url, params) => {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", method: "call", params, id: Date.now() }),
        });
        const data = await response.json();
        if (data.error) { throw new Error(data.error.data?.message || "Error"); }
        return data.result;
    };
    const bubble = (author, text) => {
        const item = document.createElement("div");
        item.className = "mm-msg mm-msg--" + author;
        item.textContent = text;
        log.appendChild(item);
        log.scrollTop = log.scrollHeight;
        return item;
    };
    const render = (result) => {
        if (!result) { return; }
        if (result.token) {
            token = result.token;
            window.localStorage.setItem(KEY, token);
            consentForm.hidden = true;
        }
        (result.messages || []).forEach((message) => {
            if (message.id <= lastId) { return; }
            lastId = message.id;
            if (message.author === "customer" && log.querySelector("[data-pending]")) {
                log.querySelector("[data-pending]").remove();
            }
            bubble(message.author, message.body);
        });
        modeLabel.textContent = result.mode === "advisor"
            ? "Un asesor sigue la conversación. Le responde por aquí."
            : "Responde al instante. Un asesor entra cuando hace falta.";
        chat.dataset.mode = result.mode || "";
    };
    const refresh = async () => {
        if (!token || chat.hidden) { return; }
        try {
            render(await rpc("/asistente/estado", { token, after_id: lastId }));
        } catch (error) { /* la demo sigue sin conexión */ }
    };
    const open = (prefill) => {
        chat.hidden = false;
        fab.setAttribute("aria-expanded", "true");
        if (token) {
            consentForm.hidden = true;
            log.querySelector("[data-chat-consent-text]")?.remove();
            refresh();
        }
        if (!poll) { poll = window.setInterval(refresh, 4000); }
        if (prefill) { input.value = prefill; }
        input.focus();
    };
    const close = () => {
        chat.hidden = true;
        fab.setAttribute("aria-expanded", "false");
        window.clearInterval(poll);
        poll = null;
        fab.focus();
    };
    fab.addEventListener("click", () => open());
    chat.querySelector("[data-chat-close]").addEventListener("click", close);
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !chat.hidden) { close(); } });
    document.querySelectorAll("[data-chat-prefill]").forEach((button) => {
        button.addEventListener("click", () => open(button.dataset.chatPrefill));
    });
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const text = input.value.trim();
        if (!text || busy) { return; }
        const consent = consentForm.elements.consent;
        if (!token && !consent.checked) {
            consent.focus();
            consentForm.querySelector(".mm-check").classList.add("is-error");
            return;
        }
        busy = true;
        input.value = "";
        const pending = bubble("customer", text);
        pending.dataset.pending = "1";
        const typing = bubble("typing", "Escribiendo…");
        try {
            const result = await rpc("/asistente/mensaje", {
                token: token || null,
                message: text,
                consent: !token && consent.checked,
                name: consentForm.elements.name.value,
                phone: consentForm.elements.phone.value,
                page: window.location.pathname,
                after_id: lastId,
            });
            typing.remove();
            if (!token) { log.querySelector("[data-chat-consent-text]")?.remove(); }
            render(result);
        } catch (error) {
            typing.remove();
            bubble("system", "En esta copia estática el chat no responde. Use el botón de WhatsApp.");
        } finally {
            busy = false;
            input.focus();
        }
    });
})();


/* Copia estática: los filtros y los formularios no llaman a Odoo. */
(function () {
    "use strict";
    const form = document.querySelector("form.mm-filters");
    if (form) {
        const cards = Array.from(document.querySelectorAll(".mm-moto"));
        const count = document.querySelector("[data-results]");
        const apply = () => {
            const marca = form.marca.value;
            const sede = form.sede.value;
            const tipo = form.tipo.value;
            const precio = form.precio.value;
            let visible = 0;
            cards.forEach((card) => {
                const amount = Number(card.dataset.precio || 0);
                const priceOk = !precio || (
                    (precio === "hasta-6" && amount < 6000000) ||
                    (precio === "6-9" && amount >= 6000000 && amount < 9000000) ||
                    (precio === "mas-9" && amount >= 9000000)
                );
                const ok = (!marca || card.dataset.marca === marca) &&
                    (!sede || card.dataset.sede === sede) &&
                    (!tipo || card.dataset.tipo === tipo) && priceOk;
                card.hidden = !ok;
                if (ok) { visible += 1; }
            });
            if (count) { count.textContent = visible + (visible === 1 ? " moto" : " motos"); }
        };
        const params = new URLSearchParams(window.location.search);
        ["marca", "sede", "tipo", "precio"].forEach((name) => {
            if (params.get(name) && form.elements[name]) { form.elements[name].value = params.get(name); }
        });
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            const next = new URLSearchParams();
            ["marca", "sede", "tipo", "precio"].forEach((name) => {
                if (form.elements[name].value) { next.set(name, form.elements[name].value); }
            });
            const query = next.toString();
            history.replaceState(null, "", query ? "?" + query : location.pathname);
            apply();
        });
        apply();
    }
    document.querySelectorAll('form[method="post"]').forEach((lead) => {
        lead.addEventListener("submit", (event) => {
            event.preventDefault();
            let note = lead.querySelector("[data-static-note]");
            if (!note) {
                note = document.createElement("p");
                note.dataset.staticNote = "1";
                note.className = "mm-pequeno";
                lead.appendChild(note);
            }
            note.textContent = "Esta copia estática no guarda el formulario. En la demo de Odoo sí queda registrado. Puede escribir por WhatsApp.";
        });
    });
})();
